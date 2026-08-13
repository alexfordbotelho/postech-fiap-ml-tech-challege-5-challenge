"""Contextual Thompson Sampling — Beta-Binomial conjugate prior per segment.

State structure:
  alpha[segment][arm] = successes + 1   (Beta prior α)
  beta_[segment][arm] = failures  + 1   (Beta prior β)

Each segment maintains an independent set of arm distributions, so the policy
learns different arm preferences for young vs. senior_high_edu vs. mid_indebted, etc.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from src.data.segmentation import SEGMENTS, classify_segment
from .base import BanditPolicy, DecisionContext, PolicyDecision


def _init_segment(arms: list[str]) -> dict[str, float]:
    return {arm: 1.0 for arm in arms}


@dataclass
class ContextualThompsonPolicy(BanditPolicy):
    arms: list[str]
    # {segment: {arm: alpha}}
    alpha: dict[str, dict[str, float]] = field(default_factory=dict)
    # {segment: {arm: beta}}
    beta_: dict[str, dict[str, float]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for seg in SEGMENTS:
            self.alpha.setdefault(seg, _init_segment(self.arms))
            self.beta_.setdefault(seg, _init_segment(self.arms))

    def _ensure_segment(self, seg: str) -> None:
        self.alpha.setdefault(seg, _init_segment(self.arms))
        self.beta_.setdefault(seg, _init_segment(self.arms))

    def select_arm(self, context: DecisionContext, arms: list[str]) -> PolicyDecision:
        seg = classify_segment(context.features)
        self._ensure_segment(seg)

        samples = {
            arm: float(
                np.random.beta(
                    self.alpha[seg].get(arm, 1.0),
                    self.beta_[seg].get(arm, 1.0),
                )
            )
            for arm in arms
        }
        best_arm = max(samples, key=samples.__getitem__)
        sorted_vals = sorted(samples.values(), reverse=True)
        is_exploration = len(sorted_vals) > 1 and (sorted_vals[0] - sorted_vals[1]) < 0.05

        return PolicyDecision(
            arm_id=best_arm,
            confidence=samples[best_arm],
            is_exploration=is_exploration,
            policy_name="contextual_thompson",
            segment=seg,
        )

    def update(self, arm_id: str, reward: float, segment: str = "default") -> None:
        self._ensure_segment(segment)
        self.alpha[segment].setdefault(arm_id, 1.0)
        self.beta_[segment].setdefault(arm_id, 1.0)
        if reward > 0:
            self.alpha[segment][arm_id] += reward
        else:
            self.beta_[segment][arm_id] += 1.0

    def get_state(self) -> dict[str, Any]:
        return {
            "policy": "contextual_thompson",
            "alpha": {s: dict(a) for s, a in self.alpha.items()},
            "beta": {s: dict(b) for s, b in self.beta_.items()},
        }

    def load_state(self, state: dict[str, Any]) -> None:
        self.alpha = state.get("alpha", {})
        self.beta_ = state.get("beta", {})
        for seg in SEGMENTS:
            self._ensure_segment(seg)
