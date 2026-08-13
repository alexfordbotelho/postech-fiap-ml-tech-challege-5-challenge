"use client";

import { useState, useEffect } from "react";

export type UserSegment = "young" | "mid_indebted" | "senior_high_edu" | "senior" | "mid_low_risk" | "default";
export type UserChannel = "web" | "mobile";

export interface DemographicFeatures extends Record<string, unknown> {
  age: number;
  education: string;
  housing: string;
  loan: string;
  balance: number;
}

export interface UserContext extends Record<string, unknown> {
  segment: UserSegment;
  channel: UserChannel;
  features: DemographicFeatures;
}

// Mirrors Python classify_segment logic so client-side rule evaluation matches server
const USER_PROFILES: Array<{ features: DemographicFeatures; segment: UserSegment }> = [
  // young (age < 30) → cta_button_color = #22C55E
  { segment: "young", features: { age: 22, education: "university.degree", housing: "no", loan: "no", balance: 500 } },
  { segment: "young", features: { age: 25, education: "secondary", housing: "no", loan: "no", balance: 150 } },
  // mid_indebted (30-44, housing=yes, loan=yes) → cta_button_color = #22C55E
  { segment: "mid_indebted", features: { age: 35, education: "secondary", housing: "yes", loan: "yes", balance: 700 } },
  { segment: "mid_indebted", features: { age: 40, education: "primary", housing: "yes", loan: "yes", balance: 400 } },
  // senior_high_edu (45+, high edu) → cta_button_color = #FFD100
  { segment: "senior_high_edu", features: { age: 52, education: "university.degree", housing: "yes", loan: "no", balance: 5000 } },
  { segment: "senior_high_edu", features: { age: 60, education: "tertiary", housing: "no", loan: "no", balance: 8200 } },
  // senior (45+, low edu) → cta_button_color = #FFD100
  { segment: "senior", features: { age: 55, education: "secondary", housing: "yes", loan: "no", balance: 2000 } },
  { segment: "senior", features: { age: 63, education: "primary", housing: "no", loan: "no", balance: 1200 } },
];

const CHANNELS: UserChannel[] = ["web", "mobile"];
const SESSION_KEY = "datathon_user_context";

function createContext(): UserContext {
  const profile = USER_PROFILES[Math.floor(Math.random() * USER_PROFILES.length)];
  return {
    segment: profile.segment,
    channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)],
    features: profile.features,
  };
}

function loadContext(): UserContext {
  if (typeof window === "undefined") return { segment: "young", channel: "web", features: USER_PROFILES[0].features };
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return JSON.parse(stored) as UserContext;
  } catch {}
  const ctx = createContext();
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(ctx)); } catch {}
  return ctx;
}

export function useUserContext() {
  const [context, setContext] = useState<UserContext>({
    segment: "young",
    channel: "web",
    features: USER_PROFILES[0].features,
  });

  useEffect(() => {
    setContext(loadContext());
  }, []);

  function randomize() {
    const ctx = createContext();
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(ctx)); } catch {}
    setContext(ctx);
  }

  return { context, randomize };
}
