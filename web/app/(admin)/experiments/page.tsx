"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import type { ExperimentItem } from "@/lib/types";
import { ARMS, ARM_LABELS, POLICIES, POLICY_LABELS, SEGMENTS, SEGMENT_LABELS } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { FlaskConical, Plus, Play, Square, ChevronRight, Target, Layers, Trash2, Beaker } from "lucide-react";

const CHANNELS = ["web", "mobile", "email", "call_center"] as const;
const CHANNEL_LABELS: Record<string, string> = {
  web: "Web",
  mobile: "Mobile",
  email: "E-mail",
  call_center: "Call Center",
};

const SWR_OPTS = { refreshInterval: 30_000, keepPreviousData: true, revalidateOnMount: true };

const STATUS_STYLE: Record<string, { dot: string; badge: string; label: string }> = {
  draft:   { dot: "bg-yellow-400", badge: "bg-yellow-50 text-yellow-700 border-yellow-200",  label: "Rascunho" },
  running: { dot: "bg-green-500",  badge: "bg-green-50 text-green-700 border-green-200",     label: "Executando" },
  stopped: { dot: "bg-slate-400",  badge: "bg-slate-50 text-slate-600 border-slate-200",     label: "Encerrado"  },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.stopped;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function CheckboxGroup<T extends string>({
  label,
  icon,
  options,
  labels,
  selected,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  options: readonly T[];
  labels: Record<string, string>;
  selected: T[];
  onChange: (v: T[]) => void;
}) {
  function toggle(v: T) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium flex items-center gap-1.5">
        {icon} {label}
        <span className="font-normal text-muted-foreground">(vazio = todos)</span>
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${
              selected.includes(o)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-input hover:border-primary/50"
            }`}
          >
            {labels[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  );
}

function NewExperimentForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [policy, setPolicy] = useState("contextual_thompson");
  const [arms, setArms] = useState<string[]>([...ARMS]);
  const [segments, setSegments] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [syntheticEnabled, setSyntheticEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim()) { setError("Nome obrigatório"); return; }
    if (arms.length < 2) { setError("Selecione ao menos 2 braços"); return; }
    setLoading(true);
    setError("");
    try {
      await api.createExperiment({
        name,
        hypothesis,
        experiment_policy: policy,
        experiment_arms: arms,
        targeting_segments: segments,
        targeting_channels: channels,
        synthetic_data_enabled: syntheticEnabled,
      });
      setOpen(false);
      setName(""); setHypothesis(""); setArms([...ARMS]); setSegments([]); setChannels([]); setSyntheticEnabled(false);
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar experimento");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Novo Experimento
      </Button>
    );
  }

  return (
    <Card className="border-primary/30 shadow-sm">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">Novo Experimento Adaptativo</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Nome</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ex: Teste CDB vs Poupança — Segmento Jovem"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Política bandit</Label>
          <select
            value={policy}
            onChange={e => setPolicy(e.target.value)}
            className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs"
          >
            {POLICIES.map(p => (
              <option key={p} value={p}>{POLICY_LABELS[p] ?? p}</option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            A política escolhe adaptivamente qual braço mostrar. Thompson Contextual é recomendado.
          </p>
        </div>

        <CheckboxGroup
          label="Braços a testar"
          icon={<Layers className="h-3 w-3" />}
          options={ARMS}
          labels={ARM_LABELS}
          selected={arms as string[] as any}
          onChange={setArms as any}
        />

        <CheckboxGroup
          label="Segmentos-alvo"
          icon={<Target className="h-3 w-3" />}
          options={SEGMENTS}
          labels={SEGMENT_LABELS}
          selected={segments as string[] as any}
          onChange={setSegments as any}
        />

        <CheckboxGroup
          label="Canais-alvo"
          icon={<Target className="h-3 w-3" />}
          options={CHANNELS}
          labels={CHANNEL_LABELS}
          selected={channels as string[] as any}
          onChange={setChannels as any}
        />

        <div className="flex items-start gap-3 rounded-lg border border-dashed border-indigo-200 bg-indigo-50 p-3">
          <input
            id="synthetic-toggle"
            type="checkbox"
            checked={syntheticEnabled}
            onChange={e => setSyntheticEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input accent-indigo-600 cursor-pointer"
          />
          <div>
            <label htmlFor="synthetic-toggle" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
              <Beaker className="h-3.5 w-3.5 text-indigo-500" />
              Habilitar Dados Sintéticos
            </label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Gera até 50.000 decisões sintéticas com rewards simulados para acelerar avaliação.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Hipótese</Label>
          <Textarea
            value={hypothesis}
            onChange={e => setHypothesis(e.target.value)}
            placeholder="ex: CDB 12m tem maior conversão no segmento jovem durante o inverno"
            rows={2}
            className="text-xs resize-none"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={submit} disabled={loading || !name.trim()} className="h-7 text-xs">
            {loading ? "Criando…" : "Criar Experimento"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setError(""); }} className="h-7 text-xs">
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExperimentCard({ exp, onAction }: { exp: ExperimentItem; onAction: () => void }) {
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syntheticLoading, setSyntheticLoading] = useState(false);
  const [syntheticError, setSyntheticError] = useState("");

  async function start() {
    setLoading(true);
    try { await api.startExperiment(exp.id); onAction(); } finally { setLoading(false); }
  }

  async function stop() {
    setLoading(true);
    try { await api.stopExperiment(exp.id); onAction(); } finally { setLoading(false); }
  }

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setLoading(true);
    setConfirmDelete(false);
    try { await api.deleteExperiment(exp.id); onAction(); } finally { setLoading(false); }
  }

  async function generateSynthetic() {
    setSyntheticLoading(true);
    setSyntheticError("");
    try {
      const remaining = 50_000 - (exp.synthetic_data_count ?? 0);
      await api.generateSynthetic(exp.id, Math.min(10_000, remaining));
      onAction();
    } catch (e: unknown) {
      setSyntheticError(e instanceof Error ? e.message : "Erro ao gerar dados");
    } finally {
      setSyntheticLoading(false);
    }
  }

  const armLabels = exp.experiment_arms.map(a => ARM_LABELS[a] ?? a);

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <StatusBadge status={exp.status} />
              {exp.winner && (
                <span className="text-xs text-green-700 font-medium">Winner: {ARM_LABELS[exp.winner] ?? exp.winner}</span>
              )}
            </div>
            <Link href={`/experiments/${exp.id}`} className="font-semibold text-sm hover:text-primary transition-colors line-clamp-1">
              {exp.name}
            </Link>
            {exp.hypothesis && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{exp.hypothesis}</p>
            )}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                {POLICY_LABELS[exp.experiment_policy] ?? exp.experiment_policy}
              </span>
              <span className="text-xs text-muted-foreground">
                {armLabels.join(" vs ")}
              </span>
              {exp.started_at && (
                <span className="text-xs text-muted-foreground ml-auto">
                  desde {new Date(exp.started_at).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
            {(exp.targeting_segments.length > 0 || exp.targeting_channels.length > 0) && (
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                {exp.targeting_segments.map(s => (
                  <span key={s} className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    {SEGMENT_LABELS[s] ?? s}
                  </span>
                ))}
                {exp.targeting_channels.map(c => (
                  <span key={c} className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    {CHANNEL_LABELS[c] ?? c}
                  </span>
                ))}
              </div>
            )}
            {exp.synthetic_data_enabled && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Beaker className="h-2.5 w-2.5" />
                  Sintético: {(exp.synthetic_data_count ?? 0).toLocaleString("pt-BR")} / 50.000
                </span>
                {syntheticError && (
                  <span className="text-[10px] text-red-500">{syntheticError}</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {exp.synthetic_data_enabled && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title={`Gerar dados sintéticos (${(exp.synthetic_data_count ?? 0).toLocaleString("pt-BR")}/50.000)`}
                onClick={generateSynthetic}
                disabled={syntheticLoading || (exp.synthetic_data_count ?? 0) >= 50_000}
              >
                <Beaker className={`h-3.5 w-3.5 ${syntheticLoading ? "animate-spin text-indigo-500" : "text-indigo-400"}`} />
              </Button>
            )}
            {exp.status === "draft" && (
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Iniciar experimento" onClick={start} disabled={loading}>
                <Play className="h-3.5 w-3.5 text-green-600" />
              </Button>
            )}
            {exp.status === "running" && (
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Parar experimento" onClick={stop} disabled={loading}>
                <Square className="h-3.5 w-3.5 text-red-500" />
              </Button>
            )}
            {exp.status !== "running" && (
              <Button
                size="icon"
                variant="ghost"
                className={`h-7 w-7 ${confirmDelete ? "bg-red-50 ring-1 ring-red-300" : ""}`}
                title={confirmDelete ? "Clique novamente para confirmar exclusão" : "Excluir experimento"}
                onClick={remove}
                disabled={loading}
                onBlur={() => setConfirmDelete(false)}
              >
                <Trash2 className={`h-3.5 w-3.5 ${confirmDelete ? "text-red-600" : "text-muted-foreground"}`} />
              </Button>
            )}
            <Link href={`/experiments/${exp.id}`}>
              <Button size="icon" variant="ghost" className="h-7 w-7">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExperimentsPage() {
  const { data, mutate, error } = useSWR("experiments", () => api.listExperiments(), SWR_OPTS);

  // mutate() bypasses dedupingInterval — ensures a fresh fetch on every mount
  // even when the sidebar preload ran within the global dedupingInterval window.
  useEffect(() => { void mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const running = data?.filter(e => e.status === "running") ?? [];
  const draft   = data?.filter(e => e.status === "draft") ?? [];
  const stopped = data?.filter(e => e.status === "stopped") ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            <FlaskConical className="h-3.5 w-3.5" />
            Experimentation lab
          </div>
          <h1 className="text-3xl font-black sm:text-4xl">Experimentos Adaptativos</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            A política bandit escolhe adaptivamente qual oferta mostrar. Resultados mostram qual braço venceu.
          </p>
        </div>
        <NewExperimentForm onCreated={() => mutate()} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Em execução", value: running.length, color: "text-green-600" },
          { label: "Rascunho",    value: draft.length,   color: "text-yellow-600" },
          { label: "Encerrados",  value: stopped.length, color: "text-slate-500" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              {!data && !error ? (
                <div className="h-8 w-10 rounded bg-muted/60 animate-pulse mx-auto mb-1" />
              ) : (
                <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
              )}
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!data && !error ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center space-y-2">
          <p className="text-sm text-red-700 font-medium">Erro ao carregar experimentos</p>
          <p className="text-xs text-red-500">{error instanceof Error ? error.message : "Falha na conexão com a API"}</p>
          <Button size="sm" variant="outline" onClick={() => mutate()} className="h-7 text-xs mt-1">
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          {running.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Em Execução</h2>
              {running.map(e => <ExperimentCard key={e.id} exp={e} onAction={() => mutate()} />)}
            </section>
          )}

          {draft.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rascunho</h2>
              {draft.map(e => <ExperimentCard key={e.id} exp={e} onAction={() => mutate()} />)}
            </section>
          )}

          {stopped.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Encerrados</h2>
              {stopped.map(e => <ExperimentCard key={e.id} exp={e} onAction={() => mutate()} />)}
            </section>
          )}

          {!data?.length && (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground text-sm">
              Nenhum experimento criado ainda.
              <br />
              <span className="text-xs">
                Crie um experimento: escolha braços (ofertas), política bandit e targeting.
                O sistema vai aprender qual oferta converte mais.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
