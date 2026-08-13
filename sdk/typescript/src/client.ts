import type {
  BanditClientOptions,
  DecisionResult,
  FlagPayload,
  SdkPayload,
} from "./types";
import { evaluateFlag } from "./flag-engine";

export class BanditClient {
  private readonly base: string;
  private readonly flagTtlMs: number;
  private readonly _fetch: typeof globalThis.fetch;

  private flagCache: Record<string, FlagPayload> = {};
  private flagCacheTs = 0;

  constructor(options: BanditClientOptions = {}) {
    this.base = (options.baseUrl ?? "http://localhost:8001").replace(/\/$/, "");
    this.flagTtlMs = options.flagTtlMs ?? 60_000;
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this._fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`BanditClient POST ${path} ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this._fetch(`${this.base}${path}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`BanditClient GET ${path} ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Flags ─────────────────────────────────────────────────────────────────

  private async refreshFlags(): Promise<void> {
    const payload = await this.get<SdkPayload>("/flags/sdk/payload");
    this.flagCache = Object.fromEntries(
      Object.entries(payload.flags).map(([key, data]) => [
        key,
        { flag_key: key, ...data } as FlagPayload,
      ])
    );
    this.flagCacheTs = Date.now();
  }

  private async getFlags(): Promise<Record<string, FlagPayload>> {
    if (Date.now() - this.flagCacheTs > this.flagTtlMs) {
      await this.refreshFlags();
    }
    return this.flagCache;
  }

  async evaluateFlag(flagKey: string, context: Record<string, unknown>): Promise<unknown> {
    const flags = await this.getFlags();
    if (!(flagKey in flags)) return null;
    return evaluateFlag(flags[flagKey], context);
  }

  // ── Decisions ─────────────────────────────────────────────────────────────

  async decide(params: {
    features: Record<string, unknown>;
    policy?: string;
    channel?: string;
    arms?: string[];
    sessionId?: string;
  }): Promise<DecisionResult> {
    const body: Record<string, unknown> = {
      features: params.features,
      channel: params.channel ?? "web",
    };
    if (params.policy) body.policy = params.policy;
    if (params.arms) body.arms = params.arms;
    if (params.sessionId) body.session_id = params.sessionId;
    return this.post<DecisionResult>("/decide/", body);
  }

  async reward(decisionId: string, reward: number): Promise<{ status: string }> {
    return this.post<{ status: string }>("/reward/", {
      decision_id: decisionId,
      reward,
    });
  }
}
