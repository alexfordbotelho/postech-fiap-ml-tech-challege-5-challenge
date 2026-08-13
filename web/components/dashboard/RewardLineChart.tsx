"use client";

import useSWR from "swr";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import { POLICIES } from "@/lib/types";
import { useMounted } from "@/hooks/useMounted";

const COLORS: Record<string, string> = {
  contextual_thompson: "#6366f1",
  thompson: "#8b5cf6",
  contextual_ucb: "#06b6d4",
  ucb: "#0ea5e9",
  baseline: "#94a3b8",
};

const SWR_OPTS = { refreshInterval: 30_000, keepPreviousData: true };

export function RewardLineChart() {
  const mounted = useMounted();

  const { data: runs } = useSWR(
    "mlops-runs-all",
    () =>
      Promise.all(
        POLICIES.map((p) => api.mlopsRuns(p, 30).then((r) => ({ policy: p, runs: r.runs })))
      ),
    SWR_OPTS
  );

  if (!mounted) {
    return <div className="h-[240px] animate-pulse rounded bg-muted" />;
  }

  const runsByPolicy: Record<string, { cumulative_reward: number }[]> = {};
  runs?.forEach(({ policy, runs: pRuns }) => {
    runsByPolicy[policy] = pRuns;
  });

  const allRuns: Array<{ policy: string; cumulative_reward: number; step: number }> = [];
  for (const [policy, pRuns] of Object.entries(runsByPolicy)) {
    pRuns.forEach((r, idx) => {
      allRuns.push({ policy, cumulative_reward: r.cumulative_reward, step: idx + 1 });
    });
  }

  const stepMap: Record<number, Record<string, number>> = {};
  for (const r of allRuns) {
    if (!stepMap[r.step]) stepMap[r.step] = { step: r.step };
    stepMap[r.step][r.policy] = r.cumulative_reward;
  }
  const data = Object.values(stepMap).sort((a, b) => a.step - b.step);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Nenhum run MLflow disponível ainda. Execute POST /reward/ para gerar dados.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="step"
          stroke="#64748b"
          tick={{ fontSize: 10, fill: "#64748b" }}
          label={{ value: "Reward events", position: "insideBottom", offset: -4, fontSize: 10, fill: "#64748b" }}
        />
        <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: "#64748b" }} />
        <Tooltip
          contentStyle={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 6,
            fontSize: 11,
          }}
          labelStyle={{ color: "#94a3b8" }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => value.replace(/_/g, " ")}
        />
        {Object.keys(COLORS).map((policy) => (
          <Line
            key={policy}
            type="monotone"
            dataKey={policy}
            stroke={COLORS[policy]}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
