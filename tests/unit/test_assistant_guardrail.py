"""Unit tests for the financial domain guardrail."""
import pytest

from src.assistant.guardrail import guardrail_rejection_message, is_financial_question


# ── Allowed (financial) questions ─────────────────────────────────────────────


@pytest.mark.parametrize(
    "question",
    [
        "Qual produto tem a maior taxa de conversão?",
        "O cliente é elegível para o empréstimo pessoal?",
        "Explique a política de poupança premium.",
        "Qual é o rendimento do term_deposit_12m?",
        "Como funciona o algoritmo bandit Thompson?",
        "Qual a taxa de exploração do experimento atual?",
        "Mostre as métricas comparativas das políticas.",
        "O cliente tem saldo suficiente para a poupança premium?",
        "Por que esse produto custa esse valor?",
        "Quais são os critérios de suitability?",
        "Não quero contratar pois acho o custo alto",
        "ok",  # short question passes by default
    ],
)
def test_financial_questions_pass(question: str) -> None:
    assert is_financial_question(question) is True


# ── Blocked (off-topic) questions ─────────────────────────────────────────────


@pytest.mark.parametrize(
    "question",
    [
        "Me dá uma receita de bolo de chocolate por favor que ficou delicioso.",
        "Quem vai ganhar o futebol hoje neste jogo importante de campeonato?",
        "Qual é o melhor game de RPG para jogar no final de semana longo?",
        "Como está o clima em São Paulo amanhã pela manhã cedo?",
        "Recomende um filme de ação para assistir no cinema esta semana.",
    ],
)
def test_off_topic_questions_blocked(question: str) -> None:
    assert is_financial_question(question) is False


# ── Edge cases ────────────────────────────────────────────────────────────────


def test_short_question_passes_regardless() -> None:
    assert is_financial_question("Por quê?") is True


def test_empty_string_passes_as_short() -> None:
    # Empty falls under short-question threshold
    assert is_financial_question("") is True


def test_rejection_message_is_non_empty() -> None:
    msg = guardrail_rejection_message()
    assert len(msg) > 20
    assert "financeiro" in msg.lower() or "financeiros" in msg.lower()
