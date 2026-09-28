import Link from "next/link";
import { Mark } from "@/components/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { env } from "@/config/env";
import { optionalUser } from "@/lib/auth/context";
import readingBaseline from "../../../evals/documents/baseline.json";

export const dynamic = "force-dynamic";

/**
 * The public landing page: what CarbonPass is, who it is for, and how the
 * product is laid out, before anyone is asked for an e-mail address.
 *
 * The figures quoted are the demo plant's, produced by the engine from the
 * committed demo files (see the README), and are labelled as such.
 */
export default async function LandingPage() {
  const reading = readingBaseline.metrics;
  const pct = (x: number) => `${(x * 100).toFixed(1).replace(/\.0$/, "")}%`;
  const session = await optionalUser().catch(() => null);
  const signedIn = Boolean(session?.user);
  const open = env.CARBONPASS_SIGNUP === "open";

  return (
    <div className="min-h-screen bg-plane text-ink">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-plane/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-5 py-3.5 md:px-8 md:py-4">
          <Link href="/" className="flex items-center gap-3">
            <Mark />
            <span className="font-display text-[22px] leading-none">CarbonPass</span>
          </Link>
          <nav className="hidden items-center gap-8 text-[14.5px] text-ink-2 md:flex">
            <a href="#who" className="hover:text-ink">
              Who it&apos;s for
            </a>
            <a href="#what" className="hover:text-ink">
              What it does
            </a>
            <a href="#how" className="hover:text-ink">
              How it works
            </a>
            <a href="#trust" className="hover:text-ink">
              Why trust it
            </a>
            <a href="#faq" className="hover:text-ink">
              Questions
            </a>
          </nav>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden sm:block">
              <ThemeToggle compact />
            </div>
            {signedIn ? (
              <Link href="/overview" className="btn-primary">
                Open your workspace <span aria-hidden>→</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 text-[14.5px] font-medium text-ink-2 hover:text-ink"
                >
                  Sign in
                </Link>
                {open ? (
                  <Link href="/signup" className="btn-primary">
                    Try the demo
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden">
        <div className="ledger pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="relative mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-12 px-5 pb-16 pt-12 md:px-8 md:pb-24 md:pt-20 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div className="animate-rise">
            <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[13px] text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-series-1" aria-hidden />
              EU CBAM · the cost phase began on 1 January 2026
            </div>
            <h1 className="mt-7 font-display text-[40px] leading-[1.04] tracking-[-0.02em] sm:text-[52px] lg:text-[64px] lg:leading-[1.02]">
              Your EU buyers now pay for your carbon.{" "}
              <span className="italic text-ink-2">Give them the real number.</span>
            </h1>
            <p className="mt-6 max-w-[54ch] text-[16.5px] leading-[1.65] text-ink-2 md:mt-7 md:text-[18px]">
              CarbonPass turns the spreadsheets your plant already keeps into the verified emissions
              data EU importers need under CBAM - so they are not forced onto the EU&apos;s default
              values, which are set high on purpose.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              {signedIn ? (
                <Link href="/overview" className="btn-primary">
                  Open your workspace <span aria-hidden>→</span>
                </Link>
              ) : (
                <>
                  <Link href={open ? "/signup" : "/login"} className="btn-primary">
                    {open ? "Explore the demo plant" : "Sign in"} <span aria-hidden>→</span>
                  </Link>
                  <a href="#how" className="btn-secondary">
                    See how it works
                  </a>
                </>
              )}
            </div>
            <p className="mt-5 text-[13.5px] text-muted">
              Free to try. No installation. The demo comes with a guided tour.
            </p>
          </div>

          <DemoReceipt />
        </div>
      </section>

      {/* ------------------------------------------------------------ who */}
      <Section
        id="who"
        eyebrow="Who it's for"
        title="For the people an EU buyer emails when CBAM comes up"
        lede="If you make steel, iron, aluminium, cement, fertilisers or hydrogen outside the EU and sell into it, your customers now need your emissions data every year."
      >
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Plant and sustainability teams",
              body: "You own the fuel logs, electricity bills and production registers. CarbonPass reads them as they are and does the CBAM arithmetic, with every step shown.",
            },
            {
              title: "Export and sales managers",
              body: "Your importer has asked for a “CBAM communication”. You get the report they need, and a clear number for what your carbon will cost them this year and up to 2034.",
            },
            {
              title: "Verifiers and consultants",
              body: "Every figure traces to the file and row it came from. The verifier pack bundles the data, the method, the evidence and checksums in one download.",
            },
          ].map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-line bg-surface p-8 shadow-[var(--shadow-card)]"
            >
              <h3 className="text-[18px] font-semibold">{c.title}</h3>
              <p className="mt-3 text-[15px] leading-[1.65] text-ink-2">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ what */}
      <Section
        id="what"
        eyebrow="What it does"
        title="From messy exports to a report a verifier signs off"
        tone="white"
      >
        <div className="grid gap-x-16 gap-y-12 md:grid-cols-2">
          {[
            {
              n: "01",
              title: "Reads your files the way they are",
              body: "SAP extracts and despatch registers in tonnes, kilolitres, MU and lakhs - and the paper behind them: invoices, electricity bills and phone photos of weighbridge slips, read by AI and checked by you. Nothing counts until you have seen how it was read.",
            },
            {
              n: "02",
              title: "Catches the mistakes that cost money",
              body: "In the demo, one coal row exported in kilograms instead of tonnes turns a bill of about €12 million into €2.51 billion. Twenty automatic checks find this kind of thing, and you fix it with a recorded reason.",
            },
            {
              n: "03",
              title: "Uses the EU's own tables and method",
              body: "The Commission's official benchmarks and default values are built in, along with the yearly phase-out of free allocation. The arithmetic is plain code with tests - AI never produces a figure.",
            },
            {
              n: "04",
              title: "Hands over what people ask for",
              body: "An emissions report for your importers, a methodology document, and a verifier pack. Suppliers of your raw materials can send their own data through a private link.",
            },
          ].map((f) => (
            <div key={f.n} className="flex gap-6">
              <span className="font-display text-[28px] leading-none text-muted">{f.n}</span>
              <div>
                <h3 className="text-[19px] font-semibold">{f.title}</h3>
                <p className="mt-3 text-[15.5px] leading-[1.7] text-ink-2">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ how */}
      <Section
        id="how"
        eyebrow="How it works"
        title="Five steps, in the order you'll do them"
        lede="Inside the app, the menu on the left is exactly this path. Open the demo and a guided tour walks you through it."
      >
        <ol className="relative grid gap-4 md:grid-cols-5">
          <span
            className="absolute left-0 right-0 top-[27px] hidden h-px bg-line-strong md:block"
            aria-hidden
          />
          {[
            {
              title: "Data",
              body: "Upload CSV or Excel files. Check how each column was read, then confirm.",
            },
            {
              title: "Review",
              body: "Work through what the checks found. Blockers must be fixed; warnings explained.",
            },
            {
              title: "Calculate",
              body: "See the emissions of each process and how every number was derived.",
            },
            {
              title: "Declaration",
              body: "Emissions per product, certificates, cost - and the downloads.",
            },
            {
              title: "Audit trail",
              body: "Follow any figure back to the file and row it came from.",
            },
          ].map((s, i) => (
            <li key={s.title} className="relative">
              <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-line-strong bg-surface font-display text-[24px]">
                {i + 1}
              </span>
              <h3 className="mt-5 text-[17px] font-semibold">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.6] text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-14 grid gap-6 rounded-2xl border border-line bg-surface p-8 md:grid-cols-3">
          <div>
            <div className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">
              Overview
            </div>
            <p className="mt-2 text-[15px] leading-[1.6] text-ink-2">
              Always shows where you stand and the one thing to do next.
            </p>
          </div>
          <div>
            <div className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">
              More
            </div>
            <p className="mt-2 text-[15px] leading-[1.6] text-ink-2">
              Suppliers, evidence, the activity log, methodology, your team and plant settings.
            </p>
          </div>
          <div>
            <div className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">
              Guided tour
            </div>
            <p className="mt-2 text-[15px] leading-[1.6] text-ink-2">
              Starts on the demo, and can be replayed from the menu whenever you want.
            </p>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------ timeline */}
      <Section eyebrow="Why now" title="The dates that matter" tone="white">
        <div className="grid gap-10 md:grid-cols-3">
          {[
            {
              date: "1 January 2026",
              body: "CBAM's definitive period starts. Importers owe certificates for the emissions in goods they bring in from this date.",
            },
            {
              date: "30 September 2027",
              body: "The first annual CBAM declaration is due, covering 2026 imports. Importers need your verified data before then.",
            },
            {
              date: "2026 to 2034",
              body: "The free allocation that softens the bill falls from 97.5% to zero. The same emissions cost more every year.",
            },
          ].map((t) => (
            <div key={t.date} className="border-t-2 border-ink pt-6">
              <div className="font-display text-[28px] leading-tight">{t.date}</div>
              <p className="mt-3 text-[15px] leading-[1.65] text-ink-2">{t.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ trust */}
      <Section
        id="trust"
        eyebrow="Why trust it"
        title="Measured, not claimed"
        lede="AI that reads bills is only as good as its worst silent mistake. So the reading is tested on every change to the code, and the regulation assistant shows its sources."
        tone="white"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              value: pct(reading.lineRecall),
              label: "of figures read exactly",
              note: `on ${reading.documents} test documents built around real traps: kVA beside kWh, gross beside net weight, crossed-out ink`,
            },
            {
              value: pct(reading.silentErrorRate),
              label: "silent errors",
              note: "wrong figures that would be imported with nothing on screen to flag them - the number that matters most",
            },
            {
              value: "Every change",
              label: "re-tested before it ships",
              note: "a change that makes reading worse fails the build and cannot be released",
            },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-plane p-6">
              <div className="font-display text-[40px] leading-none">{s.value}</div>
              <div className="mt-2 text-[15px] font-medium">{s.label}</div>
              <p className="mt-3 text-[13.5px] leading-[1.6] text-ink-2">{s.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
          <div>
            <h3 className="text-[19px] font-semibold">Ask the regulation, read the source</h3>
            <p className="mt-3 text-[15.5px] leading-[1.7] text-ink-2">
              Ask a question about the rules in plain words. Every sentence of the answer cites the
              passage of the regulation it comes from, each citation is checked against that
              passage, and the passages sit right under the answer for you to read.
            </p>
          </div>
          <div>
            <h3 className="text-[19px] font-semibold">Open about its limits</h3>
            <p className="mt-3 text-[15.5px] leading-[1.7] text-ink-2">
              The test documents are made up to be hard, but real bills are messier, so each
              customer&apos;s own bills are measured the same way before the number is quoted. The
              AI proposes; a person confirms every line; the arithmetic never uses AI.
            </p>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------ faq */}
      <Section id="faq" eyebrow="Questions" title="Straight answers">
        <div className="mx-auto max-w-[820px] divide-y divide-line rounded-2xl border border-line bg-surface">
          {[
            {
              q: "Does CarbonPass file the CBAM declaration?",
              a: "No. Your EU importer (the authorised CBAM declarant) files the declaration in the EU's CBAM Registry, and an accredited verifier checks your emissions. CarbonPass prepares and documents the data both of them need. It is a calculation aid, not legal advice.",
            },
            {
              q: "Is AI calculating my emissions?",
              a: "No. AI can help read unfamiliar column names and explain findings, and it is optional. Every figure comes from plain, tested code that applies the EU's published method and tables - and it works fully without any AI key.",
            },
            {
              q: "What files can I upload?",
              a: "CSV and Excel (.xlsx) exports from SAP, Tally, your electricity board's portal or your despatch register - and PDFs or photos of bills, invoices, receipts and weighbridge slips. With an AI key those documents are read for you, each figure shown with the words it came from; you confirm every line.",
            },
            {
              q: "How accurate is the AI reading?",
              a: `On our test set of ${reading.documents} documents built around the traps real bills contain, the AI reads ${pct(reading.lineRecall)} of figures exactly, and ${pct(reading.silentErrorRate)} of the lines it proposes are wrong without being flagged. Every change to the product is re-tested against that set and blocked if it gets worse. You still confirm every line before it counts.`,
            },
            {
              q: "Can I ask questions about the regulation?",
              a: 'Yes - "Ask the regulation" in the app answers in plain words and cites the exact passage of the regulation behind each sentence, with every citation checked. It explains the rules; it does not replace them or legal advice.',
            },
            {
              q: "Where does my data live?",
              a: "In the database of the deployment you use. Each organisation's data is separate, access is by role (owner, editor, viewer, verifier), and every change is recorded in an activity log.",
            },
          ].map((f) => (
            <details key={f.q} className="group px-7 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16.5px] font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-2 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[68ch] text-[15px] leading-[1.7] text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ cta */}
      <section className="px-5 pb-16 md:px-8 md:pb-24">
        <div className="mx-auto max-w-[1180px] rounded-3xl bg-panel px-7 py-12 text-on-panel md:px-12 md:py-16">
          <div className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="font-display text-[32px] leading-[1.08] md:text-[44px]">
                See it on a real-shaped steel plant in two minutes.
              </h2>
              <p className="mt-4 max-w-[52ch] text-[16.5px] leading-[1.65] text-on-panel/70">
                Create a free account, open the demo, and follow the tour. Nothing to install, and
                you can delete it whenever you like.
              </p>
            </div>
            <div className="flex md:justify-end">
              <Link
                href={signedIn ? "/overview" : open ? "/signup" : "/login"}
                className="inline-flex items-center gap-2 rounded-full bg-on-panel px-7 py-3.5 text-[15.5px] font-medium text-panel transition-transform hover:-translate-y-px"
              >
                {signedIn ? "Open your workspace" : open ? "Start with the demo" : "Sign in"}{" "}
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-5 py-8 md:px-8 text-[13px] text-muted">
          <div className="flex items-center gap-2.5">
            <Mark size={22} />
            <span>CarbonPass · open source (MIT)</span>
          </div>
          <nav className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <a href="https://github.com/aquiadi/CBAM-Compilance" className="hover:text-ink">
              Source
            </a>
          </nav>
          <p className="w-full max-w-[70ch]">
            Implements Regulation (EU) 2023/956 and Implementing Regulations 2025/2547, 2025/2620
            and 2025/2621. A calculation aid, not legal advice.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  lede,
  tone = "plane",
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lede?: string;
  tone?: "plane" | "white";
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={
        "scroll-mt-20 px-5 py-16 md:px-8 md:py-24 " +
        (tone === "white" ? "border-y border-line bg-surface" : "")
      }
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="max-w-[720px]">
          <div className="text-[13px] font-medium uppercase tracking-[0.16em] text-muted">
            {eyebrow}
          </div>
          <h2 className="mt-4 font-display text-[32px] leading-[1.08] tracking-[-0.015em] md:text-[44px]">
            {title}
          </h2>
          {lede ? <p className="mt-5 text-[17px] leading-[1.65] text-ink-2">{lede}</p> : null}
        </div>
        <div className="mt-10 md:mt-14">{children}</div>
      </div>
    </section>
  );
}

/** The demo plant's headline result, set like a statement. */
function DemoReceipt() {
  return (
    <div className="relative animate-rise [animation-delay:120ms]">
      <div
        className="absolute -inset-3 rotate-[1.5deg] rounded-[28px] border border-line bg-surface-2"
        aria-hidden
      />
      <div className="relative rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow-float)] md:p-8">
        <div className="flex items-center justify-between text-[12.5px] text-muted">
          <span className="font-medium uppercase tracking-[0.14em]">Demo plant · 2026</span>
          <span>Jan – Aug</span>
        </div>
        <div className="mt-4 font-display text-[26px] leading-tight">
          Raigarh Works, Chhattisgarh
        </div>
        <div className="text-[14px] text-ink-2">DRI – electric arc furnace steel</div>

        <div className="mt-7 space-y-4">
          {[
            { good: "Rebar", cn: "7214 20 00", own: 2.34, def: 4.7 },
            { good: "Billets", cn: "7207 11 14", own: 2.18, def: 4.7 },
            { good: "Sponge iron", cn: "7203 10 00", own: 1.94, def: 4.62 },
          ].map((r) => (
            <div key={r.cn}>
              <div className="flex items-baseline justify-between text-[14px]">
                <span className="font-medium">
                  {r.good} <span className="font-normal text-muted">· {r.cn}</span>
                </span>
                <span className="tnum text-[13px] text-ink-2">
                  {r.own.toFixed(2)} <span className="text-muted">vs {r.def.toFixed(2)}</span>
                </span>
              </div>
              <div className="relative mt-2 h-2 rounded-full bg-surface-3">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-series-2"
                  style={{ width: `${(r.own / 5) * 100}%` }}
                />
                <div
                  className="absolute -top-1 h-4 w-0.5 rounded bg-ink"
                  style={{ left: `${(r.def / 5) * 100}%` }}
                  aria-hidden
                />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-4 pt-1 text-[12.5px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-series-2" aria-hidden /> Plant&apos;s own
              data, tCO₂e/t
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-0.5 rounded bg-ink" aria-hidden /> EU default
            </span>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-4 border-t border-dashed border-line-strong pt-6">
          <div>
            <div className="text-[12.5px] text-muted">Cost to EU importers</div>
            <div className="mt-1 font-display text-[34px] leading-none">€11.96M</div>
          </div>
          <div>
            <div className="text-[12.5px] text-muted">On EU default values</div>
            <div className="mt-1 font-display text-[34px] leading-none text-muted line-through decoration-1">
              €21.23M
            </div>
          </div>
        </div>
        <p className="mt-5 text-[12.5px] leading-[1.5] text-muted">
          Demo figures, after correcting the two data errors seeded in the demo files.
        </p>
      </div>
    </div>
  );
}
