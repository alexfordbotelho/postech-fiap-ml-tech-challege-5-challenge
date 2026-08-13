"""Financial domain guardrail — rejects questions outside the application scope.

Two-layer check:
  1. Fast keyword blocklist (immediate reject for clearly off-topic)
  2. Keyword allowlist (accept if any financial term found)
  3. Short/ambiguous questions pass by default (context is assumed)

This runs before any LLM call so there is zero token cost for blocked requests.
"""
from __future__ import annotations

_FINANCIAL_TERMS = frozenset({
    # Produtos financeiros
    "produto", "oferta", "emprestimo", "empréstimo", "poupança", "poupanca",
    "deposito", "depósito", "conta", "credito", "crédito", "investimento",
    "rendimento", "juros", "taxa", "tarifa", "cashback", "cartao", "cartão",
    "portfólio", "portfolio", "patrimônio", "patrimonio", "renda", "saldo",
    # Plataforma / bandit
    "bandit", "decisao", "decisão", "experimento", "experimentos", "politica",
    "política", "algoritmo", "thompson", "ucb", "conversao", "conversão",
    "reward", "recompensa", "exploração", "exploracao", "segmento", "canal",
    "campanha", "elegibilidade", "suitability", "mlflow", "métrica", "metrica",
    # Contratação / negociação
    "contratar", "contrato", "contratação", "oferta", "proposta", "negociar",
    "negociação", "objecao", "objeção", "preco", "preço", "custo", "valor",
    "vantagem", "beneficio", "benefício", "desconto", "parcela", "prazo",
    # Perfil de cliente
    "cliente", "perfil", "score", "histórico", "historico", "financeiro",
    "bancario", "bancário",
})

_BLOCKED_TERMS = frozenset({
    "receita", "culinária", "culinaria", "futebol", "esporte", "game",
    "jogo", "videogame", "clima", "tempo", "musica", "música", "filme",
    "série", "serie", "viagem", "turismo", "política partidária", "eleição",
    "eleicao", "religião", "religiao",
})

_MAX_SHORT_QUESTION = 60


def is_financial_question(question: str) -> bool:
    """Return True when the question is within the financial/platform domain."""
    lower = question.lower()

    if any(term in lower for term in _BLOCKED_TERMS):
        return False

    if len(question) <= _MAX_SHORT_QUESTION:
        return True

    return any(term in lower for term in _FINANCIAL_TERMS)


def guardrail_rejection_message() -> str:
    return (
        "Posso responder apenas perguntas relacionadas a produtos financeiros, "
        "experimentos, políticas e decisões desta plataforma de ofertas bancárias."
    )
