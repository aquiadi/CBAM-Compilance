"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, FormError, FormSuccess, Input, Select, useRequest } from "@/components/forms";
import { Badge, Card, Table, Td, Th } from "@/components/ui";

type Kind = "fuel" | "electricity" | "process_material" | "production" | "precursor";

interface ColumnState {
  sourceColumn: string;
  targetField: string | null;
  detectedUnit: string | null;
  confidence: number;
  rationale: string;
}

interface ValueState {
  target: "factor" | "process" | "supply";
  sourceValue: string;
  resolvedId: string | null;
  confidence: number;
  rationale: string;
}

interface Props {
  datasetId: string;
  canWrite: boolean;
  aiAvailable: boolean;
  status: "draft" | "confirmed";
  initial: {
    kind: Kind;
    columns: ColumnState[];
    values: ValueState[];
    originCountry: string;
    sheetName: string;
    headerRow: number;
  };
  sheets: string[];
  missingRequired: string[];
  samples: Record<string, string[]>;
  schemas: Record<
    string,
    {
      label: string;
      description: string;
      fields: { id: string; label: string; required: boolean; type: string; description: string }[];
    }
  >;
  units: string[];
  factors: { id: string; name: string; basis: string }[];
  processes: { id: string; name: string }[];
}

const QUANTITY_FIELDS = new Set([
  "quantity",
  "quantity_eu",
  "quantity_domestic",
  "quantity_internal",
]);

