"""Suitability pre-filter: removes arms that violate client eligibility rules.

Rules follow a conservative interpretation of financial suitability:
- Premium products require minimum balance
- Loan products are blocked for already heavily-indebted clients
- Long-term deposits require minimum age

At least one arm is always returned (fallback = first arm in catalog) so
the bandit can always make a decision even for constrained profiles.
"""
from __future__ import annotations

from typing import Callable

_RULES: dict[str, Callable[[dict], bool]] = {
    "premium_savings": lambda f: float(f.get("balance", 0)) >= 2000,
    "term_deposit_12m": lambda f: int(f.get("age", 35)) >= 25,
    "personal_loan": lambda f: not (
        f.get("housing", "no") == "yes" and f.get("loan", "no") == "yes"
    ),
}


def filter_arms(arms: list[str], features: dict) -> list[str]:
    """Return subset of arms eligible for this client.

    Never returns an empty list — at least the first arm is always kept
    as a safe fallback (savings_account by convention).
    """
    eligible = [
        arm for arm in arms
        if _RULES.get(arm, lambda _: True)(features)
    ]
    return eligible if eligible else [arms[0]]
