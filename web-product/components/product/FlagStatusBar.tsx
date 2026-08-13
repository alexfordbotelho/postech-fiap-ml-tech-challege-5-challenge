import type { FeatureFlagItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Flag } from "lucide-react";

const FLAG_LABELS: Record<string, string> = {
  adaptive_policy_enabled: "Política Adaptativa",
  bandit_arms_enabled: "Arms Filtrados",
  exploration_boost: "Boost Exploração",
  show_rate_simulator: "Simulador",
  simplified_checkout: "Checkout Simplificado",
  cta_button_color: "A/B: Cor do Botão",
};

function ColorSwatch({ color }: { color: string }) {
  const label = color === "#FFD100" ? "Variante A" : color === "#22C55E" ? "Variante B" : "Custom";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-full border border-border"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs">{label}</span>
    </span>
  );
}

interface FlagStatusBarProps {
  flags: FeatureFlagItem[];
  ctaColor?: string;
}

export function FlagStatusBar({ flags, ctaColor }: FlagStatusBarProps) {
  if (flags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
      <Flag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Flags ativas nesta página:</span>
      {flags.map((f) => (
        <Badge key={f.flag_key} variant="secondary" className="text-xs font-normal inline-flex items-center gap-1.5">
          {FLAG_LABELS[f.flag_key] ?? f.flag_key}
          {f.flag_key === "cta_button_color" && ctaColor && (
            <ColorSwatch color={ctaColor} />
          )}
        </Badge>
      ))}
      <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
        atualiza em tempo real
      </span>
    </div>
  );
}
