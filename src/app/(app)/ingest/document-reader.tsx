"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormError, Input, Select, useRequest } from "@/components/forms";
import { Badge, cn, Note } from "@/components/ui";
import type { AiOutcome } from "@/lib/ai/client";
import type { CheckStatus, Extraction, LineCategory } from "@/lib/ai/extract";

/**
 * Read a bill, receipt or photo: the model proposes lines, a person checks
 * each one next to the document, and only the checked lines become a draft
 * dataset. Without a model key the same table opens empty for manual entry.
 */

const CATEGORIES: { id: LineCategory; label: string }[] = [
  { id: "fuel", label: "Fuel" },
  { id: "electricity", label: "Electricity" },
  { id: "process_material", label: "Process material" },
  { id: "precursor", label: "Precursor" },
  { id: "other", label: "Not needed" },
];

interface Row {
  key: string;
  include: boolean;
  description: string;
  category: LineCategory;
  quantity: string;
  unit: string;
  date: string;
  cnCode: string;
  supplySource: string;
  evidence: string;
  page: number | null;
  confidence: number | null;
  check: CheckStatus | "manual";
  unitKnown: boolean;
  origin: "model" | "manual";
}

interface ReadResponse {
  fileId: string;
  fileName: string;
  mediaType: string;
  extraction: Extraction;
  outcome: AiOutcome;
}

