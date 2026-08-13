import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api, type MetricsResponse, POLICY_LABELS } from "../../lib/api";

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: "#1e293b",
        borderRadius: 12,
        padding: 16,
        flex: 1,
        borderWidth: 1,
        borderColor: "#334155",
        gap: 6,
      }}
    >
      <Text style={{ color: "#64748b", fontSize: 11, fontWeight: "600" }}>
        {label}
      </Text>
      <Text
        style={{
          color: accent ?? "#f8fafc",
          fontSize: 22,
          fontWeight: "700",
        }}
      >
        {value}
      </Text>
      {sub && (
        <Text style={{ color: "#475569", fontSize: 11 }}>{sub}</Text>
      )}
    </View>
  );
}

function PolicyRow({ m }: { m: MetricsResponse; }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#1e293b",
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#f8fafc", fontSize: 13, fontWeight: "500" }}>
          {POLICY_LABELS[m.policy] ?? m.policy}
        </Text>
        <Text style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
          {m.total_decisions.toLocaleString("pt-BR")} decisões
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={{ color: "#10b981", fontSize: 13, fontWeight: "600" }}>
          {(m.avg_reward * 100).toFixed(1)}%
        </Text>
        <Text style={{ color: "#475569", fontSize: 10 }}>
          exp {(m.exploration_rate * 100).toFixed(0)}%
        </Text>
      </View>
    </View>
  );
}

export default function MetricsScreen() {
  const [data, setData] = useState<MetricsResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const results = await api.allMetrics();
      setData(results);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator color="#6366f1" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center", padding: 24 }}
      >
        <Text style={{ color: "#f87171", fontSize: 13, textAlign: "center", marginBottom: 16 }}>
          {error}
        </Text>
        <TouchableOpacity
          onPress={() => load()}
          style={{ backgroundColor: "#6366f1", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Tentar novamente</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const totalDecisions = data.reduce((acc, m) => acc + m.total_decisions, 0);
  const champion = data.reduce((best, m) =>
    m.avg_reward > (best?.avg_reward ?? -1) ? m : best, data[0]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor="#6366f1"
          />
        }
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          <KpiCard
            label="DECISÕES TOTAIS"
            value={totalDecisions.toLocaleString("pt-BR")}
            sub="todas as políticas"
          />
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <KpiCard
            label="POLÍTICA CAMPEÃ"
            value={POLICY_LABELS[champion?.policy ?? ""] ?? champion?.policy ?? "—"}
            sub={`avg_reward ${((champion?.avg_reward ?? 0) * 100).toFixed(1)}%`}
            accent="#10b981"
          />
        </View>

        <View
          style={{
            backgroundColor: "#1e293b",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#334155",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#334155",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#94a3b8", fontSize: 12, fontWeight: "600" }}>
              TODAS AS POLÍTICAS
            </Text>
            <Text style={{ color: "#475569", fontSize: 11 }}>avg_reward</Text>
          </View>
          {data
            .slice()
            .sort((a, b) => b.avg_reward - a.avg_reward)
            .map((m) => (
              <PolicyRow key={m.policy} m={m} />
            ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
