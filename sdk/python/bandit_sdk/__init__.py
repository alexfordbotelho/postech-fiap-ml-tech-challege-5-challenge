"""Bandit SDK — client for the Datathon adaptive offers API.

Usage:
    from bandit_sdk import BanditClient

    client = BanditClient(base_url="http://localhost:8001")

    # Decide which offer to show
    decision = client.decide(
        features={"age": 28, "balance": 1200, "education": "secondary"},
        channel="web",
    )
    print(decision.offer_id, decision.segment)

    # Record conversion
    client.reward(decision_id=decision.decision_id, reward=1.0)

    # Evaluate a feature flag locally
    value = client.evaluate_flag("active_policy", context={"segment": "young"})
"""

from .client import BanditClient
from .models import DecisionResult, FlagPayload

__all__ = ["BanditClient", "DecisionResult", "FlagPayload"]
