import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CarbonPass — CBAM compliance for Indian exporters",
  description:
    "Turns plant production data into a verifiable CBAM emissions report: the Commission's benchmarks and default values built in, every figure traceable to a source row.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
