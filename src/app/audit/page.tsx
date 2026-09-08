import { getDeclaration, getState } from "@/lib/store";
import { tryGetFactor } from "@/lib/cbam/factors";
import { Card, fmt, Page, PageHeader, Note } from "@/components/ui";
import { AuditTable } from "./audit-table";

export const dynamic = "force-dynamic";

/**
 * Audit trail.
 *
 * Every activity record, back to the file and row it came from, with the raw
 * cell values it was built out of. This is the screen that makes the word
 * "defensible" in the pitch mean something: a verifier can sit here and walk
 * any figure on any other screen back to the spreadsheet it started in.
 */
export default function AuditPage() {
  const state = getState();
  const d = getDeclaration(state);
  const excluded = new Map(state.exclusions.map((e) => [e.activityId, e]));

  const rows = state.datasets.flatMap((ds) =>
    ds.activities.map((a) => {
      const factorId =
        a.kind === "fuel" ||
        a.kind === "process_material" ||
        a.kind === "electricity" ||
        a.kind === "heat"
          ? a.factorId
          : null;
      const factor = factorId ? tryGetFactor(factorId) : undefined;
      const quantity =
        a.kind === "fuel"
          ? { value: a.quantity, unit: a.unit }
          : a.kind === "electricity"
            ? { value: a.quantityMWh, unit: "MWh" }
            : a.kind === "heat"
              ? { value: a.quantityTJ, unit: "TJ" }
              : a.kind === "production" || a.kind === "precursor" || a.kind === "process_material"
                ? { value: a.quantityT, unit: "t" }
                : { value: 0, unit: "" };

      return {
        id: a.id,
        kind: a.kind,
        fileName: a.lineage.fileName,
        row: a.lineage.row,
        raw: a.lineage.raw,
        processId: a.processId,
        processName:
          state.installation.processes.find((p) => p.id === a.processId)?.name ?? a.processId,
        period: `${a.periodStart} → ${a.periodEnd}`,
        quantity: quantity.value,
        unit: quantity.unit,
        factorId,
        factorName: factor?.name ?? null,
        factorSource: factor ? `${factor.source} (${factor.vintage})` : null,
        provenance: a.provenance,
        tier: a.tier,
        detail:
          a.kind === "production"
            ? `CN ${a.cnCode} · ${a.destination ?? "domestic"}`
            : a.kind === "precursor"
              ? `CN ${a.cnCode} · SEE ${(a.seeDirect + a.seeIndirect).toFixed(3)} (${a.seeSource})`
              : a.kind === "electricity"
                ? a.supply
                : a.kind === "carbon_price"
                  ? a.scheme
                  : "",
        excluded: excluded.has(a.id),
        exclusionReason: excluded.get(a.id)?.reason ?? null,
      };
    }),
  );

  return (
    <>
      <PageHeader
        eyebrow="Step 5"
        title="Audit trail"
        description={
          <>
            {fmt(rows.length)} activity records, each pointing at the file and row it came from and
            the factor applied to it. Excluded records stay here with the reason attached —
            &ldquo;why is this row not in the declaration&rdquo; is the first thing a verifier asks.
          </>
        }
        actions={
          <a
            href="/api/export?format=json"
            className="rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink"
          >
            Full declaration JSON
          </a>
        }
      />

      <Page>
        <div className="mb-5 grid grid-cols-4 gap-4">
          {[
            { label: "Activity records", value: fmt(rows.length) },
            {
              label: "Traced to a source row",
              value: `${rows.filter((r) => r.row > 0).length === rows.length ? "100" : Math.round((rows.filter((r) => r.row > 0).length / Math.max(1, rows.length)) * 100)}%`,
            },
            { label: "Excluded on review", value: fmt(state.exclusions.length) },
            {
              label: "Rows not imported",
              value: fmt(state.datasets.reduce((s, x) => s + x.rejected.length, 0)),
            },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-line bg-surface px-4 py-3">
              <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                {m.label}
              </div>
              <div className="mt-1.5 tnum text-[20px] font-semibold text-ink">{m.value}</div>
            </div>
          ))}
        </div>

        <Note tone="accent">
          Computed {new Date(d.computedAt).toISOString().replace("T", " ").slice(0, 19)} UTC from
          this exact set of records. Nothing on any screen in this app is cached — every figure is
          recomputed from these rows on each request, so a number you see can never be stale
          relative to the data underneath it.
        </Note>

        <div className="mt-5">
          <Card padded={false}>
            <AuditTable rows={rows} />
          </Card>
        </div>
      </Page>
    </>
  );
}
