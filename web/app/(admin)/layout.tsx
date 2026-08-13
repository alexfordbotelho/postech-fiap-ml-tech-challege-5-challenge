"use client";

import { SWRConfig } from "swr";
import { MobileNavigation, Sidebar } from "@/components/layout/Sidebar";
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
      <div className="flex h-[100dvh] overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileNavigation />
          <main className="admin-canvas flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1480px] p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24">
              {children}
            </div>
          </main>
        </div>
      </div>
      <FloatingChat />
      <Toaster />
      <PerformanceOverlay />
    </SWRConfig>
  );
}
