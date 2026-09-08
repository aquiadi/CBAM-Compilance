"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Re-runs the mapping for one file through the model.
 *
 * Deliberately a per-file action rather than something that happens on upload:
 * a model call costs money and latency, and the operator should be the one who
 * decides a file is ambiguous enough to be worth it.
 */
export function RemapButton({ datasetId, enabled }: { datasetId: string; enabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setState("running");
    setMessage(null);
    try {
      const response = await fetch("/api/remap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ datasetId }),
      });
      const body = (await response.json()) as { ok: boolean; error?: string; producedBy?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Re-map failed");
      setState("idle");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Re-map failed");
    }
  }

  return (
    <span className="flex items-center gap-2">
      {message ? <span className="text-[10.5px] text-critical">{message}</span> : null}
      <button
        type="button"
        onClick={run}
        disabled={!enabled || state === "running"}
        title={enabled ? undefined : "Set an API key to enable"}
        className="rounded-md border border-line-strong bg-surface-3 px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === "running" ? "Mapping…" : "Re-map with AI"}
      </button>
    </span>
  );
}
