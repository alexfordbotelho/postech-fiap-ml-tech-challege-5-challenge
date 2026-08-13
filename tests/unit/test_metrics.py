from src.evaluation.metrics import (
    arm_distribution,
    average_reward,
    cumulative_reward,
    exploration_rate,
    regret,
)
from src.config import ARMS_CATALOG


def test_cumulative_reward_sum():
    assert cumulative_reward([1.0, 0.0, 1.0, 1.0]) == 3.0


def test_average_reward_mean():
    assert abs(average_reward([1.0, 0.0, 1.0]) - 2 / 3) < 1e-9


def test_average_reward_empty():
    assert average_reward([]) == 0.0


def test_regret_calculation():
    oracle = [1.0, 1.0, 1.0]
    actual = [1.0, 0.0, 1.0]
    assert regret(actual, oracle) == 1.0


def test_regret_zero_when_equal():
    r = [0.5, 0.3, 0.8]
    assert regret(r, r) == 0.0


def test_exploration_rate():
    flags = [True, False, True, True, False]
    assert abs(exploration_rate(flags) - 0.6) < 1e-9


def test_exploration_rate_empty():
    assert exploration_rate([]) == 0.0


def test_arm_distribution_sums_to_one():
    arms = ["a", "b", "c"]
    selected = ["a", "b", "a", "c", "a"]
    dist = arm_distribution(selected, arms)
    assert abs(sum(dist.values()) - 1.0) < 1e-9
    assert dist["a"] == 3 / 5


def test_arm_distribution_covers_catalog():
    dist = arm_distribution([], ARMS_CATALOG)
    assert set(dist.keys()) == set(ARMS_CATALOG)
