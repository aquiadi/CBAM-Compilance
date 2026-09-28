import type { NextConfig } from "next";

/**
 * Security headers on every response. The CSP allows inline scripts and styles
 * because Next's runtime and the app's charts use them; everything else is
 * same-origin only, and the app can never be framed.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const onVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A self-contained server bundle for the container image (Railway, Docker).
  // Vercel builds its own output, so the standalone step is skipped there.
  output: onVercel ? undefined : "standalone",
  // Stops the dev server writing generated coding-assistant rule files into
  // the repo root. Project conventions live in CONTRIBUTING.md instead.
  agentRules: false,
  // Loaded with Node's own require at runtime: PGlite ships WebAssembly and a
  // data file it locates relative to itself, and exceljs pulls in Node streams.
  serverExternalPackages: ["@electric-sql/pglite", "exceljs"],
  outputFileTracingIncludes: {
    // Creating the demo workspace reads the demo files from disk.
    "/api/workspaces": ["./data/demo/**/*"],
    // The embedded database's WebAssembly and data files.
    ...(onVercel ? {} : { "/**": ["./node_modules/@electric-sql/pglite/dist/**/*"] }),
  },
  // Vercel always runs on an external Postgres (src/lib/db refuses to start the
  // embedded one there), so its functions are spared PGlite's 26 MB.
  outputFileTracingExcludes: onVercel
    ? { "/**": ["./node_modules/@electric-sql/pglite/**/*"] }
    : undefined,
  experimental: {
    optimizePackageImports: ["papaparse"],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
