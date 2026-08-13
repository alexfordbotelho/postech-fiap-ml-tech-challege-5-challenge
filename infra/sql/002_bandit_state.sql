-- Persists bandit algorithm parameters between restarts
CREATE TABLE IF NOT EXISTS bandit_state (
    policy_name VARCHAR(50) PRIMARY KEY,
    state       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial state for all policies
INSERT INTO bandit_state (policy_name, state) VALUES
    ('thompson', '{"alpha": {}, "beta": {}}'),
    ('ucb',      '{"counts": {}, "values": {}, "total_pulls": 0}'),
    ('baseline', '{}')
ON CONFLICT (policy_name) DO NOTHING;
