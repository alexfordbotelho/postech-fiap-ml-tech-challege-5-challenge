"""Integration tests for GET /decisions/ and GET /mlops/runs/ — require running Docker Compose stack."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

BASE_URL = "http://localhost:8001"
pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_decisions_returns_paginated():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get("/decisions/?page=1&limit=5")
    assert response.status_code == 200
    body = response.json()
    assert "total" in body
    assert "page" in body
    assert "limit" in body
    assert "items" in body
    assert isinstance(body["items"], list)
    assert len(body["items"]) <= 5
    assert body["page"] == 1
    assert body["limit"] == 5


@pytest.mark.asyncio
async def test_decisions_filter_by_policy():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get("/decisions/?policy=baseline&limit=10")
    assert response.status_code == 200
    body = response.json()
    for item in body["items"]:
        assert item["policy_name"] == "baseline"


@pytest.mark.asyncio
async def test_decisions_filter_by_exploration():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get("/decisions/?is_exploration=true&limit=10")
    assert response.status_code == 200
    body = response.json()
    for item in body["items"]:
        assert item["is_exploration"] is True


@pytest.mark.asyncio
async def test_decisions_item_schema():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get("/decisions/?limit=1")
    assert response.status_code == 200
    body = response.json()
    if body["items"]:
        item = body["items"][0]
        assert "decision_id" in item
        assert "policy_name" in item
        assert "arm_selected" in item
        assert "is_exploration" in item
        assert "created_at" in item


@pytest.mark.asyncio
async def test_decisions_cors_header():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.options(
            "/decisions/",
            headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
        )
    assert "access-control-allow-origin" in response.headers


@pytest.mark.asyncio
async def test_mlops_runs_returns_list():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get("/mlops/runs/?policy=thompson")
    assert response.status_code == 200
    body = response.json()
    assert body["policy"] == "thompson"
    assert isinstance(body["runs"], list)


@pytest.mark.asyncio
async def test_mlops_runs_unknown_policy_returns_empty():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get("/mlops/runs/?policy=nonexistent_policy")
    assert response.status_code == 200
    body = response.json()
    assert body["runs"] == []
