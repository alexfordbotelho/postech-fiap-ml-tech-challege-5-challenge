"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import type { FeatureFlagItem, FeatureFlagRule } from "@/lib/types";

const PAGE_TAGS = ["page:product", "page:all"];
const SWR_OPTS = { refreshInterval: 15_000 };
const WS_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001")
    .replace(/^http/, "ws") + "/ws";

// ── Inline flag rule evaluator (mirrors Python flag_engine.py) ─────────────
function matchesCondition(
  condition: Record<string, unknown>,
  context: Record<string, unknown>
): boolean {
  for (const [key, spec] of Object.entries(condition)) {
    const val = context[key];
    if (spec !== null && typeof spec === "object" && !Array.isArray(spec)) {
      const s = spec as Record<string, unknown>;
      if ("$eq" in s && val !== s.$eq) return false;
      if ("$ne" in s && val === s.$ne) return false;
      if ("$in" in s && !(s.$in as unknown[]).includes(val)) return false;
      if ("$nin" in s && (s.$nin as unknown[]).includes(val)) return false;
      if ("$gt" in s && !(val !== undefined && (val as number) > (s.$gt as number))) return false;
      if ("$gte" in s && !(val !== undefined && (val as number) >= (s.$gte as number))) return false;
      if ("$lt" in s && !(val !== undefined && (val as number) < (s.$lt as number))) return false;
      if ("$lte" in s && !(val !== undefined && (val as number) <= (s.$lte as number))) return false;
      if ("$regex" in s) {
        if (val === undefined || !new RegExp(s.$regex as string).test(String(val))) return false;
      }
    } else {
      if (val !== spec) return false;
    }
  }
  return true;
}

function evaluateFlagRules(
  flag: FeatureFlagItem,
  context: Record<string, unknown>
): unknown {
  if (!flag.enabled) return flag.default_value;
  for (const rule of flag.rules as FeatureFlagRule[]) {
    const cond = rule.condition as Record<string, unknown>;
    if (!cond || Object.keys(cond).length === 0 || matchesCondition(cond, context)) {
      return rule.value;
    }
  }
  return flag.default_value;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useFlagPayload(userContext?: Record<string, any>) {
  const { data: flags = [], isLoading, mutate } = useSWR<FeatureFlagItem[]>(
    "flags-list",
    () => api.listFlags(),
    SWR_OPTS
  );

  // WebSocket: force re-fetch when admin toggles a flag
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    function connect() {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string) as { event_type?: string };
            if (msg.event_type === "flag_toggled") mutate();
          } catch {}
        };
        ws.onclose = () => {
          // reconnect after 3s on unintended close
          setTimeout(connect, 3000);
        };
        ws.onerror = () => ws.close();
      } catch {}
    }
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [mutate]);

  const pageFlags = flags.filter((f) =>
    f.tags.some((t) => PAGE_TAGS.includes(t))
  );
  const activePageFlags = pageFlags.filter((f) => f.enabled);

  /** Raw default_value (no rule evaluation) */
  function getFlag(key: string): unknown {
    return flags.find((f) => f.flag_key === key)?.default_value ?? null;
  }

  /** Rule-evaluated value for the given user context */
  function getFlagValue(key: string): unknown {
    const flag = flags.find((f) => f.flag_key === key);
    if (!flag) return null;
    return evaluateFlagRules(flag, userContext ?? {});
  }

  function isFlagEnabled(key: string): boolean {
    return flags.find((f) => f.flag_key === key)?.enabled ?? false;
  }

  return {
    flags,
    pageFlags,
    activePageFlags,
    getFlag,
    getFlagValue,
    isFlagEnabled,
    isLoading,
    mutate,
  };
}
