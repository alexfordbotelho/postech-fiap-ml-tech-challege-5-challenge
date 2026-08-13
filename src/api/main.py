import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from src.config import settings
from src.assistant.pipeline import initialize_rag
from src.assistant.tracing import setup_langfuse
from src.logging.audit import close_producer, create_producer
from src.logging.telemetry import setup_telemetry
from src.storage.mlflow_client import setup_mlflow
from src.storage.postgres import close_pool, create_pool
from src.storage.redis_client import close_redis, create_redis

setup_telemetry(settings.hyperdx_otlp_endpoint)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    structlog.configure(
        processors=[structlog.processors.JSONRenderer()],
        wrapper_class=structlog.make_filtering_bound_logger(
            {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40}.get(
                settings.log_level, 20
            )
        ),
    )

    await create_pool()
    await create_redis()
    try:
        await create_producer()
    except Exception as exc:
        logger.warning("kafka_init_failed", error=str(exc))
    setup_mlflow()
    setup_langfuse()
    # RAG runs as a background task so the API passes healthcheck immediately.
    # The pipeline retries until Ollama/Qdrant are ready, then activates.
    asyncio.ensure_future(initialize_rag())
    logger.info("startup_complete", policy=settings.active_policy)

    yield

    await close_producer()
    await close_redis()
    await close_pool()
    logger.info("shutdown_complete")


app = FastAPI(
    title="Datathon 7-MLET — Bandit API",
    description="Adaptive experimentation in financial offers using multi-armed bandits",
    version="0.1.0",
    lifespan=lifespan,
)

from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

from src.api.routers import decide, health, metrics, reward  # noqa: E402
from src.api.routers import explain, decisions, mlops  # noqa: E402
from src.api.routers import flags, experiments, analytics, ws  # noqa: E402
from src.assistant import router as assistant_router  # noqa: E402

app.include_router(health.router)
app.include_router(decide.router)
app.include_router(reward.router)
app.include_router(metrics.router)
app.include_router(explain.router)
app.include_router(assistant_router.router)
app.include_router(decisions.router)
app.include_router(mlops.router)
app.include_router(flags.router)
app.include_router(experiments.router)
app.include_router(analytics.router)
app.include_router(ws.router)

