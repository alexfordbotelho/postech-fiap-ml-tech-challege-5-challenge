"""Kafka consumer: reads offer-events → writes to ClickHouse datathon.events + flag_events.

Runs as a standalone process: python -m src.logging.kafka_consumer
"""
from __future__ import annotations

import asyncio
import json
import logging
import signal

from aiokafka import AIOKafkaConsumer
from clickhouse_driver import Client as ChClient

from src.config import settings

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100
_FLUSH_INTERVAL = 5.0  # seconds


def _ch_client() -> ChClient:
    return ChClient(
        host=settings.clickhouse_native_host,
        port=settings.clickhouse_native_port,
        database=settings.clickhouse_db,
        connect_timeout=10,
        send_receive_timeout=30,
    )


def _insert_batch(records: list[dict]) -> None:
    if not records:
        return

    events_rows = [
        (
            r.get("decision_id", ""),
            r.get("policy_name", ""),
            r.get("arm_selected", ""),
            r.get("reward"),
            1 if r.get("is_exploration") else 0,
            r.get("session_id", ""),
            r.get("segment", "default"),
            r.get("channel", "web"),
        )
        for r in records
    ]

    flag_rows = [
        (
            r.get("decision_id", ""),
            r.get("policy_name", ""),
            r.get("arm_selected", ""),
            r.get("reward"),
            1 if r.get("is_exploration") else 0,
            r.get("segment", "default"),
            r.get("channel", "web"),
            r.get("flag_snapshot", "{}"),
        )
        for r in records
    ]

    client = _ch_client()
    try:
        client.execute(
            "INSERT INTO datathon.events "
            "(decision_id, policy_name, arm_selected, reward, is_exploration, "
            "session_id, segment, channel) VALUES",
            events_rows,
        )
        client.execute(
            "INSERT INTO datathon.flag_events "
            "(decision_id, policy_name, arm_selected, reward, is_exploration, "
            "segment, channel, flag_snapshot) VALUES",
            flag_rows,
        )
        logger.info("clickhouse_batch_inserted count=%d", len(records))
    except Exception as exc:
        logger.error("clickhouse_insert_failed error=%s", exc)
    finally:
        client.disconnect()


async def _consume() -> None:
    consumer = AIOKafkaConsumer(
        settings.kafka_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id="clickhouse-consumer",
        auto_offset_reset="earliest",
        enable_auto_commit=True,
    )
    await consumer.start()
    logger.info("kafka_consumer_started topic=%s", settings.kafka_topic)

    batch: list[dict] = []
    last_flush = asyncio.get_event_loop().time()

    try:
        async for msg in consumer:
            try:
                if not msg.value:
                    continue
                record = json.loads(msg.value)
                batch.append(record)
            except Exception as exc:
                logger.warning("kafka_message_parse_failed error=%s", exc)
                continue

            now = asyncio.get_event_loop().time()
            if len(batch) >= _BATCH_SIZE or (now - last_flush) >= _FLUSH_INTERVAL:
                await asyncio.to_thread(_insert_batch, batch)
                batch.clear()
                last_flush = now
    finally:
        if batch:
            await asyncio.to_thread(_insert_batch, batch)
        await consumer.stop()
        logger.info("kafka_consumer_stopped")


def main() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def _shutdown(sig: signal.Signals) -> None:
        logger.info("shutdown signal=%s", sig.name)
        for task in asyncio.all_tasks(loop):
            task.cancel()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _shutdown, sig)

    try:
        loop.run_until_complete(_consume())
    except asyncio.CancelledError:
        pass
    finally:
        loop.close()


if __name__ == "__main__":
    main()
