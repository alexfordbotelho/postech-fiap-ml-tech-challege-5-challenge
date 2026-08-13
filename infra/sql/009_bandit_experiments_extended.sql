-- Add experiment orchestration columns to bandit_experiments
ALTER TABLE bandit_experiments
    ADD COLUMN IF NOT EXISTS experiment_policy    TEXT NOT NULL DEFAULT 'contextual_thompson',
    ADD COLUMN IF NOT EXISTS experiment_arms      TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS targeting_segments   TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS targeting_channels   TEXT[] NOT NULL DEFAULT '{}';
