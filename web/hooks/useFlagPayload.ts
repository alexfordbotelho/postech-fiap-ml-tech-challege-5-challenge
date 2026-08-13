"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import type { FeatureFlagItem } from "@/lib/types";

const PAGE_TAGS = ["page:product", "page:all"];
const SWR_OPTS = { refreshInterval: 15_000 };

export function useFlagPayload() {
  const { data: flags = [], isLoading } = useSWR<FeatureFlagItem[]>(
    "flags-list",
    () => api.listFlags(),
    SWR_OPTS
  );

  const pageFlags = flags.filter((f) =>
    f.tags.some((t) => PAGE_TAGS.includes(t))
  );

  const activePageFlags = pageFlags.filter((f) => f.enabled);

  function getFlag(key: string): unknown {
    return flags.find((f) => f.flag_key === key)?.default_value ?? null;
  }

  function isFlagEnabled(key: string): boolean {
    const f = flags.find((f) => f.flag_key === key);
    return f?.enabled ?? false;
  }

  return { flags, pageFlags, activePageFlags, getFlag, isFlagEnabled, isLoading };
}
