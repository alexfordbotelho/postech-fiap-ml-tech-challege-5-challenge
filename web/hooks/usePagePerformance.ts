import { useEffect, useRef, useCallback } from "react";

export interface PageTimings {
  mountMs: number;
  dataMs?: number;
  renderMs?: number;
}

const IS_DEV = process.env.NODE_ENV === "development";

export function usePagePerformance(pageName: string) {
  const startRef = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : 0
  );
  const dataMarked = useRef(false);

  useEffect(() => {
    if (typeof performance === "undefined") return;
    const mountMs = performance.now() - startRef.current;
    performance.mark(`${pageName}:mount`);

    if (IS_DEV) {
      console.debug(`[Perf] ${pageName} mounted in ${mountMs.toFixed(1)}ms`);
    }
  }, [pageName]);

  const markDataLoaded = useCallback(() => {
    if (typeof performance === "undefined" || dataMarked.current) return 0;
    dataMarked.current = true;
    const dataMs = performance.now() - startRef.current;
    performance.mark(`${pageName}:data`);

    if (IS_DEV) {
      console.debug(`[Perf] ${pageName} data ready in ${dataMs.toFixed(1)}ms`);
    }
    return dataMs;
  }, [pageName]);

  const getTimings = useCallback((): PageTimings => {
    if (typeof performance === "undefined") return { mountMs: 0 };
    const mountEntry = performance.getEntriesByName(`${pageName}:mount`, "mark")[0];
    const dataEntry = performance.getEntriesByName(`${pageName}:data`, "mark")[0];
    return {
      mountMs: mountEntry?.startTime ?? 0,
      dataMs: dataEntry?.startTime,
    };
  }, [pageName]);

  return { markDataLoaded, getTimings };
}
