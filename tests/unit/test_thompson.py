import pytest

from src.policies.base import DecisionContext
from src.policies.thompson import ThompsonSamplingPolicy


@pytest.fixture
def policy(arms):
    return ThompsonSamplingPolicy(arms=arms)


def test_select_arm_returns_valid_arm(policy, arms, sample_context):
    decision = policy.select_arm(sample_context, arms)
    assert decision.arm_id in arms
    assert decision.policy_name == "thompson"
    assert 0.0 <= decision.confidence <= 1.0


def test_select_arm_all_arms_reachable(policy, arms, sample_context):
    selected = {policy.select_arm(sample_context, arms).arm_id for _ in range(200)}
    assert len(selected) > 1, "Thompson should explore multiple arms"


def test_update_increases_alpha_on_reward(policy, arms):
    arm = arms[0]
    alpha_before = policy.alpha[arm]
    policy.update(arm, 1.0)
    assert policy.alpha[arm] == alpha_before + 1.0


def test_update_increases_beta_on_zero_reward(policy, arms):
    arm = arms[0]
    beta_before = policy.beta_[arm]
    policy.update(arm, 0.0)
    assert policy.beta_[arm] == beta_before + 1.0


def test_get_state_load_state_roundtrip(policy, arms, sample_context):
    for arm in arms[:2]:
        policy.update(arm, 1.0)
    state = policy.get_state()

    new_policy = ThompsonSamplingPolicy(arms=arms)
    new_policy.load_state(state)
    assert new_policy.alpha == policy.alpha
    assert new_policy.beta_ == policy.beta_


def test_convergence_toward_best_arm(arms):
    policy = ThompsonSamplingPolicy(arms=arms)
    best_arm = "term_deposit_12m"

    # Simulate 200 rounds where best_arm has 30% conversion and others have 5%
    import numpy as np
    rng = np.random.default_rng(42)
    ctx = DecisionContext(session_id="conv-test", features={})

    for _ in range(200):
        decision = policy.select_arm(ctx, arms)
        rate = 0.30 if decision.arm_id == best_arm else 0.05
        reward = 1.0 if rng.random() < rate else 0.0
        policy.update(decision.arm_id, reward)

    # After 200 rounds the best arm should dominate selections
    selections = [policy.select_arm(ctx, arms).arm_id for _ in range(50)]
    best_rate = selections.count(best_arm) / len(selections)
    assert best_rate > 0.4, f"Expected best arm to win > 40% of time, got {best_rate:.1%}"
