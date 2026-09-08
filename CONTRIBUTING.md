# Contributing

## The rule that matters

**The model never produces a number.**

`src/lib/cbam/` is pure and deterministic: no I/O, no network, no model calls. Every figure that
reaches a declaration comes from there. The LLM layer in `src/lib/ai/` maps columns, resolves
free-text materials and explains findings — its output is always a *proposal*, validated against the
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
  the value, and paints the mark black. The palette *order* is the colourblind-safety mechanism;
  re-run the validator before changing a hue.
- **Confidence must be calibrated.** It decides what a human is asked to review, so inflating it
  defeats the review step. The deterministic mapper caps itself at 0.90 for this reason.

## Before committing

```bash
npm run check    # typecheck + tests + mapping eval
```

The eval gate is the column **error** rate, not accuracy. A column mapped to the wrong field
corrupts a calculation silently; a column left unmapped surfaces in the UI and gets fixed in ten
seconds. Those two failures are not worth the same, so they are not scored the same.

## Project layout

See the layout section in [README.md](README.md).
