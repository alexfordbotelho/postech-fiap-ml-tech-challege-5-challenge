"""Feature flag evaluation engine.

Rules are evaluated in order; first match wins. Each rule has:
  condition: dict of {attribute: value_or_operator_dict}
  value:     the flag value to return when condition matches

Supported operators inside condition values:
  Plain value   → equality   e.g. {"segment": "young"}
  {"$eq": v}    → equality
  {"$ne": v}    → not equal
  {"$in": [...]}→ membership
  {"$nin":[...]}→ not in
  {"$gt": v}    → greater than  (numbers)
  {"$lt": v}    → less than     (numbers)
  {"$gte": v}   → >=
  {"$lte": v}   → <=
  {"$regex": v} → regex match   (strings)
"""
from __future__ import annotations

import json
import re
from typing import Any


def evaluate_flag(flag: dict, context: dict) -> Any:
    """Return the flag value for the given context dict.

    Falls back to flag['default_value'] if no rule matches or flag is disabled.
    """
    if not flag.get("enabled", True):
        return _parse(flag.get("default_value"))

    for rule in flag.get("rules", []):
        condition = rule.get("condition", {})
        if not condition or _matches(condition, context):
            return _parse(rule.get("value"))

    return _parse(flag.get("default_value"))


def _parse(raw: Any) -> Any:
    """JSONB comes back as string from asyncpg; parse if needed."""
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return raw
    return raw


def _matches(condition: dict, context: dict) -> bool:
    return all(_eval_attr(attr, ops, context) for attr, ops in condition.items())


def _eval_attr(attr: str, ops: Any, context: dict) -> bool:
    actual = context.get(attr)
    if not isinstance(ops, dict):
        # Plain equality
        return actual == ops
    for op, expected in ops.items():
        if not _eval_op(op, actual, expected):
            return False
    return True


def _eval_op(op: str, actual: Any, expected: Any) -> bool:
    match op:
        case "$eq":
            return actual == expected
        case "$ne":
            return actual != expected
        case "$in":
            return actual in expected
        case "$nin":
            return actual not in expected
        case "$gt":
            return actual is not None and actual > expected
        case "$lt":
            return actual is not None and actual < expected
        case "$gte":
            return actual is not None and actual >= expected
        case "$lte":
            return actual is not None and actual <= expected
        case "$regex":
            return bool(re.search(expected, str(actual or "")))
        case _:
            return False
