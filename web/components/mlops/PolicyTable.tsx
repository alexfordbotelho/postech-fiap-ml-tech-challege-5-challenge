"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { MetricsResponse } from "@/lib/types";
import { POLICY_LABELS } from "@/lib/types";

interface PolicyTableProps {
  metrics: MetricsResponse[];
}

export function PolicyTable({ metrics }: PolicyTableProps) {
  const sorted = [...metrics].sort((a, b) => b.avg_reward - a.avg_reward);
  const champion = sorted[0]?.policy;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Política</TableHead>
          <TableHead className="text-right">Decisões</TableHead>
          <TableHead className="text-right">Reward Médio</TableHead>
          <TableHead className="text-right">Reward Cumulativo</TableHead>
          <TableHead className="text-right">Taxa Exploração</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((m) => (
          <TableRow key={m.policy}>
            <TableCell className="font-mono text-xs">
              {POLICY_LABELS[m.policy] ?? m.policy}
            </TableCell>
            <TableCell className="text-right text-xs">
              {m.total_decisions.toLocaleString("pt-BR")}
            </TableCell>
            <TableCell className="text-right text-xs">
              {(m.avg_reward * 100).toFixed(2)}%
            </TableCell>
            <TableCell className="text-right text-xs">
              {m.cumulative_reward.toFixed(1)}
            </TableCell>
            <TableCell className="text-right text-xs">
              {(m.exploration_rate * 100).toFixed(1)}%
            </TableCell>
            <TableCell>
              {m.policy === champion && (
                <Badge variant="default" className="text-xs">Champion</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
