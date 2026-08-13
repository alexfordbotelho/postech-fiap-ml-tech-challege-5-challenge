"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight } from "lucide-react";
import { PRODUCT_CATALOG } from "@/lib/product-constants";
import type { ArmKey } from "@/lib/product-constants";
import { api } from "@/lib/api";

interface CheckoutFlowProps {
  arm: string;
  decisionId: string | null;
  simplified: boolean;
  onClose: () => void;
}

const STEP_LABELS: Record<number, string> = {
  1: "Dados",
  2: "Perfil",
  3: "Confirmação",
};

export function CheckoutFlow({
  arm,
  decisionId,
  simplified,
  onClose,
}: CheckoutFlowProps) {
  const product =
    PRODUCT_CATALOG[(arm as ArmKey)] ?? PRODUCT_CATALOG.savings_account;
  const steps = simplified ? [1, 3] : [1, 2, 3];

  const [step, setStep] = useState(steps[0]);
  const [nome, setNome] = useState("");
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const stepIndex = steps.indexOf(step);

  function nextStep() {
    if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1]);
  }

  async function handleConfirm() {
    setConfirming(true);
    if (decisionId) {
      await api.reward({ decision_id: decisionId, reward: 1.0 }).catch(() => {});
    }
    setDone(true);
    setConfirming(false);
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-10 gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
            <Check className="h-7 w-7 text-emerald-400" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">Contratado com sucesso!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {product.name} · {product.rate}
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Dados não persistidos — demonstração LGPD-compliant
            </p>
          </div>
          <Button onClick={onClose} variant="outline" className="mt-2">
            Voltar ao produto
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  s === step
                    ? "bg-indigo-600 text-white"
                    : s < step
                    ? "bg-emerald-600/30 text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {STEP_LABELS[s]}
              </span>
              {i < steps.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </span>
          ))}
          {simplified && (
            <Badge
              variant="outline"
              className="ml-auto border-amber-500/40 text-amber-400 text-xs"
            >
              Checkout simplificado
            </Badge>
          )}
        </div>
        <CardTitle className="text-base mt-3">{STEP_LABELS[step]}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                Nome (simulado — não persiste)
              </label>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Nome para demonstração"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Nenhum dado pessoal é armazenado nesta demonstração (LGPD-compliant).
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <p className="text-sm mb-2">
                Você possui financiamento imobiliário ativo?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Sim
                </Button>
                <Button variant="outline" size="sm">
                  Não
                </Button>
              </div>
            </div>
            <div>
              <p className="text-sm mb-2">Você possui outros empréstimos ativos?</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Sim
                </Button>
                <Button variant="outline" size="sm">
                  Não
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-lg bg-muted/50 p-4 space-y-2 border border-border">
            <p className="text-xs text-muted-foreground font-medium">RESUMO</p>
            <p className="text-base font-semibold">{product.name}</p>
            <p className="text-3xl font-bold text-indigo-400">{product.rate}</p>
            <p className="text-xs text-muted-foreground">{product.term}</p>
          </div>
        )}

        <div className="flex justify-between pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          {stepIndex < steps.length - 1 ? (
            <Button size="sm" onClick={nextStep}>
              Próximo →
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500"
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming ? "Confirmando…" : "Confirmar contratação"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
