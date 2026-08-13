#!/usr/bin/env python3
"""
Bulk simulation: all 5 policies × 4 channels × N rounds.

Generates realistic volume to produce meaningful comparisons in the dashboard.
Reward rates are aligned with segmentation.py classify_segment() logic.

Usage:
    PYTHONPATH=. python scripts/seed_bulk.py [--rounds N] [--api URL]

Default: 500 rounds per (policy × channel) combination = 10,000 decisions total.
"""
from __future__ import annotations

import argparse
import random
import sys
from collections import defaultdict

import httpx

DEFAULT_API = "http://localhost:8001"
DEFAULT_ROUNDS = 500

POLICIES = [
    "contextual_thompson",
    "thompson",
    "contextual_ucb",
    "ucb",
    "baseline",
]

CHANNELS = ["web", "mobile", "email", "call_center"]

# Channel multiplier on base reward rate
# mobile: higher engagement, higher conversion
# call_center: lower because outbound cold call
CHANNEL_MULT: dict[str, float] = {
    "web": 1.0,
    "mobile": 1.15,
    "email": 0.90,
    "call_center": 0.75,
}

# Segment-aware true conversion rates per arm
# Aligned with segmentation.py segments
SEGMENT_ARM_RATES: dict[str, dict[str, float]] = {
    "young": {
        "savings_account": 0.12,
        "term_deposit_6m": 0.20,
        "term_deposit_12m": 0.08,
        "personal_loan": 0.11,
        "premium_savings": 0.09,
    },
    "senior_high_edu": {
        "savings_account": 0.09,
        "term_deposit_6m": 0.18,
        "term_deposit_12m": 0.35,
        "personal_loan": 0.06,
        "premium_savings": 0.28,
    },
    "senior": {
        "savings_account": 0.10,
        "term_deposit_6m": 0.16,
        "term_deposit_12m": 0.25,
        "personal_loan": 0.07,
        "premium_savings": 0.22,
    },
    "mid_indebted": {
        "savings_account": 0.14,
        "term_deposit_6m": 0.10,
        "term_deposit_12m": 0.06,
        "personal_loan": 0.30,
        "premium_savings": 0.07,
    },
    "mid_low_risk": {
        "savings_account": 0.13,
        "term_deposit_6m": 0.18,
        "term_deposit_12m": 0.20,
        "personal_loan": 0.08,
        "premium_savings": 0.22,
    },
    "default": {
        "savings_account": 0.11,
        "term_deposit_6m": 0.14,
        "term_deposit_12m": 0.16,
        "personal_loan": 0.10,
        "premium_savings": 0.13,
    },
}

# Synthetic client profiles — one per segment to ensure full segment coverage
# Features map to segmentation.py classify_segment() logic:
#   age < 30 → young
#   age >= 45 + high_edu → senior_high_edu
#   age >= 45 → senior
#   30-44 + housing=yes + loan=yes → mid_indebted
#   30-44 + balance > 1000 → mid_low_risk
#   else → default
SEGMENT_PROFILES: dict[str, list[dict]] = {
    "young": [
        {"age": 22, "education": "secondary", "housing": "no", "loan": "no", "balance": 300, "job": "student"},
        {"age": 26, "education": "high.school", "housing": "no", "loan": "no", "balance": 450, "job": "technician"},
        {"age": 28, "education": "tertiary", "housing": "no", "loan": "no", "balance": 600, "job": "services"},
    ],
    "senior_high_edu": [
        {"age": 55, "education": "tertiary", "housing": "no", "loan": "no", "balance": 3500, "job": "management"},
        {"age": 62, "education": "university.degree", "housing": "no", "loan": "no", "balance": 5000, "job": "retired"},
        {"age": 48, "education": "professional.course", "housing": "no", "loan": "no", "balance": 2800, "job": "self-employed"},
    ],
    "senior": [
        {"age": 50, "education": "secondary", "housing": "yes", "loan": "no", "balance": 800, "job": "blue-collar"},
        {"age": 58, "education": "primary", "housing": "no", "loan": "no", "balance": 400, "job": "retired"},
        {"age": 65, "education": "secondary", "housing": "yes", "loan": "no", "balance": 1200, "job": "retired"},
    ],
    "mid_indebted": [
        {"age": 35, "education": "secondary", "housing": "yes", "loan": "yes", "balance": 200, "job": "blue-collar"},
        {"age": 40, "education": "secondary", "housing": "yes", "loan": "yes", "balance": 500, "job": "services"},
        {"age": 38, "education": "tertiary", "housing": "yes", "loan": "yes", "balance": 300, "job": "technician"},
    ],
    "mid_low_risk": [
        {"age": 33, "education": "tertiary", "housing": "no", "loan": "no", "balance": 2500, "job": "management"},
        {"age": 42, "education": "university.degree", "housing": "no", "loan": "no", "balance": 4000, "job": "admin."},
        {"age": 37, "education": "secondary", "housing": "yes", "loan": "no", "balance": 1800, "job": "technician"},
    ],
    "default": [
        {"age": 32, "education": "secondary", "housing": "no", "loan": "no", "balance": 700, "job": "services"},
        {"age": 44, "education": "secondary", "housing": "no", "loan": "no", "balance": 900, "job": "blue-collar"},
        {"age": 39, "education": "primary", "housing": "no", "loan": "no", "balance": 400, "job": "entrepreneur"},
    ],
}

ALL_PROFILES = [
    (seg, p) for seg, profiles in SEGMENT_PROFILES.items() for p in profiles
]


