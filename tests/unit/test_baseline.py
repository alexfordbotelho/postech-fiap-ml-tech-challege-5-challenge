import pytest

from src.policies.baseline import BaselinePolicy


@pytest.fixture
def policy():
    return BaselinePolicy()


def test_senior_high_edu_gets_premium_savings(policy, arms):
    from src.policies.base import DecisionContext

    ctx = DecisionContext(
        session_id="s1",
        features={"age": 55, "education": "tertiary", "housing": "no"},
    )
    decision = policy.select_arm(ctx, arms)
    assert decision.arm_id == "premium_savings"
    assert decision.is_exploration is False
    assert decision.policy_name == "baseline"


def test_senior_low_edu_gets_term_deposit_12m(policy, arms):
    from src.policies.base import DecisionContext

    ctx = DecisionContext(
        session_id="s2",
        features={"age": 60, "education": "primary", "housing": "no"},
    )
    decision = policy.select_arm(ctx, arms)
    assert decision.arm_id == "term_deposit_12m"


def test_indebted_mid_gets_personal_loan(policy, arms):
    from src.policies.base import DecisionContext

    ctx = DecisionContext(
        session_id="s3",
        features={"age": 38, "education": "secondary", "housing": "yes", "loan": "yes"},
    )
    decision = policy.select_arm(ctx, arms)
    assert decision.arm_id == "personal_loan"


def test_update_is_noop(policy, arms):
    before = policy.get_state()
    policy.update(arms[0], 1.0)
    after = policy.get_state()
    assert before == after


def test_fallback_to_first_arm_when_preferred_not_in_arms(policy):
    from src.policies.base import DecisionContext

    ctx = DecisionContext(
        session_id="s4",
        features={"age": 55, "education": "tertiary"},
    )
    limited_arms = ["savings_account", "term_deposit_6m"]
    decision = policy.select_arm(ctx, limited_arms)
    assert decision.arm_id in limited_arms
