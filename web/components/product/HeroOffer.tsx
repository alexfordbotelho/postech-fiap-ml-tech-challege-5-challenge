import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { PRODUCT_CATALOG } from "@/lib/product-constants";
import type { ArmKey } from "@/lib/product-constants";

interface HeroOfferProps {
  adaptiveEnabled: boolean;
  armSelected: string | null;
  isExploration: boolean;
  explorationBoost: number;
  onContratar: () => void;
}

export function HeroOffer({
  adaptiveEnabled,
  armSelected,
  isExploration,
  explorationBoost,
  onContratar,
}: HeroOfferProps) {
  const arm = (armSelected ?? "savings_account") as ArmKey;
  const product = PRODUCT_CATALOG[arm] ?? PRODUCT_CATALOG.savings_account;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 border border-indigo-900/40 p-8">
      <div className="flex flex-wrap gap-2 mb-5">
        {explorationBoost > 1.0 && (
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40">
            <Sparkles className="mr-1 h-3 w-3" />
            Oferta Especial
          </Badge>
        )}
        {adaptiveEnabled ? (
          <Badge className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            Recomendado para seu perfil
          </Badge>
        ) : (
          <Badge variant="outline" className="border-slate-700 text-slate-500 text-xs">
            Oferta padrão — política adaptativa desativada
          </Badge>
        )}
        {isExploration && (
          <Badge className="bg-violet-500/20 text-violet-300 border border-violet-500/40 text-xs">
            🔍 Explorando
          </Badge>
        )}
      </div>

      <h1 className="text-4xl font-bold text-white mb-2">{product.name}</h1>

      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-5xl font-extrabold text-indigo-400">{product.rate}</span>
      </div>

      <p className="text-slate-400 text-sm mb-8">
        {product.term}
        {adaptiveEnabled ? " · Selecionado com base no seu perfil" : ""}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onContratar}
          size="lg"
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
        >
          Contratar agora
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          Ver detalhes
        </Button>
      </div>

      <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-violet-600/5 blur-3xl pointer-events-none" />
    </div>
  );
}
