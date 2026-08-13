export interface FeatureFlagRule {
  condition: Record<string, unknown>;
  value: unknown;
}

export interface FeatureFlagItem {
  flag_key: string;
  description: string;
  flag_type: string;
  default_value: unknown;
  rules: FeatureFlagRule[];
  enabled: boolean;
  tags: string[];
  updated_at?: string;
}

export interface DecideRequest {
  features?: Record<string, unknown>;
  channel?: string;
  policy?: string;
}

export interface DecideResponse {
  decision_id: string;
  offer_id: string;
  policy_name: string;
  is_exploration: boolean;
  scores: Record<string, number>;
}

export interface RewardRequest {
  decision_id: string;
  reward: number;
}

export interface RewardResponse {
  status: string;
}
