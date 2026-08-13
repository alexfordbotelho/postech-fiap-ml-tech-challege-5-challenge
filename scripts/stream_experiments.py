#!/usr/bin/env -S uv run python3
"""
Experiment-aware streaming generator.

Fetches all running experiments from the API and assigns workers to each one
using profiles/channels that are guaranteed to match that experiment's targeting.
This ensures EVERY active experiment accumulates decisions — including catch-all
experiments that compete with more-specific ones in the normal stream.

Usage:
    python scripts/stream_experiments.py [OPTIONS]

    --workers-per-exp N   Workers allocated per experiment (default: 5)
    --api             URL  API base URL (default: http://localhost:8001)
    --rate            N   Max events/sec total, 0=unlimited (default: 0)

Examples:
    python scripts/stream_experiments.py
    python scripts/stream_experiments.py --workers-per-exp 10
"""
from __future__ import annotations

import argparse
import asyncio
import random
import signal
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque

import httpx
from rich import box
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.table import Table

DEFAULT_API           = "http://localhost:8001"
DEFAULT_WORKERS_PER   = 5
REFRESH_RATE          = 4
RATE_WINDOW           = 5.0

ALL_CHANNELS = ["web", "mobile", "email", "call_center"]

SEGMENT_PROFILES: dict[str, list[dict]] = {
    "young": [
        {"age": 22, "education": "secondary",   "housing": "no",  "loan": "no",  "balance": 300,  "job": "student"},
        {"age": 26, "education": "high.school",  "housing": "no",  "loan": "no",  "balance": 450,  "job": "technician"},
        {"age": 28, "education": "tertiary",     "housing": "no",  "loan": "no",  "balance": 600,  "job": "services"},
    ],
    "senior_high_edu": [
        {"age": 55, "education": "tertiary",            "housing": "no",  "loan": "no",  "balance": 3500, "job": "management"},
        {"age": 62, "education": "university.degree",   "housing": "no",  "loan": "no",  "balance": 5000, "job": "retired"},
        {"age": 48, "education": "professional.course", "housing": "no",  "loan": "no",  "balance": 2800, "job": "self-employed"},
    ],
    "senior": [
        {"age": 50, "education": "secondary", "housing": "yes", "loan": "no",  "balance": 800,  "job": "blue-collar"},
        {"age": 58, "education": "primary",   "housing": "no",  "loan": "no",  "balance": 400,  "job": "retired"},
        {"age": 65, "education": "secondary", "housing": "yes", "loan": "no",  "balance": 1200, "job": "retired"},
    ],
    "mid_indebted": [
        {"age": 35, "education": "secondary", "housing": "yes", "loan": "yes", "balance": 200,  "job": "blue-collar"},
        {"age": 40, "education": "secondary", "housing": "yes", "loan": "yes", "balance": 500,  "job": "services"},
        {"age": 38, "education": "tertiary",  "housing": "yes", "loan": "yes", "balance": 300,  "job": "technician"},
    ],
    "mid_low_risk": [
        {"age": 33, "education": "tertiary",          "housing": "no",  "loan": "no",  "balance": 2500, "job": "management"},
        {"age": 42, "education": "university.degree", "housing": "no",  "loan": "no",  "balance": 4000, "job": "admin."},
        {"age": 37, "education": "secondary",         "housing": "yes", "loan": "no",  "balance": 1800, "job": "technician"},
    ],
    "default": [
        {"age": 32, "education": "secondary", "housing": "no", "loan": "no", "balance": 700,  "job": "services"},
        {"age": 44, "education": "secondary", "housing": "no", "loan": "no", "balance": 900,  "job": "blue-collar"},
        {"age": 39, "education": "primary",   "housing": "no", "loan": "no", "balance": 400,  "job": "entrepreneur"},
    ],
}

ALL_PROFILES: list[tuple[str, dict]] = [
    (seg, p) for seg, profiles in SEGMENT_PROFILES.items() for p in profiles
]


def _pick_profile_for_exp(exp: dict) -> tuple[dict, str]:
    """Return (features, channel) that matches this experiment's targeting."""
    segs = exp.get("targeting_segments") or []
    chs  = exp.get("targeting_channels")  or []

    valid_segs = segs if segs else list(SEGMENT_PROFILES.keys())
    valid_chs  = chs  if chs  else ALL_CHANNELS

    seg     = random.choice(valid_segs)
    channel = random.choice(valid_chs)
    profile = random.choice(SEGMENT_PROFILES.get(seg, SEGMENT_PROFILES["default"]))
    return profile, channel


# ── Stats ─────────────────────────────────────────────────────────────────────

