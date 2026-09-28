import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource-variable/newsreader/opsz.css";
import "./globals.css";
import { THEME_BOOT_SCRIPT, THEME_COLORS } from "@/lib/theme";

export const metadata: Metadata = {
  title: "CarbonPass — CBAM emissions data for exporters to the EU",
  description:
    "Turns plant production data into a verifiable CBAM emissions report: the Commission's benchmarks and default values built in, every figure traceable to a source row.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by the boot script before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
