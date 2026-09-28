import Link from "next/link";
import { notFound } from "next/navigation";
import { isAiAvailable } from "@/lib/ai/client";
import { workspaceContext } from "@/lib/auth/context";
import { FACTORS } from "@/lib/cbam/factors";
import { knownUnits } from "@/lib/cbam/units";
import { DATASET_SCHEMAS } from "@/lib/ingest/schema";
import { rereadSource } from "@/lib/workspace/datasets";
import { Badge, Card, fmt, Note, Page, PageHeader, Table, Td, Th } from "@/components/ui";
import { MappingEditor } from "./mapping-editor";

/**
 * Mapping review: where a person checks what the mapper proposed before a
 * file counts. Every column, every resolved value, every row that could not be
 * read - and the records the mapping produces, so the effect of a change is
 * visible before it is confirmed.
 */
export default async function DatasetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await workspaceContext();
  const ds = ctx.workspace.state.datasets.find((d) => d.id === id);
  if (!ds) notFound();
  const processes = ctx.workspace.state.installation.processes;

  let samples: Record<string, string[]> = {};
  let preamble: string[][] = [];
  let readError: string | null = null;
  try {
    const read = await rereadSource(ctx.db, ctx.workspace, ds, {
      sheetName: ds.sheetName,
      headerRow: ds.headerRow,
    });
    samples = Object.fromEntries(read.parsed.columns.map((c) => [c.name, c.samples]));
    preamble = read.preamble;
  } catch (error) {
    readError = error instanceof Error ? error.message : "The source file could not be read.";
  }

  const schemas = Object.fromEntries(
    Object.entries(DATASET_SCHEMAS).map(([kind, s]) => [
      kind,
      {
        label: s.label,
        description: s.description,
        fields: s.fields.map((f) => ({
          id: f.id,
          label: f.label,
          required: f.required,
          type: f.type,
          description: f.description,
        })),
      },
    ]),
  );

  const lowConfidence = ds.mapping.columns.filter((c) => c.targetField && c.confidence < 0.7);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/ingest" className="hover:text-ink">
            ← Data
          </Link>
        }
        title={ds.fileName}
        description={
          <>
            {DATASET_SCHEMAS[ds.mapping.kind].label} · {fmt(ds.rowCount)} rows →{" "}
            {fmt(ds.activities.length)} records · uploaded {ds.uploadedAt.slice(0, 10)} by{" "}
            {ds.uploadedBy}
            {ds.confirmedBy
              ? ` · confirmed by ${ds.confirmedBy} on ${ds.confirmedAt?.slice(0, 10)}`
              : ""}
          </>
        }
        actions={
          <>
            <Badge tone={ds.status === "confirmed" ? "good" : "warning"}>
              {ds.status === "confirmed" ? "Confirmed - counted" : "Draft - not counted"}
            </Badge>
            <Badge tone={ds.mapping.producedBy === "model" ? "accent" : "neutral"}>
              {ds.mapping.producedBy === "model"
                ? (ds.mapping.model ?? "AI model")
                : "Deterministic mapper"}
            </Badge>
            {ds.fileId ? (
              <a
                href={`/api/files/${ds.fileId}`}
                className="rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-[12.5px] text-ink-2 hover:border-ink hover:text-ink"
              >
                Download source
              </a>
            ) : null}
          </>
        }
      />
      <Page>
        <div className="mb-8 space-y-2">
          {readError ? <Note tone="critical">{readError}</Note> : null}
          {ds.aiOutcome.fallbackReason && ds.aiOutcome.producedBy === "heuristic" ? (
            <Note>Mapped by the deterministic mapper: {ds.aiOutcome.fallbackReason}</Note>
          ) : null}
          {lowConfidence.length > 0 ? (
            <Note tone="warning">
              {lowConfidence.length} column{lowConfidence.length > 1 ? "s were" : " was"} mapped
              with low confidence - check{" "}
              {lowConfidence.map((c) => `"${c.sourceColumn}"`).join(", ")}.
            </Note>
          ) : null}
          {ds.mapping.warnings.map((w, i) => (
            <Note key={i} tone="warning">
              {w}
            </Note>
          ))}
          {preamble.length > 0 ? (
            <Note>
              {preamble.length} row{preamble.length > 1 ? "s" : ""} above the header were skipped as
              a title block:{" "}
              {preamble
                .map((r) => r.filter(Boolean).join(" · "))
                .filter(Boolean)
                .join(" / ") || "(blank)"}
            </Note>
          ) : null}
        </div>

        <MappingEditor
          datasetId={ds.id}
          canWrite={ctx.canWrite}
          aiAvailable={isAiAvailable()}
          status={ds.status}
          initial={{
            kind: ds.mapping.kind,
            columns: ds.mapping.columns.map((c) => ({
              sourceColumn: c.sourceColumn,
              targetField: c.targetField,
              detectedUnit: c.detectedUnit ?? null,
              confidence: c.confidence,
              rationale: c.rationale,
            })),
            values: ds.mapping.values.map((v) => ({
              target: v.target,
              sourceValue: v.sourceValue,
              resolvedId: v.resolvedId,
              confidence: v.confidence,
              rationale: v.rationale,
            })),
            originCountry: ds.mapping.defaults?.originCountry ?? "",
            sheetName: ds.sheetName ?? "",
            headerRow: ds.headerRow,
          }}
          sheets={ds.sheets ?? []}
          missingRequired={ds.mapping.missingRequired}
          samples={samples}
          schemas={schemas}
          units={knownUnits()}
          factors={FACTORS.map((f) => ({ id: f.id, name: f.name, basis: f.basis }))}
          processes={processes.map((p) => ({ id: p.id, name: p.name }))}
        />

        {ds.rejected.length > 0 ? (
          <div className="mt-8">
            <Card
              title={`${ds.rejected.length} rows not imported`}
              subtitle="They carry data but could not become records. Each raises a blocking finding while the file is confirmed - fix the mapping or the source."
              padded={false}
            >
              <Table>
                <thead>
                  <tr>
                    <Th align="right">Row</Th>
                    <Th>Reason</Th>
                    <Th>Source values</Th>
                  </tr>
                </thead>
                <tbody>
                  {ds.rejected.slice(0, 100).map((r, i) => (
                    <tr key={i} className="hover:bg-surface-2">
                      <Td align="right" numeric>
                        {r.row}
                      </Td>
                      <Td className="text-ink-2">{r.reason}</Td>
                      <Td className="font-mono text-[12px] text-muted">
                        {Object.entries(r.raw)
                          .filter(([, v]) => v)
                          .slice(0, 5)
                          .map(([k, v]) => `${k}=${v}`)
                          .join("  ")}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {ds.rejected.length > 100 ? (
                <p className="px-5 py-2 text-[12.5px] text-muted">
                  and {ds.rejected.length - 100} more.
                </p>
              ) : null}
            </Card>
          </div>
        ) : null}

        {ds.skipped.length > 0 ? (
          <div className="mt-8">
            <Card
              title={`${ds.skipped.length} rows outside CBAM scope`}
              subtitle="Read correctly, but the goods are not in Annex I, so they carry no embedded emissions."
              padded={false}
            >
              <Table>
                <thead>
                  <tr>
                    <Th align="right">Row</Th>
                    <Th>CN code</Th>
                    <Th>Description</Th>
                    <Th>Reason</Th>
                  </tr>
                </thead>
                <tbody>
                  {ds.skipped.slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      <Td align="right" numeric>
                        {r.row}
                      </Td>
                      <Td className="font-mono text-[12.5px]">{r.cnCode}</Td>
                      <Td>{r.description}</Td>
                      <Td className="text-muted">{r.reason}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
        ) : null}

        <div className="mt-8">
          <Card
            title="Records this mapping produces"
            subtitle={`First ${Math.min(20, ds.activities.length)} of ${fmt(ds.activities.length)}, each traced to its row.`}
            padded={false}
          >
            <Table>
              <thead>
                <tr>
                  <Th align="right">Row</Th>
                  <Th>Kind</Th>
                  <Th>Process</Th>
                  <Th>Period</Th>
                  <Th align="right">Quantity</Th>
                  <Th>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {ds.activities.slice(0, 20).map((a) => {
                  const [q, unit, detail] =
                    a.kind === "fuel"
                      ? [a.quantity, a.unit, a.factorId]
                      : a.kind === "electricity"
                        ? [a.quantityMWh, "MWh", `${a.supply} · ${a.factorId}`]
                        : a.kind === "heat"
                          ? [a.quantityTJ, "TJ", a.direction]
                          : a.kind === "production"
                            ? [a.quantityT, "t", `CN ${a.cnCode} · ${a.destination ?? ""}`]
                            : a.kind === "precursor"
                              ? [
                                  a.quantityT,
                                  "t",
                                  `CN ${a.cnCode} · ${a.supplierName ?? "supplier?"} · ${a.originCountry ?? "origin unknown"} · ${a.supplier ? `supplier values${a.supplier.verified ? " (verified)" : ""}` : "default value"}`,
                                ]
                              : a.kind === "process_material"
                                ? [a.quantityT, "t", a.factorId]
                                : [a.amount, a.currency, a.scheme];
                  return (
                    <tr key={a.id} className="hover:bg-surface-2">
                      <Td align="right" numeric>
                        {a.lineage.row}
                      </Td>
                      <Td>{a.kind.replace("_", " ")}</Td>
                      <Td>{processes.find((p) => p.id === a.processId)?.name ?? a.processId}</Td>
                      <Td className="tnum text-[12.5px]">{a.periodStart.slice(0, 7)}</Td>
                      <Td align="right" numeric>
                        {fmt(Number(q), 2)} <span className="text-muted">{unit}</span>
                      </Td>
                      <Td className="text-[12.5px] text-muted">{detail}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>
      </Page>
    </>
  );
}
