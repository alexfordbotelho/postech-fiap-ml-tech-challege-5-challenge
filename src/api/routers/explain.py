"""GET /explain/{decision_id} — explains why a bandit arm was selected.

Returns a structured breakdown of the decision context, the segment
classification, and the per-arm scores that drove the selection.
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from src.api.models import ExplainResponse
from src.config import ARMS_CATALOG
from src.data.segmentation import classify_segment
from src.storage.postgres import PostgresClient, get_postgres_client

router = APIRouter(prefix="/explain", tags=["explainability"])


def _thompson_reasoning(state: dict, segment: str, arm_selected: str) -> dict:
    alpha = state.get("alpha", {})
    beta = state.get("beta", {})

    # contextual: state is nested {segment: {arm: value}}
    seg_alpha = alpha.get(segment, alpha) if isinstance(next(iter(alpha.values()), None), dict) else alpha
    seg_beta = beta.get(segment, beta) if isinstance(next(iter(beta.values()), None), dict) else beta

    arm_scores = {}
    for arm in ARMS_CATALOG:
        a = seg_alpha.get(arm, 1.0)
        b = seg_beta.get(arm, 1.0)
        arm_scores[arm] = {
            "alpha": round(a, 3),
            "beta": round(b, 3),
            "mean_estimate": round(a / (a + b), 4),
            "total_observations": int(a + b - 2),
        }

    sorted_arms = sorted(arm_scores, key=lambda x: arm_scores[x]["mean_estimate"], reverse=True)
    runner_up = sorted_arms[1] if len(sorted_arms) > 1 else None
    gap = (
        round(arm_scores[arm_selected]["mean_estimate"] - arm_scores[runner_up]["mean_estimate"], 4)
        if runner_up else None
    )

    return {
        "algorithm": "Thompson Sampling (Beta-Binomial)",
        "arm_scores": arm_scores,
        "winner": arm_selected,
        "runner_up": runner_up,
        "confidence_gap": gap,
        "note": (
            "Arm selected by sampling θ ~ Beta(α, β) for each arm; "
            "gap < 0.05 indicates near-tie (exploration)."
        ),
    }


def _ucb_reasoning(state: dict, segment: str, arm_selected: str) -> dict:
    import math

    counts = state.get("counts", {})
    values = state.get("values", {})
    total_pulls = state.get("total_pulls", {})
    c = 1.414

    # contextual: nested {segment: {arm: value}}
    seg_counts = counts.get(segment, counts) if isinstance(next(iter(counts.values()), None), dict) else counts
    seg_values = values.get(segment, values) if isinstance(next(iter(values.values()), None), dict) else values
    t = total_pulls.get(segment, total_pulls) if isinstance(total_pulls, dict) else total_pulls

    arm_scores: dict[str, dict] = {}
    for arm in ARMS_CATALOG:
        n = seg_counts.get(arm, 0)
        v = seg_values.get(arm, 0.0)
        if n == 0 or not isinstance(t, int) or t == 0:
            ucb = float("inf")
            bonus = float("inf")
        else:
            bonus = c * math.sqrt(math.log(t) / n)
            ucb = v + bonus
        arm_scores[arm] = {
            "mean_reward": round(v, 4),
            "pull_count": n,
            "exploration_bonus": round(bonus, 4) if bonus != float("inf") else "∞",
            "ucb_score": round(ucb, 4) if ucb != float("inf") else "∞",
        }

    return {
        "algorithm": "UCB1 (Upper Confidence Bound)",
        "exploration_constant": c,
        "total_pulls_this_segment": t,
        "arm_scores": arm_scores,
        "winner": arm_selected,
        "note": "Arm with highest UCB score selected; ∞ = never pulled (forced exploration).",
    }


def _baseline_reasoning(features: dict, arm_selected: str) -> dict:
    age = int(features.get("age", 35))
    education = str(features.get("education", "secondary"))
    housing = str(features.get("housing", "no"))
    loan = str(features.get("loan", "no"))
    balance = float(features.get("balance", 0))

    if age >= 45 and education in {"tertiary", "university.degree", "professional.course"}:
        rule = "age ≥ 45 AND high_education → premium_savings"
    elif age >= 45:
        rule = "age ≥ 45 → term_deposit_12m"
    elif housing == "yes" and loan == "yes":
        rule = "housing=yes AND loan=yes → personal_loan"
    elif balance > 1000:
        rule = "balance > 1000 → term_deposit_6m"
    else:
        rule = "default → savings_account"

    return {
        "algorithm": "Rule-based Baseline (deterministic)",
        "rule_fired": rule,
        "inputs": {"age": age, "education": education, "housing": housing, "loan": loan, "balance": balance},
        "winner": arm_selected,
        "note": "No learning — rules are fixed. Exploration rate is always 0%.",
    }


@router.get("/{decision_id}", response_model=ExplainResponse)
async def explain(
    decision_id: UUID,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> ExplainResponse:
    decision = await pg.get_decision(decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="decision_id not found")

    features = decision["context_features"]
    policy_name = decision["policy_name"]
    arm_selected = decision["arm_selected"]
    segment = classify_segment(features)

    state = await pg.get_bandit_state(policy_name) or {}

    match policy_name:
        case "thompson" | "contextual_thompson":
            reasoning = _thompson_reasoning(state, segment, arm_selected)
        case "ucb" | "ucb1" | "contextual_ucb":
            reasoning = _ucb_reasoning(state, segment, arm_selected)
        case "baseline" | "deterministic":
            reasoning = _baseline_reasoning(features, arm_selected)
        case _:
            reasoning = {"note": f"No explanation available for policy: {policy_name}"}

    reasoning["decision_type"] = "exploration" if decision["is_exploration"] else "exploitation"

    return ExplainResponse(
        decision_id=decision_id,
        arm_selected=arm_selected,
        policy=policy_name,
        segment=segment,
        is_exploration=decision["is_exploration"],
        channel=features.get("_channel", "web"),
        context_features=features,
        reward=decision["reward"],
        reasoning=reasoning,
    )
