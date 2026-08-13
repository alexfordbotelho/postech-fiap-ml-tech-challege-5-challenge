"use client";

import { SWRConfig } from "swr";
import { Sidebar } from "@/components/layout/Sidebar";
import { FloatingChat } from "@/components/layout/FloatingChat";
import { Toaster } from "@/components/ui/toaster";
import { PerformanceOverlay } from "@/components/layout/PerformanceOverlay";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SWRConfig
      value={{
        // Keep data across page navigations so content renders instantly on revisit
        keepPreviousData: true,
        // Deduplicate requests within 2s (default) — enough to prevent burst mounts
        // without blocking live-mode polls that fire every 5s
        dedupingInterval: 2_000,
        // Don't refetch just because the tab regained focus
        revalidateOnFocus: false,
        // On error, retry up to 2x with exponential backoff (not infinite)
        errorRetryCount: 2,
      }}
    >
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <FloatingChat />
      <Toaster />
      <PerformanceOverlay />
    </SWRConfig>
  );
}
