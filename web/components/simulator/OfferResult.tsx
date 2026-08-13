"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DecideResponse } from "@/lib/types";
import { ARM_LABELS, POLICY_LABELS, SEGMENT_LABELS } from "@/lib/types";

interface OfferResultProps {
  decision: DecideResponse;
}

export function OfferResult({ decision }: OfferResultProps) {
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Oferta Recomendada</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-2xl font-bold text-primary">
            {ARM_LABELS[decision.offer_id] ?? decision.offer_id}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {decision.offer_id}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            Segmento: {SEGMENT_LABELS[decision.segment] ?? decision.segment}
          </Badge>
          <Badge variant="outline">
            Confiança: {(decision.confidence * 100).toFixed(1)}%
          </Badge>
          <Badge variant={decision.is_exploration ? "warning" : "success"}>
            {decision.is_exploration ? "🟡 Exploração" : "🟢 Explotação"}
          </Badge>
          <Badge variant="outline">
            {POLICY_LABELS[decision.policy] ?? decision.policy}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Decision ID:{" "}
          <span className="font-mono text-foreground">
            {decision.decision_id}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
