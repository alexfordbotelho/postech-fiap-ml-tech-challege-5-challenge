"""Analytics endpoints: funnel, cohort, segment-arm heatmap, flag-scenarios.

flag-scenario endpoints select backend based on config:
  - Local (default): ClickHouse via clickhouse-driver (native TCP/9000)
  - Azure:           Azure Data Explorer via azure-kusto-data (KQL)
"""
from __future__ import annotations

import asyncio
import json
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query

from src.config import settings
from src.storage.postgres import PostgresClient, get_postgres_client
from src.storage.redis_client import get_redis

router = APIRouter(prefix="/analytics", tags=["analytics"])

_CACHE_TTL_STATIC = 60
_CACHE_TTL_FLAGS  = 5
_CACHE_TTL_STALE  = 3600

_QUERY_SEM = asyncio.Semaphore(1)

_log = structlog.get_logger()


# ── Cache helpers ──────────────────────────────────────────────────────────────


async def _cache_get(key: str) -> Any | None:
    try:
        raw = await get_redis().get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def _cache_set(key: str, value: Any, ttl: int = _CACHE_TTL_STATIC) -> None:
    try:
        await get_redis().set(key, json.dumps(value), ex=ttl)
    except Exception:
        pass


def _time_filter(window_hours: int, window_minutes: int) -> str:
    """Build WHERE time clause for ClickHouse; minutes take priority when > 0."""
    if window_minutes > 0:
        return f"timestamp >= now() - INTERVAL {window_minutes} MINUTE"
    return f"timestamp >= now() - INTERVAL {window_hours} HOUR"


# ── ClickHouse backend ─────────────────────────────────────────────────────────

_CH_QUERY_SETTINGS = "SETTINGS max_execution_time=8"


def _sync_ch_query(sql: str) -> list[dict] | None:
    from clickhouse_driver import Client as ChClient
    from clickhouse_driver.errors import Error as ChError

    client = ChClient(
        host=settings.clickhouse_native_host,
        port=settings.clickhouse_native_port,
        database=settings.clickhouse_db,
        connect_timeout=5,
        send_receive_timeout=12,
    )
    try:
        sql_with_settings = sql.rstrip().rstrip(";") + "\n" + _CH_QUERY_SETTINGS
        result = client.execute(sql_with_settings, with_column_types=True)
        rows: list = result[0]
        col_types: list = result[1]
        col_names = [c[0] for c in col_types]
        return [dict(zip(col_names, row)) for row in rows]
    except ChError as exc:
        _log.warning("clickhouse_query_error", error=str(exc))
        return None
    except Exception as exc:
        _log.warning("clickhouse_unavailable", error=str(exc))
        return None
    finally:
        client.disconnect()


# ── Azure Data Explorer / Kusto backend ────────────────────────────────────────


def _sync_kusto_query(kql: str) -> list[dict] | None:
    try:
        from azure.identity import ManagedIdentityCredential
        from azure.kusto.data import KustoClient, KustoConnectionStringBuilder

        credential = ManagedIdentityCredential(
            client_id=settings.kusto_msi_client_id or None
        )
        kcsb = KustoConnectionStringBuilder.with_azure_token_credential(
            settings.kusto_cluster_uri,
            credential,
        )
        client = KustoClient(kcsb)
        response = client.execute(settings.kusto_database, kql)
        table = response.primary_results[0]
        col_names = [col.column_name for col in table.columns]
        return [{col_names[i]: row[i] for i in range(len(col_names))} for row in table.rows]
    except Exception as exc:
        _log.warning("kusto_query_error", error=str(exc))
        return None


# ── Unified query dispatcher ───────────────────────────────────────────────────


async def _query(sql: str, kql: str) -> list[dict] | None:
    """Run ClickHouse SQL locally or KQL on ADX in Azure — serialized to protect thread pool."""
    async with _QUERY_SEM:
        if settings.use_kusto:
            return await asyncio.to_thread(_sync_kusto_query, kql)
        return await asyncio.to_thread(_sync_ch_query, sql)


# ── PostgreSQL-backed endpoints (unchanged across environments) ────────────────


