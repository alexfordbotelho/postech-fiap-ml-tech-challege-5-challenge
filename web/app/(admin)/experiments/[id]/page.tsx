"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import type { ArmResult } from "@/lib/types";
import { ARM_LABELS, POLICY_LABELS } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, TrendingUp, Clock, CheckCircle2, AlertCircle,
  Shuffle, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useMounted } from "@/hooks/useMounted";

function armColor(is_best: boolean, idx: number) {
  if (is_best) return "#22c55e";
  const palette = ["#6366f1", "#f59e0b", "#ec4899", "#06b6d4", "#a78bfa"];
  return palette[idx % palette.length];
}

function armLabel(id: string) {
  return ARM_LABELS[id] ?? id;
}

function RecommendationBanner({ text }: { text: string }) {
  const isWinner  = text.startsWith("WINNER");
  const isForte   = text.startsWith("Forte");
  const isWaiting = text.startsWith("Coletando") || text.startsWith("Sem dados");

  if (isWinner) return (
    <div className="rounded-lg border border-green-300 bg-green-50 p-4 flex items-start gap-3">
      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-green-800">{text}</p>
        <p className="text-xs text-green-700 mt-0.5">Evidência Bayesiana suficiente — pode encerrar o experimento.</p>
      </div>
    </div>
  );

  if (isForte) return (
    <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 flex items-start gap-3">
      <TrendingUp className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-yellow-800">{text}</p>
        <p className="text-xs text-yellow-700 mt-0.5">Continue coletando dados para confirmação.</p>
      </div>
    </div>
  );

  if (isWaiting) return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
      <Clock className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-blue-800">{text}</p>
        <p className="text-xs text-blue-700 mt-0.5">A política bandit está explorando e aprendendo.</p>
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
      <p className="text-sm text-slate-700">{text}</p>
    </div>
  );
}

