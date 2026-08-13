#!/usr/bin/env -S uv run python3
"""
Flag analytics streaming generator.

Fetches enabled feature flags, evaluates all segment×channel combinations locally to
find distinct flag_snapshot patterns, then runs dedicated workers per pattern so every
flag rule branch (including the default) produces data in flag_events for analytics.

Usage:
    python scripts/stream_flags.py [OPTIONS]

    --workers N    Workers per distinct snapshot pattern (default: 3)
    --rate    N    Max events/sec total, 0=unlimited (default: 0)
    --api     URL  API base URL (default: http://localhost:8001)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import re
import signal
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque

import httpx
from rich import box
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.table import Table

DEFAULT_API      = "http://localhost:8001"
DEFAULT_WORKERS  = 3
REFRESH_RATE     = 4
RATE_WINDOW      = 5.0

ALL_CHANNELS = ["web", "mobile", "email", "call_center"]

SEGMENT_PROFILES: dict[str, list[dict]] = {
    "young": [
        {"age": 22, "education": "secondary",          "housing": "no",  "loan": "no",  "balance": 300,  "job": "student"},
        {"age": 26, "education": "high.school",        "housing": "no",  "loan": "no",  "balance": 450,  "job": "technician"},
        {"age": 28, "education": "tertiary",           "housing": "no",  "loan": "no",  "balance": 600,  "job": "services"},
    ],
    "senior_high_edu": [
        {"age": 55, "education": "tertiary",           "housing": "no",  "loan": "no",  "balance": 3500, "job": "management"},
        {"age": 62, "education": "university.degree",  "housing": "no",  "loan": "no",  "balance": 5000, "job": "retired"},
    ],
    "senior": [
        {"age": 50, "education": "secondary",          "housing": "yes", "loan": "no",  "balance": 800,  "job": "blue-collar"},
        {"age": 58, "education": "primary",            "housing": "no",  "loan": "no",  "balance": 400,  "job": "retired"},
    ],
    "mid_indebted": [
        {"age": 35, "education": "secondary",          "housing": "yes", "loan": "yes", "balance": 200,  "job": "blue-collar"},
        {"age": 40, "education": "secondary",          "housing": "yes", "loan": "yes", "balance": 500,  "job": "services"},
    ],
    "mid_low_risk": [
        {"age": 33, "education": "tertiary",           "housing": "no",  "loan": "no",  "balance": 2500, "job": "management"},
        {"age": 42, "education": "university.degree",  "housing": "no",  "loan": "no",  "balance": 4000, "job": "admin."},
    ],
    "default": [
        {"age": 32, "education": "secondary",          "housing": "no",  "loan": "no",  "balance": 700,  "job": "services"},
        {"age": 44, "education": "secondary",          "housing": "no",  "loan": "no",  "balance": 900,  "job": "blue-collar"},
    ],
}

SEGMENT_ARM_RATES: dict[str, dict[str, float]] = {
    "young":           {"savings_account": 0.12, "term_deposit_6m": 0.20, "term_deposit_12m": 0.08, "personal_loan": 0.11, "premium_savings": 0.09},
    "senior_high_edu": {"savings_account": 0.09, "term_deposit_6m": 0.18, "term_deposit_12m": 0.35, "personal_loan": 0.06, "premium_savings": 0.28},
    "senior":          {"savings_account": 0.10, "term_deposit_6m": 0.16, "term_deposit_12m": 0.25, "personal_loan": 0.07, "premium_savings": 0.22},
    "mid_indebted":    {"savings_account": 0.14, "term_deposit_6m": 0.10, "term_deposit_12m": 0.06, "personal_loan": 0.30, "premium_savings": 0.07},
    "mid_low_risk":    {"savings_account": 0.13, "term_deposit_6m": 0.18, "term_deposit_12m": 0.20, "personal_loan": 0.08, "premium_savings": 0.22},
    "default":         {"savings_account": 0.11, "term_deposit_6m": 0.14, "term_deposit_12m": 0.16, "personal_loan": 0.10, "premium_savings": 0.13},
}
CHANNEL_MULT = {"web": 1.0, "mobile": 1.15, "email": 0.90, "call_center": 0.75}

_HIGH_EDU = {"tertiary", "university.degree", "professional.course"}


def _segment_for(p: dict) -> str:
    age, edu, housing, loan, balance = p["age"], p["education"], p["housing"], p["loan"], p["balance"]
    if age < 30:
        return "young"
    if age >= 45:
        return "senior_high_edu" if edu in _HIGH_EDU else "senior"
    if housing == "yes" and loan == "yes":
        return "mid_indebted"
    if balance > 1000:
        return "mid_low_risk"
    return "default"


def _reward(arm: str, profile: dict, channel: str) -> float:
    seg  = _segment_for(profile)
    prob = SEGMENT_ARM_RATES[seg].get(arm, 0.10) * CHANNEL_MULT.get(channel, 1.0)
    return 1.0 if random.random() < min(prob, 0.95) else 0.0


# ── Local flag evaluator (mirrors src/services/flag_engine.py exactly) ────────

def _parse(raw: Any) -> Any:
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return raw
    return raw


def _eval_op(op: str, actual: Any, expected: Any) -> bool:
    match op:
        case "$eq":   return actual == expected
        case "$ne":   return actual != expected
        case "$in":   return actual in expected
        case "$nin":  return actual not in expected
        case "$gt":   return actual is not None and actual > expected
        case "$lt":   return actual is not None and actual < expected
        case "$gte":  return actual is not None and actual >= expected
        case "$lte":  return actual is not None and actual <= expected
        case "$regex":return bool(re.search(expected, str(actual or "")))
        case _:       return False


def _eval_attr(attr: str, ops: Any, ctx: dict) -> bool:
    actual = ctx.get(attr)
    if not isinstance(ops, dict):
        return actual == ops
    return all(_eval_op(op, actual, exp) for op, exp in ops.items())


def _local_evaluate(flag: dict, ctx: dict) -> Any:
    """Exact mirror of evaluate_flag() from flag_engine.py."""
    if not flag.get("enabled", True):
        return _parse(flag.get("default_value"))
    for rule in flag.get("rules") or []:
        condition = rule.get("condition") or {}
        if not condition or all(_eval_attr(a, o, ctx) for a, o in condition.items()):
            return _parse(rule.get("value"))
    return _parse(flag.get("default_value"))


def predict_snapshot(flags: list[dict], seg: str, channel: str) -> dict[str, Any]:
    ctx = {"segment": seg, "channel": channel}
    return {f["flag_key"]: _local_evaluate(f, ctx) for f in flags if f.get("enabled")}


# ── Scenario ──────────────────────────────────────────────────────────────────

@dataclass
class Scenario:
    seg: str
    channel: str
    snapshot: dict[str, Any]   # locally predicted flag_snapshot

    @property
    def key(self) -> str:
        return f"{self.seg}+{self.channel}"

    @property
    def label(self) -> str:
        return f"{self.seg}/{self.channel}"


def build_scenarios(flags: list[dict]) -> list[Scenario]:
    """
    One Scenario per segment×channel combination (all 24).

    No deduplication: every segment must appear in flag_events so that
    the /flag-scenarios/profile analytics (flag_value × segment breakdown)
    is complete. Scenarios with identical snapshots just produce more rows
    for the same pattern, which is fine.
    """
    return [
        Scenario(seg=seg, channel=ch, snapshot=predict_snapshot(flags, seg, ch))
        for seg in SEGMENT_PROFILES
        for ch in ALL_CHANNELS
    ]


def varying_flag_keys(scenarios: list[Scenario]) -> set[str]:
    """Return flag keys whose value differs across at least two scenarios."""
    value_sets: dict[str, set[str]] = {}
    for sc in scenarios:
        for k, v in sc.snapshot.items():
            value_sets.setdefault(k, set()).add(json.dumps(v, default=str))
    return {k for k, vs in value_sets.items() if len(vs) > 1}


# ── Stats ─────────────────────────────────────────────────────────────────────

@dataclass
class ScenStats:
    key: str
    decisions: int = 0
    reward_sum: float = 0.0
    errors: int = 0
    _ts: Deque[float] = field(default_factory=lambda: deque(maxlen=500))
    started: float = field(default_factory=time.time)

    @property
    def avg_reward(self) -> float:
        return self.reward_sum / self.decisions if self.decisions else 0.0

    @property
    def eps(self) -> float:
        now    = time.time()
        cutoff = now - RATE_WINDOW
        recent = sum(1 for t in self._ts if t >= cutoff)
        elapsed = min(now - self.started, RATE_WINDOW)
        return recent / elapsed if elapsed > 0 else 0.0


@dataclass
class GlobalStats:
    by_scenario: dict[str, ScenStats] = field(default_factory=dict)
    total: int = 0
    errors: int = 0
    started: float = field(default_factory=time.time)


# ── Worker ────────────────────────────────────────────────────────────────────

async def worker(
    sc: Scenario,
    client: httpx.AsyncClient,
    gstats: GlobalStats,
    shutdown: asyncio.Event,
    rate_limiter: asyncio.Semaphore | None,
) -> None:
    sstats = gstats.by_scenario[sc.key]

    while not shutdown.is_set():
        if rate_limiter:
            await rate_limiter.acquire()

        profile = random.choice(SEGMENT_PROFILES[sc.seg])
        try:
            resp = await client.post(
                "/decide/",
                json={"features": profile, "policy": "contextual_thompson", "channel": sc.channel},
            )
            resp.raise_for_status()
            decision = resp.json()
        except Exception:
            sstats.errors += 1
            gstats.errors += 1
            await asyncio.sleep(0.2)
            continue

        arm         = decision["offer_id"]
        decision_id = decision["decision_id"]
        reward      = _reward(arm, profile, sc.channel)

        sstats.decisions  += 1
        sstats.reward_sum += reward
        sstats._ts.append(time.time())
        gstats.total += 1

        try:
            fb = await client.post("/reward/", json={"decision_id": decision_id, "reward": reward})
            fb.raise_for_status()
        except Exception:
            sstats.errors += 1


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

def _fmt_value(v: Any) -> str:
    if isinstance(v, list):
        return f"[{len(v)} arms]"
    if isinstance(v, bool):
        return "T" if v else "F"
    if v is None:
        return "null"
    s = str(v)
    return s[:18] if len(s) > 18 else s


def _snap_cols(snap: dict, vkeys: set[str]) -> str:
    """Show only flag keys that vary across scenarios (most informative)."""
    parts = [f"{k}={_fmt_value(v)}" for k, v in snap.items() if k in vkeys]
    if not parts:
        parts = [f"{k}={_fmt_value(v)}" for k, v in list(snap.items())[:2]]
    return "  ".join(parts)[:50]


def build_display(
    gstats: GlobalStats,
    scenarios: list[Scenario],
    vkeys: set[str],
    workers_n: int,
) -> Panel:
    elapsed   = time.time() - gstats.started
    total_eps = sum(s.eps for s in gstats.by_scenario.values())
    uptime    = f"{int(elapsed//60)}m{int(elapsed%60):02d}s"

    t = Table(box=box.SIMPLE_HEAD, show_header=True, header_style="bold magenta", padding=(0, 1))
    t.add_column("Cenário",        style="cyan",   no_wrap=True, max_width=22)
    t.add_column("Flags (pred.)",  style="dim",    no_wrap=True, max_width=50)
    t.add_column("Decisões",       justify="right")
    t.add_column("Ev/s",           justify="right")
    t.add_column("Conv%",          justify="right")
    t.add_column("Erros",          justify="right")

    for sc in scenarios:
        ss = gstats.by_scenario.get(sc.key)
        if ss is None:
            continue

        eps   = f"{ss.eps:.1f}"
        conv  = f"{ss.avg_reward:.1%}" if ss.decisions else "—"
        color = "green" if ss.avg_reward >= 0.15 else "yellow" if ss.avg_reward >= 0.08 else "red"
        errs  = f"[red]{ss.errors}[/]" if ss.errors else "0"

        t.add_row(
            sc.label,
            _snap_cols(sc.snapshot, vkeys),
            f"{ss.decisions:,}",
            eps,
            f"[{color}]{conv}[/]",
            errs,
        )

    title = (
        f"[bold]Flag Analytics Stream[/] — {workers_n} workers/cenário | "
        f"{len(scenarios)} cenários | "
        f"{gstats.total:,} decisões | {total_eps:.1f} ev/s | {uptime}"
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
            r = await hc.get("/flags/")
            r.raise_for_status()
            raw_flags: list[dict] = r.json()
        except Exception as e:
            console.print(f"[red]✗ Erro ao listar flags:[/] {e}")
            sys.exit(1)

    enabled = [f for f in raw_flags if f.get("enabled")]
    if not enabled:
        console.print("[yellow]Nenhuma flag habilitada encontrada.[/]")
        sys.exit(0)

    scenarios = build_scenarios(enabled)
    vkeys     = varying_flag_keys(scenarios)

    console.print(
        f"[cyan]{len(enabled)} flag(s) ativas | "
        f"{len(scenarios)} cenários ({len(SEGMENT_PROFILES)} segmentos × {len(ALL_CHANNELS)} canais)[/]"
    )
    console.print(f"[dim]Flags com variação entre cenários: {', '.join(sorted(vkeys)) or '(nenhuma)'}[/]")
    console.print()
    for sc in scenarios:
        console.print(f"  • [bold]{sc.label}[/]  {_snap_cols(sc.snapshot, vkeys)}")
    console.print()

    gstats = GlobalStats()
    for sc in scenarios:
        gstats.by_scenario[sc.key] = ScenStats(key=sc.key)

    rate_limiter: asyncio.Semaphore | None = None
    refill_task:  asyncio.Task | None      = None
    if args.rate > 0:
        rate_limiter = asyncio.Semaphore(0)
        refill_task  = asyncio.create_task(token_refill(rate_limiter, float(args.rate), shutdown))

    total_w = len(scenarios) * args.workers
    limits  = httpx.Limits(max_connections=total_w + 4, max_keepalive_connections=total_w)

    async with httpx.AsyncClient(
        base_url=args.api,
        timeout=httpx.Timeout(10.0, connect=3.0),
        limits=limits,
    ) as client:
        tasks = [
            asyncio.create_task(worker(sc, client, gstats, shutdown, rate_limiter))
            for sc in scenarios
            for _ in range(args.workers)
        ]

        with Live(
            build_display(gstats, scenarios, vkeys, args.workers),
            refresh_per_second=REFRESH_RATE,
            console=console,
        ) as live:
            while not shutdown.is_set():
                await asyncio.sleep(1.0 / REFRESH_RATE)
                live.update(build_display(gstats, scenarios, vkeys, args.workers))

        for task in tasks:
            task.cancel()
        if refill_task:
            refill_task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    console.rule("[bold]Resumo Final")
    for sc in scenarios:
        ss = gstats.by_scenario[sc.key]
        console.print(
            f"[cyan]{sc.label}[/]: {ss.decisions:,} decisões | "
            f"conv {ss.avg_reward:.1%} | erros {ss.errors}"
        )
    console.print(f"\nTotal: [bold]{gstats.total:,}[/] decisões | erros {gstats.errors}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Flag analytics streaming event generator")
    p.add_argument("--workers", type=int,   default=DEFAULT_WORKERS, help="Workers per snapshot pattern (default: 3)")
    p.add_argument("--rate",    type=float, default=0,               help="Max total events/sec, 0=unlimited (default: 0)")
    p.add_argument("--api",                 default=DEFAULT_API)
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(main(args))
