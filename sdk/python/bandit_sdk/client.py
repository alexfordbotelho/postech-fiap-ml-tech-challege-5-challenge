from __future__ import annotations

import time
from typing import Any
from urllib.request import Request, urlopen
import json

from .models import DecisionResult, FlagPayload, FlagRule, evaluate_flag


class BanditClient:
    """Lightweight HTTP client for the Bandit API.

    Requires no third-party dependencies — uses only the Python standard library.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8001",
        flag_ttl: int = 60,
        timeout: int = 5,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._ttl = flag_ttl
        self._timeout = timeout
        self._flag_cache: dict[str, FlagPayload] = {}
        self._flag_cache_ts: float = 0.0

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _post(self, path: str, body: dict[str, Any]) -> Any:
        data = json.dumps(body).encode()
        req = Request(
            f"{self._base}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=self._timeout) as resp:
            return json.loads(resp.read())

    def _get(self, path: str) -> Any:
        req = Request(f"{self._base}{path}", headers={"Accept": "application/json"})
        with urlopen(req, timeout=self._timeout) as resp:
            return json.loads(resp.read())

    # ── Flag cache ────────────────────────────────────────────────────────────

    def _refresh_flags(self) -> None:
        payload = self._get("/flags/sdk/payload")
        flags: dict[str, Any] = payload.get("flags", {})
        self._flag_cache = {
            key: FlagPayload(
                flag_key=key,
                flag_type=data.get("flag_type", "string"),
                default_value=data.get("default_value"),
                rules=[
                    FlagRule(condition=r.get("condition", {}), value=r.get("value"))
                    for r in (data.get("rules") or [])
                ],
                enabled=data.get("enabled", True),
            )
            for key, data in flags.items()
        }
        self._flag_cache_ts = time.time()

    def _get_flags(self) -> dict[str, FlagPayload]:
        if time.time() - self._flag_cache_ts > self._ttl:
            self._refresh_flags()
        return self._flag_cache

    # ── Public API ────────────────────────────────────────────────────────────

    def decide(
        self,
        features: dict[str, Any],
        policy: str | None = None,
        channel: str = "web",
        arms: list[str] | None = None,
        session_id: str | None = None,
    ) -> DecisionResult:
        body: dict[str, Any] = {"features": features, "channel": channel}
        if policy:
            body["policy"] = policy
        if arms:
            body["arms"] = arms
        if session_id:
            body["session_id"] = session_id
        raw = self._post("/decide/", body)
        return DecisionResult(
            decision_id=raw["decision_id"],
            offer_id=raw["offer_id"],
            policy=raw["policy"],
            confidence=raw["confidence"],
            is_exploration=raw["is_exploration"],
            segment=raw["segment"],
        )

    def reward(self, decision_id: str, reward: float) -> dict[str, Any]:
        return self._post("/reward/", {"decision_id": decision_id, "reward": reward})  # type: ignore[return-value]

    def evaluate_flag(self, flag_key: str, context: dict[str, Any]) -> Any:
        flags = self._get_flags()
        if flag_key not in flags:
            return None
        return evaluate_flag(flags[flag_key], context)

    def get_flag_payload(self) -> dict[str, FlagPayload]:
        return self._get_flags()