@router.get("/funnel")
async def funnel(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> list[dict]:
    """Conversion funnel by policy: decisions → rewarded → conversions."""
    cached = await _cache_get("analytics:funnel")
    if cached is not None:
        return cached
    result = await pg.get_analytics_funnel()
    await _cache_set("analytics:funnel", result)
    return result


@router.get("/cohort/weekly")
async def cohort_weekly(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> list[dict]:
    """Weekly avg_reward cohort by policy."""
    cached = await _cache_get("analytics:cohort:weekly")
    if cached is not None:
        return cached
    result = await pg.get_cohort_weekly()
    await _cache_set("analytics:cohort:weekly", result)
    return result


@router.get("/heatmap/segment-arm")
async def segment_arm_heatmap(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> list[dict]:
    """Avg reward matrix: segment × arm (for heatmap visualization)."""
    cached = await _cache_get("analytics:heatmap:segment-arm")
    if cached is not None:
        return cached
    result = await pg.get_segment_arm_heatmap()
    await _cache_set("analytics:heatmap:segment-arm", result)
    return result


@router.get("/fairness")
async def fairness(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> dict:
    """Fairness metrics: exposure by segment, HHI concentration index, alerts."""
    cached = await _cache_get("analytics:fairness")
    if cached is not None:
        return cached
    result = await pg.get_fairness_data()
    await _cache_set("analytics:fairness", result)
    return result


# ── Real-time flag-scenario endpoints (ClickHouse ↔ ADX) ──────────────────────


@router.get("/flag-scenarios")
async def flag_scenarios(
    window_hours: int = Query(default=24, ge=1, le=720),
    window_minutes: int = Query(default=0, ge=0, le=1440),
    flag_key: str = Query(default="simplified_checkout"),
) -> list[dict]:
    """Real-time: decisions grouped by flag value × arm."""
    wm = window_minutes if window_minutes > 0 else window_hours * 60
    cache_key = f"analytics:flag-scenarios:{flag_key}:{wm}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return cached

    tf = _time_filter(window_hours, window_minutes)
    sql = f"""
    SELECT
        trim(BOTH '"' FROM toString(JSONExtractRaw(flag_snapshot, '{flag_key}'))) AS flag_value,
        arm_selected,
        countIf(reward > 0)                            AS conversions,
        count()                                        AS decisions,
        round(avg(reward), 4)                          AS avg_reward,
        countIf(is_exploration = 1)                    AS explorations
    FROM datathon.flag_events
    WHERE {tf}
      AND flag_snapshot != ''
      AND flag_snapshot != '{{}}'
      AND JSONHas(flag_snapshot, '{flag_key}')
    GROUP BY flag_value, arm_selected
    ORDER BY decisions DESC
    LIMIT 100
    """
    kql = f"""
flag_events
| where ingestion_time() >= ago({wm}m)
| where isnotempty(flag_snapshot)
| where isnotnull(flag_snapshot["{flag_key}"])
| extend flag_value = tostring(flag_snapshot["{flag_key}"])
| summarize conversions=countif(reward > 0), decisions=count(), avg_reward=round(avg(reward), 4), explorations=countif(is_exploration == true) by flag_value, arm_selected
| order by decisions desc
| take 100
"""
    rows = await _query(sql, kql)
    if rows is None:
        stale = await _cache_get(f"stale:{cache_key}")
        if stale is not None:
            return stale
        raise HTTPException(status_code=503, detail="analytics_unavailable")
    for r in rows:
        r["decisions"] = int(r["decisions"])
        r["conversions"] = int(r["conversions"])
        r["explorations"] = int(r.get("explorations", 0))
        r["avg_reward"] = float(r["avg_reward"] or 0)
        r["conversion_rate"] = round(r["conversions"] / max(r["decisions"], 1), 4)
    await _cache_set(cache_key, rows, ttl=_CACHE_TTL_FLAGS)
    await _cache_set(f"stale:{cache_key}", rows, ttl=_CACHE_TTL_STALE)
    return rows


@router.get("/flag-scenarios/summary")
async def flag_scenarios_summary(
    window_hours: int = Query(default=24, ge=1, le=720),
    window_minutes: int = Query(default=0, ge=0, le=1440),
) -> list[dict]:
    """Real-time: for every flag key in flag_snapshot, decisions × flag_value."""
    wm = window_minutes if window_minutes > 0 else window_hours * 60
    cache_key = f"analytics:flag-summary:{wm}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return cached

    tf = _time_filter(window_hours, window_minutes)
    sql = f"""
    SELECT
        arrayJoin(JSONExtractKeys(flag_snapshot)) AS flag_key,
        trim(BOTH '"' FROM toString(JSONExtractRaw(flag_snapshot, flag_key))) AS flag_value,
        count()                                    AS decisions,
        round(avg(reward), 4)                      AS avg_reward,
        countIf(reward > 0)                        AS conversions
    FROM datathon.flag_events
    WHERE {tf}
      AND flag_snapshot != ''
      AND flag_snapshot != '{{}}'
    GROUP BY flag_key, flag_value
    ORDER BY flag_key, decisions DESC
    LIMIT 200
    """
    kql = f"""
flag_events
| where ingestion_time() >= ago({wm}m)
| where isnotempty(flag_snapshot)
| extend bag_keys = bag_keys(flag_snapshot)
| mv-expand key = bag_keys to typeof(string)
| extend flag_value = tostring(flag_snapshot[key])
| summarize decisions=count(), avg_reward=round(avg(reward), 4), conversions=countif(reward > 0) by flag_key=key, flag_value
| order by flag_key asc, decisions desc
| take 200
"""
    rows = await _query(sql, kql)
    if rows is None:
        stale = await _cache_get(f"stale:{cache_key}")
        if stale is not None:
            return stale
        raise HTTPException(status_code=503, detail="analytics_unavailable")
    for r in rows:
        r["decisions"] = int(r["decisions"])
        r["conversions"] = int(r["conversions"])
        r["avg_reward"] = float(r["avg_reward"] or 0)
        r["conversion_rate"] = round(r["conversions"] / max(r["decisions"], 1), 4)
    await _cache_set(cache_key, rows, ttl=_CACHE_TTL_FLAGS)
    await _cache_set(f"stale:{cache_key}", rows, ttl=_CACHE_TTL_STALE)
    return rows


@router.get("/flag-scenarios/profile")
async def flag_scenarios_profile(
    window_hours: int = Query(default=24, ge=1, le=720),
    window_minutes: int = Query(default=0, ge=0, le=1440),
    flag_key: str = Query(default="simplified_checkout"),
) -> list[dict]:
    """Client profile breakdown: flag_value × segment for the given flag."""
    wm = window_minutes if window_minutes > 0 else window_hours * 60
    cache_key = f"analytics:flag-profile:{flag_key}:{wm}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return cached

    tf = _time_filter(window_hours, window_minutes)
    sql = f"""
    SELECT
        trim(BOTH '"' FROM toString(JSONExtractRaw(flag_snapshot, '{flag_key}'))) AS flag_value,
        segment,
        count()               AS decisions,
        countIf(reward > 0)   AS conversions,
        round(avg(reward), 4) AS avg_reward
    FROM datathon.flag_events
    WHERE {tf}
      AND flag_snapshot != ''
      AND flag_snapshot != '{{}}'
      AND JSONHas(flag_snapshot, '{flag_key}')
    GROUP BY flag_value, segment
    ORDER BY flag_value, decisions DESC
    LIMIT 100
    """
    kql = f"""
flag_events
| where ingestion_time() >= ago({wm}m)
| where isnotempty(flag_snapshot)
| where isnotnull(flag_snapshot["{flag_key}"])
| extend flag_value = tostring(flag_snapshot["{flag_key}"])
| summarize decisions=count(), conversions=countif(reward > 0), avg_reward=round(avg(reward), 4) by flag_value, segment
| order by flag_value asc, decisions desc
| take 100
"""
    rows = await _query(sql, kql)
    if rows is None:
        stale = await _cache_get(f"stale:{cache_key}")
        if stale is not None:
            return stale
        raise HTTPException(status_code=503, detail="analytics_unavailable")
    for r in rows:
        r["decisions"] = int(r["decisions"])
        r["conversions"] = int(r["conversions"])
        r["avg_reward"] = float(r["avg_reward"] or 0)
        r["conversion_rate"] = round(r["conversions"] / max(r["decisions"], 1), 4)
    await _cache_set(cache_key, rows, ttl=_CACHE_TTL_FLAGS)
    await _cache_set(f"stale:{cache_key}", rows, ttl=_CACHE_TTL_STALE)
    return rows


@router.get("/flag-scenarios/timeline")
async def flag_scenarios_timeline(
    window_hours: int = Query(default=1, ge=1, le=720),
    window_minutes: int = Query(default=0, ge=0, le=1440),
    flag_key: str = Query(default="simplified_checkout"),
) -> list[dict]:
    """Time-series: decisions + conversions bucketed over time per flag_value."""
    effective_minutes = window_minutes if window_minutes > 0 else window_hours * 60
    cache_key = f"analytics:flag-timeline:{flag_key}:{effective_minutes}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return cached

    tf = _time_filter(window_hours, window_minutes)

    if effective_minutes <= 30:
        bucket_expr = "toStartOfInterval(timestamp, INTERVAL 1 MINUTE)"
        fmt_ch = "%H:%M"
        bin_kql, fmt_kql = "1m", "HH:mm"
    elif effective_minutes <= 360:
        bucket_expr = "toStartOfInterval(timestamp, INTERVAL 5 MINUTE)"
        fmt_ch = "%H:%M"
        bin_kql, fmt_kql = "5m", "HH:mm"
    elif effective_minutes <= 1440:
        bucket_expr = "toStartOfInterval(timestamp, INTERVAL 30 MINUTE)"
        fmt_ch = "%H:%M"
        bin_kql, fmt_kql = "30m", "HH:mm"
    else:
        bucket_expr = "toStartOfInterval(timestamp, INTERVAL 1 HOUR)"
        fmt_ch = "%d/%m %H:00"
        bin_kql, fmt_kql = "1h", "dd/MM HH:00"

    sql = f"""
    SELECT
        {bucket_expr}                                           AS bucket,
        formatDateTime(bucket, '{fmt_ch}')                     AS label,
        trim(BOTH '"' FROM toString(JSONExtractRaw(flag_snapshot, '{flag_key}'))) AS flag_value,
        count()                                                AS decisions,
        countIf(reward > 0)                                    AS conversions
    FROM datathon.flag_events
    WHERE {tf}
      AND flag_snapshot != ''
      AND flag_snapshot != '{{}}'
      AND JSONHas(flag_snapshot, '{flag_key}')
    GROUP BY bucket, label, flag_value
    ORDER BY bucket, flag_value
    LIMIT 500
    """
    kql = f"""
flag_events
| where ingestion_time() >= ago({effective_minutes}m)
| where isnotempty(flag_snapshot)
| where isnotnull(flag_snapshot["{flag_key}"])
| extend flag_value = tostring(flag_snapshot["{flag_key}"])
| extend bucket = bin(ingestion_time(), {bin_kql})
| summarize decisions=count(), conversions=countif(reward > 0) by bucket, flag_value
| extend label = format_datetime(bucket, '{fmt_kql}')
| order by bucket asc, flag_value asc
| project label, flag_value, decisions, conversions
| take 500
"""
    rows = await _query(sql, kql)
    if rows is None:
        stale = await _cache_get(f"stale:{cache_key}")
        if stale is not None:
            return stale
        raise HTTPException(status_code=503, detail="analytics_unavailable")
    for r in rows:
        r["decisions"] = int(r["decisions"])
        r["conversions"] = int(r["conversions"])
        r.pop("bucket", None)
    await _cache_set(cache_key, rows, ttl=_CACHE_TTL_FLAGS)
    await _cache_set(f"stale:{cache_key}", rows, ttl=_CACHE_TTL_STALE)
    return rows
