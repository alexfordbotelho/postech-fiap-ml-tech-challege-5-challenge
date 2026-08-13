from fastapi import APIRouter

from src.api.models import HealthResponse
from src.storage.postgres import get_pool
from src.storage.redis_client import get_redis

router = APIRouter(tags=["ops"])


@router.get("/healthz", response_model=HealthResponse)
async def health() -> HealthResponse:
    services: dict[str, str] = {}

    try:
        pool = get_pool()
        await pool.fetchval("SELECT 1")
        services["postgres"] = "ok"
    except Exception as exc:
        services["postgres"] = f"error: {exc}"

    try:
        r = get_redis()
        await r.ping()
        services["redis"] = "ok"
    except Exception as exc:
        services["redis"] = f"error: {exc}"

    overall = "ok" if all(v == "ok" for v in services.values()) else "degraded"
    return HealthResponse(status=overall, services=services)
