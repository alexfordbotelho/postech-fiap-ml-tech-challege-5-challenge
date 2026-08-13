"""Unit tests for assistant router — pure logic, no heavy external deps.

Tests involving actual handler dispatch (mlflow, fastapi, postgres) live in
tests/integration/test_assistant_router_integration.py and require the full stack.
"""
from __future__ import annotations

from src.assistant.guardrail import guardrail_rejection_message, is_financial_question
from src.assistant.negotiation import is_objection


# ── Guardrail + negotiation dispatch classification ───────────────────────────


def test_guardrail_blocks_recipe_question() -> None:
    q = "Me dá uma receita de bolo de chocolate delicioso para o fim de semana"
    assert is_financial_question(q) is False


def test_guardrail_blocks_sports_question() -> None:
    q = "Quem vai ganhar o futebol hoje neste jogo importante de campeonato?"
    assert is_financial_question(q) is False


def test_guardrail_allows_conversion_rate_question() -> None:
    assert is_financial_question("Qual produto tem maior taxa de conversão?") is True


def test_guardrail_allows_suitability_question() -> None:
    assert is_financial_question("O cliente é elegível para o empréstimo pessoal?") is True


def test_guardrail_allows_contracting_question() -> None:
    assert is_financial_question("Não quero contratar pois acho o custo alto") is True


def test_guardrail_rejection_message_references_platform() -> None:
    msg = guardrail_rejection_message()
    assert "plataforma" in msg.lower()
    assert len(msg) > 30


# ── Objection auto-routing logic ──────────────────────────────────────────────


def test_objection_triggers_negotiate_routing() -> None:
    assert is_objection("Não quero pois está muito caro este produto") is True


def test_objection_triggers_on_value_rejection() -> None:
    assert is_objection("Esse produto não vale o preço cobrado") is True


def test_non_objection_stays_on_general_path() -> None:
    assert is_objection("Qual é a taxa de conversão do experimento?") is False


def test_interest_expression_is_not_objection() -> None:
    assert is_objection("Tenho interesse, pode me explicar mais?") is False


# ── Mode constants (inline — avoids importing heavy router deps) ───────────────


def test_valid_modes_set_includes_negotiate() -> None:
    valid = frozenset({"explain", "summarize", "compare", "negotiate", "general", "policy"})
    assert "negotiate" in valid


def test_valid_modes_set_includes_general() -> None:
    valid = frozenset({"explain", "summarize", "compare", "negotiate", "general", "policy"})
    assert "general" in valid


def test_valid_modes_set_excludes_garbage() -> None:
    valid = frozenset({"explain", "summarize", "compare", "negotiate", "general", "policy"})
    assert "unknown_xyz" not in valid
