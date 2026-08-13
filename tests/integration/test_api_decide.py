"""Integration tests for POST /decide — require running Docker Compose stack."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


BASE_URL = "http://localhost:8001"
pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_decide_returns_200():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/decide/",
            json={
                "features": {"age": 45, "education": "tertiary", "housing": "no", "balance": 2000},
                "policy": "thompson",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert "decision_id" in body
    assert "offer_id" in body
    assert body["policy"] == "thompson"
    assert 0.0 <= body["confidence"] <= 1.0


@pytest.mark.asyncio
async def test_decide_latency_under_200ms():
    import time

    async with AsyncClient(base_url=BASE_URL, timeout=5.0) as client:
        start = time.perf_counter()
        response = await client.post(
            "/decide/",
            json={
                "features": {"age": 30, "education": "secondary", "housing": "yes"},
                "policy": "ucb",
            },
        )
        elapsed_ms = (time.perf_counter() - start) * 1000

    assert response.status_code == 200
    assert elapsed_ms < 200, f"Latency {elapsed_ms:.1f}ms exceeds 200ms SLA"


@pytest.mark.asyncio
async def test_decide_with_baseline_policy():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/decide/",
            json={
                "features": {"age": 60, "education": "tertiary", "housing": "no", "balance": 5000},
                "policy": "baseline",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["offer_id"] == "premium_savings"


@pytest.mark.asyncio
async def test_decide_unknown_policy_returns_error():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/decide/",
            json={"features": {"age": 30}, "policy": "nonexistent"},
        )
    assert response.status_code in (400, 422, 500)
