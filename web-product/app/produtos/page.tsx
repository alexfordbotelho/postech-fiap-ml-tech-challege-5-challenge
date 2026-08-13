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
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:px-6">
        <Skeleton className="h-9 w-64 rounded-xl bg-[#1A1A1A]" />
        <Skeleton className="h-5 w-80 max-w-full rounded-xl bg-[#1A1A1A]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl bg-[#1A1A1A]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">

      {/* ── Header ── */}
      <div className="mb-10">
        <div className="opacity-0 animate-fade-up" style={{ animationDelay: "0ms" }}>
          <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-3">Portfólio</p>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-4xl font-black text-white sm:text-5xl">Produtos</h1>
            {adaptiveEnabled && (
              <span className="xp-tag">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FFD100] animate-pulse" />
                IA Ativa
              </span>
            )}
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[#999]">
            {adaptiveEnabled
              ? "O sistema identificou a melhor oferta para o seu perfil. Explore e compare."
              : "Explore nosso portfólio completo de produtos financeiros."}
          </p>
        </div>

        {/* Flag status bar (developer) */}
        {activePageFlags.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-[#242424] bg-[#0A0A0A]/80 px-4 py-3 opacity-0 animate-fade-up" style={{ animationDelay: "80ms" }}>
            <Flag className="h-3.5 w-3.5 text-[#777]" />
            <span className="text-xs text-[#999]">Flags ativas:</span>
            {activePageFlags.map((f) => (
              <Badge key={f.flag_key} variant="secondary" className="border-[#2C2C2C] bg-[#171717] font-mono text-[10px] text-[#AAA]">
                {f.flag_key}
              </Badge>
            ))}
            <span className="ml-auto text-[10px] text-[#777]">atualiza 15s</span>
          </div>
        )}
      </div>

      {/* ── Hidden count ── */}
      {hiddenCount > 0 && (
        <div className="mb-6 rounded-xl border border-[#FFD100]/15 bg-[#FFD100]/5 px-4 py-3 text-xs text-[#FFD100]">
          {hiddenCount} produto{hiddenCount > 1 ? "s" : ""} ocultado{hiddenCount > 1 ? "s" : ""} pela flag{" "}
          <code className="font-mono">bandit_arms_enabled</code>
        </div>
      )}

      {/* ── Recommended banner ── */}
      {recommendedArm && PRODUCT_CATALOG[recommendedArm as ArmKey] && (
        <div className="mb-10 opacity-0 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <Link href={`/produtos/${recommendedArm}`}>
            <div className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[#FFD100]/20 bg-[#0E0E0E] p-5 transition-all hover:-translate-y-0.5 hover:border-[#FFD100]/40 hover:shadow-[0_24px_60px_-38px_rgba(255,209,0,0.6)] sm:p-6">
              {/* Top line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFD100]/50 to-transparent" />
              {/* Glow */}
              <div className="pointer-events-none absolute -right-16 -top-8 h-40 w-40 rounded-full bg-[#FFD100]/5 blur-3xl" />

              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#FFD100]/15 bg-[#FFD100]/[0.08]">
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
                    <p className="text-xs text-[#999]">{PRODUCT_CATALOG[recommendedArm as ArmKey]?.term}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-5 sm:justify-end">
                  <p className="text-2xl font-black text-[#FFD100]">
                    {PRODUCT_CATALOG[recommendedArm as ArmKey]?.rate}
                  </p>
                  <button className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#FFD100] px-5 text-xs font-bold text-black transition-all hover:bg-[#E6BC00]">
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
        <div className="rounded-2xl border border-dashed border-[#2A2A2A] p-12 text-center sm:p-16">
          <p className="text-sm text-[#999]">
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
                <div className={`group relative flex h-full cursor-pointer flex-col rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-38px_rgba(255,209,0,0.5)] ${
                  isRecommended
                    ? "bg-[#141414] border-[#FFD100]/25 hover:border-[#FFD100]/50"
                    : "bg-[#0F0F0F] border-[#1E1E1E] hover:border-[#FFD100]/15 hover:bg-[#141414]"
                }`}>
                  {/* Recommended top accent */}
                  {isRecommended && (
                    <div className="absolute left-4 right-4 top-0 h-px bg-gradient-to-r from-transparent via-[#FFD100] to-transparent" />
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
                      <span className="inline-flex items-center rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2 py-0.5 text-[10px] font-semibold text-[#AAA]">
                        {p.badge}
                      </span>
                    </div>
                  )}

                  <Icon className="mb-5 h-6 w-6" style={{ color: isRecommended ? "#FFD100" : "#888" }} />

                  <h3 className="text-base font-bold text-white mb-1.5">{p.name}</h3>
                  <p className="mb-4 flex-1 text-xs leading-relaxed text-[#999]">{desc}</p>

                  <div className="pt-4 border-t border-[#1A1A1A]">
                    <p className="mb-0.5 text-2xl font-black" style={{ color: isRecommended ? "#FFD100" : "#BBB" }}>
                      {p.rate}
                    </p>
                    <p className="text-xs text-[#888]">{p.term}</p>
                  </div>

                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-[#888] transition-colors group-hover:text-[#FFD100]">
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
