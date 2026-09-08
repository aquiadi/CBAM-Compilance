import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "CarbonPass AI — CBAM compliance for Indian exporters",
  description:
    "Turns a mess of production data into a defensible CBAM emissions declaration. Deterministic engine, AI at the edges, every figure traceable to a source row.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
