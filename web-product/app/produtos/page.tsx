"use client";

import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  PiggyBank,
  Award,
  CreditCard,
  BarChart3,
  Sparkles,
  Flag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFlagPayload } from "@/hooks/useFlagPayload";
import { PRODUCT_CATALOG } from "@/lib/product-constants";
import type { ArmKey } from "@/lib/product-constants";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DecideResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

const PRODUCT_UI: Record<
  string,
  { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; accent: string; featured: boolean }
> = {
  savings_account:  { icon: PiggyBank,  accent: "#888",    featured: false },
  term_deposit_6m:  { icon: BarChart3,  accent: "#FFD100", featured: true  },
  term_deposit_12m: { icon: TrendingUp, accent: "#FFD100", featured: true  },
  personal_loan:    { icon: CreditCard, accent: "#888",    featured: false },
  premium_savings:  { icon: Award,      accent: "#FFD100", featured: true  },
};

const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  savings_account:  "Liquidez diária com rentabilidade acima da poupança tradicional. Ideal para reserva de emergência.",
  term_deposit_6m:  "Rendimento superior com prazo de 6 meses. Equilíbrio perfeito entre prazo e rentabilidade.",
  term_deposit_12m: "Máxima rentabilidade para quem pode planejar a médio prazo. Nosso produto mais popular.",
  personal_loan:    "Crédito pessoal com taxa competitiva e parcelas fixas. Simulação sem compromisso.",
  premium_savings:  "Poupança premium com rentabilidade diferenciada e benefícios exclusivos.",
};

const ALL_ARMS = Object.keys(PRODUCT_CATALOG) as ArmKey[];

