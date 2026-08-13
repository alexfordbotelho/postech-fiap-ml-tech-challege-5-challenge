from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg

from src.config import settings


def _json_serial(o: object) -> str:
    if isinstance(o, datetime):
        return o.isoformat()
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")


_pool: asyncpg.Pool | None = None


async def create_pool() -> asyncpg.Pool:
    global _pool
    _pool = await asyncpg.create_pool(
        settings.database_url.replace("+asyncpg", ""),
        min_size=2,
        max_size=15,
        command_timeout=15,
    )
    return _pool


async def close_pool() -> None:
    if _pool:
        await _pool.close()


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialized")
    return _pool


class PostgresClient:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def insert_decision_log(self, record: dict[str, Any]) -> None:
        context_features = {
            **record["context_features"],
            "_segment": record.get("segment", "default"),
            "_channel": record.get("channel", "web"),
        }
        exp_id = record.get("bandit_experiment_id")
        await self._pool.execute(
            """
            INSERT INTO decision_logs
                (decision_id, policy_name, arm_selected, context_features,
                 is_exploration, session_id, bandit_experiment_id, variation_id)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
            ON CONFLICT (decision_id) DO NOTHING
            """,
            record["decision_id"],
            record["policy_name"],
            record["arm_selected"],
            json.dumps(context_features),
            record["is_exploration"],
            record["session_id"],
            exp_id,
            record["arm_selected"] if exp_id else None,
        )

    async def update_reward(self, decision_id: UUID, reward: float) -> dict | None:
        row = await self._pool.fetchrow(
            """
            UPDATE decision_logs
            SET reward = $1
            WHERE decision_id = $2
            RETURNING arm_selected, context_features, policy_name
            """,
            reward,
            str(decision_id),
        )
        if not row:
            return None
        return {
            "arm_selected": row["arm_selected"],
            "context_features": json.loads(row["context_features"]),
            "policy_name": row["policy_name"],
        }

    async def get_rewarded_decisions(self, policy_name: str, limit: int = 5000) -> list[dict[str, Any]]:
        """Return the most recent rewarded decisions for offline retraining.

        Capped at `limit` rows (default 5000) to prevent OOM when the table grows large.
        Uses DESC + reverse so the policy replays decisions in chronological order.
        """
        rows = await self._pool.fetch(
            """
            SELECT arm_selected, context_features, reward
            FROM (
                SELECT arm_selected, context_features, reward, timestamp
                FROM decision_logs
                WHERE policy_name = $1 AND reward IS NOT NULL
                ORDER BY timestamp DESC
                LIMIT $2
            ) sub
            ORDER BY timestamp ASC
            """,
            policy_name,
            limit,
        )
        return [
            {
                "arm_selected": r["arm_selected"],
                "context_features": json.loads(r["context_features"]),
                "reward": r["reward"],
            }
            for r in rows
        ]

    async def get_decision(self, decision_id: UUID) -> dict[str, Any] | None:
        row = await self._pool.fetchrow(
            """
            SELECT decision_id, policy_name, arm_selected,
                   context_features, is_exploration, session_id, reward
            FROM decision_logs
            WHERE decision_id = $1
            """,
            str(decision_id),
        )
        if not row:
            return None
        return {
            "decision_id": str(row["decision_id"]),
            "policy_name": row["policy_name"],
            "arm_selected": row["arm_selected"],
            "context_features": json.loads(row["context_features"]),
            "is_exploration": row["is_exploration"],
            "session_id": str(row["session_id"]),
            "reward": row["reward"],
        }

    async def get_bandit_state(self, policy_name: str) -> dict[str, Any] | None:
        row = await self._pool.fetchrow(
            "SELECT state FROM bandit_state WHERE policy_name = $1",
            policy_name,
        )
        return json.loads(row["state"]) if row else None

    async def upsert_bandit_state(self, policy_name: str, state: dict[str, Any]) -> None:
        await self._pool.execute(
            """
            INSERT INTO bandit_state (policy_name, state, updated_at)
            VALUES ($1, $2::jsonb, now())
            ON CONFLICT (policy_name) DO UPDATE
                SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at
            """,
            policy_name,
            json.dumps(state),
        )

    async def get_policy_metrics(self, policy_name: str) -> dict[str, Any]:
        row = await self._pool.fetchrow(
            """
            SELECT
                COUNT(*)                                   AS total_decisions,
                COUNT(reward) FILTER (WHERE reward IS NOT NULL) AS rewarded,
                COALESCE(SUM(reward), 0)                   AS cumulative_reward,
                COALESCE(AVG(reward), 0)                   AS avg_reward,
                COUNT(*) FILTER (WHERE is_exploration)     AS explorations
            FROM decision_logs
            WHERE policy_name = $1
            """,
            policy_name,
        )
        if not row:
            return {}
        total = row["total_decisions"] or 1
        return {
            "total_decisions": row["total_decisions"],
            "cumulative_reward": float(row["cumulative_reward"]),
            "avg_reward": float(row["avg_reward"]),
            "exploration_rate": row["explorations"] / total,
        }

    async def get_all_policy_metrics(self) -> list[dict[str, Any]]:
        """Return aggregated metrics for all policies in a single query."""
        rows = await self._pool.fetch(
            """
            SELECT
                policy_name,
                COUNT(*)                               AS total_decisions,
                COALESCE(SUM(reward), 0)               AS cumulative_reward,
                COALESCE(AVG(reward), 0)               AS avg_reward,
                COUNT(*) FILTER (WHERE is_exploration) AS explorations
            FROM decision_logs
            GROUP BY policy_name
            ORDER BY policy_name
            """
        )
        return [
            {
                "policy_name": r["policy_name"],
                "total_decisions": r["total_decisions"],
                "cumulative_reward": float(r["cumulative_reward"]),
                "avg_reward": float(r["avg_reward"]),
                "exploration_rate": r["explorations"] / max(r["total_decisions"], 1),
            }
            for r in rows
        ]


    async def get_channel_metrics(self) -> list[dict[str, Any]]:
        """Return avg_reward and decision count grouped by channel × policy."""
        rows = await self._pool.fetch(
            """
            SELECT
                COALESCE(context_features->>'_channel', 'web') AS channel,
                policy_name,
                COUNT(*)                                       AS total_decisions,
                COALESCE(AVG(reward), 0)                       AS avg_reward,
                COALESCE(SUM(reward), 0)                       AS cumulative_reward,
                COUNT(*) FILTER (WHERE is_exploration)         AS explorations
            FROM decision_logs
            GROUP BY channel, policy_name
            ORDER BY channel, policy_name
            """
        )
        return [
            {
                "channel": r["channel"],
                "policy_name": r["policy_name"],
                "total_decisions": r["total_decisions"],
                "avg_reward": float(r["avg_reward"]),
                "cumulative_reward": float(r["cumulative_reward"]),
                "exploration_rate": r["explorations"] / max(r["total_decisions"], 1),
            }
            for r in rows
        ]

    async def get_policy_comparison(self) -> dict[str, dict[str, Any]]:
        """Return aggregated metrics keyed by policy_name for the compare mode."""
        rows = await self._pool.fetch(
            """
            SELECT
                policy_name,
                COUNT(*)                                   AS total_decisions,
                COALESCE(SUM(reward), 0)                   AS cumulative_reward,
                COALESCE(AVG(reward), 0)                   AS avg_reward,
                COUNT(*) FILTER (WHERE is_exploration)     AS explorations
            FROM decision_logs
            GROUP BY policy_name
            ORDER BY cumulative_reward DESC
            """
        )
        return {
            row["policy_name"]: {
                "total_decisions": row["total_decisions"],
                "cumulative_reward": float(row["cumulative_reward"]),
                "avg_reward": float(row["avg_reward"]),
                "exploration_rate": row["explorations"] / max(row["total_decisions"], 1),
            }
            for row in rows
        }

    async def list_decisions(
        self,
        policy: str | None = None,
        segment: str | None = None,
        is_exploration: bool | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        filters: list[str] = []
        params: list[Any] = []

        if policy:
            params.append(policy)
            filters.append(f"policy_name = ${len(params)}")
        if segment:
            params.append(segment)
            filters.append(f"context_features->>'_segment' = ${len(params)}")
        if is_exploration is not None:
            params.append(is_exploration)
            filters.append(f"is_exploration = ${len(params)}")

        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        offset = (page - 1) * limit

        count_params = list(params)
        total_row = await self._pool.fetchrow(
            f"SELECT COUNT(*) FROM decision_logs {where}", *count_params
        )
        total = int(total_row[0]) if total_row else 0

        params.extend([limit, offset])
        rows = await self._pool.fetch(
            f"""
            SELECT
                decision_id::text,
                policy_name,
                arm_selected,
                is_exploration,
                reward,
                session_id::text,
                timestamp,
                context_features->>'_channel'  AS channel,
                context_features->>'_segment'  AS segment
            FROM decision_logs
            {where}
            ORDER BY timestamp DESC
            LIMIT ${len(params) - 1} OFFSET ${len(params)}
            """,
            *params,
        )

        items = []
        for r in rows:
            item: dict[str, Any] = {
                "decision_id": r["decision_id"],
                "policy_name": r["policy_name"],
                "arm_selected": r["arm_selected"],
                "is_exploration": r["is_exploration"],
                "reward": r["reward"],
                "created_at": r["timestamp"].isoformat() if r["timestamp"] else None,
                "channel": r["channel"],
                "segment": r["segment"],
            }
            items.append(item)

        return {"total": total, "page": page, "limit": limit, "items": items}


    # ── Feature Flags ─────────────────────────────────────────────────────────

    @staticmethod
    def _parse_flag_row(row: dict) -> dict:
        """asyncpg returns JSONB columns as strings — deserialize them."""
        for field in ("rules", "default_value", "tags"):
            v = row.get(field)
            if isinstance(v, str):
                try:
                    row[field] = json.loads(v)
                except (ValueError, TypeError):
                    pass
        return row

    async def list_flags(self) -> list[dict[str, Any]]:
        rows = await self._pool.fetch(
            "SELECT flag_key, description, flag_type, default_value, rules, enabled, tags, created_at, updated_at FROM feature_flags ORDER BY flag_key"
        )
        return [self._parse_flag_row(dict(r)) for r in rows]

    async def get_flag(self, flag_key: str) -> dict[str, Any] | None:
        row = await self._pool.fetchrow(
            "SELECT flag_key, description, flag_type, default_value, rules, enabled, tags, created_at, updated_at FROM feature_flags WHERE flag_key = $1",
            flag_key,
        )
        return self._parse_flag_row(dict(row)) if row else None

    async def upsert_flag(self, flag_key: str, data: dict[str, Any], changed_by: str = "api") -> dict[str, Any]:
        old = await self.get_flag(flag_key)
        row = await self._pool.fetchrow(
            """
            INSERT INTO feature_flags (flag_key, description, flag_type, default_value, rules, enabled, tags, updated_at)
            VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, now())
            ON CONFLICT (flag_key) DO UPDATE SET
                description   = EXCLUDED.description,
                flag_type     = EXCLUDED.flag_type,
                default_value = EXCLUDED.default_value,
                rules         = EXCLUDED.rules,
                enabled       = EXCLUDED.enabled,
                tags          = EXCLUDED.tags,
                updated_at    = now()
            RETURNING flag_key, description, flag_type, default_value, rules, enabled, tags, created_at, updated_at
            """,
            flag_key,
            data.get("description", ""),
            data.get("flag_type", "string"),
            json.dumps(data.get("default_value")),
            json.dumps(data.get("rules", [])),
            data.get("enabled", True),
            data.get("tags", []),
        )
        await self._pool.execute(
            "INSERT INTO flag_audit_log (flag_key, event, changed_by, old_value, new_value) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)",
            flag_key,
            "created" if old is None else "updated",
            changed_by,
            json.dumps(old, default=_json_serial) if old else None,
            json.dumps(data, default=_json_serial),
        )
        return self._parse_flag_row(dict(row))

    async def toggle_flag(self, flag_key: str, enabled: bool, changed_by: str = "api") -> dict[str, Any] | None:
        row = await self._pool.fetchrow(
            "UPDATE feature_flags SET enabled = $1, updated_at = now() WHERE flag_key = $2 RETURNING flag_key, enabled",
            enabled, flag_key,
        )
        if row:
            await self._pool.execute(
                "INSERT INTO flag_audit_log (flag_key, event, changed_by, new_value) VALUES ($1, $2, $3, $4::jsonb)",
                flag_key, "toggled", changed_by, json.dumps({"enabled": enabled}),
            )
        return dict(row) if row else None

    async def delete_flag(self, flag_key: str, changed_by: str = "api") -> bool:
        old = await self.get_flag(flag_key)
        result = await self._pool.execute("DELETE FROM feature_flags WHERE flag_key = $1", flag_key)
        if old:
            await self._pool.execute(
                "INSERT INTO flag_audit_log (flag_key, event, changed_by, old_value) VALUES ($1, $2, $3, $4::jsonb)",
                flag_key, "deleted", changed_by, json.dumps(old, default=_json_serial),
            )
        return result == "DELETE 1"

    async def get_flag_audit(self, flag_key: str, limit: int = 50) -> list[dict[str, Any]]:
        rows = await self._pool.fetch(
            "SELECT id, flag_key, event, changed_by, old_value, new_value, changed_at FROM flag_audit_log WHERE flag_key = $1 ORDER BY changed_at DESC LIMIT $2",
            flag_key, limit,
        )
        return [dict(r) for r in rows]

    # ── Bandit Experiments ────────────────────────────────────────────────────

    @staticmethod
    def _parse_exp_row(row: dict) -> dict:
        """asyncpg returns JSONB columns as strings — deserialize them."""
        for field in ("variations", "targeting", "traffic_split"):
            v = row.get(field)
            if isinstance(v, str):
                try:
                    row[field] = json.loads(v)
                except (ValueError, TypeError):
                    pass
        return row

    _EXP_COLS = (
        "be.id::text, be.name, be.description, be.hypothesis, be.status, be.metric_primary, "
        "be.targeting, be.variations, be.traffic_split, be.winner, be.started_at, be.stopped_at, be.created_at, "
        "be.experiment_policy, be.experiment_arms, be.targeting_segments, be.targeting_channels, "
        "be.synthetic_data_enabled, be.synthetic_data_count, "
        "(SELECT COUNT(*) FROM decision_logs dl WHERE dl.bandit_experiment_id = be.id) AS decisions_count"
    )

    async def list_experiments(self, status: str | None = None) -> list[dict[str, Any]]:
        where = "WHERE be.status = $1" if status else ""
        params = [status] if status else []
        rows = await self._pool.fetch(
            f"SELECT {self._EXP_COLS} FROM bandit_experiments be {where} ORDER BY be.created_at DESC",
            *params,
        )
        return [self._parse_exp_row(dict(r)) for r in rows]

    async def get_experiment(self, exp_id: str) -> dict[str, Any] | None:
        row = await self._pool.fetchrow(
            f"SELECT {self._EXP_COLS} FROM bandit_experiments be WHERE be.id = $1",
            exp_id,
        )
        return self._parse_exp_row(dict(row)) if row else None

    async def get_running_experiments(self) -> list[dict[str, Any]]:
        """Return running experiments ordered most-specific first (most targeting filters win).

        Uses a lightweight SELECT without the decisions_count correlated subquery to avoid
        lock contention when many reward updates are happening concurrently.
        """
        rows = await self._pool.fetch(
            """
            SELECT
                id::text, name, status, experiment_policy, experiment_arms,
                targeting_segments, targeting_channels
            FROM bandit_experiments
            WHERE status = 'running'
            ORDER BY
                COALESCE(array_length(targeting_segments, 1), 0) DESC,
                COALESCE(array_length(targeting_channels, 1), 0) DESC,
                created_at DESC
            """
        )
        return [dict(r) for r in rows]

    async def create_experiment(self, data: dict[str, Any]) -> dict[str, Any]:
        row = await self._pool.fetchrow(
            """
            INSERT INTO bandit_experiments
                (name, description, hypothesis, metric_primary, targeting,
                 experiment_policy, experiment_arms, targeting_segments, targeting_channels,
                 synthetic_data_enabled)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
            RETURNING id::text, name, description, status, created_at,
                      experiment_policy, experiment_arms, targeting_segments, targeting_channels,
                      synthetic_data_enabled, synthetic_data_count
            """,
            data["name"],
            data.get("description", ""),
            data.get("hypothesis", ""),
            data.get("metric_primary", "avg_reward"),
            json.dumps(data.get("targeting", {})),
            data.get("experiment_policy", "contextual_thompson"),
            data.get("experiment_arms", []),
            data.get("targeting_segments", []),
            data.get("targeting_channels", []),
            data.get("synthetic_data_enabled", False),
        )
        return dict(row)

    async def bulk_insert_synthetic_decisions(
        self,
        exp_id: str,
        records: list[tuple[str, str, str, str, bool, str, str, str, float]],
    ) -> int:
        """Bulk insert synthetic decision_logs rows for an experiment.

        Each record: (decision_id, policy_name, arm_selected, context_features_json,
                      is_exploration, session_id, bandit_experiment_id, variation_id, reward)
        Returns the number of rows inserted.
        """
        await self._pool.executemany(
            """
            INSERT INTO decision_logs
                (decision_id, policy_name, arm_selected, context_features,
                 is_exploration, session_id, bandit_experiment_id, variation_id, reward)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
            ON CONFLICT (decision_id) DO NOTHING
            """,
            records,
        )
        await self._pool.execute(
            """
            UPDATE bandit_experiments
            SET synthetic_data_count = synthetic_data_count + $1
            WHERE id = $2
            """,
            len(records),
            exp_id,
        )
        return len(records)

    async def delete_experiment(self, exp_id: str) -> bool:
        """Delete an experiment and nullify its FK in decision_logs (preserves log rows)."""
        await self._pool.execute(
            "UPDATE decision_logs SET bandit_experiment_id = NULL WHERE bandit_experiment_id = $1",
            exp_id,
        )
        result = await self._pool.execute(
            "DELETE FROM bandit_experiments WHERE id = $1", exp_id
        )
        return result == "DELETE 1"

    async def update_experiment_status(self, exp_id: str, status: str, winner: str | None = None) -> dict[str, Any] | None:
        ts_col = "started_at = now()," if status == "running" else ("stopped_at = now()," if status == "stopped" else "")
        row = await self._pool.fetchrow(
            f"""
            UPDATE bandit_experiments
            SET status = $1, {ts_col} winner = $2, updated_at = now()
            WHERE id = $3
            RETURNING id::text, name, status, winner, started_at, stopped_at
            """,
            status, winner, exp_id,
        )
        return dict(row) if row else None

    async def get_experiment_decisions(self, exp_id: str) -> list[dict[str, Any]]:
        """Per-arm performance for an experiment (grouped by arm_selected)."""
        rows = await self._pool.fetch(
            """
            SELECT arm_selected AS variation_id,
                   COUNT(*) AS n,
                   COUNT(reward) FILTER (WHERE reward IS NOT NULL) AS rewarded,
                   COALESCE(SUM(reward), 0) AS total_reward,
                   COALESCE(AVG(reward), 0) AS avg_reward,
                   COUNT(*) FILTER (WHERE is_exploration) AS explorations
            FROM decision_logs
            WHERE bandit_experiment_id = $1
            GROUP BY arm_selected
            ORDER BY avg_reward DESC
            """,
            exp_id,
        )
        return [dict(r) for r in rows]

    async def get_analytics_funnel(self) -> list[dict[str, Any]]:
        rows = await self._pool.fetch(
            """
            SELECT
                policy_name,
                COUNT(*)                                              AS total_decisions,
                COUNT(reward)                                         AS with_reward,
                COALESCE(SUM(reward), 0)                              AS conversions,
                ROUND(COALESCE(AVG(reward), 0)::numeric, 4)          AS conversion_rate,
                COUNT(*) FILTER (WHERE is_exploration)                AS explorations,
                ROUND((COUNT(*) FILTER (WHERE is_exploration)::numeric / NULLIF(COUNT(*), 0)), 4) AS exploration_rate
            FROM decision_logs
            GROUP BY policy_name
            ORDER BY conversion_rate DESC
            """
        )
        return [dict(r) for r in rows]

    async def get_cohort_weekly(self) -> list[dict[str, Any]]:
        rows = await self._pool.fetch(
            """
            SELECT
                date_trunc('week', timestamp)                    AS week,
                policy_name,
                COUNT(*)                                         AS decisions,
                ROUND(COALESCE(AVG(reward), 0)::numeric, 4)     AS avg_reward
            FROM decision_logs
            WHERE reward IS NOT NULL
            GROUP BY week, policy_name
            ORDER BY week, policy_name
            """
        )
        return [{"week": r["week"].isoformat(), "policy_name": r["policy_name"], "decisions": r["decisions"], "avg_reward": float(r["avg_reward"])} for r in rows]

    async def get_segment_arm_heatmap(self) -> list[dict[str, Any]]:
        rows = await self._pool.fetch(
            """
            SELECT
                REPLACE(context_features->>'_segment', 'age_', '') AS segment,
                arm_selected                                        AS arm,
                COUNT(*)                                            AS decisions,
                ROUND(COALESCE(AVG(reward), 0)::numeric, 4)        AS avg_reward
            FROM decision_logs
            WHERE reward IS NOT NULL
              AND context_features->>'_segment' IS NOT NULL
            GROUP BY segment, arm
            ORDER BY segment, avg_reward DESC
            """
        )
        return [
            {
                "segment":   r["segment"],
                "arm":       r["arm"],
                "decisions": int(r["decisions"]),
                "avg_reward": float(r["avg_reward"] or 0),
            }
            for r in rows
        ]

    async def get_fairness_data(self) -> dict[str, Any]:
        rows = await self._pool.fetch(
            """
            WITH base AS (
                SELECT
                    COALESCE(context_features->>'_segment', 'unknown') AS segment,
                    arm_selected,
                    COUNT(*)                                            AS n,
                    ROUND(AVG(COALESCE(reward, 0))::numeric, 4)        AS avg_reward
                FROM decision_logs
                GROUP BY segment, arm_selected
            ),
            totals AS (
                SELECT segment, SUM(n) AS segment_total
                FROM base GROUP BY segment
            ),
            grand AS (
                SELECT SUM(n) AS grand_total FROM base
            )
            SELECT
                b.segment,
                b.arm_selected,
                b.n,
                b.avg_reward,
                t.segment_total,
                g.grand_total,
                ROUND((t.segment_total::numeric / NULLIF(g.grand_total, 0)) * 100, 2) AS segment_pct,
                ROUND((b.n::numeric / NULLIF(t.segment_total, 0)) * 100, 2)            AS arm_pct
            FROM base b
            JOIN totals t ON b.segment = t.segment
            CROSS JOIN grand g
            ORDER BY segment_pct DESC, arm_pct DESC
            """
        )

        segments: dict[str, dict] = {}
        for r in rows:
            seg = r["segment"]
            if seg not in segments:
                segments[seg] = {
                    "segment": seg,
                    "decisions": int(r["segment_total"]),
                    "pct": float(r["segment_pct"] or 0),
                    "avg_reward": float(r["avg_reward"] or 0),
                    "arm_exposure": {},
                }
            segments[seg]["arm_exposure"][r["arm_selected"]] = float(r["arm_pct"] or 0)

        seg_list = list(segments.values())
        total = int(rows[0]["grand_total"]) if rows else 0

        hhi = sum((s["pct"] / 100) ** 2 for s in seg_list) if seg_list else 0.0

        alerts = []
        for s in seg_list:
            if s["pct"] < 10:
                alerts.append({
                    "severity": "warning",
                    "segment": s["segment"],
                    "message": f"Sub-representado ({s['pct']:.1f}%)",
                    "pct": s["pct"],
                })
            elif s["pct"] > 80:
                alerts.append({
                    "severity": "critical",
                    "segment": s["segment"],
                    "message": f"Dominante ({s['pct']:.1f}%)",
                    "pct": s["pct"],
                })

        return {
            "total_decisions": total,
            "segments": seg_list,
            "concentration_index": round(hhi, 4),
            "alerts": alerts,
        }


def get_postgres_client() -> PostgresClient:
    return PostgresClient(get_pool())
