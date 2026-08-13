"""RAG pipeline: Azure AI Search semantic retrieval → context assembly.

Exposes a singleton RAGPipeline initialized at API startup (src/api/main.py).
Retrieval is separated from generation: the pipeline returns context strings
that each router handler assembles before calling llm.chat().

Metadata filter strategy per mode:
  explain    — doc_type=policy  AND arm=<arm_selected>           (top_k=1)
  experiment — doc_type=experiment AND experiment_id=<id>        (top_k=1)
               + doc_type=policy for each arm in experiment      (top_k=1 each)
  advise     — doc_type=policy                                   (top_k=3)
  evaluate   — same as experiment
  general    — no filter                                         (top_k=4)
  summarize  — no filter on policy docs (MLflow handled in router)
  compare    — doc_type=policy                                   (top_k=5)
  negotiate  — doc_type=policy  AND arm=<offer>                  (top_k=1)
"""
from __future__ import annotations

import asyncio
from typing import Any

import structlog
from llama_index.core import VectorStoreIndex
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.core.vector_stores.types import (
    FilterCondition,
    FilterOperator,
    MetadataFilter,
    MetadataFilters,
)

from src.assistant.indexer import DocumentIndexer
from src.config import settings as app_settings

logger = structlog.get_logger()

# ── Module-level singletons ────────────────────────────────────────────────────

_pipeline: "RAGPipeline | None" = None
_rag_available: bool = False


def get_rag_pipeline() -> "RAGPipeline":
    if _pipeline is None:
        raise RuntimeError("RAG pipeline not initialized — call initialize_rag() first")
    return _pipeline


def is_rag_available() -> bool:
    return _rag_available


def get_indexer() -> DocumentIndexer:
    if _pipeline is None:
        raise RuntimeError("RAG pipeline not initialized")
    return _pipeline.indexer


async def initialize_rag(retries: int = 6, delay: float = 5.0) -> None:
    """Build embed model + indexer + pipeline; called once during lifespan startup.

    Retries up to `retries` times with `delay` seconds between attempts so the
    API can start before Qdrant/Ollama are fully ready (distroless images have
    no healthcheck mechanism in Docker Compose). Falls back to keyword-based
    retrieval (rag.py) on failure so the assistant remains available.
    """
    global _pipeline, _rag_available

    for attempt in range(1, retries + 1):
        try:
            if app_settings.use_azure_openai:
                from llama_index.embeddings.azure_openai import AzureOpenAIEmbedding

                embed_model = AzureOpenAIEmbedding(
                    model=app_settings.azure_embed_deployment,
                    azure_endpoint=app_settings.azure_openai_endpoint,
                    api_key=app_settings.azure_openai_key,
                    api_version="2024-05-01-preview",
                    embed_batch_size=10,
                    max_retries=0,
                    timeout=8.0,
                )
            else:
                from llama_index.embeddings.openai import OpenAIEmbedding

                embed_model = OpenAIEmbedding(
                    model_name=app_settings.embed_model,
                    api_base=app_settings.embed_base_url,
                    api_key=app_settings.embed_api_key,
                    embed_batch_size=10,
                    max_retries=0,
                    timeout=8.0,
                )

            indexer = DocumentIndexer(embed_model=embed_model)
            await indexer.initialize()

            _pipeline = RAGPipeline(indexer=indexer, embed_model=embed_model)
            _rag_available = True
            backend = "azure_search" if app_settings.use_azure_search else "qdrant"
            logger.info("rag_pipeline_ready", backend=backend)
            return

        except Exception as exc:
            if attempt < retries:
                logger.warning(
                    "rag_pipeline_init_attempt_failed_retrying",
                    attempt=attempt,
                    retries=retries,
                    error=str(exc),
                )
                await asyncio.sleep(delay)
            else:
                logger.warning(
                    "rag_pipeline_init_failed_falling_back_to_keyword",
                    error=str(exc),
                )
                _rag_available = False


# ── RAGPipeline class ──────────────────────────────────────────────────────────


class RAGPipeline:
    """Semantic retrieval against Qdrant via LlamaIndex VectorIndexRetriever."""

    def __init__(self, indexer: DocumentIndexer, embed_model: Any) -> None:
        self.indexer = indexer
        self._embed_model = embed_model

    @property
    def _index(self) -> VectorStoreIndex:
        return self.indexer.get_index()

    # ── Core retrieve ──────────────────────────────────────────────────────────

    async def retrieve(
        self,
        query: str,
        top_k: int = 4,
        filters: MetadataFilters | None = None,
    ) -> str:
        """Retrieve top-k nodes and return their text joined by separator."""
        retriever = VectorIndexRetriever(
            index=self._index,
            similarity_top_k=top_k,
            filters=filters,
            embed_model=self._embed_model,
        )
        nodes = await asyncio.to_thread(retriever.retrieve, query)
        if not nodes:
            return "Nenhum documento relevante encontrado na base de conhecimento."
        return "\n\n---\n\n".join(n.get_content(metadata_mode="none") for n in nodes)

    # ── Mode-specific retrieval helpers ────────────────────────────────────────

    async def retrieve_policy_for_arm(self, arm: str) -> str:
        """Single policy doc for a specific arm (exact match)."""
        filters = MetadataFilters(
            filters=[
                MetadataFilter(key="doc_type", value="policy", operator=FilterOperator.EQ),
                MetadataFilter(key="arm", value=arm, operator=FilterOperator.EQ),
            ],
            condition=FilterCondition.AND,
        )
        return await self.retrieve(arm, top_k=1, filters=filters)

    async def retrieve_policies_for_arms(self, arms: list[str], query: str) -> str:
        """Retrieve policy docs for a list of arm names in parallel."""
        if not arms:
            return await self.retrieve(query, top_k=3, filters=_policy_only())
        chunks = await asyncio.gather(*[self.retrieve_policy_for_arm(a) for a in arms])
        return "\n\n---\n\n".join(c for c in chunks if c)

    async def retrieve_experiment_doc(self, experiment_id: str, query: str) -> str:
        """Retrieve the previously indexed experiment summary document."""
        filters = MetadataFilters(
            filters=[
                MetadataFilter(key="doc_type", value="experiment", operator=FilterOperator.EQ),
                MetadataFilter(key="experiment_id", value=experiment_id, operator=FilterOperator.EQ),
            ],
            condition=FilterCondition.AND,
        )
        return await self.retrieve(query, top_k=1, filters=filters)

    async def retrieve_for_advice(self, query: str) -> str:
        """Top-3 policy docs ranked by semantic similarity to the advice query."""
        return await self.retrieve(query, top_k=3, filters=_policy_only())

    async def retrieve_general(self, query: str) -> str:
        """Broad retrieval across all doc types for general/compare queries."""
        return await self.retrieve(query, top_k=4)


# ── Filter factories ───────────────────────────────────────────────────────────


def _policy_only() -> MetadataFilters:
    return MetadataFilters(
        filters=[MetadataFilter(key="doc_type", value="policy", operator=FilterOperator.EQ)]
    )
