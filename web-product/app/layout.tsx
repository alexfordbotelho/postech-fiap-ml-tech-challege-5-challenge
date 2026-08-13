import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import Link from "next/link";

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

        {/* ── HEADER ── */}
        <header className="sticky top-0 z-50 border-b border-[#1A1A1A] bg-[#060606]/92 backdrop-blur-xl px-6 py-4 flex items-center justify-between shrink-0">
          <Link href="/" className="flex items-center gap-3 group">
            {/* AO geometric logo mark */}
            <div className="relative h-8 w-8 flex items-center justify-center rounded-[6px] bg-[#FFD100]/8 border border-[#FFD100]/15 shrink-0">
              <AOLogo className="h-[16px] w-auto" />
            </div>
            <span className="text-sm font-bold tracking-tight text-white">
              Adapta<span className="text-[#FFD100]">Offer</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className="text-sm text-[#555] hover:text-white transition-colors px-3 py-1.5 rounded hover:bg-white/5"
            >
              Início
            </Link>
            <Link
              href="/produtos"
              className="text-sm text-[#555] hover:text-white transition-colors px-3 py-1.5 rounded hover:bg-white/5"
            >
              Produtos
            </Link>
            <span className="w-px h-4 bg-[#242424] mx-2" />
            <a
              href="http://localhost:3091"
              className="text-xs text-[#3A3A3A] hover:text-[#555] transition-colors px-2 py-1.5"
              target="_blank"
              rel="noreferrer"
            >
              Painel →
            </a>
          </nav>
        </header>

        <main className="flex-1">{children}</main>

        {/* ── FOOTER ── */}
        <footer className="border-t border-[#141414] px-6 py-6">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 flex items-center justify-center rounded-[5px] bg-[#FFD100]/8 border border-[#FFD100]/12">
                <AOLogo className="h-[11px] w-auto" />
              </div>
              <span className="text-xs font-semibold text-white/40">AdaptaOffer</span>
            </div>
            <p className="text-xs text-[#333] text-center">
              Demonstração LGPD-compliant · Dados fictícios · Não constitui oferta real de investimento
            </p>
            <p className="text-xs text-[#2E2E2E]">© 2025</p>
          </div>
        </footer>

        <Toaster />
      </body>
    </html>
  );
}
