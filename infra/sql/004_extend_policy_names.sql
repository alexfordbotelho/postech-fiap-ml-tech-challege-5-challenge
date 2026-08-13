-- Extend policy_name CHECK constraint to include contextual variants
ALTER TABLE decision_logs DROP CONSTRAINT IF EXISTS decision_logs_policy_name_check;

ALTER TABLE decision_logs
    ADD CONSTRAINT decision_logs_policy_name_check
    CHECK (policy_name IN (
        'baseline', 'deterministic',
        'thompson', 'contextual_thompson',
        'ucb', 'ucb1', 'contextual_ucb'
    ));

-- Pre-seed bandit state for new contextual policies (empty initial state)
INSERT INTO bandit_state (policy_name, state)
VALUES
    ('contextual_thompson', '{}'),
    ('contextual_ucb', '{}')
ON CONFLICT (policy_name) DO NOTHING;
