"""Integration tests for POST /reward — require running Docker Compose stack."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


BASE_URL = "http://localhost:8001"
pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_reward_updates_bandit_state():
    async with AsyncClient(base_url=BASE_URL) as client:
        # First get a decision
        decide_resp = await client.post(
            "/decide/",
            json={"features": {"age": 35, "education": "secondary"}, "policy": "thompson"},
        )
        assert decide_resp.status_code == 200
        decision_id = decide_resp.json()["decision_id"]

        # Then send a reward
        reward_resp = await client.post(
            "/reward/",
            json={"decision_id": decision_id, "reward": 1.0},
        )
    assert reward_resp.status_code == 200
    body = reward_resp.json()
    assert body["status"] == "ok"
    assert "updated_arm" in body


@pytest.mark.asyncio
async def test_reward_invalid_decision_id_returns_404():
    import uuid

    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/reward/",
            json={"decision_id": str(uuid.uuid4()), "reward": 1.0},
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_reward_out_of_range_returns_422():
    import uuid

    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/reward/",
            json={"decision_id": str(uuid.uuid4()), "reward": 2.5},
        )
    assert response.status_code == 422
