"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormError, Input, Select, useRequest } from "@/components/forms";
import { Badge, cn, Note } from "@/components/ui";
import type { AiOutcome } from "@/lib/ai/client";
import type { SupplierCommunication } from "@/lib/ai/extract-supplier";

/**
 * Read a supplier's CBAM communication: the model proposes each good's SEE and
 * SEFA with the words it read them from, a person checks them against the
 * document and applies them. Without a key the same form is for typing the
 * values in; the document is kept as evidence either way.
 */

interface Row {
  key: string;
  include: boolean;
  cnCode: string;
  description: string;
  seeDirect: string;
  seeIndirect: string;
  sefa: string;
  evidence: string;
  page: number | null;
  check: "found" | "not_found" | "no_text" | "manual";
  origin: "model" | "manual";
}

interface ReadResponse {
  fileId: string;
  fileName: string;
  mediaType: string;
  communication: SupplierCommunication;
  outcome: AiOutcome;
}

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.txt,application/pdf,image/*,text/plain";

const num = (v: string) => Number(v.replace(",", "."));
const str = (v: number | null) => (v === null ? "" : String(v));

function blank(): Row {
  return {
    key: Math.random().toString(36).slice(2),
    include: true,
    cnCode: "",
    description: "",
    seeDirect: "",
    seeIndirect: "",
    sefa: "",
    evidence: "",
    page: null,
    check: "manual",
    origin: "manual",
  };
}

export function SupplierDocumentReader({
  knownSuppliers,
  aiAvailable,
  maxMb,
}: {
  knownSuppliers: string[];
  aiAvailable: boolean;
  maxMb: number;
}) {
  const router = useRouter();
  const reading = useRequest();
  const applying = useRequest();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ReadResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifierName, setVerifierName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  function reset() {
    setFile(null);
    setResult(null);
    setRows([]);
    setSupplierName("");
    setVerified(false);
    setVerifierName("");
    setProblem(null);
    setApplied(null);
  }

  async function read() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    const r = await reading.send<ReadResponse>("/api/suppliers/documents", { form });
    if (!r) return;
    const c = r.communication;
    setResult(r);
    // Prefer the spelling used in this plant's own receipts, so the values attach.
    const match = knownSuppliers.find(
      (s) =>
        c.supplierName && s.toLowerCase().includes(c.supplierName.toLowerCase().split(" ")[0]!),
    );
    setSupplierName(match ?? c.supplierName ?? "");
    setVerified(c.verified);
    setVerifierName(c.verifierName ?? "");
    setRows(
      c.goods.length > 0
        ? c.goods.map((g) => ({
            key: g.id,
            include: g.cnValid && g.seeDirect !== null,
            cnCode: g.cnCode,
            description: g.description ?? "",
            seeDirect: str(g.seeDirect),
            seeIndirect: str(g.seeIndirect),
            sefa: str(g.sefa),
            evidence: g.evidence,
            page: g.page,
            check: g.check,
            origin: "model",
          }))
        : [blank()],
    );
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function apply() {
    setProblem(null);
    const chosen = rows.filter((r) => r.include);
    if (!supplierName.trim())
      return setProblem("Enter the supplier's name as it appears in your receipts.");
    if (chosen.length === 0) return setProblem("Tick at least one good.");
    for (const r of chosen) {
      if (!/^\d{8}$/.test(r.cnCode.replace(/\s/g, ""))) {
        return setProblem(`“${r.cnCode || "a good"}” needs an 8-digit CN code.`);
      }
      const see = num(r.seeDirect);
      if (!Number.isFinite(see) || see < 0 || see > 50) {
        return setProblem(`Enter the direct SEE for ${r.cnCode} (tCO2e per tonne, 0-50).`);
      }
    }
    if (verified && !verifierName.trim()) return setProblem("Name the accredited verifier.");
    const r = await applying.send<{ applied: number }>("/api/suppliers/documents/accept", {
      json: {
        fileId: result?.fileId,
        supplierName: supplierName.trim(),
        verified,
        verifierName: verified ? verifierName.trim() : null,
        goods: chosen.map((row) => ({
          cnCode: row.cnCode.replace(/\s/g, ""),
          seeDirect: num(row.seeDirect),
          seeIndirect: row.seeIndirect ? num(row.seeIndirect) : 0,
          sefa: row.sefa ? num(row.sefa) : null,
          origin: row.origin,
        })),
      },
    });
    if (r) {
      setApplied(r.applied);
      router.refresh();
    }
  }

  if (applied !== null) {
    return (
      <div className="space-y-4">
        <Note tone="good">
          {applied === 1 ? "One good's values are" : `${applied} goods' values are`} now applied to
          precursors from {supplierName}.{" "}
          {verified
            ? "They count as verified."
            : "They are recorded as unverified, so a warning stays open until a verification report is attached."}{" "}
          The document is kept as evidence.
        </Note>
        <Button onClick={reset}>Read another communication</Button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto]">
          <Field
            label="Supplier's CBAM communication or verification report"
            hint={`PDF or photo, up to ${maxMb} MB. Often the Commission's communication template, filled in by the supplier.`}
          >
            <Input
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Button variant="primary" disabled={!file || reading.pending} onClick={read}>
            {reading.pending
              ? aiAvailable
                ? "Reading… (up to a minute)"
                : "Saving…"
              : aiAvailable
                ? "Read document"
                : "Attach and enter values"}
          </Button>
        </div>
        <FormError>{reading.error}</FormError>
      </div>
    );
  }

  const c = result.communication;
  return (
    <div className="space-y-5">
      {c.warnings.length > 0 ? (
        <Note tone={result.outcome.producedBy === "model" ? "warning" : "neutral"}>
          <ul className="list-disc space-y-1 pl-5">
            {c.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Note>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field
          label="Supplier, as named in your receipts"
          hint="Values attach to precursor rows with this supplier and CN code."
        >
          <Input
            list="known-suppliers"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
          />
          <datalist id="known-suppliers">
            {knownSuppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Verification"
          hint={c.installationName ? `Installation: ${c.installationName}` : undefined}
        >
          <Select
            value={verified ? "yes" : "no"}
            onChange={(e) => setVerified(e.target.value === "yes")}
          >
            <option value="no">Not verified</option>
            <option value="yes">Verified by an accredited verifier</option>
          </Select>
        </Field>
        {verified ? (
          <Field label="Verifier">
            <Input value={verifierName} onChange={(e) => setVerifierName(e.target.value)} />
          </Field>
        ) : null}
      </div>

      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.key}
            className={cn(
              "rounded-xl border p-4",
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
                {r.description || "Good"}
              </label>
              {r.check === "found" ? (
                <Badge tone="good" icon={<span aria-hidden>✓</span>}>
                  Found in the document
                </Badge>
              ) : r.check === "not_found" ? (
                <Badge tone="warning" icon={<span aria-hidden>◆</span>}>
                  Not in the document&apos;s text - check it
                </Badge>
              ) : r.check === "manual" ? (
                <Badge>Entered by hand</Badge>
              ) : (
                <Badge>Photo or scan - check by eye</Badge>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="CN code">
                <Input
                  value={r.cnCode}
                  onChange={(e) => update(r.key, { cnCode: e.target.value })}
                />
              </Field>
              <Field label="SEE direct, t/t">
                <Input
                  inputMode="decimal"
                  value={r.seeDirect}
                  onChange={(e) => update(r.key, { seeDirect: e.target.value })}
                />
              </Field>
              <Field label="SEE indirect, t/t">
                <Input
                  inputMode="decimal"
                  value={r.seeIndirect}
                  onChange={(e) => update(r.key, { seeIndirect: e.target.value })}
                />
              </Field>
              <Field label="SEFA, t/t">
                <Input
                  inputMode="decimal"
                  value={r.sefa}
                  onChange={(e) => update(r.key, { sefa: e.target.value })}
                />
              </Field>
            </div>
            {r.evidence ? (
              <p className="mt-3 text-[13px] leading-[1.55] text-muted">
                Read from{r.page ? ` page ${r.page}` : ""}:{" "}
                <span className="text-ink-2">&ldquo;{r.evidence}&rdquo;</span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setRows((rs) => [...rs, blank()])}>+ Add a good</Button>
        <Button variant="primary" disabled={applying.pending} onClick={apply}>
          {applying.pending ? "Applying…" : "Apply to precursors"}
        </Button>
        <Button variant="ghost" onClick={reset}>
          Start over
        </Button>
      </div>
      <FormError>{problem ?? applying.error}</FormError>
    </div>
  );
}
