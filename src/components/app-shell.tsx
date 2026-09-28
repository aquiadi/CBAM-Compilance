"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { TourProvider, useTour } from "./tour";

/**
 * The application shell.
 *
 * Navigation follows the actual workflow rather than a feature list: data comes
 * in, gets reviewed, gets calculated, becomes a declaration, and leaves an audit
 * trail. Those five steps are the only thing the menu shows by default; the
 * supporting pages sit under "More" so a first-time visitor reads a path, not a
 * feature inventory.
 */

const STEPS = [
  { href: "/ingest", label: "Data", hint: "Upload files and check how they were read" },
  { href: "/review", label: "Review", hint: "Fix what the checks found" },
  { href: "/calculate", label: "Calculate", hint: "How each number was derived" },
  { href: "/declaration", label: "Declaration", hint: "Figures, cost and downloads" },
  { href: "/audit", label: "Audit trail", hint: "Every figure to its source row" },
];

const MORE = [
  { href: "/suppliers", label: "Suppliers" },
  { href: "/evidence", label: "Evidence" },
  { href: "/activity", label: "Activity log" },
  { href: "/methodology", label: "Methodology" },
  { href: "/regulation", label: "Ask the regulation" },
  { href: "/settings", label: "Installation settings" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/workspaces", label: "Workspaces" },
];

interface Props {
  children: React.ReactNode;
  user: { name: string; email: string };
  org: { id: string; name: string };
  role: string;
  canWrite: boolean;
  workspaces: { id: string; name: string }[];
  currentWorkspaceId: string | null;
  isDemo: boolean;
  model: string | null;
  database: "postgres" | "embedded";
}

export function AppShell(props: Props) {
  return (
    <TourProvider autoStart={props.isDemo}>
      <Shell {...props} />
    </TourProvider>
  );
}

function Shell({
  children,
  user,
  org,
  role,
  canWrite,
  workspaces,
  currentWorkspaceId,
  model,
  database,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const tour = useTour();
  const [switching, setSwitching] = useState(false);
  const moreActive = MORE.some((m) => isActive(m.href));
  const [moreOpen, setMoreOpen] = useState(moreActive);
  // The drawer on phones and tablets; the sidebar is always visible from lg up.
  const [drawer, setDrawer] = useState(false);
  const close = () => setDrawer(false);

  function isActive(href: string) {
    if (href === "/settings") return pathname === "/settings";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function selectWorkspace(id: string) {
    if (id === "__new") {
      router.push("/settings/workspaces#new");
      return;
    }
    setSwitching(true);
    await fetch("/api/workspaces/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: id }),
    });
    setSwitching(false);
    router.refresh();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      {/* Top bar below lg: the menu button, the mark and the theme. */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-plane/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          aria-expanded={drawer}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink"
        >
          <MenuIcon />
        </button>
        <Link href="/overview" className="flex items-center gap-2.5">
          <Mark size={26} />
          <span className="font-display text-[19px] leading-none text-ink">CarbonPass</span>
        </Link>
        <ThemeToggle compact />
      </header>

      {drawer ? (
        <div
          className="fixed inset-0 z-40 bg-[rgb(10_8_4/0.45)] animate-fade lg:hidden"
          onClick={close}
          aria-hidden
        />
      ) : null}

      <aside
        className={
          "fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col border-r border-line bg-surface transition-transform duration-300 ease-out lg:w-[272px] lg:translate-x-0 " +
          (drawer ? "translate-x-0 shadow-[var(--shadow-float)]" : "-translate-x-full")
        }
        aria-label="Main menu"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) close();
        }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close menu"
          className="absolute right-3 top-5 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
        >
          ✕
        </button>
        <div className="px-6 pb-5 pt-6">
          <Link href="/overview" className="flex items-center gap-3">
            <Mark />
            <span className="font-display text-[21px] leading-none text-ink">CarbonPass</span>
          </Link>
        </div>

        <div className="px-4 pb-4">
          <label className="block rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <span className="block truncate text-[11.5px] font-medium uppercase tracking-[0.12em] text-muted">
              {org.name}
            </span>
            <select
              aria-label="Workspace"
              value={currentWorkspaceId ?? ""}
              disabled={switching}
              onChange={(e) => selectWorkspace(e.target.value)}
              className="mt-0.5 w-full cursor-pointer truncate bg-transparent text-[14px] font-medium text-ink outline-none"
            >
              {currentWorkspaceId === null ? <option value="">No workspace yet</option> : null}
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
              {canWrite ? <option value="__new">+ New workspace…</option> : null}
            </select>
          </label>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-4">
          <NavLink href="/overview" active={isActive("/overview")}>
            <span className="flex h-6 w-6 items-center justify-center" aria-hidden>
              <HomeIcon />
            </span>
            <span className="text-[14.5px] font-medium">Overview</span>
          </NavLink>

          <div className="mt-6 px-3 text-[11.5px] font-medium uppercase tracking-[0.14em] text-muted">
            Your path
          </div>
          <ol className="relative mt-2 space-y-0.5" data-tour="nav-steps">
            {/* The line that joins the steps. */}
            <span className="absolute bottom-5 left-[23px] top-5 w-px bg-line-strong" aria-hidden />
            {STEPS.map((item, i) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <NavLink href={item.href} active={active} title={item.hint}>
                    <span
                      className={
                        "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold " +
                        (active
                          ? "bg-inverse text-on-inverse"
                          : "border border-line-strong bg-surface text-ink-2")
                      }
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-medium leading-tight">
                        {item.label}
                      </span>
                      {active ? (
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                          {item.hint}
                        </span>
                      ) : null}
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ol>

          <div className="mt-6" data-tour="nav-more">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11.5px] font-medium uppercase tracking-[0.14em] text-muted hover:text-ink"
            >
              More
              <span
                aria-hidden
                className={"text-[14px] transition-transform " + (moreOpen ? "rotate-90" : "")}
              >
                ›
              </span>
            </button>
            {moreOpen ? (
              <ul className="mt-1 space-y-0.5 animate-fade">
                {MORE.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={
                        "block rounded-lg px-3 py-1.5 text-[14px] transition-colors " +
                        (isActive(item.href)
                          ? "bg-surface-3 font-medium text-ink"
                          : "text-ink-2 hover:bg-surface-2 hover:text-ink")
                      }
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </nav>

        <div className="border-t border-line px-4 py-4">
          <button
            type="button"
            onClick={tour.start}
            className="mb-4 flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-line-strong"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-inverse text-[13px] text-on-inverse"
              aria-hidden
            >
              ?
            </span>
            <span>
              <span className="block text-[13.5px] font-medium text-ink">Guided tour</span>
              <span className="block text-[12px] text-muted">Two minutes, step by step</span>
            </span>
          </button>
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium text-ink">{user.name}</div>
              <div className="truncate text-[12px] text-muted" title={user.email}>
                {role}
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-[12.5px] text-ink-2 hover:border-ink hover:text-ink"
            >
              Sign out
            </button>
          </div>
          <div className="mt-4 hidden px-1 lg:block">
            <ThemeToggle />
          </div>
          <p className="mt-3 px-1 text-[11.5px] leading-[1.5] text-muted">
            {model ? `AI: ${model}` : "Rule-based mapping"} ·{" "}
            {database === "postgres" ? "Postgres" : "Embedded database"}
          </p>
        </div>
      </aside>

      <main className="min-w-0 bg-plane lg:ml-[272px]">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  active,
  title,
  children,
}: {
  href: string;
  active: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "page" : undefined}
      className={
        "flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors " +
        (active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")
      }
    >
      {children}
    </Link>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A mark that reads as a border crossing: goods on the left, a levy at the line. */
export function Mark({ size = 30, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden>
      <rect
        width="26"
        height="26"
        rx="7"
        style={{ fill: onDark ? "var(--color-on-panel)" : "var(--color-inverse)" }}
      />
      <path
        d="M13 4.5v17"
        style={{ stroke: onDark ? "var(--color-panel)" : "var(--color-on-inverse)" }}
        strokeWidth="1.4"
        strokeDasharray="2.5 2.5"
      />
      <rect x="5" y="11" width="5.5" height="7.5" rx="1" fill="#eb6834" />
      <rect x="15.5" y="8" width="5.5" height="10.5" rx="1" fill="#1baf7a" />
    </svg>
  );
}
