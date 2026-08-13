import pytest

from src.policies.base import DecisionContext
from src.policies.ucb import UCB1Policy


@pytest.fixture
def policy(arms):
    return UCB1Policy(arms=arms)


def test_select_arm_returns_valid_arm(policy, arms, sample_context):
    decision = policy.select_arm(sample_context, arms)
    assert decision.arm_id in arms
    assert decision.policy_name == "ucb"


def test_unseen_arms_selected_first(policy, arms, sample_context):
    seen = set()
    for _ in range(len(arms) * 2):
        decision = policy.select_arm(sample_context, arms)
        seen.add(decision.arm_id)
        policy.update(decision.arm_id, 0.1)
        if seen == set(arms):
            break
    assert seen == set(arms), "UCB must explore all arms before repeating"


def test_update_increments_counts(policy, arms):
    arm = arms[0]
    assert policy.counts[arm] == 0
    policy.update(arm, 1.0)
    assert policy.counts[arm] == 1
    assert policy.total_pulls == 1


def test_update_running_mean(policy, arms):
    arm = arms[0]
    policy.update(arm, 1.0)
    policy.update(arm, 0.0)
    assert abs(policy.values[arm] - 0.5) < 1e-9


def test_get_state_load_state_roundtrip(policy, arms, sample_context):
    for arm in arms:
        policy.update(arm, 0.5)
    state = policy.get_state()

    new_policy = UCB1Policy(arms=arms)
    new_policy.load_state(state)
    assert new_policy.counts == policy.counts
    assert new_policy.total_pulls == policy.total_pulls


def test_high_reward_arm_wins_over_time(arms):
    policy = UCB1Policy(arms=arms)
    best_arm = "premium_savings"
    ctx = DecisionContext(session_id="ucb-test", features={})

    import numpy as np
    rng = np.random.default_rng(99)

    for _ in range(300):
        decision = policy.select_arm(ctx, arms)
        rate = 0.35 if decision.arm_id == best_arm else 0.05
        reward = 1.0 if rng.random() < rate else 0.0
        policy.update(decision.arm_id, reward)

    selections = [policy.select_arm(ctx, arms).arm_id for _ in range(50)]
    best_rate = selections.count(best_arm) / len(selections)
    assert best_rate > 0.5
