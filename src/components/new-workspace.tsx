"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormError, Input, useRequest } from "./forms";

/**
 * Creating a workspace: the demo plant with every seeded defect, or a blank
 * installation for the operator's own data.
 */
export function NewWorkspace({ needsOrganisation }: { needsOrganisation: boolean }) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  const [organisation, setOrganisation] = useState("");
  const [form, setForm] = useState({
    installationName: "",
    operator: "",
    city: "",
    state: "",
    year: 2026,
  });

  async function create(json: Record<string, unknown>) {
    const r = await send("/api/workspaces", {
      json: { ...json, organisation: needsOrganisation ? organisation : undefined },
    });
    if (r) {
      router.push(json.mode === "blank" ? "/settings" : "/overview?tour=1");
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      {needsOrganisation ? (
        <Field label="Organisation" hint="Your company - the exporter.">
          <Input value={organisation} onChange={(e) => setOrganisation(e.target.value)} required />
        </Field>
      ) : null}

      <div className="rounded-xl border border-line bg-surface-2 p-6">
        <h3 className="text-[14.5px] font-semibold text-ink">Explore the demo plant</h3>
        <p className="mt-1 text-[13px] leading-[1.6] text-ink-2">
          A Chhattisgarh DRI-EAF steel plant with eight months of real-shaped data: five files from
          SAP, the DISCOM and the despatch register, each with the defects real exports carry. See
          the whole workflow in a minute; delete it whenever you like.
        </p>
        <Button
          variant="primary"
          className="mt-3"
          disabled={pending || (needsOrganisation && !organisation.trim())}
          onClick={() => create({ mode: "demo" })}
        >
          {pending ? "Setting up…" : "Open the demo"}
        </Button>
      </div>

      <form
        className="rounded-xl border border-line bg-surface-2 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void create({ mode: "blank", ...form });
        }}
      >
        <h3 className="text-[14.5px] font-semibold text-ink">Set up my installation</h3>
        <p className="mt-1 text-[13px] leading-[1.6] text-ink-2">
          One workspace per installation and reporting year. You will define the production
          processes next, then upload your files.
        </p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Installation name" className="md:col-span-2">
            <Input
              required
              value={form.installationName}
              onChange={(e) => setForm({ ...form, installationName: e.target.value })}
              placeholder="e.g. Raigarh Works"
            />
          </Field>
          <Field label="Operator (legal entity)" className="md:col-span-2">
            <Input
              required
              value={form.operator}
              onChange={(e) => setForm({ ...form, operator: e.target.value })}
            />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="State">
            <Input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </Field>
          <Field label="Reporting year" hint="Calendar year of production.">
            <Input
              type="number"
              min={2026}
              max={2034}
              value={form.year}
              onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Button
          type="submit"
          className="mt-3"
          disabled={pending || (needsOrganisation && !organisation.trim())}
        >
          Create workspace
        </Button>
      </form>
      <FormError>{error}</FormError>
    </div>
  );
}
