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
}: {
  findings: PanelFinding[];
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "blocker" | "warning" | "info">("all");
  const [triage, setTriage] = useState<Record<string, TriageItem>>({});
  const [triageSummary, setTriageSummary] = useState<string | null>(null);
  const [triageState, setTriageState] = useState<"idle" | "running" | "error">("idle");
  const [busy, setBusy] = useState<string | null>(null);

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

  async function exclude(finding: PanelFinding, restore: boolean) {
    setBusy(finding.code + finding.title);
    try {
      await fetch("/api/exclude", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activityIds: finding.excludable,
          reason: `${finding.code}: ${finding.title}`,
          restore,
        }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1">
          {(["all", "blocker", "warning", "info"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors",
                filter === key
                  ? "bg-surface-3 text-ink"
                  : "text-muted hover:bg-surface-2 hover:text-ink-2",
              )}
            >
              {key} <span className="tnum ml-0.5 text-muted">{counts[key]}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={runTriage}
          disabled={!aiAvailable || triageState === "running"}
          title={aiAvailable ? undefined : "Set an API key to enable"}
          className="rounded-md border border-line-strong bg-surface-3 px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {triageState === "running" ? "Triaging…" : "Triage with AI"}
        </button>
      </div>

      {triageSummary ? <Note tone="accent">{triageSummary}</Note> : null}
      {triageState === "error" ? <Note tone="critical">Triage failed.</Note> : null}

      {visible.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-[12.5px] text-muted">
            No {filter === "all" ? "" : filter} findings.
          </p>
        </Card>
      ) : null}

      <div className="space-y-3">
        {visible.map((f) => {
          const key = f.code + f.title;
          const t = triage[f.code];
          const excluded = f.alreadyExcluded.length > 0;
          return (
            <div
              key={key}
              className={cn(
                "rounded-lg border bg-surface p-4",
                f.severity === "blocker" ? "border-critical/30" : "border-line",
                excluded && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <SeverityBadge severity={f.severity} />
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-semibold leading-tight text-ink">{f.title}</h3>
                    <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted">
                      <span className="font-mono">{f.code}</span>
                      {f.reference ? <span>· {f.reference}</span> : null}
                      {f.activityIds.length > 0 ? (
                        <span>· {f.activityIds.length} records</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {f.excludable.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => exclude(f, excluded)}
                    disabled={busy === key}
                    className={cn(
                      "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40",
                      excluded
                        ? "border-line-strong bg-surface-3 text-ink-2 hover:text-ink"
                        : "border-critical/40 bg-critical/10 text-critical hover:bg-critical/20",
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

              <p className="mt-3 text-[12px] leading-[1.6] text-ink-2">{f.detail}</p>

              <div className="mt-3 rounded border-l-2 border-l-line-strong bg-surface-2 px-3 py-2 text-[11.5px] leading-[1.55] text-ink-2">
                <span className="text-muted">Remedy — </span>
                {f.remedy}
              </div>

              {t ? (
                <div className="mt-3 rounded-md border border-accent/25 bg-accent/[0.06] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone="accent" icon={<span aria-hidden>✦</span>}>
                      Triage · priority {t.priority}
                    </Badge>
                    <span className="text-[10.5px] text-muted">
                      {t.effort} of work
                      {t.estimatedImpactT > 0
                        ? ` · ~${t.estimatedImpactT.toLocaleString("en-IN")} tCO₂e at stake`
                        : ""}
                    </span>
                  </div>
                  <p className="text-[12px] leading-[1.6] text-ink">{t.plainEnglish}</p>
                  <p className="mt-1.5 text-[11.5px] leading-[1.55] text-ink-2">
                    <span className="text-muted">Likely cause — </span>
                    {t.likelyCause}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-[1.55] text-ink-2">
                    <span className="text-muted">Start here — </span>
                    {t.firstStep}
                  </p>
                </div>
              ) : null}

              {excluded ? (
                <p className="mt-3 text-[11px] text-warning">
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
