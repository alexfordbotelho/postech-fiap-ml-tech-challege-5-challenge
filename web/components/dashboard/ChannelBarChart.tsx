"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ChannelMetricsItem } from "@/lib/types";
import { POLICY_LABELS } from "@/lib/types";
import { useMounted } from "@/hooks/useMounted";

const POLICY_COLORS: Record<string, string> = {
  contextual_thompson: "#6366f1",
  thompson: "#8b5cf6",
  contextual_ucb: "#06b6d4",
  ucb: "#0ea5e9",
  baseline: "#94a3b8",
};

const CHANNEL_LABELS: Record<string, string> = {
  web: "Web",
  mobile: "Mobile",
  email: "E-mail",
  call_center: "Call Center",
  atm: "ATM",
};

interface ChannelBarChartProps {
  items: ChannelMetricsItem[];
}

export function ChannelBarChart({ items }: ChannelBarChartProps) {
  const mounted = useMounted();

  if (!items.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Nenhum dado por canal ainda. Execute simulações com diferentes canais.
      </div>
    );
  }

  // Build: [{ channel, contextual_thompson: avgReward, thompson: avgReward, ... }]
  const channelMap: Record<string, Record<string, number>> = {};
  for (const item of items) {
    if (!channelMap[item.channel]) {
      channelMap[item.channel] = { channel: item.channel as unknown as number } as Record<string, number>;
    }
    channelMap[item.channel][item.policy_name] = parseFloat(
      (item.avg_reward * 100).toFixed(1)
    );
  }

  const data = Object.values(channelMap).map((row) => ({
    ...row,
    channel: CHANNEL_LABELS[row.channel as unknown as string] ?? row.channel,
  }));

  const policies = Array.from(new Set(items.map((i) => i.policy_name)));

  if (!mounted) return <div className="h-[240px] animate-pulse rounded bg-muted" />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="channel"
          stroke="#64748b"
          tick={{ fontSize: 10, fill: "#64748b" }}
        />
        <YAxis
          stroke="#64748b"
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickFormatter={(v) => `${v}%`}
          domain={[0, "auto"]}
        />
        <Tooltip
          contentStyle={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 6,
            fontSize: 11,
          }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value: number, name: string) => [
            `${value.toFixed(1)}%`,
            POLICY_LABELS[name] ?? name,
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
          formatter={(value) => POLICY_LABELS[value] ?? value}
        />
        {policies.map((policy) => (
          <Bar
            key={policy}
            dataKey={policy}
            fill={POLICY_COLORS[policy] ?? "#64748b"}
            radius={[2, 2, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
