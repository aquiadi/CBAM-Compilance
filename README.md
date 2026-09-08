# CarbonPass AI

**CBAM compliance for Indian exporters. Messy production data in, a defensible emissions declaration out.**

From 1 January 2026 the EU's Carbon Border Adjustment Mechanism stops being a reporting exercise
and starts costing money. An Indian steel, aluminium, cement or fertiliser exporter has to tell
their EU importer how much CO₂ is embedded in every tonne they ship, prove it, and watch that
number get multiplied by an EU ETS certificate price on a schedule that reaches 100% by 2034.

The data needed to answer that question already exists. It is spread across an SAP consumption
extract, a DISCOM electricity bill, a despatch register and a WhatsApp message from the sponge iron
vendor — in tonnes, kilolitres, million units and lakhs, with the units in a different column from
the numbers.

CarbonPass turns that into a declaration a verifier will accept, and shows its working for every
figure.

---

## The core design decision: the model never touches a number

This is a compliance tool. A wrong figure is not a bad user experience, it is a misdeclaration with
a penalty attached. So the architecture puts a hard wall down the middle:

| The model does | The engine does |
| --- | --- |
| Map "Qty Consumed" to a canonical field | Convert 19,240.80 MT of coal to 18 TJ to 1,702.8 tCO₂e |
| Notice the unit column says MU, not MWh | Apply Annex IV to get specific embedded emissions |
| Resolve "NON COKING COAL (G11)" to a factor id | Decide whether the declaration is filable |
| Rank findings and explain them in plain English | Raise, keep and clear the findings themselves |
| Draft the methodology memo | Own every figure in it |

**Everything the model returns is a proposal, validated against the engine's own tables before use.**
A hallucinated factor id is dropped and reported as a warning, never applied. A triage comment on a
finding the rules engine never raised is discarded. A blocker cannot be demoted below a warning no
matter how the model ranked it. Those guarantees are tested in
[`src/lib/ai/guardrails.test.ts`](src/lib/ai/guardrails.test.ts), which feeds deliberately bad model
output through the validators and asserts it is contained.

The second consequence: **the whole product works with no API key.** Every AI step has a
deterministic fallback, the UI labels which one produced each result, and the demo below runs
start to finish offline. A compliance tool that stops working when an upstream API is down is not a
compliance tool.

---

## What it does, on the seeded demo

The demo is a mid-size Chhattisgarh secondary steel producer on the coal-DRI + induction furnace
route — the shape of most Indian steel exposed to CBAM. Sponge iron is made and consumed on site,
billets feed a rebar mill, and the rebar is what ships to Europe.

Five files, 120 rows, straight out of the plant's systems. They contain seven deliberate defects,
each of which something in the pipeline is supposed to catch:

1. Electricity metered in **MU** (million units). Read as MWh, that understates power by 1000×.
2. One coal row exported in **kg** while the UOM column still says MT.
3. A duplicated fuel delivery.
4. A missing month of electricity data.
5. Sponge iron from a vendor who has supplied no CBAM communication, so a marked-up default applies.
6. A non-CBAM CN code sitting in the despatch register.
7. Indian digit grouping, `-`/`NA` nulls, and vendor/GRN noise columns throughout.

**On load** the engine produces 145 activity records and refuses to call the declaration filable:

```
chargeable emissions   3,34,22,025 tCO₂e      readiness  80 / 100 — Not filable
exposure at €78/cert   €65,172,948            findings   3 blocking, 4 warning, 2 info
```

Three blockers, all CP-003: the calculated intensities are 115×, 123× and 188× outside the
plausible band for their goods category. A plant is not 188× dirtier than every other plant; that
is a data error, and the rule says so rather than filing it.

**The operator opens Review, sees the outlier finding pointing at
`fuel_consumption_register.csv` row 25, confirms it against the source system and excludes it.**
Everything recomputes:

```
chargeable emissions      157,894 tCO₂e       readiness  89 / 100 — Verification ready
exposure at €78/cert     €307,892             findings   0 blocking, 3 warning, 2 info
```

