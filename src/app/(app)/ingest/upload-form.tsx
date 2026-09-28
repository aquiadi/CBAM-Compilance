"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Field, FormError, Select, useRequest } from "@/components/forms";

const KINDS = [
  ["", "Detect automatically"],
  ["fuel", "Fuel consumption"],
  ["electricity", "Electricity"],
  ["process_material", "Process materials"],
  ["production", "Production and despatch"],
  ["precursor", "Precursor receipts"],
] as const;

export function UploadForm({ aiAvailable, maxMb }: { aiAvailable: boolean; maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { send, pending, error, setError } = useRequest();
  const [kind, setKind] = useState("");
  const [useModel, setUseModel] = useState(aiAvailable);
  const [fileName, setFileName] = useState<string | null>(null);

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setError(`The file is larger than ${maxMb} MB. Split it or export only the columns needed.`);
      return;
    }
    const form = new FormData();
    form.set("file", file);
    if (kind) form.set("kind", kind);
    form.set("useModel", String(useModel && aiAvailable));
    const r = await send<{ datasetId: string }>("/api/datasets", { form });
    if (r) router.push(`/ingest/${r.datasetId}`);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 items-end gap-3">
        <Field label="File" hint={`CSV or Excel (.xlsx), up to ${maxMb} MB.`}>
          <input
            ref={input}
            type="file"
            accept=".csv,.txt,.xlsx"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-[13.5px] text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface-3 file:px-3 file:py-1.5 file:text-[13.5px] file:text-ink-2"
          />
        </Field>
        <Field label="What it contains" hint="Leave on detect unless the guess is wrong.">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <div className="pb-5">
          <Button variant="primary" onClick={upload} disabled={pending || !fileName}>
            {pending
              ? useModel && aiAvailable
                ? "Mapping with AI…"
                : "Reading…"
              : "Upload and map"}
          </Button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-ink-2">
        <input
          type="checkbox"
          checked={useModel && aiAvailable}
          disabled={!aiAvailable}
          onChange={(e) => setUseModel(e.target.checked)}
        />
        Propose the mapping with the AI model
        {!aiAvailable ? (
          <span className="text-muted">(no API key set - the deterministic mapper is used)</span>
        ) : null}
      </label>
      <FormError>{error}</FormError>
    </div>
  );
}
