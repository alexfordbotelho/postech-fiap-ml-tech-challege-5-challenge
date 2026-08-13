from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING
from uuid import UUID

from aiokafka import AIOKafkaProducer

from src.config import settings

if TYPE_CHECKING:
    from src.policies.base import DecisionContext, PolicyDecision
    from src.storage.postgres import PostgresClient

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None


def _parse_eventhubs_conn_str(conn_str: str) -> tuple[str, dict]:
    """Convert an Azure Event Hubs connection string to aiokafka SASL_SSL kwargs."""
    import ssl as _ssl
    params: dict[str, str] = {}
    for part in conn_str.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            params[k.strip()] = v.strip()
    host = params.get("Endpoint", "").replace("sb://", "").rstrip("/")
    ssl_ctx = _ssl.create_default_context()
    return f"{host}:9093", {
        "security_protocol": "SASL_SSL",
        "ssl_context": ssl_ctx,
        "sasl_mechanism": "PLAIN",
        "sasl_plain_username": "$ConnectionString",
        "sasl_plain_password": conn_str,
    }


async def create_producer() -> AIOKafkaProducer:
    global _producer
    bootstrap = settings.kafka_bootstrap_servers
    extra: dict = {}
    if "Endpoint=sb://" in bootstrap or "servicebus.windows.net" in bootstrap:
        bootstrap, extra = _parse_eventhubs_conn_str(bootstrap)
    _producer = AIOKafkaProducer(
        bootstrap_servers=bootstrap,
        value_serializer=lambda v: v if isinstance(v, bytes) else v.encode(),
        **extra,
    )
    await _producer.start()
    return _producer


async def close_producer() -> None:
    if _producer:
        await _producer.stop()


def get_producer() -> AIOKafkaProducer:
    if _producer is None:
        raise RuntimeError("Kafka producer not initialized")
    return _producer


class AuditLogger:
    def __init__(self, pg: PostgresClient, producer: AIOKafkaProducer) -> None:
        self._pg = pg
        self._producer = producer

    async def log_decision(
        self,
        decision_id: UUID,
        context: DecisionContext,
        decision: PolicyDecision,
        channel: str = "web",
        bandit_experiment_id: str | None = None,
        flag_snapshot: dict | None = None,
    ) -> None:
        record = {
            "decision_id": str(decision_id),
            "policy_name": decision.policy_name,
            "arm_selected": decision.arm_id,
            "context_features": context.features,
            "is_exploration": decision.is_exploration,
            "session_id": context.session_id,
            "segment": decision.segment,
            "channel": channel,
            "bandit_experiment_id": bandit_experiment_id,
            "flag_snapshot": json.dumps(flag_snapshot or {}),
        }
        await self._pg.insert_decision_log(record)
        asyncio.create_task(self._send_kafka(record))
        if settings.use_kusto:
            asyncio.create_task(self._send_kusto(record))

    async def _send_kafka(self, record: dict) -> None:
        try:
            payload = json.dumps(record).encode()
            await self._producer.send_and_wait(
                topic=settings.kafka_topic,
                value=payload,
                key=record["decision_id"].encode(),
            )
        except Exception:
            logger.warning("Kafka audit send failed — decision still persisted to PostgreSQL")

    async def _send_kusto(self, record: dict) -> None:
        """Write event directly to ADX flag_events (Azure mode only)."""
        try:
            import datetime as _dt

            from azure.identity import ManagedIdentityCredential
            from azure.kusto.data import KustoClient, KustoConnectionStringBuilder

            credential = ManagedIdentityCredential(
                client_id=settings.kusto_msi_client_id or None
            )
            kcsb = KustoConnectionStringBuilder.with_azure_token_credential(
                settings.kusto_cluster_uri,
                credential,
            )

            flag_snap = record.get("flag_snapshot", "{}")
            flag_snap_kql = flag_snap.replace("\\", "\\\\").replace('"', '\\"')
            is_expl = "true" if record.get("is_exploration") else "false"
            reward = float(record.get("reward") or 0.0)
            ts = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

            kql = (
                ".set-or-append async flag_events <| "
                "datatable(_d:string,_p:string,_a:string,_r:real,_e:bool,_s:string,_c:string,_f:string,_ts:datetime) [\n"
                f'  "{record["decision_id"]}", "{record["policy_name"]}", "{record["arm_selected"]}", '
                f'  {reward}, {is_expl}, "{record.get("segment", "default")}", '
                f'  "{record.get("channel", "web")}", "{flag_snap_kql}", datetime("{ts}")\n'
                "]\n"
                "| project decision_id=_d, policy_name=_p, arm_selected=_a, reward=_r, "
                "is_exploration=_e, segment=_s, channel=_c, flag_snapshot=parse_json(_f), timestamp=_ts"
            )

            def _run() -> None:
                KustoClient(kcsb).execute_mgmt(settings.kusto_database, kql)

            await asyncio.to_thread(_run)
        except Exception as exc:
            logger.warning("ADX audit send failed: %s", exc)


def get_audit_logger() -> AuditLogger:
    from src.storage.postgres import get_postgres_client

    return AuditLogger(pg=get_postgres_client(), producer=get_producer())