function ArmCard({ arm, idx }: { arm: ArmResult; idx: number }) {
  const pct = arm.prob_best !== null ? Math.round((arm.prob_best ?? 0) * 100) : null;
  const color = armColor(arm.is_best, idx);
  const probColor = pct === null ? "text-slate-400" : pct >= 95 ? "text-green-600" : pct >= 70 ? "text-yellow-600" : "text-slate-500";

  return (
    <Card className={`relative ${arm.is_best ? "border-green-300 shadow-sm shadow-green-100" : ""}`}>
      {arm.is_best && (
        <div className="absolute -top-2.5 left-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-600 text-white rounded-full">
            Melhor Braço
          </span>
        </div>
      )}
      <CardContent className="p-4 pt-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <div className="min-w-0">
            <div className="text-[10px] text-muted-foreground font-mono">{arm.arm_id}</div>
            <div className="font-semibold text-sm leading-tight">{armLabel(arm.arm_id)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <div className="text-xl font-bold tabular-nums">{(arm.avg_reward * 100).toFixed(2)}%</div>
            <div className="text-[10px] text-muted-foreground">Avg Reward</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <div className="text-xl font-bold tabular-nums">{arm.n.toLocaleString("pt-BR")}</div>
            <div className="text-[10px] text-muted-foreground">Decisões</div>
          </div>
        </div>

        {pct !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={`text-base font-bold tabular-nums ${probColor}`}>{pct}%</span>
              <span className="text-[10px] text-muted-foreground">prob. de ser o melhor</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded bg-muted/30 p-1.5">
            <div className="text-xs font-semibold tabular-nums">
              {arm.expected_lift !== null ? `${(arm.expected_lift * 100).toFixed(2)}%` : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground">Lift</div>
          </div>
          <div className="rounded bg-muted/30 p-1.5">
            <div className="text-xs font-semibold tabular-nums">
              {arm.ci_95
                ? `[${(arm.ci_95[0] * 100).toFixed(1)}, ${(arm.ci_95[1] * 100).toFixed(1)}]`
                : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground">IC 95%</div>
          </div>
          <div className="rounded bg-muted/30 p-1.5">
            <div className="text-xs font-semibold tabular-nums flex items-center justify-center gap-0.5">
              <Shuffle className="h-2.5 w-2.5 text-muted-foreground" />
              {(arm.exploration_rate * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-muted-foreground">Exploração</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function useLastUpdated(isValidating: boolean) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isValidating) setLastUpdated(new Date());
  }, [isValidating]);

  useEffect(() => {
    const id = setInterval(() => {
      if (lastUpdated) setElapsed(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  return { lastUpdated, elapsed };
}

export default function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const mounted = useMounted();
  const { id } = use(params);

  const { data: exp, isLoading, isValidating, mutate } = useSWR(
    `exp-${id}`,
    () => api.experimentResults(id),
    {
      refreshInterval: (data) => data?.status === "running" ? 10_000 : 60_000,
      keepPreviousData: true,
      revalidateOnMount: true,
    }
  );

  const { elapsed } = useLastUpdated(isValidating);

  if (isLoading && !exp) {
    return (
      <div className="max-w-5xl space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!exp) return <div className="text-sm text-muted-foreground">Experimento não encontrado.</div>;

  const minN = exp.min_sample_per_arm;

  const chartData = exp.arms.map((arm, i) => ({
    name: armLabel(arm.arm_id),
    reward: +(arm.avg_reward * 100).toFixed(3),
    n: arm.n,
    is_best: arm.is_best,
    color: armColor(arm.is_best, i),
  }));

  const trafficData = exp.arms.map((arm, i) => ({
    name: armLabel(arm.arm_id),
    share: exp.total_decisions > 0 ? +((arm.n / exp.total_decisions) * 100).toFixed(1) : 0,
    is_best: arm.is_best,
    color: armColor(arm.is_best, i),
  }));

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/experiments">
            <Button size="icon" variant="ghost" className="h-8 w-8 mt-0.5 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Experiment detail</p>
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">{exp.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className={`font-medium ${
                exp.status === "running" ? "text-green-600" :
                exp.status === "draft"   ? "text-yellow-600" : "text-slate-500"
              }`}>
                {exp.status === "running" ? "● Executando" : exp.status === "draft" ? "● Rascunho" : "● Encerrado"}
              </span>
              <span className="font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                {POLICY_LABELS[exp.experiment_policy] ?? exp.experiment_policy}
              </span>
              {exp.days_running !== null && <span>{exp.days_running}d em execução</span>}
              <span>{exp.total_decisions.toLocaleString("pt-BR")} decisões</span>
            </div>
          </div>
        </div>

        {/* Refresh indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {isValidating && (
            <span className="text-[10px] text-muted-foreground animate-pulse">atualizando…</span>
          )}
          {!isValidating && elapsed > 0 && (
            <span className="text-[10px] text-muted-foreground">
              atualizado há {elapsed}s
            </span>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Atualizar agora"
            onClick={() => mutate()}
            disabled={isValidating}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isValidating ? "animate-spin text-primary" : "text-muted-foreground"}`} />
          </Button>
        </div>
      </div>

      {/* Auto-refresh badge for running experiments */}
      {exp.status === "running" && (
        <div className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 w-fit">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          Atualização automática a cada 10s
        </div>
      )}

      {/* Recommendation */}
      <RecommendationBanner text={exp.recommendation} />

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Avg Reward por Braço
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {mounted ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={["auto", "auto"]} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Avg Reward"]} />
                  <Bar dataKey="reward" radius={[4, 4, 0, 0]} maxBarSize={60} isAnimationActive={false}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[160px] animate-pulse rounded bg-muted" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tráfego Alocado (convergência bandit)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {mounted ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={trafficData} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "% tráfego"]} />
                  <Bar dataKey="share" radius={[4, 4, 0, 0]} maxBarSize={60} isAnimationActive={false}>
                    {trafficData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[160px] animate-pulse rounded bg-muted" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Arm cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {exp.arms.map((arm, i) => <ArmCard key={arm.arm_id} arm={arm} idx={i} />)}
      </div>

      {/* Sample progress */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Progresso de Amostra</span>
            <span className={`text-xs font-normal ${exp.sample_reached ? "text-green-600" : "text-muted-foreground"}`}>
              {exp.sample_reached ? "✓ Amostra suficiente" : `mín. ${minN.toLocaleString("pt-BR")}/braço`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {exp.arms.map((arm, i) => {
            const pct = Math.min(100, (arm.n / minN) * 100);
            const color = armColor(arm.is_best, i);
            return (
              <div key={arm.arm_id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{armLabel(arm.arm_id)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {arm.n.toLocaleString("pt-BR")} / {minN.toLocaleString("pt-BR")} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? "#22c55e" : color }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
