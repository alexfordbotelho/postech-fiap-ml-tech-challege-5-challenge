"""Thin async wrapper around the LLM endpoint.

Backend is selected at startup based on config:
  - Local: AsyncOpenAI pointing at LM Studio / Ollama (openai_base_url)
  - Azure: AsyncAzureOpenAI pointing at Azure OpenAI (azure_openai_endpoint)

When LANGFUSE_ENABLED=true, the client is imported from langfuse.openai so every
call is automatically traced. chat() returns a (content, trace_id) tuple.
"""
from __future__ import annotations

import asyncio
import uuid

from fastapi import HTTPException

from src.config import settings

_AZURE_API_VERSION = "2024-08-01-preview"


def _client():  # type: ignore[return]
    """Return an AsyncOpenAI-compatible client for the configured backend."""
    if settings.use_azure_openai:
        if settings.langfuse_enabled:
            try:
                from langfuse.openai import AsyncAzureOpenAI
                return AsyncAzureOpenAI(
                    azure_endpoint=settings.azure_openai_endpoint,
                    api_key=settings.azure_openai_key,
                    api_version=_AZURE_API_VERSION,
                )
            except ImportError:
                pass
        from openai import AsyncAzureOpenAI
        return AsyncAzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_key,
            api_version=_AZURE_API_VERSION,
        )
    else:
        if settings.langfuse_enabled:
            try:
                from langfuse.openai import AsyncOpenAI
                return AsyncOpenAI(
                    base_url=settings.openai_base_url,
                    api_key=settings.openai_api_key,
                )
            except ImportError:
                pass
        from openai import AsyncOpenAI
        return AsyncOpenAI(
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
        )


def _model_name() -> str:
    return settings.azure_openai_deployment if settings.use_azure_openai else settings.llm_model


async def chat(
    system_prompt: str,
    user_message: str,
    max_tokens: int = 4096,
    session_id: str | None = None,
) -> tuple[str, str | None]:
    """Single-turn chat request. Returns (content, trace_id)."""
    from openai import APIConnectionError, APIStatusError

    trace_id: str | None = None
    extra: dict = {}
    lf = None

    if settings.langfuse_enabled:
        trace_id = str(uuid.uuid4())
        extra = {"trace_id": trace_id, "name": "assistant-ask"}
        if session_id:
            extra["session_id"] = session_id
        try:
            from langfuse import Langfuse
            lf = Langfuse()
            lf.trace(id=trace_id, name="assistant-ask", input=user_message, session_id=session_id)
        except Exception:
            lf = None

    client = _client()
    # Reasoning models (o1/o3/o4-mini on Azure) reject temperature != 1 and
    # max_tokens; use max_completion_tokens and omit temperature for Azure.
    create_kwargs: dict = {
        "model": _model_name(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_completion_tokens": max_tokens,
        **extra,
    }
    if not settings.use_azure_openai:
        create_kwargs["temperature"] = 0.2
    try:
        response = await client.chat.completions.create(**create_kwargs)
    except APIConnectionError as exc:
        endpoint = settings.azure_openai_endpoint if settings.use_azure_openai else settings.openai_base_url
        raise HTTPException(
            status_code=503,
            detail=f"LLM endpoint unreachable at {endpoint}.",
        ) from exc
    except APIStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LLM API error {exc.status_code}: {exc.message}",
        ) from exc

    choice = response.choices[0]
    content = choice.message.content or ""

    if not content:
        reasoning = getattr(choice.message, "reasoning_content", None)
        if reasoning:
            return (
                "[O modelo esgotou o budget de tokens durante o raciocínio interno. "
                "Tente reformular a pergunta de forma mais curta ou aumente MAX_TOKENS no .env.]",
                trace_id,
            )

    if lf is not None and trace_id:
        try:
            lf.trace(id=trace_id, output=content)
            await asyncio.to_thread(lf.flush)
        except Exception:
            pass

    return content, trace_id
