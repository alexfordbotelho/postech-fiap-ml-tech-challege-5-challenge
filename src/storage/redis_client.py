from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis

from src.config import settings


_client: aioredis.Redis | None = None


async def create_redis() -> aioredis.Redis:
    global _client
    _client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    if _client:
        await _client.aclose()


def get_redis() -> aioredis.Redis:
    if _client is None:
        raise RuntimeError("Redis client not initialized")
    return _client


class RedisStateClient:
    def __init__(self, client: aioredis.Redis) -> None:
        self._r = client
        self._ttl = settings.redis_state_ttl

    def _key(self, policy_name: str) -> str:
        return f"bandit_state:{policy_name}"

    async def get_state(self, policy_name: str) -> dict[str, Any] | None:
        raw = await self._r.get(self._key(policy_name))
        return json.loads(raw) if raw else None

    async def set_state(self, policy_name: str, state: dict[str, Any]) -> None:
        await self._r.set(self._key(policy_name), json.dumps(state), ex=self._ttl)

    async def invalidate(self, policy_name: str) -> None:
        await self._r.delete(self._key(policy_name))


def get_redis_client() -> RedisStateClient:
    return RedisStateClient(get_redis())
