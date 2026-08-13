#!/usr/bin/env -S uv run python3
"""
Streaming event generator — continuously sends decide+reward pairs to the API.

Runs N async workers in parallel, each looping: decide → reward → repeat.
Displays a live dashboard with real-time throughput, reward rates, and
per-policy/per-segment breakdown.

Usage:
    python scripts/event_stream.py [OPTIONS]

    --workers   N     Concurrent async workers (default: 20)
    --rate      N     Max events/sec total, 0 = unlimited (default: 0)
    --api       URL   API base URL (default: http://localhost:8001)
    --seed      N     Random seed (default: 42)
    --no-reward       Skip reward feedback (decide-only mode)
    --segment   SEG   Only use this segment profile (e.g. young)
    --policy    POL   Fix policy for all workers

Examples:
    # Fast unlimited streaming — 20 workers
    python scripts/event_stream.py

    # Stress test — 50 workers, no rate limit
    python scripts/event_stream.py --workers 50

    # Focused on young segment to fill experiment quickly
    python scripts/event_stream.py --segment young --workers 30

    # Throttled at 10 events/sec for step-by-step observation
    python scripts/event_stream.py --rate 10 --workers 4
"""
from __future__ import annotations

import argparse
import asyncio
import random
import signal
import sys
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Deque

import httpx
from rich import box
from rich.columns import Columns
from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table

# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_API     = "http://localhost:8001"
DEFAULT_WORKERS = 20
REFRESH_RATE    = 4   # display refreshes per second
RATE_WINDOW     = 5.0 # seconds to compute rolling events/sec

POLICIES = [
    "contextual_thompson",
    "contextual_ucb",
    "thompson",
    "ucb",
    "baseline",
]

CHANNELS = ["web", "mobile", "email", "call_center"]

CHANNEL_MULT: dict[str, float] = {
    "web": 1.0,
    "mobile": 1.15,
    "email": 0.90,
    "call_center": 0.75,
}

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

