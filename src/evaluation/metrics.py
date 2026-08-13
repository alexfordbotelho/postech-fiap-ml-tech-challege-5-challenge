from __future__ import annotations

import numpy as np


def cumulative_reward(rewards: list[float]) -> float:
    return float(np.sum(rewards))


def average_reward(rewards: list[float]) -> float:
    return float(np.mean(rewards)) if rewards else 0.0


def regret(rewards: list[float], oracle_rewards: list[float]) -> float:
    """Cumulative regret: sum of gaps between oracle and policy reward."""
    return float(np.sum(np.array(oracle_rewards) - np.array(rewards)))


def exploration_rate(is_exploration_flags: list[bool]) -> float:
    if not is_exploration_flags:
        return 0.0
    return sum(is_exploration_flags) / len(is_exploration_flags)


def arm_distribution(arms_selected: list[str], catalog: list[str]) -> dict[str, float]:
    total = max(len(arms_selected), 1)
    return {arm: arms_selected.count(arm) / total for arm in catalog}
