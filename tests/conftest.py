from unittest.mock import AsyncMock, MagicMock

import pytest

from src.config import ARMS_CATALOG
from src.policies.base import DecisionContext


@pytest.fixture
def arms() -> list[str]:
    return ARMS_CATALOG


@pytest.fixture
def sample_context() -> DecisionContext:
    return DecisionContext(
        session_id="test-session-001",
        features={
            "age": 45,
            "job": "management",
            "education": "tertiary",
            "housing": "yes",
            "balance": 2000,
            "euribor3m": 1.2,
        },
    )


@pytest.fixture
def young_context() -> DecisionContext:
    return DecisionContext(
        session_id="test-session-young",
        features={"age": 25, "job": "student", "education": "secondary", "housing": "no"},
    )


@pytest.fixture
def indebted_context() -> DecisionContext:
    return DecisionContext(
        session_id="test-session-indebted",
        features={
            "age": 38, "job": "blue-collar", "education": "primary",
            "housing": "yes", "loan": "yes",
        },
    )


@pytest.fixture
def mock_postgres() -> MagicMock:
    pg = MagicMock()
    pg.insert_decision_log = AsyncMock()
    pg.update_reward = AsyncMock(return_value="term_deposit_12m")
    pg.get_bandit_state = AsyncMock(return_value=None)
    pg.upsert_bandit_state = AsyncMock()
    pg.get_policy_metrics = AsyncMock(return_value={
        "total_decisions": 100,
        "cumulative_reward": 22.0,
        "avg_reward": 0.22,
        "exploration_rate": 0.15,
    })
    return pg


@pytest.fixture
def mock_redis() -> MagicMock:
    redis = MagicMock()
    redis.get_state = AsyncMock(return_value=None)
    redis.set_state = AsyncMock()
    redis.invalidate = AsyncMock()
    return redis