@dataclass
class ExpStats:
    name: str
    decisions: int = 0
    rewards: int   = 0
    reward_sum: float = 0.0
    errors: int    = 0
    _ts: Deque[float] = field(default_factory=lambda: deque(maxlen=500))
    started: float = field(default_factory=time.time)

    @property
    def avg_reward(self) -> float:
        return self.reward_sum / self.decisions if self.decisions else 0.0

    @property
    def eps(self) -> float:
        now = time.time()
        cutoff = now - RATE_WINDOW
        recent = sum(1 for t in self._ts if t >= cutoff)
        elapsed = min(now - self.started, RATE_WINDOW)
        return recent / elapsed if elapsed > 0 else 0.0


@dataclass
class GlobalStats:
    by_exp: dict[str, ExpStats] = field(default_factory=dict)
    total: int  = 0
    errors: int = 0
    started: float = field(default_factory=time.time)


# ── Worker ────────────────────────────────────────────────────────────────────

SEGMENT_ARM_RATES: dict[str, dict[str, float]] = {
    "young":         {"savings_account": 0.12, "term_deposit_6m": 0.20, "term_deposit_12m": 0.08, "personal_loan": 0.11, "premium_savings": 0.09},
    "senior_high_edu": {"savings_account": 0.09, "term_deposit_6m": 0.18, "term_deposit_12m": 0.35, "personal_loan": 0.06, "premium_savings": 0.28},
    "senior":        {"savings_account": 0.10, "term_deposit_6m": 0.16, "term_deposit_12m": 0.25, "personal_loan": 0.07, "premium_savings": 0.22},
    "mid_indebted":  {"savings_account": 0.14, "term_deposit_6m": 0.10, "term_deposit_12m": 0.06, "personal_loan": 0.30, "premium_savings": 0.07},
    "mid_low_risk":  {"savings_account": 0.13, "term_deposit_6m": 0.18, "term_deposit_12m": 0.20, "personal_loan": 0.08, "premium_savings": 0.22},
    "default":       {"savings_account": 0.11, "term_deposit_6m": 0.14, "term_deposit_12m": 0.16, "personal_loan": 0.10, "premium_savings": 0.13},
}
CHANNEL_MULT = {"web": 1.0, "mobile": 1.15, "email": 0.90, "call_center": 0.75}

_HIGH_EDU = {"tertiary", "university.degree", "professional.course"}

def _segment_for(p: dict) -> str:
    age, edu, housing, loan, balance = (p["age"], p["education"], p["housing"], p["loan"], p["balance"])
    if age < 30:         return "young"
    if age >= 45:        return "senior_high_edu" if edu in _HIGH_EDU else "senior"
    if housing == "yes" and loan == "yes": return "mid_indebted"
    if balance > 1000:   return "mid_low_risk"
    return "default"

def _reward(arm: str, profile: dict, channel: str) -> float:
    seg  = _segment_for(profile)
    prob = SEGMENT_ARM_RATES[seg].get(arm, 0.10) * CHANNEL_MULT.get(channel, 1.0)
    return 1.0 if random.random() < min(prob, 0.95) else 0.0


async def worker(
    exp: dict,
    client: httpx.AsyncClient,
    gstats: GlobalStats,
    shutdown: asyncio.Event,
    rate_limiter: asyncio.Semaphore | None,
) -> None:
    exp_id = exp["id"]
    policy = exp.get("experiment_policy") or "contextual_thompson"
    estats   = gstats.by_exp[exp_id]

    while not shutdown.is_set():
        if rate_limiter:
            await rate_limiter.acquire()

        profile, channel = _pick_profile_for_exp(exp)

        try:
            resp = await client.post(
                "/decide/",
                json={"features": profile, "policy": policy, "channel": channel},
            )
            resp.raise_for_status()
            decision = resp.json()
        except Exception:
            estats.errors += 1
            gstats.errors += 1
            await asyncio.sleep(0.1)
            continue

        arm         = decision["offer_id"]
        decision_id = decision["decision_id"]
        reward      = _reward(arm, profile, channel)

        estats.decisions  += 1
        estats.reward_sum += reward
        estats._ts.append(time.time())
        gstats.total += 1

        try:
            fb = await client.post("/reward/", json={"decision_id": decision_id, "reward": reward})
            fb.raise_for_status()
            estats.rewards += 1
        except Exception:
            estats.errors += 1


# ── Rate limiter ──────────────────────────────────────────────────────────────

async def token_refill(sem: asyncio.Semaphore, rate: float, shutdown: asyncio.Event) -> None:
    interval = 1.0 / rate
    while not shutdown.is_set():
        try:
            sem.release()
        except ValueError:
            pass
        await asyncio.sleep(interval)


# ── Display ───────────────────────────────────────────────────────────────────

STATUS_COLORS = {"running": "green", "stopped": "slate", "draft": "yellow"}

