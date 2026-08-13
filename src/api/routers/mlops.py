from __future__ import annotations

import json
import logging
from typing import Any

import mlflow
from fastapi import APIRouter, Query

from src.api.models import MlopsRun, MlopsRunsResponse
from src.config import settings
from src.storage.redis_client import get_redis

router = APIRouter(prefix="/mlops", tags=["mlops"])
logger = logging.getLogger(__name__)

_CACHE_TTL = 60  # MLflow calls are slow — cache for 60 s


async def _cache_get(key: str) -> Any | None:
    try:
        raw = await get_redis().get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def _cache_set(key: str, value: Any) -> None:
    try:
        await get_redis().set(key, json.dumps(value), ex=_CACHE_TTL)
    except Exception:
        pass


@router.get("/runs/", response_model=MlopsRunsResponse)
async def get_mlops_runs(
    policy: str = Query(default="contextual_thompson"),
    limit: int = Query(default=50, ge=1, le=200),
) -> MlopsRunsResponse:
    cache_key = f"mlops:runs:{policy}:{limit}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return MlopsRunsResponse(policy=cached["policy"], runs=[MlopsRun(**r) for r in cached["runs"]])

    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    try:
        exp = mlflow.get_experiment_by_name(settings.mlflow_experiment)
        if not exp:
            return MlopsRunsResponse(policy=policy, runs=[])

        # Use the persistent online-training run (step-based metric history)
        online_runs = mlflow.search_runs(
            experiment_ids=[exp.experiment_id],
            filter_string=(
                f"params.policy = '{policy}' and tags.run_type = 'online_training'"
            ),
            max_results=1,
            output_format="list",
        )

        if online_runs:
            run = online_runs[0]
            client = mlflow.MlflowClient()
            cum_history = client.get_metric_history(run.info.run_id, "cumulative_reward")
            expl_by_step = {
                m.step: m.value
                for m in client.get_metric_history(run.info.run_id, "exploration_rate")
            }
            reward_by_step = {
                m.step: m.value
                for m in client.get_metric_history(run.info.run_id, "reward")
            }
            sorted_hist = sorted(cum_history, key=lambda m: m.step)[-limit:]
            items = [
                MlopsRun(
                    run_id=f"{run.info.run_id}-s{m.step}",
                    arm=run.data.tags.get("last_arm", ""),
                    reward=reward_by_step.get(m.step, 0.0),
                    cumulative_reward=m.value,
                    exploration_rate=expl_by_step.get(m.step, 0.0),
                    total_decisions=m.step,
                    created_at=str(m.timestamp),
                )
                for m in sorted_hist
            ]
            result = MlopsRunsResponse(policy=policy, runs=items)
            await _cache_set(cache_key, {"policy": policy, "runs": [r.model_dump() for r in items]})
            return result

        # Fallback: individual reward runs sorted oldest → newest
        runs = mlflow.search_runs(
            experiment_ids=[exp.experiment_id],
            filter_string=f"params.policy = '{policy}'",
            max_results=limit,
            output_format="list",
        )
        runs_sorted = sorted(runs, key=lambda r: r.info.start_time)
        items = [
            MlopsRun(
                run_id=r.info.run_id,
                arm=r.data.params.get("arm", ""),
                reward=float(r.data.metrics.get("reward", 0.0)),
                cumulative_reward=float(r.data.metrics.get("cumulative_reward", 0.0)),
                exploration_rate=float(r.data.metrics.get("exploration_rate", 0.0)),
                total_decisions=int(r.data.metrics.get("total_decisions", 0)),
                created_at=str(r.info.start_time),
            )
            for r in runs_sorted
        ]
    except Exception as exc:
        logger.warning("mlops_runs_error policy=%s: %s", policy, exc)
        items = []

    result = MlopsRunsResponse(policy=policy, runs=items)
    await _cache_set(cache_key, {"policy": policy, "runs": [r.model_dump() for r in items]})
    return result
