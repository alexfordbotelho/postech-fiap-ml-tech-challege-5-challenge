"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  Shield,
  Zap,
  PiggyBank,
  Award,
  CreditCard,
  BarChart3,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { useFlagPayload } from "@/hooks/useFlagPayload";
import { useUserContext } from "@/hooks/useUserContext";
import { api } from "@/lib/api";
import { PRODUCT_CATALOG } from "@/lib/product-constants";
import type { DecideResponse } from "@/lib/types";
import type { ArmKey } from "@/lib/product-constants";

/* ── Product UI mapping — XP warm palette ── */
const PRODUCT_UI: Record<
  string,
  { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }
> = {
  savings_account:  { icon: PiggyBank,  color: "#A0A0A0" },
  term_deposit_6m:  { icon: BarChart3,  color: "#FFD100" },
  term_deposit_12m: { icon: TrendingUp, color: "#FFD100" },
  personal_loan:    { icon: CreditCard, color: "#A0A0A0" },
  premium_savings:  { icon: Award,      color: "#FFD100" },
};

const FEATURED_ARMS: ArmKey[] = ["term_deposit_12m", "term_deposit_6m", "premium_savings"];

const STATS = [
  { value: "R$ 2,8bi", label: "em investimentos" },
  { value: "47k+",     label: "clientes ativos" },
  { value: "112%",     label: "CDI máximo" },
  { value: "99,9%",    label: "uptime garantido" },
];

const WHY_ITEMS = [
  {
    icon: Shield,
    title: "Segurança",
    desc: "Plataforma 100% segura com criptografia de ponta e conformidade LGPD.",
  },
  {
    icon: Zap,
    title: "Inteligência Adaptativa",
    desc: "Sistema aprende com seu perfil e seleciona automaticamente a melhor oferta.",
  },
  {
    icon: TrendingUp,
    title: "Alta Rentabilidade",
    desc: "Produtos com até 112% CDI para maximizar seus rendimentos.",
  },
];

