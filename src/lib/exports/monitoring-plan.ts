import type { DeclarationResult } from "../cbam/declaration";
import { FACTORS } from "../cbam/factors";
import { CATEGORY_LABELS, lookupGoods } from "../cbam/goods";
import { ROUTE_INDICATORS } from "../cbam/regulatory";
import { RULE_CATALOGUE } from "../cbam/rules";
import type { AuditEvent } from "../audit";
import type { StoredFileMeta } from "../files";
import { DATASET_SCHEMAS } from "../ingest/schema";
import type { WorkspaceState } from "../workspace/types";

/**
 * The monitoring methodology document.
 *
 * A verifier's first request is the description of how the operator monitors:
 * the boundary, the processes, every source stream with its method and tier,
 * where each dataset comes from and what controls stand between a spreadsheet
 * and a declared figure. This assembles that document from the workspace -
 * the same configuration the engine runs on - so the description cannot
 * drift from what is actually done. Deterministic; no model involved.
 */

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function table(header: string[], rows: unknown[][]): string {
  if (rows.length === 0) return '<p class="muted">None.</p>';
  return `<table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export function monitoringPlanHtml(args: {
  declaration: DeclarationResult;
  state: WorkspaceState;
  workspaceName: string;
  sourceFiles: StoredFileMeta[];
  evidence: StoredFileMeta[];
  team: { name: string; email: string; role: string }[];
  history: AuditEvent[];
}): string {
  const { declaration: d, state } = args;
  const inst = d.installation;
  const factorsUsed = new Set(
    d.emissions.flatMap((e) =>
      [
        ...e.contributions.fuel,
        ...e.contributions.processMaterial,
        ...e.contributions.electricity,
        ...e.contributions.heat,
      ].map((c) => c.factorId),
    ),
  );
  const fileById = new Map(args.sourceFiles.map((f) => [f.id, f]));

  const producedCn = (processId: string) =>
    [
      ...new Set(
        d.lines.filter((l) => l.processId === processId).map((l) => `${l.cnCode} ${l.description}`),
      ),
    ].join("; ");

  const suppliers = new Map<
    string,
    { cn: Set<string>; countries: Set<string>; source: Set<string> }
  >();
  for (const e of d.emissions) {
    for (const ds of state.datasets.filter((x) => x.status === "confirmed")) {
      for (const a of ds.activities) {
        if (a.kind !== "precursor" || a.processId !== e.processId) continue;
        const r = e.precursorResolutions[a.id];
        const key = a.supplierName ?? "Unknown supplier";
        const s = suppliers.get(key) ?? { cn: new Set(), countries: new Set(), source: new Set() };
        s.cn.add(a.cnCode);
        s.countries.add(a.originCountry ?? "unknown");
        if (r) s.source.add(r.status);
        suppliers.set(key, s);
      }
    }
  }

  const sections = [
    `<h2>1. Installation and operator</h2>${table(
      ["Field", "Value"],
      [
        ["Installation", inst.name],
        ["Operator", inst.operator],
        [
          "Address",
          [inst.street, inst.city, inst.state, inst.postcode, inst.country]
            .filter(Boolean)
            .join(", "),
        ],
        ["UN/LOCODE", inst.unlocode ?? "not set"],
        [
          "Main emission source",
          inst.latitude !== undefined ? `${inst.latitude}, ${inst.longitude}` : "not set",
        ],
        ["Economic activity", inst.economicActivity ?? "not set"],
        ["Contact", `${inst.contactName} <${inst.contactEmail}>`],
        ["Reporting period", `${d.period.start} to ${d.period.end}`],
      ],
    )}`,

    `<h2>2. Installation boundary and production processes</h2>
     <p>The installation is divided into production processes following the aggregated goods categories of the methodology act. Attributed emissions are determined per process; where a process yields more than one CN code, they are allocated by mass.</p>
     ${table(
       [
         "Process",
         "Category",
         "Route",
         "Benchmark route",
         "Goods (CN)",
         "Plant sections mapped to it",
       ],
       inst.processes.map((p) => [
         p.name,
         CATEGORY_LABELS[p.category],
         p.route ?? "",
         p.benchmarkRoute
           ? `${p.benchmarkRoute} - ${ROUTE_INDICATORS[p.benchmarkRoute] ?? ""}`
           : "not route-dependent",
         producedCn(p.id) || "none recorded",
         (p.aliases ?? []).join(", "),
       ]),
     )}`,

    `<h2>3. Precursors</h2>
     <h3>Produced on site</h3>
     ${table(
       ["From", "To", "Good"],
       (inst.precursorLinks ?? []).map((l) => [
         inst.processes.find((p) => p.id === l.fromProcessId)?.name ?? l.fromProcessId,
         inst.processes.find((p) => p.id === l.toProcessId)?.name ?? l.toProcessId,
         `${l.cnCode} ${lookupGoods(l.cnCode)?.description ?? ""}`,
       ]),
     )}
     <h3>Purchased</h3>
     <p>Supplier values are used where the supplier communicated them; otherwise the Commission default value for the country of production applies, increased by the mark-up for the production year (Annex IV where the country is unknown).</p>
     ${table(
       ["Supplier", "CN codes", "Country of production", "Value basis"],
       [...suppliers.entries()].map(([name, s]) => [
         name,
         [...s.cn].join(", "),
         [...s.countries].join(", "),
         [...s.source].join(", "),
       ]),
     )}`,

    `<h2>4. Source streams, calculation factors and tiers</h2>
     <p>Emissions are determined by the calculation-based approach: activity data x (net calorific value) x emission factor x oxidation factor. Tier reflects the calculation factor: 1 = international default (IPCC), 2 = country-specific value, 3 = operator-measured or contractually evidenced.</p>
     ${table(
       ["Factor", "Value", "NCV", "Tier", "Uncertainty", "Source"],
       FACTORS.filter((f) => factorsUsed.has(f.id)).map((f) => [
         f.name,
         `${f.value} ${f.unit}`,
         f.ncvGJPerTonne ? `${f.ncvGJPerTonne} GJ/t` : "",
         f.tier,
         `+/-${(f.uncertainty * 100).toFixed(0)}%`,
         `${f.source}, ${f.sourceRef} (${f.vintage})`,
       ]),
     )}
     ${inst.gridEmissionFactor ? `<p>Grid electricity uses ${esc(inst.gridEmissionFactor.value)} tCO2e/MWh (${esc(inst.gridEmissionFactor.source)}) in place of the library value.</p>` : ""}`,

    `<h2>5. Data sources</h2>
     <p>Each dataset is an unmodified export from the plant's systems, stored with its SHA-256 checksum. Columns are mapped to the canonical schema, reviewed by a person and confirmed before they count.</p>
     ${table(
       [
         "File",
         "Kind",
         "Rows",
         "Records",
         "Rows not imported",
         "Mapped by",
         "Status",
         "Confirmed by",
         "SHA-256",
       ],
       state.datasets.map((ds) => [
         ds.fileName + (ds.sheetName ? ` [${ds.sheetName}]` : ""),
         DATASET_SCHEMAS[ds.mapping.kind].label,
         ds.rowCount,
         ds.activities.length,
         ds.rejected.length,
         ds.mapping.producedBy === "model"
           ? `model (${ds.mapping.model ?? ""})`
           : "deterministic mapper",
         ds.status,
         ds.confirmedBy ? `${ds.confirmedBy}, ${ds.confirmedAt?.slice(0, 10)}` : "",
         ds.fileId ? (fileById.get(ds.fileId)?.sha256 ?? "") : "",
       ]),
     )}`,

    `<h2>6. Calculation methodology</h2>
     <ul>
       <li>Specific embedded emissions per Annex IV of Regulation (EU) 2023/956 and Implementing Regulation (EU) 2025/2547: (attributed emissions + sum of precursor mass x precursor SEE) / activity level, resolved in dependency order across on-site precursors.</li>
       <li>For iron &amp; steel, aluminium and hydrogen only direct emissions count (Annex II); indirect emissions are reported for information.</li>
       <li>Free allocation adjustment per Implementing Regulation (EU) 2025/2620: SEFA = CBAM factor x CSCF x process benchmark (column A) + sum of precursor mass per tonne x precursor SEFA. CBAM factor ${esc(d.sefa.cbamFactor)}, CSCF ${esc(d.sefa.cscf)} for ${esc(d.period.year)}.</li>
       <li>Default values: Implementing Regulation (EU) 2025/2621 as corrected by 2026/1740, with the mark-up for the production year (10% in 2026, 20% in 2027, 30% from 2028; 1% for fertilisers).</li>
       <li>Quantities are normalised to tonnes, m3, TJ or MWh with explicit unit conversions; a row without a determinable unit is rejected, never assumed.</li>
     </ul>`,

    `<h2>7. Quality assurance and control</h2>
     <ul>
       <li>Every uploaded file is retained unchanged with its checksum; every activity record carries the file and row it came from.</li>
       <li>A proposed column mapping - whether from the deterministic mapper or a language model - is a draft until a person confirms it; confirmations are logged with name and time.</li>
       <li>Rows that cannot be read are listed with the reason and raise a blocking finding until resolved; goods outside CBAM scope are recorded as such.</li>
       <li>The rules engine checks every declaration against the catalogue below. Blockers cannot be acknowledged away; warnings can be accepted only with a written note, which is logged.</li>
       <li>Records excluded after review stay in the audit trail with the reason and the person who excluded them.</li>
       <li>No figure is produced by a language model. The model may propose a column mapping or explain a finding; every identifier it returns is validated against the engine's tables.</li>
     </ul>
     ${table(
       ["Rule", "Check", "Severity"],
       RULE_CATALOGUE.map((r) => [r.code, r.title, r.severity]),
     )}`,

    `<h2>8. Responsibilities</h2>${table(
      ["Name", "E-mail", "Role"],
      args.team.map((m) => [m.name, m.email, m.role]),
    )}`,

    `<h2>9. Supporting evidence</h2>${table(
      ["Document", "Category", "Uploaded by", "Date", "SHA-256"],
      args.evidence.map((f) => [
        f.label ?? f.fileName,
        f.category ?? "",
        f.uploadedByLabel,
        f.createdAt.slice(0, 10),
        f.sha256,
      ]),
    )}`,

    `<h2>10. Open findings at the time of issue</h2>${table(
      ["Code", "Severity", "Finding", "Acknowledged"],
      d.findings.map((f) => [f.code, f.severity, f.title, f.acknowledged ? "yes" : ""]),
    )}`,

    `<h2>11. Change history</h2>${table(
      ["When", "Who", "Action"],
      args.history
        .slice(0, 60)
        .map((e) => [e.createdAt.replace("T", " ").slice(0, 19), e.actorLabel, e.action]),
    )}`,
  ];

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Monitoring methodology - ${esc(inst.name)} ${esc(d.period.year)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font: 13px/1.55 system-ui, -apple-system, Segoe UI, sans-serif; color: #1b1f24; max-width: 1000px; margin: 32px auto; padding: 0 20px; }
  h1 { font-size: 22px; margin-bottom: 4px; } h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #d5dae1; padding-bottom: 4px; }
  h3 { font-size: 13px; margin-top: 16px; } table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  th, td { text-align: left; vertical-align: top; padding: 5px 6px; border-bottom: 1px solid #e4e8ee; } th { background: #f3f5f8; font-weight: 600; }
  .muted { color: #667085; } .meta { color: #667085; font-size: 12px; } .note { background: #f6f8fb; border-left: 3px solid #3987e5; padding: 8px 12px; }
  @media print { body { margin: 0; } h2 { break-after: avoid; } table { break-inside: auto; } }
</style></head><body>
<h1>Monitoring methodology documentation</h1>
<p class="meta">${esc(inst.name)} - ${esc(inst.operator)} - reporting year ${esc(d.period.year)} - workspace "${esc(args.workspaceName)}" - generated ${esc(d.computedAt.slice(0, 19).replace("T", " "))} UTC</p>
<p class="note">Generated from the configuration and data the calculation actually runs on, so it describes what is done rather than what was intended. ${esc(d.disclaimer)}</p>
${sections.join("\n")}
</body></html>`;
}
