const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8001";

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

export interface DecideResponse {
  decision_id: string;
  offer_id: string;
  policy: string;
  confidence: number;
  is_exploration: boolean;
  segment: string;
}

export interface MetricsResponse {
  policy: string;
  total_decisions: number;
  cumulative_reward: number;
  avg_reward: number;
  exploration_rate: number;
}

export const POLICIES = [
  "contextual_thompson",
  "contextual_ucb",
  "thompson",
  "ucb",
  "baseline",
] as const;

export const ARM_LABELS: Record<string, string> = {
  savings_account: "Poupança",
  term_deposit_6m: "CDB 6m",
  term_deposit_12m: "CDB 12m",
  personal_loan: "Empréstimo",
  premium_savings: "Poupança Premium",
};

export const POLICY_LABELS: Record<string, string> = {
  contextual_thompson: "Thompson Contextual",
  contextual_ucb: "UCB Contextual",
  thompson: "Thompson",
  ucb: "UCB",
  baseline: "Baseline",
};

export const api = {
  decide: (segment: string, channel: string, policy = "contextual_thompson") =>
    apiFetch<DecideResponse>("/decide/", {
      method: "POST",
      body: JSON.stringify({
        session_id: Math.random().toString(36).slice(2),
        channel,
        features: { segment },
        policy,
      }),
    }),

  metrics: (policy: string) =>
    apiFetch<MetricsResponse>(
      `/metrics/?policy=${encodeURIComponent(policy)}`
    ),

  allMetrics: () => Promise.all(POLICIES.map((p) => api.metrics(p))),
};
