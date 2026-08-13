"use client";

import { useEffect, useState } from "react";

interface Metric {
  page: string;
  mountMs: number;
  dataMs?: number;
}

function getMetrics(): Metric[] {
  if (typeof performance === "undefined") return [];
  const marks = performance.getEntriesByType("mark");
  const map = new Map<string, Partial<Metric>>();

  for (const m of marks) {
    const [page, event] = m.name.split(":");
    if (!page || !event) continue;
    if (!map.has(page)) map.set(page, { page });
    const entry = map.get(page)!;
    if (event === "mount") entry.mountMs = Math.round(m.startTime);
    if (event === "data") entry.dataMs = Math.round(m.startTime);
  }

  return Array.from(map.values()).filter((m): m is Metric => !!m.page && m.mountMs !== undefined) as Metric[];
}

export function PerformanceOverlay() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setMetrics(getMetrics());
    update();
    const id = setInterval(update, 2000);
    return () => clearInterval(id);
  }, []);

  if (process.env.NODE_ENV !== "development") return null;
  if (metrics.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setVisible(v => !v)}
        className="fixed bottom-20 left-4 z-50 rounded bg-black/70 px-2 py-1 text-[10px] font-mono text-green-400 hover:bg-black/90"
        title="Toggle performance overlay"
      >
        ⚡ perf
      </button>

      {visible && (
        <div className="fixed bottom-32 left-4 z-50 w-64 rounded-lg border border-border bg-black/90 p-3 text-[10px] font-mono shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-green-400 font-semibold">Performance Metrics</span>
            <button onClick={() => setVisible(false)} className="text-muted-foreground hover:text-white">✕</button>
          </div>
          <div className="space-y-1.5">
            {metrics.map(m => (
              <div key={m.page} className="flex flex-col gap-0.5 border-b border-white/10 pb-1.5">
                <span className="text-white font-semibold">{m.page}</span>
                <div className="flex gap-3 text-slate-400">
                  <span>
                    mount:{" "}
                    <span className={m.mountMs < 100 ? "text-green-400" : m.mountMs < 300 ? "text-yellow-400" : "text-red-400"}>
                      {m.mountMs}ms
                    </span>
                  </span>
                  {m.dataMs !== undefined && (
                    <span>
                      data:{" "}
                      <span className={m.dataMs < 500 ? "text-green-400" : m.dataMs < 1500 ? "text-yellow-400" : "text-red-400"}>
                        {m.dataMs}ms
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-slate-500">
            verde &lt;100ms · amarelo &lt;300ms · vermelho ≥300ms
          </div>
        </div>
      )}
    </>
  );
}
