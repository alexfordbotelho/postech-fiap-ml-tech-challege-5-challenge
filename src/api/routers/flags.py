"""Feature flag management + SDK payload endpoint."""
from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from src.api.models import (
    FeatureFlagCreate,
    FeatureFlagResponse,
    FlagEvaluateRequest,
    FlagEvaluateResponse,
    SdkPayloadResponse,
)
from src.services.flag_engine import evaluate_flag
from src.storage.postgres import PostgresClient, get_postgres_client
from src.api.routers.ws import connection_manager

router = APIRouter(prefix="/flags", tags=["flags"])
logger = logging.getLogger(__name__)


def _fmt(row: dict) -> FeatureFlagResponse:
    return FeatureFlagResponse(
        flag_key=row["flag_key"],
        description=row["description"] or "",
        flag_type=row["flag_type"],
        default_value=row["default_value"],
        rules=row["rules"],
        enabled=row["enabled"],
        tags=list(row["tags"] or []),
        created_at=row["created_at"].isoformat() if row.get("created_at") else None,
        updated_at=row["updated_at"].isoformat() if row.get("updated_at") else None,
    )


@router.get("/", response_model=list[FeatureFlagResponse])
async def list_flags(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> list[FeatureFlagResponse]:
    flags = await pg.list_flags()
    return [_fmt(f) for f in flags]


@router.get("/{flag_key}", response_model=FeatureFlagResponse)
async def get_flag(
    flag_key: str,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> FeatureFlagResponse:
    flag = await pg.get_flag(flag_key)
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
    return _fmt(flag)


@router.post("/", response_model=FeatureFlagResponse, status_code=201)
async def create_flag(
    body: FeatureFlagCreate,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> FeatureFlagResponse:
    data = body.model_dump()
    data["rules"] = [r if isinstance(r, dict) else r.model_dump() for r in body.rules]
    result = await pg.upsert_flag(body.flag_key, data)
    return _fmt(result)


@router.put("/{flag_key}", response_model=FeatureFlagResponse)
async def update_flag(
    flag_key: str,
    body: FeatureFlagCreate,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> FeatureFlagResponse:
    data = body.model_dump()
    data["rules"] = [r if isinstance(r, dict) else r.model_dump() for r in body.rules]
    result = await pg.upsert_flag(flag_key, data)
    return _fmt(result)


@router.post("/{flag_key}/toggle", response_model=dict)
async def toggle_flag(
    flag_key: str,
    enabled: bool,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> dict:
    result = await pg.toggle_flag(flag_key, enabled)
    if not result:
        raise HTTPException(status_code=404, detail="Flag not found")
    await connection_manager.broadcast("flag_toggled", {"flag_key": flag_key, "enabled": result["enabled"]})
    return {"flag_key": flag_key, "enabled": result["enabled"]}


@router.delete("/{flag_key}", response_model=dict)
async def delete_flag(
    flag_key: str,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> dict:
    deleted = await pg.delete_flag(flag_key)
    if not deleted:
        raise HTTPException(status_code=404, detail="Flag not found")
    return {"flag_key": flag_key, "deleted": True}


@router.post("/{flag_key}/evaluate", response_model=FlagEvaluateResponse)
async def evaluate(
    flag_key: str,
    body: FlagEvaluateRequest,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> FlagEvaluateResponse:
    flag = await pg.get_flag(flag_key)
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
    value = evaluate_flag(flag, body.context)
    return FlagEvaluateResponse(flag_key=flag_key, value=value, enabled=flag["enabled"])


@router.get("/{flag_key}/audit", response_model=list[dict])
async def flag_audit(
    flag_key: str,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> list[dict]:
    return await pg.get_flag_audit(flag_key)


# ── SDK payload endpoint (used by SDK clients) ────────────────────────────────

@router.get("/sdk/payload", response_model=SdkPayloadResponse, tags=["sdk"])
async def sdk_payload(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> SdkPayloadResponse:
    """Returns all enabled flags serialized for SDK consumption.

    SDK clients should cache this response and refresh periodically.
    """
    flags = await pg.list_flags()
    payload: dict[str, Any] = {}
    for f in flags:
        if f["enabled"]:
            payload[f["flag_key"]] = {
                "flag_type": f["flag_type"],
                "default_value": f["default_value"],
                "rules": f["rules"],
                "enabled": f["enabled"],
            }
    return SdkPayloadResponse(flags=payload)
