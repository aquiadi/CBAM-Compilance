# Contributing

## The rule that matters

**The model never produces a number.**

`src/lib/cbam/` is pure and deterministic: no I/O, no network, no model calls. Every figure that
reaches a declaration comes from there. The LLM layer in `src/lib/ai/` maps columns, resolves
free-text materials and explains findings — its output is always a _proposal_, validated against the
engine's own tables before use (`validateMapping`, `merge`).

If you are about to let model output reach a calculation, stop.

## Conventions

- **Factors are data with provenance.** Emission factors, benchmarks and CN codes live in
  `src/lib/cbam/`. Adding one means adding its `source`, `sourceRef`, `vintage` and `uncertainty`
  too. A number without a source cannot be defended to a verifier.
- **Never silently drop a row.** `materialise` rejects with a reason and rule CP-013 surfaces the
  count. A row missing from a declaration is an understatement, and understatements carry penalties.
- **Never assume a unit.** `normaliseQuantity` throws rather than guess, and callers turn that into
  a rejected row. Reading MU as MWh is a 1000× error.
- **Chart colours come from `src/lib/palette.ts`**, which is a plain module on purpose — an export
  from a `"use client"` module read by a server component resolves to a client reference rather than
  the value, and paints the mark black. The palette _order_ is the colourblind-safety mechanism;
  re-run the validator before changing a hue.
- **Confidence must be calibrated.** It decides what a human is asked to review, so inflating it
  defeats the review step. The deterministic mapper caps itself at 0.90 for this reason.

## Before committing

```bash
make check   # lint, format, typecheck, fixture checksums, tests, mapping eval
```

That is exactly what CI runs, so "it passes locally" and "it passes in CI" mean the same thing.
`make help` lists every target.

The eval gate is the column **error** rate, not accuracy. A column mapped to the wrong field
corrupts a calculation silently; a column left unmapped surfaces in the UI and gets fixed in ten
seconds. Those two failures are not worth the same, so they are not scored the same.

Every eval run is appended to `artifacts/evals/history.jsonl` with the commit that produced it, and
the runner prints what moved since the last run. If you change the mapper, that delta is the
evidence your change helped.

## Changing the demo data

The demo fixtures are checksummed in `data/demo/manifest.json` and verified in CI, because the
figures quoted in the README were produced from those exact bytes. After an intentional change:

```bash
make seed    # regenerate fixtures, then refresh the manifest
```

Then re-check any figure quoted in the README — `make dev` and read the Overview screen.

## Project layout

See the layout section in [README.md](README.md).
