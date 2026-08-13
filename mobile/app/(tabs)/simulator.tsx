import { useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api, type DecideResponse, ARM_LABELS, POLICY_LABELS, POLICIES } from "../../lib/api";

const SEGMENTS = ["young", "mid_low_risk", "mid_indebted", "senior_high_edu", "senior", "default"];
const SEGMENT_LABELS: Record<string, string> = {
  young: "Jovem",
  mid_low_risk: "Médio Baixo Risco",
  mid_indebted: "Médio Endividado",
  senior_high_edu: "Sênior Alta Edu.",
  senior: "Sênior",
  default: "Padrão",
};
const CHANNELS = ["web", "mobile", "email", "call_center"];

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: selected ? "#6366f1" : "#1e293b",
        borderWidth: 1,
        borderColor: selected ? "#6366f1" : "#334155",
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          color: selected ? "#fff" : "#94a3b8",
          fontSize: 12,
          fontWeight: selected ? "600" : "400",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function SimulatorScreen() {
  const [segment, setSegment] = useState("young");
  const [channel, setChannel] = useState("mobile");
  const [policy, setPolicy] = useState<string>("contextual_thompson");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DecideResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function simulate() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.decide(segment, channel, policy);
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View>
          <Text style={{ color: "#94a3b8", fontSize: 12, marginBottom: 8 }}>
            SEGMENTO
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {SEGMENTS.map((s) => (
              <Chip
                key={s}
                label={SEGMENT_LABELS[s] ?? s}
                selected={segment === s}
                onPress={() => setSegment(s)}
              />
            ))}
          </View>
        </View>

        <View>
          <Text style={{ color: "#94a3b8", fontSize: 12, marginBottom: 8 }}>
            CANAL
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {CHANNELS.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={channel === c}
                onPress={() => setChannel(c)}
              />
            ))}
          </View>
        </View>

        <View>
          <Text style={{ color: "#94a3b8", fontSize: 12, marginBottom: 8 }}>
            POLÍTICA
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {POLICIES.map((p) => (
              <Chip
                key={p}
                label={POLICY_LABELS[p] ?? p}
                selected={policy === p}
                onPress={() => setPolicy(p)}
              />
            ))}
          </View>
        </View>

        <TouchableOpacity
          onPress={simulate}
          disabled={loading}
          style={{
            backgroundColor: "#6366f1",
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
              Simular Oferta
            </Text>
          )}
        </TouchableOpacity>

        {error && (
          <View
            style={{
              backgroundColor: "#ef444420",
              borderRadius: 8,
              padding: 12,
              borderWidth: 1,
              borderColor: "#ef444440",
            }}
          >
            <Text style={{ color: "#f87171", fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {result && (
          <View
            style={{
              backgroundColor: "#1e293b",
              borderRadius: 12,
              padding: 16,
              gap: 10,
              borderWidth: 1,
              borderColor: "#334155",
            }}
          >
            <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "600" }}>
              OFERTA RECOMENDADA
            </Text>
            <Text style={{ color: "#f8fafc", fontSize: 22, fontWeight: "700" }}>
              {ARM_LABELS[result.offer_id] ?? result.offer_id}
            </Text>

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <View
                style={{
                  backgroundColor: "#334155",
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: "#94a3b8", fontSize: 11 }}>
                  {POLICY_LABELS[result.policy] ?? result.policy}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: "#334155",
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: "#94a3b8", fontSize: 11 }}>
                  {result.segment}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: result.is_exploration ? "#854d0e40" : "#15803d40",
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderWidth: 1,
                  borderColor: result.is_exploration ? "#854d0e80" : "#15803d80",
                }}
              >
                <Text
                  style={{
                    color: result.is_exploration ? "#fbbf24" : "#34d399",
                    fontSize: 11,
                  }}
                >
                  {result.is_exploration ? "Exploração" : "Exploitação"}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: "#334155",
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: "#94a3b8", fontSize: 11 }}>
                  Confiança: {(result.confidence * 100).toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
