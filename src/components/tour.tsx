"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The guided tour.
 *
 * A first-time visitor sees a plant's CBAM data for the first time and has no
 * idea where to look. The tour walks the workflow in order across pages - it
 * navigates for them - and spotlights one thing at a time with a short, plain
 * explanation. It never blocks: Skip is always one click away, Escape closes it,
 * and "Guided tour" in the sidebar starts it again.
 *
 * Targets are `data-tour` attributes. A step whose target is missing (an empty
 * workspace has no findings table) falls back to a centred card rather than
 * pointing at nothing.
 */

type Placement = "right" | "left" | "bottom" | "top" | "center";

interface Step {
  path: string;
  target?: string;
  placement?: Placement;
  title: string;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    path: "/overview",
    placement: "center",
    title: "Welcome to CarbonPass",
    body: (
      <>
        This two-minute tour walks through a real-shaped example: a steel plant in Chhattisgarh
        preparing the emissions data its EU buyers need under CBAM. Use <Kbd>←</Kbd> <Kbd>→</Kbd> to
        move, <Kbd>Esc</Kbd> to leave.
      </>
    ),
  },
  {
    path: "/overview",
    target: "nav-steps",
    placement: "right",
    title: "Five steps, top to bottom",
    body: "The left menu is the whole job in order: bring in data, fix what is wrong, see how each number was made, download the declaration, and keep the audit trail. You can jump anywhere at any time.",
  },
  {
    path: "/overview",
    target: "status",
    placement: "bottom",
    title: "Where you stand, and what to do next",
    body: "This panel always shows one thing to do next. Right now the demo has problems that block a filing - on purpose, so you can see how they are caught.",
  },
  {
    path: "/overview",
    target: "key-figures",
    placement: "bottom",
    title: "The three numbers your buyers care about",
    body: "How many CBAM certificates your EU importers must buy for these goods, what that costs them, and how much cheaper your own verified data is than the EU's default values.",
  },
  {
    path: "/ingest",
    target: "upload",
    placement: "bottom",
    title: "Step 1 · Bring in your data",
    body: "Upload exports exactly as they come out of SAP, Tally or your electricity board's portal - CSV or Excel. Nothing counts until you have checked how each column was read and confirmed the file.",
  },
  {
    path: "/ingest",
    target: "documents",
    placement: "top",
    title: "…or read a bill, receipt or photo",
    body: "Upload an invoice, an electricity bill or a phone photo of a weighbridge slip. The AI proposes each figure with the words it read it from, PDF figures are checked against the document's own text, and you confirm every line.",
  },
  {
    path: "/ingest",
    target: "datasets",
    placement: "top",
    title: "Every file, and how it was read",
    body: "Open any file to see which column became what, with the units. Rows that could not be read are listed with the reason - nothing is dropped silently.",
  },
  {
    path: "/review",
    target: "findings",
    placement: "top",
    title: "Step 2 · Fix what is wrong",
    body: (
      <>
        Automatic checks catch unit mistakes, duplicates, gaps and missing supplier data.{" "}
        <b className="font-medium text-ink">Blockers</b> must be fixed before filing. In the demo a
        coal row was exported in kg instead of tonnes - excluding it with a reason is the fix.
      </>
    ),
  },
  {
    path: "/calculate",
    target: "page-header",
    placement: "bottom",
    title: "Step 3 · How every number was made",
    body: "Emissions per production process: fuels, electricity, raw materials and bought-in inputs, using the EU's official method. Nothing here is estimated by AI.",
  },
  {
    path: "/declaration",
    target: "exports",
    placement: "bottom",
    title: "Step 4 · Your outputs",
    body: "Download the emissions report for your EU importers, and the verifier pack - every figure, source file and piece of evidence in one checksummed zip for your accredited verifier.",
  },
  {
    path: "/declaration",
    target: "goods-table",
    placement: "top",
    title: "Per product",
    body: "For each CN code: emissions per tonne, the free allocation the EU still grants, and the certificates it implies. The last column compares you with the EU default value.",
  },
  {
    path: "/audit",
    target: "page-header",
    placement: "bottom",
    title: "Step 5 · Prove it",
    body: "Every figure traces back to the file and row it came from. This is what a verifier asks to see first.",
  },
  {
    path: "/audit",
    target: "nav-more",
    placement: "right",
    title: "Everything else lives here",
    body: "Ask suppliers for their emissions data, store evidence such as electricity bills, invite your team or your verifier, and set up your plant's processes.",
  },
  {
    path: "/review",
    placement: "center",
    title: "Your turn",
    body: "A good first move: on this page, exclude the coal row exported in kg and watch the cost fall from billions to millions. You can restart this tour any time from “Guided tour” in the menu.",
  },
];

