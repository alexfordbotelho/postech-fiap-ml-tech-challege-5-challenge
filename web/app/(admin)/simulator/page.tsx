"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { DecideResponse, ExplainResponse } from "@/lib/types";
import { POLICIES, POLICY_LABELS } from "@/lib/types";
import { OfferResult } from "@/components/simulator/OfferResult";
import { ExplainPanel } from "@/components/simulator/ExplainPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, SlidersHorizontal, ThumbsDown, ThumbsUp } from "lucide-react";

const EDUCATION_OPTIONS = ["primary", "secondary", "tertiary", "unknown"];
const HOUSING_OPTIONS = ["yes", "no"];
const LOAN_OPTIONS = ["yes", "no"];
const CHANNEL_OPTIONS = ["web", "mobile", "email", "call_center"];

export default function SimulatorPage() {
  const { toast } = useToast();

  const [age, setAge] = useState("35");
  const [education, setEducation] = useState("secondary");
  const [balance, setBalance] = useState("1000");
  const [housing, setHousing] = useState("no");
  const [loan, setLoan] = useState("no");
  const [channel, setChannel] = useState("web");
  const [policy, setPolicy] = useState("contextual_thompson");

  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<DecideResponse | null>(null);
  const [explain, setExplain] = useState<ExplainResponse | null>(null);
  const [rewardSent, setRewardSent] = useState(false);

  async function simulate() {
    setLoading(true);
    setDecision(null);
    setExplain(null);
    setRewardSent(false);
    try {
      const dec = await api.decide({
        features: {
          age: parseInt(age),
          education,
          balance: parseInt(balance),
          housing,
          loan,
        },
        policy,
        channel,
      });
      setDecision(dec);

      const exp = await api.explain(dec.decision_id);
      setExplain(exp);
    } catch (err) {
      toast({
        title: "Erro ao simular",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function sendReward(reward: number) {
    if (!decision || rewardSent) return;
    try {
      await api.reward({ decision_id: decision.decision_id, reward });
      setRewardSent(true);
      toast({
        title: reward > 0 ? "Reward positivo enviado" : "Reward negativo enviado",
        description: `Bandit atualizado para o braço: ${decision.offer_id}`,
      });
    } catch (err) {
      toast({
        title: "Erro ao enviar reward",
        description: String(err),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Decision sandbox
        </div>
        <h1 className="text-3xl font-black sm:text-4xl">Simulador de Oferta</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Configure o perfil do cliente e veja qual oferta o bandit recomenda
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Perfil do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Idade</Label>
                <Input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  min={18}
                  max={95}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Saldo (R$)</Label>
                <Input
                  type="number"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Educação</Label>
              <Select value={education} onValueChange={setEducation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDUCATION_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Financiamento imóvel</Label>
                <Select value={housing} onValueChange={setHousing}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUSING_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Empréstimo ativo</Label>
                <Select value={loan} onValueChange={setLoan}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOAN_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Canal</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Política</Label>
                <Select value={policy} onValueChange={setPolicy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {POLICY_LABELS[p] ?? p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="w-full" onClick={simulate} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simular Oferta
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {loading && <Skeleton className="h-48" />}

          {decision && !loading && (
            <OfferResult decision={decision} />
          )}

          {decision && !loading && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1 gap-2 border-green-600 text-green-400 hover:bg-green-600/10"
                onClick={() => sendReward(1.0)}
                disabled={rewardSent}
              >
                <ThumbsUp className="h-4 w-4" />
                Aceito (reward 1.0)
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 border-red-600 text-red-400 hover:bg-red-600/10"
                onClick={() => sendReward(0.0)}
                disabled={rewardSent}
              >
                <ThumbsDown className="h-4 w-4" />
                Recusado (reward 0.0)
              </Button>
            </div>
          )}

          {explain && !loading && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Explicação do Bandit</CardTitle>
              </CardHeader>
              <CardContent>
                <ExplainPanel explain={explain} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
