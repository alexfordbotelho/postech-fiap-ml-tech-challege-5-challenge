import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import { PRODUCT_CATALOG } from "@/lib/product-constants";
import type { ArmKey } from "@/lib/product-constants";

interface HeroOfferProps {
  adaptiveEnabled: boolean;
  armSelected: string | null;
  isExploration: boolean;
  explorationBoost: number;
  onContratar: () => void;
  ctaColor?: string;
}

export function HeroOffer({
  adaptiveEnabled,
  armSelected,
  isExploration,
  explorationBoost,
  onContratar,
  ctaColor = "#FFD100",
}: HeroOfferProps) {
  const arm = (armSelected ?? "savings_account") as ArmKey;
  const product = PRODUCT_CATALOG[arm] ?? PRODUCT_CATALOG.savings_account;

  return (
    <div className="relative overflow-hidden rounded-sm border border-[#1E1E1E] bg-[#0D0D0D] p-8">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFD100]/40 to-transparent" />
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-16 -top-8 h-48 w-48 rounded-full bg-[#FFD100]/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 left-1/4 h-32 w-64 rounded-full bg-[#FFD100]/3 blur-3xl" />

      <div className="relative">
        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-6">
          {explorationBoost > 1.0 && (
            <span className="xp-tag text-[11px]">
              <Sparkles className="h-3 w-3" />
              Oferta Especial
            </span>
          )}
          {adaptiveEnabled ? (
            <span className="xp-tag text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FFD100] animate-pulse" />
              Recomendado para seu perfil
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#242424] text-[#444] text-[11px] font-semibold">
              Oferta padrão — IA desativada
            </span>
          )}
          {isExploration && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#FFD100]/15 bg-[#FFD100]/5 text-[#FFD100] text-[11px] font-semibold">
              Explorando
            </span>
          )}
        </div>

        <h1 className="text-3xl font-black text-white mb-3">{product.name}</h1>

        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-5xl font-black text-[#FFD100]">{product.rate}</span>
        </div>

        <p className="text-[#555] text-sm mb-8">
          {product.term}
          {adaptiveEnabled ? " · Selecionado pelo sistema adaptativo" : ""}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onContratar}
            size="lg"
            className="h-11 px-8 text-black font-bold rounded-sm transition-all glow-yellow-sm hover:glow-yellow inline-flex items-center gap-2"
            style={{ backgroundColor: ctaColor }}
          >
            Contratar agora <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-11 px-8 border-[#242424] text-[#888] hover:text-white hover:border-[#333] hover:bg-white/5 rounded-sm transition-all"
          >
            Ver detalhes
          </Button>
        </div>
      </div>
    </div>
  );
}
