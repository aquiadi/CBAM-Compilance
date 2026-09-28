import Link from "next/link";
import { Mark } from "@/components/app-shell";

export const dynamic = "force-dynamic";

/**
 * Sign-in, sign-up and onboarding: the form on the right, a short reminder of
 * what happens next on the left, and a way back to the landing page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-plane lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-ink px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Mark onDark />
          <span className="font-display text-[22px] leading-none">CarbonPass</span>
        </Link>
        <div className="max-w-[440px]">
          <h2 className="font-display text-[40px] leading-[1.1]">
            From plant spreadsheets to the CBAM data your EU buyers need.
          </h2>
          <ol className="mt-10 space-y-5">
            {[
              ["Create your account", "Your organisation holds the data; invite your team later."],
              ["Open the demo", "A real-shaped steel plant, with a guided tour."],
              ["Set up your own plant", "Describe the processes, upload your files, review."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 font-display text-[16px]">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-[15.5px] font-medium">{t}</span>
                  <span className="mt-0.5 block text-[14px] text-white/60">{b}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <p className="max-w-[440px] text-[12.5px] leading-[1.6] text-white/45">
          Figures are computed by a deterministic engine from your data and the European
          Commission&apos;s published CBAM tables. A calculation aid, not legal advice.
        </p>
      </aside>

      <main className="flex flex-col items-center justify-center px-6 py-16">
        <Link href="/" className="mb-10 flex items-center gap-3 lg:hidden">
          <Mark />
          <span className="font-display text-[22px] leading-none text-ink">CarbonPass</span>
        </Link>
        <div className="w-full max-w-[480px] animate-rise">{children}</div>
        <Link href="/" className="mt-10 text-[13.5px] text-muted hover:text-ink">
          ← What is CarbonPass?
        </Link>
      </main>
    </div>
  );
}
