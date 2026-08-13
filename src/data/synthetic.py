"""Generate synthetic enrichment layer: offers catalog + interaction events + reward signals."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from src.config import ARMS_CATALOG
from src.data.loader import load_processed

ROOT = Path(__file__).parent.parent.parent
ENRICHMENT_DIR = ROOT / "datasets" / "synthetic_enrichment"
GOLDEN_DIR = ROOT / "datasets" / "golden_set"

RANDOM_SEED = 42

# Arm-specific base conversion rates (ground truth for simulation)
ARM_BASE_RATES: dict[str, float] = {
    "savings_account": 0.08,
    "term_deposit_6m": 0.14,
    "term_deposit_12m": 0.22,
    "personal_loan": 0.11,
    "premium_savings": 0.19,
}

# Segment multipliers: which client profile benefits most from each arm
SEGMENT_MULTIPLIERS: dict[str, dict[str, float]] = {
    "savings_account": {"age_young": 1.2, "age_senior": 0.8, "high_balance": 0.6, "indebted": 1.3},
    "term_deposit_6m": {"age_young": 1.3, "age_senior": 1.0, "high_balance": 1.2, "indebted": 0.7},
    "term_deposit_12m": {"age_young": 0.7, "age_senior": 1.5, "high_balance": 1.6, "indebted": 0.5},
    "personal_loan": {"age_young": 1.0, "age_senior": 0.8, "high_balance": 0.7, "indebted": 2.0},
    "premium_savings": {"age_young": 0.8, "age_senior": 1.3, "high_balance": 1.8, "indebted": 0.6},
}


def _classify_client(row: pd.Series) -> str:
    age = int(row.get("age", 35) or 35)
    balance = float(row.get("balance", 500) or 500)
    housing = str(row.get("housing", "no") or "no")
    loan = str(row.get("loan", "no") or "no")
    if age < 35:
        return "age_young"
    if age >= 55:
        return "age_senior"
    if balance > 1500:
        return "high_balance"
    if housing == "yes" or loan == "yes":
        return "indebted"
    return "age_young"


def _arm_reward_prob(arm: str, client_segment: str) -> float:
    base = ARM_BASE_RATES[arm]
    mult = SEGMENT_MULTIPLIERS[arm].get(client_segment, 1.0)
    return min(base * mult, 0.95)


def build_offers_catalog() -> dict:
    catalog = {
        arm: {
            "arm_id": arm,
            "name": arm.replace("_", " ").title(),
            "base_conversion_rate": ARM_BASE_RATES[arm],
            "target_segments": [
                seg for seg, mult in SEGMENT_MULTIPLIERS[arm].items() if mult > 1.1
            ],
        }
        for arm in ARMS_CATALOG
    }
    return catalog


def generate_interaction_events(n_events: int = 50_000) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_SEED)
    df = load_processed()
    sampled = df.sample(n=n_events, replace=True, random_state=RANDOM_SEED).reset_index(drop=True)

    arms_chosen = rng.choice(ARMS_CATALOG, size=n_events)
    segments = sampled.apply(_classify_client, axis=1).values
    rewards = np.array([
        int(rng.random() < _arm_reward_prob(arm, seg))
        for arm, seg in zip(arms_chosen, segments)
    ])

    events = pd.DataFrame({
        "event_id": [f"evt_{i:06d}" for i in range(n_events)],
        "session_id": [f"sess_{i:06d}" for i in range(n_events)],
        "arm_selected": arms_chosen,
        "client_segment": segments,
        "reward": rewards,
        "age": sampled["age"].values,
        "job": sampled["job"].values,
        "education": sampled["education"].values,
        "housing": sampled["housing"].values,
        "euribor3m": sampled["euribor3m"].values,
    })
    return events


def generate_golden_set(n_cases: int = 500) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_SEED + 1)
    df = load_processed()
    sampled = df.sample(n=n_cases, replace=False, random_state=RANDOM_SEED + 1)
    sampled = sampled.reset_index(drop=True)

    # Assign "oracle" arm (best arm per segment)
    oracle_arm_map = {
        "age_young": "term_deposit_6m",
        "age_senior": "term_deposit_12m",
        "high_balance": "premium_savings",
        "indebted": "personal_loan",
    }
    segments = sampled.apply(_classify_client, axis=1)
    oracle_arms = segments.map(lambda s: oracle_arm_map.get(s, "savings_account"))
    rewards = np.array([
        int(rng.random() < _arm_reward_prob(arm, seg))
        for arm, seg in zip(oracle_arms, segments)
    ])

    return pd.DataFrame({
        "case_id": [f"case_{i:04d}" for i in range(n_cases)],
        "arm_historical": oracle_arms.values,
        "reward": rewards,
        "client_segment": segments.values,
        "age": sampled["age"].values,
        "job": sampled["job"].values,
        "education": sampled["education"].values,
        "housing": sampled["housing"].values,
        "euribor3m": sampled["euribor3m"].values,
    })


def save_all() -> None:
    ENRICHMENT_DIR.mkdir(parents=True, exist_ok=True)
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)

    catalog = build_offers_catalog()
    with open(ENRICHMENT_DIR / "offers_catalog.json", "w") as f:
        json.dump(catalog, f, indent=2)
    print("Saved offers_catalog.json")

    events = generate_interaction_events()
    events.to_parquet(ENRICHMENT_DIR / "interaction_events.parquet", index=False)
    print(f"Saved interaction_events.parquet ({len(events):,} rows)")

    golden = generate_golden_set()
    golden.to_parquet(GOLDEN_DIR / "evaluation_cases.parquet", index=False)
    print(f"Saved evaluation_cases.parquet ({len(golden):,} rows)")
    print(f"Golden set reward rate: {golden['reward'].mean():.3f}")


if __name__ == "__main__":
    save_all()
