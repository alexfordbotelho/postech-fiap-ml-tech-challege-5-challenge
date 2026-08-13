"use client";

import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { api } from "@/lib/api";
import type {
  ExperimentItem,
  ArmResult,
  HeatmapRow,
  ChannelMetricsItem,
  MetricsResponse,
  FairnessResponse,
} from "@/lib/types";
import { ARM_LABELS, SEGMENT_LABELS, ARMS, SEGMENTS } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Grid3X3,
  Lightbulb,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Users,
  Wifi,
} from "lucide-react";

// ─── constants ────────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  web: "Web",
  mobile: "Mobile",
  email: "E-mail",
  call_center: "Call Center",
};

// ─── colour helpers ───────────────────────────────────────────────────────────

function heatColor(val: number, max: number): { bg: string; fg: string } {
  if (max <= 0 || val <= 0) return { bg: "#f8fafc", fg: "#94a3b8" };
  const t = Math.min(val / max, 1);
  const light = Math.round(97 - t * 62);
  const sat   = Math.round(30  + t * 55);
  return {
    bg: `hsl(152 ${sat}% ${light}%)`,
    fg: t > 0.55 ? "#fff" : "#0f172a",
  };
}

// ─── data derivation helpers ──────────────────────────────────────────────────

interface RankItem { key: string; name: string; avg: number }

function aggChannels(items: ChannelMetricsItem[]): RankItem[] {
  const map: Record<string, { sum: number; w: number }> = {};
  for (const it of items) {
    if (!map[it.channel]) map[it.channel] = { sum: 0, w: 0 };
    map[it.channel].sum += it.avg_reward * it.total_decisions;
    map[it.channel].w   += it.total_decisions;
  }
  return Object.entries(map)
    .map(([key, { sum, w }]) => ({
      key,
      name: CHANNEL_LABELS[key] ?? key,
      avg: w > 0 ? sum / w : 0,
    }))
    .sort((a, b) => b.avg - a.avg);
}

function aggSegments(heatmap: HeatmapRow[]): RankItem[] {
  const map: Record<string, { sum: number; w: number }> = {};
  for (const row of heatmap) {
    if (!map[row.segment]) map[row.segment] = { sum: 0, w: 0 };
    map[row.segment].sum += row.avg_reward * row.decisions;
    map[row.segment].w   += row.decisions;
  }
  // keep catalogue order, fall back to sorted
  const ordered = SEGMENTS.filter((s) => map[s]);
  return (ordered.length ? ordered : Object.keys(map))
    .map((key) => {
      const { sum, w } = map[key] ?? { sum: 0, w: 1 };
      return { key, name: SEGMENT_LABELS[key] ?? key, avg: w > 0 ? sum / w : 0 };
    })
    .sort((a, b) => b.avg - a.avg);
}

interface MatrixResult {
  segments: string[];
  arms: string[];
  cell: Map<string, number>; // "seg::arm" → avg_reward
  globalMax: number;
  bestArmBySeg: Map<string, string>; // seg → arm
}

function pivotMatrix(heatmap: HeatmapRow[]): MatrixResult {
  const cell = new Map<string, number>();
  for (const row of heatmap) cell.set(`${row.segment}::${row.arm}`, row.avg_reward);

  const presentSegs = new Set(heatmap.map((r) => r.segment));
  const presentArms = new Set(heatmap.map((r) => r.arm));

  const segments = SEGMENTS.filter((s) => presentSegs.has(s));
  const arms     = ARMS.filter((a) => presentArms.has(a));
  const globalMax = Math.max(...heatmap.map((r) => r.avg_reward), 0.001);

  const bestArmBySeg = new Map<string, string>();
  for (const seg of segments) {
    let bestArm = arms[0];
    let bestVal = -1;
    for (const arm of arms) {
      const v = cell.get(`${seg}::${arm}`) ?? 0;
      if (v > bestVal) { bestVal = v; bestArm = arm; }
    }
    if (bestVal > 0) bestArmBySeg.set(seg, bestArm);
  }

  return { segments, arms, cell, globalMax, bestArmBySeg };
}

// ─── auto insights ────────────────────────────────────────────────────────────

interface Insight { text: string; tone: "good" | "warn" | "neutral" }

