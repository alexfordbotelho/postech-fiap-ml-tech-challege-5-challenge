# Produto: Empréstimo Pessoal (personal_loan)

## Descrição
Crédito pessoal sem garantia com taxa a partir de 1,99% ao mês.
Prazo: 12 a 48 meses. Liberação em até 2 horas após aprovação.

## Público-alvo
- Clientes com comprometimento moderado de renda (housing=yes, sem loan ativo)
- Perfil mid-age (30-44) com necessidade de liquidez
- Segmento mid_low_risk em situação de gasto pontual (médico, educação, reforma)

## Benefícios
- Aprovação rápida por score interno
- Sem alienação de bens
- Portabilidade de crédito aceita

## Restrições de suitability
- BLOQUEADO para clientes com housing=yes E loan=yes (endividamento duplo)
- Score mínimo: 500 pontos
- Renda mínima comprovada: R$ 1.500/mês

## Taxa de conversão histórica
- Média geral: 11%
- Segmento mid_indebted: 6% (reduzida por restrição de suitability)
- Segmento mid_low_risk: 15%

## Regras de oferta
- Jamais ofertar para clientes com housing=yes e loan=yes (regra hard-coded em suitability.py)
- Prioridade em campanhas de cross-sell para clientes com utilização de cartão > 70%
