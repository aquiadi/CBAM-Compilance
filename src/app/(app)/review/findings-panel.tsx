"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card, cn, Note, SeverityBadge } from "@/components/ui";

interface PanelFinding {
  code: string;
  severity: "blocker" | "warning" | "info";
  title: string;
  detail: string;
  remedy: string;
  reference?: string;
  activityIds: string[];
  excludable: string[];
  alreadyExcluded: string[];
  acknowledged: boolean;
  acknowledgement: { note: string; by: string; at: string } | null;
}

interface TriageItem {
  code: string;
  priority: number;
  plainEnglish: string;
  likelyCause: string;
  firstStep: string;
  effort: string;
  estimatedImpactT: number;
}

export function FindingsPanel({
  findings,
  aiAvailable,
  canWrite,
}: {
  findings: PanelFinding[];
  aiAvailable: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "blocker" | "warning" | "info">("all");
  const [triage, setTriage] = useState<Record<string, TriageItem>>({});
  const [triageSummary, setTriageSummary] = useState<string | null>(null);
  const [triageState, setTriageState] = useState<"idle" | "running" | "error">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const counts = {
    all: findings.length,
    blocker: findings.filter((f) => f.severity === "blocker").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  const visible = filter === "all" ? findings : findings.filter((f) => f.severity === filter);

  async function runTriage() {
    setTriageState("running");
    try {
      const response = await fetch("/api/triage", { method: "POST" });
      const body = (await response.json()) as {
        ok: boolean;
        summary?: string;
        findings?: { code: string; triage: TriageItem | null }[];
      };
      if (!body.ok) throw new Error("Triage failed");
      const map: Record<string, TriageItem> = {};
      for (const f of body.findings ?? []) if (f.triage) map[f.code] = f.triage;
      setTriage(map);
      setTriageSummary(body.summary ?? null);
      setTriageState("idle");
    } catch {
      setTriageState("error");
    }
  }

  async function post(url: string, body: unknown) {
    setActionError(null);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !json.ok) setActionError(json.error ?? "The change was not saved.");
    router.refresh();
  }

  async function exclude(finding: PanelFinding, restore: boolean) {
    const reason = restore
      ? `Restored after review of ${finding.code}`
      : window.prompt(
          "Why are these records being excluded? The reason is kept in the audit trail.",
          `${finding.code}: ${finding.title}`,
        );
    if (!reason) return;
    setBusy(finding.code + finding.title);
    try {
      await post("/api/workspace/exclusions", {
        activityIds: restore ? finding.alreadyExcluded : finding.excludable,
        reason,
        restore,
      });
    } finally {
      setBusy(null);
    }
  }

  async function acknowledge(finding: PanelFinding, undo: boolean) {
    const note = undo
      ? "Reopened"
      : window.prompt(
          "Why is this acceptable? The note is logged and exported with the verifier pack.",
        );
    if (!note) return;
    setBusy(finding.code + finding.title);
    try {
      await post("/api/workspace/acknowledge", {
        code: finding.code,
        title: finding.title,
        note,
        undo,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 rounded-full border border-line bg-surface p-1">
          {(["all", "blocker", "warning", "info"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13.5px] font-medium capitalize transition-colors",
                filter === key
                  ? "bg-ink text-white"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {key}{" "}
              <span className={cn("tnum ml-0.5", filter === key ? "text-white/70" : "text-muted")}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={runTriage}
          disabled={!aiAvailable || !canWrite || triageState === "running"}
          title={aiAvailable ? undefined : "Set an API key to enable"}
          className="rounded-full border border-line-strong bg-surface px-4 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {triageState === "running" ? "Triaging…" : "Triage with AI"}
        </button>
      </div>

      {triageSummary ? <Note tone="accent">{triageSummary}</Note> : null}
      {actionError ? <Note tone="critical">{actionError}</Note> : null}
      {triageState === "error" ? <Note tone="critical">Triage failed.</Note> : null}

      {visible.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-[14px] text-muted">
            No {filter === "all" ? "" : filter} findings.
          </p>
        </Card>
      ) : null}

      <div className="space-y-4">
        {visible.map((f, i) => {
          const key = f.code + f.title;
          const t = triage[f.code];
          const excluded = f.alreadyExcluded.length > 0;
          return (
            <div
              key={key}
              data-tour={i === 0 ? "findings" : undefined}
              className={cn(
                "rounded-2xl border bg-surface p-6 shadow-[var(--shadow-card)]",
                f.severity === "blocker" ? "border-critical/30" : "border-line",
                (excluded || f.acknowledged) && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <SeverityBadge severity={f.severity} />
                  <div className="min-w-0">
                    <h3 className="text-[14.5px] font-semibold leading-tight text-ink">
                      {f.title}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                      <span className="font-mono">{f.code}</span>
                      {f.reference ? <span>· {f.reference}</span> : null}
                      {f.activityIds.length > 0 ? (
                        <span>· {f.activityIds.length} records</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {canWrite && f.severity !== "blocker" ? (
                    <button
                      type="button"
                      onClick={() => acknowledge(f, f.acknowledged)}
                      disabled={busy === key}
                      className="shrink-0 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
                    >
                      {f.acknowledged ? "Reopen" : "Accept with note"}
                    </button>
                  ) : null}
                  {canWrite && (f.excludable.length > 0 || excluded) ? (
                    <button
                      type="button"
                      onClick={() => exclude(f, excluded)}
                      disabled={busy === key}
                      className={cn(
                        "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40",
                        excluded
                          ? "border-line-strong bg-surface text-ink-2 hover:text-ink"
                          : "border-critical bg-critical text-white hover:opacity-90",
                      )}
                    >
                      {busy === key
                        ? "…"
                        : excluded
                          ? "Restore records"
                          : `Exclude ${f.excludable.length} record${f.excludable.length > 1 ? "s" : ""}`}
                    </button>
                  ) : null}
                </div>
              </div>

              <p className="mt-3 text-[13.5px] leading-[1.6] text-ink-2">{f.detail}</p>

              <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[13.5px] leading-[1.6] text-ink-2">
                <span className="font-medium text-ink">What to do: </span>
                {f.remedy}
              </div>

              {t ? (
                <div className="mt-3 rounded-lg border border-accent/25 bg-accent/[0.06] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone="accent" icon={<span aria-hidden>✦</span>}>
                      Triage · priority {t.priority}
                    </Badge>
                    <span className="text-[12px] text-muted">
                      {t.effort} of work
                      {t.estimatedImpactT > 0
                        ? ` · ~${t.estimatedImpactT.toLocaleString("en-IN")} tCO₂e at stake`
                        : ""}
                    </span>
                  </div>
                  <p className="text-[13.5px] leading-[1.6] text-ink">{t.plainEnglish}</p>
                  <p className="mt-1.5 text-[13px] leading-[1.55] text-ink-2">
                    <span className="text-muted">Likely cause — </span>
                    {t.likelyCause}
                  </p>
                  <p className="mt-1 text-[13px] leading-[1.55] text-ink-2">
                    <span className="text-muted">Start here — </span>
                    {t.firstStep}
                  </p>
                </div>
              ) : null}

              {f.acknowledgement ? (
                <p className="mt-3 text-[12.5px] text-ink-2">
                  <span className="text-good">Accepted</span> by {f.acknowledgement.by} on{" "}
                  {f.acknowledgement.at.slice(0, 10)}: {f.acknowledgement.note}
                </p>
              ) : null}

              {excluded ? (
                <p className="mt-3 text-[12.5px] text-warning">
                  {f.alreadyExcluded.length} record{f.alreadyExcluded.length > 1 ? "s" : ""}{" "}
                  excluded from the calculation. They remain in the audit trail with this finding as
                  the reason.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
