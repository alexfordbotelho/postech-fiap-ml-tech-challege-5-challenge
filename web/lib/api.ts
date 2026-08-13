import type {
  AskRequest,
  AskResponse,
  FeedbackRequest,
  ChannelMetricsResponse,
  CohortWeeklyRow,
  DecideRequest,
  DecideResponse,
  DecisionListResponse,
  ExperimentItem,
  ExperimentResults,
  ExplainResponse,
  FairnessResponse,
  FeatureFlagItem,
  FlagScenarioProfileRow,
  FlagScenarioRow,
  FlagScenarioSummaryRow,
  FlagScenarioTimelineRow,
  FunnelRow,
  HeatmapRow,
  MetricsResponse,
  MlopsRunsResponse,
  RewardRequest,
  RewardResponse,
  SyntheticGenerateResponse,
} from "@/lib/types";
import { POLICIES } from "@/lib/types";

const BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  metrics: (policy: string) =>
    apiFetch<MetricsResponse>(`/metrics/?policy=${encodeURIComponent(policy)}`),

  allMetrics: () => apiFetch<MetricsResponse[]>("/metrics/all"),

  decide: (body: DecideRequest) =>
    apiFetch<DecideResponse>("/decide/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  reward: (body: RewardRequest) =>
    apiFetch<RewardResponse>("/reward/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  explain: (decisionId: string) =>
    apiFetch<ExplainResponse>(`/explain/${encodeURIComponent(decisionId)}`),

  decisions: (params: {
    policy?: string;
    segment?: string;
    is_exploration?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.policy) qs.set("policy", params.policy);
    if (params.segment) qs.set("segment", params.segment);
    if (params.is_exploration !== undefined)
      qs.set("is_exploration", String(params.is_exploration));
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    return apiFetch<DecisionListResponse>(`/decisions/?${qs.toString()}`);
  },

  mlopsRuns: (policy: string, limit = 30) =>
    apiFetch<MlopsRunsResponse>(
      `/mlops/runs/?policy=${encodeURIComponent(policy)}&limit=${limit}`
    ),

  channelMetrics: () =>
    apiFetch<ChannelMetricsResponse>("/metrics/channels"),

  assistantAsk: (body: AskRequest) =>
    apiFetch<AskResponse>("/assistant/ask", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  assistantFeedback: (body: FeedbackRequest) =>
    apiFetch<void>("/assistant/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Feature Flags ────────────────────────────────────────────────────────
  listFlags: () => apiFetch<FeatureFlagItem[]>("/flags/"),

  getFlag: (flagKey: string) =>
    apiFetch<FeatureFlagItem>(`/flags/${encodeURIComponent(flagKey)}`),

  createFlag: (body: {
    flag_key: string;
    description?: string;
    flag_type: string;
    default_value: unknown;
    rules?: { condition: Record<string, unknown>; value: unknown }[];
    enabled?: boolean;
    tags?: string[];
  }) =>
    apiFetch<FeatureFlagItem>("/flags/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateFlag: (
    flagKey: string,
    body: {
      flag_key: string;
      description?: string;
      flag_type: string;
      default_value: unknown;
      rules?: { condition: Record<string, unknown>; value: unknown }[];
      enabled?: boolean;
      tags?: string[];
    }
  ) =>
    apiFetch<FeatureFlagItem>(`/flags/${encodeURIComponent(flagKey)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteFlag: (flagKey: string) =>
    apiFetch<{ flag_key: string; deleted: boolean }>(
      `/flags/${encodeURIComponent(flagKey)}`,
      { method: "DELETE" }
    ),

  toggleFlag: (flagKey: string, enabled: boolean) =>
    apiFetch<{ flag_key: string; enabled: boolean }>(
      `/flags/${encodeURIComponent(flagKey)}/toggle?enabled=${enabled}`,
      { method: "POST" }
    ),

  evaluateFlag: (flagKey: string, context: Record<string, unknown>) =>
    apiFetch<{ flag_key: string; value: unknown; enabled: boolean }>(
      `/flags/${encodeURIComponent(flagKey)}/evaluate`,
      { method: "POST", body: JSON.stringify({ context }) }
    ),

  flagAudit: (flagKey: string) =>
    apiFetch<{ id: number; event: string; changed_by: string; changed_at: string; old_value: unknown; new_value: unknown }[]>(
      `/flags/${encodeURIComponent(flagKey)}/audit`
    ),

  // ── Experiments ──────────────────────────────────────────────────────────
  listExperiments: (status?: string) =>
    apiFetch<ExperimentItem[]>(
      `/experiments/${status ? `?status=${status}` : ""}`
    ),

  createExperiment: (body: {
    name: string;
    description?: string;
    hypothesis?: string;
    metric_primary?: string;
    experiment_policy?: string;
    experiment_arms?: string[];
    targeting_segments?: string[];
    targeting_channels?: string[];
    synthetic_data_enabled?: boolean;
  }) =>
    apiFetch<ExperimentItem>("/experiments/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  startExperiment: (id: string) =>
    apiFetch<ExperimentItem>(`/experiments/${id}/start`, { method: "PUT" }),

  stopExperiment: (id: string, winner?: string) =>
    apiFetch<ExperimentItem>(
      `/experiments/${id}/stop${winner ? `?winner=${winner}` : ""}`,
      { method: "PUT" }
    ),

  deleteExperiment: (id: string) =>
    apiFetch<void>(`/experiments/${id}`, { method: "DELETE" }),

  experimentResults: (id: string) =>
    apiFetch<ExperimentResults>(`/experiments/${id}/results`),

  generateSynthetic: (id: string, n: number) =>
    apiFetch<SyntheticGenerateResponse>(
      `/experiments/${id}/synthetic?n=${n}`,
      { method: "POST" }
    ),

  // ── Analytics ────────────────────────────────────────────────────────────
  analyticsFunnel: () => apiFetch<FunnelRow[]>("/analytics/funnel"),
  analyticsCohort: () => apiFetch<CohortWeeklyRow[]>("/analytics/cohort/weekly"),
  analyticsHeatmap: () => apiFetch<HeatmapRow[]>("/analytics/heatmap/segment-arm"),
  fairness: () => apiFetch<FairnessResponse>("/analytics/fairness"),

  // ── Flag Scenario Analytics ──────────────────────────────────────────────
  flagScenarios: (flagKey: string, windowMinutes: number) => {
    const qs = windowMinutes < 60
      ? `window_minutes=${windowMinutes}`
      : `window_hours=${Math.round(windowMinutes / 60)}`;
    return apiFetch<FlagScenarioRow[]>(
      `/analytics/flag-scenarios?flag_key=${encodeURIComponent(flagKey)}&${qs}`
    );
  },

  flagScenariosSummary: (windowMinutes: number) => {
    const qs = windowMinutes < 60
      ? `window_minutes=${windowMinutes}`
      : `window_hours=${Math.round(windowMinutes / 60)}`;
    return apiFetch<FlagScenarioSummaryRow[]>(
      `/analytics/flag-scenarios/summary?${qs}`
    );
  },

  flagScenariosProfile: (flagKey: string, windowMinutes: number) => {
    const qs = windowMinutes < 60
      ? `window_minutes=${windowMinutes}`
      : `window_hours=${Math.round(windowMinutes / 60)}`;
    return apiFetch<FlagScenarioProfileRow[]>(
      `/analytics/flag-scenarios/profile?flag_key=${encodeURIComponent(flagKey)}&${qs}`
    );
  },

  flagScenariosTimeline: (flagKey: string, windowMinutes: number) => {
    const qs = windowMinutes < 60
      ? `window_minutes=${windowMinutes}`
      : `window_hours=${Math.round(windowMinutes / 60)}`;
    return apiFetch<FlagScenarioTimelineRow[]>(
      `/analytics/flag-scenarios/timeline?flag_key=${encodeURIComponent(flagKey)}&${qs}`
    );
  },
};
