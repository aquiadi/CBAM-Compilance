import Link from "next/link";
import { Mark } from "@/components/app-shell";
import { env } from "@/config/env";
import { optionalUser } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * The public landing page: what CarbonPass is, who it is for, and how the
 * product is laid out, before anyone is asked for an e-mail address.
 *
 * The figures quoted are the demo plant's, produced by the engine from the
 * committed demo files (see the README), and are labelled as such.
 */
export default async function LandingPage() {
  const session = await optionalUser().catch(() => null);
  const signedIn = Boolean(session?.user);
  const open = env.CARBONPASS_SIGNUP === "open";

  return (
    <div className="min-h-screen bg-plane text-ink">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-plane/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-4">
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
            <a href="#faq" className="hover:text-ink">
              Questions
            </a>
          </nav>
          <div className="flex items-center gap-3">
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
        <div className="relative mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-16 px-8 pb-24 pt-20 lg:grid-cols-[1.15fr_1fr]">
          <div className="animate-rise">
            <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[13px] text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-series-1" aria-hidden />
              EU CBAM · the cost phase began on 1 January 2026
            </div>
            <h1 className="mt-7 font-display text-[64px] leading-[1.02] tracking-[-0.02em]">
              Your EU buyers now pay for your carbon.{" "}
              <span className="italic text-ink-2">Give them the real number.</span>
            </h1>
            <p className="mt-7 max-w-[54ch] text-[18px] leading-[1.65] text-ink-2">
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
              body: "SAP extracts, electricity-board bills, despatch registers, in tonnes, kilolitres, MU and lakhs. It finds the header row, works out what each column means, and shows you before anything counts.",
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
              a: "CSV and Excel (.xlsx) exports, as they come out of SAP, Tally, your electricity board's portal or your despatch register. PDFs such as bills and verification reports can be stored as evidence.",
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
      <section className="px-8 pb-24">
        <div className="mx-auto max-w-[1180px] rounded-3xl bg-ink px-12 py-16 text-white">
          <div className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="font-display text-[44px] leading-[1.08]">
                See it on a real-shaped steel plant in two minutes.
              </h2>
              <p className="mt-4 max-w-[52ch] text-[16.5px] leading-[1.65] text-white/70">
                Create a free account, open the demo, and follow the tour. Nothing to install, and
                you can delete it whenever you like.
              </p>
            </div>
            <div className="flex md:justify-end">
              <Link
                href={signedIn ? "/overview" : open ? "/signup" : "/login"}
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15.5px] font-medium text-ink transition-transform hover:-translate-y-px"
              >
                {signedIn ? "Open your workspace" : open ? "Start with the demo" : "Sign in"}{" "}
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-8 py-8 text-[13px] text-muted">
          <div className="flex items-center gap-2.5">
            <Mark size={22} />
            <span>CarbonPass · open source (MIT)</span>
          </div>
          <p className="max-w-[70ch]">
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
        "scroll-mt-20 px-8 py-24 " + (tone === "white" ? "border-y border-line bg-surface" : "")
      }
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="max-w-[720px]">
          <div className="text-[13px] font-medium uppercase tracking-[0.16em] text-muted">
            {eyebrow}
          </div>
          <h2 className="mt-4 font-display text-[44px] leading-[1.08] tracking-[-0.015em]">
            {title}
          </h2>
          {lede ? <p className="mt-5 text-[17px] leading-[1.65] text-ink-2">{lede}</p> : null}
        </div>
        <div className="mt-14">{children}</div>
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
      <div className="relative rounded-3xl border border-line bg-surface p-8 shadow-[var(--shadow-float)]">
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
