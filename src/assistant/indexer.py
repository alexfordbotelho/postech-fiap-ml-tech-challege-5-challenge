"""Document indexer: loads policy docs + experiment summaries → embeds → stores in vector DB.

Backend selected by config:
  - Local (default): Qdrant  (qdrant_host / qdrant_port / qdrant_collection)
  - Azure:           Azure AI Search  (azure_search_endpoint / azure_search_key / azure_search_index)

EMBED_DIM is backend-dependent:
  - Local:  768  (nomic-embed-text via LM Studio / Ollama)
  - Azure: 1536  (text-embedding-3-small via Azure OpenAI)

Document metadata schema (stored as vector store payload):
  doc_type : "policy" | "experiment"
  arm      : arm name, e.g. "savings_account"   (policy docs only)
  experiment_id : UUID string                    (experiment docs only)
  source   : origin path or table name
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import structlog
from llama_index.core import Document, StorageContext, VectorStoreIndex

from src.config import settings as app_settings

logger = structlog.get_logger()

POLICY_DOCS_DIR = Path(__file__).parent.parent.parent / "datasets" / "policy_docs"

# Dimension depends on embedding model
EMBED_DIM_LOCAL = 768   # nomic-embed-text
EMBED_DIM_AZURE = 1536  # text-embedding-3-small


# ── Document builders ──────────────────────────────────────────────────────────


def _build_policy_documents() -> list[Document]:
    docs: list[Document] = []
    for path in sorted(POLICY_DOCS_DIR.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        docs.append(
            Document(
                text=content,
                metadata={
                    "doc_type": "policy",
                    "arm": path.stem,
                    "source": f"policy_docs/{path.name}",
                },
                excluded_llm_metadata_keys=["doc_type", "source"],
                excluded_embed_metadata_keys=["doc_type", "source"],
            )
        )
    return docs


def _build_experiment_document(
    experiment: dict[str, Any],
    decisions: list[dict[str, Any]],
) -> Document:
    arms: list[str] = experiment.get("experiment_arms") or []
    lines = [
        f"# Experimento: {experiment.get('name', 'N/A')}",
        f"ID: {experiment.get('id', '')}",
        f"Status: {experiment.get('status', '')}",
        f"Descrição: {experiment.get('description', '')}",
        f"Hipótese: {experiment.get('hypothesis', '')}",
        f"Política: {experiment.get('experiment_policy', '')}",
        f"Braços: {', '.join(arms)}",
        "",
        "## Resultados por braço",
    ]
    for d in decisions:
        n = int(d.get("n", 0))
        rewarded = int(d.get("rewarded", 0))
        avg = float(d.get("avg_reward", 0))
        rate = round(rewarded / max(n, 1) * 100, 1)
        lines.append(
            f"- {d.get('variation_id', '?')}: {n} decisões, "
            f"{rewarded} conversões ({rate}%), recompensa média {avg:.4f}"
        )

    return Document(
        text="\n".join(lines),
        metadata={
            "doc_type": "experiment",
            "experiment_id": str(experiment.get("id", "")),
            "experiment_name": experiment.get("name", ""),
            "source": "postgres/bandit_experiments",
        },
        excluded_llm_metadata_keys=["doc_type", "source"],
        excluded_embed_metadata_keys=["doc_type", "source"],
    )


# ── Vector store factory ───────────────────────────────────────────────────────


def _make_qdrant_vector_store():  # type: ignore[return]
    from llama_index.vector_stores.qdrant import QdrantVectorStore
    from qdrant_client import QdrantClient

    client = QdrantClient(
        host=app_settings.qdrant_host,
        port=app_settings.qdrant_port,
        check_compatibility=False,
    )
    return client, QdrantVectorStore(
        client=client, collection_name=app_settings.qdrant_collection
    )


def _make_azure_search_vector_store():  # type: ignore[return]
    from azure.core.credentials import AzureKeyCredential
    from azure.search.documents.indexes import SearchIndexClient
    from llama_index.vector_stores.azureaisearch import AzureAISearchVectorStore, IndexManagement

    credential = AzureKeyCredential(app_settings.azure_search_key)
    index_client = SearchIndexClient(
        endpoint=app_settings.azure_search_endpoint, credential=credential
    )
    return index_client, AzureAISearchVectorStore(
        search_or_index_client=index_client,
        index_name=app_settings.azure_search_index,
        index_management=IndexManagement.CREATE_IF_NOT_EXISTS,
        id_field_key="id",
        chunk_field_key="content",
        embedding_field_key="embedding",
        metadata_string_field_key="metadata",
        doc_id_field_key="doc_id",
    )


# ── Indexer class ──────────────────────────────────────────────────────────────


class DocumentIndexer:
    """Manages vector store collection/index and LlamaIndex VectorStoreIndex.

    Automatically selects Qdrant (local) or Azure AI Search (Azure) based on config.
    """

    def __init__(self, embed_model: Any) -> None:
        self._embed_model = embed_model
        self._index: VectorStoreIndex | None = None

        if app_settings.use_azure_search:
            self._client, self._vector_store = _make_azure_search_vector_store()
            self._backend = "azure_search"
        else:
            self._client, self._vector_store = _make_qdrant_vector_store()
            self._backend = "qdrant"

    # ── Internal helpers (sync, run via asyncio.to_thread) ────────────────────

    def _ensure_collection(self) -> None:
        if self._backend != "qdrant":
            return  # Azure AI Search manages the index via IndexManagement
        from qdrant_client.models import Distance, VectorParams

        existing = {c.name for c in self._client.get_collections().collections}
        if app_settings.qdrant_collection not in existing:
            self._client.create_collection(
                collection_name=app_settings.qdrant_collection,
                vectors_config=VectorParams(size=EMBED_DIM_LOCAL, distance=Distance.COSINE),
            )
            logger.info("qdrant_collection_created", name=app_settings.qdrant_collection)

    def _count_docs(self) -> int:
        if self._backend == "qdrant":
            return self._client.count(app_settings.qdrant_collection, exact=True).count
        # Azure AI Search
        try:
            stats = self._client.get_index_statistics(app_settings.azure_search_index)
            return int(getattr(stats, "document_count", 0))
        except Exception:
            return 0

    def _build_index_from_docs(self, docs: list[Document]) -> VectorStoreIndex:
        storage_context = StorageContext.from_defaults(vector_store=self._vector_store)
        return VectorStoreIndex.from_documents(
            docs,
            storage_context=storage_context,
            embed_model=self._embed_model,
            show_progress=False,
        )

    def _load_existing_index(self) -> VectorStoreIndex:
        return VectorStoreIndex.from_vector_store(
            self._vector_store,
            embed_model=self._embed_model,
        )

    def _insert_doc(self, doc: Document) -> None:
        if self._index is None:
            return
        self._index.insert(doc)

    # ── Public API (async) ─────────────────────────────────────────────────────

    def get_index(self) -> VectorStoreIndex:
        if self._index is None:
            raise RuntimeError("DocumentIndexer not initialized — call initialize() first")
        return self._index

    async def initialize(self) -> None:
        """Create collection if needed, then load or build the VectorStoreIndex."""
        await asyncio.to_thread(self._ensure_collection)
        count = await asyncio.to_thread(self._count_docs)

        if count == 0:
            logger.info("vector_store_empty_indexing_policy_docs", backend=self._backend)
            docs = await asyncio.to_thread(_build_policy_documents)
            self._index = await asyncio.to_thread(self._build_index_from_docs, docs)
            logger.info("vector_store_policy_docs_indexed", count=len(docs), backend=self._backend)
        else:
            logger.info("vector_store_loading_existing_index", doc_count=count, backend=self._backend)
            self._index = await asyncio.to_thread(self._load_existing_index)

    async def index_experiment(
        self,
        experiment: dict[str, Any],
        decisions: list[dict[str, Any]],
    ) -> None:
        """Embed and upsert a single experiment document."""
        doc = _build_experiment_document(experiment, decisions)
        await asyncio.to_thread(self._insert_doc, doc)
        logger.info("experiment_indexed", experiment_id=experiment.get("id"))
