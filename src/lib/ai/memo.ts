import type { DeclarationResult } from "../cbam/declaration";
import { getFactor } from "../cbam/factors";
import { getClient, MODEL, describeError } from "./client";

/**
 * The methodology memo.
 *
 * When a verifier arrives, the question is never "what is your number" - it is
 * "show me how you got it, and why I should believe it". This writes that
 * document.
 *
 * The model is given the computed declaration, not the raw data. It cannot
 * recompute anything, and it is instructed to use only figures present in its
 * input. Streamed, because it is long and a user watching a spinner for forty
 * seconds assumes the product is broken.
 */

const SYSTEM = `You write the methodology section of a CBAM emissions declaration, for an Indian installation operator to hand to their EU importer and, later, to an accredited verifier.

Absolute rules:

- Use ONLY figures that appear in the data you are given. Never calculate a new number, never round differently, never introduce a figure from your own knowledge of the industry. If something is not in the input, say it is not determined rather than estimating it.
- State the weaknesses. A memo that hides its data gaps fails verification the moment the verifier finds them, and they will. Every default value used, every month missing, every unresolved finding gets named.
- Cite the methodology properly: Regulation (EU) 2023/956 and Implementing Regulation (EU) 2023/1773, by Annex where relevant.
- No marketing language. No "robust", "comprehensive", "state of the art". A verifier reads this looking for overstatement.

Structure, using markdown headings:

## Scope and boundary
## Methodology
## Emission factors and data sources
## Specific embedded emissions
## Data quality and known limitations
## Basis of the certificate obligation

Write in plain professional English, roughly 600-900 words. Use the operator's actual process names.`;

function buildPrompt(result: DeclarationResult): string {
  const factorsUsed = new Set<string>();
  for (const em of result.emissions) {
    for (const group of [
      em.contributions.fuel,
      em.contributions.processMaterial,
      em.contributions.electricity,
      em.contributions.heat,
    ]) {
      for (const c of group) factorsUsed.add(c.factorId);
    }
  }

  const factorLines = [...factorsUsed]
    .map((id) => {
      try {
        const f = getFactor(id);
        return `- ${f.name}: ${f.value} ${f.unit}${f.ncvGJPerTonne ? `, NCV ${f.ncvGJPerTonne} GJ/t` : ""} (${f.source}, ${f.vintage}, uncertainty ±${(f.uncertainty * 100).toFixed(0)}%)`;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .join("\n");

  const processLines = result.emissions
    .map(
      (e) =>
        `### ${e.processName}${e.route ? ` (${e.route})` : ""}\n` +
        `- Activity level: ${e.activityLevelT.toFixed(0)} t\n` +
        `- Direct emissions: ${e.directT.toFixed(1)} tCO2e\n` +
        `- Indirect emissions: ${e.indirectT.toFixed(1)} tCO2e\n` +
        `- Bought-in precursor emissions: ${(e.precursorDirectT + e.precursorIndirectT).toFixed(1)} tCO2e\n` +
        `- On-site precursor emissions from upstream processes: ${(e.internalPrecursorDirectT + e.internalPrecursorIndirectT).toFixed(1)} tCO2e\n` +
        `- Lowest monitoring tier among inputs: ${e.lowestTier}\n` +
        `- Propagated uncertainty on direct emissions: ±${(e.directUncertainty * 100).toFixed(1)}%`,
    )
    .join("\n\n");

  const goodsLines = result.lines
    .map(
      (l) =>
        `- CN ${l.cnCode} (${l.description}): ${l.quantityT.toFixed(0)} t produced, ${l.quantityEuT.toFixed(0)} t to the EU. ` +
        `SEE direct ${l.seeDirect.toFixed(4)} tCO2e/t (own ${l.seeDirectOwn.toFixed(4)}, precursors ${l.seeDirectPrecursor.toFixed(4)}), ` +
        `SEE indirect ${l.seeIndirect.toFixed(4)}. Obligation basis: ${l.directOnly ? "direct only, Annex II" : "direct and indirect"}. ` +
        `Chargeable embedded emissions ${l.embeddedEuT.toFixed(1)} tCO2e.`,
    )
    .join("\n");

  const findingLines = result.findings
    .map((f) => `- ${f.code} [${f.severity}] ${f.title}: ${f.detail}`)
    .join("\n");

  return `# Installation

${result.installation.name}, operated by ${result.installation.operator}.
${result.installation.street}, ${result.installation.city}, ${result.installation.state} ${result.installation.postcode}, ${result.installation.country}.
Reporting period: ${result.period.start} to ${result.period.end} (${result.period.regime} regime).

# Production processes

${processLines}

# Emission factors applied

${factorLines}

# Goods and specific embedded emissions

${goodsLines}

# Installation totals

- Direct emissions: ${result.totals.directT.toFixed(1)} tCO2e
- Indirect emissions: ${result.totals.indirectT.toFixed(1)} tCO2e
- Bought-in precursor emissions: ${result.totals.precursorT.toFixed(1)} tCO2e
- Chargeable EU-bound embedded emissions: ${result.totals.obligationT.toFixed(1)} tCO2e
- Certificates required (${result.exposure.year}, CBAM factor ${(result.exposure.cbamFactor * 100).toFixed(1)}%): ${result.exposure.netCertificates.toFixed(1)}

# Data quality

Readiness score ${result.readiness.score}/100 (${result.readiness.band}).
${result.readiness.components.map((c) => `- ${c.label}: ${c.score.toFixed(0)}/100. ${c.detail}`).join("\n")}

# Open findings

${findingLines || "None."}

# Engine notes

${result.exposure.notes.map((n) => `- ${n}`).join("\n") || "None."}

Write the methodology memo.`;
}

/** Streams the memo as plain text chunks. */
export async function* streamMemo(result: DeclarationResult): AsyncGenerator<string> {
  const client = getClient();
  if (!client) {
    yield fallbackMemo(result);
    return;
  }

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: buildPrompt(result) }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      yield "\n\n---\n\n_The model declined to complete this memo. The deterministic summary follows._\n\n";
      yield fallbackMemo(result);
    }
  } catch (error) {
    yield `\n\n---\n\n_Memo generation fell back to the deterministic writer: ${describeError(error)}_\n\n`;
    yield fallbackMemo(result);
  }
}

