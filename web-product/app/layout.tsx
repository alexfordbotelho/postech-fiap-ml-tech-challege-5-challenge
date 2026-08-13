import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import Link from "next/link";
import { ArrowUpRight, BarChart3, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "AdaptaOffer — Investimentos Inteligentes",
  description: "Plataforma adaptativa de produtos de investimento personalizada por IA",
};

function AOLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* A — geometric strokes */}
      <path
        d="M1 18 L7 2 L13 18"
        stroke="#FFD100"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
        fill="none"
      />
      <line
        x1="3.2"
        y1="12"
        x2="10.8"
        y2="12"
        stroke="#FFD100"
        strokeWidth="2"
        strokeLinecap="square"
      />
      {/* O — rectangular ring (tech aesthetic) */}
      <rect
        x="16"
        y="2"
        width="11"
        height="16"
        rx="2"
        stroke="#FFD100"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-50 shrink-0 border-b border-white/[0.07] bg-[#070706]/85 px-4 backdrop-blur-2xl sm:px-6">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between">
            <Link href="/" className="group flex items-center gap-3" aria-label="AdaptaOffer — início">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#FFD100]/20 bg-[#FFD100]/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform group-hover:-rotate-2 group-hover:scale-105">
                <span className="absolute inset-x-2 top-2 h-px bg-[#FFD100]/60" />
                <AOLogo className="h-[17px] w-auto" />
              </div>
              <div>
                <p className="text-sm font-extrabold tracking-[-0.03em] text-white">
                  Adapta<span className="text-[#FFD100]">Offer</span>
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#777]">
                  Investimentos
                </p>
              </div>
            </Link>

            <nav className="flex items-center gap-1" aria-label="Navegação principal">
              <Link href="/" className="hidden rounded-xl px-3 py-2 text-sm font-medium text-[#999] transition-colors hover:bg-white/[0.05] hover:text-white sm:inline-flex">
                Início
              </Link>
              <Link href="/produtos" className="rounded-xl px-3 py-2 text-sm font-medium text-[#999] transition-colors hover:bg-white/[0.05] hover:text-white">
                Produtos
              </Link>
              <span className="mx-2 hidden h-5 w-px bg-[#282828] sm:block" />
              <a
                href="http://localhost:3091"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-semibold text-[#AAA] transition-all hover:border-[#FFD100]/25 hover:bg-[#FFD100]/[0.06] hover:text-[#FFD100]"
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir painel de inteligência"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Painel</span>
                <ArrowUpRight className="hidden h-3 w-3 md:block" />
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-white/[0.06] bg-[#070706] px-6 py-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#FFD100]/15 bg-[#FFD100]/[0.08]">
                <AOLogo className="h-[11px] w-auto" />
              </div>
              <span className="text-xs font-semibold text-white/60">AdaptaOffer</span>
            </div>
            <p className="flex items-center gap-2 text-center text-xs text-[#777]">
              <ShieldCheck className="hidden h-3.5 w-3.5 text-[#FFD100] sm:block" />
              Demonstração LGPD-compliant · Dados fictícios · Não constitui oferta real
            </p>
            <p className="text-xs text-[#666]">© 2026</p>
          </div>
        </footer>

        <Toaster />
      </body>
    </html>
  );
}
