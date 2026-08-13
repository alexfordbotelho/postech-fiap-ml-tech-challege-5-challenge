"""Adaptive experiment management: create, run, and analyze bandit experiments."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

import numpy as np

from fastapi import APIRouter, Depends, HTTPException

from src.api.models import (
    ArmResult,
    ExperimentCreate,
    ExperimentResponse,
    ExperimentResultsResponse,
    SyntheticGenerateResponse,
)
from src.stats.engine import bayesian_best_arm, power_analysis
from src.storage.postgres import PostgresClient, get_postgres_client

SEGMENTS = ["age_young", "age_senior", "high_balance", "indebted"]
CHANNELS = ["web", "mobile", "email", "call_center"]

ARM_BASE_RATES: dict[str, float] = {
    "savings_account": 0.08,
    "term_deposit_6m": 0.14,
    "term_deposit_12m": 0.22,
    "personal_loan": 0.11,
    "premium_savings": 0.19,
}

SEGMENT_MULTIPLIERS: dict[str, dict[str, float]] = {
    "savings_account": {"age_young": 1.2, "age_senior": 0.8, "high_balance": 0.6, "indebted": 1.3},
    "term_deposit_6m": {"age_young": 1.3, "age_senior": 1.0, "high_balance": 1.2, "indebted": 0.7},
    "term_deposit_12m": {"age_young": 0.7, "age_senior": 1.5, "high_balance": 1.6, "indebted": 0.5},
    "personal_loan": {"age_young": 1.0, "age_senior": 0.8, "high_balance": 0.7, "indebted": 2.0},
    "premium_savings": {"age_young": 0.8, "age_senior": 1.3, "high_balance": 1.8, "indebted": 0.6},
}

MAX_SYNTHETIC = 50_000

router = APIRouter(prefix="/experiments", tags=["experiments"])

ARM_LABELS: dict[str, str] = {
    "savings_account":  "Poupança",
    "term_deposit_6m":  "CDB 6m",
    "term_deposit_12m": "CDB 12m",
    "personal_loan":    "Empréstimo",
    "premium_savings":  "Poupança Premium",
}


def _iso(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


def _fmt(row: dict) -> ExperimentResponse:
    return ExperimentResponse(
        id=str(row["id"]),
        name=row["name"],
        description=row.get("description") or "",
        hypothesis=row.get("hypothesis") or "",
        status=row["status"],
        metric_primary=row.get("metric_primary") or "avg_reward",
        experiment_policy=row.get("experiment_policy") or "contextual_thompson",
        experiment_arms=list(row.get("experiment_arms") or []),
        targeting_segments=list(row.get("targeting_segments") or []),
        targeting_channels=list(row.get("targeting_channels") or []),
        winner=row.get("winner"),
        started_at=_iso(row.get("started_at")),
        stopped_at=_iso(row.get("stopped_at")),
        created_at=_iso(row.get("created_at")) or "",
        decisions_count=int(row.get("decisions_count", 0)),
        synthetic_data_enabled=bool(row.get("synthetic_data_enabled", False)),
        synthetic_data_count=int(row.get("synthetic_data_count", 0)),
    )


@router.get("/", response_model=list[ExperimentResponse])
async def list_experiments(
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
    status: str | None = None,
) -> list[ExperimentResponse]:
    rows = await pg.list_experiments(status=status)
    return [_fmt(r) for r in rows]


DEFAULT_SYNTHETIC_ON_CREATE = 50_000


@router.post("/", response_model=ExperimentResponse, status_code=201)
async def create_experiment(
    body: ExperimentCreate,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> ExperimentResponse:
    row = await pg.create_experiment(body.model_dump())
    exp_id = row["id"]

    if body.synthetic_data_enabled and body.experiment_arms:
        records = _generate_synthetic_records(
            exp_id, body.experiment_arms, body.experiment_policy, DEFAULT_SYNTHETIC_ON_CREATE
        )
        await pg.bulk_insert_synthetic_decisions(exp_id, records)

    full = await pg.get_experiment(exp_id)
    return _fmt(full)


@router.get("/{exp_id}", response_model=ExperimentResponse)
async def get_experiment(
    exp_id: str,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> ExperimentResponse:
    row = await pg.get_experiment(exp_id)
    if not row:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return _fmt(row)


@router.put("/{exp_id}/start", response_model=ExperimentResponse)
async def start_experiment(
    exp_id: str,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> ExperimentResponse:
    exp = await pg.get_experiment(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if exp["status"] != "draft":
        raise HTTPException(status_code=400, detail=f"Experiment status is '{exp['status']}', expected 'draft'")
    await pg.update_experiment_status(exp_id, "running")
    return _fmt(await pg.get_experiment(exp_id))


@router.put("/{exp_id}/stop", response_model=ExperimentResponse)
async def stop_experiment(
    exp_id: str,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
    winner: str | None = None,
) -> ExperimentResponse:
    exp = await pg.get_experiment(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if exp["status"] != "running":
        raise HTTPException(status_code=400, detail="Experiment is not running")
    await pg.update_experiment_status(exp_id, "stopped", winner=winner)
    return _fmt(await pg.get_experiment(exp_id))


@router.delete("/{exp_id}", status_code=204)
async def delete_experiment(
    exp_id: str,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> None:
    exp = await pg.get_experiment(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if exp["status"] == "running":
        raise HTTPException(status_code=400, detail="Pare o experimento antes de excluir")
    deleted = await pg.delete_experiment(exp_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Falha ao excluir experimento")


@router.get("/{exp_id}/results", response_model=ExperimentResultsResponse)
async def get_results(
    exp_id: str,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
) -> ExperimentResultsResponse:
    exp = await pg.get_experiment(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    raw_arms = await pg.get_experiment_decisions(exp_id)

    # Days running
    days_running: float | None = None
    if exp.get("started_at"):
        start = exp["started_at"]
        if isinstance(start, str):
            start = datetime.fromisoformat(start)
        end = exp.get("stopped_at") or datetime.now(tz=timezone.utc)
        if isinstance(end, str):
            end = datetime.fromisoformat(end)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        days_running = round((end - start).total_seconds() / 86400, 1)

    total_decisions = sum(int(r.get("n", 0)) for r in raw_arms)

    # Power analysis — use max observed rate or 0.15 default; must be in (0,1)
    max_rate = max((float(r.get("avg_reward", 0)) for r in raw_arms), default=0.0)
    baseline_rate = max_rate if 0.01 < max_rate < 0.99 else 0.15
    power = power_analysis(baseline_rate)
    min_n = power.min_sample_per_variation

    # Find best arm
    best_arm_row = max(raw_arms, key=lambda r: float(r.get("avg_reward", 0)), default=None)

    # Bayesian comparison: each arm vs best
    enriched_arms = bayesian_best_arm(raw_arms) if len(raw_arms) >= 2 else [
        {**r, "prob_best": 1.0 if r is best_arm_row else 0.0, "expected_lift": 0.0, "ci_95": [0.0, 0.0], "is_best": r is best_arm_row}
        for r in raw_arms
    ]

    sample_reached = all(int(r.get("n", 0)) >= min_n for r in raw_arms) if raw_arms else False

    # Recommendation
    if not raw_arms:
        recommendation = "Sem dados ainda — inicie o experimento e aguarde decisões chegarem"
    elif not sample_reached:
        min_remaining = max(min_n - int(r.get("n", 0)) for r in raw_arms)
        recommendation = (
            f"Coletando dados — faltam ~{min_remaining} decisões "
            f"para atingir potência estatística (mín. {min_n}/braço)"
        )
    else:
        top = max(enriched_arms, key=lambda r: r.get("prob_best") or 0)
        prob = top.get("prob_best") or 0
        arm_name = ARM_LABELS.get(top["variation_id"], top["variation_id"])
        if prob >= 0.95:
            lift = (top.get("expected_lift") or 0) * 100
            recommendation = f"WINNER: '{arm_name}' com {prob*100:.1f}% de probabilidade de ser o melhor braço (lift +{lift:.2f}%)"
        elif prob >= 0.75:
            recommendation = f"Forte evidência para '{arm_name}' ({prob*100:.1f}%) — continue coletando para confirmação"
        else:
            recommendation = "Sem diferença clara entre braços — política ainda convergindo"

    return ExperimentResultsResponse(
        experiment_id=exp_id,
        name=exp["name"],
        status=exp["status"],
        experiment_policy=exp.get("experiment_policy") or "contextual_thompson",
        days_running=days_running,
        arms=[
            ArmResult(
                arm_id=r["variation_id"],
                n=int(r.get("n", 0)),
                total_reward=float(r.get("total_reward", 0)),
                avg_reward=float(r.get("avg_reward", 0)),
                explorations=int(r.get("explorations", 0)),
                exploration_rate=round(int(r.get("explorations", 0)) / max(int(r.get("n", 1)), 1), 3),
                prob_best=r.get("prob_best"),
                expected_lift=r.get("expected_lift"),
                ci_95=r.get("ci_95"),
                is_best=bool(r.get("is_best")),
            )
            for r in enriched_arms
        ],
        recommendation=recommendation,
        sample_reached=sample_reached,
        min_sample_per_arm=min_n,
        total_decisions=total_decisions,
    )


def _generate_synthetic_records(
    exp_id: str,
    arms: list[str],
    policy: str,
    n: int,
) -> list[tuple]:
    rng = np.random.default_rng()
    records = []
    for _ in range(n):
        arm = rng.choice(arms)
        segment = rng.choice(SEGMENTS)
        channel = rng.choice(CHANNELS)
        base = ARM_BASE_RATES.get(arm, 0.12)
        mult = SEGMENT_MULTIPLIERS.get(arm, {}).get(segment, 1.0)
        reward_prob = min(base * mult, 0.95)
        reward = float(int(rng.random() < reward_prob))
        is_exploration = bool(rng.random() < 0.2)
        ctx = json.dumps({
            "_segment": segment,
            "_channel": channel,
            "synthetic": True,
        })
        records.append((
            str(uuid.uuid4()),   # decision_id
            policy,              # policy_name
            arm,                 # arm_selected
            ctx,                 # context_features
            is_exploration,      # is_exploration
            str(uuid.uuid4()),   # session_id
            exp_id,              # bandit_experiment_id
            arm,                 # variation_id
            reward,              # reward
        ))
    return records


@router.post("/{exp_id}/synthetic", response_model=SyntheticGenerateResponse)
async def generate_synthetic_data(
    exp_id: str,
    pg: Annotated[PostgresClient, Depends(get_postgres_client)],
    n: int = 1000,
) -> SyntheticGenerateResponse:
    exp = await pg.get_experiment(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if not exp.get("synthetic_data_enabled"):
        raise HTTPException(status_code=400, detail="Dados sintéticos não estão habilitados neste experimento")

    current_count = int(exp.get("synthetic_data_count", 0))
    remaining = MAX_SYNTHETIC - current_count
    if remaining <= 0:
        raise HTTPException(status_code=400, detail=f"Limite de {MAX_SYNTHETIC:,} registros sintéticos já atingido")

    to_generate = min(n, remaining)
    arms = list(exp.get("experiment_arms") or [])
    if not arms:
        raise HTTPException(status_code=400, detail="Experimento sem braços definidos")
    policy = exp.get("experiment_policy") or "contextual_thompson"

    records = _generate_synthetic_records(exp_id, arms, policy, to_generate)
    inserted = await pg.bulk_insert_synthetic_decisions(exp_id, records)

    updated = await pg.get_experiment(exp_id)
    return SyntheticGenerateResponse(
        experiment_id=exp_id,
        generated=inserted,
        total_synthetic=int((updated or {}).get("synthetic_data_count", current_count + inserted)),
    )
