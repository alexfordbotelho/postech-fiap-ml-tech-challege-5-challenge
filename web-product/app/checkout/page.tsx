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
      <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          {/* Animated check */}
          <div className="relative flex items-center justify-center mb-8">
            <div className="h-24 w-24 rounded-sm bg-[#FFD100]/8 border border-[#FFD100]/20 flex items-center justify-center">
              <Check className="h-10 w-10 text-[#FFD100]" strokeWidth={3} />
            </div>
            {/* Top line */}
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-24 h-px bg-[#FFD100]/40" />
          </div>

          <span className="xp-tag mb-4 inline-flex">
            <Sparkles className="h-3 w-3" /> Contratado com sucesso!
          </span>

          <h1 className="text-4xl font-black text-white mt-4 mb-3">Parabéns!</h1>
          <p className="text-[#555] text-sm mb-2">
            Seu <span className="font-bold text-white">{product.name}</span> foi contratado.
          </p>
          <p className="text-5xl font-black mb-8" style={{ color: accentColor }}>
            {product.rate}
          </p>

          <div className="border border-[#1E1E1E] bg-[#0F0F0F] rounded-sm p-5 mb-8 text-left space-y-3">
            {[
              { label: "Produto",       val: product.name,    highlight: false },
              { label: "Rentabilidade", val: product.rate,    highlight: true  },
              { label: "Prazo",         val: product.term,    highlight: false },
            ].map(({ label, val, highlight }) => (
              <div key={label} className="flex justify-between text-sm border-b border-[#1A1A1A] pb-2 last:border-0 last:pb-0">
                <span className="text-[#444]">{label}</span>
                <span className={`font-bold ${highlight ? "text-[#FFD100]" : "text-white"}`}>{val}</span>
              </div>
            ))}
            <p className="text-[10px] text-[#2A2A2A] text-center pt-2">
              Dados não persistidos · Demonstração LGPD-compliant
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/produtos" className="flex-1">
              <button className="w-full h-11 border border-[#242424] text-[#666] text-sm font-semibold rounded-sm hover:border-[#FFD100]/20 hover:text-white transition-all inline-flex items-center justify-center gap-2">
                <ArrowLeft className="h-4 w-4" /> Ver produtos
              </button>
            </Link>
            <Link href="/" className="flex-1">
              <button
                className="w-full h-11 text-sm font-bold rounded-sm transition-all inline-flex items-center justify-center gap-2"
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
    <div className="min-h-[calc(100vh-120px)] px-6 py-12">
      <div className="max-w-4xl mx-auto">

        {/* Back */}
        <Link
          href={`/produtos/${arm}`}
          className="inline-flex items-center gap-1.5 text-xs text-[#444] hover:text-white transition-colors mb-8 group font-medium"
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
                        className="h-9 w-9 rounded-sm flex items-center justify-center transition-all border"
                        style={{
                          background: isCompleted ? "#FFD100" : isActive ? "#1A1A1A" : "#0D0D0D",
                          borderColor: isCompleted ? "#FFD100" : isActive ? "#FFD100" : "#1E1E1E",
                        }}
                      >
                        {isCompleted
                          ? <Check className="h-4 w-4 text-black" strokeWidth={3} />
                          : <StepIcon className="h-4 w-4" style={{ color: isActive ? "#FFD100" : "#333" }} />
                        }
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isActive ? "#FFD100" : isCompleted ? "#555" : "#2A2A2A" }}>
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
            <div className="border border-[#1E1E1E] bg-[#0D0D0D] rounded-sm">
              {/* Top accent line on active step */}
              <div className="h-px bg-gradient-to-r from-transparent via-[#FFD100]/30 to-transparent" />

              <div className="p-8">

                {/* ── STEP 1 ── */}
                {step === 1 && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-bold text-[#FFD100] tracking-widest uppercase mb-1">Etapa 1</p>
                      <h2 className="text-xl font-black text-white">Seus dados</h2>
                      <p className="text-sm text-[#444] mt-1">Nenhum dado é armazenado — demonstração.</p>
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
                          <label className="text-xs text-[#555] font-bold uppercase tracking-wider">
                            {field.label}
                          </label>
                          <input
                            type={field.type}
                            className="w-full h-11 rounded-sm border border-[#242424] bg-[#141414] px-4 text-sm text-white focus:outline-none focus:border-[#FFD100]/40 transition-colors placeholder:text-[#2A2A2A]"
                            placeholder={field.placeholder}
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </div>
                      ))}

                      <div className="space-y-1.5">
                        <label className="text-xs text-[#555] font-bold uppercase tracking-wider">CPF (simulado)</label>
                        <input
                          className="w-full h-11 rounded-sm border border-[#242424] bg-[#141414] px-4 text-sm text-white focus:outline-none focus:border-[#FFD100]/40 transition-colors placeholder:text-[#2A2A2A]"
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

                    <div className="flex items-center gap-2.5 border border-[#1A1A1A] bg-[#0A0A0A] rounded-sm px-4 py-3">
                      <Lock className="h-3.5 w-3.5 text-[#333]" />
                      <p className="text-xs text-[#333]">
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
                      <p className="text-sm text-[#444] mt-1">Informações para personalizar sua contratação.</p>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-[#AAA]">Você possui financiamento imobiliário ativo?</p>
                        <div className="flex gap-3">
                          {[{ val: true, label: "Sim" }, { val: false, label: "Não" }].map(({ val, label }) => (
                            <button
                              key={label}
                              onClick={() => setHasMortgage(val)}
                              className="flex-1 h-11 text-sm font-semibold rounded-sm border transition-all"
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
                              className="flex-1 h-11 text-sm font-semibold rounded-sm border transition-all"
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
                        <div className="grid grid-cols-2 gap-2">
                          {["Reserva de emergência", "Aposentadoria", "Viagem / Lazer", "Compra planejada"].map((opt) => (
                            <button
                              key={opt}
                              onClick={() => setObjetivo(opt)}
                              className="h-11 px-3 text-xs font-semibold rounded-sm border transition-all text-left"
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
                      <p className="text-sm text-[#444] mt-1">Revise os detalhes antes de finalizar.</p>
                    </div>

                    {/* Product summary */}
                    <div className="border border-[#FFD100]/15 bg-[#0A0A0A] rounded-sm overflow-hidden">
                      <div className="p-5 border-b border-[#1A1A1A] flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-sm flex items-center justify-center border"
                          style={{
                            background: isFeatured ? "rgba(255,209,0,0.08)" : "#141414",
                            borderColor: isFeatured ? "rgba(255,209,0,0.2)" : "#242424",
                          }}
                        >
                          <Icon className="h-5 w-5" style={{ color: accentColor }} />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-white text-sm">{product.name}</p>
                          <p className="text-xs text-[#444]">{product.term}</p>
                        </div>
                        <p className="text-2xl font-black" style={{ color: accentColor }}>{product.rate}</p>
                      </div>
                      <div className="px-5 py-4 space-y-2.5">
                        {nome && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[#444]">Nome</span>
                            <span className="text-white font-medium">{nome}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-[#444]">Tipo</span>
                          <span className="text-white font-medium">
                            {arm?.includes("loan") ? "Empréstimo Pessoal" : "Renda Fixa"}
                          </span>
                        </div>
                        {objetivo && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[#444]">Objetivo</span>
                            <span className="text-white font-medium">{objetivo}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3 border border-[#1A1A1A] bg-[#0A0A0A] rounded-sm px-4 py-3">
                      <Shield className="h-4 w-4 text-[#333] flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-[#333] leading-relaxed">
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
                    className={`h-10 px-5 border border-[#242424] text-[#555] text-sm font-semibold rounded-sm hover:border-[#FFD100]/20 hover:text-white transition-all inline-flex items-center gap-1.5 ${step === 1 ? "invisible" : ""}`}
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
                      className="h-10 px-7 bg-[#FFD100] hover:bg-[#E6BC00] disabled:bg-[#1A1A1A] disabled:text-[#333] disabled:cursor-not-allowed text-black text-sm font-bold rounded-sm transition-all inline-flex items-center gap-1.5"
                    >
                      Continuar <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirm}
                      disabled={confirming}
                      className="h-10 px-7 text-sm font-bold rounded-sm transition-all inline-flex items-center gap-2"
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
            <div className="border border-[#242424] bg-[#0F0F0F] rounded-sm p-6">
              <p className="text-xs font-bold text-[#444] uppercase tracking-wider mb-4">Você está contratando</p>

              <div className="flex items-center gap-3 mb-5 pb-5 border-b border-[#1A1A1A]">
                <div
                  className="h-10 w-10 rounded-sm flex items-center justify-center border flex-shrink-0"
                  style={{
                    background: isFeatured ? "rgba(255,209,0,0.08)" : "#141414",
                    borderColor: isFeatured ? "rgba(255,209,0,0.15)" : "#242424",
                  }}
                >
                  <Icon className="h-5 w-5" style={{ color: accentColor }} />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{product.name}</p>
                  <p className="text-xs text-[#444]">{product.term}</p>
                </div>
              </div>

              <div className="mb-5 pb-5 border-b border-[#1A1A1A]">
                <p className="text-xs text-[#444] font-semibold mb-0.5 uppercase tracking-wider">Rentabilidade</p>
                <p className="text-4xl font-black" style={{ color: accentColor }}>{product.rate}</p>
              </div>

              <div className="space-y-2.5">
                {[
                  { icon: Shield,   text: "Garantia FGC" },
                  { icon: Lock,     text: "Dados protegidos (LGPD)" },
                  { icon: Sparkles, text: "Contratação 100% digital" },
                ].map(({ icon: I, text }) => (
                  <div key={text} className="flex items-center gap-2 text-xs text-[#333]">
                    <I className="h-3.5 w-3.5 text-[#2A2A2A]" />
                    {text}
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[#141414] bg-[#080808] rounded-sm p-4">
              <p className="text-[10px] text-[#2A2A2A] text-center leading-relaxed">
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
          <div className="h-8 w-8 rounded-sm border-2 border-[#FFD100]/20 border-t-[#FFD100] animate-spin" />
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