def _segment_for(profile: dict) -> str:
    age = profile["age"]
    edu = profile["education"]
    housing = profile["housing"]
    loan = profile["loan"]
    balance = profile["balance"]
    high_edu = edu in {"tertiary", "university.degree", "professional.course"}
    if age < 30:
        return "young"
    if age >= 45:
        return "senior_high_edu" if high_edu else "senior"
    if housing == "yes" and loan == "yes":
        return "mid_indebted"
    if balance > 1000:
        return "mid_low_risk"
    return "default"


def _simulate_reward(arm: str, profile: dict, channel: str) -> float:
    seg = _segment_for(profile)
    base = SEGMENT_ARM_RATES[seg].get(arm, 0.10)
    prob = base * CHANNEL_MULT.get(channel, 1.0)
    return 1.0 if random.random() < min(prob, 0.95) else 0.0


def _header(title: str) -> None:
    print(f"\n{'═' * 65}")
    print(f"  {title}")
    print(f"{'═' * 65}")


def run(api_url: str, n_rounds: int) -> dict:
    _header("SEED BULK — 5 Políticas × 4 Canais")
    total_combos = len(POLICIES) * len(CHANNELS)
    print(f"  Rodadas por combinação : {n_rounds}")
    print(f"  Combinações            : {total_combos}  (5 políticas × 4 canais)")
    print(f"  Total de decisões      : {n_rounds * total_combos:,}")
    print(f"  API                    : {api_url}")

    results: dict = {}

    with httpx.Client(timeout=30.0, base_url=api_url) as client:
        try:
            hc = client.get("/healthz")
            hc.raise_for_status()
            print(f"\n  Health: {hc.json()}")
        except Exception as exc:
            print(f"\n[ERROR] API inacessível em {api_url}: {exc}")
            print("  → docker compose up -d")
            sys.exit(1)

        for policy in POLICIES:
            results[policy] = {}
            for channel in CHANNELS:
                key = f"{policy}/{channel}"
                _header(f"{policy.upper()}  |  canal={channel}")
                arm_counts: dict[str, int] = defaultdict(int)
                total_reward = 0.0
                errors = 0

                for i in range(n_rounds):
                    _, profile = random.choice(ALL_PROFILES)

                    try:
                        resp = client.post(
                            "/decide/",
                            json={"features": profile, "policy": policy, "channel": channel},
                        )
                        resp.raise_for_status()
                        decision = resp.json()
                    except Exception as exc:
                        errors += 1
                        if errors <= 3:
                            print(f"  [WARN] decide falhou round {i}: {exc}")
                        continue

                    arm = decision["offer_id"]
                    decision_id = decision["decision_id"]
                    reward = _simulate_reward(arm, profile, channel)

                    try:
                        fb = client.post(
                            "/reward/",
                            json={"decision_id": decision_id, "reward": reward},
                        )
                        fb.raise_for_status()
                    except Exception as exc:
                        errors += 1
                        if errors <= 3:
                            print(f"  [WARN] reward falhou round {i}: {exc}")
                        continue

                    arm_counts[arm] += 1
                    total_reward += reward

                    if (i + 1) % 100 == 0:
                        rate = total_reward / max(i + 1, 1)
                        print(
                            f"  [{i + 1:4d}/{n_rounds}] arm={arm:<22} "
                            f"running_avg={rate:.1%}  errors={errors}"
                        )

                avg = total_reward / max(n_rounds - errors, 1)
                results[policy][channel] = {
                    "total_reward": total_reward,
                    "avg_reward": avg,
                    "arm_counts": dict(arm_counts),
                    "errors": errors,
                }
                print(
                    f"\n  → {policy}/{channel}: "
                    f"total={total_reward:.0f}  avg={avg:.1%}  erros={errors}"
                )

    return results


def print_summary(results: dict) -> None:
    _header("RESUMO POR POLÍTICA × CANAL")
    header = f"  {'Política':<22} {'Canal':<12} {'Avg Reward':>10}  {'Distribuição de Braços'}"
    print(header)
    print(f"  {'-' * 75}")

    for policy in POLICIES:
        for channel in CHANNELS:
            data = results.get(policy, {}).get(channel, {})
            if not data:
                continue
            avg = data["avg_reward"]
            top_arm = max(data["arm_counts"], key=data["arm_counts"].get) if data["arm_counts"] else "—"
            print(
                f"  {policy:<22} {channel:<12} {avg:>9.1%}  top={top_arm}"
            )

    _header("CANAL COM MELHOR CONVERSÃO POR POLÍTICA")
    for policy in POLICIES:
        best_ch = max(
            CHANNELS,
            key=lambda c: results.get(policy, {}).get(c, {}).get("avg_reward", 0),
        )
        best_avg = results.get(policy, {}).get(best_ch, {}).get("avg_reward", 0)
        print(f"  {policy:<22} → {best_ch:<12} {best_avg:.1%}")

    _header("MELHOR POLÍTICA POR CANAL")
    for channel in CHANNELS:
        best_pol = max(
            POLICIES,
            key=lambda p: results.get(p, {}).get(channel, {}).get("avg_reward", 0),
        )
        best_avg = results.get(best_pol, {}).get(channel, {}).get("avg_reward", 0)
        print(f"  {channel:<12} → {best_pol:<22} {best_avg:.1%}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulação massiva multi-política × canal")
    parser.add_argument("--rounds", type=int, default=DEFAULT_ROUNDS)
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)

    results = run(args.api, args.rounds)
    print_summary(results)

    _header("CONCLUÍDO")
    total = sum(
        d.get("total_reward", 0)
        for pol_data in results.values()
        for d in pol_data.values()
    )
    print(f"  Reward total acumulado: {total:.0f}")
    print(f"  Decisões enviadas     : {args.rounds * len(POLICIES) * len(CHANNELS):,}")


if __name__ == "__main__":
    main()
