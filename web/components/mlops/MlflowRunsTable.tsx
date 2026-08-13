"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MlopsRun } from "@/lib/types";
import { ARM_LABELS } from "@/lib/types";

interface MlflowRunsTableProps {
  runs: MlopsRun[];
}

export function MlflowRunsTable({ runs }: MlflowRunsTableProps) {
  if (runs.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        Nenhum run registrado. Execute POST /reward/ para gerar runs no MLflow.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Run ID</TableHead>
          <TableHead>Braço</TableHead>
          <TableHead className="text-right">Reward</TableHead>
          <TableHead className="text-right">Reward Cumul.</TableHead>
          <TableHead className="text-right">Exploração</TableHead>
          <TableHead className="text-right">Decisões</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.slice(0, 15).map((r) => (
          <TableRow key={r.run_id}>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {r.run_id.slice(0, 8)}…
            </TableCell>
            <TableCell className="text-xs">
              {ARM_LABELS[r.arm] ?? r.arm}
            </TableCell>
            <TableCell className="text-right text-xs">
              <span className={r.reward > 0 ? "text-green-400" : "text-muted-foreground"}>
                {r.reward.toFixed(1)}
              </span>
            </TableCell>
            <TableCell className="text-right text-xs">{r.cumulative_reward.toFixed(1)}</TableCell>
            <TableCell className="text-right text-xs">
              {(r.exploration_rate * 100).toFixed(1)}%
            </TableCell>
            <TableCell className="text-right text-xs">{r.total_decisions}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
