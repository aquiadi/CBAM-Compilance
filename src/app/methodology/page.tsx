import { FACTORS } from "@/lib/cbam/factors";
import { BENCHMARKS, BENCHMARK_DISCLAIMER } from "@/lib/cbam/defaults";
import { RULE_CATALOGUE } from "@/lib/cbam/rules";
import { CBAM_FACTOR_SCHEDULE } from "@/lib/cbam/cost";
import { GOODS, CATEGORY_LABELS } from "@/lib/cbam/goods";
import { Badge, Card, Note, Page, PageHeader, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Methodology.
 *
 * Every constant the engine uses, with its source, in one place. A tool that
 * asks an operator to sign a legal declaration owes them the ability to read
 * the whole rulebook without opening the source code.
 */
export default function MethodologyPage() {
  const sectors = [...new Set(GOODS.map((g) => g.sector))];

  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Methodology and sources"
        description={
          <>
            Every factor, benchmark and rule the engine applies, with its provenance. Nothing here
            is derived at runtime and nothing is model-generated — this is the rulebook the
            deterministic core runs on.
          </>
        }
      />

      <Page>
        <div className="space-y-5">
          <Card
            title="How a number is produced"
            subtitle="The division of labour between the engine and the model."
          >
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  The model may
                </h3>
                <ul className="space-y-1.5 text-[12px] leading-[1.6] text-ink-2">
                  <li>· Map a spreadsheet column to a canonical field</li>
                  <li>· Detect the unit a quantity is expressed in</li>
                  <li>· Resolve a free-text material to a factor id from a fixed list</li>
                  <li>· Rank findings and explain them in the operator&apos;s vocabulary</li>
                  <li>· Draft the methodology memo from the computed declaration</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  The model may not
                </h3>
                <ul className="space-y-1.5 text-[12px] leading-[1.6] text-ink-2">
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
                <span className="font-mono text-[11px]">src/lib/ai/guardrails.test.ts</span>.
              </Note>
            </div>
          </Card>

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
                    <Td className="whitespace-nowrap font-mono text-[10.5px] text-muted">{f.id}</Td>
                    <Td>
                      <span className="text-ink">{f.name}</span>
                      {f.notes ? (
                        <div className="mt-1 max-w-2xl text-[10.5px] leading-[1.5] text-muted">
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
                    <Td className="text-[11px]">
                      {f.source}
                      <div className="text-[10px] text-muted">
                        {f.sourceRef} · {f.vintage}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="grid grid-cols-2 gap-5">
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
                      <Td className="font-mono text-[11px] text-ink">{r.code}</Td>
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

            <Card
              title="CBAM factor schedule"
              subtitle="The share of embedded emissions requiring certificates, mirroring the EU ETS free-allocation phase-out."
              padded={false}
            >
              <Table>
                <thead>
                  <tr>
                    <Th align="right">Year</Th>
                    <Th align="right">CBAM factor</Th>
                    <Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(CBAM_FACTOR_SCHEDULE).map(([year, factor]) => (
                    <tr key={year} className="hover:bg-surface-2">
                      <Td align="right" numeric>
                        {year}
                      </Td>
                      <Td align="right" numeric>
                        {(factor * 100).toFixed(1)}%
                      </Td>
                      <Td className="text-[11px] text-muted">
                        {year === "2026"
                          ? "First year certificates are due"
                          : year === "2034"
                            ? "Free allocation fully withdrawn"
                            : ""}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card
            title="Sector benchmarks"
            subtitle="Used only to sanity-check a calculated intensity and to flag implausible figures."
            padded={false}
          >
            <div className="border-b border-line px-5 py-3">
              <Note tone="warning">{BENCHMARK_DISCLAIMER}</Note>
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
                {BENCHMARKS.map((b) => (
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
                    <Td className="max-w-md text-[11px] text-muted">{b.basis}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card
            title="Goods in scope"
            subtitle={`${GOODS.length} CN codes across ${sectors.length} sectors. A working subset of Annex I covering what Indian exporters actually ship.`}
            padded={false}
          >
            <Table>
              <thead>
                <tr>
                  <Th>CN code</Th>
                  <Th>Description</Th>
                  <Th>Category</Th>
                  <Th>Sector</Th>
                  <Th>Obligation basis</Th>
                </tr>
              </thead>
              <tbody>
                {GOODS.map((g) => (
                  <tr key={g.cnCode} className="hover:bg-surface-2">
                    <Td className="font-mono text-[11.5px] text-ink">{g.cnCode}</Td>
                    <Td className="text-ink-2">{g.description}</Td>
                    <Td className="text-[11px]">{CATEGORY_LABELS[g.category]}</Td>
                    <Td className="text-[11px] capitalize">{g.sector.replace("_", " & ")}</Td>
                    <Td>
                      <Badge tone={g.directOnly ? "neutral" : "accent"}>
                        {g.directOnly ? "Direct only (Annex II)" : "Direct + indirect"}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="Regulatory references">
            <ul className="space-y-2 text-[12px] leading-[1.6] text-ink-2">
              <li>
                <span className="text-ink">Regulation (EU) 2023/956</span> — establishes the CBAM.
                Annex I lists goods in scope; Annex II lists the goods for which only direct
                emissions count towards the obligation; Annex III sets out the determination of
                emissions; Annex IV sets out specific embedded emissions and precursors.
              </li>
              <li>
                <span className="text-ink">Implementing Regulation (EU) 2023/1773</span> — reporting
                obligations and methods during the transitional period, including the monitoring
                tiers and the treatment of measurable heat and electricity.
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
                This tool computes and documents a declaration. It does not file one, and it is not
                legal advice. Figures should be reviewed by the operator and, where the regime
                requires it, by an accredited verifier before submission.
              </Note>
            </div>
          </Card>
        </div>
      </Page>
    </>
  );
}