function buildInsights(
  channelRank: RankItem[],
  segRank: RankItem[],
  matrix: MatrixResult,
  fairness: FairnessResponse | undefined
): Insight[] {
  const out: Insight[] = [];

  // 1 — best channel vs average
  if (channelRank.length >= 2) {
    const top = channelRank[0];
    const avg = channelRank.reduce((s, c) => s + c.avg, 0) / channelRank.length;
    const delta = ((top.avg - avg) / avg) * 100;
    out.push({
      text: `${top.name} converte ${delta.toFixed(0)}% acima da média dos canais (${(top.avg * 100).toFixed(1)}%) — concentre budget aqui`,
      tone: "good",
    });
  }

  // 2 — best segment
  if (segRank.length > 0) {
    const top = segRank[0];
    out.push({
      text: `"${top.name}" é o público mais rentável (${(top.avg * 100).toFixed(1)}% de conversão) — priorize targeting neste segmento`,
      tone: "good",
    });
  }

  // 3 — anchor product (wins in most segments)
  if (matrix.segments.length > 0) {
    const wins: Record<string, number> = {};
    for (const [, arm] of matrix.bestArmBySeg) {
      wins[arm] = (wins[arm] ?? 0) + 1;
    }
    const [bestArm, count] = Object.entries(wins).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (bestArm && count) {
      out.push({
        text: `${ARM_LABELS[bestArm] ?? bestArm} é o produto âncora — lidera em ${count} de ${matrix.segments.length} segmentos`,
        tone: "neutral",
      });
    }
  }

  // 4 — fairness / alerts
  if (fairness) {
    const critical = fairness.alerts.filter((a) => a.severity === "critical");
    if (critical.length > 0) {
      out.push({ text: `Atenção: ${critical[0].message}`, tone: "warn" });
    } else {
      const ci = fairness.concentration_index;
      const label = ci < 0.25 ? "saudável" : ci < 0.5 ? "moderada" : "alta";
      out.push({
        text: `Concentração de tráfego ${label} (índice ${ci.toFixed(2)}) — distribuição equilibrada entre segmentos`,
        tone: ci < 0.5 ? "good" : "warn",
      });
    }
  }

  return out.slice(0, 4);
}

// ─── shared sub-components ────────────────────────────────────────────────────

function SectionLabel({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      <Icon className="h-3 w-3" />
      {text}
    </div>
  );
}

function RankBar({
  name,
  avg,
  maxAvg,
  isTop,
  color,
  topColor,
}: {
  name: string;
  avg: number;
  maxAvg: number;
  isTop: boolean;
  color: string;
  topColor: string;
}) {
  const pct = maxAvg > 0 ? (avg / maxAvg) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs font-medium text-right shrink-0 text-muted-foreground truncate">
        {name}
      </div>
      <div className="flex-1 h-7 bg-muted/60 rounded-lg overflow-hidden relative">
        <div
          className="h-full rounded-lg transition-all"
          style={{ width: `${pct}%`, backgroundColor: isTop ? topColor : color }}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums">
          {(avg * 100).toFixed(1)}%
        </span>
      </div>
      {isTop && (
        <span
          className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: `${topColor}22`, color: topColor }}
        >
          TOP
        </span>
      )}
    </div>
  );
}

// ─── Market Intelligence ──────────────────────────────────────────────────────