/**
 * Deterministic memo.
 *
 * Not a placeholder - this is what ships when there is no API key, and it has
 * to be good enough to hand to a verifier on its own. It is less readable than
 * the model's version and says exactly the same things.
 */
export function fallbackMemo(result: DeclarationResult): string {
  const { installation, period, totals, exposure, readiness } = result;

  const processes = result.emissions
    .map(
      (e) =>
        `**${e.processName}**${e.route ? ` (${e.route})` : ""} produced ${e.activityLevelT.toLocaleString("en-IN", { maximumFractionDigits: 0 })} t ` +
        `with ${e.directT.toLocaleString("en-IN", { maximumFractionDigits: 0 })} tCO2e direct and ` +
        `${e.indirectT.toLocaleString("en-IN", { maximumFractionDigits: 0 })} tCO2e indirect emissions. ` +
        `Lowest monitoring tier among its inputs is ${e.lowestTier}; propagated uncertainty on direct ` +
        `emissions is ±${(e.directUncertainty * 100).toFixed(1)}%.`,
    )
    .join("\n\n");

  const goods = result.lines
    .map(
      (l) =>
        `| ${l.cnCode} | ${l.description} | ${l.quantityT.toLocaleString("en-IN", { maximumFractionDigits: 0 })} | ` +
        `${l.quantityEuT.toLocaleString("en-IN", { maximumFractionDigits: 0 })} | ${l.seeDirect.toFixed(4)} | ` +
        `${l.seeIndirect.toFixed(4)} | ${l.directOnly ? "Direct only (Annex II)" : "Direct + indirect"} |`,
    )
    .join("\n");

  const limitations = result.findings.length
    ? result.findings
        .map((f) => `- **${f.code}** (${f.severity}) ${f.title}. ${f.detail}`)
        .join("\n")
    : "- No open findings were raised by the rules engine.";

  return `## Scope and boundary

This memo covers ${installation.name}, operated by ${installation.operator}, at ${installation.city}, ${installation.state}, ${installation.country}, for the period ${period.start} to ${period.end} under the ${period.regime} regime.

The installation boundary comprises ${installation.processes.length} production processes: ${installation.processes.map((p) => p.name).join(", ")}. Goods produced and consumed on site are treated as precursors to the downstream process in accordance with Annex IV of Regulation (EU) 2023/956; their emissions are carried forward once and are not counted again in the installation total.

## Methodology

Emissions were determined using the calculation-based approach of Annex III to Regulation (EU) 2023/956, as implemented by Implementing Regulation (EU) 2023/1773.

Direct emissions are the sum of fuel combustion, process emissions from carbonate and carbon-bearing materials, and measurable heat crossing the installation boundary, with exported heat netted off. Fuel quantities were converted to energy using net calorific values, then multiplied by the applicable combustion emission factor. Indirect emissions are electricity consumed multiplied by the emission factor of the supply.

Specific embedded emissions were calculated per Annex IV as attributed emissions plus the embedded emissions of precursors, divided by the activity level of the process. Where a single process yields more than one CN code, attributed emissions were allocated across them by mass.

## Emission factors and data sources

${[
  ...new Set(
    result.emissions.flatMap((e) =>
      [
        ...e.contributions.fuel,
        ...e.contributions.processMaterial,
        ...e.contributions.electricity,
      ].map((c) => c.factorId),
    ),
  ),
]
  .map((id) => {
    try {
      const f = getFactor(id);
      return `- **${f.name}** — ${f.value} ${f.unit}${f.ncvGJPerTonne ? `, NCV ${f.ncvGJPerTonne} GJ/t` : ""}. Source: ${f.source}, ${f.sourceRef} (${f.vintage}). Uncertainty ±${(f.uncertainty * 100).toFixed(0)}%.`;
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .join("\n")}

## Specific embedded emissions

| CN code | Description | Produced (t) | To EU (t) | SEE direct | SEE indirect | Obligation basis |
| --- | --- | --- | --- | --- | --- | --- |
${goods}

${processes}

## Data quality and known limitations

Declaration readiness scored ${readiness.score}/100 (${readiness.band}), with ${readiness.blockers} blocking and ${readiness.warnings} warning findings open at the time of writing.

${limitations}

${result.disclaimer}

## Basis of the certificate obligation

Total emissions of the installation for the period were ${totals.directT.toLocaleString("en-IN", { maximumFractionDigits: 0 })} tCO2e direct and ${totals.indirectT.toLocaleString("en-IN", { maximumFractionDigits: 0 })} tCO2e indirect, with a further ${totals.precursorT.toLocaleString("en-IN", { maximumFractionDigits: 0 })} tCO2e embedded in bought-in precursors.

Of that, ${totals.obligationT.toLocaleString("en-IN", { maximumFractionDigits: 0 })} tCO2e is embedded in goods shipped to the European Union and forms the basis of the obligation. For goods listed in Annex II — iron and steel, aluminium and hydrogen — only direct emissions count towards the obligation, although indirect emissions are reported in full above.

Applying the ${exposure.year} CBAM factor of ${(exposure.cbamFactor * 100).toFixed(1)}%, ${exposure.netCertificates.toLocaleString("en-IN", { maximumFractionDigits: 1 })} certificates would be surrendered, costing EUR ${exposure.netCostEur.toLocaleString("en-IN", { maximumFractionDigits: 0 })} at an assumed certificate price of EUR ${exposure.etsPriceEur}.

${exposure.notes.map((n) => `> ${n}`).join("\n\n")}

---

_Generated by CarbonPass AI on ${new Date(result.computedAt).toISOString().slice(0, 10)} from the activity data listed in the audit trail. Every figure above is traceable to a source file and row._`;
}
