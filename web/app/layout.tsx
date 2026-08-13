import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Datathon Bandit — Plataforma Adaptativa de Ofertas",
  description: "Multi-armed bandit adaptive offer platform — 7-MLET FIAP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
