"""Langfuse observability setup for the LLM assistant.

When LANGFUSE_ENABLED=true, sets LANGFUSE_HOST in the process environment
so the langfuse.openai drop-in (used in llm.py) auto-traces every chat()
call — model, tokens, latency, prompt, completion — with no extra code.

The LlamaIndex callback handler was removed because langfuse SDK v4
dropped the langfuse.llama_index module in favour of OpenTelemetry-based
instrumentation. LLM calls via langfuse.openai remain fully traced.

Call setup_langfuse() once at startup before any LLM requests.
"""
from __future__ import annotations

import os

import structlog

logger = structlog.get_logger()

_setup_done: bool = False


def setup_langfuse() -> None:
    """Initialize Langfuse tracing. Safe to call multiple times (idempotent)."""
    global _setup_done
    if _setup_done:
        return

    from src.config import settings

    if not settings.langfuse_enabled:
        logger.info("langfuse_disabled_skipping_setup")
        _setup_done = True
        return

    try:
        # Expose host so langfuse.openai (in llm.py) resolves it from the env.
        # pydantic-settings reads LANGFUSE_HOST from env, but langfuse.openai
        # reads the env var directly — this ensures both see the same value.
        os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_host)
        os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key)
        os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key)

        # Smoke-test: check HTTP reachability without deserializing the response
        # (auth_check() has Pydantic schema differences between SDK v4 + server v2)
        import httpx
        resp = httpx.get(f"{settings.langfuse_host}/api/public/health", timeout=5.0)
        resp.raise_for_status()

        _setup_done = True
        logger.info("langfuse_tracing_enabled", host=settings.langfuse_host)

    except Exception as exc:
        logger.warning("langfuse_setup_failed_tracing_disabled", error=str(exc))
        _setup_done = True
