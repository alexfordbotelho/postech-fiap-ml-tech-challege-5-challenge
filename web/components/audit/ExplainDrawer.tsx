"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExplainResponse } from "@/lib/types";
import { ARM_LABELS, POLICY_LABELS, SEGMENT_LABELS } from "@/lib/types";

function toNum(val: unknown): number {
  if (typeof val === "number") return val;
  if (val && typeof val === "object") {
    const o = val as Record<string, unknown>;
    const c = o.mean_estimate ?? o.ucb_score ?? o.score ?? Object.values(o).find((v) => typeof v === "number");
    return typeof c === "number" ? c : 0;
  }
  return 0;
}

interface ExplainDrawerProps {
  open: boolean;
  onClose: () => void;
  explain: ExplainResponse | null;
  loading: boolean;
}

export function ExplainDrawer({
  open,
  onClose,
  explain,
  loading,
}: ExplainDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Explain da Decisão</SheetTitle>
        </SheetHeader>

        {loading && (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {explain && !loading && (
          <div className="mt-4 space-y-5">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Decision ID</p>
              <p className="font-mono text-xs">{explain.decision_id}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {ARM_LABELS[explain.arm_selected] ?? explain.arm_selected}
              </Badge>
              <Badge variant="outline">
                {POLICY_LABELS[explain.policy] ?? explain.policy}
              </Badge>
              <Badge variant="outline">
                {SEGMENT_LABELS[explain.segment] ?? explain.segment}
              </Badge>
              <Badge variant={explain.is_exploration ? "warning" : "success"}>
                {explain.is_exploration ? "Exploração" : "Explotação"}
              </Badge>
              {explain.reward !== null && (
                <Badge variant={explain.reward > 0 ? "success" : "destructive"}>
                  Reward: {explain.reward}
                </Badge>
              )}
            </div>

            {!!explain.reasoning?.arm_scores && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Arm Scores
                </p>
                {Object.entries(
                  explain.reasoning.arm_scores as Record<string, unknown>
                )
                  .map(([arm, raw]) => [arm, toNum(raw)] as [string, number])
                  .sort(([, a], [, b]) => b - a)
                  .map(([arm, score]) => (
                    <div key={arm} className="flex items-center gap-2">
                      <span className="w-32 truncate text-xs">
                        {ARM_LABELS[arm] ?? arm}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {score.toFixed(4)}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Features do Cliente
              </p>
              <pre className="overflow-auto rounded bg-muted p-3 text-xs leading-relaxed">
                {JSON.stringify(explain.context_features, null, 2)}
              </pre>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Reasoning Completo
              </p>
              <pre className="overflow-auto rounded bg-muted p-3 text-xs leading-relaxed">
                {JSON.stringify(explain.reasoning, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
