from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class DecisionContext:
    session_id: str
    features: dict[str, Any]


@dataclass
class PolicyDecision:
    arm_id: str
    confidence: float
    is_exploration: bool
    policy_name: str
    segment: str = "default"


class BanditPolicy(ABC):
    @abstractmethod
    def select_arm(self, context: DecisionContext, arms: list[str]) -> PolicyDecision: ...

    @abstractmethod
    def update(self, arm_id: str, reward: float, segment: str = "default") -> None: ...

    @abstractmethod
    def get_state(self) -> dict[str, Any]: ...

    @abstractmethod
    def load_state(self, state: dict[str, Any]) -> None: ...
