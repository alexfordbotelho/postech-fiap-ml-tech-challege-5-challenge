"""RAG retriever for the LLM assistant.

Implements keyword-based relevance scoring to select the most relevant policy
documents for a given query — avoids injecting all 5 docs into every prompt.

No external vector-store dependencies: uses pure Python string/regex operations.
The scorer combines two signals:
  1. Arm-name keyword boost  — direct product mentions get +10 per hit
  2. Word-overlap frequency  — remaining query words scored by count in content

For the current corpus size (5 docs, ~2 KB each) this is fast enough at every
request and produces results that are on par with BM25 for single-topic queries.
"""
from __future__ import annotations

import re
from pathlib import Path

POLICY_DOCS_DIR = Path(__file__).parent.parent.parent / "datasets" / "policy_docs"

# Per-arm keyword hints for fast signal detection in user queries
_ARM_KEYWORDS: dict[str, list[str]] = {
    "savings_account": [
        "poupança", "poupanca", "savings", "conta poupança", "conta poupanca",
    ],
    "term_deposit_6m": [
        "cdb 6", "cdb6", "6 meses", "seis meses", "6m", "102% cdi", "term_deposit_6m",
    ],
    "term_deposit_12m": [
        "cdb 12", "cdb12", "12 meses", "doze meses", "12m", "108% cdi", "term_deposit_12m",
    ],
    "personal_loan": [
        "empréstimo", "emprestimo", "loan", "crédito pessoal", "credito pessoal", "pessoal",
    ],
    "premium_savings": [
        "premium", "poupança premium", "poupanca premium", "cashback", "premium_savings",
    ],
}


def rank_policy_docs(query: str, top_k: int = 3) -> str:
    """Return the top-k most relevant policy docs for the query.

    Falls back to all docs when no signal can differentiate them (all scores equal).
    """
    q = query.lower()
    scored: list[tuple[float, str]] = []

    for path in sorted(POLICY_DOCS_DIR.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        score = _score(q, content.lower(), path.stem)
        scored.append((score, content))

    scored.sort(reverse=True)

    # If all scores are equal there is no signal — return everything
    if len({s for s, _ in scored}) == 1:
        return "\n\n---\n\n".join(c for _, c in scored)

    return "\n\n---\n\n".join(c for _, c in scored[:top_k])


def get_policy_docs_for_arms(arms: list[str]) -> str:
    """Return policy docs for a specific list of arm names (exact match by file stem)."""
    docs: list[str] = []
    for arm in arms:
        path = POLICY_DOCS_DIR / f"{arm}.md"
        if path.exists():
            docs.append(path.read_text(encoding="utf-8"))
        else:
            docs.append(f"# {arm}\nDocumento de política não encontrado.")
    return "\n\n---\n\n".join(docs) if docs else "Nenhum documento de política encontrado."


# ── Internal helpers ───────────────────────────────────────────────────────────


def _score(query: str, content: str, arm_stem: str) -> float:
    """Keyword overlap score with arm-name boost."""
    score = 0.0

    # Arm-specific keyword boost (high weight — direct intent signal)
    for kw in _ARM_KEYWORDS.get(arm_stem, []):
        if kw in query:
            score += 10.0

    # Word-level overlap (low weight — context signal)
    query_words = [w for w in re.split(r"\W+", query) if len(w) > 3]
    for word in query_words:
        score += content.count(word) * 0.1

    return score
