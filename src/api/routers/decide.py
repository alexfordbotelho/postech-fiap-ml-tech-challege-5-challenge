import asyncio
import random
import time
from dataclasses import replace
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends
from opentelemetry import trace

from src.api.models import ARMS_CATALOG, DecideRequest, DecideResponse
from src.config import settings
from src.data.segmentation import classify_segment
from src.logging.audit import AuditLogger, get_audit_logger
from src.policies.base import DecisionContext
from src.policies.suitability import filter_arms
from src.services.flag_engine import evaluate_flag
from src.storage.postgres import PostgresClient, get_postgres_client
from src.storage.redis_client import RedisStateClient, get_redis_client
from src.api.routers.ws import connection_manager

router = APIRouter(prefix="/decide", tags=["bandit"])
tracer = trace.get_tracer(__name__)

# ── Feature flag cache ─────────────────────────────────────────────────────────

_flag_cache: dict = {}
_flag_cache_ts: float = 0.0
_FLAG_TTL = 60.0

async def _get_flags(pg: PostgresClient) -> dict:
    global _flag_cache, _flag_cache_ts
    if time.time() - _flag_cache_ts > _FLAG_TTL:
        rows = await pg.list_flags()
        _flag_cache = {r["flag_key"]: r for r in rows}
        _flag_cache_ts = time.time()
    return _flag_cache


# ── Active experiment cache ────────────────────────────────────────────────────

_exp_cache: list = []
_exp_cache_ts: float = 0.0
_EXP_TTL = 30.0

async def _get_active_experiments(pg: PostgresClient) -> list:
    global _exp_cache, _exp_cache_ts
    if time.time() - _exp_cache_ts > _EXP_TTL:
        _exp_cache = await pg.get_running_experiments()
        _exp_cache_ts = time.time()
    return _exp_cache


_ALL_CHANNELS = frozenset(["web", "mobile", "email", "call_center"])


def _match_experiment(experiments: list, segment: str, channel: str) -> dict | None:
    """Return the best-matching running experiment for this segment+channel.

    Specificity score (0–2) per dimension:
      - segment: 1 if the experiment has a non-empty segment filter, else 0
      - channel: 1 if the experiment has a channel filter that is a STRICT subset
                 of all channels (e.g. ["email","web"]), else 0.
                 Listing *all* channels is semantically equivalent to no filter.

    When multiple experiments tie on score, one is chosen at random so that
    catch-all experiments share traffic instead of the first-registered always
    winning.
    """
    candidates: list[dict] = []
    best_score = -1
    for exp in experiments:
        seg_filter = exp.get("targeting_segments") or []
        ch_filter  = exp.get("targeting_channels")  or []
        if seg_filter and segment not in seg_filter:
            continue
        if ch_filter and channel not in ch_filter:
            continue
        # Listing every possible channel = catch-all → same score as no filter
        ch_specific = bool(ch_filter) and not set(ch_filter) >= _ALL_CHANNELS
        score = (1 if seg_filter else 0) + (1 if ch_specific else 0)
        if score > best_score:
            best_score = score
            candidates = [exp]
        elif score == best_score:
            candidates.append(exp)
    return random.choice(candidates) if candidates else None


def _apply_min_exploration(decision, arms: list[str]) -> object:
    if decision.is_exploration:
        return decision
    if random.random() < settings.min_exploration_rate:
        forced_arm = random.choice(arms)
        return replace(decision, arm_id=forced_arm, is_exploration=True, confidence=0.0)
    return decision


@router.post("/", response_model=DecideResponse)
async def decide(
    req: DecideRequest,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)],
    redis: Annotated[RedisStateClient, Depends(get_redis_client)],
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> DecideResponse:
    from src.policies.registry import build_policy

    with tracer.start_as_current_span("bandit.decide") as span:
        segment = classify_segment(req.features)
        flag_ctx = {"segment": segment, "channel": req.channel}

        # ── Feature flags ──────────────────────────────────────────────────────
        flags = await _get_flags(pg)
        if "active_policy" in flags:
            policy_name = evaluate_flag(flags["active_policy"], flag_ctx) or req.policy
        else:
            policy_name = req.policy

        if "bandit_arms_enabled" in flags:
            arms_from_flag = evaluate_flag(flags["bandit_arms_enabled"], flag_ctx)
            raw_arms = arms_from_flag if isinstance(arms_from_flag, list) else (req.arms or ARMS_CATALOG)
        else:
            raw_arms = req.arms or ARMS_CATALOG

        # ── Active experiment matching ─────────────────────────────────────────
        active_experiments = await _get_active_experiments(pg)
        matched_exp = _match_experiment(active_experiments, segment, req.channel)
        bandit_experiment_id: str | None = None

        if matched_exp:
            bandit_experiment_id = matched_exp["id"]
            # Override policy and arms from experiment definition
            if matched_exp.get("experiment_policy"):
                policy_name = matched_exp["experiment_policy"]
            exp_arms = matched_exp.get("experiment_arms") or []
            if exp_arms:
                raw_arms = exp_arms

        span.set_attribute("bandit.policy", policy_name)
        span.set_attribute("bandit.session_id", str(req.session_id))
        span.set_attribute("bandit.channel", req.channel)
        span.set_attribute("bandit.segment", segment)
        if bandit_experiment_id:
            span.set_attribute("bandit.experiment_id", bandit_experiment_id)

        policy = build_policy(policy_name)
        state = await redis.get_state(policy_name)
        if state:
            policy.load_state(state)

        arms = filter_arms(raw_arms, req.features)

        context = DecisionContext(session_id=str(req.session_id), features=req.features)
        decision = policy.select_arm(context, arms)
        decision = _apply_min_exploration(decision, arms)
        decision_id = uuid4()

        span.set_attribute("bandit.arm_selected", decision.arm_id)
        span.set_attribute("bandit.is_exploration", decision.is_exploration)
        span.set_attribute("bandit.confidence", decision.confidence)

        # Evaluate each flag in the current context so the snapshot reflects
        # the actual value served (rule-matched), not just the default value.
        flag_snapshot = {
            key: evaluate_flag(row, flag_ctx)
            for key, row in flags.items()
            if row.get("enabled")
        }

        await audit.log_decision(
            decision_id=decision_id,
            context=context,
            decision=decision,
            channel=req.channel,
            bandit_experiment_id=bandit_experiment_id,
            flag_snapshot=flag_snapshot,
        )

        asyncio.create_task(connection_manager.broadcast("decision_created", {
            "decision_id": str(decision_id),
            "arm_selected": decision.arm_id,
            "policy_name": decision.policy_name,
            "segment": decision.segment,
            "channel": req.channel,
            "is_exploration": decision.is_exploration,
        }))

    return DecideResponse(
        decision_id=decision_id,
        offer_id=decision.arm_id,
        policy=decision.policy_name,
        confidence=decision.confidence,
        is_exploration=decision.is_exploration,
        segment=decision.segment,
    )
