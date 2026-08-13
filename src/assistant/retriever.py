"""Context retriever for the LLM assistant.

Each mode fetches different structured context:
  - explain:    specific decision context + arm policy doc + bandit state
  - experiment: experiment metadata + per-arm results + MLflow runs + policy docs
  - advise:     client features + classified segment + bandit state + ranked policy docs
  - evaluate:   full experiment report context (same data as experiment, different prompt)
  - summarize:  last N MLflow runs for a policy
  - compare:    aggregated metrics for all policies from PostgreSQL
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

POLICY_DOCS_DIR = Path(__file__).parent.parent.parent / "datasets" / "policy_docs"


# ── Policy document loaders ────────────────────────────────────────────────────


def get_policy_doc(arm: str) -> str:
    """Load the markdown policy document for an arm, or return a stub."""
    path = POLICY_DOCS_DIR / f"{arm}.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return f"# {arm}\nNo policy document found."


def get_all_policy_docs() -> str:
    """Concatenate all policy docs into one context block."""
    docs = []
    for path in sorted(POLICY_DOCS_DIR.glob("*.md")):
        docs.append(path.read_text(encoding="utf-8"))
    return "\n\n---\n\n".join(docs) if docs else "No policy documents found."


# ── Decision context (explain mode) ───────────────────────────────────────────


def format_decision_context(decision: dict[str, Any], state: dict[str, Any], segment: str) -> str:
    """Format a decision + policy state for the explain prompt."""
    lines = [
        f"**Decision ID:** {decision['decision_id']}",
        f"**Arm selected:** {decision['arm_selected']}",
        f"**Policy:** {decision['policy_name']}",
        f"**Segment:** {segment}",
        f"**Is exploration:** {decision['is_exploration']}",
        f"**Reward received:** {decision.get('reward', 'not yet rewarded')}",
        "",
        "**Client features at decision time:**",
        json.dumps(decision.get("context_features", {}), ensure_ascii=False, indent=2),
        "",
        "**Current policy state (relevant segment):**",
        json.dumps(_extract_segment_state(state, segment), indent=2),
    ]
    return "\n".join(lines)


# ── Experiment context (experiment / evaluate modes) ───────────────────────────


def format_experiment_context(
    experiment: dict[str, Any],
    decisions: list[dict[str, Any]],
    mlflow_summary: str,
    policy_docs: str,
) -> str:
    """Build rich context block for the experiment and evaluate modes."""
    arms = experiment.get("experiment_arms") or []
    segments = experiment.get("targeting_segments") or ["todos"]
    channels = experiment.get("targeting_channels") or ["todos"]

    lines = [
        f"## Experimento: {experiment.get('name', 'N/A')}",
        f"**ID:** {experiment.get('id', 'N/A')}",
        f"**Status:** {experiment.get('status', 'N/A')}",
        f"**Descrição:** {experiment.get('description') or 'Não especificada'}",
        f"**Hipótese:** {experiment.get('hypothesis') or 'Não especificada'}",
        f"**Política do algoritmo:** {experiment.get('experiment_policy', 'N/A')}",
        f"**Braços testados:** {', '.join(arms) if arms else 'Todos os braços'}",
        f"**Segmentos-alvo:** {', '.join(segments)}",
        f"**Canais-alvo:** {', '.join(channels)}",
        f"**Winner declarado:** {experiment.get('winner') or 'Não declarado ainda'}",
        f"**Iniciado em:** {experiment.get('started_at') or 'N/A'}",
        f"**Encerrado em:** {experiment.get('stopped_at') or 'Em andamento'}",
        "",
        "## Desempenho por Braço (Produto)",
    ]

    if decisions:
        total_decisions = sum(int(d.get("n", 0)) for d in decisions)
        for d in decisions:
            n = int(d.get("n", 0))
            rewarded = int(d.get("rewarded", 0))
            avg = float(d.get("avg_reward", 0))
            expl = int(d.get("explorations", 0))
            conv_rate = round(rewarded / max(n, 1) * 100, 1)
            share = round(n / max(total_decisions, 1) * 100, 1)
            lines.append(
                f"- **{d['variation_id']}**: {n} decisões ({share}% do tráfego), "
                f"{rewarded} conversões ({conv_rate}%), "
                f"recompensa média={avg:.4f}, explorações={expl}"
            )
        lines.append(f"\n**Total de decisões no experimento:** {total_decisions}")
    else:
        lines.append("- Sem dados de decisões para este experimento (experimento pode estar em draft).")

    lines += [
        "",
        "## Histórico MLflow (política do experimento)",
        mlflow_summary,
        "",
        "## Políticas dos Produtos Testados",
        policy_docs,
    ]
    return "\n".join(lines)


# ── Advice context (advise mode) ───────────────────────────────────────────────


def format_advice_context(
    client_features: dict[str, Any],
    segment: str,
    bandit_state: dict[str, Any],
    policy_docs: str,
) -> str:
    """Build context block for the personalized advice mode."""
    segment_state = _extract_segment_state(bandit_state, segment)

    # Interpret bandit state into human-readable probabilities (best-effort)
    arm_probs = _bandit_state_to_probs(segment_state)

    lines = [
        "## Perfil do Cliente",
        json.dumps(client_features, ensure_ascii=False, indent=2),
        f"**Segmento classificado pelo sistema:** {segment}",
        "",
        "## Indicação atual do algoritmo bandit para este segmento",
    ]

    if arm_probs:
        for arm, info in arm_probs.items():
            lines.append(f"- **{arm}**: {info}")
    else:
        lines.append("- Estado do algoritmo não disponível.")

    lines += [
        "",
        "## Políticas e Regras de Elegibilidade dos Produtos",
        policy_docs,
    ]
    return "\n".join(lines)


# ── MLflow summary (summarize mode) ───────────────────────────────────────────


def format_mlflow_summary(runs: list[dict[str, Any]], policy: str) -> str:
    """Format recent MLflow runs for the summarize prompt."""
    if not runs:
        return f"No MLflow runs found for policy: {policy}"

    lines = [f"**MLflow experiment summary for policy: {policy}**", f"Total recent runs: {len(runs)}", ""]
    for r in runs[:10]:
        info = r.get("info", {})
        metrics = {m["key"]: round(m["value"], 4) for m in r.get("data", {}).get("metrics", [])}
        lines.append(f"- Run `{info.get('run_id', '')[:8]}`: {metrics}")
    return "\n".join(lines)


# ── Policy comparison (compare mode) ──────────────────────────────────────────


def format_comparison(metrics_by_policy: dict[str, dict[str, Any]]) -> str:
    """Format multi-policy comparison for the compare prompt."""
    lines = ["**Policy comparison (from PostgreSQL decision_logs):**", ""]
    for policy, m in metrics_by_policy.items():
        lines.append(
            f"- **{policy}**: decisions={m.get('total_decisions', 0)}, "
            f"cum_reward={m.get('cumulative_reward', 0):.1f}, "
            f"avg_reward={m.get('avg_reward', 0):.4f}, "
            f"exploration={m.get('exploration_rate', 0):.1%}"
        )
    return "\n".join(lines)


# ── Internal helpers ───────────────────────────────────────────────────────────


def _extract_segment_state(state: dict[str, Any], segment: str) -> dict[str, Any]:
    """Pull only the segment-relevant slice of contextual policy state."""
    alpha = state.get("alpha", {})
    beta = state.get("beta", {})
    counts = state.get("counts", {})
    values = state.get("values", {})

    if alpha and isinstance(next(iter(alpha.values()), None), dict):
        return {"alpha": alpha.get(segment, {}), "beta": beta.get(segment, {})}
    if counts and isinstance(next(iter(counts.values()), None), dict):
        return {"counts": counts.get(segment, {}), "values": values.get(segment, {})}
    if alpha:
        return {"alpha": alpha, "beta": beta}
    if counts:
        return {"counts": counts, "values": values}
    return state


def _bandit_state_to_probs(segment_state: dict[str, Any]) -> dict[str, str]:
    """Convert bandit state to readable strings for the LLM context."""
    result: dict[str, str] = {}

    alpha = segment_state.get("alpha", {})
    beta_vals = segment_state.get("beta", {})
    counts = segment_state.get("counts", {})
    values = segment_state.get("values", {})

    if alpha and beta_vals:
        # Thompson Sampling: alpha/(alpha+beta) = estimated success probability
        for arm in alpha:
            a = float(alpha.get(arm, 1))
            b = float(beta_vals.get(arm, 1))
            prob = round(a / (a + b) * 100, 1)
            result[arm] = f"prob. estimada de conversão ≈ {prob}% (α={a:.0f}, β={b:.0f})"
    elif counts and values:
        # UCB1: show average reward and pull count
        for arm in counts:
            c = int(counts.get(arm, 0))
            v = float(values.get(arm, 0))
            avg = round(v / max(c, 1), 4)
            result[arm] = f"recompensa média={avg:.4f} em {c} seleções"

    return result