export function MappingEditor(props: Props) {
  const router = useRouter();
  const { send, pending, error } = useRequest();
  const [kind, setKind] = useState<Kind>(props.initial.kind);
  const [columns, setColumns] = useState(props.initial.columns);
  const [values, setValues] = useState(props.initial.values);
  const [origin, setOrigin] = useState(props.initial.originCountry);
  const [sheet, setSheet] = useState(props.initial.sheetName);
  const [headerRow, setHeaderRow] = useState(props.initial.headerRow);
  const [message, setMessage] = useState<string | null>(null);

  const schema = props.schemas[kind]!;
  const dirty = useMemo(
    () =>
      kind !== props.initial.kind ||
      JSON.stringify(columns) !== JSON.stringify(props.initial.columns) ||
      JSON.stringify(values) !== JSON.stringify(props.initial.values) ||
      origin !== props.initial.originCountry ||
      sheet !== props.initial.sheetName ||
      headerRow !== props.initial.headerRow,
    [kind, columns, values, origin, sheet, headerRow, props.initial],
  );
  const used = new Set(columns.map((c) => c.targetField).filter(Boolean));
  const readOnly = !props.canWrite;

  async function save() {
    setMessage(null);
    const r = await send<{ records: number; rejected: number; skipped: number }>(
      `/api/datasets/${props.datasetId}`,
      {
        method: "PATCH",
        json: {
          kind,
          columns: columns.map((c) => ({
            sourceColumn: c.sourceColumn,
            targetField: c.targetField,
            detectedUnit: c.detectedUnit,
          })),
          values: values.map((v) => ({
            target: v.target,
            sourceValue: v.sourceValue,
            resolvedId: v.resolvedId,
          })),
          defaults: kind === "precursor" ? { originCountry: origin || null } : undefined,
          sheetName: sheet || undefined,
          headerRow,
        },
      },
    );
    if (r) {
      setMessage(
        `Saved: ${r.records} records, ${r.rejected} rows not imported${r.skipped ? `, ${r.skipped} out of scope` : ""}. Review and confirm when it looks right.`,
      );
      router.refresh();
    }
  }

  async function setStatus(status: "draft" | "confirmed") {
    if (await send(`/api/datasets/${props.datasetId}/status`, { json: { status } })) {
      setMessage(
        status === "confirmed" ? "Confirmed - this file now counts." : "Set back to draft.",
      );
      router.refresh();
    }
  }

  async function remap() {
    const r = await send<{ producedBy: string; fallbackReason?: string }>(
      `/api/datasets/${props.datasetId}/remap`,
    );
    if (r) {
      setMessage(
        r.producedBy === "model"
          ? "Re-mapped by the model. Review before confirming."
          : `The model was not used: ${r.fallbackReason ?? "unavailable"}.`,
      );
      router.refresh();
    }
  }

  async function remove() {
    if (
      !confirm(
        "Remove this dataset? Its records leave the declaration; the source file stays in the audit trail.",
      )
    )
      return;
    if (await send(`/api/datasets/${props.datasetId}`, { method: "DELETE" })) {
      router.push("/ingest");
      router.refresh();
    }
  }

  const valueOptions = (target: ValueState["target"]) =>
    target === "process"
      ? props.processes.map((p) => ({ id: p.id, name: p.name }))
      : target === "supply"
        ? props.factors.filter((f) => f.basis === "electricity")
        : props.factors.filter((f) => f.basis !== "electricity");

  return (
    <div className="space-y-8">
      <Card
        title="Mapping"
        subtitle={schema.description}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted">File contains</span>
            <Select
              value={kind}
              disabled={readOnly}
              onChange={(e) => setKind(e.target.value as Kind)}
              className="w-auto py-1 text-[13px]"
            >
              {Object.entries(props.schemas).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        }
        padded={false}
      >
        {props.sheets.length > 0 || props.initial.headerRow > 1 ? (
          <div className="flex flex-wrap items-end gap-4 border-b border-line px-5 py-3">
            {props.sheets.length > 1 ? (
              <label className="text-[13px] text-ink-2">
                Sheet{" "}
                <Select
                  value={sheet}
                  disabled={readOnly}
                  onChange={(e) => setSheet(e.target.value)}
                  className="ml-1 inline-block w-auto py-1"
                >
                  {props.sheets.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </label>
            ) : null}
            <label className="text-[13px] text-ink-2">
              Header on row{" "}
              <Input
                type="number"
                min={1}
                max={200}
                value={headerRow}
                disabled={readOnly}
                onChange={(e) => setHeaderRow(Number(e.target.value))}
                className="ml-1 inline-block w-20 py-1"
              />
            </label>
            <span className="text-[12px] text-muted">
              Changing the sheet or header row re-reads the file and proposes a fresh mapping.
            </span>
          </div>
        ) : null}

        <Table>
          <thead>
            <tr>
              <Th>Source column</Th>
              <Th>Samples</Th>
              <Th>Maps to</Th>
              <Th>Unit (from header)</Th>
              <Th align="right">Conf.</Th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c, i) => (
              <tr key={c.sourceColumn} className="align-top hover:bg-surface-2">
                <Td className="font-mono text-[13px] text-ink">{c.sourceColumn}</Td>
                <Td className="max-w-[220px] text-[12px] text-muted">
                  {(props.samples[c.sourceColumn] ?? []).slice(0, 3).join(" · ") || "-"}
                </Td>
                <Td>
                  <Select
                    value={c.targetField ?? ""}
                    disabled={readOnly}
                    onChange={(e) => {
                      const next = [...columns];
                      next[i] = { ...c, targetField: e.target.value || null };
                      setColumns(next);
                    }}
                    className="py-1 text-[13px]"
                  >
                    <option value="">- not used -</option>
                    {schema.fields.map((f) => (
                      <option
                        key={f.id}
                        value={f.id}
                        disabled={used.has(f.id) && c.targetField !== f.id}
                      >
                        {f.label}
                        {f.required ? " *" : ""}
                      </option>
                    ))}
                  </Select>
                  <div className="mt-1 max-w-[320px] text-[12px] leading-[1.45] text-muted">
                    {c.rationale}
                  </div>
                </Td>
                <Td>
                  {c.targetField && QUANTITY_FIELDS.has(c.targetField) ? (
                    <Input
                      list="known-units"
                      value={c.detectedUnit ?? ""}
                      disabled={readOnly}
                      placeholder="e.g. MT, MU, KL"
                      onChange={(e) => {
                        const next = [...columns];
                        next[i] = { ...c, detectedUnit: e.target.value || null };
                        setColumns(next);
                      }}
                      className="w-28 py-1 text-[13px]"
                    />
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </Td>
                <Td align="right" numeric>
                  {c.targetField ? (
                    <span
                      className={
                        c.confidence >= 0.9
                          ? "text-good"
                          : c.confidence >= 0.7
                            ? "text-ink-2"
                            : "text-warning"
                      }
                    >
                      {c.confidence.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <datalist id="known-units">
          {props.units.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <div className="border-t border-line px-5 py-2.5 text-[12px] leading-[1.5] text-muted">
          * required. A unit column on each row wins over the unit in the header. A quantity with no
          unit anywhere is rejected, never assumed.
        </div>
      </Card>

      {values.length > 0 ? (
        <Card
          title="Value resolution"
          subtitle="Free-text values in the file resolved to the engine's own identifiers. Only ids from these lists can be used."
          padded={false}
        >
          <Table>
            <thead>
              <tr>
                <Th>Source value</Th>
                <Th>Type</Th>
                <Th>Resolved to</Th>
                <Th align="right">Conf.</Th>
              </tr>
            </thead>
            <tbody>
              {values.map((v, i) => (
                <tr key={`${v.target}-${v.sourceValue}`} className="align-top hover:bg-surface-2">
                  <Td className="text-ink">{v.sourceValue}</Td>
                  <Td className="text-[12px] uppercase tracking-wide text-muted">{v.target}</Td>
                  <Td>
                    <Select
                      value={v.resolvedId ?? ""}
                      disabled={readOnly}
                      onChange={(e) => {
                        const next = [...values];
                        next[i] = { ...v, resolvedId: e.target.value || null };
                        setValues(next);
                      }}
                      className="py-1 text-[13px]"
                    >
                      <option value="">- unresolved (rows rejected) -</option>
                      {valueOptions(v.target).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </Select>
                    <div className="mt-1 max-w-[380px] text-[12px] leading-[1.45] text-muted">
                      {v.rationale}
                    </div>
                  </Td>
                  <Td align="right" numeric>
                    {v.resolvedId ? (
                      v.confidence.toFixed(2)
                    ) : (
                      <Badge tone="warning">unresolved</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {kind === "precursor" ? (
        <Card
          title="Country of production"
          subtitle="Used where a row has no country of its own. It selects the Commission's default-value table; with no country the highest default (Annex IV) applies."
        >
          <div className="flex items-center gap-3">
            <Input
              value={origin}
              disabled={readOnly}
              placeholder="e.g. India or IN - leave blank if unknown"
              onChange={(e) => setOrigin(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </Card>
      ) : null}

      <div className="space-y-2">
        <FormError>{error}</FormError>
        <FormSuccess>{message}</FormSuccess>
        {props.canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={save} disabled={pending || !dirty}>
              Save mapping
            </Button>
            {props.status === "draft" ? (
              <Button
                onClick={() => setStatus("confirmed")}
                disabled={pending || dirty || props.missingRequired.length > 0}
                title={
                  dirty
                    ? "Save your changes first"
                    : props.missingRequired.length > 0
                      ? `Map ${props.missingRequired.join(", ")} first`
                      : undefined
                }
              >
                Confirm - include in declaration
              </Button>
            ) : (
              <Button onClick={() => setStatus("draft")} disabled={pending}>
                Set back to draft
              </Button>
            )}
            <Button
              onClick={remap}
              disabled={pending || !props.aiAvailable}
              title={props.aiAvailable ? undefined : "Set an API key to enable"}
            >
              Re-map with AI
            </Button>
            <Button variant="danger" onClick={remove} disabled={pending} className="ml-auto">
              Remove dataset
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-muted">
            Your role can view this mapping but not change it.
          </p>
        )}
        {props.missingRequired.length > 0 ? (
          <p className="text-[12.5px] text-warning">
            Required field{props.missingRequired.length > 1 ? "s" : ""} not mapped:{" "}
            {props.missingRequired.join(", ")}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
