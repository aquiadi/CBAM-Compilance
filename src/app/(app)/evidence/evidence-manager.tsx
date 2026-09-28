"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Field, FormError, Input, Select, useRequest } from "@/components/forms";
import { Card, Empty, Table, Td, Th } from "@/components/ui";
import type { StoredFileMeta } from "@/lib/files";

export function EvidenceManager({
  canWrite,
  evidence,
  sources,
  categories,
  suppliers,
}: {
  canWrite: boolean;
  evidence: StoredFileMeta[];
  sources: StoredFileMeta[];
  categories: { id: string; label: string }[];
  suppliers: string[];
}) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const { send, pending, error } = useRequest();
  const [category, setCategory] = useState("verification_report");
  const [label, setLabel] = useState("");
  const [supplier, setSupplier] = useState("");
  const [findingCode, setFindingCode] = useState("");

  async function upload() {
    const f = file.current?.files?.[0];
    if (!f) return;
    const form = new FormData();
    form.set("file", f);
    form.set("category", category);
    form.set("label", label);
    if (supplier) form.set("supplierName", supplier);
    if (findingCode) form.set("findingCode", findingCode);
    if (await send("/api/evidence", { form })) {
      setLabel("");
      if (file.current) file.current.value = "";
      router.refresh();
    }
  }

  const categoryLabel = (id: string | null) =>
    categories.find((c) => c.id === id)?.label ?? id ?? "";
  const kb = (n: number) => `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;

  return (
    <div className="space-y-8">
      {canWrite ? (
        <Card title="Add evidence">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="File" className="md:col-span-2">
              <input
                ref={file}
                type="file"
                className="block w-full text-[13.5px] text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface-3 file:px-3 file:py-1.5 file:text-[13.5px] file:text-ink-2"
              />
            </Field>
            <Field label="Category" className="md:col-span-2">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Label" className="md:col-span-2">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Jindal Sponge verification report 2026"
              />
            </Field>
            <Field label="Supplier (optional)">
              <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">-</option>
                {suppliers.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Finding (optional)" hint="e.g. CP-016">
              <Input value={findingCode} onChange={(e) => setFindingCode(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3 space-y-2">
            <FormError>{error}</FormError>
            <Button variant="primary" onClick={upload} disabled={pending}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card title="Evidence" subtitle={`${evidence.length} documents`} padded={false}>
        {evidence.length === 0 ? (
          <div className="p-5">
            <Empty>No evidence yet.</Empty>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th>Category</Th>
                <Th>Linked to</Th>
                <Th>Added</Th>
                <Th>SHA-256</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {evidence.map((f) => (
                <tr key={f.id} className="hover:bg-surface-2">
                  <Td className="text-ink">
                    <a href={`/api/files/${f.id}`} className="hover:text-accent">
                      {f.label ?? f.fileName}
                    </a>
                    <div className="text-[12px] text-muted">
                      {f.fileName} · {kb(f.sizeBytes)}
                    </div>
                  </Td>
                  <Td className="text-[12.5px]">{categoryLabel(f.category)}</Td>
                  <Td className="text-[12.5px]">
                    {[
                      f.links.supplierName,
                      f.links.findingCode,
                      f.links.activityIds?.length ? `${f.links.activityIds.length} records` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </Td>
                  <Td className="text-[12.5px]">
                    {f.createdAt.slice(0, 10)}
                    <div className="text-[12px] text-muted">{f.uploadedByLabel}</div>
                  </Td>
                  <Td className="font-mono text-[11.5px] text-muted">{f.sha256.slice(0, 12)}…</Td>
                  <Td align="right">
                    {canWrite ? (
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={async () => {
                          if (!confirm(`Delete ${f.fileName}?`)) return;
                          if (await send(`/api/files/${f.id}`, { method: "DELETE" }))
                            router.refresh();
                        }}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card
        title="Source files"
        subtitle="Every uploaded dataset, kept byte for byte for the audit trail."
        padded={false}
      >
        {sources.length === 0 ? (
          <div className="p-5">
            <Empty>No source files yet.</Empty>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Uploaded</Th>
                <Th align="right">Size</Th>
                <Th>SHA-256</Th>
              </tr>
            </thead>
            <tbody>
              {sources.map((f) => (
                <tr key={f.id} className="hover:bg-surface-2">
                  <Td className="font-mono text-[13px] text-ink">
                    <a href={`/api/files/${f.id}`} className="hover:text-accent">
                      {f.fileName}
                    </a>
                  </Td>
                  <Td className="text-[12.5px]">
                    {f.createdAt.slice(0, 10)} · {f.uploadedByLabel}
                  </Td>
                  <Td align="right" numeric>
                    {kb(f.sizeBytes)}
                  </Td>
                  <Td className="font-mono text-[11.5px] text-muted">{f.sha256}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
