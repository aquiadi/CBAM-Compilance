import { FACTORS } from "@/lib/cbam/factors";
import { PLAUSIBILITY_BANDS, PLAUSIBILITY_NOTE } from "@/lib/cbam/plausibility";
import { RULE_CATALOGUE } from "@/lib/cbam/rules";
import { GOODS, CATEGORY_LABELS, SECTOR_LABELS, lookupGoods } from "@/lib/cbam/goods";
import {
  benchmarkEntry,
  CBAM_FACTOR,
  CSCF,
  defaultValueMarkup,
  defaultValueTable,
  lookupDefaultValue,
  PUBLISHED_CERTIFICATE_PRICES,
  REGULATORY_SOURCES,
  ROUTE_INDICATORS,
} from "@/lib/cbam/regulatory";
import { pageContext } from "@/lib/auth/context";
import { Badge, Card, Note, Page, PageHeader, Table, Td, Th } from "@/components/ui";

/**
 * Methodology.
 *
 * Every constant the engine uses, with its source, in one place. A tool that
 * asks an operator to sign a legal declaration owes them the ability to read
 * the whole rulebook without opening the source code.
 */
export default async function MethodologyPage() {
  const ctx = await pageContext();
  const sectors = [...new Set(GOODS.map((g) => g.sector))];
  const country = ctx.workspace?.state.installation.country ?? "IN";
  const year = ctx.workspace?.state.period.year ?? 2026;
  // The CN codes this workspace actually touches: its goods, its precursors
  // and its on-site links.
  const relevant = [
    ...new Set(
      (ctx.workspace?.state.datasets ?? [])
        .flatMap((d) => d.activities)
        .flatMap((a) => (a.kind === "production" || a.kind === "precursor" ? [a.cnCode] : []))
        .concat((ctx.workspace?.state.installation.precursorLinks ?? []).map((l) => l.cnCode))
        .filter((cn) => lookupGoods(cn)),
    ),
  ].sort();
  const countryTable = defaultValueTable(country);

  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Methodology and sources"
        description={
          <>
            Every published table, factor and rule the engine applies, with its provenance. The
            Commission&apos;s benchmarks and default values are imported from its own workbooks and
            checksummed; nothing here is model-generated.
          </>
        }
      />

      <Page>
        <div className="space-y-8">
          <Card
            title="How a number is produced"
            subtitle="The division of labour between the engine and the model."
          >
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="mb-2 text-[12.5px] font-medium uppercase tracking-[0.12em] text-muted">
                  The model may
                </h3>
                <ul className="space-y-1.5 text-[13.5px] leading-[1.6] text-ink-2">
                  <li>· Map a spreadsheet column to a canonical field</li>
                  <li>· Detect the unit a quantity is expressed in</li>
                  <li>· Resolve a free-text material to a factor id from a fixed list</li>
                  <li>· Rank findings and explain them in the operator&apos;s vocabulary</li>
                  <li>· Draft the methodology memo from the computed declaration</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-[12.5px] font-medium uppercase tracking-[0.12em] text-muted">
                  The model may not
                </h3>
                <ul className="space-y-1.5 text-[13.5px] leading-[1.6] text-ink-2">
                  <li>· Produce, adjust or round any figure in the declaration</li>
                  <li>· Invent a field, factor or process id — unknown ids are dropped</li>
                  <li>· Create a finding, clear one, or change a severity</li>
                  <li>· Decide whether a declaration is filable</li>
                </ul>
              </div>
            </div>
            <div className="mt-4">
              <Note tone="accent">
                Every id the model returns is checked against the engine&apos;s own tables before
                use. A hallucinated factor id is discarded and reported as a warning, never applied.
                The tests covering that boundary are in{" "}
                <span className="font-mono text-[12.5px]">src/lib/ai/guardrails.test.ts</span>.
              </Note>
            </div>
          </Card>

          <Card
            title="Official sources"
            subtitle="The implementing acts and Commission publications behind every regulatory figure."
            padded={false}
          >
            <Table>
              <thead>
                <tr>
                  <Th>Act or document</Th>
                  <Th>Used for</Th>
                  <Th>Version</Th>
                  <Th>Checksum</Th>
                </tr>
              </thead>
              <tbody>
                {Object.values(REGULATORY_SOURCES).map((src) => (
                  <tr key={src.act + src.title} className="align-top hover:bg-surface-2">
                    <Td className="text-ink">
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-accent"
                      >
                        {src.act}
                      </a>
                      <div className="mt-0.5 text-[12px] text-muted">{src.caveat}</div>
                    </Td>
                    <Td className="text-[12.5px]">
                      {src.title}
                      <div className="text-[12px] text-muted">{src.table}</div>
                    </Td>
                    <Td className="tnum text-[12.5px]">{src.version}</Td>
                    <Td className="font-mono text-[11.5px] text-muted">
                      {src.sha256 ? `${src.sha256.slice(0, 16)}…` : "-"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="grid grid-cols-3 gap-7">
            <Card
              title="CBAM factor and CSCF"
              subtitle="Share of EU free allocation still granted; multiplies the benchmark in the free allocation adjustment."
              padded={false}
            >
              <Table>
                <thead>
                  <tr>
                    <Th align="right">Year</Th>
                    <Th align="right">CBAM factor</Th>
                    <Th align="right">CSCF</Th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(CBAM_FACTOR)
                    .filter(([y]) => Number(y) >= 2026)
                    .map(([y, f]) => (
                      <tr key={y} className={Number(y) === year ? "bg-surface-2" : ""}>
                        <Td align="right" numeric>
                          {y}
                        </Td>
                        <Td align="right" numeric>
                          {(f * 100).toFixed(1)}%
                        </Td>
                        <Td align="right" numeric>
                          {CSCF[Number(y)]?.value ?? 1}
                          {CSCF[Number(y)]?.preliminary ? " (prelim.)" : ""}
                        </Td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            </Card>

            <Card
              title="Default-value mark-up"
              subtitle="Added to every default value by production year."
              padded={false}
            >
              <Table>
                <thead>
                  <tr>
                    <Th align="right">Year</Th>
                    <Th align="right">Most goods</Th>
                    <Th align="right">Fertilisers</Th>
                  </tr>
                </thead>
                <tbody>
                  {[2026, 2027, 2028].map((y) => (
                    <tr key={y}>
                      <Td align="right" numeric>
                        {y === 2028 ? "2028+" : y}
                      </Td>
                      <Td align="right" numeric>
                        {(defaultValueMarkup("iron_steel", y) * 100).toFixed(0)}%
                      </Td>
                      <Td align="right" numeric>
                        {(defaultValueMarkup("fertilisers", y) * 100).toFixed(0)}%
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            <Card
              title="Certificate prices"
              subtitle="Published quarterly for 2026."
              padded={false}
            >
              <Table>
                <thead>
                  <tr>
                    <Th>Quarter</Th>
                    <Th align="right">Price</Th>
                    <Th>Published</Th>
                  </tr>
                </thead>
                <tbody>
                  {PUBLISHED_CERTIFICATE_PRICES.map((p) => (
                    <tr key={p.quarter}>
                      <Td>{p.quarter}</Td>
                      <Td align="right" numeric>
                        €{p.priceEur.toFixed(2)}
                      </Td>
                      <Td className="text-[12.5px] text-muted">{p.published}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card
            title="Benchmarks and default values for this workspace's goods"
            subtitle={`Column A: process benchmark used with actual data. Column B: whole-chain benchmark used with default values. Default values for ${country} before the ${year} mark-up.`}
            padded={false}
          >
            {relevant.length === 0 ? (
              <p className="px-5 py-4 text-[13.5px] text-muted">
                No CBAM goods in this workspace yet.
              </p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>CN code</Th>
                    <Th>Description</Th>
                    <Th>Column A (BM*)</Th>
                    <Th>Column B (BM)</Th>
                    <Th>Default value</Th>
                  </tr>
                </thead>
                <tbody>
                  {relevant.map((cn) => {
                    const bm = benchmarkEntry(cn);
                    const dv = lookupDefaultValue({ cnCode: cn, country });
                    const fmtBm = (list: [number, string][] | undefined) =>
                      (list ?? []).map(([v, i]) => `${v}${i ? ` (${i})` : ""}`).join(" · ") || "-";
                    return (
                      <tr key={cn} className="align-top hover:bg-surface-2">
                        <Td className="font-mono text-[13px] text-ink">{cn}</Td>
                        <Td className="max-w-md text-[12.5px]">{lookupGoods(cn)?.description}</Td>
                        <Td className="tnum text-[12.5px]">{fmtBm(bm?.a)}</Td>
                        <Td className="tnum text-[12.5px]">{fmtBm(bm?.b)}</Td>
                        <Td className="text-[12.5px]">
                          {dv.ok ? (
                            <>
                              {dv.value.total.toFixed(3)}
                              {dv.value.route ? ` (route ${dv.value.route})` : ""}
                              <div className="text-[12px] text-muted">{dv.value.table}</div>
                            </>
                          ) : (
                            <span className="text-muted">{dv.message}</span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
            <div className="border-t border-line px-5 py-2.5 text-[12px] leading-[1.6] text-muted">
              Route indicators:{" "}
              {Object.entries(ROUTE_INDICATORS)
                .map(([k, v]) => `${k} = ${v}`)
                .join("; ")}
              . (1)/(2) = production years 2026-27 / 2028-30.
            </div>
          </Card>

          <details className="rounded-xl border border-line bg-surface">
            <summary className="cursor-pointer px-5 py-3.5 text-[14.5px] font-semibold text-ink">
              Default values table - {countryTable[0]?.table.replace("Annex I - ", "") ?? country} (
              {countryTable.length} entries)
            </summary>
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Description</Th>
                  <Th align="right">Direct</Th>
                  <Th align="right">Indirect</Th>
                  <Th align="right">Total</Th>
                  <Th>Route</Th>
                </tr>
              </thead>
              <tbody>
                {countryTable.map((v) => (
                  <tr key={v.tableCode} className="align-top">
                    <Td className="font-mono text-[12.5px]">{v.tableCode}</Td>
                    <Td className="max-w-lg text-[12.5px]">{v.description.slice(0, 140)}</Td>
                    <Td align="right" numeric>
                      {v.direct ?? "-"}
                    </Td>
                    <Td align="right" numeric>
                      {v.indirect ?? "n/a"}
                    </Td>
                    <Td align="right" numeric>
                      {v.total}
                    </Td>
                    <Td className="text-[12.5px]">{v.route}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </details>

          <Card
            title="Emission factors"
            subtitle="Applied to activity data to produce emissions. Plant-measured values override these and raise the monitoring tier."
            padded={false}
          >
            <Table>
              <thead>
                <tr>
                  <Th>Id</Th>
                  <Th>Factor</Th>
                  <Th align="right">Value</Th>
                  <Th align="right">NCV</Th>
                  <Th align="right">±</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody>
                {FACTORS.map((f) => (
                  <tr key={f.id} className="hover:bg-surface-2">
                    <Td className="whitespace-nowrap font-mono text-[12px] text-muted">{f.id}</Td>
                    <Td>
                      <span className="text-ink">{f.name}</span>
                      {f.notes ? (
                        <div className="mt-1 max-w-2xl text-[12px] leading-[1.5] text-muted">
                          {f.notes}
                        </div>
                      ) : null}
                    </Td>
                    <Td align="right" numeric className="whitespace-nowrap">
                      {f.value}{" "}
                      <span className="text-muted">{f.unit.replace("tCO2e", "tCO₂e")}</span>
                    </Td>
                    <Td align="right" numeric className="whitespace-nowrap">
                      {f.ncvGJPerTonne ? (
                        `${f.ncvGJPerTonne} GJ/t`
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td align="right" numeric>
                      {(f.uncertainty * 100).toFixed(0)}%
                    </Td>
                    <Td className="text-[12.5px]">
                      {f.source}
                      <div className="text-[11.5px] text-muted">
                        {f.sourceRef} · {f.vintage}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div>
            <Card
              title="Data-quality rules"
              subtitle="Run on every recompute. The engine, not the model, owns these."
              padded={false}
            >
              <Table>
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Check</Th>
                    <Th>Severity</Th>
                  </tr>
                </thead>
                <tbody>
                  {RULE_CATALOGUE.map((r) => (
                    <tr key={r.code} className="hover:bg-surface-2">
                      <Td className="font-mono text-[12.5px] text-ink">{r.code}</Td>
                      <Td className="text-ink-2">{r.title}</Td>
                      <Td>
                        <Badge
                          tone={
                            r.severity.startsWith("blocker")
                              ? "critical"
                              : r.severity === "warning"
                                ? "warning"
                                : "accent"
                          }
                        >
                          {r.severity}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card
            title="Plausibility bands"
            subtitle="Used only by rule CP-003 to flag an intensity that is more likely a data error than a real plant."
            padded={false}
          >
            <div className="border-b border-line px-5 py-3">
              <Note tone="warning">{PLAUSIBILITY_NOTE}</Note>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th align="right">Direct</Th>
                  <Th align="right">Indirect</Th>
                  <Th align="right">Plausible direct range</Th>
                  <Th>Basis</Th>
                </tr>
              </thead>
              <tbody>
                {PLAUSIBILITY_BANDS.map((b) => (
                  <tr key={b.category} className="hover:bg-surface-2">
                    <Td className="text-ink">{CATEGORY_LABELS[b.category]}</Td>
                    <Td align="right" numeric>
                      {b.direct}
                    </Td>
                    <Td align="right" numeric>
                      {b.indirect}
                    </Td>
                    <Td align="right" numeric className="whitespace-nowrap">
                      {b.plausibleDirect[0]} – {b.plausibleDirect[1]}
                    </Td>
                    <Td className="max-w-md text-[12.5px] text-muted">{b.basis}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card
            title="Goods in scope"
            subtitle={`${GOODS.length} CN codes across ${sectors.length} sectors - the full Annex I list, taken from the Commission's benchmark table.`}
            padded={false}
          >
            <Table>
              <thead>
                <tr>
                  <Th>Sector</Th>
                  <Th align="right">CN codes</Th>
                  <Th>Obligation basis</Th>
                </tr>
              </thead>
              <tbody>
                {sectors.map((sector) => {
                  const goods = GOODS.filter((g) => g.sector === sector);
                  return (
                    <tr key={sector} className="hover:bg-surface-2">
                      <Td className="text-ink">{SECTOR_LABELS[sector]}</Td>
                      <Td align="right" numeric>
                        {goods.length}
                      </Td>
                      <Td>
                        <Badge tone={goods[0]?.directOnly ? "neutral" : "accent"}>
                          {goods[0]?.directOnly ? "Direct only (Annex II)" : "Direct + indirect"}
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          <Card title="Regulatory references">
            <ul className="space-y-2 text-[13.5px] leading-[1.6] text-ink-2">
              <li>
                <span className="text-ink">Regulation (EU) 2023/956</span>, as amended by Regulation
                (EU) 2025/2083 — establishes the CBAM. Annex I lists goods in scope; Annex II the
                goods for which only direct emissions count; Annex IV specific embedded emissions
                and precursors. The simplification added a 50-tonne annual threshold per importer
                and moved the first annual declaration to 30 September 2027.
              </li>
              <li>
                <span className="text-ink">Implementing Regulation (EU) 2025/2547</span> — the
                methodology for calculating embedded emissions in the definitive period.
              </li>
              <li>
                <span className="text-ink">
                  Implementing Regulations (EU) 2025/2620 and 2025/2621
                </span>{" "}
                — CBAM benchmarks for the free allocation adjustment, and default values (corrected
                by 2026/1740).
              </li>
              <li>
                <span className="text-ink">Article 9</span> — deduction for a carbon price already
                paid in the country of origin. Requires documentary evidence and confirmation that
                no rebate was received on export.
              </li>
              <li>
                <span className="text-ink">IPCC 2006 Guidelines, Volume 2</span> — default
                combustion emission factors and net calorific values.
              </li>
              <li>
                <span className="text-ink">CEA CO₂ Baseline Database</span> — Indian grid emission
                factors, published by the Central Electricity Authority.
              </li>
            </ul>
            <div className="mt-4">
              <Note tone="warning">
                This tool computes and documents an installation&apos;s embedded emissions. It does
                not file anything and it is not legal advice. Actual values can be used by an EU
                declarant only once verified by an accredited verifier.
              </Note>
            </div>
          </Card>
        </div>
      </Page>
    </>
  );
}