function MarketIntelligence({
  channelItems,
  heatmap,
  fairness,
}: {
  channelItems: ChannelMetricsItem[];
  heatmap: HeatmapRow[];
  fairness: FairnessResponse | undefined;
}) {
  const channelRank = useMemo(() => aggChannels(channelItems), [channelItems]);
  const segRank     = useMemo(() => aggSegments(heatmap),      [heatmap]);
  const matrix      = useMemo(() => pivotMatrix(heatmap),      [heatmap]);
  const insights    = useMemo(
    () => buildInsights(channelRank, segRank, matrix, fairness),
    [channelRank, segRank, matrix, fairness]
  );

  const hasData = channelItems.length > 0 || heatmap.length > 0;

  if (!hasData) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <Grid3X3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm font-semibold text-muted-foreground">
          Inteligência de Mercado indisponível
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Gere dados sintéticos nos experimentos para ativar os comparativos.
        </p>
      </div>
    );
  }

  const maxCh  = channelRank[0]?.avg ?? 1;
  const maxSeg = segRank[0]?.avg ?? 1;

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      {/* header */}
      <div className="px-6 py-4 border-b bg-muted/10 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wider">
            Inteligência de Mercado
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Análise comparativa de canais, segmentos e produtos
          </p>
        </div>
      </div>

      <div className="p-6 space-y-7">

        {/* 2a — Auto insights */}
        {insights.length > 0 && (
          <div className="rounded-xl bg-muted/30 p-4 space-y-2.5">
            <SectionLabel icon={Sparkles} text="Insights Automáticos" />
            <div className="mt-2 space-y-2">
              {insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs leading-relaxed">
                  <span
                    className="mt-0.5 shrink-0 font-black text-sm"
                    style={{
                      color:
                        ins.tone === "good"
                          ? "#059669"
                          : ins.tone === "warn"
                          ? "#d97706"
                          : "#6366f1",
                    }}
                  >
                    ●
                  </span>
                  <span
                    style={{
                      color:
                        ins.tone === "good"
                          ? "#065f46"
                          : ins.tone === "warn"
                          ? "#92400e"
                          : "#312e81",
                    }}
                  >
                    {ins.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2b + 2c — Channel & Segment rankings */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 2b — Channels */}
          {channelRank.length > 0 && (
            <div className="space-y-3">
              <SectionLabel icon={Wifi} text="Performance por Canal" />
              <div className="space-y-2">
                {channelRank.map((item, i) => (
                  <RankBar
                    key={item.key}
                    name={item.name}
                    avg={item.avg}
                    maxAvg={maxCh}
                    isTop={i === 0}
                    color="#86efac"
                    topColor="#15803d"
                  />
                ))}
              </div>
            </div>
          )}

          {/* 2c — Segments */}
          {segRank.length > 0 && (
            <div className="space-y-3">
              <SectionLabel icon={Users} text="Performance por Segmento" />
              <div className="space-y-2">
                {segRank.slice(0, 6).map((item, i) => (
                  <RankBar
                    key={item.key}
                    name={item.name}
                    avg={item.avg}
                    maxAvg={maxSeg}
                    isTop={i === 0}
                    color="#c4b5fd"
                    topColor="#6d28d9"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2d — Segment × Product matrix */}
        {matrix.segments.length > 0 && matrix.arms.length > 0 && (
          <div className="space-y-3">
            <SectionLabel icon={Grid3X3} text="Matriz Segmento × Produto — Taxa de Conversão" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4 font-semibold text-muted-foreground w-28 whitespace-nowrap">
                      Segmento
                    </th>
                    {matrix.arms.map((arm) => (
                      <th
                        key={arm}
                        className="text-center py-2 px-1 font-semibold text-muted-foreground whitespace-nowrap min-w-[80px]"
                      >
                        {ARM_LABELS[arm] ?? arm}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.segments.map((seg) => {
                    const best = matrix.bestArmBySeg.get(seg);
                    return (
                      <tr key={seg}>
                        <td className="pr-4 py-1 font-medium text-muted-foreground whitespace-nowrap">
                          {SEGMENT_LABELS[seg] ?? seg}
                        </td>
                        {matrix.arms.map((arm) => {
                          const val = matrix.cell.get(`${seg}::${arm}`) ?? 0;
                          const { bg, fg } = heatColor(val, matrix.globalMax);
                          const isBest = arm === best && val > 0;
                          return (
                            <td key={arm} className="py-1 px-1">
                              <div
                                className={`relative rounded-lg text-center py-2 px-1 ${
                                  isBest ? "ring-2 ring-green-600 ring-offset-1" : ""
                                }`}
                                style={{ backgroundColor: bg, color: fg }}
                              >
                                <span className="font-bold tabular-nums">
                                  {val > 0 ? `${(val * 100).toFixed(1)}%` : "—"}
                                </span>
                                {isBest && (
                                  <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-green-600 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
                                    ★
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-16 rounded" style={{ background: "linear-gradient(to right, hsl(152 30% 97%), hsl(152 85% 35%))" }} />
                <span>Baixo → Alto</span>
              </div>
              <span>★ melhor produto por segmento</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── decision ─────────────────────────────────────────────────────────────────

type DecisionVariant = "deploy" | "strong" | "monitor" | "wait" | "nodata";

const DECISION: Record<
  DecisionVariant,
  {
    label: string;
    sub: string;
    strip: string;
    text: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  deploy: {
    label: "IMPLANTAR",
    sub: "Evidência bayesiana ≥ 95%",
    strip: "bg-green-700",
    text: "text-white",
    Icon: CheckCircle2,
  },
  strong: {
    label: "TENDÊNCIA FORTE",
    sub: "Probabilidade ≥ 75%",
    strip: "bg-emerald-500",
    text: "text-white",
    Icon: TrendingUp,
  },
  monitor: {
    label: "MONITORAR",
    sub: "Inconclusivo — acompanhe",
    strip: "bg-amber-500",
    text: "text-white",
    Icon: AlertCircle,
  },
  wait: {
    label: "AGUARDAR",
    sub: "Coletando dados",
    strip: "bg-sky-500",
    text: "text-white",
    Icon: Clock,
  },
  nodata: {
    label: "SEM DADOS",
    sub: "Nenhuma decisão registrada",
    strip: "bg-slate-200",
    text: "text-slate-600",
    Icon: Clock,
  },
};

function getDecision(arms: ArmResult[], sampleReached: boolean): DecisionVariant {
  if (!arms?.length) return "nodata";
  const best = arms.find((a) => a.is_best);
  const prob = best?.prob_best ?? null;
  if (prob === null) return "wait";
  if (prob >= 0.95) return "deploy";
  if (prob >= 0.75) return "strong";
  if (sampleReached) return "monitor";
  return "wait";
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

function KpiStrip({
  experiments,
  metrics,
  channelItems,
}: {
  experiments: ExperimentItem[] | undefined;
  metrics: MetricsResponse[] | undefined;
  channelItems: ChannelMetricsItem[];
}) {
  const totalDec  = metrics?.reduce((s, m) => s + m.total_decisions, 0) ?? 0;
  const running   = experiments?.filter((e) => e.status === "running").length ?? 0;
  const bestConv  = metrics ? Math.max(...metrics.map((m) => m.avg_reward)) * 100 : null;
  const topCh     = channelItems.length
    ? [...channelItems].sort((a, b) => b.avg_reward - a.avg_reward)[0]
    : null;

  const items = [
    { value: totalDec.toLocaleString("pt-BR"), label: "Decisões Totais", accent: "text-foreground" },
    { value: `${running} ativo${running !== 1 ? "s" : ""}`, label: "Experimentos", accent: "text-violet-600" },
    { value: bestConv !== null ? `${bestConv.toFixed(1)}%` : "—", label: "Melhor Conversão", accent: "text-emerald-600" },
    {
      value: topCh ? (CHANNEL_LABELS[topCh.channel] ?? topCh.channel) : "—",
      label: topCh ? `${(topCh.avg_reward * 100).toFixed(1)}% conv.` : "Canal Top",
      accent: "text-amber-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ value, label, accent }) => (
        <div key={label} className="rounded-xl border bg-card px-4 py-3">
          <div className={`text-2xl font-extrabold tabular-nums ${accent}`}>{value}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── experiment card ──────────────────────────────────────────────────────────

function ExperimentCard({
  exp,
  heatmap,
}: {
  exp: ExperimentItem;
  heatmap: HeatmapRow[];
}) {
  const { data: results } = useSWR(
    `insight-exp-${exp.id}`,
    () => api.experimentResults(exp.id),
    { refreshInterval: exp.status === "running" ? 30_000 : 0, keepPreviousData: true }
  );

  const best    = results?.arms.find((a) => a.is_best);
  const variant = results ? getDecision(results.arms, results.sample_reached) : null;
  const d       = variant ? DECISION[variant] : null;
  const Icon    = d?.Icon;

  const baseline = results
    ? [...results.arms].filter((a) => !a.is_best).sort((a, b) => a.avg_reward - b.avg_reward)[0]
    : undefined;

  const dpr = results && (results.days_running ?? 0) > 0
    ? results.total_decisions / results.days_running!
    : 0;
  const proj90 = best && dpr > 0 ? Math.round(dpr * 90 * best.avg_reward)     : null;
  const base90 = baseline && dpr > 0 ? Math.round(dpr * 90 * baseline.avg_reward) : null;
  const uplift  = proj90 !== null && base90 !== null ? proj90 - base90 : null;

  // top segment combo from heatmap filtered to this experiment's arms
  const expArmSet = useMemo(() => new Set(exp.experiment_arms), [exp.experiment_arms]);
  const segSet    = useMemo(
    () => new Set(exp.targeting_segments.length ? exp.targeting_segments : undefined),
    [exp.targeting_segments]
  );
  const topRow = useMemo(
    () =>
      heatmap
        .filter((r) => expArmSet.has(r.arm) && (segSet.size === 0 || segSet.has(r.segment)))
        .sort((a, b) => b.avg_reward - a.avg_reward)[0],
    [heatmap, expArmSet, segSet]
  );
  const topChannel = exp.targeting_channels[0];

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden flex flex-col">
      {/* decision strip */}
      {d && Icon ? (
        <div className={`${d.strip} px-5 py-3.5 flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon className={`h-5 w-5 shrink-0 ${d.text}`} />
            <div className="min-w-0">
              <div className={`text-sm font-extrabold leading-none ${d.text}`}>{d.label}</div>
              <div className={`text-[10px] mt-0.5 leading-tight ${d.text} opacity-75`}>{d.sub}</div>
            </div>
          </div>
          <Link
            href={`/experiments/${exp.id}`}
            className={`shrink-0 flex items-center gap-0.5 text-[10px] font-medium ${d.text} opacity-70 hover:opacity-100 transition-opacity`}
          >
            ver detalhes
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <div className="h-14 bg-muted animate-pulse" />
      )}

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* name + metadata */}
        <div>
          <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
            exp.status === "running" ? "text-green-600" : "text-muted-foreground"
          }`}>
            {exp.status === "running" ? "● Em Execução" : exp.status === "draft" ? "● Rascunho" : "● Encerrado"}
            {results?.days_running != null && (
              <span className="ml-2 font-normal text-muted-foreground">
                · {results.days_running}d · {(results.total_decisions).toLocaleString("pt-BR")} decisões
              </span>
            )}
          </div>
          <h2 className="text-base font-extrabold leading-snug">{exp.name}</h2>
          {exp.hypothesis && (
            <p className="text-[11px] text-muted-foreground italic mt-0.5 line-clamp-1">
              &ldquo;{exp.hypothesis}&rdquo;
            </p>
          )}
        </div>

        {/* 3 hero metrics */}
        {best ? (
          <div className="grid grid-cols-3 divide-x rounded-xl border overflow-hidden">
            <HeroMetric
              value={`${(best.avg_reward * 100).toFixed(1)}%`}
              label="Conversão"
              green
            />
            <HeroMetric
              value={best.expected_lift !== null
                ? `${best.expected_lift >= 0 ? "+" : ""}${(best.expected_lift * 100).toFixed(1)}%`
                : "—"}
              label="Lift vs controle"
              green={best.expected_lift !== null && best.expected_lift > 0}
            />
            <HeroMetric
              value={best.prob_best !== null ? `${(best.prob_best * 100).toFixed(0)}%` : "—"}
              label="Confiança"
              green={best.prob_best !== null && best.prob_best >= 0.75}
            />
          </div>
        ) : (
          <div className="h-16 rounded-xl bg-muted animate-pulse" />
        )}

        {/* winner + top public */}
        <div className="rounded-xl bg-muted/40 px-4 py-3 space-y-2">
          <InfoRow
            label="Produto vencedor"
            value={best ? `★  ${ARM_LABELS[best.arm_id] ?? best.arm_id}` : "—"}
            accent
          />
          <InfoRow
            label="Melhor público"
            value={
              topRow && topChannel
                ? `${SEGMENT_LABELS[topRow.segment] ?? topRow.segment}  ·  ${CHANNEL_LABELS[topChannel] ?? topChannel}  →  ${(topRow.avg_reward * 100).toFixed(1)}%`
                : topRow
                ? `${SEGMENT_LABELS[topRow.segment] ?? topRow.segment}  →  ${(topRow.avg_reward * 100).toFixed(1)}%`
                : "—"
            }
          />
        </div>

        {/* 90-day projection */}
        {proj90 !== null ? (
          <div className="rounded-xl border border-dashed border-primary/25 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Projeção — próximos 90 dias
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-3xl font-extrabold tabular-nums">
                {proj90.toLocaleString("pt-BR")}
              </span>
              <span className="text-xs text-muted-foreground">conversões estimadas</span>
              {uplift !== null && uplift > 0 && (
                <span className="ml-auto text-sm font-extrabold text-emerald-600 tabular-nums">
                  +{uplift.toLocaleString("pt-BR")} vs baseline
                </span>
              )}
            </div>
          </div>
        ) : (
          results && results.total_decisions === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-2">
              Gere dados sintéticos para ativar as projeções.
            </p>
          )
        )}
      </div>
    </div>
  );
}

// ─── micro helpers ────────────────────────────────────────────────────────────

function HeroMetric({ value, label, green = false }: { value: string; label: string; green?: boolean }) {
  return (
    <div className="px-3 py-3 text-center bg-card">
      <div className={`text-xl font-extrabold tabular-nums ${green ? "text-emerald-600" : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function InfoRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-semibold text-right truncate ${accent ? "text-green-700" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function PageDivider({ label, pulse }: { label: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
        {pulse && <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />}
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function InsightPage() {
  const { data: experiments, isLoading } = useSWR(
    "insight-experiments",
    () => api.listExperiments(),
    { refreshInterval: 60_000 }
  );
  const { data: metrics }       = useSWR("all-metrics",          api.allMetrics,        { refreshInterval: 60_000 });
  const { data: channelMetrics} = useSWR("channel-metrics",      api.channelMetrics,    { refreshInterval: 60_000 });
  const { data: heatmapRaw }    = useSWR("analytics-heatmap",    api.analyticsHeatmap,  { refreshInterval: 60_000 });
  const { data: fairness }      = useSWR("analytics-fairness",   api.fairness,          { refreshInterval: 60_000 });

  const heatmap      = heatmapRaw ?? [];
  const channelItems = channelMetrics?.items ?? [];

  const running = experiments?.filter((e) => e.status === "running") ?? [];
  const others  = experiments?.filter((e) => e.status !== "running") ?? [];

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });

  return (
    <div className="space-y-7">

      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-extrabold">Insights</h1>
        </div>
        <div className="flex items-center gap-3">
          {running.length > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-green-600 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              {running.length} em execução
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{today}</span>
        </div>
      </div>

      {/* kpi strip */}
      <KpiStrip experiments={experiments} metrics={metrics} channelItems={channelItems} />

      {/* market intelligence */}
      {(channelItems.length > 0 || heatmap.length > 0) ? (
        <MarketIntelligence
          channelItems={channelItems}
          heatmap={heatmap}
          fairness={fairness}
        />
      ) : (
        <div className="rounded-2xl border bg-card p-6 flex items-center gap-4 text-muted-foreground">
          <BarChart3 className="h-8 w-8 opacity-20 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Inteligência de Mercado carregando…</p>
            <p className="text-xs mt-0.5">Gere dados sintéticos nos experimentos para ativar os comparativos.</p>
          </div>
        </div>
      )}

      {/* loading */}
      {isLoading && !experiments && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      )}

      {/* empty */}
      {experiments?.length === 0 && (
        <div className="flex flex-col items-center py-24 text-center text-muted-foreground">
          <Lightbulb className="h-12 w-12 mb-3 opacity-10" />
          <p className="text-sm font-semibold">Nenhum experimento cadastrado</p>
          <p className="text-xs mt-1">Crie experimentos para gerar insights.</p>
        </div>
      )}

      {/* running */}
      {running.length > 0 && (
        <section className="space-y-4">
          <PageDivider
            label={`Em execução · ${running.length} experimento${running.length > 1 ? "s" : ""}`}
            pulse
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {running.map((exp) => (
              <ExperimentCard key={exp.id} exp={exp} heatmap={heatmap} />
            ))}
          </div>
        </section>
      )}

      {/* others */}
      {others.length > 0 && (
        <section className="space-y-4">
          <PageDivider label={`Outros · ${others.length} experimento${others.length > 1 ? "s" : ""}`} />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {others.map((exp) => (
              <ExperimentCard key={exp.id} exp={exp} heatmap={heatmap} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
