"use client";

import { Fragment, useMemo, useState } from "react";
import { Badge, cn, fmt, Table, Td, Th } from "@/components/ui";

export interface AuditRow {
  id: string;
  kind: string;
  fileName: string;
  row: number;
  raw: Record<string, string>;
  processName: string;
  period: string;
  quantity: number;
  unit: string;
  factorId: string | null;
  factorName: string | null;
  factorSource: string | null;
  provenance: string;
  tier: number;
  detail: string;
  excluded: boolean;
  exclusionReason: string | null;
}

/** Expandable rows: the summary is scannable, the raw source cells are one click away. */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  // 145 records unpaginated makes a 16,000px page nobody scrolls. Search and
  // the kind filter are the real navigation; this just keeps the DOM sane.
  const [limit, setLimit] = useState(50);

  const kinds = useMemo(() => ["all", ...new Set(rows.map((r) => r.kind))], [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!q) return true;
      return (
        r.fileName.toLowerCase().includes(q) ||
        r.processName.toLowerCase().includes(q) ||
        (r.factorName ?? "").toLowerCase().includes(q) ||
        r.detail.toLowerCase().includes(q) ||
        Object.values(r.raw).some((v) => String(v).toLowerCase().includes(q))
      );
    });
  }, [rows, query, kind]);

  const shown = filtered.slice(0, limit);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(50);
          }}
          placeholder="Search files, sections, materials, raw cell values…"
          className="min-w-[280px] flex-1 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex gap-1">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setLimit(50);
              }}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                kind === k ? "bg-surface-3 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink-2",
              )}
            >
              {k.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <span className="tnum text-[11px] text-muted">
          showing {fmt(shown.length)} of {fmt(filtered.length)}
          {filtered.length !== rows.length ? ` (${fmt(rows.length)} total)` : ""}
        </span>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Source</Th>
            <Th>Kind</Th>
            <Th>Process</Th>
            <Th>Period</Th>
            <Th align="right">Quantity</Th>
            <Th>Factor</Th>
            <Th>Tier</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <Fragment key={r.id}>
              <tr
                onClick={() => setOpen(open === r.id ? null : r.id)}
                className={cn(
                  "cursor-pointer hover:bg-surface-2",
                  r.excluded && "opacity-45",
                  open === r.id && "bg-surface-2",
                )}
              >
                <Td className="whitespace-nowrap font-mono text-[11px] text-ink">
                  {r.fileName.replace(/\.csv$/, "")}
                  <span className="text-muted">:{r.row}</span>
                </Td>
                <Td className="whitespace-nowrap text-[11px] capitalize">
                  {r.kind.replace(/_/g, " ")}
                  {r.detail ? (
                    <div className="text-[10px] text-muted">{r.detail}</div>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap text-[11px]">{r.processName}</Td>
                <Td className="whitespace-nowrap font-mono text-[10.5px] text-muted">
                  {r.period.slice(0, 7)}
                </Td>
                <Td align="right" numeric className="whitespace-nowrap">
                  {fmt(r.quantity, r.quantity < 100 ? 2 : 0)}{" "}
                  <span className="text-muted">{r.unit}</span>
                </Td>
                <Td className="text-[11px]">
                  {r.factorName ?? <span className="text-muted">—</span>}
                  {r.factorSource ? (
                    <div className="text-[10px] text-muted">{r.factorSource}</div>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap">
                  <Badge tone={r.tier >= 3 ? "good" : r.tier === 2 ? "neutral" : "warning"}>
                    T{r.tier} · {r.provenance}
                  </Badge>
                </Td>
                <Td align="right">
                  {r.excluded ? <Badge tone="critical">excluded</Badge> : null}
                </Td>
              </tr>
              {open === r.id ? (
                <tr className="bg-surface-2">
                  <td colSpan={8} className="border-b border-line px-5 py-3">
                    <div className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                      Raw source row — {r.fileName} line {r.row}
                    </div>
                    <div className="grid grid-cols-4 gap-x-6 gap-y-1.5">
                      {Object.entries(r.raw).map(([k, v]) => (
                        <div key={k} className="min-w-0 text-[11px]">
                          <div className="truncate text-muted">{k}</div>
                          <div className="truncate font-mono text-ink-2">{v || "—"}</div>
                        </div>
                      ))}
                    </div>
                    {r.exclusionReason ? (
                      <p className="mt-3 text-[11px] text-warning">
                        Excluded — {r.exclusionReason}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </Table>

      {filtered.length > shown.length ? (
        <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
          <p className="text-[11px] text-muted">
            {fmt(filtered.length - shown.length)} more matching records. Narrow the search, or
            export the full declaration JSON for everything at once.
          </p>
          <button
            type="button"
            onClick={() => setLimit((n) => n + 100)}
            className="shrink-0 rounded-md border border-line-strong bg-surface-3 px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink"
          >
            Show 100 more
          </button>
        </div>
      ) : null}
    </div>
  );
}