| CN code | Goods | SEE direct (tCO₂e/t) | vs benchmark |
| --- | --- | --- | --- |
| 7213 10 00 | TMT rebar | 1.951 | −11% |
| 7207 11 00 | MS billets | 1.791 | −13% |
| 7203 10 00 | Sponge iron (DRI) | 1.935 | −1% |

A single misread unit was worth €64.9M of phantom exposure. Finding it is the product.

The excluded record is not deleted — it stays in the audit trail with the operator's reason
attached, because "why is this row not in the declaration" is the first thing a verifier asks.

---

## Methodology

Calculations follow Regulation (EU) 2023/956 and Implementing Regulation (EU) 2023/1773.

- **Direct emissions** (Annex III): fuel combustion via net calorific value × combustion factor,
  plus process emissions from carbonates and electrodes, plus measurable heat imported, less heat
  exported.
- **Indirect emissions**: electricity consumed × the emission factor of the supply.
- **Specific embedded emissions** (Annex IV): `(attributed emissions + Σ precursor mass × precursor SEE) ÷ activity level`.
  Where one process yields several CN codes, emissions are allocated by mass.
- **On-site precursors**: goods made and consumed inside the installation are resolved in
  dependency order — sponge iron before steel, steel before rebar — so a downstream product carries
  what was actually spent upstream. Without this the rebar mill looks nearly emission-free, because
  it only burns reheating fuel while every real tonne of CO₂ sits two processes upstream.
- **Annex II**: for iron & steel, aluminium and hydrogen only *direct* emissions create a
  certificate obligation. Indirect emissions are still reported in full — operators routinely read
  "not counted" as "not reported", and it is not.
- **EU-bound volume only**: certificates are due on what ships to the EU, not on what the plant
  produced. Charging total production would count on-site precursors twice.
- **Carbon price paid at origin** (Art. 9): deductible, capped at the certificate price, and
  refused outright without documentary evidence. India has no qualifying economy-wide scheme today.
- **CBAM factor**: 2.5% in 2026 rising to 100% in 2034, mirroring the EU ETS free-allocation
  phase-out. A tonne saved in 2026 is worth 2.5% of a tonne saved in 2034, which is the honest
  answer to "should I invest in abatement now".

Emission factors are IPCC 2006 Vol. 2 defaults and CEA CO₂ Baseline Database grid factors, each
carrying its source, edition and uncertainty. The full library, the rule catalogue and the CN code
list are rendered in the app at `/methodology` — an operator being asked to sign a legal declaration
should be able to read the whole rulebook without opening the source.

One India-specific adjustment worth calling out: the coal NCV is set to 18.0 GJ/t rather than the
IPCC 25.8 GJ/t default, which assumes internationally traded bituminous coal and overstates energy
input from high-ash Indian domestic supply by roughly 40%.

### On the benchmark values

The app compares each calculated intensity to a sector benchmark. **Those benchmarks are indicative
figures assembled from public literature, not the Commission's published default values**, and the
app says so next to every comparison and in every export. They exist to catch an implausible number,
never to substitute for primary data in a filed declaration. Shipping a near-miss that looks
official would be worse than shipping nothing.

---

## Evals

The schema mapper is the one component where a model earns its place, so it is measured rather than
assumed. `npm run eval` scores nine hand-built cases against the deterministic baseline;
`npm run eval:model` adds a column for the LLM mapper.

Column mapping is scored as three numbers, not one, because the two ways of being wrong cost very
different amounts:

- **error rate** — a column given the *wrong* field. Corrupts a calculation silently. This is the
  gate: the suite fails above 15%.
- **miss rate** — a column left unmapped. Surfaces in the UI and gets fixed by a human in ten
  seconds.
- **confidence on errors** — calibration. A mapper that is confidently wrong defeats the review
  step that confidence exists to drive.

Current baseline:

