import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emits a self-contained server bundle with only the packages actually
  // reached at runtime, which is what keeps the container image small.
  output: "standalone",
  // Stops the dev server writing generated coding-assistant rule files into
  // the repo root. Project conventions live in CONTRIBUTING.md instead.
  agentRules: false,
  experimental: {
    // The declaration engine runs entirely server-side; keep the client bundle lean.
    optimizePackageImports: ["papaparse"],
  },
};

export default nextConfig;
