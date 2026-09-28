"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Field,
  FormError,
  FormSuccess,
  Input,
  Select,
  useRequest,
} from "@/components/forms";
import { Card } from "@/components/ui";
import type { Installation, ReportingPeriod } from "@/lib/cbam/types";

interface ProcessDraft {
  id: string;
  name: string;
  category: string;
  route: string;
  benchmarkRoute: string;
  aliases: string;
}

interface LinkDraft {
  fromProcessId: string;
  toProcessId: string;
  cnCode: string;
}

const numberOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export function InstallationEditor({
  canWrite,
  initial,
  categories,
  routes,
  countries,
}: {
  canWrite: boolean;
  initial: { installation: Installation; period: ReportingPeriod };
  categories: { id: string; label: string }[];
  routes: { id: string; label: string }[];
  countries: { code: string; name: string }[];
}) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  const [saved, setSaved] = useState<string | null>(null);
  const inst = initial.installation;

  const [details, setDetails] = useState({
    name: inst.name,
    operator: inst.operator,
    street: inst.street,
    city: inst.city,
    state: inst.state,
    postcode: inst.postcode,
    country: inst.country,
    unlocode: inst.unlocode ?? "",
    latitude: inst.latitude?.toString() ?? "",
    longitude: inst.longitude?.toString() ?? "",
    economicActivity: inst.economicActivity ?? "",
    registryOperatorId: inst.registryOperatorId ?? "",
    contactName: inst.contactName,
    contactEmail: inst.contactEmail,
    gridValue: inst.gridEmissionFactor?.value.toString() ?? "",
    gridSource: inst.gridEmissionFactor?.source ?? "",
  });
  const [period, setPeriod] = useState({
    year: initial.period.year,
    start: initial.period.start,
    end: initial.period.end,
  });
  const [processes, setProcesses] = useState<ProcessDraft[]>(
    inst.processes.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      route: p.route ?? "",
      benchmarkRoute: p.benchmarkRoute ?? "",
      aliases: (p.aliases ?? []).join(", "),
    })),
  );
  const [links, setLinks] = useState<LinkDraft[]>(
    (inst.precursorLinks ?? []).map((l) => ({ ...l })),
  );

  const set =
    (k: keyof typeof details) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDetails({ ...details, [k]: e.target.value });

  function updateProcess(i: number, patch: Partial<ProcessDraft>) {
    setProcesses(processes.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  async function save() {
    setSaved(null);
    const grid =
      details.gridValue.trim() === ""
        ? null
        : { value: Number(details.gridValue), source: details.gridSource || "Operator-supplied" };
    const r = await send("/api/installation", {
      method: "PUT",
      json: {
        installation: {
          name: details.name,
          operator: details.operator,
          street: details.street,
          city: details.city,
          state: details.state,
          postcode: details.postcode,
          country: details.country,
          unlocode: details.unlocode,
          latitude: numberOrNull(details.latitude),
          longitude: numberOrNull(details.longitude),
          economicActivity: details.economicActivity,
          registryOperatorId: details.registryOperatorId,
          contactName: details.contactName,
          contactEmail: details.contactEmail,
          gridEmissionFactor: grid,
        },
        period,
        processes: processes.map((p) => ({
          id: p.id.startsWith("new_") ? undefined : p.id,
          name: p.name,
          category: p.category,
          route: p.route,
          benchmarkRoute: p.benchmarkRoute,
          aliases: p.aliases
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
        })),
        precursorLinks: links.filter((l) => l.fromProcessId && l.toProcessId && l.cnCode),
      },
    });
    if (r) {
      setSaved("Saved. Every dataset was rebuilt against the new configuration.");
      router.refresh();
    }
  }

  const ro = !canWrite;

  return (
    <div className="space-y-5">
      <Card
        title="Installation details"
        subtitle="As communicated to importers (sheet A_InstData of the communication template)."
      >
        <div className="grid grid-cols-4 gap-3">
          <Field label="Installation name" className="col-span-2">
            <Input value={details.name} onChange={set("name")} disabled={ro} />
          </Field>
          <Field label="Operator (legal entity)" className="col-span-2">
            <Input value={details.operator} onChange={set("operator")} disabled={ro} />
          </Field>
          <Field label="Street" className="col-span-2">
            <Input value={details.street} onChange={set("street")} disabled={ro} />
          </Field>
          <Field label="City">
            <Input value={details.city} onChange={set("city")} disabled={ro} />
          </Field>
          <Field label="State">
            <Input value={details.state} onChange={set("state")} disabled={ro} />
          </Field>
          <Field label="Postcode">
            <Input value={details.postcode} onChange={set("postcode")} disabled={ro} />
          </Field>
          <Field label="Country">
            <Select value={details.country} onChange={set("country")} disabled={ro}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="UN/LOCODE" hint="Five characters, e.g. INXXX.">
            <Input
              value={details.unlocode}
              onChange={set("unlocode")}
              disabled={ro}
              maxLength={10}
            />
          </Field>
          <Field label="CBAM Registry operator id">
            <Input
              value={details.registryOperatorId}
              onChange={set("registryOperatorId")}
              disabled={ro}
            />
          </Field>
          <Field label="Latitude of main emission source">
            <Input
              value={details.latitude}
              onChange={set("latitude")}
              disabled={ro}
              inputMode="decimal"
            />
          </Field>
          <Field label="Longitude">
            <Input
              value={details.longitude}
              onChange={set("longitude")}
              disabled={ro}
              inputMode="decimal"
            />
          </Field>
          <Field
            label="Economic activity"
            className="col-span-2"
            hint="e.g. Manufacture of basic iron and steel (NIC 2410)"
          >
            <Input
              value={details.economicActivity}
              onChange={set("economicActivity")}
              disabled={ro}
            />
          </Field>
          <Field label="Contact name" className="col-span-2">
            <Input value={details.contactName} onChange={set("contactName")} disabled={ro} />
          </Field>
          <Field label="Contact e-mail" className="col-span-2">
            <Input value={details.contactEmail} onChange={set("contactEmail")} disabled={ro} />
          </Field>
        </div>
      </Card>

      <Card
        title="Reporting period"
        subtitle="Embedded emissions are determined per calendar year of production. A part-year is provisional."
      >
        <div className="grid grid-cols-4 gap-3">
          <Field label="Year">
            <Input
              type="number"
              min={2026}
              max={2034}
              value={period.year}
              disabled={ro}
              onChange={(e) => {
                const y = Number(e.target.value);
                setPeriod({ year: y, start: `${y}-01-01`, end: `${y}-12-31` });
              }}
            />
          </Field>
          <Field label="From">
            <Input
              type="date"
              value={period.start}
              disabled={ro}
              onChange={(e) => setPeriod({ ...period, start: e.target.value })}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={period.end}
              disabled={ro}
              onChange={(e) => setPeriod({ ...period, end: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Production processes"
        subtitle="Emissions are attributed per process. The benchmark route selects the CBAM benchmark where it depends on route; aliases are the section names used in your files."
      >
        <div className="space-y-3">
          {processes.map((p, i) => (
            <div
              key={p.id}
              className="grid grid-cols-12 gap-2 rounded-md border border-line bg-surface-2 p-3"
            >
              <Field label="Name" className="col-span-3">
                <Input
                  value={p.name}
                  disabled={ro}
                  onChange={(e) => updateProcess(i, { name: e.target.value })}
                />
              </Field>
              <Field label="Aggregated goods category" className="col-span-3">
                <Select
                  value={p.category}
                  disabled={ro}
                  onChange={(e) => updateProcess(i, { category: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Route (description)" className="col-span-3">
                <Input
                  value={p.route}
                  disabled={ro}
                  onChange={(e) => updateProcess(i, { route: e.target.value })}
                  placeholder="e.g. DRI-EAF with scrap"
                />
              </Field>
              <Field label="Benchmark route" className="col-span-3">
                <Select
                  value={p.benchmarkRoute}
                  disabled={ro}
                  onChange={(e) => updateProcess(i, { benchmarkRoute: e.target.value })}
                >
                  <option value="">Not route-dependent</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} - {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Section names in your files (comma-separated)" className="col-span-10">
                <Input
                  value={p.aliases}
                  disabled={ro}
                  onChange={(e) => updateProcess(i, { aliases: e.target.value })}
                  placeholder="e.g. SMS, Melt Shop, Induction Furnace"
                />
              </Field>
              <div className="col-span-2 flex items-end justify-end">
                {canWrite ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      setProcesses(processes.filter((_, j) => j !== i));
                      setLinks(
                        links.filter((l) => l.fromProcessId !== p.id && l.toProcessId !== p.id),
                      );
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {canWrite ? (
            <Button
              onClick={() =>
                setProcesses([
                  ...processes,
                  {
                    id: `new_${Math.random().toString(36).slice(2, 10)}`,
                    name: "",
                    category: "crude_steel",
                    route: "",
                    benchmarkRoute: "",
                    aliases: "",
                  },
                ])
              }
            >
              + Add process
            </Button>
          ) : null}
        </div>
      </Card>

      <Card
        title="On-site precursors"
        subtitle="Goods made by one process and consumed by another. Their emissions and free allocation are carried downstream, and output transferred internally is never charged."
      >
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <Field label="From" className="col-span-4">
                <Select
                  value={l.fromProcessId}
                  disabled={ro}
                  onChange={(e) =>
                    setLinks(
                      links.map((x, j) => (j === i ? { ...x, fromProcessId: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">-</option>
                  {processes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || "(unnamed)"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="To" className="col-span-4">
                <Select
                  value={l.toProcessId}
                  disabled={ro}
                  onChange={(e) =>
                    setLinks(
                      links.map((x, j) => (j === i ? { ...x, toProcessId: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">-</option>
                  {processes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || "(unnamed)"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="CN code of the good" className="col-span-3">
                <Input
                  value={l.cnCode}
                  disabled={ro}
                  onChange={(e) =>
                    setLinks(links.map((x, j) => (j === i ? { ...x, cnCode: e.target.value } : x)))
                  }
                  placeholder="e.g. 7207 11 14"
                />
              </Field>
              <div className="col-span-1">
                {canWrite ? (
                  <Button variant="ghost" onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                    ✕
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {canWrite ? (
            <Button
              onClick={() =>
                setLinks([...links, { fromProcessId: "", toProcessId: "", cnCode: "" }])
              }
            >
              + Add link
            </Button>
          ) : null}
          {processes.some((p) => p.id.startsWith("new_")) ? (
            <p className="text-[10.5px] text-muted">Save new processes before linking them.</p>
          ) : null}
        </div>
      </Card>

      <Card
        title="Grid electricity factor"
        subtitle="Leave blank to use the CEA national average from the factor library. The definitive-period default is the Commission's Annex II country factor; enter it here with its source."
      >
        <div className="grid grid-cols-4 gap-3">
          <Field label="tCO₂e per MWh">
            <Input
              value={details.gridValue}
              onChange={set("gridValue")}
              disabled={ro}
              inputMode="decimal"
            />
          </Field>
          <Field label="Source" className="col-span-3">
            <Input
              value={details.gridSource}
              onChange={set("gridSource")}
              disabled={ro}
              placeholder="e.g. IR (EU) 2025/2621 Annex II, India"
            />
          </Field>
        </div>
      </Card>

      <div className="space-y-2">
        <FormError>{error}</FormError>
        <FormSuccess>{saved}</FormSuccess>
        {canWrite ? (
          <Button variant="primary" onClick={save} disabled={pending}>
            {pending ? "Saving and rebuilding…" : "Save installation"}
          </Button>
        ) : (
          <p className="text-[11.5px] text-muted">
            Your role can view these settings but not change them.
          </p>
        )}
      </div>
    </div>
  );
}
