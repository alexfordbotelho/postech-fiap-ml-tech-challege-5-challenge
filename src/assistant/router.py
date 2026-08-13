"""POST /assistant/ask — LLM analytical assistant for experiment auditing.

Retrieval strategy:
  - When Qdrant is available: semantic search via RAGPipeline (LlamaIndex + nomic-embed-text)
  - Fallback: keyword scoring (src/assistant/rag.py) when RAG is not yet initialized

Modes:
  explain     — why a specific decision was made (requires decision_id)
  experiment  — end-to-end explanation of an experiment (requires experiment_id)
  advise      — personalized financial advice from client_features (with disclaimer)
  evaluate    — structured evaluation report for an experiment (requires experiment_id)
  summarize   — MLflow run summary for a policy
  compare     — performance comparison of all policies
  negotiate   — offer argumentation for client objections
  general     — catch-all with semantic policy retrieval
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Annotated, Any
from uuid import UUID

import mlflow
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.assistant.guardrail import guardrail_rejection_message, is_financial_question
from src.assistant.llm import chat
from src.assistant.negotiation import is_objection, negotiate
from src.assistant.pipeline import is_rag_available, get_rag_pipeline, get_indexer
from src.assistant.prompts import (
    SYSTEM_COMPARE,
    SYSTEM_EXPLAIN,
    SYSTEM_EXPERIMENT,
    SYSTEM_ADVISE,
    SYSTEM_EVALUATE,
    SYSTEM_FINANCIAL_GENERAL,
    SYSTEM_SUMMARIZE,
    build_advice_prompt,
    build_compare_prompt,
    build_evaluate_prompt,
    build_experiment_prompt,
    build_explain_prompt,
    build_full_context_prompt,
    build_summarize_prompt,
)
from src.assistant.rag import get_policy_docs_for_arms, rank_policy_docs
from src.assistant.retriever import (
    format_advice_context,
    format_comparison,
    format_experiment_context,
    format_decision_context,
    format_mlflow_summary,
    get_all_policy_docs,
    get_policy_doc,
)
from src.config import settings, ARM_DISPLAY_NAMES
from src.data.segmentation import classify_segment
from src.storage.postgres import PostgresClient, get_postgres_client

logger = structlog.get_logger()
router = APIRouter(prefix="/assistant", tags=["assistant"])

# Pre-compile replacement patterns: matches arm names with optional backtick wrapping,
# e.g. `term_deposit_6m`, term_deposit_6m, **term_deposit_6m** — sorted longest-first
# to avoid partial matches (term_deposit_12m before term_deposit_1).
_ARM_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"`?" + re.escape(arm) + r"`?", re.IGNORECASE),
        display,
    )
    for arm, display in sorted(ARM_DISPLAY_NAMES.items(), key=lambda kv: -len(kv[0]))
]


def _humanize(text: str) -> str:
    """Replace technical arm identifiers with their friendly display names."""
    for pattern, display in _ARM_PATTERNS:
        text = pattern.sub(display, text)
    return text

_VALID_MODES = frozenset({
    "explain", "summarize", "compare", "negotiate",
    "general", "policy",
    "experiment", "advise", "evaluate",
})


class AskRequest(BaseModel):
    mode: str = "general"
    question: str
    session_id: str | None = None
    decision_id: UUID | None = None
    experiment_id: str | None = None
    policy: str | None = None
    offer: str | None = None
    objection: str | None = None
    client_features: dict[str, Any] | None = None


class AskResponse(BaseModel):
    mode: str
    answer: str
    guardrail_passed: bool = True
    trace_id: str | None = None


class FeedbackRequest(BaseModel):
    trace_id: str
    score: int   # 1 = positivo, -1 = negativo
    comment: str = ""


@router.post("/ask", response_model=AskResponse)
async def ask(
    req: AskRequest,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> AskResponse:
    if req.mode not in _VALID_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown mode {req.mode!r}. Valid: {', '.join(sorted(_VALID_MODES))}",
        )

    if not is_financial_question(req.question):
        logger.info("assistant_guardrail_blocked", question=req.question[:80])
        return AskResponse(
            mode=req.mode,
            answer=guardrail_rejection_message(),
            guardrail_passed=False,
        )

    effective_mode = req.mode
    if effective_mode == "general" and is_objection(req.question):
        effective_mode = "negotiate"

    match effective_mode:
        case "explain":
            answer, trace_id = await _handle_explain(req, pg)
        case "experiment":
            answer, trace_id = await _handle_experiment(req, pg)
        case "advise":
            answer, trace_id = await _handle_advise(req, pg)
        case "evaluate":
            answer, trace_id = await _handle_evaluate(req, pg)
        case "summarize":
            answer, trace_id = await _handle_summarize(req)
        case "compare":
            answer, trace_id = await _handle_compare(req, pg)
        case "negotiate":
            answer, trace_id = await _handle_negotiate(req)
        case _:
            answer, trace_id = await _handle_general(req, pg)

    answer = _humanize(answer)
    logger.info("assistant_response", mode=effective_mode, answer_len=len(answer))
    return AskResponse(mode=effective_mode, answer=answer, trace_id=trace_id)


@router.post("/feedback", status_code=204)
async def feedback(req: FeedbackRequest) -> None:
    """Submit user feedback (👍/👎) for an assistant response to Langfuse Scores API."""
    if not settings.langfuse_enabled:
        return

    import httpx
    payload: dict = {
        "traceId": req.trace_id,
        "name": "user-feedback",
        "value": float(req.score),
        "dataType": "NUMERIC",
    }
    if req.comment:
        payload["comment"] = req.comment

    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.post(
                f"{settings.langfuse_host}/api/public/scores",
                auth=(settings.langfuse_public_key, settings.langfuse_secret_key),
                json=payload,
            )
            resp.raise_for_status()
        logger.info("feedback_submitted", trace_id=req.trace_id, score=req.score)
    except Exception as exc:
        logger.warning("feedback_submit_failed", trace_id=req.trace_id, error=str(exc))


# ── Mode handlers ──────────────────────────────────────────────────────────────


async def _handle_explain(req: AskRequest, pg: PostgresClient) -> tuple[str, str | None]:
    if not req.decision_id:
        raise HTTPException(status_code=400, detail="explain mode requires decision_id")

    decision = await pg.get_decision(req.decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="decision_id not found")

    arm: str = decision["arm_selected"]
    features = decision["context_features"]
    segment = classify_segment(features)

    # Semantic retrieval for the arm's policy doc
    state, policy_doc = await asyncio.gather(
        pg.get_bandit_state(decision["policy_name"]),
        _retrieve_policy_for_arm(arm),
    )

    context_block = format_decision_context(decision, state or {}, segment)
    context_block += f"\n\n## Política do produto recomendado ({arm})\n\n{policy_doc}"
    return await chat(SYSTEM_EXPLAIN, build_explain_prompt(context_block, req.question), session_id=req.session_id)


async def _handle_experiment(req: AskRequest, pg: PostgresClient) -> tuple[str, str | None]:
    if not req.experiment_id:
        raise HTTPException(status_code=400, detail="experiment mode requires experiment_id")

    experiment = await pg.get_experiment(req.experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail="experiment not found")

    arms: list[str] = experiment.get("experiment_arms") or []
    policy = experiment.get("experiment_policy") or settings.active_policy

    decisions, mlflow_summary, policy_docs = await asyncio.gather(
        pg.get_experiment_decisions(req.experiment_id),
        asyncio.to_thread(_sync_fetch_mlflow_summary, policy),
        _retrieve_policies_for_arms(arms, req.question),
    )

    # Index this experiment's results into Qdrant for future evaluate queries
    asyncio.ensure_future(_index_experiment_safe(experiment, decisions))

    context_block = format_experiment_context(experiment, decisions, mlflow_summary, policy_docs)
    return await chat(SYSTEM_EXPERIMENT, build_experiment_prompt(context_block, req.question), session_id=req.session_id)


async def _handle_advise(req: AskRequest, pg: PostgresClient) -> tuple[str, str | None]:
    features: dict[str, Any] = req.client_features or {}
    segment = classify_segment(features) if features else "default"
    rag_query = req.question + " " + json.dumps(features, ensure_ascii=False)

    bandit_state, policy_docs = await asyncio.gather(
        pg.get_bandit_state(settings.active_policy),
        _retrieve_policies_for_advice(rag_query),
    )

    context_block = format_advice_context(features, segment, bandit_state or {}, policy_docs)
    return await chat(SYSTEM_ADVISE, build_advice_prompt(context_block, req.question), session_id=req.session_id)


async def _handle_evaluate(req: AskRequest, pg: PostgresClient) -> tuple[str, str | None]:
    if not req.experiment_id:
        raise HTTPException(status_code=400, detail="evaluate mode requires experiment_id")

    experiment = await pg.get_experiment(req.experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail="experiment not found")

    arms: list[str] = experiment.get("experiment_arms") or []
    policy = experiment.get("experiment_policy") or settings.active_policy

    # Try indexed experiment doc first (faster), then fall back to per-arm policies
    decisions, mlflow_summary, rag_context = await asyncio.gather(
        pg.get_experiment_decisions(req.experiment_id),
        asyncio.to_thread(_sync_fetch_mlflow_summary, policy),
        _retrieve_for_evaluate(req.experiment_id, arms, req.question),
    )

    context_block = format_experiment_context(experiment, decisions, mlflow_summary, rag_context)
    return await chat(SYSTEM_EVALUATE, build_evaluate_prompt(context_block, req.question), session_id=req.session_id)


async def _handle_general(req: AskRequest, pg: PostgresClient) -> tuple[str, str | None]:
    policy_docs, metrics_rows, mlflow_summary = await asyncio.gather(
        _retrieve_general(req.question),
        pg.get_policy_comparison(),
        asyncio.to_thread(_sync_fetch_mlflow_summary, settings.active_policy),
    )

    comparison_text = format_comparison(metrics_rows) if metrics_rows else "Sem dados de comparação."
    user_message = build_full_context_prompt(policy_docs, comparison_text, mlflow_summary, req.question)
    return await chat(SYSTEM_FINANCIAL_GENERAL, user_message, session_id=req.session_id)


async def _handle_summarize(req: AskRequest) -> tuple[str, str | None]:
    policy = req.policy or settings.active_policy
    runs_data = await asyncio.to_thread(_sync_fetch_runs, policy)
    runs_block = format_mlflow_summary(runs_data, policy)
    return await chat(SYSTEM_SUMMARIZE, build_summarize_prompt(runs_block, req.question), session_id=req.session_id)


async def _handle_compare(req: AskRequest, pg: PostgresClient) -> tuple[str, str | None]:
    rows = await pg.get_policy_comparison()
    if not rows:
        raise HTTPException(status_code=404, detail="No decision data found for comparison")
    comparison_block = format_comparison(rows)
    return await chat(SYSTEM_COMPARE, build_compare_prompt(comparison_block, req.question), session_id=req.session_id)


async def _handle_negotiate(req: AskRequest) -> tuple[str, str | None]:
    offer = req.offer or "produto financeiro"
    objection = req.objection or req.question
    features: dict[str, Any] = req.client_features or {}
    segment = classify_segment(features) if features else "desconhecido"
    policy_doc = await _retrieve_policy_for_arm(offer)
    return await negotiate(
        offer=offer,
        objection=objection,
        client_features=features,
        policy_doc=policy_doc,
        segment=segment,
        session_id=req.session_id,
    )


# ── RAG retrieval helpers ──────────────────────────────────────────────────────
# Each function uses the semantic RAG pipeline when available,
# falling back to the keyword-based retriever from rag.py.


async def _retrieve_policy_for_arm(arm: str) -> str:
    if is_rag_available():
        return await get_rag_pipeline().retrieve_policy_for_arm(arm)
    return await asyncio.to_thread(get_policy_doc, arm)


async def _retrieve_policies_for_arms(arms: list[str], query: str) -> str:
    if is_rag_available():
        return await get_rag_pipeline().retrieve_policies_for_arms(arms, query)
    if arms:
        return await asyncio.to_thread(get_policy_docs_for_arms, arms)
    return await asyncio.to_thread(rank_policy_docs, query, 3)


async def _retrieve_policies_for_advice(query: str) -> str:
    if is_rag_available():
        return await get_rag_pipeline().retrieve_for_advice(query)
    return await asyncio.to_thread(rank_policy_docs, query, 3)


async def _retrieve_general(query: str) -> str:
    if is_rag_available():
        return await get_rag_pipeline().retrieve_general(query)
    return await asyncio.to_thread(rank_policy_docs, query, 3)


async def _retrieve_for_evaluate(experiment_id: str, arms: list[str], query: str) -> str:
    if is_rag_available():
        rag = get_rag_pipeline()
        exp_doc, policy_docs = await asyncio.gather(
            rag.retrieve_experiment_doc(experiment_id, query),
            rag.retrieve_policies_for_arms(arms, query),
        )
        combined = "\n\n---\n\n".join(p for p in [exp_doc, policy_docs] if p)
        return combined or "Nenhum documento relevante encontrado."
    if arms:
        return await asyncio.to_thread(get_policy_docs_for_arms, arms)
    return await asyncio.to_thread(get_all_policy_docs)


async def _index_experiment_safe(
    experiment: dict[str, Any],
    decisions: list[dict[str, Any]],
) -> None:
    """Index experiment results into Qdrant in the background (best-effort)."""
    try:
        if is_rag_available():
            await get_indexer().index_experiment(experiment, decisions)
    except Exception as exc:
        logger.warning("experiment_index_failed", error=str(exc))


# ── MLflow helpers (sync, wrapped via asyncio.to_thread) ─────────────────────


def _sync_fetch_runs(policy: str, max_results: int = 20) -> list[dict]:
    try:
        experiment = mlflow.get_experiment_by_name(settings.mlflow_experiment)
        if not experiment:
            return []
        runs = mlflow.search_runs(
            experiment_ids=[experiment.experiment_id],
            filter_string=f"params.policy = '{policy}'",
            max_results=max_results,
            output_format="list",
        )
        return [
            {
                "info": {"run_id": r.info.run_id},
                "data": {
                    "metrics": [{"key": k, "value": v} for k, v in r.data.metrics.items()]
                },
            }
            for r in runs
        ]
    except Exception as exc:
        logger.warning("mlflow_fetch_failed", error=str(exc))
        return []


def _sync_fetch_mlflow_summary(policy: str) -> str:
    return format_mlflow_summary(_sync_fetch_runs(policy, max_results=10), policy)
