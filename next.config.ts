import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Stops the dev server writing generated coding-assistant rule files into
  // the repo root. Project conventions live in CONTRIBUTING.md instead.
  agentRules: false,
  experimental: {
    // The declaration engine runs entirely server-side; keep the client bundle lean.
    optimizePackageImports: ["papaparse"],
  },
};

export default nextConfig;
