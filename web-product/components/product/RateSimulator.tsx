"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCT_CATALOG } from "@/lib/product-constants";
import type { ArmKey } from "@/lib/product-constants";

const CDI_AA = 0.105;

export function RateSimulator({ arm }: { arm: string }) {
  const [valor, setValor] = useState("1000");
  const [meses, setMeses] = useState("12");

  const product = PRODUCT_CATALOG[(arm as ArmKey)] ?? PRODUCT_CATALOG.savings_account;

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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Simulador de Rentabilidade</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="valor">Valor inicial (R$)</Label>
          <Input
            id="valor"
            type="number"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meses">Prazo (meses)</Label>
          <Input
            id="meses"
            type="number"
            min="1"
            max="360"
            value={meses}
            onChange={(e) => setMeses(e.target.value)}
          />
        </div>
        <div className="flex flex-col justify-end space-y-1">
          <p className="text-xs text-muted-foreground">Projeção estimada</p>
          {projection !== null ? (
            <>
              <p className="text-2xl font-bold text-emerald-400">
                R${" "}
                {projection.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              {gain !== null && gain > 0 && (
                <p className="text-xs text-emerald-600">
                  +R${" "}
                  {gain.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  de rendimento
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Não aplicável para este produto
            </p>
          )}
          <p className="text-xs text-muted-foreground pt-1">
            {product.name} · {product.rate} · CDI ref. 10,5% a.a.{" "}
            <span className="text-slate-600">(fictício — demo)</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
