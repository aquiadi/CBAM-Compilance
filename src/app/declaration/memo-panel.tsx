"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

/**
 * The methodology memo.
 *
 * Streamed, because it runs to a thousand words and a user watching a spinner
 * for forty seconds concludes the product is broken. Without an API key the
 * endpoint returns the deterministic memo instead, which says the same things
 * less gracefully.
 */
export function MemoPanel({ aiAvailable }: { aiAvailable: boolean }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "streaming" | "done" | "error">("idle");

  async function generate() {
    setState("streaming");
    setText("");
    try {
      const response = await fetch("/api/memo", { method: "POST" });
      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        setText(buffer);
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <Card
      title="Methodology memo"
      subtitle="What a verifier reads first: the boundary, the method, the factors, and the limitations stated plainly."
      actions={
        <button
          type="button"
          onClick={generate}
          disabled={state === "streaming"}
          className="rounded-md border border-line-strong bg-surface-3 px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink disabled:opacity-40"
        >
          {state === "streaming" ? "Writing…" : text ? "Regenerate" : "Generate memo"}
        </button>
      }
    >
      {state === "idle" && !text ? (
        <p className="text-[12px] leading-[1.6] text-muted">
          {aiAvailable
            ? "Generates from the computed declaration, not the raw data — the model cannot recompute a figure, only describe the ones the engine produced."
            : "No API key is set, so this returns the deterministic memo. It carries the same content, written by template rather than by the model."}
        </p>
      ) : null}

      {state === "error" ? (
        <p className="text-[12px] text-critical">Memo generation failed.</p>
      ) : null}

      {text ? (
        <article className="max-h-[560px] overflow-y-auto whitespace-pre-wrap font-mono text-[11.5px] leading-[1.7] text-ink-2">
          {text}
          {state === "streaming" ? (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />
          ) : null}
        </article>
      ) : null}
    </Card>
  );
}