export default function HomePage() {
  const { context: userCtx } = useUserContext();
  const { isFlagEnabled, getFlagValue, isLoading } = useFlagPayload(userCtx);
  const [decideResult, setDecideResult] = useState<DecideResponse | null>(null);

  const adaptiveEnabled = isFlagEnabled("adaptive_policy_enabled");

  // Evaluated A/B color for this user's segment
  const ctaColor = (getFlagValue("cta_button_color") as string | null) ?? "#FFD100";
  const ctaHover = ctaColor === "#FFD100" ? "#E6BC00" : "#16A34A";

  useEffect(() => {
    if (!adaptiveEnabled) return;
    api
      .decide({
        features: userCtx.features as Record<string, unknown>,
        channel: userCtx.channel,
        policy: "contextual_thompson",
      })
      .then(setDecideResult)
      .catch(() => {});
  }, [adaptiveEnabled, userCtx.segment, userCtx.channel]);

  const recommendedArm = (decideResult?.offer_id ?? "term_deposit_12m") as ArmKey;
  const recommendedProduct = PRODUCT_CATALOG[recommendedArm];

  return (
    <div className="overflow-x-hidden">

      {/* ════════════════ HERO ════════════════ */}
      <section className="relative min-h-[calc(100vh-57px)] flex flex-col items-center justify-center px-6 py-24 text-center overflow-hidden hero-mesh dot-grid ao-bg">

        {/* Ambient layers — depth effect like Stripe/Mercury */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[1px] w-2/3 bg-gradient-to-r from-transparent via-[#FFD100]/25 to-transparent" />
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-80 w-[600px] rounded-full bg-[#FFD100]/4 blur-[100px]" />
        <div className="pointer-events-none absolute top-1/3 -left-32 h-64 w-64 rounded-full bg-[#FFD100]/3 blur-[80px]" />
        <div className="pointer-events-none absolute bottom-1/4 -right-24 h-48 w-48 rounded-full bg-white/[0.015] blur-[60px]" />

        <div className="relative z-10 max-w-4xl mx-auto">

          {/* Status badge */}
          <div className="flex justify-center mb-8 opacity-0 animate-fade-up" style={{ animationDelay: "0ms" }}>
            {!isLoading && adaptiveEnabled ? (
              <span className="xp-tag">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FFD100] animate-pulse" />
                Sistema Adaptativo Ativo
              </span>
            ) : (
              <span className="xp-tag" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", color: "#666" }}>
                Plataforma de Investimentos
              </span>
            )}
          </div>

          {/* Headline */}
          <div className="mb-6 opacity-0 animate-fade-up" style={{ animationDelay: "80ms" }}>
            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95]">
              <span className="text-white block">Investimentos</span>
              <span className="text-[#FFD100] block">inteligentes.</span>
            </h1>
          </div>

          {/* Sub */}
          <p className="text-lg text-[#666] max-w-xl mx-auto mb-10 opacity-0 animate-fade-up leading-relaxed" style={{ animationDelay: "160ms" }}>
            Ofertas personalizadas em tempo real. Nosso sistema adaptativo identifica
            o produto ideal para o seu perfil de investidor.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 opacity-0 animate-fade-up" style={{ animationDelay: "240ms" }}>
            <Link href="/produtos">
              <button
                className="h-12 px-8 text-black text-sm font-bold rounded-sm transition-all inline-flex items-center gap-2 glow-yellow-sm hover:glow-yellow"
                style={{ backgroundColor: ctaColor }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = ctaHover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = ctaColor; }}
              >
                Ver Produtos <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            {!isLoading && adaptiveEnabled && recommendedProduct && (
              <Link href={`/produtos/${recommendedArm}`}>
                <button className="h-12 px-8 border border-[#FFD100]/20 hover:border-[#FFD100]/50 text-[#FFD100] text-sm font-semibold rounded-sm transition-all inline-flex items-center gap-2 hover:bg-[#FFD100]/5">
                  <Sparkles className="h-4 w-4" />
                  Oferta Recomendada
                </button>
              </Link>
            )}
          </div>

          {/* Recommended product micro-pill */}
          {!isLoading && adaptiveEnabled && recommendedProduct && (
            <div className="mt-8 opacity-0 animate-fade-up" style={{ animationDelay: "320ms" }}>
              <Link href={`/produtos/${recommendedArm}`}>
                <div className="inline-flex items-center gap-3 border border-[#242424] hover:border-[#FFD100]/25 rounded-sm px-4 py-2.5 transition-all group cursor-pointer bg-[#0F0F0F]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#555]">IA recomenda:</span>
                    <span className="text-xs font-semibold text-white">{recommendedProduct.name}</span>
                    <span className="text-xs font-bold text-[#FFD100]">{recommendedProduct.rate}</span>
                  </div>
                  <ArrowRight className="h-3 w-3 text-[#444] group-hover:text-[#FFD100] transition-colors" />
                </div>
              </Link>
            </div>
          )}
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-float opacity-30">
          <ChevronDown className="h-5 w-5 text-[#FFD100]" />
        </div>
      </section>

      {/* ════════════════ STATS ════════════════ */}
      <section className="border-y border-[#1A1A1A] bg-[#0A0A0A] px-6 py-12">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <div key={s.label} className="text-center" style={{ animationDelay: `${i * 80}ms` }}>
              <p className="text-3xl font-black text-[#FFD100]">{s.value}</p>
              <p className="text-xs text-[#555] mt-1.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════ FEATURED PRODUCTS ════════════════ */}
      <section className="px-6 py-20 max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-10">
          <div className="opacity-0 animate-fade-up" style={{ animationDelay: "0ms" }}>
            <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-2">Portfólio</p>
            <h2 className="text-3xl font-black text-white">Produtos em Destaque</h2>
            <p className="text-[#555] mt-1.5 text-sm">
              {adaptiveEnabled ? "Selecionados com base no seu perfil" : "Nossos produtos mais populares"}
            </p>
          </div>
          <Link href="/produtos" className="opacity-0 animate-fade-up" style={{ animationDelay: "100ms" }}>
            <button className="text-xs text-[#555] hover:text-[#FFD100] transition-colors inline-flex items-center gap-1.5 font-semibold">
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FEATURED_ARMS.map((arm, i) => {
            const p = PRODUCT_CATALOG[arm];
            const ui = PRODUCT_UI[arm];
            const Icon = ui?.icon ?? TrendingUp;
            const isRecommended = arm === recommendedArm && adaptiveEnabled;

            return (
              <Link
                key={arm}
                href={`/produtos/${arm}`}
                className="opacity-0 animate-fade-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className={`group relative rounded-sm p-6 h-full transition-all duration-200 cursor-pointer border ${
                  isRecommended
                    ? "bg-[#141414] border-[#FFD100]/30 hover:border-[#FFD100]/50"
                    : "bg-[#0F0F0F] border-[#1E1E1E] hover:border-[#FFD100]/20 hover:bg-[#141414]"
                }`}>
                  {/* Recommended top accent line */}
                  {isRecommended && (
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFD100] to-transparent rounded-t-sm" />
                  )}

                  {/* Badge */}
                  {isRecommended && (
                    <div className="absolute -top-3 left-4">
                      <span className="xp-tag text-[10px]">
                        <Sparkles className="h-2.5 w-2.5" /> Recomendado pela IA
                      </span>
                    </div>
                  )}
                  {p.badge && !isRecommended && (
                    <div className="absolute -top-2.5 left-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-[#1E1E1E] border border-[#2A2A2A] text-[#888] text-[10px] font-semibold">
                        {p.badge}
                      </span>
                    </div>
                  )}

                  {/* Icon */}
                  <div className="mb-5">
                    <Icon className="h-6 w-6" style={{ color: isRecommended ? "#FFD100" : "#444" }} />
                  </div>

                  <h3 className="text-base font-bold text-white mb-1">{p.name}</h3>
                  <p className="text-xs text-[#555] mb-5">{p.term}</p>

                  <p className={`text-2xl font-black ${isRecommended ? "text-[#FFD100]" : "text-[#888]"}`}>
                    {p.rate}
                  </p>

                  <div className="mt-5 pt-4 border-t border-[#1A1A1A] flex items-center gap-1.5 text-xs text-[#444] group-hover:text-[#FFD100] transition-colors font-semibold">
                    Ver detalhes <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ════════════════ WHY ════════════════ */}
      <section className="px-6 py-20 border-t border-[#1A1A1A] bg-[#080808]">
        <div className="max-w-5xl mx-auto">
          <div className="mb-14">
            <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-2">Diferenciais</p>
            <h2 className="text-3xl font-black text-white">Por que AdaptaOffer?</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-0">
            {WHY_ITEMS.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className={`p-8 opacity-0 animate-fade-up border-r border-[#1A1A1A] last:border-r-0 ${i === 0 ? "" : ""}`}
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="h-10 w-10 rounded-sm bg-[#FFD100]/8 border border-[#FFD100]/15 flex items-center justify-center mb-5">
                    <Icon className="h-5 w-5 text-[#FFD100]" />
                  </div>
                  <h3 className="font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-[#555] leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════ CTA BANNER ════════════════ */}
      <section className="px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden rounded-sm border border-[#FFD100]/15 bg-[#0D0D0D] p-12 sm:p-16 text-center noise">
            {/* Yellow glow corners */}
            <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-32 w-64 rounded-full bg-[#FFD100]/6 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 h-24 w-48 rounded-full bg-[#FFD100]/4 blur-3xl" />
            {/* Top line accent */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFD100]/40 to-transparent" />

            <div className="relative z-10">
              <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-4">Comece hoje</p>
              <h2 className="text-4xl sm:text-5xl font-black text-white mb-4 leading-tight">
                Pronto para<br />
                <span className="text-[#FFD100]">investir melhor?</span>
              </h2>
              <p className="text-[#555] mb-10 max-w-md mx-auto text-sm leading-relaxed">
                {adaptiveEnabled
                  ? "Nossa IA já identificou a melhor oferta para o seu perfil. Contrate em poucos passos."
                  : "Explore nosso portfólio e encontre o produto financeiro ideal para você."}
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Link href="/produtos">
                  <button
                    className="h-13 px-10 text-black text-sm font-black rounded-sm transition-all inline-flex items-center gap-2 glow-yellow hover:scale-[1.02]"
                    style={{ backgroundColor: ctaColor }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = ctaHover; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = ctaColor; }}
                  >
                    Explorar Produtos <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
                {adaptiveEnabled && (
                  <Link href={`/produtos/${recommendedArm}`}>
                    <button className="h-13 px-10 border border-[#FFD100]/25 hover:border-[#FFD100]/50 text-[#FFD100] text-sm font-semibold rounded-sm transition-all inline-flex items-center gap-2 hover:bg-[#FFD100]/5">
                      <Sparkles className="h-4 w-4" />
                      Ver minha oferta
                    </button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
