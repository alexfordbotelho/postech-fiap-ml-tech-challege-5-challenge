"""Offline replay evaluation for bandit policies."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from src.config import ARMS_CATALOG
from src.evaluation.metrics import (
    arm_distribution,
    average_reward,
    cumulative_reward,
    exploration_rate,
    regret,
)
from src.policies.base import BanditPolicy, DecisionContext

ROOT = Path(__file__).parent.parent.parent
GOLDEN_PATH = ROOT / "datasets" / "golden_set" / "evaluation_cases.parquet"


@dataclass
class EvaluationResult:
    policy_name: str
    cumulative_reward: float
    avg_reward: float
    regret: float
    exploration_rate: float
    arm_distribution: dict[str, float]
    total_cases: int
    rewards: list[float] = field(default_factory=list)


def replay_evaluate(policy: BanditPolicy, df: pd.DataFrame) -> EvaluationResult:
    """
    Replay evaluation: each row has a historical arm and reward.
    Policy's decision is rewarded only when it matches the historical arm.
    This is an unbiased offline estimator (inverse propensity simplified).
    """
    rewards: list[float] = []
    oracle_rewards: list[float] = [float(r) for r in df["reward"].tolist()]
    arms_selected: list[str] = []
    explorations: list[bool] = []

    policy_copy = _clone_policy(policy)

    for _, row in df.iterrows():
        ctx = DecisionContext(
            session_id=str(row.get("case_id", "unknown")),
            features={
                "age": row.get("age", 35),
                "job": row.get("job", "unknown"),
                "education": row.get("education", "secondary"),
                "housing": row.get("housing", "no"),
                "euribor3m": row.get("euribor3m", 3.0),
            },
        )
        decision = policy_copy.select_arm(ctx, ARMS_CATALOG)
        arms_selected.append(decision.arm_id)
        explorations.append(decision.is_exploration)

        # reward only if policy selected the same arm as historical (replay method)
        r = float(row["reward"]) if decision.arm_id == row["arm_historical"] else 0.0
        rewards.append(r)
        policy_copy.update(decision.arm_id, r)

    return EvaluationResult(
        policy_name=policy.get_state().get("policy", policy.__class__.__name__.lower()),
        cumulative_reward=cumulative_reward(rewards),
        avg_reward=average_reward(rewards),
        regret=regret(rewards, oracle_rewards),
        exploration_rate=exploration_rate(explorations),
        arm_distribution=arm_distribution(arms_selected, ARMS_CATALOG),
        total_cases=len(df),
        rewards=rewards,
    )


def _clone_policy(policy: BanditPolicy) -> BanditPolicy:
    import copy
    return copy.deepcopy(policy)


def run_comparison(
    golden_path: Path = GOLDEN_PATH, log_to_mlflow: bool = True
) -> dict[str, EvaluationResult]:
    from src.policies.baseline import BaselinePolicy
    from src.policies.thompson import ThompsonSamplingPolicy
    from src.policies.ucb import UCB1Policy

    df = pd.read_parquet(golden_path)
    policies: list[BanditPolicy] = [
        BaselinePolicy(),
        ThompsonSamplingPolicy(arms=ARMS_CATALOG),
        UCB1Policy(arms=ARMS_CATALOG),
    ]
    results: dict[str, EvaluationResult] = {}

    if log_to_mlflow:
        from src.storage.mlflow_client import setup_mlflow

        setup_mlflow()

    for policy in policies:
        name = policy.__class__.__name__.replace("Policy", "").lower()
        result = replay_evaluate(policy, df)
        result.policy_name = name
        results[name] = result
        print(
            f"[{name:10s}] cumulative_reward={result.cumulative_reward:.1f} "
            f"avg={result.avg_reward:.4f} regret={result.regret:.1f} "
            f"exploration={result.exploration_rate:.2%}"
        )
        if log_to_mlflow:
            from src.storage.mlflow_client import log_offline_evaluation

            log_offline_evaluation(
                policy_name=name,
                cumulative_reward=result.cumulative_reward,
                regret=result.regret,
                exploration_rate=result.exploration_rate,
                total_cases=result.total_cases,
                run_type="offline_notebook_eval",
                run_name_prefix="notebook-eval",
            )
    return results
