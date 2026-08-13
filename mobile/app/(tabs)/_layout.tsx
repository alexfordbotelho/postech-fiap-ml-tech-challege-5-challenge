import { Tabs } from "expo-router";
import { Home, FlaskConical, BarChart3 } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: "#0f172a", borderTopColor: "#334155" },
        tabBarActiveTintColor: "#6366f1",
        tabBarInactiveTintColor: "#64748b",
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: "#f8fafc",
        headerTitleStyle: { fontWeight: "600", fontSize: 15 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Feed",
          tabBarIcon: ({ color }) => <Home size={20} color={color} />,
          headerTitle: "Datathon Bandit",
        }}
      />
      <Tabs.Screen
        name="simulator"
        options={{
          title: "Simulador",
          tabBarIcon: ({ color }) => <FlaskConical size={20} color={color} />,
          headerTitle: "Simulador de Oferta",
        }}
      />
      <Tabs.Screen
        name="metrics"
        options={{
          title: "Métricas",
          tabBarIcon: ({ color }) => <BarChart3 size={20} color={color} />,
          headerTitle: "Métricas de Desempenho",
        }}
      />
    </Tabs>
  );
}
