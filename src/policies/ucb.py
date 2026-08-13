import math
from dataclasses import dataclass, field
from typing import Any

from .base import BanditPolicy, DecisionContext, PolicyDecision


@dataclass
class UCB1Policy(BanditPolicy):
    arms: list[str]
    c: float = 1.414  # √2 exploration parameter (UCB1)
    counts: dict[str, int] = field(default_factory=dict)
    values: dict[str, float] = field(default_factory=dict)
    total_pulls: int = 0

    def __post_init__(self) -> None:
        for arm in self.arms:
            self.counts.setdefault(arm, 0)
            self.values.setdefault(arm, 0.0)

    def _ucb_score(self, arm: str) -> float:
        if self.counts.get(arm, 0) == 0:
            return float("inf")  # force exploration of unseen arms first
        return self.values[arm] + self.c * math.sqrt(
            math.log(self.total_pulls) / self.counts[arm]
        )

    def select_arm(self, context: DecisionContext, arms: list[str]) -> PolicyDecision:
        scores = {arm: self._ucb_score(arm) for arm in arms}
        best_arm = max(scores, key=scores.__getitem__)
        avg_value = sum(self.values.values()) / max(len(self.values), 1)
        is_exploration = self.values.get(best_arm, 0.0) <= avg_value
        confidence = scores[best_arm] if scores[best_arm] != float("inf") else 1.0
        return PolicyDecision(
            arm_id=best_arm,
            confidence=min(confidence, 1.0),
            is_exploration=is_exploration,
            policy_name="ucb",
        )

    def update(self, arm_id: str, reward: float, segment: str = "default") -> None:
        if arm_id not in self.counts:
            self.counts[arm_id] = 0
            self.values[arm_id] = 0.0
        self.counts[arm_id] += 1
        self.total_pulls += 1
        n = self.counts[arm_id]
        self.values[arm_id] += (reward - self.values[arm_id]) / n

    def get_state(self) -> dict[str, Any]:
        return {
            "counts": dict(self.counts),
            "values": dict(self.values),
            "total_pulls": self.total_pulls,
        }

    def load_state(self, state: dict[str, Any]) -> None:
        self.counts = state.get("counts", {})
        self.values = state.get("values", {})
        self.total_pulls = state.get("total_pulls", 0)
