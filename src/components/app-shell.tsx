"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The application shell.
 *
 * Navigation follows the actual workflow rather than a feature list: data comes
 * in, gets reviewed, gets calculated, becomes a declaration, and leaves an audit
 * trail. Someone who has never seen the product should be able to read the
 * sidebar and understand what the product does.
 */

const NAV = [
  { href: "/", label: "Overview", hint: "Where the declaration stands", step: null },
  { href: "/ingest", label: "Ingest", hint: "Files and column mapping", step: 1 },
  { href: "/review", label: "Review", hint: "Findings and data quality", step: 2 },
  { href: "/calculate", label: "Calculate", hint: "How each number was derived", step: 3 },
  { href: "/declaration", label: "Declaration", hint: "Goods, exposure, exports", step: 4 },
  { href: "/audit", label: "Audit trail", hint: "Every figure to its source row", step: 5 },
  { href: "/methodology", label: "Methodology", hint: "Factors, rules, references", step: null },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-5 py-5">
          <Link href="/" className="group block">
            <div className="flex items-center gap-2.5">
              <Mark />
              <div>
                <div className="text-[13px] font-semibold leading-none tracking-tight text-ink">
                  CarbonPass
                  <span className="ml-1 text-[10px] font-medium tracking-[0.14em] text-accent">
                    AI
                  </span>
                </div>
                <div className="mt-1 text-[10.5px] leading-none text-muted">
                  CBAM declaration engine
                </div>
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.13em] text-muted">
            Workflow
          </div>
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={[
                      "group flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                      active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold tnum",
                        active
                          ? "bg-accent text-plane"
                          : "border border-line text-muted group-hover:border-line-strong",
                      ].join(" ")}
                      aria-hidden
                    >
                      {item.step ?? "·"}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium leading-tight">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-muted">
                        {item.hint}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-line px-4 py-3">
          <p className="text-[10px] leading-[1.5] text-muted">
            Figures are computed by a deterministic engine. The model maps columns and
            explains findings; it never produces a number.
          </p>
        </div>
      </aside>

      <main className="ml-60 flex-1 bg-plane">{children}</main>
    </div>
  );
}

/** A mark that reads as a border crossing: goods on the left, a levy at the line. */
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="25" height="25" rx="6" fill="#181b20" stroke="#2f333b" />
      <path d="M13 4.5v17" stroke="#3987e5" strokeWidth="1.5" strokeDasharray="2.5 2.5" />
      <rect x="5" y="11" width="5.5" height="7.5" rx="1" fill="#d95926" />
      <rect x="15.5" y="8" width="5.5" height="10.5" rx="1" fill="#199e70" />
    </svg>
  );
}
