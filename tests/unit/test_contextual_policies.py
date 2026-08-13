"""Unit tests for contextual bandit policies (ContextualThompson + ContextualUCB)."""
import pytest

from src.config import ARMS_CATALOG
from src.data.segmentation import classify_segment
from src.policies.base import DecisionContext
from src.policies.contextual_thompson import ContextualThompsonPolicy
from src.policies.contextual_ucb import ContextualUCBPolicy


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def arms():
    return ARMS_CATALOG


@pytest.fixture
def senior_edu_ctx():
    return DecisionContext(
        session_id="s1",
        features={"age": 55, "education": "tertiary", "housing": "no", "loan": "no", "balance": 8000},
    )


@pytest.fixture
def young_ctx():
    return DecisionContext(
        session_id="s2",
        features={"age": 24, "education": "secondary", "housing": "no", "loan": "no", "balance": 500},
    )


@pytest.fixture
def indebted_ctx():
    return DecisionContext(
        session_id="s3",
        features={"age": 38, "education": "secondary", "housing": "yes", "loan": "yes", "balance": 200},
    )


# ---------------------------------------------------------------------------
# Segmentation
# ---------------------------------------------------------------------------

def test_segment_young(young_ctx):
    assert classify_segment(young_ctx.features) == "young"


def test_segment_senior_high_edu(senior_edu_ctx):
    assert classify_segment(senior_edu_ctx.features) == "senior_high_edu"


def test_segment_mid_indebted(indebted_ctx):
    assert classify_segment(indebted_ctx.features) == "mid_indebted"


def test_segment_default():
    assert classify_segment({}) == "default"


# ---------------------------------------------------------------------------
# ContextualThompsonPolicy
# ---------------------------------------------------------------------------

class TestContextualThompson:
    def test_select_returns_valid_arm(self, arms, senior_edu_ctx):
        policy = ContextualThompsonPolicy(arms=arms)
        decision = policy.select_arm(senior_edu_ctx, arms)
        assert decision.arm_id in arms
        assert 0.0 <= decision.confidence <= 1.0
        assert decision.policy_name == "contextual_thompson"
        assert decision.segment == "senior_high_edu"

    def test_different_segments_use_independent_state(self, arms, senior_edu_ctx, young_ctx):
        import numpy as np
        policy = ContextualThompsonPolicy(arms=arms)
        for _ in range(300):
            policy.update("premium_savings", 1.0, segment="senior_high_edu")
        for _ in range(300):
            policy.update("savings_account", 1.0, segment="young")

        np.random.seed(0)
        senior_wins = sum(
            policy.select_arm(senior_edu_ctx, arms).arm_id == "premium_savings"
            for _ in range(20)
        )
        young_wins = sum(
            policy.select_arm(young_ctx, arms).arm_id == "savings_account"
            for _ in range(20)
        )
        assert senior_wins >= 18
        assert young_wins >= 18

    def test_update_increments_alpha_on_success(self, arms):
        policy = ContextualThompsonPolicy(arms=arms)
        before = policy.alpha["default"]["term_deposit_12m"]
        policy.update("term_deposit_12m", 1.0, segment="default")
        assert policy.alpha["default"]["term_deposit_12m"] == before + 1.0

    def test_update_increments_beta_on_failure(self, arms):
        policy = ContextualThompsonPolicy(arms=arms)
        before = policy.beta_["default"]["personal_loan"]
        policy.update("personal_loan", 0.0, segment="default")
        assert policy.beta_["default"]["personal_loan"] == before + 1.0

    def test_state_roundtrip(self, arms, senior_edu_ctx):
        policy = ContextualThompsonPolicy(arms=arms)
        policy.update("premium_savings", 1.0, segment="senior_high_edu")
        state = policy.get_state()
        restored = ContextualThompsonPolicy(arms=arms)
        restored.load_state(state)
        assert restored.alpha["senior_high_edu"]["premium_savings"] == policy.alpha["senior_high_edu"]["premium_savings"]

    def test_convergence_per_segment(self, arms):
        """After 200 rewards on a specific arm per segment, that arm wins reliably."""
        policy = ContextualThompsonPolicy(arms=arms)
        target = "premium_savings"
        seg = "senior_high_edu"
        ctx = DecisionContext(
            session_id="x",
            features={"age": 50, "education": "tertiary", "housing": "no", "loan": "no", "balance": 10000},
        )
        for _ in range(200):
            policy.update(target, 1.0, segment=seg)

        wins = sum(
            1 for _ in range(100)
            if policy.select_arm(ctx, arms).arm_id == target
        )
        assert wins >= 80


# ---------------------------------------------------------------------------
# ContextualUCBPolicy
# ---------------------------------------------------------------------------

class TestContextualUCB:
    def test_select_returns_valid_arm(self, arms, indebted_ctx):
        policy = ContextualUCBPolicy(arms=arms)
        decision = policy.select_arm(indebted_ctx, arms)
        assert decision.arm_id in arms
        assert decision.policy_name == "contextual_ucb"
        assert decision.segment == "mid_indebted"

    def test_unseen_arms_explored_first(self, arms, senior_edu_ctx):
        policy = ContextualUCBPolicy(arms=arms)
        # Only update one arm; unseen arms should be selected first
        policy.update(arms[0], 0.5, segment="senior_high_edu")
        decision = policy.select_arm(senior_edu_ctx, arms)
        # An unseen arm (infinite UCB score) must be chosen
        assert decision.arm_id != arms[0]

    def test_different_segments_independent(self, arms):
        """Values per segment must be independently tracked: updates in one
        segment must not pollute the other's state."""
        policy = ContextualUCBPolicy(arms=arms)
        for _ in range(50):
            policy.update("premium_savings", 1.0, segment="senior_high_edu")
        for _ in range(50):
            policy.update("savings_account", 1.0, segment="young")

        # senior_high_edu: premium_savings value is high, savings_account is 0
        assert policy.values["senior_high_edu"]["premium_savings"] > 0.9
        assert policy.values["senior_high_edu"]["savings_account"] == 0.0

        # young: savings_account value is high, premium_savings is 0
        assert policy.values["young"]["savings_account"] > 0.9
        assert policy.values["young"]["premium_savings"] == 0.0

    def test_update_increments_counts(self, arms):
        policy = ContextualUCBPolicy(arms=arms)
        policy.update("personal_loan", 1.0, segment="mid_indebted")
        assert policy.counts["mid_indebted"]["personal_loan"] == 1
        assert policy.total_pulls["mid_indebted"] == 1

    def test_state_roundtrip(self, arms):
        policy = ContextualUCBPolicy(arms=arms)
        policy.update("term_deposit_12m", 1.0, segment="senior")
        state = policy.get_state()
        restored = ContextualUCBPolicy(arms=arms)
        restored.load_state(state)
        assert restored.counts["senior"]["term_deposit_12m"] == 1
