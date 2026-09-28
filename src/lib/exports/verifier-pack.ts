import { strToU8, zipSync, type Zippable } from "fflate";
import { listAudit } from "../audit";
import { orgMembers } from "../auth/accounts";
import { toCommunication, toCsv, type DeclarationResult } from "../cbam/declaration";
import type { Db } from "../db";
import { getFile, listFiles } from "../files";
import { sha256 } from "../ids";
import { workspaceActivities } from "../workspace/declaration";
import type { Workspace } from "../workspace/types";
import { monitoringPlanHtml } from "./monitoring-plan";
import { emissionsReportXlsx } from "./report-xlsx";

/**
 * Everything a verifier needs in one archive: the declaration in every
 * format, the monitoring methodology, the full audit trail, the activity log,
 * every source file exactly as uploaded and every piece of evidence - with a
 * manifest of SHA-256 checksums so each file can be proven unaltered.
 */

function csv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
}

export async function supportingDocuments(db: Db, ws: Workspace) {
  const [sourceFiles, evidence, members, history] = await Promise.all([
    listFiles(db, ws.id, "source"),
    listFiles(db, ws.id, "evidence"),
    orgMembers(db, ws.orgId),
    listAudit(db, { orgId: ws.orgId, workspaceId: ws.id, limit: 1000 }),
  ]);
  return { sourceFiles, evidence, members, history };
}

