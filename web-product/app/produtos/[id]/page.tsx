"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  PiggyBank,
  Award,
  CreditCard,
  BarChart3,
  Sparkles,
  Shield,
  Clock,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCT_CATALOG } from "@/lib/product-constants";
import type { ArmKey } from "@/lib/product-constants";
import { useFlagPayload } from "@/hooks/useFlagPayload";
import { useUserContext } from "@/hooks/useUserContext";

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

const PRODUCT_DESCRIPTIONS: Record<string, { short: string; long: string }> = {
  savings_account: {
    short: "Liquidez diária com rentabilidade superior à poupança tradicional.",
    long: "Resgate a qualquer momento sem perder rendimentos. Perfeito para reserva de emergência e objetivos de curto prazo. Rende 70% do CDI com liquidez imediata.",
  },
  term_deposit_6m: {
    short: "Equilíbrio entre prazo e rentabilidade com 105% CDI.",
    long: "Aplique por 6 meses e obtenha rendimentos acima de 100% do CDI. Ideal para objetivos de médio prazo como viagens, reformas ou veículos.",
  },
  term_deposit_12m: {
    short: "Máxima rentabilidade para quem pode planejar a médio prazo.",
    long: "Nosso produto mais popular. Rende 112% do CDI em 12 meses, superando a maioria das opções de renda fixa disponíveis no mercado. Ideal para objetivos definidos.",
  },
  personal_loan: {
    short: "Crédito pessoal com taxas competitivas e aprovação rápida.",
    long: "Parcelas fixas, sem surpresas. Simule gratuitamente e receba uma resposta em minutos.",
  },
  premium_savings: {
    short: "Poupança premium com 95% CDI e benefícios exclusivos.",
    long: "Para clientes que buscam mais do que uma poupança comum. Liquidez diária combinada com rentabilidade de 95% CDI e acesso a benefícios exclusivos do clube AdaptaOffer Premium.",
  },
};

const PRODUCT_FEATURES: Record<string, string[]> = {
  savings_account:  ["Liquidez diária", "Sem taxa de administração", "Cobertura FGC até R$ 250k", "Aplicação mínima: R$ 1"],
  term_deposit_6m:  ["105% do CDI", "Prazo: 6 meses", "Cobertura FGC até R$ 250k", "Aplicação mínima: R$ 100"],
  term_deposit_12m: ["112% do CDI", "Prazo: 12 meses", "Cobertura FGC até R$ 250k", "Aplicação mínima: R$ 500"],
  personal_loan:    ["Taxa: 1,9% a.m.", "Prazo: até 24 meses", "Aprovação em minutos", "Sem consulta ao SPC/Serasa"],
  premium_savings:  ["95% do CDI", "Liquidez diária", "Benefícios exclusivos Premium", "Cobertura FGC até R$ 250k"],
};

const CDI_AA = 0.105;

