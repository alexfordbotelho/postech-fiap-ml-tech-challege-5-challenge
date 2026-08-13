import type { FlagPayload } from "./types";

function matchesCondition(condition: Record<string, unknown>, context: Record<string, unknown>): boolean {
  for (const [key, spec] of Object.entries(condition)) {
    const ctxVal = context[key];
    if (spec !== null && typeof spec === "object" && !Array.isArray(spec)) {
      const s = spec as Record<string, unknown>;
      if ("$eq" in s && ctxVal !== s.$eq) return false;
      if ("$ne" in s && ctxVal === s.$ne) return false;
      if ("$in" in s && !Array.isArray(s.$in)) return false;
      if ("$in" in s && !(s.$in as unknown[]).includes(ctxVal)) return false;
      if ("$nin" in s && (s.$nin as unknown[]).includes(ctxVal)) return false;
      if ("$gt" in s && !(ctxVal !== undefined && (ctxVal as number) > (s.$gt as number))) return false;
      if ("$gte" in s && !(ctxVal !== undefined && (ctxVal as number) >= (s.$gte as number))) return false;
      if ("$lt" in s && !(ctxVal !== undefined && (ctxVal as number) < (s.$lt as number))) return false;
      if ("$lte" in s && !(ctxVal !== undefined && (ctxVal as number) <= (s.$lte as number))) return false;
      if ("$regex" in s) {
        const re = new RegExp(s.$regex as string);
        if (ctxVal === undefined || !re.test(String(ctxVal))) return false;
      }
    } else {
      if (ctxVal !== spec) return false;
    }
  }
  return true;
}

export function evaluateFlag(flag: FlagPayload, context: Record<string, unknown>): unknown {
  if (!flag.enabled) return flag.default_value;
  for (const rule of flag.rules) {
    const cond = rule.condition as Record<string, unknown>;
    if (!cond || Object.keys(cond).length === 0 || matchesCondition(cond, context)) {
      return rule.value;
    }
  }
  return flag.default_value;
}
