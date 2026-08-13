export interface DecisionResult {
  decision_id: string;
  offer_id: string;
  policy: string;
  confidence: number;
  is_exploration: boolean;
  segment: string;
}

export interface FlagRule {
  condition: Record<string, unknown>;
  value: unknown;
}

export interface FlagPayload {
  flag_key: string;
  flag_type: string;
  default_value: unknown;
  rules: FlagRule[];
  enabled: boolean;
}

export interface SdkPayload {
  flags: Record<string, Omit<FlagPayload, "flag_key">>;
}

export interface BanditClientOptions {
  baseUrl?: string;
  flagTtlMs?: number;
  fetch?: typeof globalThis.fetch;
}