SEGMENT_PROFILES: dict[str, list[dict]] = {
    "young": [
        {"age": 22, "education": "secondary",    "housing": "no",  "loan": "no",  "balance": 300,  "job": "student"},
        {"age": 26, "education": "high.school",  "housing": "no",  "loan": "no",  "balance": 450,  "job": "technician"},
        {"age": 28, "education": "tertiary",     "housing": "no",  "loan": "no",  "balance": 600,  "job": "services"},
    ],
    "senior_high_edu": [
        {"age": 55, "education": "tertiary",             "housing": "no",  "loan": "no",  "balance": 3500, "job": "management"},
        {"age": 62, "education": "university.degree",    "housing": "no",  "loan": "no",  "balance": 5000, "job": "retired"},
        {"age": 48, "education": "professional.course",  "housing": "no",  "loan": "no",  "balance": 2800, "job": "self-employed"},
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


def _segment_for(p: dict) -> str:
    age, edu, housing, loan, balance = (
        p["age"], p["education"], p["housing"], p["loan"], p["balance"]
    )
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


def _reward(arm: str, profile: dict, channel: str) -> float:
    seg  = _segment_for(profile)
    prob = SEGMENT_ARM_RATES[seg].get(arm, 0.10) * CHANNEL_MULT.get(channel, 1.0)
    return 1.0 if random.random() < min(prob, 0.95) else 0.0


# ── Stats ─────────────────────────────────────────────────────────────────────

@dataclass
class Stats:
    total_decide: int = 0
    total_reward: int = 0
    total_reward_sum: float = 0.0
    errors_decide: int = 0
    errors_reward: int = 0
    latency_ms: Deque[float] = field(default_factory=lambda: deque(maxlen=200))
    by_policy:  dict[str, dict[str, float]] = field(default_factory=lambda: defaultdict(lambda: {"n": 0, "r": 0.0}))
    by_segment: dict[str, dict[str, float]] = field(default_factory=lambda: defaultdict(lambda: {"n": 0, "r": 0.0}))
    by_arm:     dict[str, dict[str, float]] = field(default_factory=lambda: defaultdict(lambda: {"n": 0, "r": 0.0}))
    # rolling window: (timestamp, count) for events/sec
    _ts_window: Deque[float] = field(default_factory=lambda: deque(maxlen=2000))
    started_at: float = field(default_factory=time.time)

    def record_decide(self, policy: str, arm: str, segment: str, reward: float, latency: float) -> None:
        self.total_decide += 1
        self.total_reward_sum += reward
        self.latency_ms.append(latency)
        self._ts_window.append(time.time())
        self.by_policy[policy]["n"]  += 1
        self.by_policy[policy]["r"]  += reward
        self.by_segment[segment]["n"] += 1
        self.by_segment[segment]["r"] += reward
        self.by_arm[arm]["n"]         += 1
        self.by_arm[arm]["r"]         += reward

    @property
    def events_per_sec(self) -> float:
        now = time.time()
        cutoff = now - RATE_WINDOW
        recent = sum(1 for t in self._ts_window if t >= cutoff)
        elapsed = min(now - self.started_at, RATE_WINDOW)
        return recent / elapsed if elapsed > 0 else 0.0

    @property
    def avg_reward(self) -> float:
        return self.total_reward_sum / self.total_decide if self.total_decide else 0.0

    @property
    def p50_latency(self) -> float:
        if not self.latency_ms:
            return 0.0
        s = sorted(self.latency_ms)
        return s[len(s) // 2]

    @property
    def p95_latency(self) -> float:
        if not self.latency_ms:
            return 0.0
        s = sorted(self.latency_ms)
        return s[int(len(s) * 0.95)]


# ── Worker ────────────────────────────────────────────────────────────────────

async def worker(
    _id: int,
    client: httpx.AsyncClient,
    stats: Stats,
    shutdown: asyncio.Event,
    fixed_policy: str | None,
    fixed_segment: str | None,
    no_reward: bool,
    rate_limiter: asyncio.Semaphore | None,
) -> None:
    while not shutdown.is_set():
        if rate_limiter:
            await rate_limiter.acquire()

        # Pick context
        if fixed_segment:
            profile = random.choice(SEGMENT_PROFILES[fixed_segment])
        else:
            _, profile = random.choice(ALL_PROFILES)

        policy  = fixed_policy or random.choice(POLICIES)
        channel = random.choice(CHANNELS)
        segment = _segment_for(profile)

        # ── decide ────────────────────────────────────────────────────────────
        t0 = time.perf_counter()
        try:
            resp = await client.post(
                "/decide/",
                json={"features": profile, "policy": policy, "channel": channel},
            )
            resp.raise_for_status()
            decision = resp.json()
        except Exception:
            stats.errors_decide += 1
            await asyncio.sleep(0.1)
            continue

        latency = (time.perf_counter() - t0) * 1000
        arm         = decision["offer_id"]
        decision_id = decision["decision_id"]
        reward      = _reward(arm, profile, channel)

        stats.record_decide(policy, arm, segment, reward, latency)

        if no_reward:
            continue

        # ── reward ────────────────────────────────────────────────────────────
        try:
            fb = await client.post(
                "/reward/",
                json={"decision_id": decision_id, "reward": reward},
            )
            fb.raise_for_status()
            stats.total_reward += 1
        except Exception:
            stats.errors_reward += 1


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

def _pct(n: int, total: int) -> str:
    return f"{n / total * 100:.1f}%" if total else "—"


def _rate_color(r: float) -> str:
    if r >= 0.20:  return "green"
    if r >= 0.12:  return "yellow"
    return "red"


def build_display(stats: Stats, workers: int) -> Layout:
    elapsed = time.time() - stats.started_at
    eps     = stats.events_per_sec
    errors  = stats.errors_decide + stats.errors_reward

    # ── Header panel ──────────────────────────────────────────────────────────
    h = Table.grid(padding=(0, 2))
    h.add_column(style="bold cyan")
    h.add_column()
    h.add_column(style="bold cyan")
    h.add_column()
    h.add_row("Events/s",  f"[bold green]{eps:>7.1f}[/]",  "Total decisions", f"[bold]{stats.total_decide:>10,}[/]")
    h.add_row("Avg reward", f"[bold]{stats.avg_reward:>6.2%}[/]",  "Total rewards",   f"{stats.total_reward:>10,}")
    h.add_row("p50 lat",   f"{stats.p50_latency:>6.1f}ms", "Errors",           f"[red]{errors:>10,}[/]" if errors else f"{errors:>10,}")
    h.add_row("p95 lat",   f"{stats.p95_latency:>6.1f}ms", "Uptime",           f"{int(elapsed//60)}m{int(elapsed%60):02d}s")
    header = Panel(h, title=f"[bold]Bandit Event Stream[/] — {workers} workers", border_style="bright_blue")

    # ── Policy table ──────────────────────────────────────────────────────────
    pol_t = Table(box=box.SIMPLE_HEAD, show_header=True, header_style="bold magenta", padding=(0, 1))
    pol_t.add_column("Política",   style="cyan",  no_wrap=True)
    pol_t.add_column("Decisões",   justify="right")
    pol_t.add_column("%",          justify="right")
    pol_t.add_column("Avg Reward", justify="right")

    for pol in POLICIES:
        d = stats.by_policy.get(pol, {"n": 0, "r": 0.0})
        n = int(d["n"]); r = d["r"] / n if n else 0.0
        color = _rate_color(r)
        pol_t.add_row(
            pol,
            f"{n:,}",
            _pct(n, stats.total_decide),
            f"[{color}]{r:.2%}[/]",
        )

    # ── Segment table ─────────────────────────────────────────────────────────
    seg_t = Table(box=box.SIMPLE_HEAD, show_header=True, header_style="bold magenta", padding=(0, 1))
    seg_t.add_column("Segmento",   style="cyan",  no_wrap=True)
    seg_t.add_column("Decisões",   justify="right")
    seg_t.add_column("%",          justify="right")
    seg_t.add_column("Avg Reward", justify="right")

    for seg in SEGMENT_ARM_RATES:
        d = stats.by_segment.get(seg, {"n": 0, "r": 0.0})
        n = int(d["n"]); r = d["r"] / n if n else 0.0
        color = _rate_color(r)
        seg_t.add_row(
            seg,
            f"{n:,}",
            _pct(n, stats.total_decide),
            f"[{color}]{r:.2%}[/]",
        )

    # ── Arm table ─────────────────────────────────────────────────────────────
    arm_t = Table(box=box.SIMPLE_HEAD, show_header=True, header_style="bold magenta", padding=(0, 1))
    arm_t.add_column("Braço",      style="cyan",  no_wrap=True)
    arm_t.add_column("Seleções",   justify="right")
    arm_t.add_column("%",          justify="right")
    arm_t.add_column("Avg Reward", justify="right")
    arm_t.add_column("Barra",      no_wrap=True)

    sorted_arms = sorted(stats.by_arm.items(), key=lambda x: -x[1]["n"])
    for arm, d in sorted_arms:
        n = int(d["n"]); r = d["r"] / n if n else 0.0
        share = n / stats.total_decide if stats.total_decide else 0.0
        bar   = "█" * int(share * 30)
        color = _rate_color(r)
        arm_t.add_row(
            arm,
            f"{n:,}",
            _pct(n, stats.total_decide),
            f"[{color}]{r:.2%}[/]",
            f"[{color}]{bar}[/]",
        )

    layout = Layout()
    layout.split_column(
        Layout(header, size=8),
        Layout(
            Columns([
                Panel(pol_t, title="Por Política", border_style="blue"),
                Panel(seg_t, title="Por Segmento", border_style="blue"),
            ]),
            size=len(POLICIES) + 6,
        ),
        Layout(Panel(arm_t, title="Por Braço (convergência do bandit)", border_style="blue")),
    )
    return layout


# ── Main ──────────────────────────────────────────────────────────────────────

async def main(args: argparse.Namespace) -> None:
    console = Console()
    stats   = Stats()
    shutdown = asyncio.Event()

    # Graceful shutdown on SIGINT / SIGTERM
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, shutdown.set)

    # Health check
    async with httpx.AsyncClient(base_url=args.api, timeout=10.0) as hc:
        try:
            r = await hc.get("/healthz")
            r.raise_for_status()
            console.print(f"[green]✓[/] API ok — {args.api}  {r.json()}")
        except Exception as e:
            console.print(f"[red]✗ API inacessível:[/] {e}\n  → docker compose up -d")
            sys.exit(1)

    # Rate limiter semaphore
    rate_limiter: asyncio.Semaphore | None = None
    refill_task: asyncio.Task | None = None
    if args.rate > 0:
        rate_limiter = asyncio.Semaphore(0)
        refill_task  = asyncio.create_task(token_refill(rate_limiter, args.rate, shutdown))
        console.print(f"[cyan]Rate limit:[/] {args.rate} events/sec")

    console.print(f"[cyan]Workers:[/] {args.workers}  |  [cyan]Segment:[/] {args.segment or 'todos'}  |  [cyan]Policy:[/] {args.policy or 'aleatória'}")
    console.print("[dim]Ctrl+C para parar[/]\n")

    limits = httpx.Limits(max_connections=args.workers + 4, max_keepalive_connections=args.workers)
    async with httpx.AsyncClient(
        base_url=args.api,
        timeout=httpx.Timeout(10.0, connect=3.0),
        limits=limits,
    ) as client:
        worker_tasks = [
            asyncio.create_task(
                worker(i, client, stats, shutdown, args.policy, args.segment,
                       args.no_reward, rate_limiter)
            )
            for i in range(args.workers)
        ]

        with Live(build_display(stats, args.workers), refresh_per_second=REFRESH_RATE, console=console) as live:
            while not shutdown.is_set():
                await asyncio.sleep(1.0 / REFRESH_RATE)
                live.update(build_display(stats, args.workers))

        # Drain workers
        for t in worker_tasks:
            t.cancel()
        if refill_task:
            refill_task.cancel()
        await asyncio.gather(*worker_tasks, return_exceptions=True)

    # Final summary
    console.rule("[bold]Resumo Final")
    console.print(f"Decisões enviadas : [bold]{stats.total_decide:,}[/]")
    console.print(f"Rewards enviados  : [bold]{stats.total_reward:,}[/]")
    console.print(f"Avg reward        : [bold]{stats.avg_reward:.2%}[/]")
    console.print(f"Erros             : [red]{stats.errors_decide + stats.errors_reward}[/]")
    top_arm = max(stats.by_arm, key=lambda a: stats.by_arm[a]["n"], default="—")
    console.print(f"Braço mais escolhido: [green]{top_arm}[/]")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Streaming event generator for the bandit platform",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--workers",   type=int,   default=DEFAULT_WORKERS, help="Concurrent async workers")
    p.add_argument("--rate",      type=float, default=0,               help="Max events/sec (0=unlimited)")
    p.add_argument("--api",       default=DEFAULT_API,                 help="API base URL")
    p.add_argument("--seed",      type=int,   default=42,              help="Random seed")
    p.add_argument("--no-reward", action="store_true",                 help="Skip reward feedback")
    p.add_argument("--segment",   choices=list(SEGMENT_ARM_RATES),     help="Fix segment for all workers")
    p.add_argument("--policy",    choices=POLICIES,                    help="Fix policy for all workers")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    random.seed(args.seed)
    asyncio.run(main(args))