interface Created {
  id: string;
  fileName: string;
  kind: string;
  records: number;
  rejected: number;
}

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,application/pdf,image/*,text/plain";

function month(date: string | null | undefined): string {
  return date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "";
}

function blankRow(defaultDate: string): Row {
  return {
    key: Math.random().toString(36).slice(2),
    include: true,
    description: "",
    category: "fuel",
    quantity: "",
    unit: "",
    date: defaultDate,
    cnCode: "",
    supplySource: "",
    evidence: "",
    page: null,
    confidence: null,
    check: "manual",
    unitKnown: true,
    origin: "manual",
  };
}

export function DocumentReader({
  processes,
  aiAvailable,
  maxMb,
}: {
  processes: { id: string; name: string }[];
  aiAvailable: boolean;
  maxMb: number;
}) {
  const router = useRouter();
  const reading = useRequest();
  const importing = useRequest();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ReadResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [processId, setProcessId] = useState(processes[0]?.id ?? "");
  const [supplier, setSupplier] = useState("");
  const [created, setCreated] = useState<Created[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setResult(null);
    setRows([]);
    setCreated(null);
    setProblem(null);
  }

  async function read() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    const r = await reading.send<ReadResponse>("/api/documents", { form });
    if (!r) return;
    setResult(r);
    setSupplier(r.extraction.issuer ?? "");
    const fallbackDate = month(
      r.extraction.billingPeriod?.end ?? r.extraction.documentDate ?? null,
    );
    const next: Row[] = r.extraction.lines.map((l) => ({
      key: l.id,
      include: l.category !== "other" && l.quantity !== null,
      description: l.description,
      category: l.category,
      quantity: l.quantity === null ? "" : String(l.quantity),
      unit: l.unit ?? "",
      date: month(l.date) || fallbackDate,
      cnCode: l.cnCode ?? "",
      supplySource: l.supplySource ?? "",
      evidence: l.evidence,
      page: l.page,
      confidence: l.confidence,
      check: l.check,
      unitKnown: l.unitKnown,
      origin: "model",
    }));
    setRows(next.length > 0 ? next : [blankRow(fallbackDate)]);
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function importRows() {
    setProblem(null);
    const chosen = rows.filter((r) => r.include);
    if (chosen.length === 0) return setProblem("Tick at least one line to import.");
    for (const [i, r] of chosen.entries()) {
      const n = Number(r.quantity.replace(/,/g, ""));
      const label = r.description || `line ${i + 1}`;
      if (!r.description.trim()) return setProblem(`Give line ${i + 1} a description.`);
      if (!Number.isFinite(n) || n <= 0) return setProblem(`Enter a quantity for “${label}”.`);
      if (!r.unit.trim()) return setProblem(`Enter the unit for “${label}” exactly as printed.`);
      if (!/^\d{4}-\d{2}$/.test(r.date)) return setProblem(`Choose the month for “${label}”.`);
      if (r.category === "other")
        return setProblem(`“${label}” is marked “Not needed”; untick it or choose a type.`);
    }
    if (!processId) return setProblem("Choose which part of the plant these figures belong to.");
    const r = await importing.send<{ datasets: Created[] }>("/api/documents/import", {
      json: {
        fileId: result?.fileId,
        processId,
        supplier: supplier || null,
        lines: chosen.map((row) => ({
          description: row.description.trim(),
          category: row.category,
          quantity: Number(row.quantity.replace(/,/g, "")),
          unit: row.unit.trim(),
          date: row.date,
          cnCode: row.cnCode || null,
          supplySource: row.supplySource || null,
          evidence: row.evidence || null,
          page: row.page,
          origin: row.origin,
        })),
      },
    });
    if (r) {
      setCreated(r.datasets);
      router.refresh();
    }
  }

  // ------------------------------------------------------------ done
  if (created) {
    return (
      <div className="space-y-4">
        <Note tone="good">
          {created.length === 1 ? "A draft dataset was" : `${created.length} draft datasets were`}{" "}
          created from {result?.fileName}. Open {created.length === 1 ? "it" : "each"} to check how
          it was read, then confirm - it does not count until you do. The document is kept as
          evidence.
        </Note>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {created.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-[14px] text-ink">
                {d.fileName}
                <span className="ml-2 text-[13px] text-muted">
                  {d.records} record{d.records === 1 ? "" : "s"}
                  {d.rejected > 0 ? ` · ${d.rejected} not imported` : ""}
                </span>
              </span>
              <Link href={`/ingest/${d.id}`} className="text-[14px] font-medium text-accent">
                Review →
              </Link>
            </li>
          ))}
        </ul>
        <Button onClick={reset}>Read another document</Button>
      </div>
    );
  }

  // ------------------------------------------------------------ pick
  if (!result) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto]">
          <Field
            label="Bill, receipt, invoice or photo"
            hint={`PDF, JPEG, PNG or WebP, up to ${maxMb} MB (photos up to 5 MB). On a phone you can take the photo directly.`}
          >
            <Input
              type="file"
              accept={ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (preview) URL.revokeObjectURL(preview);
                setFile(f);
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </Field>
          <Button variant="primary" disabled={!file || reading.pending} onClick={read}>
            {reading.pending
              ? aiAvailable
                ? "Reading… (up to a minute)"
                : "Saving…"
              : aiAvailable
                ? "Read document"
                : "Attach and enter figures"}
          </Button>
        </div>
        <FormError>{reading.error}</FormError>
        {!aiAvailable ? (
          <p className="text-[13px] leading-[1.6] text-muted">
            No AI model is configured, so you will type the figures from the document yourself. The
            document is still kept as evidence and linked to what you enter.
          </p>
        ) : (
          <p className="text-[13px] leading-[1.6] text-muted">
            The model proposes each line with the text it read it from. You check every line before
            anything is imported, and PDF figures are cross-checked against the document&apos;s own
            text.
          </p>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------ review
  const ex = result.extraction;
  const isImage = result.mediaType.startsWith("image/");
  const needsSupplier = rows.some((r) => r.include && r.category === "precursor");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,260px)_1fr]">
        <div className="space-y-3">
          {isImage && preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob preview
            <img
              src={preview}
              alt={`Preview of ${result.fileName}`}
              className="max-h-[360px] w-full rounded-xl border border-line object-contain"
            />
          ) : (
            <div className="rounded-xl border border-line bg-surface-2 px-4 py-6 text-center">
              <div className="text-[14px] font-medium text-ink">{result.fileName}</div>
              {preview ? (
                <a
                  href={preview}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[13.5px] text-accent"
                >
                  Open the document ↗
                </a>
              ) : null}
            </div>
          )}
          <dl className="space-y-1.5 text-[13px]">
            {[
              ["Type", ex.documentType.replace(/_/g, " ")],
              ["From", ex.issuer],
              ["Number", ex.documentNumber],
              ["Dated", ex.documentDate],
              [
                "Period",
                ex.billingPeriod ? `${ex.billingPeriod.start} → ${ex.billingPeriod.end}` : null,
              ],
              [
                "Read by",
                result.outcome.producedBy === "model"
                  ? (result.outcome.model ?? "AI model")
                  : "You (manual entry)",
              ],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right text-ink-2">{v}</dd>
                </div>
              ))}
          </dl>
        </div>

        <div className="min-w-0 space-y-4">
          {ex.warnings.length > 0 ? (
            <Note tone={result.outcome.producedBy === "model" ? "warning" : "neutral"}>
              <ul className="list-disc space-y-1 pl-5">
                {ex.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Note>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Which part of the plant used this?"
              hint="Every figure is attributed to a production process."
            >
              <Select value={processId} onChange={(e) => setProcessId(e.target.value)}>
                {processes.length === 0 ? (
                  <option value="">Define processes in Settings</option>
                ) : null}
                {processes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            {needsSupplier ? (
              <Field label="Supplier" hint="Needed to request their CBAM data later.">
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </Field>
            ) : null}
          </div>

          <ul className="space-y-3">
            {rows.map((r, i) => (
              <li
                key={r.key}
                className={cn(
                  "rounded-xl border p-4 transition-opacity",
                  r.include ? "border-line bg-surface" : "border-dashed border-line opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => update(r.key, { include: e.target.checked })}
                      className="h-4 w-4 accent-[var(--color-accent)]"
                    />
                    Line {i + 1}
                  </label>
                  <CheckBadge row={r} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-[2fr_1.3fr_1fr_0.8fr_1fr]">
                  <Field label="Item, as printed" className="col-span-2 md:col-span-1">
                    <Input
                      value={r.description}
                      onChange={(e) => update(r.key, { description: e.target.value })}
                    />
                  </Field>
                  <Field label="Type" className="col-span-2 md:col-span-1">
                    <Select
                      value={r.category}
                      onChange={(e) => update(r.key, { category: e.target.value as LineCategory })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Quantity">
                    <Input
                      inputMode="decimal"
                      value={r.quantity}
                      onChange={(e) => update(r.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Unit">
                    <Input
                      value={r.unit}
                      onChange={(e) => update(r.key, { unit: e.target.value, unitKnown: true })}
                    />
                  </Field>
                  <Field label="Month" className="col-span-2 md:col-span-1">
                    <Input
                      type="month"
                      value={r.date}
                      onChange={(e) => update(r.key, { date: e.target.value })}
                    />
                  </Field>
                  {r.category === "precursor" ? (
                    <Field label="CN code">
                      <Input
                        value={r.cnCode}
                        onChange={(e) => update(r.key, { cnCode: e.target.value })}
                      />
                    </Field>
                  ) : null}
                  {r.category === "electricity" ? (
                    <Field label="Supply (grid, captive…)" className="col-span-2 md:col-span-1">
                      <Input
                        value={r.supplySource}
                        onChange={(e) => update(r.key, { supplySource: e.target.value })}
                      />
                    </Field>
                  ) : null}
                </div>
                {r.evidence ? (
                  <p className="mt-3 text-[13px] leading-[1.55] text-muted">
                    Read from{r.page ? ` page ${r.page}` : ""}:{" "}
                    <span className="text-ink-2">&ldquo;{r.evidence}&rdquo;</span>
                    {r.confidence !== null ? ` · ${Math.round(r.confidence * 100)}% sure` : ""}
                  </p>
                ) : null}
                {!r.unitKnown && r.unit ? (
                  <p className="mt-2 text-[13px] text-warning">
                    “{r.unit}” is not a unit the engine knows; the row will be rejected at review
                    unless you correct it (for example MT, KL, kWh, MU).
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => setRows((rs) => [...rs, blankRow(rs[rs.length - 1]?.date ?? "")])}
            >
              + Add a line
            </Button>
            <Button variant="primary" disabled={importing.pending} onClick={importRows}>
              {importing.pending ? "Creating…" : "Create draft dataset"}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Start over
            </Button>
          </div>
          <FormError>{problem ?? importing.error}</FormError>
        </div>
      </div>
    </div>
  );
}

function CheckBadge({ row }: { row: Row }) {
  if (row.check === "manual") return <Badge>Entered by hand</Badge>;
  if (row.check === "found") {
    return (
      <Badge tone="good" icon={<span aria-hidden>✓</span>}>
        Found in the document
      </Badge>
    );
  }
  if (row.check === "not_found") {
    return (
      <Badge tone="warning" icon={<span aria-hidden>◆</span>}>
        Not in the document&apos;s text - check it
      </Badge>
    );
  }
  return <Badge>Photo or scan - check by eye</Badge>;
}