const DONE_KEY = "cp:tour:done";
const STEP_KEY = "cp:tour:step";

function storage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

const TourContext = createContext<{ start: () => void }>({ start: () => undefined });

export function useTour() {
  return useContext(TourContext);
}

export function TourProvider({
  children,
  autoStart,
}: {
  children: ReactNode;
  /** Start on first visit (the demo workspace). `?tour=1` always starts it. */
  autoStart: boolean;
}) {
  const [step, setStep] = useState<number | null>(null);

  // Resume across a reload, or start when asked to.
  useEffect(() => {
    const saved = storage("session")?.getItem(STEP_KEY);
    const asked = new URLSearchParams(window.location.search).get("tour") === "1";
    const firstVisit = autoStart && !storage("local")?.getItem(DONE_KEY);
    let next: number | null = null;
    if (saved !== null && saved !== undefined && !Number.isNaN(Number(saved))) next = Number(saved);
    else if (asked || firstVisit) next = 0;
    if (next !== null) {
      const initial = next;
      // Deferred so the page has painted before the spotlight measures it.
      const id = window.setTimeout(() => setStep(initial), 350);
      return () => window.clearTimeout(id);
    }
  }, [autoStart]);

  useEffect(() => {
    if (step === null) storage("session")?.removeItem(STEP_KEY);
    else storage("session")?.setItem(STEP_KEY, String(step));
  }, [step]);

  const finish = useCallback(() => {
    storage("local")?.setItem(DONE_KEY, "1");
    setStep(null);
  }, []);

  const start = useCallback(() => setStep(0), []);

  return (
    <TourContext.Provider value={{ start }}>
      {children}
      {step !== null ? <TourStep key={step} index={step} onGo={setStep} onClose={finish} /> : null}
    </TourContext.Provider>
  );
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const CARD_W = 380;

function TourStep({
  index,
  onGo,
  onClose,
}: {
  index: number;
  onGo: (i: number) => void;
  onClose: () => void;
}) {
  const step = STEPS[Math.min(index, STEPS.length - 1)]!;
  const router = useRouter();
  const pathname = usePathname();
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);
  const last = index === STEPS.length - 1;

  // Go to the step's page, then wait for its target to exist. The component is
  // keyed by step, so `ready` and `rect` start fresh for every step.
  useEffect(() => {
    if (pathname !== step.path) {
      router.push(step.path);
      return;
    }
    let cancelled = false;
    if (!step.target) {
      const id = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(id);
    }
    let tries = 0;
    const find = () => {
      if (cancelled) return;
      const el = visibleTarget(step.target!);
      if (el) {
        const r = el.getBoundingClientRect();
        const inView = r.top >= 80 && r.bottom <= window.innerHeight - 40;
        if (!inView && el.closest("aside") === null) {
          el.scrollIntoView({
            behavior: "smooth",
            block: r.height > window.innerHeight * 0.6 ? "start" : "center",
          });
        }
        window.setTimeout(() => !cancelled && setReady(true), inView ? 0 : 450);
        return;
      }
      if (tries++ < 40) window.setTimeout(find, 100);
      else setReady(true); // Fall back to a centred card.
    };
    find();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, step.path, step.target]);

  // Track the target while the page scrolls or resizes.
  useEffect(() => {
    if (!ready || !step.target) return;
    const measure = () => {
      const el = visibleTarget(step.target!);
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      const maxH = window.innerHeight - 2 * PAD;
      setRect({
        top: Math.max(PAD, r.top - PAD),
        left: r.left - PAD,
        width: r.width + 2 * PAD,
        height: Math.min(r.height + 2 * PAD, maxH),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [ready, step.target]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [ready, index]);

  const next = useCallback(
    () => (last ? onClose() : onGo(index + 1)),
    [index, last, onClose, onGo],
  );
  const back = useCallback(() => index > 0 && onGo(index - 1), [index, onGo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, next, onClose]);

  const pos = placeCard(rect, step.placement ?? "bottom", cardH);

  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      {/* Scrim with a hole where the target is; clicks outside do nothing. */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-2xl transition-all duration-300 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgb(18 20 24 / 0.52), 0 0 0 2px rgb(255 255 255 / 0.9)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgb(18_20_24/0.52)] animate-fade" />
      )}

      {ready ? (
        <div
          ref={cardRef}
          key={index}
          className="fixed animate-rise rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-float)]"
          style={{ top: pos.top, left: pos.left, width: cardWidth() }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
              {index + 1} of {STEPS.length}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Skip tour
            </button>
          </div>
          <h2 id="tour-title" className="mt-3 font-display text-[24px] leading-tight text-ink">
            {step.title}
          </h2>
          <div className="mt-3 text-[14.5px] leading-[1.65] text-ink-2">{step.body}</div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="flex gap-1.5" aria-hidden>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={
                    "h-1.5 rounded-full transition-all " +
                    (i === index
                      ? "w-5 bg-ink"
                      : i < index
                        ? "w-1.5 bg-ink/40"
                        : "w-1.5 bg-line-strong")
                  }
                />
              ))}
            </div>
            <div className="flex shrink-0 gap-2">
              {index > 0 ? (
                <button
                  type="button"
                  onClick={back}
                  className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] font-medium text-ink hover:border-ink"
                >
                  Back
                </button>
              ) : null}
              <button
                type="button"
                onClick={next}
                autoFocus
                className="rounded-full bg-inverse px-5 py-2 text-[13.5px] font-medium text-on-inverse hover:opacity-90"
              >
                {last ? "Finish" : index === 0 ? "Start the tour" : "Next"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The target if it is actually on screen. On a phone the menu lives in a
 * closed drawer, so its steps fall back to a centred card instead of pointing
 * at something off-canvas.
 */
function visibleTarget(name: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  if (r.right <= 0 || r.left >= window.innerWidth) return null;
  return el;
}

function cardWidth(): number {
  return Math.min(CARD_W, window.innerWidth - 32);
}

function placeCard(rect: Rect | null, placement: Placement, cardH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 16;
  const w = cardWidth();
  const clampX = (x: number) => Math.min(Math.max(16, x), vw - w - 16);
  const clampY = (y: number) => Math.min(Math.max(16, y), vh - cardH - 16);
  if (!rect || placement === "center") {
    return { top: clampY((vh - cardH) / 2), left: clampX((vw - w) / 2) };
  }
  const below = rect.top + rect.height + gap;
  const above = rect.top - cardH - gap;
  // Side placements need room beside the target; on a phone use above/below.
  if ((placement === "right" || placement === "left") && vw < 900) placement = "bottom";
  switch (placement) {
    case "right":
      return { top: clampY(rect.top), left: clampX(rect.left + rect.width + gap) };
    case "left":
      return { top: clampY(rect.top), left: clampX(rect.left - w - gap) };
    case "top":
      return above >= 16
        ? { top: above, left: clampX(rect.left) }
        : { top: clampY(Math.min(below, vh - cardH - 16)), left: clampX(rect.left) };
    default:
      return below + cardH <= vh - 16
        ? { top: below, left: clampX(rect.left) }
        : { top: clampY(above), left: clampX(rect.left) };
  }
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-px font-mono text-[12px] text-ink">
      {children}
    </kbd>
  );
}
