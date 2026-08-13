from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .base import BanditPolicy, DecisionContext, PolicyDecision


@dataclass
class ThompsonSamplingPolicy(BanditPolicy):
    arms: list[str]
    alpha: dict[str, float] = field(default_factory=dict)  # successes + 1
    beta_: dict[str, float] = field(default_factory=dict)  # failures + 1

    def __post_init__(self) -> None:
        for arm in self.arms:
            self.alpha.setdefault(arm, 1.0)
            self.beta_.setdefault(arm, 1.0)

    def select_arm(self, context: DecisionContext, arms: list[str]) -> PolicyDecision:
        samples = {
            arm: float(np.random.beta(self.alpha.get(arm, 1.0), self.beta_.get(arm, 1.0)))
            for arm in arms
        }
        best_arm = max(samples, key=samples.__getitem__)
        sorted_vals = sorted(samples.values(), reverse=True)
        is_exploration = len(sorted_vals) > 1 and (sorted_vals[0] - sorted_vals[1]) < 0.05
        return PolicyDecision(
            arm_id=best_arm,
            confidence=samples[best_arm],
            is_exploration=is_exploration,
            policy_name="thompson",
        )

    def update(self, arm_id: str, reward: float, segment: str = "default") -> None:
        if arm_id not in self.alpha:
            self.alpha[arm_id] = 1.0
            self.beta_[arm_id] = 1.0
        if reward > 0:
            self.alpha[arm_id] += reward
        else:
            self.beta_[arm_id] += 1.0

    def get_state(self) -> dict[str, Any]:
        return {"alpha": dict(self.alpha), "beta": dict(self.beta_)}

    def load_state(self, state: dict[str, Any]) -> None:
        self.alpha = state.get("alpha", {})
        self.beta_ = state.get("beta", {})
