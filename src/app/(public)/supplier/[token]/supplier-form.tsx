"use client";

import { useRef, useState } from "react";
import {
  Button,
  Field,
  FormError,
  FormSuccess,
  Input,
  Select,
  Textarea,
  useRequest,
} from "@/components/forms";

export function SupplierForm({ token, supplierName }: { token: string; supplierName: string }) {
  const { send, pending, error } = useRequest();
  const file = useRef<HTMLInputElement>(null);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({
    companyName: supplierName,
    installationName: "",
    country: "India",
    reportingYear: "2026",
    seeDirect: "",
    seeIndirect: "",
    sefa: "",
    verified: "no",
    verifierName: "",
    contactName: "",
    contactEmail: "",
    notes: "",
  });
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });

  if (done) {
    return (
      <FormSuccess>Thank you - your data has been sent. Your customer will review it.</FormSuccess>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData();
        for (const [k, v] of Object.entries(f)) form.set(k, v);
        const attached = file.current?.files?.[0];
        if (attached) form.set("file", attached);
        if (await send(`/api/supplier/${token}`, { form })) setDone(true);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company">
          <Input required value={f.companyName} onChange={set("companyName")} />
        </Field>
        <Field label="Installation (plant)">
          <Input required value={f.installationName} onChange={set("installationName")} />
        </Field>
        <Field label="Country of production">
          <Input required value={f.country} onChange={set("country")} />
        </Field>
        <Field label="Production year covered">
          <Input
            required
            type="number"
            min={2026}
            max={2034}
            value={f.reportingYear}
            onChange={set("reportingYear")}
          />
        </Field>
        <Field label="Specific embedded emissions - direct" hint="tCO₂e per tonne of product">
          <Input required inputMode="decimal" value={f.seeDirect} onChange={set("seeDirect")} />
        </Field>
        <Field
          label="Specific embedded emissions - indirect"
          hint="tCO₂e per tonne; 0 if not reported"
        >
          <Input inputMode="decimal" value={f.seeIndirect} onChange={set("seeIndirect")} />
        </Field>
        <Field
          label="Specific embedded free allocation (SEFA)"
          hint="tCO₂e per tonne, from your emissions report, if available"
        >
          <Input inputMode="decimal" value={f.sefa} onChange={set("sefa")} />
        </Field>
        <Field label="Verified by an accredited verifier?">
          <Select value={f.verified} onChange={set("verified")}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Select>
        </Field>
        {f.verified === "yes" ? (
          <Field label="Verifier" className="col-span-2">
            <Input required value={f.verifierName} onChange={set("verifierName")} />
          </Field>
        ) : null}
        <Field label="Your name">
          <Input required value={f.contactName} onChange={set("contactName")} />
        </Field>
        <Field label="Your e-mail">
          <Input required type="email" value={f.contactEmail} onChange={set("contactEmail")} />
        </Field>
        <Field
          label={
            f.verified === "yes"
              ? "Verification report (required)"
              : "Emissions report or communication (recommended)"
          }
          className="col-span-2"
          hint="PDF, spreadsheet or image, up to 4 MB."
        >
          <input
            ref={file}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
            className="block w-full text-[13.5px] text-ink-2"
          />
        </Field>
        <Field label="Notes (optional)" className="col-span-2">
          <Textarea value={f.notes} onChange={set("notes")} />
        </Field>
      </div>
      <FormError>{error}</FormError>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Sending…" : "Send to customer"}
      </Button>
    </form>
  );
}