export default function ProdutosPage() {
  const { isFlagEnabled, getFlag, activePageFlags, isLoading } = useFlagPayload();
  const [decideResult, setDecideResult] = useState<DecideResponse | null>(null);

  const adaptiveEnabled =
    isFlagEnabled("adaptive_policy_enabled") &&
    getFlag("adaptive_policy_enabled") === true;

  const armsEnabledRaw = getFlag("bandit_arms_enabled");
  const armsEnabled: string[] | true = Array.isArray(armsEnabledRaw) ? armsEnabledRaw : true;
  const visibleArms = armsEnabled === true ? ALL_ARMS : ALL_ARMS.filter((a) => (armsEnabled as string[]).includes(a));
  const hiddenCount = ALL_ARMS.length - visibleArms.length;

  useEffect(() => {
    if (!adaptiveEnabled) return;
    api
      .decide({ features: { segment: "young" }, channel: "web", policy: "contextual_thompson" })
      .then(setDecideResult)
      .catch(() => {});
  }, [adaptiveEnabled]);

  const recommendedArm = decideResult?.offer_id ?? null;

  if (isLoading) {
    return (
      <div className="px-6 py-16 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-9 w-64 rounded-sm bg-[#1A1A1A]" />
        <Skeleton className="h-5 w-80 rounded-sm bg-[#1A1A1A]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-sm bg-[#1A1A1A]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-16 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="mb-10">
        <div className="opacity-0 animate-fade-up" style={{ animationDelay: "0ms" }}>
          <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-3">Portfólio</p>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-4xl font-black text-white">Produtos</h1>
            {adaptiveEnabled && (
              <span className="xp-tag">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FFD100] animate-pulse" />
                IA Ativa
              </span>
            )}
          </div>
          <p className="text-[#555] text-sm">
            {adaptiveEnabled
              ? "O sistema identificou a melhor oferta para o seu perfil. Explore e compare."
              : "Explore nosso portfólio completo de produtos financeiros."}
          </p>
        </div>

        {/* Flag status bar (developer) */}
        {activePageFlags.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2 border border-[#1E1E1E] bg-[#0A0A0A] px-4 py-3 rounded-sm opacity-0 animate-fade-up" style={{ animationDelay: "80ms" }}>
            <Flag className="h-3.5 w-3.5 text-[#333]" />
            <span className="text-xs text-[#444]">Flags ativas:</span>
            {activePageFlags.map((f) => (
              <Badge key={f.flag_key} variant="secondary" className="text-[10px] font-mono bg-[#141414] text-[#555] border-[#242424]">
                {f.flag_key}
              </Badge>
            ))}
            <span className="ml-auto text-[10px] text-[#333]">atualiza 15s</span>
          </div>
        )}
      </div>

      {/* ── Hidden count ── */}
      {hiddenCount > 0 && (
        <div className="mb-6 border border-[#FFD100]/15 bg-[#FFD100]/5 px-4 py-3 rounded-sm text-xs text-[#FFD100]">
          {hiddenCount} produto{hiddenCount > 1 ? "s" : ""} ocultado{hiddenCount > 1 ? "s" : ""} pela flag{" "}
          <code className="font-mono">bandit_arms_enabled</code>
        </div>
      )}

      {/* ── Recommended banner ── */}
      {recommendedArm && PRODUCT_CATALOG[recommendedArm as ArmKey] && (
        <div className="mb-10 opacity-0 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <Link href={`/produtos/${recommendedArm}`}>
            <div className="relative overflow-hidden border border-[#FFD100]/20 hover:border-[#FFD100]/40 bg-[#0E0E0E] rounded-sm p-6 transition-all group cursor-pointer">
              {/* Top line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFD100]/50 to-transparent" />
              {/* Glow */}
              <div className="pointer-events-none absolute -right-16 -top-8 h-40 w-40 rounded-full bg-[#FFD100]/5 blur-3xl" />

              <div className="relative flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-[#FFD100]/8 border border-[#FFD100]/15 rounded-sm flex items-center justify-center">
                    {(() => { const Icon = PRODUCT_UI[recommendedArm]?.icon ?? TrendingUp; return <Icon className="h-5 w-5 text-[#FFD100]" />; })()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="xp-tag text-[10px]">
                        <Sparkles className="h-2.5 w-2.5" /> Recomendado pela IA
                      </span>
                    </div>
                    <h3 className="font-bold text-white text-sm">
                      {PRODUCT_CATALOG[recommendedArm as ArmKey]?.name}
                    </h3>
                    <p className="text-xs text-[#555]">{PRODUCT_CATALOG[recommendedArm as ArmKey]?.term}</p>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <p className="text-2xl font-black text-[#FFD100]">
                    {PRODUCT_CATALOG[recommendedArm as ArmKey]?.rate}
                  </p>
                  <button className="h-9 px-5 bg-[#FFD100] hover:bg-[#E6BC00] text-black text-xs font-bold rounded-sm transition-all inline-flex items-center gap-1.5">
                    Ver oferta <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* ── Product grid ── */}
      {visibleArms.length === 0 ? (
        <div className="border border-dashed border-[#2A2A2A] p-16 text-center rounded-sm">
          <p className="text-sm text-[#444]">
            Nenhum produto disponível — <code className="font-mono text-xs">bandit_arms_enabled</code> está vazio
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleArms.map((arm, i) => {
            const p = PRODUCT_CATALOG[arm];
            const ui = PRODUCT_UI[arm];
            const Icon = ui?.icon ?? TrendingUp;
            const isRecommended = arm === recommendedArm;
            const desc = PRODUCT_DESCRIPTIONS[arm];

            return (
              <Link
                key={arm}
                href={`/produtos/${arm}`}
                className="opacity-0 animate-fade-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className={`group relative rounded-sm p-6 h-full flex flex-col transition-all duration-200 cursor-pointer border ${
                  isRecommended
                    ? "bg-[#141414] border-[#FFD100]/25 hover:border-[#FFD100]/50"
                    : "bg-[#0F0F0F] border-[#1E1E1E] hover:border-[#FFD100]/15 hover:bg-[#141414]"
                }`}>
                  {/* Recommended top accent */}
                  {isRecommended && (
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFD100] to-transparent rounded-t-sm" />
                  )}

                  {isRecommended && (
                    <div className="absolute -top-3 left-4">
                      <span className="xp-tag text-[10px]">
                        <Sparkles className="h-2.5 w-2.5" /> Recomendado
                      </span>
                    </div>
                  )}
                  {p.badge && !isRecommended && (
                    <div className="absolute -top-2.5 left-4">
                      <span className="inline-flex items-center px-2 py-0.5 bg-[#1A1A1A] border border-[#2A2A2A] text-[#666] text-[10px] font-semibold rounded-sm">
                        {p.badge}
                      </span>
                    </div>
                  )}

                  <Icon className="h-6 w-6 mb-5" style={{ color: isRecommended ? "#FFD100" : "#333" }} />

                  <h3 className="text-base font-bold text-white mb-1.5">{p.name}</h3>
                  <p className="text-xs text-[#555] leading-relaxed mb-4 flex-1">{desc}</p>

                  <div className="pt-4 border-t border-[#1A1A1A]">
                    <p className="text-2xl font-black mb-0.5" style={{ color: isRecommended ? "#FFD100" : "#666" }}>
                      {p.rate}
                    </p>
                    <p className="text-xs text-[#444]">{p.term}</p>
                  </div>

                  <div className="mt-4 flex items-center gap-1.5 text-xs text-[#333] group-hover:text-[#FFD100] transition-colors font-semibold">
                    Ver detalhes <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
