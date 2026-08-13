-- Flags missing from the initial seed that web-product references
-- + cta_button_color A/B test flag with segment-based rules

INSERT INTO feature_flags (flag_key, description, flag_type, default_value, rules, enabled, tags)
VALUES
(
    'adaptive_policy_enabled',
    'Ativa o sistema adaptativo (bandit) na página de produto — habilita chamada /decide/ e recomendações de IA',
    'boolean',
    'false',
    '[]',
    true,
    ARRAY['page:product', 'page:all', 'bandit']
),
(
    'simplified_checkout',
    'Exibe checkout simplificado (2 passos em vez de 3)',
    'boolean',
    'false',
    '[]',
    false,
    ARRAY['page:product', 'checkout']
),
(
    'show_rate_simulator',
    'Exibe simulador de rendimento na página do produto',
    'boolean',
    'false',
    '[]',
    false,
    ARRAY['page:product', 'ui']
),
(
    'cta_button_color',
    'Teste A/B: cor do botão CTA principal. Variante A=#FFD100 (controle/amarelo), Variante B=#22C55E (tratamento/verde). Regras por segmento de usuário.',
    'string',
    '"#FFD100"',
    '[
        {"condition": {"segment": {"$in": ["young", "mid_indebted"]}}, "value": "#22C55E"},
        {"value": "#FFD100"}
    ]',
    true,
    ARRAY['page:product', 'page:all', 'ab-test', 'ui']
)
ON CONFLICT (flag_key) DO NOTHING;
