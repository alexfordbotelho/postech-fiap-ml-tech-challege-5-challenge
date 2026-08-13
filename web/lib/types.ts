export interface MetricsResponse {
  policy: string;
  total_decisions: number;
  cumulative_reward: number;
  avg_reward: number;
  exploration_rate: number;
  arms_catalog: string[];
}

export interface DecideRequest {
  features: Record<string, unknown>;
  policy: string;
  channel?: string;
}

export interface DecideResponse {
  decision_id: string;
  offer_id: string;
  policy: string;
  confidence: number;
  is_exploration: boolean;
  segment: string;
}

export interface ExplainResponse {
  decision_id: string;
  arm_selected: string;
  policy: string;
  segment: string;
  is_exploration: boolean;
  channel: string;
  context_features: Record<string, unknown>;
  reward: number | null;
  reasoning: Record<string, unknown>;
}

export interface RewardRequest {
  decision_id: string;
  reward: number;
}

export interface RewardResponse {
  status: string;
  updated_arm: string;
  policy: string;
}

export interface DecisionItem {
  decision_id: string;
  policy_name: string;
  arm_selected: string;
  segment: string | null;
  channel: string | null;
  is_exploration: boolean;
  reward: number | null;
  created_at: string;
}

export interface DecisionListResponse {
  total: number;
  page: number;
  limit: number;
  items: DecisionItem[];
}

export interface MlopsRun {
  run_id: string;
  arm: string;
  reward: number;
  cumulative_reward: number;
  exploration_rate: number;
  total_decisions: number;
  created_at: string;
}

export interface MlopsRunsResponse {
  policy: string;
  runs: MlopsRun[];
}

export interface AskRequest {
  mode: "explain" | "policy" | "summarize" | "compare" | "general" | "negotiate" | "experiment" | "advise" | "evaluate";
  question: string;
  session_id?: string;
  decision_id?: string;
  experiment_id?: string;
  policy?: string;
  offer?: unknown;
  objection?: string;
  client_features?: Record<string, unknown>;
}

export interface AskResponse {
  mode: string;
  answer: string;
  guardrail_passed?: boolean;
  trace_id?: string | null;
}

export interface FeedbackRequest {
  trace_id: string;
  score: 1 | -1;
  comment?: string;
}

export interface ChannelMetricsItem {
  channel: string;
  policy_name: string;
  total_decisions: number;
  avg_reward: number;
  cumulative_reward: number;
  exploration_rate: number;
}

export interface ChannelMetricsResponse {
  items: ChannelMetricsItem[];
}

// ── Feature Flags ──────────────────────────────────────────────────────────

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
  created_at: string | null;
  updated_at: string | null;
}

// ── Experiments ────────────────────────────────────────────────────────────

export interface ExperimentItem {
  id: string;
  name: string;
  description: string;
  hypothesis: string;
  status: "draft" | "running" | "stopped";
  metric_primary: string;
  experiment_policy: string;
  experiment_arms: string[];
  targeting_segments: string[];
  targeting_channels: string[];
  winner: string | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
  decisions_count: number;
  synthetic_data_enabled: boolean;
  synthetic_data_count: number;
}

export interface SyntheticGenerateResponse {
  experiment_id: string;
  generated: number;
  total_synthetic: number;
}

export interface ArmResult {
  arm_id: string;
  n: number;
  total_reward: number;
  avg_reward: number;
  explorations: number;
  exploration_rate: number;
  prob_best: number | null;
  expected_lift: number | null;
  ci_95: [number, number] | null;
  is_best: boolean;
}

export interface ExperimentResults {
  experiment_id: string;
  name: string;
  status: string;
  experiment_policy: string;
  days_running: number | null;
  arms: ArmResult[];
  recommendation: string;
  sample_reached: boolean;
  min_sample_per_arm: number;
  total_decisions: number;
}

// ── Fairness ───────────────────────────────────────────────────────────────

export interface FairnessSegment {
  segment: string;
  decisions: number;
  pct: number;
  avg_reward: number;
  arm_exposure: Record<string, number>;
}

export interface FairnessAlert {
  severity: "warning" | "critical";
  segment: string;
  message: string;
  pct: number;
}

export interface FairnessResponse {
  total_decisions: number;
  segments: FairnessSegment[];
  concentration_index: number;
  alerts: FairnessAlert[];
}

// ── Analytics ──────────────────────────────────────────────────────────────

export interface FunnelRow {
  policy_name: string;
  total_decisions: number;
  with_reward: number;
  conversions: number;
  conversion_rate: number;
  explorations: number;
  exploration_rate: number;
}

export interface CohortWeeklyRow {
  week: string;
  policy_name: string;
  avg_reward: number;
  decisions: number;
}

export interface HeatmapRow {
  segment: string;
  arm: string;
  avg_reward: number;
  decisions: number;
}

export const POLICIES = [
  "thompson",
  "contextual_thompson",
  "ucb",
  "contextual_ucb",
  "baseline",
] as const;

export const SEGMENTS = [
  "young",
  "mid_low_risk",
  "mid_indebted",
  "senior_high_edu",
  "senior",
  "high_balance",
  "indebted",
  "default",
] as const;

export const ARMS = [
  "savings_account",
  "term_deposit_6m",
  "term_deposit_12m",
  "personal_loan",
  "premium_savings",
] as const;

export const ARM_LABELS: Record<string, string> = {
  savings_account: "Poupança",
  term_deposit_6m: "CDB 6m",
  term_deposit_12m: "CDB 12m",
  personal_loan: "Empréstimo",
  premium_savings: "Poupança Premium",
};

export const POLICY_LABELS: Record<string, string> = {
  thompson: "Thompson",
  contextual_thompson: "Thompson Contextual",
  ucb: "UCB",
  contextual_ucb: "UCB Contextual",
  baseline: "Baseline",
};

export const SEGMENT_LABELS: Record<string, string> = {
  young: "Jovem",
  mid_low_risk: "Médio Baixo Risco",
  mid_indebted: "Médio Endividado",
  senior_high_edu: "Sênior Alta Edu.",
  senior: "Sênior",
  high_balance: "Alto Saldo",
  indebted: "Endividado",
  default: "Padrão",
};

// ── Flag Scenario Analytics ────────────────────────────────────────────────

export interface FlagScenarioRow {
  flag_value: string;
  arm_selected: string;
  conversions: number;
  decisions: number;
  avg_reward: number;
  explorations: number;
  conversion_rate: number;
}

export interface FlagScenarioSummaryRow {
  flag_key: string;
  flag_value: string;
  decisions: number;
  avg_reward: number;
  conversions: number;
  conversion_rate: number;
}

export interface FlagScenarioProfileRow {
  flag_value: string;
  segment: string;
  decisions: number;
  conversions: number;
  avg_reward: number;
  conversion_rate: number;
}

export interface FlagScenarioTimelineRow {
  label: string;
  flag_value: string;
  decisions: number;
  conversions: number;
}
