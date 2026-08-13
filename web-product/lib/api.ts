import type {
  DecideRequest,
  DecideResponse,
  FeatureFlagItem,
  RewardRequest,
  RewardResponse,
} from "@/lib/types";

const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

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

  listFlags: () => apiFetch<FeatureFlagItem[]>("/flags/"),

  evaluateFlag: (key: string, context: Record<string, unknown>) =>
    apiFetch<{ value: unknown; enabled: boolean }>(
      `/flags/${encodeURIComponent(key)}/evaluate`,
      { method: "POST", body: JSON.stringify(context) }
    ),
};
