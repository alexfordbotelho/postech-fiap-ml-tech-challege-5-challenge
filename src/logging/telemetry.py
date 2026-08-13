"""OpenTelemetry setup — sends traces to HyperDX via OTLP HTTP."""
from __future__ import annotations

import logging

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def setup_telemetry(otlp_endpoint: str, service_name: str = "datathon-bandit-api") -> None:
    resource = Resource.create({
        "service.name": service_name,
        "service.version": "0.1.0",
        "deployment.environment": "local",
    })

    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=f"{otlp_endpoint}/v1/traces")
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    # Add trace_id/span_id to any Python stdlib logging records
    LoggingInstrumentor().instrument(set_logging_format=True)
    logging.basicConfig(level=logging.INFO)
