import asyncio
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from opentelemetry import trace

from src.api.models import RewardRequest, RewardResponse
from src.api.routers.ws import connection_manager
from src.data.segmentation import classify_segment
from src.policies.registry import build_policy
from src.storage.mlflow_client import RETRAIN_EVERY, log_reward_update, run_offline_retrain
from src.storage.postgres import PostgresClient, get_postgres_client
from src.storage.redis_client import RedisStateClient, get_redis_client

router = APIRouter(prefix="/reward", tags=["bandit"])
tracer = trace.get_tracer(__name__)


@router.post("/", response_model=RewardResponse)
async def reward(
    req: RewardRequest,
    background_tasks: BackgroundTasks,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
    redis: Annotated[RedisStateClient, Depends(get_redis_client)],
) -> RewardResponse:
    with tracer.start_as_current_span("bandit.reward") as span:
        span.set_attribute("bandit.decision_id", str(req.decision_id))
        span.set_attribute("bandit.reward", req.reward)

        decision_data = await pg.update_reward(req.decision_id, req.reward)
        if decision_data is None:
            raise HTTPException(status_code=404, detail="decision_id not found")

        arm_selected = decision_data["arm_selected"]
        features = decision_data["context_features"]
        segment = classify_segment(features)
        policy_name = decision_data["policy_name"]

        span.set_attribute("bandit.arm_selected", arm_selected)
        span.set_attribute("bandit.segment", segment)
        span.set_attribute("bandit.policy", policy_name)

        policy = build_policy(policy_name)
        state = await redis.get_state(policy_name)
        if state:
            policy.load_state(state)

        policy.update(arm_selected, req.reward, segment=segment)
        new_state = policy.get_state()

        await pg.upsert_bandit_state(policy_name, new_state)
        await redis.set_state(policy_name, new_state)

        metrics = await pg.get_policy_metrics(policy_name)
        total_decisions = metrics.get("total_decisions", 0)

        # Log to MLflow only every RETRAIN_EVERY decisions to avoid hammering the server.
        # Offline retrain (triggered below) already logs a full summary on those same steps.
        if total_decisions % RETRAIN_EVERY == 0:
            asyncio.create_task(asyncio.to_thread(
                log_reward_update,
                policy_name=policy_name,
                arm_id=arm_selected,
                reward=req.reward,
                cumulative_reward=metrics.get("cumulative_reward", 0.0),
                total_decisions=total_decisions,
                exploration_rate=metrics.get("exploration_rate", 0.0),
            ))
            background_tasks.add_task(run_offline_retrain, policy_name, pg, redis)

        asyncio.create_task(connection_manager.broadcast("reward_received", {
            "decision_id": str(req.decision_id),
            "reward": req.reward,
        }))

    return RewardResponse(status="ok", updated_arm=arm_selected, policy=policy_name)
