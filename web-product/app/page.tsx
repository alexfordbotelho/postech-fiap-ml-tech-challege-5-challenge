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
      <section className="relative flex min-h-[calc(100svh-64px)] flex-col items-center justify-center overflow-hidden px-4 py-20 text-center hero-mesh dot-grid ao-bg sm:px-6 sm:py-24">

        {/* Ambient layers — depth effect like Stripe/Mercury */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[1px] w-2/3 bg-gradient-to-r from-transparent via-[#FFD100]/25 to-transparent" />
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-80 w-[600px] rounded-full bg-[#FFD100]/4 blur-[100px]" />
        <div className="pointer-events-none absolute top-1/3 -left-32 h-64 w-64 rounded-full bg-[#FFD100]/3 blur-[80px]" />
        <div className="pointer-events-none absolute bottom-1/4 -right-24 h-48 w-48 rounded-full bg-white/[0.015] blur-[60px]" />

        <div className="relative z-10 mx-auto max-w-5xl">

          {/* Status badge */}
          <div className="mb-7 flex justify-center opacity-0 animate-fade-up" style={{ animationDelay: "0ms" }}>
            {!isLoading && adaptiveEnabled ? (
              <span className="xp-tag">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FFD100] animate-pulse" />
                Sistema Adaptativo Ativo
              </span>
            ) : (
              <span className="xp-tag" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", color: "#aaa" }}>
                Plataforma de Investimentos
              </span>
            )}
          </div>

          {/* Headline */}
          <div className="mb-6 opacity-0 animate-fade-up" style={{ animationDelay: "80ms" }}>
            <h1 className="text-balance text-5xl font-black leading-[0.94] tracking-[-0.055em] sm:text-7xl lg:text-8xl">
              <span className="text-white block">Investimentos</span>
              <span className="gradient-text-yellow block">inteligentes.</span>
            </h1>
          </div>

          {/* Sub */}
          <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-[#AAA] opacity-0 animate-fade-up sm:text-lg" style={{ animationDelay: "160ms" }}>
            Ofertas personalizadas em tempo real. Nosso sistema adaptativo identifica
            o produto ideal para o seu perfil de investidor.
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-stretch justify-center gap-3 opacity-0 animate-fade-up sm:flex-row sm:items-center" style={{ animationDelay: "240ms" }}>
            <Link href="/produtos" className="w-full sm:w-auto">
              <button
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-8 text-sm font-bold text-black transition-all glow-yellow-sm hover:-translate-y-0.5 hover:glow-yellow sm:w-auto"
                style={{ backgroundColor: ctaColor }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = ctaHover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = ctaColor; }}
              >
                Ver Produtos <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            {!isLoading && adaptiveEnabled && recommendedProduct && (
              <Link href={`/produtos/${recommendedArm}`} className="w-full sm:w-auto">
                <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#FFD100]/20 px-8 text-sm font-semibold text-[#FFD100] transition-all hover:-translate-y-0.5 hover:border-[#FFD100]/50 hover:bg-[#FFD100]/5 sm:w-auto">
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
                <div className="group inline-flex max-w-full cursor-pointer items-center gap-3 rounded-xl border border-[#2C2C2A] bg-[#0F0F0F]/90 px-4 py-2.5 transition-all hover:border-[#FFD100]/25">
                  <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1">
                    <span className="text-xs text-[#999]">IA recomenda:</span>
                    <span className="text-xs font-semibold text-white">{recommendedProduct.name}</span>
                    <span className="text-xs font-bold text-[#FFD100]">{recommendedProduct.rate}</span>
                  </div>
                  <ArrowRight className="h-3 w-3 shrink-0 text-[#777] transition-colors group-hover:text-[#FFD100]" />
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
      <section className="border-y border-white/[0.06] bg-white/[0.015] px-4 py-10 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} className="text-center" style={{ animationDelay: `${i * 80}ms` }}>
              <p className="text-3xl font-black text-[#FFD100]">{s.value}</p>
              <p className="mt-1.5 text-xs font-medium text-[#999]">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════ FEATURED PRODUCTS ════════════════ */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="opacity-0 animate-fade-up" style={{ animationDelay: "0ms" }}>
            <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-2">Portfólio</p>
            <h2 className="text-3xl font-black text-white">Produtos em Destaque</h2>
            <p className="mt-1.5 text-sm text-[#999]">
              {adaptiveEnabled ? "Selecionados com base no seu perfil" : "Nossos produtos mais populares"}
            </p>
          </div>
          <Link href="/produtos" className="opacity-0 animate-fade-up" style={{ animationDelay: "100ms" }}>
            <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#999] transition-colors hover:text-[#FFD100]">
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
                <div className={`group relative h-full cursor-pointer rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-36px_rgba(255,209,0,0.55)] ${
                  isRecommended
                    ? "bg-[#141414] border-[#FFD100]/30 hover:border-[#FFD100]/50"
                    : "bg-[#0F0F0F] border-[#1E1E1E] hover:border-[#FFD100]/20 hover:bg-[#141414]"
                }`}>
                  {/* Recommended top accent line */}
                  {isRecommended && (
                    <div className="absolute left-4 right-4 top-0 h-px bg-gradient-to-r from-transparent via-[#FFD100] to-transparent" />
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
                      <span className="inline-flex items-center rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] px-2 py-0.5 text-[10px] font-semibold text-[#BBB]">
                        {p.badge}
                      </span>
                    </div>
                  )}

                  {/* Icon */}
                  <div className="mb-5">
                    <Icon className="h-6 w-6" style={{ color: isRecommended ? "#FFD100" : "#888" }} />
                  </div>

                  <h3 className="text-base font-bold text-white mb-1">{p.name}</h3>
                  <p className="mb-5 text-xs text-[#999]">{p.term}</p>

                  <p className={`text-2xl font-black ${isRecommended ? "text-[#FFD100]" : "text-[#BBB]"}`}>
                    {p.rate}
                  </p>

                  <div className="mt-5 flex items-center gap-1.5 border-t border-[#242424] pt-4 text-xs font-semibold text-[#888] transition-colors group-hover:text-[#FFD100]">
                    Ver detalhes <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ════════════════ WHY ════════════════ */}
      <section className="border-t border-white/[0.06] bg-[#080808] px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14">
            <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-2">Diferenciais</p>
            <h2 className="text-3xl font-black text-white">Por que AdaptaOffer?</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {WHY_ITEMS.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 opacity-0 animate-fade-up transition-colors hover:border-[#FFD100]/20 hover:bg-[#FFD100]/[0.03]"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-[#FFD100]/15 bg-[#FFD100]/[0.08]">
                    <Icon className="h-5 w-5 text-[#FFD100]" />
                  </div>
                  <h3 className="font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-[#999]">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════ CTA BANNER ════════════════ */}
      <section className="px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl border border-[#FFD100]/15 bg-[#0D0D0D] p-8 text-center noise sm:p-16">
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
              <p className="mx-auto mb-10 max-w-md text-sm leading-relaxed text-[#999]">
                {adaptiveEnabled
                  ? "Nossa IA já identificou a melhor oferta para o seu perfil. Contrate em poucos passos."
                  : "Explore nosso portfólio e encontre o produto financeiro ideal para você."}
              </p>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/produtos" className="w-full sm:w-auto">
                  <button
                    className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl px-10 text-sm font-black text-black transition-all glow-yellow hover:-translate-y-0.5 sm:w-auto"
                    style={{ backgroundColor: ctaColor }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = ctaHover; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = ctaColor; }}
                  >
                    Explorar Produtos <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
                {adaptiveEnabled && (
                  <Link href={`/produtos/${recommendedArm}`} className="w-full sm:w-auto">
                    <button className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl border border-[#FFD100]/25 px-10 text-sm font-semibold text-[#FFD100] transition-all hover:-translate-y-0.5 hover:border-[#FFD100]/50 hover:bg-[#FFD100]/5 sm:w-auto">
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
