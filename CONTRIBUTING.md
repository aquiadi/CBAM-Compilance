# Contributing

## The rule that matters

**The model never produces a number.**

`src/lib/cbam/` is pure and deterministic: no I/O, no network, no model calls. Every figure that
reaches a declaration comes from there. The LLM layer in `src/lib/ai/` maps columns, resolves
free-text materials and explains findings — its output is always a _proposal_, validated against the
engine's own tables before use (`validateMapping`, `merge`).

If you are about to let model output reach a calculation, stop.

## Conventions

- **Regulatory data is imported, never typed in.** Benchmarks and default values come from the
  Commission's workbooks in `data/regulatory/source/` through `npm run regulatory:import`, which
  records each workbook's SHA-256 in the generated tables. Constants that come from the legal text
  (CBAM factor, mark-ups, published prices) live in `src/lib/cbam/regulatory/index.ts`, each beside
  the act and article it comes from.
- **Factors are data with provenance.** An emission factor needs its `source`, `sourceRef`,
  `vintage` and `uncertainty`. A number without a source cannot be defended to a verifier.
- **Never silently drop a row.** `materialise` rejects with a reason and rule CP-013 surfaces the
  count. A row missing from a declaration is an understatement, and understatements carry penalties.
- **Never assume a unit.** `normaliseQuantity` throws rather than guess, and callers turn that into
  a rejected row. Reading MU as MWh is a 1000× error.
- **Every change to a workspace goes through the store.** `src/lib/workspace/store.ts` writes with a
  version check and appends to the audit log in the same transaction. A route handler that writes
  state any other way bypasses both.
- **Every route checks its role.** Start a handler with `apiWorkspaceContext(request, { write:
true })` (or `roles: ["owner"]`) from `src/lib/auth/context.ts`; it also refuses cross-origin
  writes. Viewers and verifiers are read-only.
- **SQL runs on both drivers.** Tests use PGlite, production usually uses Postgres. Stick to
  standard Postgres SQL; a new table is a new entry in `src/lib/db/migrations.ts`, never an edit to
  an applied one.
- **Chart colours come from `src/lib/palette.ts`**, which is a plain module on purpose. An export
  from a `"use client"` module read by a server component resolves to a client reference rather
  than the value, and paints the mark black. The series are the light categorical steps validated
  against the white card surface; the palette _order_ is the colourblind-safety mechanism, so
  re-run the validator before changing a hue. Status colours used as text are the darker
  `STATUS_INK` steps, because the chart status steps are too light to read on white.
- **Design tokens live in `src/app/globals.css`.** The style is paper, ink and one blue, with
  generous space. Put new secondary detail behind a `Disclosure` rather than adding another card to
  the first screen.
- **Document reading is a proposal, like mapping.** `src/lib/ai/extract.ts` validates the model's
  reading and cross-checks it against the PDF's text. Lines then pass through a person and the
  ordinary ingest path (`src/lib/workspace/documents.ts`). Never let an extracted figure skip either
  step.
- **Both themes, every width.** Colours are CSS variables with a light and a dark value in
  `globals.css`; use the tokens (`bg-surface`, `text-ink`, `bg-inverse`...), never a hex or
  `text-white` in a component. Check a change with `SHOT_THEME=dark SHOT_DEVICE=phone npm run
screenshots`, which also fails if a page scrolls sideways.
- **Keep the guided tour working.** Its steps (`src/components/tour.tsx`) point at `data-tour`
  attributes. If you move or rename one of those elements, move the attribute with it; a missing
  target falls back to a centred card, but the step then loses its highlight.
- **Confidence must be calibrated.** It decides what a human is asked to review, so inflating it
  defeats the review step. The deterministic mapper caps itself at 0.90 for this reason.

## Before committing

```bash
make check                 # lint, format, typecheck, fixture checksums, tests, mapping eval
make build && make start   # then, in another terminal:
make smoke                 # sign-up to verifier pack, over HTTP, against the production build
```

`make check` is exactly what CI's quality job runs, and CI runs the smoke test against Postgres, the
embedded database and the container image. `make help` lists every target.

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

Then re-check every figure quoted in the README: run `make dev`, open the demo, and read the
Declaration screen before and after excluding the two seeded defects.

## Project layout

See the layout section in [README.md](README.md).
