from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DecisionResult:
    decision_id: str
    offer_id: str
    policy: str
    confidence: float
    is_exploration: bool
    segment: str


@dataclass
class FlagRule:
    condition: dict[str, Any]
    value: Any


@dataclass
class FlagPayload:
    flag_key: str
    flag_type: str
    default_value: Any
    rules: list[FlagRule] = field(default_factory=list)
    enabled: bool = True


def _matches_rule(condition: dict[str, Any], context: dict[str, Any]) -> bool:
    for key, spec in condition.items():
        ctx_val = context.get(key)
        if isinstance(spec, dict):
            if "$eq" in spec and ctx_val != spec["$eq"]:
                return False
            if "$ne" in spec and ctx_val == spec["$ne"]:
                return False
            if "$in" in spec and ctx_val not in spec["$in"]:
                return False
            if "$nin" in spec and ctx_val in spec["$nin"]:
                return False
            if "$gt" in spec and not (ctx_val is not None and ctx_val > spec["$gt"]):
                return False
            if "$gte" in spec and not (ctx_val is not None and ctx_val >= spec["$gte"]):
                return False
            if "$lt" in spec and not (ctx_val is not None and ctx_val < spec["$lt"]):
                return False
            if "$lte" in spec and not (ctx_val is not None and ctx_val <= spec["$lte"]):
                return False
            if "$regex" in spec:
                if ctx_val is None or not re.search(spec["$regex"], str(ctx_val)):
                    return False
        else:
            if ctx_val != spec:
                return False
    return True


def evaluate_flag(payload: FlagPayload, context: dict[str, Any]) -> Any:
    if not payload.enabled:
        return payload.default_value
    for rule in payload.rules:
        if not rule.condition or _matches_rule(rule.condition, context):
            return rule.value
    return payload.default_value
