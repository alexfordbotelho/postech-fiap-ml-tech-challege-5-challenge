"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetricsResponse } from "@/lib/types";
import { ARM_LABELS, ARMS, SEGMENTS, SEGMENT_LABELS } from "@/lib/types";

interface ArmHeatmapProps {
  metrics: MetricsResponse[];
}

export function ArmHeatmap({ metrics }: ArmHeatmapProps) {
  const champion = [...metrics].sort((a, b) => b.avg_reward - a.avg_reward)[0];
  const armsData = champion?.arms_catalog ?? [...ARMS];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Braços × Segmentos
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            (baseado na política champion)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="pb-2 pr-3 text-left font-normal text-muted-foreground">
                  Segmento
                </th>
                {armsData.map((arm) => (
                  <th
                    key={arm}
                    className="pb-2 text-center font-normal text-muted-foreground"
                  >
                    {ARM_LABELS[arm] ?? arm}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...SEGMENTS].map((seg) => (
                <tr key={seg}>
                  <td className="py-1.5 pr-3 font-medium text-muted-foreground">
                    {SEGMENT_LABELS[seg] ?? seg}
                  </td>
                  {armsData.map((arm) => {
                    const intensity = getIntensity(arm, seg);
                    return (
                      <td key={arm} className="py-1.5 text-center">
                        <div
                          className="mx-auto h-8 w-14 rounded"
                          style={{
                            backgroundColor: `hsl(217 91% 60% / ${intensity})`,
                            border: "1px solid hsl(217 32% 17%)",
                          }}
                          title={`${arm} × ${seg}: ${(intensity * 100).toFixed(0)}%`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Intensidade representa afinidade esperada do segmento com o braço (dados ilustrativos — sem dados de decisão por segmento+braço na API atual).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function getIntensity(arm: string, segment: string): number {
  const affinityMap: Record<string, Record<string, number>> = {
    savings_account:   { young: 0.7, mid_low_risk: 0.5, mid_indebted: 0.4, senior_high_edu: 0.3, senior: 0.4, default: 0.5 },
    term_deposit_6m:   { young: 0.4, mid_low_risk: 0.6, mid_indebted: 0.3, senior_high_edu: 0.5, senior: 0.5, default: 0.4 },
    term_deposit_12m:  { young: 0.3, mid_low_risk: 0.5, mid_indebted: 0.2, senior_high_edu: 0.7, senior: 0.6, default: 0.4 },
    personal_loan:     { young: 0.5, mid_low_risk: 0.3, mid_indebted: 0.7, senior_high_edu: 0.2, senior: 0.2, default: 0.4 },
    premium_savings:   { young: 0.2, mid_low_risk: 0.4, mid_indebted: 0.1, senior_high_edu: 0.9, senior: 0.6, default: 0.3 },
  };
  return affinityMap[arm]?.[segment] ?? 0.3;
}
