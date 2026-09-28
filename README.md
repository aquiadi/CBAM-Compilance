# CarbonPass

[![CI](https://github.com/aquiadi/CBAM-Compilance/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aquiadi/CBAM-Compilance/actions/workflows/ci.yml?query=branch%3Amain)
[![Node](https://img.shields.io/badge/node-%3E%3D22-3987e5)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3987e5)](tsconfig.json)
[![License](https://img.shields.io/badge/license-MIT-6e7682)](LICENSE)

**CBAM emissions data for non-EU installations. Plant spreadsheets in; specific embedded
emissions, free-allocation adjustment and a verifier-ready evidence pack out.**

---

## What it is

The EU's Carbon Border Adjustment Mechanism entered its definitive period on 1 January 2026. An EU
importer of steel, aluminium, cement, fertilisers, hydrogen or electricity must buy and surrender
CBAM certificates for the emissions embedded in those goods. For each good the importer needs the
**specific embedded emissions** (SEE) of the installation that made it, verified by an accredited
verifier. Without verified figures the importer has to use the Commission's default values, which
carry a mark-up. The first annual declaration is due by **30 September 2027**.

CarbonPass is for the operator of that installation: the Indian steel plant, the aluminium smelter,
the fertiliser unit. Its data sits in an SAP consumption extract, a DISCOM electricity bill and a
despatch register. It turns that data into the figures an importer and a verifier need, with every
number traceable to the source file and row it came from.

**What it does:**

- **Ingest.** Upload CSV or Excel exports as they come out of the plant's systems. It finds the
  header row and sheet, maps columns to a canonical schema (a model if configured, otherwise a
  deterministic mapper), and shows you the mapping to review before any row counts. Units are never
  assumed: a row with no unit, or an unrecognised one, is rejected with a reason.
- **Read documents.** Fuel invoices, electricity bills, material receipts and weighbridge slips,
  as PDFs, scans or phone photos. With a model key (Claude, or Groq's free tier), the model reads each document into proposed line
  items. Every item comes with the words it was read from, and a PDF's figures are cross-checked
  against the document's own text; a figure the model reports but the text does not contain is
  flagged. A person checks every line next to the document. Only then does it become a draft
  dataset, which still goes through mapping, unit resolution, the rules and confirmation like any
  spreadsheet. Without a key the same screen is for typing the figures in. Either way the document
  is kept as evidence and linked to what was read from it. Choose several documents at once and
  they are read and checked one after another. Indian trade names (LDO, LSHS, HSD, FO) are
  recognised when figures are matched to emission factors.
- **Calculate.** It applies the definitive-period methodology (Implementing Regulation (EU)
  2025/2547) to reach attributed emissions per process, then specific embedded emissions per CN
  code, resolving on-site precursors in dependency order: DRI → billets → rebar.
- **Free allocation.** It computes the benchmark-based free allocation adjustment (SEFA) per good
  from the Commission's benchmark table (IR 2025/2620) and the CBAM factor for each year. It
  compares each good against the official default value for the country of origin (IR 2025/2621,
  corrected by 2026/1740).
- **Certificates and cost.** Obligation = (SEE − SEFA) × EU-bound tonnes, less any carbon price
  paid at origin (Art. 9), priced at the Commission's published quarterly price. It shows the
  trajectory to 2034 against what the same goods would cost on default values.
- **Check.** It runs 20 data-quality rules (unit outliers, duplicates, gaps, implausible
  intensities, unverified precursor data, non-CBAM CN codes, missing installation details). Each
  finding has a severity. Blocking findings cannot be waved away; the fix is to exclude a row with a
  recorded reason, or to correct the data.
- **Suppliers.** It sends precursor suppliers a private link where they submit their SEE, SEFA and
  verification status, with evidence. Accepted submissions replace default values in the
  calculation. A supplier that sends its CBAM communication as a PDF or spreadsheet screenshot
  instead can be read the same way as a bill: the model proposes CN code, SEE and SEFA per good,
  each figure is checked against the document's text, and a person confirms before the values are
  applied and the document is filed as evidence.
- **Evidence and outputs.** It exports:
  - an emissions report (.xlsx), structured after the Commission's communication template;
  - the communication data as JSON;
  - a monitoring-methodology document;
  - a **verifier pack** (.zip) holding every export, every source file and every piece of evidence,
    each with a SHA-256 checksum.
- **Ask the regulation.** Questions answered from the CBAM texts by an
  [evalgate](https://github.com/aquiadi/CI-harness) service: every claim cites a passage, every
  citation is checked against what was retrieved, and the passages sit under the answer to read.
- **Teams.** Organisations, several installations and years each, and four roles: owner, editor,
  viewer and verifier. An append-only activity log records who changed what. Forgotten passwords
  are reset by e-mail when mail is configured; without mail, an owner creates a one-time reset link
  for the member and passes it on.

## Finding your way around

- **`/`** is a public landing page: what CarbonPass does, who it is for, and how the app is laid out.
- **Sign up**, then choose **Open the demo**. A **guided tour** starts on its own. It walks the
  workflow across pages, one highlighted element at a time, with Back, Next and Skip (the arrow keys
  and Esc work too). Replay it any time from **Guided tour** at the bottom of the menu.
- **The menu is the workflow**: Overview, then five numbered steps (Data, Review, Calculate,
  Declaration, Audit trail). Suppliers, evidence, the activity log, methodology, team and plant
  settings sit under **More**.
- **Overview** always shows readiness, the single next step and the three figures that matter.
  Charts and tables that explain them are folded under **More detail**.
- **Light, dark or automatic**: the switch is at the bottom of the menu (and top right on the landing
  and sign-in pages). Automatic follows the device.
- **Any screen**: on phones and tablets the menu slides in from the ☰ button, and every page
  reflows to one column.

## The demo

"Open the demo" after signing up loads Raigarh Works, a DRI–EAF steel plant in Chhattisgarh. It
reports eight months of exports (Jan–Aug 2026, five files, 137 records) and a seeded set of defects:

| On the demo                           | Before the operator acts                        | After two exclusions (with reasons) |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| Coal row exported in **kg**, UOM "MT" | Rebar at 401.9 tCO₂e/t: three blocking findings | 2.34 tCO₂e/t, blockers cleared      |
| 2026 certificates (Jan–Aug)           | 33.4 million (€2.51 bn)                         | **159,017 (€11.96 M)**              |
| Same goods on default values          | —                                               | 282,167 certificates (€21.23 M)     |
| Readiness                             | 82 / 100, not filable                           | 89 / 100, defensible                |

After the fixes, SEE against the Commission default values for India, and SEFA per good:

| CN code    | Good    | SEE (direct, counted) | Default value (2026) | SEFA 2026 |
| ---------- | ------- | --------------------- | -------------------- | --------- |
| 7203 10 00 | DRI     | 1.935 tCO₂e/t         | 4.620                | 0.288     |
| 7207 11 14 | Billets | 2.183 tCO₂e/t         | 4.697                | 0.350     |
| 7214 20 00 | Rebar   | 2.336 tCO₂e/t         | 4.697                | 0.392     |

Ferro-silicon (7202 21 00) is correctly recorded as outside CBAM: of the ferro-alloys, Annex I
covers only ferro-manganese, ferro-chromium and ferro-nickel. Workshop spares despatched under a
machinery code (8455 90 00) are flagged as not a CBAM good. The remaining warnings are real and left
open on purpose:

- electricity data covers 7 of 8 months;
- the period covers 8 of 12 months;
- 8 precursor rows fall back to default values;
- one supplier's data is unverified;
- the installation has no UN/LOCODE.

---

## Deploy it

It is one Next.js app and one Postgres database. There is nothing else to run.

### Vercel

1. **Import the repository**: vercel.com → _Add New_ → _Project_ → pick this repo. Vercel detects
   Next.js; keep the defaults and deploy. The first deployment shows a _Connect a database_ page,
   which is expected.
2. **Add a database**: in the project, open _Storage_ → _Create Database_ → **Neon** (Serverless
   Postgres; the free plan is enough), and connect it to all environments. This sets `DATABASE_URL`
   for you.
3. **Optional settings**: under _Settings_ → _Environment Variables_:
   - `APP_URL`: your deployment URL, used in invitation and supplier links.
   - `CARBONPASS_SIGNUP=invite`: set this once your own account exists.
   - `ANTHROPIC_API_KEY`: switches document reading, the column mapper, triage and memo to Claude.
     For a free start, set `GROQ_API_KEY` instead (see [Free AI with Groq](#free-ai-with-groq)).
4. **Redeploy** (_Deployments_ → ⋯ → _Redeploy_). Tables are created on the first request. Open the
   URL, create an account, and choose **Open the demo**.

Vercel's filesystem is not persistent and its functions share no memory. On Vercel the app
therefore refuses to start without `DATABASE_URL` and tells you why; it never silently loses data.
Uploads are capped at 4 MB there because Vercel limits request bodies to 4.5 MB.

### Railway

The repo ships a [`railway.json`](railway.json). Railway builds the [`Dockerfile`](Dockerfile) and
health-checks `/api/health`, which only answers once the database is reachable and migrated.

1. **Create the service**: railway.com → _New Project_ → _Deploy from GitHub repo_ → pick this repo.
2. **Add Postgres**: in the project, _+ Create_ → _Database_ → _PostgreSQL_.
3. **Connect it**: in the app service's _Variables_, add `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
4. **Give it a URL**: under _Settings_ → _Networking_ → _Generate Domain_. Set `APP_URL` to that
   address (with or without `https://`), or leave it unset: on Railway the app uses the service's
   public domain.
5. **Deploy.** Open the domain, create an account, and open the demo.

**No database service?** The image also runs on its embedded Postgres. Attach a volume mounted at
`/app/.data` and leave `DATABASE_URL` unset. Railway mounts volumes as root while the image runs as
an unprivileged user, so also set `RAILWAY_RUN_UID=0`. Run a single replica in that mode.

### Docker, anywhere

```bash
docker compose up --build        # app + Postgres 17 on http://localhost:3000
```

Or run the image on its own, with the embedded database kept in a volume:

```bash
docker build -t carbonpass .
docker run -p 3000:3000 -v carbonpass-data:/app/.data carbonpass
```

### Locally

```bash
npm ci
npm run dev                      # http://localhost:3000, embedded database under ./.data
```

No database, API key or configuration file is needed. Set `DATABASE_URL` to use a real Postgres.

### Configuration

Every variable is optional except `DATABASE_URL` on Vercel. [`src/config/env.ts`](src/config/env.ts)
validates them all at startup; a bad value stops the process with the variable named.
[`.env.example`](.env.example) documents each one.

| Variable                   | Default               | Purpose                                                                     |
| -------------------------- | --------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`             | embedded database     | Postgres connection string. `POSTGRES_URL` is accepted as well              |
| `CARBONPASS_DATA_DIR`      | `.data`               | Where the embedded database lives when `DATABASE_URL` is unset              |
| `CARBONPASS_SIGNUP`        | `open`                | `invite` allows new accounts only through an invitation link                |
| `APP_URL`                  | from the request      | Base URL for invitation and supplier links                                  |
| `CARBONPASS_MAX_UPLOAD_MB` | `4`                   | Largest accepted upload                                                     |
| `ANTHROPIC_API_KEY`        | unset                 | Enables document reading, and the model for mapping, triage, memo           |
| `CARBONPASS_MODEL`         | `claude-opus-5`       | Model used when a key is set                                                |
| `GROQ_API_KEY`             | unset                 | The free option, used when `ANTHROPIC_API_KEY` is unset                     |
| `GROQ_MODEL`               | `openai/gpt-oss-120b` | Groq model for text, PDFs, mapping, triage and memo                         |
| `GROQ_VISION_MODEL`        | `qwen/qwen3.8-27b`    | Groq model for photos                                                       |
| `EVALGATE_URL`             | unset                 | An evalgate service for "Ask the regulation"                                |
| `EVALGATE_API_KEY`         | unset                 | Sent as `x-api-key` when the evalgate service requires one                  |
| `SMTP_URL`                 | unset                 | `smtps://user:pass@host:465`: e-mails invitations, supplier and reset links |
| `MAIL_FROM`                | unset                 | Sender, e.g. `CarbonPass <cbam@yourplant.in>`; needed with `SMTP_URL`       |
| `CARBONPASS_ETS_PRICE_EUR` | `75`                  | Price for quarters not yet published; each workspace can override           |
| `CARBONPASS_INR_PER_EUR`   | `92`                  | For showing cost in rupees                                                  |

### Free AI with Groq

To try the AI steps without paying, use [Groq](https://console.groq.com)'s free tier:

1. Sign in at console.groq.com (no card needed) and create an API key under _API Keys_.
2. Add it to your deployment as `GROQ_API_KEY` (Railway: the service's _Variables_ tab; Vercel:
   _Settings_ → _Environment Variables_) and redeploy. Leave `ANTHROPIC_API_KEY` unset.

The app then labels every AI answer with the Groq model that produced it. Compared with Claude:

- **PDFs are read from their text layer.** Groq has no PDF input. Scanned PDFs have no text, so
  upload photos of their pages instead.
- **Photos go to a smaller vision model** and must be under 4 MB.
- **Column mapping stays rule-based.** On the mapping eval the free model matched the rule-based
  mapper on columns (98.6%) but resolved fewer materials (66.7% against 100%) and filed DOLOCHAR, a
  fuel, as dolomite. So on Groq the model reads documents, triages findings and writes the memo,
  and spreadsheets are mapped by rules. `npm run eval -- --model` re-measures it.
- **Free-tier rate limits.** At the time of writing each model allows 8,000 tokens a minute and
  1,000 requests a day. A document takes about 2,000 tokens, so expect three or four a minute; the
  app waits up to 30 seconds when Groq asks it to. When a limit is still hit it says so and falls
  back: documents open for manual entry, mapping uses the rule-based mapper, the memo uses the
  deterministic writer.
- **Check Groq's data terms** before sending customer documents.

Every answer still goes through the same checks: schema validation, figures looked up in the
document's text, and a person confirming each line. Switching to Claude later is one variable.

---

## Methodology

Implemented against the definitive-period acts. Each constant carries its source in code, and the
app renders the full set at `/methodology`.

| What                                          | Source                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Scope, obligation, Art. 9 carbon price credit | Regulation (EU) 2023/956, as amended by Regulation (EU) 2025/2083           |
| Calculation of embedded emissions             | Implementing Regulation (EU) 2025/2547                                      |
| Benchmarks, CBAM factor, free allocation      | Implementing Regulation (EU) 2025/2620 (Commission table of 06.02.2026)     |
| Default values and mark-ups                   | Implementing Regulation (EU) 2025/2621, corrected by (EU) 2026/1740         |
| Verification                                  | Implementing Regulation (EU) 2025/2546, Delegated Regulation (EU) 2025/2551 |
| Certificate price                             | Implementing Regulation (EU) 2025/2548 (published 2026 quarterly prices)    |

- **Attributed emissions per process**: fuel combustion (activity × NCV × emission factor ×
  oxidation), process emissions from carbonates and electrodes, measurable heat imported less
  exported, and electricity for indirect emissions.
- **Specific embedded emissions**: (attributed emissions + Σ precursor mass × precursor SEE) ÷
  activity level. On-site precursors are resolved in dependency order. Bought-in precursors use
  supplier actuals when a supplier has submitted them, and otherwise the default value for their
  country of origin.
- **Direct only for iron and steel, aluminium and hydrogen** (Annex II). Indirect emissions are
  still reported in full; they just do not create an obligation.
- **Free allocation adjustment**: `SEFA = CBAM factor × CSCF × benchmark + Σ precursor mass ×
precursor SEFA`.
  - The benchmark comes from column A of the Commission table, chosen by production route and year.
  - Where default values are used, column B applies with the route from the default-value table.
- **CBAM factor** (the share of free allocation still granted): 97.5% in 2026, 95% in 2027, 90% in
  2028, 77.5% in 2029, 51.5% in 2030, 39% in 2031, 26.5% in 2032, 14% in 2033, 0% from 2034. CSCF is 1.
- **Certificates** = Σ max(0, SEE − SEFA) × EU-bound tonnes − carbon price credit. The price is the
  Commission's for published quarters (2026-Q1 €75.36, 2026-Q2 €75.28) and your assumption for the
  rest.
- **Default values** include the mark-up: 10% in 2026, 20% in 2027, 30% from 2028 (1% for
  fertilisers).
- **Output made and consumed on site** carries its emissions downstream as a precursor. It is never
  charged twice.

The benchmark and default-value tables are imported from the Commission's workbooks by
`npm run regulatory:import`. The workbooks are committed under `data/regulatory/source/` with their
SHA-256, so the import is reproducible. To update, replace a workbook and re-run the import;
nothing in the engine is edited by hand.

One India-specific adjustment: the coal NCV is 18.0 GJ/t rather than the IPCC 25.8 GJ/t default.
The IPCC value assumes internationally traded bituminous coal and overstates the energy content of
high-ash domestic coal by about 40%.

---

## Architecture

```mermaid
flowchart TB
    subgraph IN["Plant data"]
        A["CSV / XLSX exports<br/>SAP · DISCOM bills · despatch register"]
        S["Supplier portal<br/>precursor SEE, SEFA, verification"]
        V["Evidence<br/>reports, bills, certificates"]
    end

    subgraph ING["Ingest - src/lib/ingest"]
        B["Header + sheet detection<br/>column profiling"]
        C["Mapper<br/>model or deterministic"]
        F["VALIDATION GATE<br/>fields, factors, processes<br/>checked against engine tables"]
        R["Operator review<br/>draft → confirmed"]
    end

    subgraph ENG["Engine - src/lib/cbam (pure: no I/O, no clock, no model)"]
        T["Commission tables<br/>benchmarks · default values"]
        I["Attributed emissions"]
        K["SEE per CN code<br/>precursors in order"]
        SF["SEFA<br/>benchmark × CBAM factor"]
        L["20 rules · readiness"]
        N["Certificates · cost<br/>2026 → 2034"]
    end

    subgraph OUT["Outputs"]
        O["Emissions report .xlsx · communication JSON · CSV"]
        P["Monitoring methodology · verifier pack .zip"]
        Q["Audit trail: every figure → file and row"]
    end

    DB[("Postgres<br/>workspaces · files · audit log")]

    A --> B --> C --> F --> R --> I
    S --> K
    T --> K
    T --> SF
    I --> K --> SF --> N
    K --> L
    N --> O
    L --> P
    R --> Q
    V --> P
    R -.-> DB
    S -.-> DB
    V -.-> DB

    classDef gate fill:#3a2418,stroke:#d95926,color:#f2f4f7
    classDef engine fill:#16241e,stroke:#199e70,color:#e6e9ee
    class F gate
    class T,I,K,SF,L,N engine
```

### The model never produces a number

This is a compliance tool, and a wrong figure is a misdeclaration.

- **What the model may do**: map a column, resolve "NON COKING COAL (G11)" to a factor id, rank
  findings and explain them, draft the methodology memo from figures the engine has already
  computed.
- **What stays in the engine**: every conversion, every emission, SEE, SEFA, certificate and euro.

Model output is a proposal. It is validated against the engine's own tables, and anything it
invents is dropped and reported. Two tests enforce this:
[`guardrails.test.ts`](src/lib/ai/guardrails.test.ts) feeds deliberately bad model output through
the validators; [`architecture.test.ts`](src/lib/cbam/architecture.test.ts) fails the build if an
engine file imports the AI layer, reads the environment, touches the network or filesystem, or reads
the clock.

**The whole product works without an API key.** Every AI step has a deterministic twin, and the UI
says which one produced each result.

### Storage and security

- **One Postgres database holds everything**: accounts, organisations, workspaces, uploaded files,
  evidence and the audit log. A deployment is therefore one app and one database.
- **Database drivers**: node-postgres when `DATABASE_URL` is set; otherwise PGlite, an embedded
  Postgres compiled to WebAssembly.
- **Migrations** run on first request under an advisory lock, so several instances can start at
  once.
- **Workspace state** is one JSONB document per installation and year, written with a
  version-checked compare-and-swap. Two people editing at once cannot overwrite each other silently.
- **Passwords** are hashed with scrypt.
- **Sessions** are random tokens stored hashed, in `HttpOnly`, `SameSite=Lax` cookies that are
  `Secure` over HTTPS.
- **Writes** are refused unless they come from the app's own origin.
- **Sign-in** is rate-limited per IP and per e-mail, and **sign-up** per IP.
- **Password resets** are one-time tokens stored hashed: an hour when e-mailed, a day when an owner
  issues one. The forgot-password form answers the same whether or not the address has an account.
  Using a reset signs the person out everywhere.
- **Responses** carry a strict Content-Security-Policy and `frame-ancestors 'none'`.
- **Roles** are checked on every route. Viewers and verifiers can read and download but cannot
  change anything.
- **The supplier portal** needs no account. Each request gets an unguessable link that expires
  and can be revoked. The supplier can correct a submission until you accept or reject it.

### Backups

Everything lives in the one database, so backing up the database backs up the product.

- **Railway Postgres**: enable backups on the Postgres service (Backups tab), or run
  `pg_dump "$DATABASE_URL" > carbonpass.sql` on a schedule.
- **Neon (Vercel)**: point-in-time restore is built in; its window depends on the plan.
- **Embedded database** (Docker or a single server): stop the app and copy `CARBONPASS_DATA_DIR`,
  or mount it on a volume that is snapshotted.
- **A readable copy per workspace**: the verifier pack (Outputs) holds every source file, every piece
  of evidence and every export with checksums. Download it at each milestone; it is also the record
  to hand over if you ever leave the tool.

Restore by pointing `DATABASE_URL` at the restored database; migrations only ever add.

---

## Quality gates, the evalgate way

CarbonPass uses [evalgate](https://github.com/aquiadi/CI-harness) twice: its CI discipline gates
document reading here, and its service answers regulation questions in the app.

### The document-reading gate

A model that reads bills needs a number behind it, and that number needs to hold on every change.
The gate follows evalgate's design:

- **A labelled corpus.** `evals/documents/` holds ten made-up documents in the layout of Indian
  plant paperwork, PDFs and phone photos, each built around a trap: kVA demand beside kWh consumed,
  meter readings, gross and tare beside net weight, MU, lakh grouping, rupee amounts beside every
  quantity, a CN code printed next to a quantity, a figure struck through in ink.
  `labels.json` records what a person would enter from each.
- **Cassettes.** Every model call is recorded once as a reviewable JSON file (`cassettes/`).
  Pull requests replay them: no key, no network, the same result every run, in under a second. A
  call with no cassette is an error, never a network request, so a changed prompt, model or schema
  fails until someone re-records, and what the model now says arrives as a diff to read.
- **A frozen baseline** (`baseline.json`). Missing data fails; a changed corpus, provider or model
  fails as "not comparable" instead of producing a number; every metric has its own floor.
- **A nightly live run** (`.github/workflows/nightly.yml`) holds the real model to the same baseline
  and keeps one issue open while it fails. It needs the `GROQ_API_KEY` repository secret. A
  `freeze` dispatch records a candidate baseline for review; nothing in CI commits one.

The headline metric is the **silent error rate**: lines that would be imported by default and are
wrong (not on the document, wrong unit, wrong category) with nothing on screen to flag them. A
wrong figure the text check flags is caught; an unflagged one is how a kVA figure reaches a
declaration.

Measured on Groq's free tier (`openai/gpt-oss-120b` for PDFs, `qwen/qwen3.8-27b` for photos):

| prompt                                                             | lines read exactly | silent errors |
| ------------------------------------------------------------------ | ------------------ | ------------- |
| first version                                                      | 84.6%              | 7.7%          |
| + never join a code's digits to a quantity; use the ink correction | 92.3%              | 0.0%          |

The first run found two real faults: the PDF text layer printed "7203 10 00" beside "520.000" and
the model fused them into 1,000,520 t (the text check flagged it), and on the handwritten challan
the model read the struck-through figure, silently. The current baseline misses only the challan,
which it now declines to read rather than getting wrong. Injecting a bug that rounds quantities
drops exact reads to 30.8% and raises silent errors to 50%; the gate fails the build.

```bash
npm run eval:documents                           # replay and gate (what CI runs)
npm run eval:documents -- --record --freeze      # re-record and freeze (needs GROQ_API_KEY)
npm run eval:documents -- --live                 # live run, nothing saved (the nightly job)
```

**Real bills stay private.** Put them in `evals/documents/private/` (gitignored) with the same
layout - `labels.json`, `corpus/` - and add `--private` to any of the commands: it keeps its own
cassettes and baseline there. Blank out account numbers, GSTINs, names and addresses first; leave
quantities, units and dates. Ten made-up documents rank changes against each other; only real bills
give a number to quote to a customer or a verifier.

### Ask the regulation

The page relays questions to an evalgate service and renders its answer with the passages it cites,
each marked checked or not supported. It adds nothing to the answer path, so what evalgate's own CI
measures is what the reader gets. The response is validated against evalgate's contract; a
different or changed service fails with a message rather than rendering.

To connect one:

1. On a machine that can reach the EU document servers, in a checkout of evalgate:
   `make corpus PROFILE="+experiment=real"` then `make docker`. The documents are not in its
   repository, so an image built straight from GitHub can only serve its synthetic corpus, and the
   page says so in red.
2. Run the image as a service (Railway: New → Docker image, after pushing it to a registry) with
   `EVALGATE_OVERRIDES=+experiment=real` and `EVALGATE_API_KEY` set.
3. Set `EVALGATE_URL` and the same `EVALGATE_API_KEY` on CarbonPass.

evalgate's real corpus is Regulation (EU) 2023/956, the transitional-period Implementing Regulation
2023/1773, the Commission's guidance and the ETS directive. The definitive-period acts this engine
implements (2025/2547, 2025/2620, 2025/2621) are not in it yet, so for the method itself the
Methodology page is the reference.

## Development

```bash
make check       # lint, format, types, fixture checksums, 178 tests, mapping and document gates
make build && make start          # production build, served the way the container serves it
make smoke                        # end-to-end over HTTP against the running server
```

| Command                 | What it does                                                               |
| ----------------------- | -------------------------------------------------------------------------- |
| `make check`            | Everything CI's quality job runs                                           |
| `make test`             | Engine, rules, SEFA, regulatory-table and PGlite integration tests         |
| `make smoke`            | Signs up, opens the demo, exports everything, runs the supplier round trip |
| `make screenshots`      | Drives the running app in Chromium and captures every screen               |
| `make eval`             | Mapping eval; gates on the column **error** rate                           |
| `make eval-documents`   | Document-reading gate, replayed from cassettes                             |
| `make record-documents` | Re-record the document cassettes and freeze a baseline                     |
| `make regulatory`       | Rebuilds the engine's tables from the Commission workbooks                 |
| `make seed`             | Regenerates the demo fixtures and their checksum manifest                  |
| `make compose-up`       | App plus Postgres in Docker                                                |

CI runs the quality job on Node 22 and 24. It runs the smoke test against the production build on
both Postgres and the embedded database, builds the app as Vercel does, and builds the container and
smoke-tests it.

### Layout

```
data/regulatory/source/    Commission workbooks (benchmarks, default values), checksummed
data/demo/                 Demo plant exports + manifest.json (SHA-256 per file)
evals/documents/           Document-reading gate: corpus, labels, cassettes, baseline
scripts/
  generate-eval-documents.mjs  The made-up bills and photos in evals/documents/corpus
  import-regulatory.ts     Workbooks → src/lib/cbam/regulatory/generated/*.json
  smoke.mjs                End-to-end test over HTTP
  start-standalone.mjs     Serve the standalone build as the container does
src/
  config/env.ts            Validated environment; nothing else reads process.env
  lib/cbam/                THE ENGINE - pure and deterministic
    regulatory/            Commission tables, CBAM factors, mark-ups, published prices
    calc.ts                Attributed emissions and SEE
    precursors.ts          Supplier actuals vs default values per precursor
    sefa.ts                Free allocation adjustment per good
    cost.ts                Certificates, Art. 9 credit, 2026-2034 trajectory
    rules.ts               20 data-quality rules
    declaration.ts         Assembly and machine-readable exports
  lib/ingest/              Upload reading, mapping, materialisation
  lib/ai/                  Optional model layer with deterministic twins
    extract.ts             Reading bills, receipts and photos, with the cross-check
  lib/db/                  Postgres / PGlite driver and migrations
  lib/auth/                Accounts, sessions, roles
  lib/workspace/           Versioned workspace state, datasets, demo seed
  lib/exports/             XLSX report, monitoring methodology, verifier pack
  app/(site)/              The public landing page at /
  app/(app)/               The signed-in product (starts at /overview)
  app/(auth)/              Sign-in, sign-up, onboarding, invitations, setup
  app/(public)/supplier/   The supplier portal
  app/api/                 Route handlers
```

---

## Limitations, stated plainly

- **It does not file anything.** The authorised CBAM declarant (the EU importer) files the annual
  declaration in the CBAM Registry. An accredited verifier verifies the operator's emissions. This
  tool prepares and documents the data for both. It is a calculation aid, not legal advice.
- **The Commission publishes its tables as informational.** The Official Journal text is
  authoritative. The engine records each table's version and checksum, and every export says so.
- **The XLSX report follows the structure of the communication template**; it is not the
  Commission's own file. The monitoring methodology is a document for the verifier, not a
  Commission-format monitoring plan.
- **Document reading needs a model key** (`ANTHROPIC_API_KEY`, or `GROQ_API_KEY` for free). With
  Groq, scanned PDFs cannot be read (upload photos of the pages instead), photos must be under
  4 MB, and the free tier reads three or four documents a minute. Without a key, documents are stored
  and figures are entered by hand. Photos and scans have no text layer, so their figures cannot be
  cross-checked automatically and are marked "check by eye". iPhone HEIC photos must be shared as
  JPEG. Word files must be saved as PDF.
- **E-mail is optional.** With `SMTP_URL` and `MAIL_FROM` set, invitations, supplier requests and password resets
  are e-mailed. Without it, links are shown to copy and send yourself, and "Forgot password" tells
  the person to ask an owner for a reset link.
- **No single sign-on yet.** Accounts are e-mail and password. SAML or OIDC sign-in (Azure AD,
  Google Workspace, Okta) is the next step for larger groups; sessions are already separate from
  sign-in, so it adds a route rather than a rewrite. There is no two-factor authentication yet.
- **Production route per process is operator-configured** (Settings → Installation), and it selects
  the benchmark. A wrong route gives a wrong SEFA. The full calculation export records the benchmark
  value, column and route indicator used for each good.
- **Shared site activities are attributed by configured alias, not allocated.** For example, diesel
  for material handling lands on the DRI kiln because the installation configuration says so.
- **Reading accuracy is measured on made-up documents, not yet on real bills.** On the ten documents
  in `evals/documents/` the free Groq models read 92.3% of lines exactly with no silent errors
  (above). Made-up documents are cleaner than real ones, so that is a ceiling, not a claim; the
  private corpus is where a quotable number comes from. The Claude path has only been run against
  a stubbed client.

---

## Licence

MIT. See [LICENSE](LICENSE).