def build_display(gstats: GlobalStats, workers_per: int, experiments: list[dict]) -> Panel:
    elapsed = time.time() - gstats.started
    total_eps = sum(e.eps for e in gstats.by_exp.values())

    t = Table(box=box.SIMPLE_HEAD, show_header=True, header_style="bold magenta", padding=(0, 1))
    t.add_column("Experimento",   style="cyan",  no_wrap=True, max_width=36)
    t.add_column("Decisões",      justify="right")
    t.add_column("Ev/s",          justify="right")
    t.add_column("Avg Reward",    justify="right")
    t.add_column("Erros",         justify="right")
    t.add_column("Segmentos",     style="dim", no_wrap=True, max_width=24)
    t.add_column("Canais",        style="dim", no_wrap=True, max_width=28)

    for exp in experiments:
        eid   = exp["id"]
        estat = gstats.by_exp.get(eid)
        if estat is None:
            continue
        segs  = ", ".join(exp.get("targeting_segments") or []) or "[italic]todos[/]"
        chs   = ", ".join(exp.get("targeting_channels")  or []) or "[italic]todos[/]"
        eps   = f"{estat.eps:.1f}"
        rew   = f"{estat.avg_reward:.1%}" if estat.decisions else "—"
        color = "green" if estat.avg_reward >= 0.15 else "yellow" if estat.avg_reward >= 0.10 else "red"
        errs  = f"[red]{estat.errors}[/]" if estat.errors else "0"
        t.add_row(
            estat.name[:36],
            f"{estat.decisions:,}",
            eps,
            f"[{color}]{rew}[/]",
            errs,
            segs[:24],
            chs[:28],
        )

    uptime = f"{int(elapsed//60)}m{int(elapsed%60):02d}s"
    title  = (
        f"[bold]Experiment Stream[/] — {workers_per} workers/exp | "
        f"total {gstats.total:,} decisões | {total_eps:.1f} ev/s | {uptime}"
    )
    return Panel(t, title=title, border_style="bright_blue")


# ── Main ──────────────────────────────────────────────────────────────────────

async def main(args: argparse.Namespace) -> None:
    console  = Console()
    shutdown = asyncio.Event()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, shutdown.set)

    async with httpx.AsyncClient(base_url=args.api, timeout=10.0) as hc:
        try:
            r = await hc.get("/healthz")
            r.raise_for_status()
            console.print(f"[green]✓[/] API ok — {args.api}")
        except Exception as e:
            console.print(f"[red]✗ API inacessível:[/] {e}")
            sys.exit(1)

        try:
            r = await hc.get("/experiments/?status=running")
            r.raise_for_status()
            experiments: list[dict] = r.json()
        except Exception as e:
            console.print(f"[red]✗ Erro ao listar experimentos:[/] {e}")
            sys.exit(1)

    if not experiments:
        console.print("[yellow]Nenhum experimento em execução. Crie e inicie um experimento primeiro.[/]")
        sys.exit(0)

    console.print(f"[cyan]{len(experiments)} experimento(s) em execução:[/]")
    for exp in experiments:
        segs = exp.get("targeting_segments") or ["(todos)"]
        chs  = exp.get("targeting_channels")  or ["(todos)"]
        console.print(f"  • [bold]{exp['name']}[/] — segs: {segs} | canais: {chs}")
    console.print()

    gstats = GlobalStats()
    for exp in experiments:
        gstats.by_exp[exp["id"]] = ExpStats(name=exp["name"][:36])

    rate_limiter: asyncio.Semaphore | None = None
    refill_task: asyncio.Task | None       = None
    if args.rate > 0:
        rate_limiter = asyncio.Semaphore(0)
        refill_task  = asyncio.create_task(token_refill(rate_limiter, args.rate, shutdown))

    total_workers = len(experiments) * args.workers_per_exp
    limits = httpx.Limits(max_connections=total_workers + 4, max_keepalive_connections=total_workers)

    async with httpx.AsyncClient(
        base_url=args.api,
        timeout=httpx.Timeout(10.0, connect=3.0),
        limits=limits,
    ) as client:
        tasks = [
            asyncio.create_task(worker(exp, client, gstats, shutdown, rate_limiter))
            for exp in experiments
            for _ in range(args.workers_per_exp)
        ]

        with Live(build_display(gstats, args.workers_per_exp, experiments),
                  refresh_per_second=REFRESH_RATE, console=console) as live:
            while not shutdown.is_set():
                await asyncio.sleep(1.0 / REFRESH_RATE)
                live.update(build_display(gstats, args.workers_per_exp, experiments))

        for t in tasks:
            t.cancel()
        if refill_task:
            refill_task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    console.rule("[bold]Resumo Final")
    for exp in experiments:
        est = gstats.by_exp[exp["id"]]
        console.print(f"[cyan]{est.name}[/]: {est.decisions:,} decisões | avg reward {est.avg_reward:.1%} | erros {est.errors}")
    console.print(f"Total: [bold]{gstats.total:,}[/] decisões")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Experiment-aware streaming event generator")
    p.add_argument("--workers-per-exp", type=int,   default=DEFAULT_WORKERS_PER, help="Workers per experiment")
    p.add_argument("--rate",            type=float, default=0,                   help="Max events/sec total (0=unlimited)")
    p.add_argument("--api",             default=DEFAULT_API,                     help="API base URL")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(main(args))
