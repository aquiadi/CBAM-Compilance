/**
 * Serves the standalone production build the way the container does.
 *
 *   npm run build && npm run start:standalone
 *
 * Next writes a self-contained server to .next/standalone but leaves the static
 * assets and public/ beside it; the Dockerfile copies them in, and so does this.
 * The server runs from its own directory, so a relative CARBONPASS_DATA_DIR is
 * resolved against the repository root first to keep the data where `npm run
 * dev` keeps it.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) {
  console.error("No standalone build found. Run `npm run build` first (not on Vercel).");
  process.exit(1);
}
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
}

const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: process.env.PORT ?? "3000",
  // Next's server binds to $HOSTNAME, which many shells and CI runners already
  // set to the machine name; bind every interface explicitly instead.
  HOSTNAME: "0.0.0.0",
  CARBONPASS_DATA_DIR: resolve(root, process.env.CARBONPASS_DATA_DIR || ".data"),
};
const server = spawn(process.execPath, ["server.js"], { cwd: standalone, env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
