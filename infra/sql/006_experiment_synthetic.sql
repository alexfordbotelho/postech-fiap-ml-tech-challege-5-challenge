-- Add synthetic data flag to bandit_experiments
ALTER TABLE bandit_experiments
    ADD COLUMN IF NOT EXISTS synthetic_data_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS synthetic_data_count   INTEGER NOT NULL DEFAULT 0;