```
column accuracy    98.6%     dataset kind      88.9%
column ERROR rate   0.0%     unit resolution  100.0%
column miss rate    1.4%     value resolution  86.7%
```

The two open failures are deliberate headroom, not oversights. `DOLOCHAR` is spent kiln char — a
carbonaceous fuel — but it contains the substring `dolo`, so keyword matching confidently files it
as dolomite and applies a carbonate factor to a fuel. The correct answer when nothing in the library
fits is `null`, which routes it to a human. That is a semantic judgement, and it is exactly the kind
of case the model should win.

---

## Running it

```bash
npm install
npm run dev            # http://localhost:3000, seeded with the demo dataset
```

No API key needed. To enable the model:

```bash
cp .env.example .env
# set the model API key
```

Then **Re-map with AI** on any file in Ingest, **Triage with AI** in Review, and **Generate memo**
in Declaration switch from the deterministic path to the LLM. The UI badges which engine produced
every result.

```bash
npm run check          # typecheck + 70 tests + eval
npm run test           # vitest
npm run eval           # mapping eval, deterministic baseline
npm run eval:model     # adds the LLM column (needs a key)
npm run seed           # regenerate the demo fixtures
npm run screenshots    # drive the running app in Chromium and capture every screen
npm run build          # production build
```

Workspace state lives in a gitignored `.data/workspace.json`. Delete it, or `POST /api/reset`, to
restore the demo with every seeded defect intact.

---

## Layout

```
src/lib/cbam/          The engine. Pure functions, no I/O, no model calls.
  types.ts             Domain model. Every quantity carries lineage to a source row.
  units.ts             Unit and number normalisation — MU, MT, KL, lakh grouping.
  factors.ts           Emission factors with source, vintage and uncertainty.
  goods.ts             CN code catalogue and the Annex II direct-only flag.
  calc.ts              Attributed emissions and specific embedded emissions.
  internal.ts          On-site precursor flows, resolved in dependency order.
  cost.ts              CBAM factor schedule, certificates, Art. 9 credit.
  rules.ts             13 deterministic data-quality rules (CP-001 … CP-013).
  readiness.ts         Weighted to what a verifier tests first.
  declaration.ts       Assembly and the JSON / CSV / Registry-XML exports.

src/lib/ingest/        Messy world -> canonical schema.
  parse.ts             CSV parsing and column profiling.
  heuristic.ts         Deterministic mapper. Fallback, and the eval baseline.
  materialise.ts       Mapping + rows -> activity records. Rejects, never guesses.

src/lib/ai/            The model layer, all of it optional.
  mapper.ts            Structured-output column mapping + id validation.
  triage.ts            Finding triage + the merge that contains it.
  memo.ts              Streaming methodology memo, with a deterministic twin.

src/evals/             Gold fixtures, scorer, runner.
src/app/               Next.js App Router: 7 screens, 7 API routes.
data/demo/             The seeded dataset, regenerable via npm run seed.
```

---

## Limitations, stated plainly

- **It does not file anything.** It computes and documents a declaration. Submission to the CBAM
  Registry, and verification by an accredited verifier where the regime requires it, are still
  human steps. This is not legal advice.
- **The benchmark values are indicative, not the Commission's published defaults.** See above.
- **The Registry XML mirrors the quarterly report's structure but is not claimed schema-valid**
  against the DG TAXUD XSD, which is versioned and distributed separately.
- **The CN code catalogue is a working subset** of Annex I covering what Indian exporters ship in
  volume, not the complete list.
- **The model path is implemented and its guardrails are unit-tested, but it was not executed
  against the live API in this environment** — no credentials were available. The deterministic
  path is what every number and screenshot in this README came from.
- **Shared site activities are attributed by configured alias**, not allocated. Diesel for material
  handling lands on the DRI kiln because the installation config says so; a real deployment would
  want proper allocation across processes.
- **State is a JSON file**, which is the right size for a single installation and the wrong shape
  for a multi-tenant service. The seam is `src/lib/store.ts` and nothing else.