export async function verifierPack(
  db: Db,
  ws: Workspace,
  d: DeclarationResult,
  generatedBy: string,
): Promise<Uint8Array> {
  const docs = await supportingDocuments(db, ws);
  const files: Record<string, Uint8Array> = {};

  files["declaration.json"] = strToU8(JSON.stringify(d, null, 2));
  files["communication.json"] = strToU8(JSON.stringify(toCommunication(d), null, 2));
  files["declaration.csv"] = strToU8(toCsv(d));
  files["emissions-report.xlsx"] = await emissionsReportXlsx(d, ws.state, {
    workspaceName: ws.name,
    generatedBy,
  });
  files["monitoring-methodology.html"] = strToU8(
    monitoringPlanHtml({
      declaration: d,
      state: ws.state,
      workspaceName: ws.name,
      sourceFiles: docs.sourceFiles,
      evidence: docs.evidence,
      team: docs.members.map((m) => ({ name: m.name, email: m.email, role: m.role })),
      history: docs.history,
    }),
  );

  // Every activity record with its lineage and whether it counts.
  const excluded = new Map(ws.state.exclusions.map((e) => [e.activityId, e]));
  const trail: (string | number)[][] = [
    [
      "activity_id",
      "kind",
      "process",
      "period_start",
      "period_end",
      "quantity",
      "unit",
      "factor_or_cn",
      "provenance",
      "tier",
      "file",
      "row",
      "counted",
      "exclusion_reason",
      "excluded_by",
      "raw",
    ],
  ];
  const confirmed = new Set(
    ws.state.datasets.filter((x) => x.status === "confirmed").map((x) => x.id),
  );
  for (const a of workspaceActivities({
    ...ws.state,
    datasets: ws.state.datasets.map((x) => ({ ...x, status: "confirmed" as const })),
  })) {
    const q =
      a.kind === "fuel"
        ? [a.quantity, a.unit, a.factorId]
        : a.kind === "electricity"
          ? [a.quantityMWh, "MWh", a.factorId]
          : a.kind === "heat"
            ? [a.quantityTJ, "TJ", a.factorId]
            : a.kind === "production" || a.kind === "precursor"
              ? [a.quantityT, "t", a.cnCode]
              : a.kind === "process_material"
                ? [a.quantityT, "t", a.factorId]
                : [a.amount, a.currency, a.scheme];
    const ex = excluded.get(a.id);
    const counted = confirmed.has(a.lineage.datasetId) && !ex;
    trail.push([
      a.id,
      a.kind,
      ws.state.installation.processes.find((p) => p.id === a.processId)?.name ?? a.processId,
      a.periodStart,
      a.periodEnd,
      q[0] ?? "",
      q[1] ?? "",
      q[2] ?? "",
      a.provenance,
      a.tier,
      a.lineage.fileName,
      a.lineage.row,
      counted ? "yes" : "no",
      ex?.reason ?? (confirmed.has(a.lineage.datasetId) ? "" : "dataset not confirmed"),
      ex?.by ?? "",
      JSON.stringify(a.lineage.raw),
    ]);
  }
  files["audit-trail.csv"] = strToU8(csv(trail));

  files["rejected-rows.csv"] = strToU8(
    csv([
      ["file", "row", "reason", "raw"],
      ...ws.state.datasets.flatMap((x) =>
        x.rejected.map((r) => [r.fileName, r.row, r.reason, JSON.stringify(r.raw)]),
      ),
      ...ws.state.datasets.flatMap((x) =>
        x.skipped.map((r) => [r.fileName, r.row, `Out of scope: ${r.reason}`, r.description]),
      ),
    ]),
  );

  files["findings.csv"] = strToU8(
    csv([
      [
        "code",
        "severity",
        "title",
        "detail",
        "remedy",
        "reference",
        "acknowledged",
        "acknowledgement_note",
      ],
      ...d.findings.map((f) => {
        const note = ws.state.acknowledgementNotes?.[`${f.code}::${f.title}`];
        return [
          f.code,
          f.severity,
          f.title,
          f.detail,
          f.remedy,
          f.reference ?? "",
          f.acknowledged ? "yes" : "",
          note ? `${note.note} (${note.by}, ${note.at})` : "",
        ];
      }),
    ]),
  );

  files["activity-log.csv"] = strToU8(
    csv([
      ["when", "who", "action", "detail"],
      ...docs.history.map((e) => [e.createdAt, e.actorLabel, e.action, JSON.stringify(e.detail)]),
    ]),
  );

  for (const meta of docs.sourceFiles) {
    const f = await getFile(db, ws.id, meta.id);
    if (f) files[`sources/${meta.id}-${safeName(meta.fileName)}`] = f.bytes;
  }
  for (const meta of docs.evidence) {
    const f = await getFile(db, ws.id, meta.id);
    if (f) files[`evidence/${meta.id}-${safeName(meta.fileName)}`] = f.bytes;
  }

  const manifest = Object.entries(files).map(([path, bytes]) => ({
    path,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  }));
  files["manifest.json"] = strToU8(
    JSON.stringify(
      {
        workspace: ws.name,
        installation: ws.state.installation.name,
        period: ws.state.period,
        generatedAt: d.computedAt,
        generatedBy,
        files: manifest,
      },
      null,
      2,
    ),
  );
  files["README.txt"] = strToU8(
    [
      `Verifier pack - ${ws.state.installation.name}, reporting year ${ws.state.period.year}`,
      "",
      "monitoring-methodology.html  How the operator monitors: boundary, processes, source streams, data sources, controls.",
      "emissions-report.xlsx        The operator's emissions report, structured after the Commission communication template.",
      "declaration.json / .csv      The full calculation output and the per-good summary.",
      "communication.json           The data communicated to EU importers.",
      "audit-trail.csv              Every activity record with the file and row it came from and whether it counts.",
      "rejected-rows.csv            Rows that could not be imported, and goods outside CBAM scope.",
      "findings.csv                 Data-quality findings, with acknowledgement notes.",
      "activity-log.csv             Who changed what, and when.",
      "sources/                     Every uploaded file, byte for byte.",
      "evidence/                    Supporting documents.",
      "manifest.json                SHA-256 of every file in this pack.",
      "",
      d.disclaimer,
    ].join("\n"),
  );

  const zippable: Zippable = {};
  for (const [path, bytes] of Object.entries(files)) zippable[path] = [bytes, { level: 6 }];
  return zipSync(zippable);
}
