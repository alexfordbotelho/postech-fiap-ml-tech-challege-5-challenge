"""MLflow integration: persistent per-policy runs with step metrics + auto-retraining."""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

import mlflow

from src.config import settings

if TYPE_CHECKING:
    from src.storage.postgres import PostgresClient
    from src.storage.redis_client import RedisStateClient

logger = logging.getLogger(__name__)

RETRAIN_EVERY = 50  # trigger offline retrain every N reward updates per policy

# Only one offline retrain at a time. Under high load multiple rewards can fire
# concurrently; queuing them all would spike memory. Skip instead.
_RETRAIN_LOCK = asyncio.Semaphore(1)


def setup_mlflow() -> None:
    # Only set the URI (no network call); experiment is created lazily on first use.
    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)


def _get_online_run_id(policy_name: str) -> str | None:
    """Return the run_id of the active online-training run for this policy, or None."""
    try:
        exp = mlflow.get_experiment_by_name(settings.mlflow_experiment)
        if exp is None:
            return None
        runs = mlflow.search_runs(
            experiment_ids=[exp.experiment_id],
            filter_string=f"params.policy = '{policy_name}' and tags.run_type = 'online_training'",
            max_results=1,
            output_format="pandas",
        )
        if not runs.empty:
            return str(runs.iloc[0]["run_id"])
    except Exception as exc:
        logger.warning("mlflow_search_failed: %s", exc)
    return None


def _ensure_online_run(policy_name: str) -> str:
    """Get existing online-training run or create one. Returns run_id."""
    mlflow.set_experiment(settings.mlflow_experiment)
    run_id = _get_online_run_id(policy_name)
    if run_id:
        return run_id
    with mlflow.start_run(run_name=f"{policy_name}-online") as run:
        mlflow.log_params({"policy": policy_name})
        mlflow.set_tag("run_type", "online_training")
        return run.info.run_id


def log_reward_update(
    policy_name: str,
    arm_id: str,
    reward: float,
    cumulative_reward: float,
    total_decisions: int,
    exploration_rate: float,
) -> None:
    """Log a reward update as a step in the persistent online-training run for this policy."""
    try:
        run_id = _ensure_online_run(policy_name)
        with mlflow.start_run(run_id=run_id):
            mlflow.log_metrics(
                {
                    "reward": reward,
                    "cumulative_reward": cumulative_reward,
                    "exploration_rate": exploration_rate,
                    "regret_proxy": 1.0 - (cumulative_reward / max(total_decisions, 1)),
                },
                step=total_decisions,
            )
            mlflow.set_tag("last_arm", arm_id)
    except Exception as exc:
        logger.warning("mlflow_log_reward_failed policy=%s: %s", policy_name, exc)


def log_offline_evaluation(
    policy_name: str,
    cumulative_reward: float,
    regret: float,
    exploration_rate: float,
    total_cases: int,
    run_type: str = "offline_retrain",
    run_name_prefix: str = "retrain",
) -> None:
    try:
        mlflow.set_experiment(settings.mlflow_experiment)
        with mlflow.start_run(run_name=f"{run_name_prefix}-{policy_name}"):
            mlflow.log_params({"policy": policy_name, "total_cases": total_cases})
            mlflow.set_tag("run_type", run_type)
            mlflow.log_metrics(
                {
                    "cumulative_reward": cumulative_reward,
                    "regret": regret,
                    "exploration_rate": exploration_rate,
                    "avg_reward": cumulative_reward / max(total_cases, 1),
                }
            )
    except Exception as exc:
        logger.warning("mlflow_log_eval_failed policy=%s: %s", policy_name, exc)


async def run_offline_retrain(
    policy_name: str,
    pg: "PostgresClient",
    redis: "RedisStateClient",
) -> dict:
    """
    Rebuild bandit priors from scratch by replaying the most recent rewarded decisions.
    Skips if another retrain is already in flight to avoid queueing concurrent memory spikes.
    """
    from src.data.segmentation import classify_segment
    from src.policies.registry import build_policy

    if _RETRAIN_LOCK.locked():
        logger.info("retrain_skipped policy=%s already_in_progress", policy_name)
        return {}

    async with _RETRAIN_LOCK:
        decisions = await pg.get_rewarded_decisions(policy_name)
        if not decisions:
            logger.info("retrain_skipped policy=%s no_rewarded_decisions", policy_name)
            return {}

        policy = build_policy(policy_name)
        for d in decisions:
            segment = classify_segment(d["context_features"])
            policy.update(d["arm_selected"], d["reward"], segment=segment)

        new_state = policy.get_state()
        await pg.upsert_bandit_state(policy_name, new_state)
        await redis.set_state(policy_name, new_state)

        metrics = await pg.get_policy_metrics(policy_name)

        await asyncio.to_thread(
            log_offline_evaluation,
            policy_name=policy_name,
            cumulative_reward=metrics.get("cumulative_reward", 0.0),
            regret=0.0,
            exploration_rate=metrics.get("exploration_rate", 0.0),
            total_cases=len(decisions),
        )

        logger.info(
            "retrain_complete policy=%s decisions=%d cumulative_reward=%.2f",
            policy_name,
            len(decisions),
            metrics.get("cumulative_reward", 0.0),
        )
        return metrics
