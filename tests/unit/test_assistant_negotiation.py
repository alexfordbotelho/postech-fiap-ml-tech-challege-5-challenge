"""Unit tests for the negotiation agent (prompt building + objection detection)."""
import pytest

from src.assistant.negotiation import build_negotiation_prompt, is_objection


# ── Objection detection ───────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "text",
    [
        "Muito caro, não vou contratar",
        "Esse produto não vale o preço cobrado",
        "Não quero, prefiro não assinar agora",
        "Caro demais para o meu bolso atual",
        "Sem interesse no momento por conta do custo alto",
        "Taxa alta, melhor não pegar esse empréstimo",
    ],
)
def test_objection_detected(text: str) -> None:
    assert is_objection(text) is True


@pytest.mark.parametrize(
    "text",
    [
        "Quero contratar a poupança premium",
        "Qual é a taxa de rendimento?",
        "Tenho interesse, me explique mais",
        "Pode simular o empréstimo para mim?",
    ],
)
def test_no_objection(text: str) -> None:
    assert is_objection(text) is False


# ── Prompt building ───────────────────────────────────────────────────────────


def test_build_negotiation_prompt_contains_offer() -> None:
    prompt = build_negotiation_prompt(
        offer="premium_savings",
        objection="muito caro",
        client_features={"age": 45, "balance": 3000},
        policy_doc="# Premium\nRendimento 110% da poupança.",
        segment="senior",
    )
    assert "premium_savings" in prompt
    assert "muito caro" in prompt


def test_build_negotiation_prompt_contains_client_features() -> None:
    prompt = build_negotiation_prompt(
        offer="personal_loan",
        objection="não quero",
        client_features={"age": 32, "balance": 1500, "housing": "yes"},
        policy_doc="# Empréstimo\nTaxa a partir de 1,99% ao mês.",
        segment="mid_low_risk",
    )
    assert "age" in prompt
    assert "mid_low_risk" in prompt
    assert "Empréstimo" in prompt


def test_build_negotiation_prompt_with_empty_features() -> None:
    prompt = build_negotiation_prompt(
        offer="savings_account",
        objection="sem interesse",
        client_features={},
        policy_doc="# Poupança\nLiquidez diária.",
        segment="default",
    )
    assert "Poupança" in prompt
    assert "sem interesse" in prompt
    assert "default" in prompt