export default function ProductDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { context: userCtx } = useUserContext();
  const { isFlagEnabled, getFlagValue } = useFlagPayload(userCtx);
  const [valor, setValor] = useState("5000");
  const [meses, setMeses] = useState("12");

  const adaptiveEnabled = isFlagEnabled("adaptive_policy_enabled");
  const ctaColor = (getFlagValue("cta_button_color") as string | null) ?? "#FFD100";

  const arm = (id as ArmKey) in PRODUCT_CATALOG ? (id as ArmKey) : null;
  const product = arm ? PRODUCT_CATALOG[arm] : null;

  if (!product) {
    return (
      <div className="px-6 py-24 text-center max-w-md mx-auto">
        <p className="mb-6 text-[#999]">Produto não encontrado.</p>
        <Link href="/produtos">
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#2A2A2A] px-5 text-sm text-[#AAA] transition-all hover:border-[#FFD100]/30 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        </Link>
      </div>
    );
  }

  const ui = PRODUCT_UI[arm!];
  const Icon = ui?.icon ?? TrendingUp;
  const desc = PRODUCT_DESCRIPTIONS[arm!];
  const features = PRODUCT_FEATURES[arm!] ?? [];
  const isFeatured = ui?.featured ?? false;
  const accentColor = ui?.accent ?? "#888";

  const projection = (() => {
    if (!product.cdi) return null;
    const v = parseFloat(valor) || 0;
    const m = parseInt(meses) || 1;
    const taxaAa = product.cdi * CDI_AA;
    const taxaMensal = Math.pow(1 + taxaAa, 1 / 12) - 1;
    return v * Math.pow(1 + taxaMensal, m);
  })();

  const gain = projection ? projection - (parseFloat(valor) || 0) : null;

  return (
    <div>
      {/* ════════════════ HERO ════════════════ */}
      <section className="relative overflow-hidden border-b border-[#1A1A1A] bg-[#080808]">
        {/* Yellow accent top line */}
        {isFeatured && (
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFD100]/50 to-transparent" />
        )}
        {/* Ambient */}
        {isFeatured && (
          <div className="pointer-events-none absolute -top-20 right-1/4 h-48 w-48 rounded-full bg-[#FFD100]/5 blur-3xl" />
        )}

        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          {/* Breadcrumb */}
          <Link
            href="/produtos"
            className="group mb-8 inline-flex items-center gap-1.5 text-xs font-medium text-[#888] transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Todos os produtos
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-10">
            <div className="flex-1 min-w-0">
              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-5">
                {product.badge && (
                  <span className="inline-flex items-center rounded-lg border border-[#2A2A2A] bg-[#141414] px-2.5 py-1 text-xs font-semibold text-[#AAA]">
                    {product.badge}
                  </span>
                )}
                {adaptiveEnabled && (
                  <span className="xp-tag">
                    <Sparkles className="h-2.5 w-2.5" /> Recomendado pelo sistema
                  </span>
                )}
              </div>

              {/* Icon + name */}
              <div className="flex items-start gap-4 mb-6">
                <div
                  className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border"
                  style={{
                    background: isFeatured ? "rgba(255,209,0,0.08)" : "rgba(255,255,255,0.03)",
                    borderColor: isFeatured ? "rgba(255,209,0,0.2)" : "#242424",
                  }}
                >
                  <Icon className="h-7 w-7" style={{ color: accentColor }} />
                </div>
                <div>
                  <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl">{product.name}</h1>
                  <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#999]">{desc?.short}</p>
                </div>
              </div>

              {/* Rate */}
              <div className="flex items-baseline gap-4 mb-2">
                <span className="text-5xl font-black leading-none sm:text-7xl" style={{ color: accentColor }}>
                  {product.rate}
                </span>
              </div>
              <p className="text-sm font-medium text-[#888]">{product.term}</p>
            </div>

            {/* CTA card */}
            <div className="w-full sm:w-60 flex-shrink-0">
              <div className="rounded-2xl border border-[#282828] bg-[#0F0F0F]/90 p-6 shadow-[0_24px_70px_-45px_rgba(255,209,0,0.4)]">
                <p className="mb-4 text-xs font-bold uppercase tracking-wider text-[#999]">Contratação</p>

                <Link href={`/checkout?id=${arm}`}>
                  <button
                    className="mb-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
                    style={{
                      background: isFeatured ? ctaColor : "#1E1E1E",
                      color: isFeatured ? "#000" : "#fff",
                    }}
                  >
                    Contratar agora <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
                <p className="mb-5 text-center text-[10px] text-[#777]">
                  Processo 100% digital · LGPD-compliant
                </p>

                <div className="pt-4 border-t border-[#1A1A1A] space-y-2.5">
                  {[
                    { icon: Shield, text: "Garantia FGC" },
                    { icon: Clock, text: "Contratação em minutos" },
                    { icon: Zap, text: "Sem burocracia" },
                  ].map(({ icon: I, text }) => (
                    <div key={text} className="flex items-center gap-2 text-xs text-[#999]">
                      <I className="h-3.5 w-3.5 text-[#777]" />
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════ CONTENT ════════════════ */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-14 sm:px-6 lg:grid-cols-3">

        {/* Left: about + features + simulator */}
        <div className="lg:col-span-2 space-y-12">

          {/* About */}
          <div className="opacity-0 animate-fade-up" style={{ animationDelay: "0ms" }}>
            <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-3">Sobre o produto</p>
            <p className="text-sm leading-relaxed text-[#B5B5B5]">{desc?.long}</p>
          </div>

          {/* Features */}
          <div className="opacity-0 animate-fade-up" style={{ animationDelay: "80ms" }}>
            <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-4">Características</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {features.map((feat) => (
                <div key={feat} className="flex items-center gap-3 rounded-xl border border-[#242424] bg-[#0F0F0F] px-4 py-3.5 transition-colors hover:border-[#FFD100]/15">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: accentColor }} />
                  <span className="text-sm text-[#AAA] font-medium">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rate Simulator */}
          {product.cdi && (
            <div className="opacity-0 animate-fade-up" style={{ animationDelay: "160ms" }}>
              <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-4">Simulador de Rentabilidade</p>
              <div className="space-y-5 rounded-2xl border border-[#242424] bg-[#0F0F0F] p-5 sm:p-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="valor" className="text-xs font-semibold uppercase tracking-wider text-[#999]">
                      Valor inicial (R$)
                    </Label>
                    <Input
                      id="valor"
                      type="number"
                      min="0"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      className="rounded-xl border-[#2A2A2A] bg-[#141414] text-white focus:border-[#FFD100]/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meses" className="text-xs font-semibold uppercase tracking-wider text-[#999]">
                      Prazo (meses)
                    </Label>
                    <Input
                      id="meses"
                      type="number"
                      min="1"
                      max="360"
                      value={meses}
                      onChange={(e) => setMeses(e.target.value)}
                      className="rounded-xl border-[#2A2A2A] bg-[#141414] text-white focus:border-[#FFD100]/40"
                    />
                  </div>
                </div>

                {projection !== null && (
                  <div className="rounded-xl border border-[#FFD100]/10 bg-[#FFD100]/[0.03] p-5">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#999]">Projeção estimada</p>
                    <p className="text-4xl font-black text-[#FFD100]">
                      R${" "}{projection.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {gain !== null && gain > 0 && (
                      <p className="text-sm text-emerald-500 mt-1 font-semibold">
                        +R${" "}{gain.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}de rendimento
                      </p>
                    )}
                    <p className="mt-3 text-xs text-[#777]">
                      {product.name} · {product.rate} · CDI ref. 10,5% a.a. (fictício — demo)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: sticky summary */}
        <div className="opacity-0 animate-slide-in-right" style={{ animationDelay: "200ms" }}>
          <div className="sticky top-24 space-y-4">
            {/* Summary card */}
            <div className="rounded-2xl border border-[#282828] bg-[#0F0F0F] p-5">
              <p className="mb-4 text-xs font-bold uppercase tracking-wider text-[#888]">Resumo</p>
              <div className="space-y-3 mb-5">
                {[
                  { label: "Produto",        val: product.name,  highlight: false },
                  { label: "Rentabilidade",  val: product.rate,  highlight: true  },
                  { label: "Prazo",          val: product.term,  highlight: false },
                ].map(({ label, val, highlight }) => (
                  <div key={label} className="flex justify-between items-center text-sm border-b border-[#1A1A1A] pb-3 last:border-0 last:pb-0">
                    <span className="text-[#999]">{label}</span>
                    <span className={`font-bold ${highlight ? "text-[#FFD100] text-base" : "text-white"}`}>{val}</span>
                  </div>
                ))}
              </div>
              <Link href={`/checkout?id=${arm}`}>
                <button
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
                  style={{
                    background: isFeatured ? ctaColor : "#1E1E1E",
                    color: isFeatured ? "#000" : "#fff",
                  }}
                >
                  Contratar <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
            </div>

            {/* Other products */}
            <div className="rounded-2xl border border-[#242424] bg-[#0A0A0A] p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#777]">Outros produtos</p>
              <div className="space-y-0">
                {Object.entries(PRODUCT_CATALOG)
                  .filter(([key]) => key !== arm)
                  .slice(0, 4)
                  .map(([key, p]) => (
                    <Link
                      key={key}
                      href={`/produtos/${key}`}
                      className="group -mx-2 flex items-center justify-between rounded-lg border-b border-[#1A1A1A] px-2 py-2.5 transition-colors last:border-0 hover:bg-white/[0.03]"
                    >
                      <span className="text-xs font-medium text-[#888] transition-colors group-hover:text-white">{p.name}</span>
                      <span className="text-xs font-black" style={{ color: PRODUCT_UI[key]?.accent ?? "#666" }}>
                        {p.rate}
                      </span>
                    </Link>
                  ))}
              </div>
              <Link href="/produtos" className="mt-3 flex items-center gap-1.5 pt-2 text-xs font-semibold text-[#888] transition-colors hover:text-[#FFD100]">
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
