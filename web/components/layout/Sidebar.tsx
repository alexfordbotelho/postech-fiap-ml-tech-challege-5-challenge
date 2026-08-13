"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { preload, type Key } from "swr";
import {
  Activity,
  ArrowUpRight,
  Beaker,
  CreditCard,
  Flag,
  FlaskConical,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type PrefetchEntry = { key: Key; fn: () => Promise<unknown> };

const PREFETCH_MAP: Record<string, PrefetchEntry[]> = {
  "/": [
    { key: "all-metrics", fn: api.allMetrics },
    { key: "channel-metrics", fn: api.channelMetrics },
  ],
  "/flags": [{ key: "flags", fn: api.listFlags }],
  "/experiments": [{ key: "experiments", fn: api.listExperiments }],
};

function prefetchRoute(href: string) {
  for (const { key, fn } of PREFETCH_MAP[href] ?? []) preload(key, fn);
}

const NAV_ITEMS = [
  { href: "/", label: "Insights", shortLabel: "Insights", icon: Lightbulb },
  { href: "/experiments", label: "Experimentos", shortLabel: "Experimentos", icon: Beaker },
  { href: "/flags", label: "Feature Flags", shortLabel: "Flags", icon: Flag },
  { href: "/simulator", label: "Simulador", shortLabel: "Simular", icon: FlaskConical },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <span className="absolute inset-x-2 top-2 h-px bg-primary/70" />
        <Activity className="h-5 w-5 text-primary" strokeWidth={2.2} />
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold tracking-[-0.03em] text-foreground">
            Adapta<span className="text-primary">Offer</span>
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Intelligence
          </p>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-[100dvh] w-[272px] shrink-0 flex-col border-r border-white/[0.06] bg-[#090b10]/95 backdrop-blur-2xl md:flex">
      <div className="flex h-20 items-center border-b border-white/[0.06] px-5">
        <BrandMark />
      </div>

      <nav className="flex flex-1 flex-col px-3 py-5">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60">
          Workspace
        </p>
        <div className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onMouseEnter={() => prefetchRoute(href)}
                className={cn(
                  "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-all duration-200",
                  active
                    ? "border border-primary/15 bg-primary/[0.09] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                    active ? "bg-primary/15" : "bg-white/[0.03] group-hover:bg-white/[0.06]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto pt-5">
          <a
            href="http://localhost:3000"
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.05] to-white/[0.015] p-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:from-primary/[0.08]"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CreditCard className="h-4 w-4" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <p className="text-sm font-bold">Abrir experiência</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Visualize as ofertas como cliente.
            </p>
          </a>
        </div>
      </nav>

      <div className="border-t border-white/[0.06] px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-foreground/80">7-MLET · FIAP</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Adaptive decision engine</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        </div>
      </div>
    </aside>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <header className="z-40 shrink-0 border-b border-white/[0.07] bg-[#090b10]/95 backdrop-blur-2xl md:hidden">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <BrandMark compact />
          <div>
            <p className="text-sm font-extrabold tracking-tight">Adapta<span className="text-primary">Offer</span></p>
            <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Intelligence</p>
          </div>
        </div>
        <a
          href="http://localhost:3000"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir experiência do cliente"
          className="flex h-9 items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.08] px-3 text-xs font-bold text-primary"
        >
          <CreditCard className="h-4 w-4" />
          Produto
        </a>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
        {NAV_ITEMS.map(({ href, shortLabel, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onMouseEnter={() => prefetchRoute(href)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors",
                active
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {shortLabel}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
