from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from src.api.models import DecisionListResponse
from src.storage.postgres import PostgresClient, get_postgres_client

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.get("/", response_model=DecisionListResponse)
async def list_decisions(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
    policy: str | None = Query(None),
    segment: str | None = Query(None),
    is_exploration: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> DecisionListResponse:
    result = await pg.list_decisions(
        policy=policy,
        segment=segment,
        is_exploration=is_exploration,
        page=page,
        limit=limit,
    )
    return DecisionListResponse(**result)
