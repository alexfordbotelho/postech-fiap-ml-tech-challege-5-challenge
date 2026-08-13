"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { preload, type Key } from "swr";
import {
  CreditCard,
  ExternalLink,
  FlaskConical,
  Lightbulb,
  Flag,
  Beaker,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type PrefetchEntry = { key: Key; fn: () => Promise<unknown> };

const PREFETCH_MAP: Record<string, PrefetchEntry[]> = {
  "/": [
    { key: "all-metrics",     fn: api.allMetrics },
    { key: "channel-metrics", fn: api.channelMetrics },
  ],
  "/flags":       [{ key: "flags",       fn: api.listFlags }],
  "/experiments": [{ key: "experiments", fn: api.listExperiments }],
};

function prefetchRoute(href: string) {
  const entries = PREFETCH_MAP[href] ?? [];
  for (const { key, fn } of entries) {
    preload(key, fn);
  }
}

const NAV_ITEMS = [
  { href: "/",            label: "Insight",        icon: Lightbulb },
  { href: "/experiments", label: "Experimentos",  icon: Beaker },
  { href: "/flags",       label: "Feature Flags", icon: Flag },
  { href: "/simulator",   label: "Simulador",     icon: FlaskConical },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-sm font-bold tracking-tight text-primary">
          Datathon Bandit
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onMouseEnter={() => prefetchRoute(href)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
        <a
          href="http://localhost:3000"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors mt-1 border-t pt-3"
        >
          <CreditCard className="h-4 w-4" />
          Produto
          <ExternalLink className="h-3 w-3 ml-auto" />
        </a>
      </nav>
      <div className="border-t p-3 text-xs text-muted-foreground">
        7-MLET Datathon &mdash; FIAP
      </div>
    </aside>
  );
}
