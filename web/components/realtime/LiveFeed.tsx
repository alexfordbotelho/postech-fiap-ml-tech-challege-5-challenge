"use client";

import { useWebSocket } from "@/hooks/useWebSocket";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ARM_LABELS, POLICY_LABELS } from "@/lib/types";

const POLICY_DOT: Record<string, string> = {
  contextual_thompson: "bg-indigo-500",
  contextual_ucb: "bg-amber-500",
  thompson: "bg-emerald-500",
  ucb: "bg-blue-500",
  baseline: "bg-slate-400",
};

export function LiveFeed() {
  const { events, connected } = useWebSocket();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? "animate-pulse bg-green-500" : "bg-muted"
            }`}
          />
          Feed ao Vivo
          <Badge variant="outline" className="ml-auto text-xs">
            {connected ? "conectado" : "reconectando…"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {events.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            Aguardando eventos…
          </p>
        ) : (
          <div className="max-h-64 divide-y overflow-y-auto">
            {events.map((ev, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 text-xs"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    POLICY_DOT[ev.policy_name ?? ""] ?? "bg-muted"
                  }`}
                />
                <span className="w-14 shrink-0 text-muted-foreground">
                  {ev.segment ?? "—"}
                </span>
                <span className="flex-1 truncate font-mono">
                  {ARM_LABELS[ev.arm_selected ?? ""] ?? ev.arm_selected ?? "—"}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {POLICY_LABELS[ev.policy_name ?? ""] ?? ev.policy_name ?? ""}
                </span>
                {ev.event_type === "reward_received" && (
                  <Badge variant="outline" className="py-0 text-xs">
                    +{ev.reward}
                  </Badge>
                )}
                {ev.is_exploration && (
                  <span className="text-muted-foreground">🔍</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
