-- Feature flags: declarative flag management without deploys
CREATE TABLE IF NOT EXISTS feature_flags (
    flag_key        TEXT PRIMARY KEY,
    description     TEXT NOT NULL DEFAULT '',
    flag_type       TEXT NOT NULL DEFAULT 'string'
                        CHECK (flag_type IN ('boolean', 'string', 'number', 'json')),
    default_value   JSONB NOT NULL DEFAULT 'null',
    rules           JSONB NOT NULL DEFAULT '[]',
    enabled         BOOLEAN NOT NULL DEFAULT true,
    tags            TEXT[] NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit trail for every flag change
CREATE TABLE IF NOT EXISTS flag_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    flag_key        TEXT NOT NULL,
    event           TEXT NOT NULL,   -- created | updated | toggled | deleted
    changed_by      TEXT NOT NULL DEFAULT 'system',
    old_value       JSONB,
    new_value       JSONB,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flag_audit_key  ON flag_audit_log (flag_key);
CREATE INDEX IF NOT EXISTS idx_flag_audit_time ON flag_audit_log (changed_at DESC);

-- Bandit experiments: A/B tests and bandit policy comparisons
-- (named bandit_experiments to avoid conflict with MLflow's experiments table)
CREATE TABLE IF NOT EXISTS bandit_experiments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    hypothesis      TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'running', 'stopped', 'archived')),
    metric_primary  TEXT NOT NULL DEFAULT 'avg_reward',
    targeting       JSONB NOT NULL DEFAULT '{}',
    variations      JSONB NOT NULL DEFAULT '[]',
    traffic_split   JSONB NOT NULL DEFAULT '{}',
    winner          TEXT,
    started_at      TIMESTAMPTZ,
    stopped_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bandit_exp_status  ON bandit_experiments (status);
CREATE INDEX IF NOT EXISTS idx_bandit_exp_created ON bandit_experiments (created_at DESC);

-- Link decisions to bandit experiments for result calculation
ALTER TABLE decision_logs
    ADD COLUMN IF NOT EXISTS bandit_experiment_id UUID REFERENCES bandit_experiments(id),
    ADD COLUMN IF NOT EXISTS variation_id         TEXT;

CREATE INDEX IF NOT EXISTS idx_decision_bandit_exp ON decision_logs (bandit_experiment_id)
    WHERE bandit_experiment_id IS NOT NULL;

-- Webhooks registry
CREATE TABLE IF NOT EXISTS webhooks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url         TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    events      TEXT[] NOT NULL DEFAULT '{}',
    secret      TEXT,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default flags
INSERT INTO feature_flags (flag_key, description, flag_type, default_value, rules, tags)
VALUES
(
    'active_policy',
    'Política de bandit ativa — pode ser sobrescrita por segmento ou canal',
    'string',
    '"contextual_thompson"',
    '[
        {"condition": {"segment": "senior_high_edu"}, "value": "contextual_thompson"},
        {"condition": {"segment": "mid_indebted"},    "value": "contextual_thompson"},
        {"condition": {"channel": "call_center"},     "value": "baseline"},
        {"value": "contextual_thompson"}
    ]',
    ARRAY['bandit', 'policy']
),
(
    'bandit_arms_enabled',
    'Lista de braços disponíveis para oferta',
    'json',
    '["savings_account","term_deposit_6m","term_deposit_12m","personal_loan","premium_savings"]',
    '[]',
    ARRAY['bandit', 'arms']
),
(
    'exploration_boost',
    'Multiplicador de exploração mínima por canal',
    'json',
    '{"web": 1.0, "mobile": 1.2, "email": 0.8, "call_center": 0.5}',
    '[]',
    ARRAY['bandit', 'exploration']
),
(
    'channel_comparison_chart',
    'Exibe gráfico de comparação por canal no dashboard',
    'boolean',
    'true',
    '[]',
    ARRAY['ui', 'dashboard']
),
(
    'mlops_tab_enabled',
    'Exibe aba MLOps na navegação',
    'boolean',
    'true',
    '[]',
    ARRAY['ui']
)
ON CONFLICT (flag_key) DO NOTHING;
