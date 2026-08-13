"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { ExplainResponse } from "@/lib/types";
import { ARM_LABELS } from "@/lib/types";

interface ExplainPanelProps {
  explain: ExplainResponse;
}

function toNum(val: unknown): number {
  if (typeof val === "number") return val;
  if (val && typeof val === "object") {
    const o = val as Record<string, unknown>;
    const candidate = o.mean_estimate ?? o.ucb_score ?? o.score ?? Object.values(o).find((v) => typeof v === "number");
    return typeof candidate === "number" ? candidate : 0;
  }
  return 0;
}

export function ExplainPanel({ explain }: ExplainPanelProps) {
  const raw = explain.reasoning?.arm_scores as Record<string, unknown> | undefined;

  const armScores: Record<string, number> | undefined = raw
    ? Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, toNum(v)]))
    : undefined;

  const maxScore = armScores
    ? Math.max(...Object.values(armScores), 0.001)
    : 0;

  return (
    <Accordion type="single" collapsible defaultValue="scores">
      <AccordionItem value="scores">
        <AccordionTrigger className="text-sm">
          Pontuação dos Braços (arm_scores)
        </AccordionTrigger>
        <AccordionContent>
          {armScores ? (
            <div className="space-y-2">
              {Object.entries(armScores)
                .sort(([, a], [, b]) => b - a)
                .map(([arm, score]) => (
                  <div key={arm} className="flex items-center gap-2">
                    <span className="w-32 truncate text-xs text-muted-foreground">
                      {ARM_LABELS[arm] ?? arm}
                    </span>
                    <div className="flex-1 overflow-hidden rounded bg-muted h-2">
                      <div
                        className="h-2 rounded bg-primary"
                        style={{ width: `${(score / maxScore) * 100}%` }}
                      />
                    </div>
                    <span className="w-14 text-right text-xs tabular-nums">
                      {score.toFixed(4)}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Sem arm_scores disponíveis para esta política.
            </p>
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="raw">
        <AccordionTrigger className="text-sm">
          Reasoning Completo (JSON)
        </AccordionTrigger>
        <AccordionContent>
          <pre className="overflow-auto rounded bg-muted p-3 text-xs leading-relaxed">
            {JSON.stringify(explain.reasoning, null, 2)}
          </pre>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="features">
        <AccordionTrigger className="text-sm">
          Features do Cliente
        </AccordionTrigger>
        <AccordionContent>
          <pre className="overflow-auto rounded bg-muted p-3 text-xs leading-relaxed">
            {JSON.stringify(explain.context_features, null, 2)}
          </pre>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
