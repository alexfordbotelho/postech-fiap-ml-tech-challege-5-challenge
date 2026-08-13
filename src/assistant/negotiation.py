"""Offer argumentation agent — handles client price/value objections.

Triggered automatically when mode="negotiate" OR when the guardrail detects
objection patterns in a contracting context (custo/valor/preco/nao quero).
"""
from __future__ import annotations

from typing import Any

from src.assistant.llm import chat

SYSTEM_NEGOTIATE = """\
Você é um consultor financeiro sênior especializado em argumentação ética de ofertas.
Ajude o cliente a compreender o valor real do produto, tratando a objeção de forma empática e factual.

Estrutura obrigatória:

## Reconhecimento
[Uma frase reconhecendo a preocupação do cliente sem invalidá-la]

## Valor real do produto
[O que o produto oferece em termos concretos: rendimento, liquidez, custo efetivo — use dados do contexto]

## Resposta à objeção
[Argumento direto contra a objeção com dado específico do contexto]

## Proposta
[Uma ação concreta: simulação, período de teste, comparativo numérico]

Regras de conteúdo:
- Use somente dados do perfil e da documentação fornecidos
- Nunca crie urgência artificial nem pressione eticamente
- Nunca invente taxas, prazos ou benefícios não presentes no contexto

Regras de formatação:
- Markdown puro: ##/###, listas, tabelas, negrito em valores
- Separador ---  (nunca ***)
- Sem emojis
- Responda em Português (Brasil)
"""

_OBJECTION_SIGNALS = frozenset({
    "muito caro", "caro demais", "não vale", "nao vale", "não quero", "nao quero",
    "prefiro não", "prefiro nao", "sem interesse", "não preciso", "nao preciso",
    "não tenho dinheiro", "nao tenho", "melhor não", "melhor nao",
    "por que esse preço", "esse custo", "esse valor", "cobrado", "taxa alta",
})


def is_objection(text: str) -> bool:
    """Return True when the text looks like a cost/value objection."""
    lower = text.lower()
    return any(signal in lower for signal in _OBJECTION_SIGNALS)


def build_negotiation_prompt(
    offer: str,
    objection: str,
    client_features: dict[str, Any],
    policy_doc: str,
    segment: str,
) -> str:
    features_lines = "\n".join(f"  - {k}: {v}" for k, v in client_features.items()) or "  (não informado)"
    return (
        f"## Produto ofertado\n{offer}\n\n"
        f"## Objeção do cliente\n{objection}\n\n"
        f"## Perfil do cliente\n"
        f"  Segmento: {segment}\n"
        f"{features_lines}\n\n"
        f"## Documentação do produto\n{policy_doc}\n\n"
        "Elabore uma argumentação personalizada, empática e factual para superar esta objeção."
    )


async def negotiate(
    offer: str,
    objection: str,
    client_features: dict[str, Any],
    policy_doc: str,
    segment: str,
    session_id: str | None = None,
) -> tuple[str, str | None]:
    """Call the LLM with a negotiation-specialized prompt."""
    user_msg = build_negotiation_prompt(offer, objection, client_features, policy_doc, segment)
    return await chat(SYSTEM_NEGOTIATE, user_msg, session_id=session_id)
