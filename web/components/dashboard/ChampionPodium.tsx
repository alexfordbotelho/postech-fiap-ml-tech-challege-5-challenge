"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MetricsResponse } from "@/lib/types";
import { POLICY_LABELS } from "@/lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];

interface ChampionPodiumProps {
  metrics: MetricsResponse[];
}

export function ChampionPodium({ metrics }: ChampionPodiumProps) {
  const sorted = [...metrics].sort((a, b) => b.avg_reward - a.avg_reward);
  const champion = sorted[0];
  const baseline = sorted.find((m) => m.policy === "baseline");

  const lift =
    baseline && baseline.avg_reward > 0
      ? ((champion.avg_reward - baseline.avg_reward) / baseline.avg_reward) *
        100
      : null;

  const maxReward = Math.max(...sorted.map((m) => m.avg_reward), 0.01);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Ranking de Políticas</CardTitle>
        {lift !== null && (
          <p className="text-xs text-muted-foreground">
            Champion:{" "}
            <span className="font-semibold text-primary">
              {POLICY_LABELS[champion.policy] ?? champion.policy}
            </span>{" "}
            &mdash; Lift vs baseline:{" "}
            <span className="text-green-400">+{lift.toFixed(1)}%</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((m, i) => {
          const pct = (m.avg_reward / maxReward) * 100;
          return (
            <div key={m.policy} className="flex items-center gap-3">
              <span className="w-5 text-base">{MEDALS[i] ?? "──"}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="truncate text-xs font-medium">
                    {POLICY_LABELS[m.policy] ?? m.policy}
                  </span>
                  <div className="flex items-center gap-2">
                    {i === 0 && (
                      <Badge variant="default" className="text-xs px-1 py-0">
                        Champion
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {(m.avg_reward * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
