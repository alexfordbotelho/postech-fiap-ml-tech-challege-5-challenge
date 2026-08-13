"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const WS_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8001/ws")
    : "";

const MAX_EVENTS = 20;
const RECONNECT_DELAY_MS = 3000;

export interface LiveEvent {
  event_type: "decision_created" | "reward_received";
  decision_id: string;
  arm_selected?: string;
  policy_name?: string;
  segment?: string;
  channel?: string;
  is_exploration?: boolean;
  reward?: number;
  timestamp: number;
}

export function useWebSocket() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!WS_URL) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as Omit<LiveEvent, "timestamp">;
        const event: LiveEvent = { ...data, timestamp: Date.now() };
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      reconnectRef.current && clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { events, connected };
}
