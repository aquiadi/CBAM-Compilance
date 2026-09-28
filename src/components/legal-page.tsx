import Link from "next/link";
import type { ReactNode } from "react";
import { env } from "@/config/env";
import { Mark } from "./app-shell";
import { ThemeToggle } from "./theme-toggle";

/** Who runs this deployment, as the legal pages name them. */
export function operatorName(): string {
  return env.CARBONPASS_OPERATOR ?? "the operator of this CarbonPass deployment";
}

export function contactLine(): ReactNode {
  return env.CARBONPASS_CONTACT_EMAIL ? (
    <a href={`mailto:${env.CARBONPASS_CONTACT_EMAIL}`} className="text-accent hover:underline">
      {env.CARBONPASS_CONTACT_EMAIL}
    </a>
  ) : (
    "the owner of your organisation's account, or whoever gave you access"
  );
}

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-plane text-ink">
      <header className="border-b border-line/70">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Mark />
            <span className="font-display text-[22px] leading-none">CarbonPass</span>
          </Link>
          <ThemeToggle compact />
        </div>
      </header>
      <main className="mx-auto max-w-[860px] px-5 py-12 md:px-8 md:py-16">
        <h1 className="font-display text-[36px] leading-[1.1] md:text-[44px]">{title}</h1>
        <p className="mt-3 text-[13.5px] text-muted">Last updated {updated}</p>
        <div className="legal mt-10 space-y-8 text-[15.5px] leading-[1.75] text-ink-2">
          {children}
        </div>
        <p className="mt-16 border-t border-line pt-6 text-[13px] text-muted">
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/" className="hover:text-ink">
            CarbonPass
          </Link>
        </p>
      </main>
    </div>
  );
}

export function Clause({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[19px] font-semibold text-ink">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
