import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from src.api.models import ChannelMetricsItem, ChannelMetricsResponse, MetricsResponse
from src.config import settings
from src.storage.postgres import PostgresClient, get_postgres_client
from src.storage.redis_client import get_redis

router = APIRouter(prefix="/metrics", tags=["bandit"])

_CACHE_TTL = 30  # seconds


async def _cache_get(key: str) -> Any | None:
    try:
        raw = await get_redis().get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def _cache_set(key: str, value: Any, ttl: int = _CACHE_TTL) -> None:
    try:
        await get_redis().set(key, json.dumps(value), ex=ttl)
    except Exception:
        pass


@router.get("/all")
async def get_all_metrics(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> list[MetricsResponse]:
    """Return metrics for every policy in one DB round-trip, cached 30 s."""
    cached = await _cache_get("metrics:all")
    if cached is not None:
        return cached

    rows = await pg.get_all_policy_metrics()
    result = [
        MetricsResponse(
            policy=r["policy_name"],
            total_decisions=r["total_decisions"],
            cumulative_reward=r["cumulative_reward"],
            avg_reward=r["avg_reward"],
            exploration_rate=r["exploration_rate"],
        )
        for r in rows
    ]
    await _cache_set("metrics:all", [m.model_dump() for m in result])
    return result


@router.get("/", response_model=MetricsResponse)
async def get_metrics(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
    policy: str | None = None,
) -> MetricsResponse:
    policy_name = policy or settings.active_policy
    cache_key = f"metrics:{policy_name}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return MetricsResponse(**cached)

    data = await pg.get_policy_metrics(policy_name)
    result = MetricsResponse(
        policy=policy_name,
        total_decisions=data.get("total_decisions", 0),
        cumulative_reward=data.get("cumulative_reward", 0.0),
        avg_reward=data.get("avg_reward", 0.0),
        exploration_rate=data.get("exploration_rate", 0.0),
    )
    await _cache_set(cache_key, result.model_dump())
    return result


@router.get("/channels", response_model=ChannelMetricsResponse)
async def get_channel_metrics(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> ChannelMetricsResponse:
    cached = await _cache_get("metrics:channels")
    if cached is not None:
        return ChannelMetricsResponse(items=[ChannelMetricsItem(**r) for r in cached])

    rows = await pg.get_channel_metrics()
    result = ChannelMetricsResponse(items=[ChannelMetricsItem(**r) for r in rows])
    await _cache_set("metrics:channels", [i.model_dump() for i in result.items])
    return result
