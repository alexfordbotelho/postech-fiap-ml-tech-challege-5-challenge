import {
  FlatList,
  SafeAreaView,
  Text,
  View,
} from "react-native";
import { useWebSocket, type LiveEvent } from "../../hooks/useWebSocket";
import { ARM_LABELS, POLICY_LABELS } from "../../lib/api";

function EventRow({ item }: { item: LiveEvent }) {
  const arm = ARM_LABELS[item.arm_selected ?? ""] ?? item.arm_selected ?? "—";
  const policy = POLICY_LABELS[item.policy_name ?? ""] ?? item.policy_name ?? "—";
  const time = new Date(item.timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#334155",
        gap: 10,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor:
            item.event_type === "reward_received" ? "#10b981" : "#6366f1",
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#f8fafc", fontSize: 13, fontWeight: "500" }}>
          {arm}
        </Text>
        <Text style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
          {item.segment ?? "—"} · {policy}
        </Text>
      </View>
      {item.event_type === "reward_received" && (
        <View
          style={{
            backgroundColor: "#10b981",
            borderRadius: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 10 }}>+{item.reward}</Text>
        </View>
      )}
      <Text style={{ color: "#475569", fontSize: 10 }}>{time}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { events, connected } = useWebSocket();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: "#334155",
          gap: 8,
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: connected ? "#10b981" : "#475569",
          }}
        />
        <Text style={{ color: "#94a3b8", fontSize: 12 }}>
          {connected ? "Conectado — decisões em tempo real" : "Reconectando…"}
        </Text>
        <Text
          style={{ color: "#475569", fontSize: 11, marginLeft: "auto" as const }}
        >
          {events.length} eventos
        </Text>
      </View>

      {events.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#475569", fontSize: 14 }}>
            Aguardando eventos…
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item, i) => `${item.decision_id}-${i}`}
          renderItem={({ item }) => <EventRow item={item} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
