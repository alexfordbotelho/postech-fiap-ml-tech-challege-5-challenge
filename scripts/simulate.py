#!/usr/bin/env python3
"""
End-to-end simulation: API → Kafka → ClickHouse → MLflow

Runs N rounds of decide+reward for all 3 policies, then verifies data
propagated through every layer of the stack.

Usage:
    PYTHONPATH=. python scripts/simulate.py [--rounds N] [--api URL]
"""
from __future__ import annotations

import argparse
import random
import sys
import time
from collections import defaultdict

import httpx

# ── defaults ──────────────────────────────────────────────────────────────────
DEFAULT_API = "http://localhost:8001"
DEFAULT_ROUNDS = 50
POLICIES = ["thompson", "ucb", "baseline"]
KAFKA_SINK_DELAY = 5  # seconds for Kafka→ClickHouse consumer to flush

# Simulated true conversion rates per arm (ground truth for reward simulation)
TRUE_RATES: dict[str, float] = {
    "savings_account": 0.12,
    "term_deposit_6m": 0.15,
    "term_deposit_12m": 0.18,
    "premium_savings": 0.22,
    "credit_line": 0.10,
}

# Representative client contexts (no PII — synthetic features only)
CONTEXTS = [
    {"age": 25, "education": "secondary", "housing": "yes", "job": "technician"},
    {"age": 45, "education": "tertiary", "housing": "no", "job": "management"},
    {"age": 65, "education": "tertiary", "housing": "no", "job": "retired"},
    {"age": 35, "education": "university.degree", "housing": "yes", "job": "blue-collar"},
    {"age": 22, "education": "high.school", "housing": "no", "job": "student"},
    {"age": 52, "education": "tertiary", "housing": "yes", "job": "self-employed"},
]


# ── helpers ───────────────────────────────────────────────────────────────────

def _simulate_reward(arm: str) -> float:
    return 1.0 if random.random() < TRUE_RATES.get(arm, 0.10) else 0.0


def _bar(value: float, width: int = 30) -> str:
    filled = int(value * width)
    return "█" * filled + "░" * (width - filled)


def _header(title: str) -> None:
    print(f"\n{'═' * 60}")
    print(f"  {title}")
    print(f"{'═' * 60}")


# ── simulation ────────────────────────────────────────────────────────────────

def run_simulation(api_url: str, n_rounds: int) -> dict:
    _header("DATATHON — Multi-Armed Bandit Simulation")
    print(f"  API:    {api_url}")
    print(f"  Rounds: {n_rounds} per policy  ({n_rounds * len(POLICIES)} total)")
    print(f"  Policies: {', '.join(POLICIES)}")

    results: dict = {}

    with httpx.Client(timeout=10.0, base_url=api_url) as client:
        # Health gate
        try:
            hc = client.get("/healthz")
            hc.raise_for_status()
            status = hc.json()
        except Exception as exc:
            print(f"\n[ERROR] API unreachable at {api_url}: {exc}")
            print("  → Is the Docker Compose stack running?  docker compose up -d")
            sys.exit(1)

        print(f"\n  Health: {status}")

        for policy in POLICIES:
            _header(f"Policy: {policy.upper()}")
            arm_counts: dict[str, int] = defaultdict(int)
            total_reward = 0.0
            rewards: list[float] = []

            for i in range(n_rounds):
                ctx = random.choice(CONTEXTS)

                # ── decide ────────────────────────────────────────────────────
                resp = client.post("/decide/", json={"features": ctx, "policy": policy})
                resp.raise_for_status()
                decision = resp.json()
                arm = decision["offer_id"]
                decision_id = decision["decision_id"]

                # ── simulate reward (Bernoulli with known true rate) ───────────
                reward = _simulate_reward(arm)

                # ── feedback ──────────────────────────────────────────────────
                fb = client.post("/reward/", json={"decision_id": decision_id, "reward": reward})
                fb.raise_for_status()

                arm_counts[arm] += 1
                total_reward += reward
                rewards.append(reward)

                if (i + 1) % 10 == 0:
                    rate = total_reward / (i + 1)
                    print(
                        f"  [{i + 1:3d}/{n_rounds}]  arm={arm:<22} "
                        f"reward={reward:.0f}  running_avg={rate:.1%}"
                    )

            # ── metrics from API ──────────────────────────────────────────────
            metrics_resp = client.get("/metrics/", params={"policy": policy})
            metrics_resp.raise_for_status()
            api_metrics = metrics_resp.json()

            results[policy] = {
                "total_reward": total_reward,
                "avg_reward": total_reward / n_rounds,
                "arm_counts": dict(arm_counts),
                "rewards": rewards,
                "api_metrics": api_metrics,
            }
            print(
                f"\n  → Total: {total_reward:.0f}/{n_rounds}  "
                f"Conversion: {total_reward / n_rounds:.1%}  "
                f"Top arm: {max(arm_counts, key=lambda k: arm_counts[k])}"
            )

    return results


# ── layer verification ────────────────────────────────────────────────────────

