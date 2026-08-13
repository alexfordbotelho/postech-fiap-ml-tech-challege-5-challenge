"""Contextual UCB1 — Upper Confidence Bound per segment.

State structure:
  counts[segment][arm]      = number of pulls
  values[segment][arm]      = running average reward
  total_pulls[segment]      = total pulls for this segment

Each segment has independent counts and value estimates, so the UCB exploration
bonus is calibrated per-segment rather than globally.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from src.data.segmentation import SEGMENTS, classify_segment
from .base import BanditPolicy, DecisionContext, PolicyDecision


def _init_counts(arms: list[str]) -> dict[str, int]:
    return {arm: 0 for arm in arms}


def _init_values(arms: list[str]) -> dict[str, float]:
    return {arm: 0.0 for arm in arms}


@dataclass
class ContextualUCBPolicy(BanditPolicy):
    arms: list[str]
    c: float = 1.414
    counts: dict[str, dict[str, int]] = field(default_factory=dict)
    values: dict[str, dict[str, float]] = field(default_factory=dict)
    total_pulls: dict[str, int] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for seg in SEGMENTS:
            self._ensure_segment(seg)

    def _ensure_segment(self, seg: str) -> None:
        self.counts.setdefault(seg, _init_counts(self.arms))
        self.values.setdefault(seg, _init_values(self.arms))
        self.total_pulls.setdefault(seg, 0)

    def _ucb_score(self, seg: str, arm: str) -> float:
        n = self.counts[seg].get(arm, 0)
        t = self.total_pulls.get(seg, 0)
        if n == 0:
            return float("inf")
        return self.values[seg][arm] + self.c * math.sqrt(math.log(t) / n)

    def select_arm(self, context: DecisionContext, arms: list[str]) -> PolicyDecision:
        seg = classify_segment(context.features)
        self._ensure_segment(seg)

        scores = {arm: self._ucb_score(seg, arm) for arm in arms}
        best_arm = max(scores, key=scores.__getitem__)
        avg_value = sum(self.values[seg].values()) / max(len(self.values[seg]), 1)
        is_exploration = self.values[seg].get(best_arm, 0.0) <= avg_value
        raw_confidence = scores[best_arm]
        confidence = 1.0 if raw_confidence == float("inf") else min(raw_confidence, 1.0)

        return PolicyDecision(
            arm_id=best_arm,
            confidence=confidence,
            is_exploration=is_exploration,
            policy_name="contextual_ucb",
            segment=seg,
        )

    def update(self, arm_id: str, reward: float, segment: str = "default") -> None:
        self._ensure_segment(segment)
        self.counts[segment].setdefault(arm_id, 0)
        self.values[segment].setdefault(arm_id, 0.0)
        self.counts[segment][arm_id] += 1
        self.total_pulls[segment] += 1
        n = self.counts[segment][arm_id]
        self.values[segment][arm_id] += (reward - self.values[segment][arm_id]) / n

    def get_state(self) -> dict[str, Any]:
        return {
            "policy": "contextual_ucb",
            "counts": {s: dict(c) for s, c in self.counts.items()},
            "values": {s: dict(v) for s, v in self.values.items()},
            "total_pulls": dict(self.total_pulls),
        }

    def load_state(self, state: dict[str, Any]) -> None:
        self.counts = state.get("counts", {})
        self.values = state.get("values", {})
        self.total_pulls = state.get("total_pulls", {})
        for seg in SEGMENTS:
            self._ensure_segment(seg)
