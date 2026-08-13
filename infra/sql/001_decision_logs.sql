-- Decision logs: every /decide call writes one row here
CREATE TABLE IF NOT EXISTS decision_logs (
    decision_id      UUID PRIMARY KEY,
    timestamp        TIMESTAMPTZ NOT NULL DEFAULT now(),
    policy_name      VARCHAR(50) NOT NULL
                         CHECK (policy_name IN ('baseline', 'thompson', 'ucb')),
    arm_selected     VARCHAR(100) NOT NULL,
    context_features JSONB NOT NULL,
    reward           FLOAT,                    -- NULL until /reward is called
    is_exploration   BOOLEAN NOT NULL DEFAULT false,
    session_id       UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_logs_timestamp  ON decision_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_decision_logs_policy     ON decision_logs (policy_name);
CREATE INDEX IF NOT EXISTS idx_decision_logs_arm        ON decision_logs (arm_selected);
CREATE INDEX IF NOT EXISTS idx_decision_logs_session    ON decision_logs (session_id);