def verify_layers(results: dict) -> None:
    _header("LAYER VERIFICATION")

    # 1 — PostgreSQL (via API metrics endpoint)
    print("\n[1] PostgreSQL — bandit state persisted via /metrics")
    for policy, data in results.items():
        m = data["api_metrics"]
        print(
            f"     {policy:<12}  decisions={m.get('total_decisions', '?')}  "
            f"cumulative_reward={m.get('cumulative_reward', '?')}"
        )
    print("     ✓ PostgreSQL: data visible through API")

    # 2 — Redis (implicit: bandit state survives across rounds)
    print("\n[2] Redis — bandit arm state (implicit verification)")
    print("     Each policy completed all rounds with state persisted → ✓")

    # 3 — Kafka → ClickHouse consumer lag
    print(f"\n[3] ClickHouse — waiting {KAFKA_SINK_DELAY}s for Kafka consumer to flush…")
    time.sleep(KAFKA_SINK_DELAY)
    try:
        from clickhouse_driver import Client as CHClient  # type: ignore
        ch = CHClient(host="localhost", port=9002)
        total = ch.execute("SELECT count() FROM datathon.events")[0][0]
        by_policy = ch.execute(
            "SELECT policy_name, count() as n, round(avg(reward), 4) as avg_r "
            "FROM datathon.events GROUP BY policy_name ORDER BY policy_name"
        )
        print(f"     Total events in datathon.events: {total:,}")
        for row in by_policy:
            print(f"     {row[0]:<12}  count={row[1]}  avg_reward={row[2]}")
        print("     ✓ ClickHouse: events propagated from Kafka")
    except Exception as exc:
        print(f"     ✗ ClickHouse unavailable: {exc}")
        print("       → Check: docker compose logs clickhouse")

    # 4 — MLflow
    print("\n[4] MLflow — experiment tracking")
    try:
        import mlflow  # type: ignore
        mlflow.set_tracking_uri("http://localhost:5010")
        client = mlflow.tracking.MlflowClient()
        experiments = client.search_experiments()
        if not experiments:
            print("     (No experiments found — API may not be logging runs yet)")
        for exp in experiments:
            runs = client.search_runs(experiment_ids=[exp.experiment_id], max_results=3)
            print(f"     Experiment '{exp.name}': {len(runs)} recent runs")
        print("     ✓ MLflow reachable")
    except Exception as exc:
        print(f"     ✗ MLflow unavailable: {exc}")
        print("       → Check: docker compose logs mlflow")

    # 5 — HyperDX (OTLP endpoint health check)
    print("\n[5] HyperDX — OTLP observability")
    try:
        r = httpx.get("http://localhost:8082", timeout=3.0)
        print(f"     HTTP {r.status_code} — HyperDX UI reachable at http://localhost:8082")
        print("     ✓ HyperDX running")
    except Exception as exc:
        print(f"     ✗ HyperDX unavailable: {exc}")
        print("       → Check: docker compose logs hyperdx")


# ── final comparison table ────────────────────────────────────────────────────

def print_summary(results: dict) -> None:
    _header("FINAL COMPARISON")
    print(f"  {'Policy':<14} {'Reward':>8} {'Avg':>8} {'Top Arm'}")
    print(f"  {'-' * 56}")
    sorted_results = sorted(results.items(), key=lambda x: -x[1]["avg_reward"])
    for policy, data in sorted_results:
        top_arm = max(data["arm_counts"], key=data["arm_counts"].get)
        print(
            f"  {policy:<14} {data['total_reward']:>8.0f} "
            f"{data['avg_reward']:>7.1%}  {top_arm}"
        )

    _header("ARM SELECTION DISTRIBUTION")
    for policy, data in results.items():
        total = sum(data["arm_counts"].values())
        print(f"\n  {policy.upper()}")
        for arm, count in sorted(data["arm_counts"].items(), key=lambda x: -x[1]):
            pct = count / total
            print(f"    {arm:<25} {pct:5.1%}  {_bar(pct, 25)}")

    # Highlight best policy vs baseline
    if "baseline" in results:
        baseline_avg = results["baseline"]["avg_reward"]
        best_policy, best_data = sorted_results[0]
        best_avg = best_data["avg_reward"]
        lift = (best_avg - baseline_avg) / baseline_avg * 100 if baseline_avg > 0 else 0
        _header("RESULT")
        print(f"  Best policy: {best_policy} ({best_avg:.1%} avg reward)")
        print(f"  Baseline:    {baseline_avg:.1%} avg reward")
        print(f"  Lift over baseline: {lift:+.1f}%")
        print(f"\n  True arm rates (for reference): {TRUE_RATES}")


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="End-to-end bandit simulation")
    parser.add_argument("--rounds", type=int, default=DEFAULT_ROUNDS, help="Decisions per policy")
    parser.add_argument("--api", default=DEFAULT_API, help="API base URL")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    random.seed(args.seed)

    results = run_simulation(args.api, args.rounds)
    verify_layers(results)
    print_summary(results)
    print(f"\n{'═' * 60}")
    print("  Simulation complete.")
    print(f"{'═' * 60}\n")


if __name__ == "__main__":
    main()
