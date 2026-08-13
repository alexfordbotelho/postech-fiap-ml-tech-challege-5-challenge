"use client";

import useSWR from "swr";
import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { api } from "@/lib/api";
import type {
  FeatureFlagItem,
  FeatureFlagRule,
  FlagScenarioRow,
  FlagScenarioProfileRow,
  FlagScenarioTimelineRow,
} from "@/lib/types";
import { SEGMENT_LABELS, ARM_LABELS } from "@/lib/types";
import { useMounted } from "@/hooks/useMounted";
import { usePagePerformance } from "@/hooks/usePagePerformance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Flag,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  X,
  AlertTriangle,
  ShieldOff,
  Activity,
  TrendingUp,
  Users,
} from "lucide-react";

const SWR_OPTS = { refreshInterval: 30_000, keepPreviousData: true };

const FLAG_TYPES = ["boolean", "string", "number", "json"];
const OPERATORS = ["$eq", "$ne", "$in", "$nin", "$gt", "$lt", "$gte", "$lte"];

// ── helpers ────────────────────────────────────────────────────────────────

function humanCondition(condition: Record<string, unknown>): string {
  if (!condition || Object.keys(condition).length === 0) return "(padrão)";
  return Object.entries(condition)
    .map(([field, val]) => {
      if (typeof val === "object" && val !== null) {
        return Object.entries(val as Record<string, unknown>)
          .map(([op, v]) => {
            const opLabel: Record<string, string> = {
              $eq: "=", $ne: "≠", $gt: ">", $lt: "<", $gte: "≥", $lte: "≤",
              $in: "∈", $nin: "∉",
            };
            const opStr = opLabel[op] ?? op;
            const vStr = Array.isArray(v) ? `[${(v as unknown[]).join(", ")}]` : String(v);
            return `${field} ${opStr} ${vStr}`;
          })
          .join(" e ");
      }
      return `${field} = ${String(val)}`;
    })
    .join(" e ");
}

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function parseDefaultValue(raw: string, type: string): unknown {
  if (type === "boolean") return raw === "true";
  if (type === "number") return Number(raw);
  if (type === "json") {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

// ── Toggle switch ──────────────────────────────────────────────────────────

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => onChange(!on)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        on ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
          on ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Rule Builder ───────────────────────────────────────────────────────────

interface RuleDraft {
  field: string;
  operator: string;
  rawValue: string;
  value: unknown;
}

function buildCondition(field: string, op: string, rawVal: string): Record<string, unknown> {
  let parsed: unknown = rawVal;
  if (["$in", "$nin"].includes(op)) {
    parsed = rawVal.split(",").map(s => s.trim()).filter(Boolean);
  } else if (!isNaN(Number(rawVal)) && rawVal !== "") {
    parsed = Number(rawVal);
  } else if (rawVal === "true" || rawVal === "false") {
    parsed = rawVal === "true";
  }
  return { [field]: { [op]: parsed } };
}

function RuleBuilder({
  rules,
  onChange,
}: {
  rules: FeatureFlagRule[];
  onChange: (r: FeatureFlagRule[]) => void;
}) {
  const [draft, setDraft] = useState<RuleDraft>({
    field: "segment",
    operator: "$eq",
    rawValue: "",
    value: "",
  });
  const [resultRaw, setResultRaw] = useState("");

  function addRule() {
    if (!draft.field || !resultRaw) return;
    const cond = buildCondition(draft.field, draft.operator, draft.rawValue);
    let resultVal: unknown = resultRaw;
    if (!isNaN(Number(resultRaw)) && resultRaw !== "") resultVal = Number(resultRaw);
    else if (resultRaw === "true" || resultRaw === "false") resultVal = resultRaw === "true";
    else { try { resultVal = JSON.parse(resultRaw); } catch { /* stay string */ } }
    onChange([...rules, { condition: cond, value: resultVal }]);
    setDraft({ field: "segment", operator: "$eq", rawValue: "", value: "" });
    setResultRaw("");
  }

  function removeRule(i: number) {
    onChange(rules.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {rules.map((rule, i) => (
        <div key={i} className="flex items-center gap-2 text-xs bg-muted/40 rounded p-2">
          <span className="text-muted-foreground shrink-0">#{i + 1}</span>
          <span className="flex-1 min-w-0">
            <span className="text-blue-600 font-medium">Se </span>
            <span className="font-mono">{humanCondition(rule.condition)}</span>
            <span className="text-muted-foreground mx-1">→</span>
            <span className="font-semibold text-green-700">{displayValue(rule.value)}</span>
          </span>
          <button onClick={() => removeRule(i)} className="text-muted-foreground hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div className="border rounded p-2 space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Adicionar regra</div>
        <div className="grid grid-cols-3 gap-1.5">
          <input
            placeholder="campo (ex: segment)"
            value={draft.field}
            onChange={e => setDraft(d => ({ ...d, field: e.target.value }))}
            className="col-span-1 border rounded px-2 py-1 text-xs bg-background"
          />
          <select
            value={draft.operator}
            onChange={e => setDraft(d => ({ ...d, operator: e.target.value }))}
            className="border rounded px-2 py-1 text-xs bg-background"
          >
            {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          <input
            placeholder="valor (virgula p/ lista)"
            value={draft.rawValue}
            onChange={e => setDraft(d => ({ ...d, rawValue: e.target.value }))}
            className="border rounded px-2 py-1 text-xs bg-background"
          />
        </div>
        <div className="flex gap-1.5 items-center">
          <span className="text-xs text-muted-foreground">→ resultado:</span>
          <input
            placeholder="valor retornado"
            value={resultRaw}
            onChange={e => setResultRaw(e.target.value)}
            className="flex-1 border rounded px-2 py-1 text-xs bg-background"
          />
          <button
            onClick={addRule}
            className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Flag Form (create / edit) ───────────────────────────────────────────────

interface FlagFormData {
  flag_key: string;
  description: string;
  flag_type: string;
  default_value_raw: string;
  rules: FeatureFlagRule[];
  enabled: boolean;
  tags_raw: string;
}

const emptyForm = (): FlagFormData => ({
  flag_key: "",
  description: "",
  flag_type: "string",
  default_value_raw: "",
  rules: [],
  enabled: true,
  tags_raw: "",
});

function flagToForm(flag: FeatureFlagItem): FlagFormData {
  return {
    flag_key: flag.flag_key,
    description: flag.description,
    flag_type: flag.flag_type,
    default_value_raw: typeof flag.default_value === "object"
      ? JSON.stringify(flag.default_value)
      : String(flag.default_value ?? ""),
    rules: flag.rules ?? [],
    enabled: flag.enabled,
    tags_raw: (flag.tags ?? []).join(", "),
  };
}

function FlagFormModal({
  initial,
  onSave,
  onCancel,
}: {
  initial?: FeatureFlagItem;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FlagFormData>(
    initial ? flagToForm(initial) : emptyForm()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.flag_key) { setError("flag_key é obrigatório"); return; }
    setSaving(true);
    setError(null);
    const body = {
      flag_key: form.flag_key,
      description: form.description,
      flag_type: form.flag_type,
      default_value: parseDefaultValue(form.default_value_raw, form.flag_type),
      rules: form.rules,
      enabled: form.enabled,
      tags: form.tags_raw.split(",").map(t => t.trim()).filter(Boolean),
    };
    try {
      if (initial) {
        await api.updateFlag(initial.flag_key, body);
      } else {
        await api.createFlag(body);
      }
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">{initial ? "Editar Flag" : "Nova Flag"}</h2>
          <button onClick={onCancel}><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium">flag_key *</label>
              <input
                value={form.flag_key}
                onChange={e => setForm(f => ({ ...f, flag_key: e.target.value }))}
                disabled={!!initial}
                placeholder="ex: active_policy"
                className="w-full border rounded px-2 py-1.5 text-sm font-mono bg-background disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Tipo</label>
              <select
                value={form.flag_type}
                onChange={e => setForm(f => ({ ...f, flag_type: e.target.value }))}
                className="w-full border rounded px-2 py-1.5 text-sm bg-background"
              >
                {FLAG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Valor Padrão</label>
              <input
                value={form.default_value_raw}
                onChange={e => setForm(f => ({ ...f, default_value_raw: e.target.value }))}
                placeholder={form.flag_type === "json" ? '{"key":"val"}' : "valor"}
                className="w-full border rounded px-2 py-1.5 text-sm font-mono bg-background"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium">Descrição</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descreva a função desta flag"
                className="w-full border rounded px-2 py-1.5 text-sm bg-background"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium">Tags (separadas por vírgula)</label>
              <input
                value={form.tags_raw}
                onChange={e => setForm(f => ({ ...f, tags_raw: e.target.value }))}
                placeholder="policy, core, experiment"
                className="w-full border rounded px-2 py-1.5 text-sm bg-background"
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Toggle on={form.enabled} onChange={v => setForm(f => ({ ...f, enabled: v }))} />
              <span className="text-sm">{form.enabled ? "Habilitada" : "Desabilitada"}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Regras de Targeting</label>
            <RuleBuilder rules={form.rules} onChange={rules => setForm(f => ({ ...f, rules }))} />
          </div>

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 rounded p-2 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </div>
          )}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm border rounded hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirmation ────────────────────────────────────────────────────

function DeleteConfirm({ flag, onConfirm, onCancel }: { flag: FeatureFlagItem; onConfirm: () => void; onCancel: () => void }) {
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    setDeleting(true);
    try {
      await api.deleteFlag(flag.flag_key);
      onConfirm();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-semibold">Excluir flag</h2>
        </div>
        <p className="text-sm">
          Tem certeza que deseja excluir <code className="font-mono bg-muted px-1 rounded">{flag.flag_key}</code>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm border rounded hover:bg-muted">Cancelar</button>
          <button onClick={confirm} disabled={deleting} className="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded disabled:opacity-50">
            {deleting ? "Excluindo…" : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Evaluate Panel ─────────────────────────────────────────────────────────

function EvaluatePanel({ flag }: { flag: FeatureFlagItem }) {
  const [segment, setSegment] = useState("");
  const [channel, setChannel] = useState("");
  const [extra, setExtra] = useState("");
  const [result, setResult] = useState<{ value: unknown; enabled: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function evaluate() {
    setLoading(true);
    setErr(null);
    let ctx: Record<string, unknown> = {};
    if (segment) ctx.segment = segment;
    if (channel) ctx.channel = channel;
    if (extra) {
      try { ctx = { ...ctx, ...JSON.parse(extra) }; } catch { setErr("JSON inválido no contexto extra"); setLoading(false); return; }
    }
    try {
      const r = await api.evaluateFlag(flag.flag_key, ctx);
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="text-xs font-medium flex items-center gap-1">
        <FlaskConical className="h-3.5 w-3.5" />
        Testar avaliação
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <input
          placeholder="segment (ex: young)"
          value={segment}
          onChange={e => setSegment(e.target.value)}
          className="border rounded px-2 py-1 text-xs bg-background"
        />
        <input
          placeholder="channel (ex: app)"
          value={channel}
          onChange={e => setChannel(e.target.value)}
          className="border rounded px-2 py-1 text-xs bg-background"
        />
        <input
          placeholder='extra JSON (ex: {"tier":"gold"})'
          value={extra}
          onChange={e => setExtra(e.target.value)}
          className="col-span-2 border rounded px-2 py-1 text-xs font-mono bg-background"
        />
      </div>
      <button
        onClick={evaluate}
        disabled={loading}
        className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs disabled:opacity-50"
      >
        {loading ? "Avaliando…" : "Avaliar"}
      </button>
      {err && <div className="text-xs text-destructive">{err}</div>}
      {result && (
        <div className="text-xs bg-muted/50 rounded p-2 space-y-1">
          <div>
            <span className="text-muted-foreground">Resultado: </span>
            <span className="font-mono font-semibold text-green-700">{displayValue(result.value)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Flag ativa: </span>
            <span className={result.enabled ? "text-green-600" : "text-red-500"}>
              {result.enabled ? "sim" : "não"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Flag Card ──────────────────────────────────────────────────────────────

function FlagCard({
  flag,
  onMutate,
}: {
  flag: FeatureFlagItem;
  onMutate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function toggle() {
    setToggling(true);
    try {
      await api.toggleFlag(flag.flag_key, !flag.enabled);
      onMutate();
    } finally {
      setToggling(false);
    }
  }

  return (
    <>
      <Card className={`transition-opacity ${!flag.enabled ? "opacity-60" : ""}`}>
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-semibold">{flag.flag_key}</span>
                <Badge variant="outline" className="text-xs py-0 px-1">{flag.flag_type}</Badge>
                {!flag.enabled && (
                  <Badge variant="destructive" className="text-xs py-0 px-1 flex items-center gap-0.5">
                    <ShieldOff className="h-2.5 w-2.5" /> desativada
                  </Badge>
                )}
                {(flag.tags ?? []).map(t => (
                  <Badge key={t} variant="secondary" className="text-xs py-0 px-1">{t}</Badge>
                ))}
              </div>
              {flag.description && (
                <div className="text-xs text-muted-foreground mt-0.5">{flag.description}</div>
              )}
              <div className="text-xs mt-1">
                <span className="text-muted-foreground">Padrão: </span>
                <code className="font-mono text-xs">{displayValue(flag.default_value)}</code>
                {flag.rules?.length > 0 && (
                  <span className="ml-2 text-muted-foreground">
                    · {flag.rules.length} regra{flag.rules.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Toggle on={flag.enabled} onChange={toggle} disabled={toggling} />
              <button
                onClick={() => setEditing(true)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDeleting(true)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                title="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setExpanded(e => !e)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                title="Expandir"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 space-y-3">
              {flag.rules?.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Regras (primeira que casar vence):</div>
                  {flag.rules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted/40 rounded p-2">
                      <span className="text-muted-foreground shrink-0">#{i + 1}</span>
                      <span>
                        <span className="text-blue-600 font-medium">Se </span>
                        <span className="font-mono">{humanCondition(rule.condition)}</span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="font-semibold text-green-700">{displayValue(rule.value)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <EvaluatePanel flag={flag} />
              {flag.updated_at && (
                <div className="text-xs text-muted-foreground">
                  Atualizado: {new Date(flag.updated_at).toLocaleString("pt-BR")}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <FlagFormModal
          initial={flag}
          onSave={() => { setEditing(false); onMutate(); }}
          onCancel={() => setEditing(false)}
        />
      )}
      {deleting && (
        <DeleteConfirm
          flag={flag}
          onConfirm={() => { setDeleting(false); onMutate(); }}
          onCancel={() => setDeleting(false)}
        />
      )}
    </>
  );
}

// ── Flag Analytics Panel ───────────────────────────────────────────────────

interface WindowOption {
  label: string;
  minutes: number;
  live?: boolean;
}

const WINDOWS: WindowOption[] = [
  { label: "Live", minutes: 5,    live: true },
  { label: "15m",  minutes: 15 },
  { label: "1h",   minutes: 60 },
  { label: "6h",   minutes: 360 },
  { label: "12h",  minutes: 720 },
  { label: "24h",  minutes: 1440 },
  { label: "7d",   minutes: 10080 },
];

const FLAG_VALUE_COLORS: Record<string, string> = {
  "true":  "#16a34a",
  "false": "#94a3b8",
};
const FALLBACK_COLORS = ["#6366f1", "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6", "#f43f5e"];

function flagValueColor(v: string, idx = 0) {
  return FLAG_VALUE_COLORS[v] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

interface FlagSummaryAgg {
  flag_key: string;
  total_decisions: number;
  total_conversions: number;
  conversion_rate: number;
  values: { flag_value: string; decisions: number; conversion_rate: number }[];
}

// ── Flag Value Card (like ArmCard in experiments) ─────────────────────────

function FlagValueCard({
  flag_value,
  decisions,
  conversion_rate,
  total_decisions,
  is_best,
  colorIdx,
}: {
  flag_value: string;
  decisions: number;
  conversion_rate: number;
  total_decisions: number;
  is_best: boolean;
  colorIdx: number;
}) {
  const color = flagValueColor(flag_value, colorIdx);
  const trafficPct = total_decisions > 0 ? (decisions / total_decisions) * 100 : 0;

  return (
    <Card className={`relative ${is_best ? "border-green-400/60 shadow-sm" : ""}`}>
      {is_best && (
        <div className="absolute -top-2.5 left-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-600 text-white rounded-full">
            Melhor valor
          </span>
        </div>
      )}
      <CardContent className="p-4 pt-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="font-mono font-semibold text-sm">{flag_value}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <div className="text-xl font-bold tabular-nums">{decisions.toLocaleString("pt-BR")}</div>
            <div className="text-[10px] text-muted-foreground">Clientes</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <div className="text-xl font-bold tabular-nums">{(conversion_rate * 100).toFixed(2)}%</div>
            <div className="text-[10px] text-muted-foreground">Conversão</div>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">% do tráfego</span>
            <span className="font-bold tabular-nums" style={{ color }}>
              {trafficPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${trafficPct}%`, backgroundColor: color }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Detail Panel (opens when flag is selected) ────────────────────────────

function FlagDetailInner({
  agg,
  timelineChartData,
  timelineFlagValues,
  profileChartData,
  flagValues,
  scenarios,
  mounted,
}: {
  agg: FlagSummaryAgg;
  timelineChartData: Array<Record<string, string | number>>;
  timelineFlagValues: string[];
  profileChartData: Array<Record<string, string | number>>;
  flagValues: string[];
  scenarios: FlagScenarioRow[] | undefined;
  mounted: boolean;
}) {
  const sortedValues = [...agg.values].sort((a, b) => b.conversion_rate - a.conversion_rate);
  const bestValue = sortedValues[0];

  const conversionChartData = sortedValues.map((v, i) => ({
    name: v.flag_value,
    Conversão: +(v.conversion_rate * 100).toFixed(2),
    fill: flagValueColor(v.flag_value, i),
  }));

  return (
    <div className="mx-2 mb-3 p-4 border rounded-xl bg-background shadow-sm space-y-5">

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card px-4 py-3 text-center">
          <p className="text-2xl font-bold tabular-nums">
            {agg.total_decisions.toLocaleString("pt-BR")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Clientes totais</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 text-center">
          <p className="text-2xl font-bold tabular-nums">
            {(agg.conversion_rate * 100).toFixed(2)}%
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Taxa de Conversão</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-primary">
            {agg.values.length}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Valores em teste</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Clientes ao longo do tempo
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {timelineChartData.length > 0 ? (
              mounted ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={timelineChartData} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 11 }}
                      formatter={(v: number, name: string) => [v.toLocaleString("pt-BR"), String(name)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {timelineFlagValues.map((fv, i) => (
                      <Line
                        key={fv}
                        type="monotone"
                        dataKey={fv}
                        name={fv}
                        stroke={flagValueColor(fv, i)}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[160px] animate-pulse rounded bg-muted" />
              )
            ) : (
              <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground">
                Sem dados de timeline no período.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Conversão por Valor
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {mounted ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={conversionChartData} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, "auto"]} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Conversão"]} />
                  <Bar dataKey="Conversão" radius={[4, 4, 0, 0]} maxBarSize={60} isAnimationActive={false}>
                    {conversionChartData.map((d, i) => (
                      <Cell key={i} fill={d.fill as string} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[160px] animate-pulse rounded bg-muted" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Flag value cards (like ArmCard) */}
      <div className={`grid gap-3 ${sortedValues.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {sortedValues.map((v, i) => (
          <FlagValueCard
            key={v.flag_value}
            flag_value={v.flag_value}
            decisions={v.decisions}
            conversion_rate={v.conversion_rate}
            total_decisions={agg.total_decisions}
            is_best={v.flag_value === bestValue?.flag_value}
            colorIdx={i}
          />
        ))}
      </div>

      {/* Segment profile bar chart */}
      {profileChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Clientes por Segmento × Valor
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {mounted ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={profileChartData} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="segment" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v: number, name: string) => [v.toLocaleString("pt-BR"), `flag = ${name}`]}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => `flag = ${v}`} />
                  {flagValues.map((fv, i) => (
                    <Bar
                      key={fv}
                      dataKey={fv}
                      stackId="a"
                      fill={flagValueColor(fv, i)}
                      name={fv}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[160px] animate-pulse rounded bg-muted" />
            )}
          </CardContent>
        </Card>
      )}

      {/* Arm / product distribution table */}
      {scenarios && scenarios.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" /> Produto recomendado por valor da flag
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-[80px_1fr_70px_80px_80px] gap-2 text-xs text-muted-foreground border-b pb-1.5 mb-1">
              <span>Valor</span>
              <span>Produto</span>
              <span className="text-right">Clientes</span>
              <span className="text-right">Conversão</span>
              <span className="text-right">Reward</span>
            </div>
            {scenarios.map((s, i) => (
              <div
                key={i}
                className={`grid grid-cols-[80px_1fr_70px_80px_80px] gap-2 text-xs py-1 rounded px-0.5 ${i % 2 === 0 ? "bg-muted/20" : ""}`}
              >
                <span className="font-semibold" style={{ color: flagValueColor(s.flag_value) }}>
                  {s.flag_value}
                </span>
                <span className="truncate">{ARM_LABELS[s.arm_selected] ?? s.arm_selected}</span>
                <span className="text-right tabular-nums">{s.decisions.toLocaleString("pt-BR")}</span>
                <span className="text-right tabular-nums">{((s.conversion_rate ?? 0) * 100).toFixed(1)}%</span>
                <span className="text-right tabular-nums text-muted-foreground">{(s.avg_reward ?? 0).toFixed(3)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main Analytics Panel ──────────────────────────────────────────────────

function FlagAnalyticsPanel({ flags }: { flags: FeatureFlagItem[] }) {
  const mounted = useMounted();
  // Default 60min so existing data is visible even without active sessions.
  // User can switch to Live (5min) for real-time view.
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [customMinutes, setCustomMinutes] = useState("");
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);

  const isLive = WINDOWS.find(w => w.minutes === windowMinutes)?.live ?? false;
  const refreshInterval = isLive ? 5_000 : 30_000;

  const { data: summary, isLoading: summLoading, error: summError, isValidating } = useSWR(
    ["flag-summary", windowMinutes],
    () => api.flagScenariosSummary(windowMinutes),
    { refreshInterval, keepPreviousData: true, revalidateOnMount: true, revalidateOnFocus: false }
  );

  const { data: profile, isLoading: profileLoading } = useSWR(
    selectedFlag ? ["flag-profile", selectedFlag, windowMinutes] : null,
    () => api.flagScenariosProfile(selectedFlag!, windowMinutes),
    { refreshInterval, keepPreviousData: true }
  );

  const { data: scenarios } = useSWR(
    selectedFlag ? ["flag-scenarios-data", selectedFlag, windowMinutes] : null,
    () => api.flagScenarios(selectedFlag!, windowMinutes),
    { refreshInterval, keepPreviousData: true }
  );

  const { data: timeline, isLoading: timelineLoading } = useSWR(
    selectedFlag ? ["flag-timeline", selectedFlag, windowMinutes] : null,
    () => api.flagScenariosTimeline(selectedFlag!, windowMinutes),
    { refreshInterval, keepPreviousData: true }
  );

  const summaryAgg = useMemo<FlagSummaryAgg[]>(() => {
    if (!summary) return [];
    const map = new Map<string, FlagSummaryAgg>();
    for (const row of summary) {
      if (!map.has(row.flag_key)) {
        map.set(row.flag_key, {
          flag_key: row.flag_key,
          total_decisions: 0,
          total_conversions: 0,
          conversion_rate: 0,
          values: [],
        });
      }
      const agg = map.get(row.flag_key)!;
      agg.total_decisions += row.decisions;
      agg.total_conversions += row.conversions;
      agg.values.push({
        flag_value: row.flag_value,
        decisions: row.decisions,
        conversion_rate: row.conversion_rate,
      });
    }
    for (const agg of map.values()) {
      agg.conversion_rate =
        agg.total_decisions > 0
          ? Math.round((agg.total_conversions / agg.total_decisions) * 10000) / 10000
          : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total_decisions - a.total_decisions);
  }, [summary]);

  const flagValues = useMemo(
    () => [...new Set((profile ?? []).map((r: FlagScenarioProfileRow) => r.flag_value))],
    [profile]
  );

  const profileChartData = useMemo(() => {
    if (!profile) return [];
    const segMap = new Map<string, Record<string, number>>();
    for (const row of profile as FlagScenarioProfileRow[]) {
      if (!segMap.has(row.segment)) {
        const obj: Record<string, number> = {};
        for (const fv of flagValues) obj[fv] = 0;
        segMap.set(row.segment, obj);
      }
      segMap.get(row.segment)![row.flag_value] = row.decisions;
    }
    return Array.from(segMap.entries()).map(([seg, vals]) => ({
      segment: SEGMENT_LABELS[seg] ?? seg,
      ...vals,
    }));
  }, [profile, flagValues]);

  const timelineChartData = useMemo(() => {
    if (!timeline || timeline.length === 0) return [];
    const allFvs = [...new Set(timeline.map((r: FlagScenarioTimelineRow) => r.flag_value))];
    const pivotMap = new Map<string, Record<string, number>>();
    for (const row of timeline as FlagScenarioTimelineRow[]) {
      if (!pivotMap.has(row.label)) {
        const obj: Record<string, number> = {};
        for (const fv of allFvs) obj[fv] = 0;
        pivotMap.set(row.label, obj);
      }
      pivotMap.get(row.label)![row.flag_value] = row.decisions;
    }
    return Array.from(pivotMap.entries()).map(([label, vals]) => ({ label, ...vals }));
  }, [timeline]);

  const timelineFlagValues = useMemo(
    () => [...new Set((timeline ?? []).map((r: FlagScenarioTimelineRow) => r.flag_value))],
    [timeline]
  );

  const enabledKeys = new Set(flags.filter(f => f.enabled).map(f => f.flag_key));

  function applyCustomWindow() {
    const n = parseInt(customMinutes, 10);
    if (!isNaN(n) && n >= 1 && n <= 10080) {
      setWindowMinutes(n);
      setCustomMinutes("");
    }
  }

  const detailLoading = profileLoading || timelineLoading;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Analytics por Flag (Tempo Real)</CardTitle>
            {isLive && (
              <span className="flex items-center gap-1 text-xs text-green-500 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                Live · 5s
              </span>
            )}
            {isValidating && !isLive && (
              <span className="text-xs text-muted-foreground animate-pulse">atualizando…</span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {WINDOWS.map(w => (
              <button
                key={w.minutes}
                onClick={() => setWindowMinutes(w.minutes)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  windowMinutes === w.minutes
                    ? w.live
                      ? "bg-green-600 text-white"
                      : "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {w.label}
              </button>
            ))}
            <div className="flex items-center gap-1 ml-1">
              <input
                type="number"
                min={1}
                max={10080}
                placeholder="min"
                value={customMinutes}
                onChange={e => setCustomMinutes(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyCustomWindow()}
                className="w-14 border rounded px-1.5 py-0.5 text-xs bg-background"
              />
              <button
                onClick={applyCustomWindow}
                className="px-2 py-0.5 rounded text-xs bg-muted hover:bg-muted/80 text-muted-foreground"
              >
                ir
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* When CH is down but we have stale data from SWR, show data + subtle warning */}
        {summError && summaryAgg.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 px-1 pb-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Exibindo dados em cache — ClickHouse temporariamente indisponível.</span>
          </div>
        )}
        {summError && summaryAgg.length === 0 ? (
          <div className="rounded-md border border-dashed border-orange-300 p-4 text-xs text-orange-600 text-center space-y-1">
            <AlertTriangle className="h-5 w-5 mx-auto" />
            <p>Analytics indisponível — banco de eventos temporariamente offline.</p>
          </div>
        ) : summLoading && !summary ? (
          <div className="space-y-1.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : summaryAgg.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground text-center">
            {`Sem dados no período ${isLive ? "(últimos 5 min)" : `(últimos ${windowMinutes} min)`}. Gere decisões com flags ativas para ver métricas.`}
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="grid grid-cols-[1fr_56px_90px_80px_90px] gap-2 text-xs text-muted-foreground px-2 pb-1 border-b">
              <span>Flag</span>
              <span>Status</span>
              <span className="text-right">Clientes</span>
              <span className="text-right">Conversão</span>
              <span className="text-right">Valores</span>
            </div>
            {summaryAgg.map(agg => (
              <div key={agg.flag_key}>
                <button
                  className={`w-full grid grid-cols-[1fr_56px_90px_80px_90px] gap-2 items-center px-2 py-2 rounded text-left text-sm hover:bg-muted/50 transition-colors ${
                    selectedFlag === agg.flag_key ? "bg-muted/80 ring-1 ring-primary/20" : ""
                  }`}
                  onClick={() =>
                    setSelectedFlag(selectedFlag === agg.flag_key ? null : agg.flag_key)
                  }
                >
                  <span className="font-mono text-xs truncate">{agg.flag_key}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs justify-center ${
                      enabledKeys.has(agg.flag_key)
                        ? "text-green-600 border-green-200"
                        : "text-slate-400"
                    }`}
                  >
                    {enabledKeys.has(agg.flag_key) ? "ativa" : "off"}
                  </Badge>
                  <span className="text-right text-xs tabular-nums font-medium">
                    {agg.total_decisions.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-right text-xs tabular-nums">
                    {(agg.conversion_rate * 100).toFixed(1)}%
                  </span>
                  <span className="text-right text-xs text-muted-foreground truncate">
                    {agg.values.map(v => v.flag_value).join(" / ")}
                  </span>
                </button>

                {selectedFlag === agg.flag_key && (
                  detailLoading ? (
                    <div className="mx-2 mb-2 p-4 border rounded-xl space-y-3 bg-muted/20">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-16 rounded bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <FlagDetailInner
                      agg={agg}
                      timelineChartData={timelineChartData}
                      timelineFlagValues={timelineFlagValues}
                      profileChartData={profileChartData}
                      flagValues={flagValues}
                      scenarios={scenarios}
                      mounted={mounted}
                    />
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FlagsPage() {
  const { markDataLoaded } = usePagePerformance("Flags");
  const { data, mutate } = useSWR("flags", () => api.listFlags(), {
    ...SWR_OPTS,
    onSuccess: () => markDataLoaded(),
  });
  const [creating, setCreating] = useState(false);

  const enabled = data?.filter(f => f.enabled).length ?? 0;
  const total = data?.length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Feature Flags</h1>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm"
        >
          <Plus className="h-4 w-4" /> Nova Flag
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-primary">{total}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Total de Flags</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{enabled}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Ativas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-slate-400">{total - enabled}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Desativadas</div>
          </CardContent>
        </Card>
      </div>

      {!data ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <div className="space-y-2">
          {data.map(flag => (
            <FlagCard key={flag.flag_key} flag={flag} onMutate={() => mutate()} />
          ))}
        </div>
      )}

      <FlagAnalyticsPanel flags={data ?? []} />

      {creating && (
        <FlagFormModal
          onSave={() => { setCreating(false); mutate(); }}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}
