"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageCircle, X, Send, Loader2, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Mode =
  | "general"
  | "explain"
  | "experiment"
  | "advise"
  | "evaluate"
  | "summarize"
  | "compare"
  | "negotiate";

interface Message {
  role: "user" | "assistant";
  content: string;
  blocked?: boolean;
  trace_id?: string | null;
  feedback?: 1 | -1 | null;
}

interface ClientFeatures {
  age: string;
  job: string;
  balance: string;
  housing: string;
  loan: string;
  education: string;
}

interface FloatingChatProps {
  defaultMode?: Mode;
  contextDecisionId?: string;
  contextExperimentId?: string;
  contextOffer?: string;
}

const MODES_NEEDING_EXPERIMENT: Mode[] = ["experiment", "evaluate"];
const EMPTY_FEATURES: ClientFeatures = {
  age: "",
  job: "",
  balance: "",
  housing: "no",
  loan: "no",
  education: "",
};

export function FloatingChat({
  defaultMode = "general",
  contextDecisionId,
  contextExperimentId,
  contextOffer,
}: FloatingChatProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [experimentId, setExperimentId] = useState(contextExperimentId ?? "");
  const [clientFeatures, setClientFeatures] = useState<ClientFeatures>(EMPTY_FEATURES);
  const [showFeatures, setShowFeatures] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [pendingFeedback, setPendingFeedback] = useState<{
    trace_id: string;
    score: 1 | -1;
    comment: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sync experiment id from props (e.g. when navigating to experiment page)
  useEffect(() => {
    if (contextExperimentId) setExperimentId(contextExperimentId);
  }, [contextExperimentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const question = input.trim();
    if (!question || loading) return;

    // Guards
    if (mode === "explain" && !contextDecisionId) {
      appendAssistant("Selecione uma decisão na tabela de Histórico antes de usar o modo Explicar.");
      setInput("");
      return;
    }
    if (MODES_NEEDING_EXPERIMENT.includes(mode) && !experimentId.trim()) {
      appendAssistant("Informe o ID do experimento no campo acima para usar este modo.");
      setInput("");
      return;
    }

    appendUser(question);
    setInput("");
    setLoading(true);

    try {
      const features = buildFeatures();
      const res = await api.assistantAsk({
        mode,
        question,
        session_id: sessionId,
        decision_id: mode === "explain" && contextDecisionId ? contextDecisionId : undefined,
        experiment_id: MODES_NEEDING_EXPERIMENT.includes(mode) ? experimentId.trim() : undefined,
        offer: mode === "negotiate" && contextOffer ? contextOffer : undefined,
        objection: mode === "negotiate" ? question : undefined,
        client_features: (mode === "advise" && features) ? features : undefined,
      });

      appendAssistant(res.answer, res.guardrail_passed === false, res.trace_id);
    } catch (err) {
      const msg = String(err).includes("503")
        ? "LLM offline. Inicie o Ollama ou configure OPENAI_BASE_URL no .env."
        : `Erro: ${String(err)}`;
      appendAssistant(msg);
    } finally {
      setLoading(false);
    }
  }

  function appendUser(content: string) {
    setMessages((m) => [...m, { role: "user", content }]);
  }

  function appendAssistant(content: string, blocked = false, trace_id?: string | null) {
    setMessages((m) => [...m, { role: "assistant", content, blocked, trace_id, feedback: null }]);
  }

  async function sendFeedback(trace_id: string, score: 1 | -1, comment?: string) {
    setMessages((prev) =>
      prev.map((m) => (m.trace_id === trace_id ? { ...m, feedback: score } : m))
    );
    setPendingFeedback(null);
    try {
      await api.assistantFeedback({ trace_id, score, comment });
    } catch {
      // silently ignore — feedback is best-effort
    }
  }

  function buildFeatures(): Record<string, unknown> | null {
    const f = clientFeatures;
    const hasAny = Object.values(f).some((v) => v !== "" && v !== "no");
    if (!hasAny) return null;
    const result: Record<string, unknown> = {};
    if (f.age) result.age = Number(f.age);
    if (f.job) result.job = f.job;
    if (f.balance) result.balance = Number(f.balance);
    result.housing = f.housing;
    result.loan = f.loan;
    if (f.education) result.education = f.education;
    return result;
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function updateFeature(key: keyof ClientFeatures, value: string) {
    setClientFeatures((f) => ({ ...f, [key]: value }));
  }

  const placeholders: Record<Mode, string> = {
    general: "Pergunte sobre produtos, regras ou experimentos…",
    explain: "O que influenciou esta decisão?",
    experiment: "Explique este experimento e seus resultados…",
    advise: "Qual produto é mais adequado para este perfil?",
    evaluate: "Gere o relatório de avaliação deste experimento…",
    summarize: "Resuma os últimos experimentos…",
    compare: "Qual política está performando melhor?",
    negotiate: "Por que este produto vale o custo?",
  };

  const needsExperiment = MODES_NEEDING_EXPERIMENT.includes(mode);
  const needsFeatures = mode === "advise";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110",
          open && "hidden"
        )}
        title="Assistente Financeiro"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex w-[520px] flex-col rounded-xl border bg-card shadow-2xl">
          {/* ── Header ── */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Assistente Financeiro</span>
            <div className="flex items-center gap-2">
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger className="h-7 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">💬 Geral</SelectItem>
                  <SelectItem value="explain">🔍 Explicar decisão</SelectItem>
                  <SelectItem value="experiment">🧪 Analisar experimento</SelectItem>
                  <SelectItem value="advise">💡 Aconselhamento</SelectItem>
                  <SelectItem value="evaluate">📋 Avaliar experimento</SelectItem>
                  <SelectItem value="summarize">📊 Resumir MLflow</SelectItem>
                  <SelectItem value="compare">⚖️ Comparar políticas</SelectItem>
                  <SelectItem value="negotiate">🤝 Argumentar oferta</SelectItem>
                </SelectContent>
              </Select>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Context inputs (experiment / advise) ── */}
          {(needsExperiment || needsFeatures) && (
            <div className="border-b bg-muted/30 px-3 py-2 space-y-2">
              {needsExperiment && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">ID do experimento</span>
                  <Input
                    value={experimentId}
                    onChange={(e) => setExperimentId(e.target.value)}
                    placeholder="uuid do experimento"
                    className="h-6 text-xs font-mono"
                  />
                </div>
              )}
              {needsFeatures && (
                <div>
                  <button
                    onClick={() => setShowFeatures((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showFeatures ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Perfil do cliente {showFeatures ? "(ocultar)" : "(opcional)"}
                  </button>
                  {showFeatures && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Idade</label>
                        <Input
                          type="number"
                          value={clientFeatures.age}
                          onChange={(e) => updateFeature("age", e.target.value)}
                          placeholder="ex: 35"
                          className="h-6 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Profissão</label>
                        <Input
                          value={clientFeatures.job}
                          onChange={(e) => updateFeature("job", e.target.value)}
                          placeholder="ex: admin"
                          className="h-6 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Saldo (R$)</label>
                        <Input
                          type="number"
                          value={clientFeatures.balance}
                          onChange={(e) => updateFeature("balance", e.target.value)}
                          placeholder="ex: 5000"
                          className="h-6 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Educação</label>
                        <Input
                          value={clientFeatures.education}
                          onChange={(e) => updateFeature("education", e.target.value)}
                          placeholder="ex: university"
                          className="h-6 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Financiamento?</label>
                        <Select
                          value={clientFeatures.housing}
                          onValueChange={(v) => updateFeature("housing", v)}
                        >
                          <SelectTrigger className="h-6 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no">Não</SelectItem>
                            <SelectItem value="yes">Sim</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Empréstimo?</label>
                        <Select
                          value={clientFeatures.loan}
                          onValueChange={(v) => updateFeature("loan", v)}
                        >
                          <SelectTrigger className="h-6 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no">Não</SelectItem>
                            <SelectItem value="yes">Sim</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Messages ── */}
          <div className="flex h-96 flex-col gap-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground">
                {placeholders[mode]}
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[90%] rounded-lg px-3 py-2 text-xs",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : m.blocked
                    ? "bg-destructive/10 text-destructive border border-destructive/30"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                {m.blocked && (
                  <div className="flex items-center gap-1 mb-1 opacity-70">
                    <ShieldAlert className="h-3 w-3" />
                    <span className="text-[10px] font-medium">Fora do escopo</span>
                  </div>
                )}
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                ) : (<>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h2: ({ children }) => (
                        <h2 className="text-xs font-bold mt-3 mb-1 border-b border-border/40 pb-0.5">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-xs font-semibold mt-2 mb-0.5">{children}</h3>
                      ),
                      p: ({ children }) => (
                        <p className="mb-1.5 leading-relaxed">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="mb-1.5 ml-3 list-disc space-y-0.5">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-1.5 ml-3 list-decimal space-y-0.5">{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li className="leading-relaxed">{children}</li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold">{children}</strong>
                      ),
                      code: ({ children }) => (
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{children}</code>
                      ),
                      hr: () => (
                        <hr className="my-2 border-border/40" />
                      ),
                      table: ({ children }) => (
                        <div className="my-2 overflow-x-auto rounded border border-border/40">
                          <table className="w-full text-[10px]">{children}</table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-muted/50">{children}</thead>
                      ),
                      th: ({ children }) => (
                        <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-[9px] text-muted-foreground border-b border-border/40">{children}</th>
                      ),
                      td: ({ children }) => (
                        <td className="px-2 py-1.5 border-b border-border/20 last:border-0">{children}</td>
                      ),
                      tr: ({ children }) => (
                        <tr className="hover:bg-muted/20 transition-colors">{children}</tr>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="my-1 border-l-2 border-primary/50 pl-2 text-muted-foreground italic">{children}</blockquote>
                      ),
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                  {m.trace_id && !m.blocked && (
                    <div className="mt-2 border-t border-border/20 pt-1.5">
                      {m.feedback !== null && m.feedback !== undefined ? (
                        // Feedback já enviado
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-xs", m.feedback === 1 ? "text-green-600" : "text-red-500")}>
                            {m.feedback === 1 ? "👍" : "👎"}
                          </span>
                          <span className="text-[9px] text-muted-foreground">Obrigado pelo feedback!</span>
                        </div>
                      ) : pendingFeedback?.trace_id === m.trace_id ? (
                        // Aguardando comentário
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("text-xs", pendingFeedback.score === 1 ? "text-green-600" : "text-red-500")}>
                              {pendingFeedback.score === 1 ? "👍" : "👎"}
                            </span>
                            <span className="text-[9px] text-muted-foreground">Comentário (opcional)</span>
                            <button
                              onClick={() => setPendingFeedback(null)}
                              className="ml-auto text-[9px] text-muted-foreground hover:text-foreground"
                            >
                              Cancelar
                            </button>
                          </div>
                          <div className="flex gap-1">
                            <Input
                              value={pendingFeedback.comment}
                              onChange={(e) =>
                                setPendingFeedback((p) => p ? { ...p, comment: e.target.value } : p)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  sendFeedback(
                                    pendingFeedback.trace_id,
                                    pendingFeedback.score,
                                    pendingFeedback.comment || undefined
                                  );
                                }
                              }}
                              placeholder="O que achou da resposta?"
                              className="h-6 flex-1 text-[10px]"
                              autoFocus
                            />
                            <button
                              onClick={() =>
                                sendFeedback(
                                  pendingFeedback.trace_id,
                                  pendingFeedback.score,
                                  pendingFeedback.comment || undefined
                                )
                              }
                              className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90"
                            >
                              Enviar
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Botões iniciais
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground">Esta resposta foi útil?</span>
                          <button
                            onClick={() => setPendingFeedback({ trace_id: m.trace_id!, score: 1, comment: "" })}
                            title="Útil"
                            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-green-600 hover:bg-green-500/10"
                          >
                            👍
                          </button>
                          <button
                            onClick={() => setPendingFeedback({ trace_id: m.trace_id!, score: -1, comment: "" })}
                            title="Não útil"
                            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-red-600 hover:bg-red-500/10"
                          >
                            👎
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>)}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Processando…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Input ── */}
          <div className="border-t p-3">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={placeholders[mode]}
                className="min-h-[40px] resize-none text-xs"
                rows={2}
              />
              <Button
                size="icon"
                onClick={send}
                disabled={loading || !input.trim()}
                className="h-10 w-10 shrink-0 self-end"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
