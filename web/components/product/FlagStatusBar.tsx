import type { FeatureFlagItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Flag } from "lucide-react";

const FLAG_LABELS: Record<string, string> = {
  adaptive_policy_enabled: "Política Adaptativa",
  bandit_arms_enabled: "Arms Filtrados",
  exploration_boost: "Boost Exploração",
  show_rate_simulator: "Simulador",
  simplified_checkout: "Checkout Simplificado",
};

export function FlagStatusBar({ flags }: { flags: FeatureFlagItem[] }) {
  if (flags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
      <Flag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Flags ativas nesta página:</span>
      {flags.map((f) => (
        <Badge key={f.flag_key} variant="secondary" className="text-xs font-normal">
          {FLAG_LABELS[f.flag_key] ?? f.flag_key}
        </Badge>
      ))}
      <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
        atualiza a cada 15s
      </span>
    </div>
  );
}
