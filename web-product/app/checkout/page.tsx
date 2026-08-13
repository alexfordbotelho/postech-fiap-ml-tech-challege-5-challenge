"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  TrendingUp,
  PiggyBank,
  Award,
  CreditCard,
  BarChart3,
  Shield,
  Lock,
  Sparkles,
  User,
  FileText,
  CheckCircle,
} from "lucide-react";
import { PRODUCT_CATALOG } from "@/lib/product-constants";
import type { ArmKey } from "@/lib/product-constants";
import { api } from "@/lib/api";

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

const STEPS = [
  { id: 1, label: "Dados",       icon: User        },
  { id: 2, label: "Perfil",      icon: FileText    },
  { id: 3, label: "Confirmação", icon: CheckCircle },
];

function CheckoutInner() {
  const searchParams = useSearchParams();
  const productId = searchParams.get("id") ?? "savings_account";

  const arm = (productId as ArmKey) in PRODUCT_CATALOG
    ? (productId as ArmKey)
    : ("savings_account" as ArmKey);
  const product = PRODUCT_CATALOG[arm];
  const ui = PRODUCT_UI[arm] ?? PRODUCT_UI.savings_account;
  const Icon = ui.icon;
  const isFeatured = ui.featured;
  const accentColor = ui.accent;

  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  /* Step 1 */
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");

  /* Step 2 */
  const [hasLoan, setHasLoan] = useState<boolean | null>(null);
  const [hasMortgage, setHasMortgage] = useState<boolean | null>(null);
  const [objetivo, setObjetivo] = useState<string | null>(null);

  async function handleConfirm() {
    setConfirming(true);
    await api.reward({ decision_id: "demo", reward: 1.0 }).catch(() => {});
    setTimeout(() => { setDone(true); setConfirming(false); }, 1000);
  }

  /* ── SUCCESS ── */
  if (done) {
    return (
      <div className="flex min-h-[calc(100svh-128px)] items-center justify-center px-4 py-14 sm:px-6">
        <div className="w-full max-w-md text-center">
          {/* Animated check */}
          <div className="relative flex items-center justify-center mb-8">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-[#FFD100]/20 bg-[#FFD100]/[0.08] shadow-[0_20px_60px_-30px_rgba(255,209,0,0.8)]">
              <Check className="h-10 w-10 text-[#FFD100]" strokeWidth={3} />
            </div>
            {/* Top line */}
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-24 h-px bg-[#FFD100]/40" />
          </div>

          <span className="xp-tag mb-4 inline-flex">
            <Sparkles className="h-3 w-3" /> Contratado com sucesso!
          </span>

          <h1 className="text-4xl font-black text-white mt-4 mb-3">Parabéns!</h1>
          <p className="mb-2 text-sm text-[#999]">
            Seu <span className="font-bold text-white">{product.name}</span> foi contratado.
          </p>
          <p className="text-5xl font-black mb-8" style={{ color: accentColor }}>
            {product.rate}
          </p>

          <div className="mb-8 space-y-3 rounded-2xl border border-[#242424] bg-[#0F0F0F] p-5 text-left">
            {[
              { label: "Produto",       val: product.name,    highlight: false },
              { label: "Rentabilidade", val: product.rate,    highlight: true  },
              { label: "Prazo",         val: product.term,    highlight: false },
            ].map(({ label, val, highlight }) => (
              <div key={label} className="flex justify-between text-sm border-b border-[#1A1A1A] pb-2 last:border-0 last:pb-0">
                <span className="text-[#999]">{label}</span>
                <span className={`font-bold ${highlight ? "text-[#FFD100]" : "text-white"}`}>{val}</span>
              </div>
            ))}
            <p className="pt-2 text-center text-[10px] text-[#666]">
              Dados não persistidos · Demonstração LGPD-compliant
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/produtos" className="flex-1">
              <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#2A2A2A] text-sm font-semibold text-[#AAA] transition-all hover:border-[#FFD100]/20 hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Ver produtos
              </button>
            </Link>
            <Link href="/" className="flex-1">
              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
                style={{ background: isFeatured ? "#FFD100" : "#1E1E1E", color: isFeatured ? "#000" : "#fff" }}
              >
                Início <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── FORM ── */
  return (
    <div className="min-h-[calc(100svh-128px)] px-4 py-10 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">

        {/* Back */}
        <Link
          href={`/produtos/${arm}`}
          className="group mb-8 inline-flex items-center gap-1.5 text-xs font-medium text-[#888] transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Voltar ao produto
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── FORM COLUMN ── */}
          <div className="lg:col-span-2 space-y-8">

            {/* Step indicator */}
            <div className="flex items-center">
              {STEPS.map((s, i) => {
                const StepIcon = s.icon;
                const isActive = s.id === step;
                const isCompleted = s.id < step;
                return (
                  <div key={s.id} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl border transition-all"
                        style={{
                          background: isCompleted ? "#FFD100" : isActive ? "#1A1A1A" : "#0D0D0D",
                          borderColor: isCompleted ? "#FFD100" : isActive ? "#FFD100" : "#1E1E1E",
                        }}
                      >
                        {isCompleted
                          ? <Check className="h-4 w-4 text-black" strokeWidth={3} />
                          : <StepIcon className="h-4 w-4" style={{ color: isActive ? "#FFD100" : "#777" }} />
                        }
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isActive ? "#FFD100" : isCompleted ? "#999" : "#666" }}>
                        {s.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 h-px mx-3 mb-5" style={{ background: s.id < step ? "#FFD100" : "#1A1A1A" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Step content */}
            <div className="overflow-hidden rounded-2xl border border-[#242424] bg-[#0D0D0D] shadow-[0_24px_70px_-48px_rgba(0,0,0,0.9)]">
              {/* Top accent line on active step */}
              <div className="h-px bg-gradient-to-r from-transparent via-[#FFD100]/30 to-transparent" />

              <div className="p-5 sm:p-8">

                {/* ── STEP 1 ── */}
                {step === 1 && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-1">Etapa 1</p>
                      <h2 className="text-xl font-black text-white">Seus dados</h2>
                      <p className="mt-1 text-sm text-[#999]">Nenhum dado é armazenado — demonstração.</p>
                    </div>

                    <div className="space-y-4">
                      {[
                        {
                          label: "Nome completo",
                          placeholder: "Digite seu nome",
                          value: nome,
                          onChange: (v: string) => setNome(v),
                          type: "text",
                        },
                        {
                          label: "E-mail (simulado)",
                          placeholder: "seu@email.com",
                          value: email,
                          onChange: (v: string) => setEmail(v),
                          type: "email",
                        },
                      ].map((field) => (
                        <div key={field.label} className="space-y-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-[#999]">
                            {field.label}
                          </label>
                          <input
                            type={field.type}
                            className="h-11 w-full rounded-xl border border-[#2A2A2A] bg-[#141414] px-4 text-sm text-white transition-colors placeholder:text-[#666] focus:border-[#FFD100]/40 focus:outline-none"
                            placeholder={field.placeholder}
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </div>
                      ))}

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-[#999]">CPF (simulado)</label>
                        <input
                          className="h-11 w-full rounded-xl border border-[#2A2A2A] bg-[#141414] px-4 text-sm text-white transition-colors placeholder:text-[#666] focus:border-[#FFD100]/40 focus:outline-none"
                          placeholder="000.000.000-00"
                          value={cpf}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                            const formatted = digits
                              .replace(/(\d{3})(\d)/, "$1.$2")
                              .replace(/(\d{3})(\d)/, "$1.$2")
                              .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
                            setCpf(formatted);
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-xl border border-[#222] bg-[#0A0A0A] px-4 py-3">
                      <Lock className="h-3.5 w-3.5 text-[#777]" />
                      <p className="text-xs text-[#777]">
                        Nenhum dado pessoal é armazenado nesta demonstração (LGPD-compliant).
                      </p>
                    </div>
                  </div>
                )}

                {/* ── STEP 2 ── */}
                {step === 2 && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-1">Etapa 2</p>
                      <h2 className="text-xl font-black text-white">Perfil financeiro</h2>
                      <p className="mt-1 text-sm text-[#999]">Informações para personalizar sua contratação.</p>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-[#AAA]">Você possui financiamento imobiliário ativo?</p>
                        <div className="flex gap-3">
                          {[{ val: true, label: "Sim" }, { val: false, label: "Não" }].map(({ val, label }) => (
                            <button
                              key={label}
                              onClick={() => setHasMortgage(val)}
                              className="h-11 flex-1 rounded-xl border text-sm font-semibold transition-all"
                              style={{
                                background: hasMortgage === val ? "rgba(255,209,0,0.08)" : "#0D0D0D",
                                borderColor: hasMortgage === val ? "#FFD100" : "#242424",
                                color: hasMortgage === val ? "#FFD100" : "#555",
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-[#AAA]">Você possui outros empréstimos ativos?</p>
                        <div className="flex gap-3">
                          {[{ val: true, label: "Sim" }, { val: false, label: "Não" }].map(({ val, label }) => (
                            <button
                              key={label}
                              onClick={() => setHasLoan(val)}
                              className="h-11 flex-1 rounded-xl border text-sm font-semibold transition-all"
                              style={{
                                background: hasLoan === val ? "rgba(255,209,0,0.08)" : "#0D0D0D",
                                borderColor: hasLoan === val ? "#FFD100" : "#242424",
                                color: hasLoan === val ? "#FFD100" : "#555",
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-[#AAA]">Qual seu objetivo de investimento?</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {["Reserva de emergência", "Aposentadoria", "Viagem / Lazer", "Compra planejada"].map((opt) => (
                            <button
                              key={opt}
                              onClick={() => setObjetivo(opt)}
                              className="h-11 rounded-xl border px-3 text-left text-xs font-semibold transition-all"
                              style={{
                                background: objetivo === opt ? "rgba(255,209,0,0.08)" : "#0D0D0D",
                                borderColor: objetivo === opt ? "#FFD100" : "#242424",
                                color: objetivo === opt ? "#FFD100" : "#555",
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── STEP 3 ── */}
                {step === 3 && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-1">Etapa 3</p>
                      <h2 className="text-xl font-black text-white">Confirmar contratação</h2>
                      <p className="mt-1 text-sm text-[#999]">Revise os detalhes antes de finalizar.</p>
                    </div>

                    {/* Product summary */}
                    <div className="overflow-hidden rounded-2xl border border-[#FFD100]/15 bg-[#0A0A0A]">
                      <div className="p-5 border-b border-[#1A1A1A] flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-xl border"
                          style={{
                            background: isFeatured ? "rgba(255,209,0,0.08)" : "#141414",
                            borderColor: isFeatured ? "rgba(255,209,0,0.2)" : "#242424",
                          }}
                        >
                          <Icon className="h-5 w-5" style={{ color: accentColor }} />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-white text-sm">{product.name}</p>
                          <p className="text-xs text-[#888]">{product.term}</p>
                        </div>
                        <p className="text-2xl font-black" style={{ color: accentColor }}>{product.rate}</p>
                      </div>
                      <div className="px-5 py-4 space-y-2.5">
                        {nome && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[#999]">Nome</span>
                            <span className="text-white font-medium">{nome}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-[#999]">Tipo</span>
                          <span className="text-white font-medium">
                            {arm?.includes("loan") ? "Empréstimo Pessoal" : "Renda Fixa"}
                          </span>
                        </div>
                        {objetivo && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[#999]">Objetivo</span>
                            <span className="text-white font-medium">{objetivo}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl border border-[#222] bg-[#0A0A0A] px-4 py-3">
                      <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#777]" />
                      <p className="text-xs leading-relaxed text-[#777]">
                        Ao confirmar, você concorda com os Termos de Uso e a Política de Privacidade.
                        Esta é uma demonstração — nenhuma transação real é processada.
                      </p>
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between pt-7 mt-7 border-t border-[#1A1A1A]">
                  <button
                    onClick={() => setStep((s) => s - 1)}
                    className={`inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#2A2A2A] px-5 text-sm font-semibold text-[#999] transition-all hover:border-[#FFD100]/20 hover:text-white ${step === 1 ? "invisible" : ""}`}
                  >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </button>

                  {step < 3 ? (
                    <button
                      onClick={() => setStep((s) => s + 1)}
                      disabled={
                        (step === 1 && nome.trim().length === 0) ||
                        (step === 2 && (hasLoan === null || hasMortgage === null))
                      }
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#FFD100] px-7 text-sm font-bold text-black transition-all hover:bg-[#E6BC00] disabled:cursor-not-allowed disabled:bg-[#1A1A1A] disabled:text-[#666]"
                    >
                      Continuar <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirm}
                      disabled={confirming}
                      className="inline-flex h-10 items-center gap-2 rounded-xl px-7 text-sm font-bold transition-all"
                      style={{
                        background: isFeatured ? "#FFD100" : "#1E1E1E",
                        color: isFeatured ? "#000" : "#fff",
                        opacity: confirming ? 0.7 : 1,
                      }}
                    >
                      {confirming ? (
                        <>
                          <div className="h-4 w-4 rounded-full border-2 border-black/20 border-t-black animate-spin" />
                          Confirmando…
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" /> Confirmar contratação
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── SUMMARY COLUMN ── */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#282828] bg-[#0F0F0F] p-6 lg:sticky lg:top-24">
              <p className="mb-4 text-xs font-bold uppercase tracking-wider text-[#888]">Você está contratando</p>

              <div className="flex items-center gap-3 mb-5 pb-5 border-b border-[#1A1A1A]">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border"
                  style={{
                    background: isFeatured ? "rgba(255,209,0,0.08)" : "#141414",
                    borderColor: isFeatured ? "rgba(255,209,0,0.15)" : "#242424",
                  }}
                >
                  <Icon className="h-5 w-5" style={{ color: accentColor }} />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{product.name}</p>
                  <p className="text-xs text-[#888]">{product.term}</p>
                </div>
              </div>

              <div className="mb-5 pb-5 border-b border-[#1A1A1A]">
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-[#888]">Rentabilidade</p>
                <p className="text-4xl font-black" style={{ color: accentColor }}>{product.rate}</p>
              </div>

              <div className="space-y-2.5">
                {[
                  { icon: Shield,   text: "Garantia FGC" },
                  { icon: Lock,     text: "Dados protegidos (LGPD)" },
                  { icon: Sparkles, text: "Contratação 100% digital" },
                ].map(({ icon: I, text }) => (
                  <div key={text} className="flex items-center gap-2 text-xs text-[#777]">
                    <I className="h-3.5 w-3.5 text-[#666]" />
                    {text}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#1E1E1E] bg-[#080808] p-4">
              <p className="text-center text-[10px] leading-relaxed text-[#666]">
                Demonstração fictícia · Não constitui oferta real · Dados não persistidos
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-120px)] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-xl border-2 border-[#FFD100]/20 border-t-[#FFD100]" />
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
