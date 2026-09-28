import { env, hasModelKey } from "@/config/env";
import { modelMapsColumns, RULE_BASED_ON_GROQ, type AiOutcome } from "../ai/client";
import { mapDataset } from "../ai/mapper";
import { FACTORS } from "../cbam/factors";
import { countryCode } from "../cbam/regulatory";
import type { Db } from "../db";
import { getFile, storeFile } from "../files";
import { heuristicMapping, mapValues, resolveProcess } from "../ingest/heuristic";
import { materialise } from "../ingest/materialise";
import {
  DATASET_SCHEMAS,
  requiredFieldsFor,
  type DatasetKind,
  type DatasetMapping,
} from "../ingest/schema";
import { readUpload, UploadError, type ReadOptions, type ReadResult } from "../ingest/upload";
import { newId } from "../ids";
import { updateWorkspace } from "./store";
import type { Actor, StoredDataset, Workspace } from "./types";

/**
 * Dataset lifecycle: upload -> draft with a proposed mapping -> operator review
 * and edits -> confirmed, when it starts to count. Every step re-reads the
 * stored source file, so what the declaration uses is always derivable from
 * bytes the verifier can download.
 */

export { UploadError };

export interface MappingEdits {
  kind?: DatasetKind;
  columns?: { sourceColumn: string; targetField: string | null; detectedUnit?: string | null }[];
  values?: {
    target: "factor" | "process" | "supply";
    sourceValue: string;
    resolvedId: string | null;
  }[];
  defaults?: { originCountry?: string | null };
  sheetName?: string;
  headerRow?: number;
}

function refreshMissing(mapping: DatasetMapping): DatasetMapping {
  const mapped = new Set(mapping.columns.map((c) => c.targetField).filter(Boolean) as string[]);
  const missingRequired = requiredFieldsFor(mapping.kind).filter((f) => !mapped.has(f));
  const warnings = mapping.warnings.filter((w) => !w.startsWith("No column mapped to required"));
  if (missingRequired.length > 0) {
    warnings.unshift(
      `No column mapped to required field${missingRequired.length > 1 ? "s" : ""}: ${missingRequired.join(", ")}.`,
    );
  }
  return { ...mapping, missingRequired, warnings };
}

async function proposeMapping(
  read: ReadResult,
  processes: Workspace["state"]["installation"]["processes"],
  useModel: boolean,
  forceKind?: DatasetKind,
): Promise<{ mapping: DatasetMapping; outcome: AiOutcome }> {
  if (useModel && modelMapsColumns()) {
    return mapDataset(read.parsed, processes, forceKind);
  }
  return {
    mapping: heuristicMapping(read.parsed, processes, forceKind),
    outcome: {
      producedBy: "heuristic",
      fallbackReason: !hasModelKey()
        ? "No API key configured."
        : modelMapsColumns()
          ? "Deterministic mapper chosen."
          : RULE_BASED_ON_GROQ,
    },
  };
}

function build(
  read: ReadResult,
  mapping: DatasetMapping,
  processes: Workspace["state"]["installation"]["processes"],
) {
  return materialise(read.parsed, mapping, processes);
}

export async function addDataset(
  db: Db,
  ws: Workspace,
  args: {
    fileName: string;
    contentType: string;
    bytes: Uint8Array;
    actor: Actor;
    useModel?: boolean;
    kind?: DatasetKind;
    status?: "draft" | "confirmed";
  },
): Promise<StoredDataset> {
  const limit = env.CARBONPASS_MAX_UPLOAD_MB * 1024 * 1024;
  if (args.bytes.byteLength > limit) {
    throw new UploadError(`The file is larger than ${env.CARBONPASS_MAX_UPLOAD_MB} MB.`);
  }
  if (args.bytes.byteLength === 0) throw new UploadError("The file is empty.");

  const datasetId = newId("ds");
  const read = await readUpload({ fileName: args.fileName, datasetId, bytes: args.bytes });
  if (read.parsed.rowCount === 0) {
    throw new UploadError("No data rows were found under the header row.");
  }

  const processes = ws.state.installation.processes;
  const { mapping, outcome } = await proposeMapping(read, processes, !!args.useModel, args.kind);
  const file = await storeFile(db, {
    workspaceId: ws.id,
    purpose: "source",
    fileName: args.fileName,
    contentType: args.contentType,
    bytes: args.bytes,
    actor: args.actor,
    links: { datasetId },
  });
  const built = build(read, mapping, processes);
  const now = new Date().toISOString();

  const dataset: StoredDataset = {
    id: datasetId,
    fileId: file.id,
    fileName: args.fileName,
    sheetName: read.sheetName,
    sheets: read.sheets,
    headerRow: read.headerRow,
    uploadedAt: now,
    uploadedBy: args.actor.label,
    rowCount: read.parsed.rowCount,
    mapping,
    aiOutcome: outcome,
    status: args.status ?? "draft",
    confirmedAt: args.status === "confirmed" ? now : undefined,
    confirmedBy: args.status === "confirmed" ? args.actor.label : undefined,
    activities: built.activities,
    rejected: built.rejected,
    skipped: built.skipped,
  };

  await updateWorkspace(db, {
    workspaceId: ws.id,
    actor: args.actor,
    action: "dataset.uploaded",
    detail: {
      datasetId,
      fileName: args.fileName,
      sha256: file.sha256,
      rows: read.parsed.rowCount,
      kind: mapping.kind,
      mappedBy: outcome.producedBy,
    },
    mutate: (state) => {
      state.datasets.push(dataset);
    },
  });
  return dataset;
}

export async function rereadSource(
  db: Db,
  ws: Workspace,
  ds: StoredDataset,
  options: ReadOptions,
): Promise<ReadResult> {
  if (!ds.fileId) throw new UploadError("The source file for this dataset is no longer stored.");
  const file = await getFile(db, ws.id, ds.fileId);
  if (!file) throw new UploadError("The source file for this dataset is no longer stored.");
  return readUpload({ fileName: ds.fileName, datasetId: ds.id, bytes: file.bytes, options });
}

/** Validates operator edits against the schema and the engine's tables. */
export function applyEdits(
  mapping: DatasetMapping,
  edits: MappingEdits,
  processes: { id: string }[],
): DatasetMapping {
  const kind = edits.kind ?? mapping.kind;
  const fields = new Set(DATASET_SCHEMAS[kind].fields.map((f) => f.id));
  let columns = mapping.columns;

  if (edits.kind && edits.kind !== mapping.kind) {
    // A different kind has different fields; unmap anything that no longer fits.
    columns = columns.map((c) =>
      c.targetField && !fields.has(c.targetField)
        ? { ...c, targetField: null, rationale: "Unmapped when the dataset kind changed." }
        : c,
    );
  }

  if (edits.columns) {
    const used = new Set<string>();
    for (const e of edits.columns) {
      if (e.targetField && !fields.has(e.targetField)) {
        throw new UploadError(`"${e.targetField}" is not a field of a ${kind} dataset.`);
      }
      if (e.targetField) {
        if (used.has(e.targetField)) {
          throw new UploadError(`Two columns are mapped to "${e.targetField}".`);
        }
        used.add(e.targetField);
      }
    }
    const byColumn = new Map(edits.columns.map((e) => [e.sourceColumn, e]));
    columns = columns.map((c) => {
      const e = byColumn.get(c.sourceColumn);
      if (!e) return c;
      return {
        ...c,
        targetField: e.targetField,
        detectedUnit: e.detectedUnit === undefined ? c.detectedUnit : e.detectedUnit,
        confidence: 1,
        rationale: "Set by the operator on review.",
      };
    });
  }

  let values = mapping.values;
  if (edits.values) {
    const factorIds = new Set(FACTORS.map((f) => f.id));
    const processIds = new Set(processes.map((p) => p.id));
    for (const v of edits.values) {
      if (!v.resolvedId) continue;
      const ok =
        v.target === "process"
          ? processIds.has(v.resolvedId)
          : factorIds.has(v.resolvedId) &&
            (v.target === "supply"
              ? FACTORS.find((f) => f.id === v.resolvedId)?.basis === "electricity"
              : FACTORS.find((f) => f.id === v.resolvedId)?.basis !== "electricity");
      if (!ok) throw new UploadError(`"${v.resolvedId}" is not a valid ${v.target}.`);
    }
    const key = (target: string, value: string) => `${target}|${value.trim().toLowerCase()}`;
    const edited = new Map(edits.values.map((v) => [key(v.target, v.sourceValue), v]));
    values = values.map((v) => {
      const e = edited.get(key(v.target, v.sourceValue));
      if (!e) return v;
      edited.delete(key(v.target, v.sourceValue));
      return {
        ...v,
        resolvedId: e.resolvedId,
        confidence: 1,
        rationale: "Set by the operator on review.",
      };
    });
    for (const e of edited.values()) {
      values.push({ ...e, confidence: 1, rationale: "Set by the operator on review." });
    }
  }

  let defaults = mapping.defaults;
  if (edits.defaults) {
    const raw = edits.defaults.originCountry?.trim();
    const code = raw ? countryCode(raw) : null;
    if (raw && !code) throw new UploadError(`"${raw}" is not a recognised country.`);
    defaults = { ...defaults, originCountry: code ?? undefined };
  }

  return refreshMissing({ ...mapping, kind, columns, values, defaults });
}

export async function updateDatasetMapping(
  db: Db,
  ws: Workspace,
  datasetId: string,
  edits: MappingEdits,
  actor: Actor,
): Promise<StoredDataset> {
  const ds = ws.state.datasets.find((d) => d.id === datasetId);
  if (!ds) throw new UploadError("Dataset not found.");
  const processes = ws.state.installation.processes;

  const rereadNeeded =
    (edits.sheetName !== undefined && edits.sheetName !== ds.sheetName) ||
    (edits.headerRow !== undefined && edits.headerRow !== ds.headerRow);
  const read = await rereadSource(db, ws, ds, {
    sheetName: edits.sheetName ?? ds.sheetName,
    headerRow: edits.headerRow ?? ds.headerRow,
  });

  let mapping: DatasetMapping;
  let outcome = ds.aiOutcome;
  if (rereadNeeded) {
    // A different sheet or header row means different columns: start again.
    const proposed = await proposeMapping(read, processes, false, edits.kind ?? ds.mapping.kind);
    mapping = proposed.mapping;
    outcome = proposed.outcome;
  } else {
    mapping = applyEdits(ds.mapping, edits, processes);
    // Values in a newly mapped column get a proposed resolution; anything the
    // operator already resolved is kept as they set it.
    const seen = new Set(
      mapping.values.map((v) => `${v.target}|${v.sourceValue.trim().toLowerCase()}`),
    );
    const proposed = mapValues(read.parsed, mapping.kind, mapping.columns, processes).filter(
      (v) => !seen.has(`${v.target}|${v.sourceValue.trim().toLowerCase()}`),
    );
    if (proposed.length > 0) mapping = { ...mapping, values: [...mapping.values, ...proposed] };
  }
  const built = build(read, mapping, processes);

  const updated: StoredDataset = {
    ...ds,
    sheetName: read.sheetName,
    headerRow: read.headerRow,
    rowCount: read.parsed.rowCount,
    mapping,
    aiOutcome: outcome,
    activities: built.activities,
    rejected: built.rejected,
    skipped: built.skipped,
    // Any change to a confirmed mapping needs confirming again.
    status: "draft",
    confirmedAt: undefined,
    confirmedBy: undefined,
  };

  await updateWorkspace(db, {
    workspaceId: ws.id,
    actor,
    action: "dataset.mapping_edited",
    detail: { datasetId, fileName: ds.fileName, edits: JSON.parse(JSON.stringify(edits)) },
    mutate: (state) => {
      state.datasets = state.datasets.map((d) => (d.id === datasetId ? updated : d));
    },
  });
  return updated;
}

export async function remapDataset(
  db: Db,
  ws: Workspace,
  datasetId: string,
  actor: Actor,
): Promise<StoredDataset> {
  const ds = ws.state.datasets.find((d) => d.id === datasetId);
  if (!ds) throw new UploadError("Dataset not found.");
  const processes = ws.state.installation.processes;
  const read = await rereadSource(db, ws, ds, { sheetName: ds.sheetName, headerRow: ds.headerRow });
  const { mapping, outcome } = await proposeMapping(read, processes, true);
  const built = build(read, mapping, processes);
  const updated: StoredDataset = {
    ...ds,
    mapping,
    aiOutcome: outcome,
    activities: built.activities,
    rejected: built.rejected,
    skipped: built.skipped,
    status: "draft",
    confirmedAt: undefined,
    confirmedBy: undefined,
  };
  await updateWorkspace(db, {
    workspaceId: ws.id,
    actor,
    action: "dataset.remapped",
    detail: {
      datasetId,
      fileName: ds.fileName,
      producedBy: outcome.producedBy,
      model: outcome.model,
    },
    mutate: (state) => {
      state.datasets = state.datasets.map((d) => (d.id === datasetId ? updated : d));
    },
  });
  return updated;
}

/**
 * Re-materialise every dataset after the installation's processes change.
 * Sections that pointed at a deleted process become unresolved, and sections
 * nobody had resolved are tried again against the new names and aliases; a
 * section the operator resolved by hand is left as they set it.
 */
export async function rebuildAllDatasets(db: Db, ws: Workspace, actor: Actor): Promise<void> {
  const processes = ws.state.installation.processes;
  const ids = new Set(processes.map((p) => p.id));
  const rebuilt: StoredDataset[] = [];
  for (const ds of ws.state.datasets) {
    try {
      const read = await rereadSource(db, ws, ds, {
        sheetName: ds.sheetName,
        headerRow: ds.headerRow,
      });
      const values = ds.mapping.values.map((v) => {
        if (v.target !== "process") return v;
        if (v.resolvedId && ids.has(v.resolvedId)) return v;
        const r = resolveProcess(v.sourceValue, processes);
        return { ...v, resolvedId: r.id, confidence: r.confidence, rationale: r.why };
      });
      const mapping = { ...ds.mapping, values };
      const built = build(read, mapping, processes);
      rebuilt.push({ ...ds, mapping, ...built });
    } catch {
      rebuilt.push(ds);
    }
  }
  await updateWorkspace(db, {
    workspaceId: ws.id,
    actor,
    action: "datasets.rebuilt",
    detail: { count: rebuilt.length },
    mutate: (state) => {
      state.datasets = state.datasets.map((d) => rebuilt.find((r) => r.id === d.id) ?? d);
    },
  });
}

export async function setDatasetStatus(
  db: Db,
  ws: Workspace,
  datasetId: string,
  status: "draft" | "confirmed",
  actor: Actor,
): Promise<void> {
  const ds = ws.state.datasets.find((d) => d.id === datasetId);
  if (!ds) throw new UploadError("Dataset not found.");
  if (status === "confirmed" && ds.mapping.missingRequired.length > 0) {
    throw new UploadError(
      `Map the required fields first: ${ds.mapping.missingRequired.join(", ")}.`,
    );
  }
  await updateWorkspace(db, {
    workspaceId: ws.id,
    actor,
    action: status === "confirmed" ? "dataset.confirmed" : "dataset.unconfirmed",
    detail: {
      datasetId,
      fileName: ds.fileName,
      records: ds.activities.length,
      rejected: ds.rejected.length,
    },
    mutate: (state) => {
      const target = state.datasets.find((d) => d.id === datasetId);
      if (!target) return;
      target.status = status;
      target.confirmedAt = status === "confirmed" ? new Date().toISOString() : undefined;
      target.confirmedBy = status === "confirmed" ? actor.label : undefined;
    },
  });
}

export async function removeDataset(
  db: Db,
  ws: Workspace,
  datasetId: string,
  actor: Actor,
): Promise<void> {
  const ds = ws.state.datasets.find((d) => d.id === datasetId);
  if (!ds) throw new UploadError("Dataset not found.");
  await updateWorkspace(db, {
    workspaceId: ws.id,
    actor,
    action: "dataset.removed",
    detail: { datasetId, fileName: ds.fileName, records: ds.activities.length },
    mutate: (state) => {
      const ids = new Set(ds.activities.map((a) => a.id));
      state.datasets = state.datasets.filter((d) => d.id !== datasetId);
      state.exclusions = state.exclusions.filter((e) => !ids.has(e.activityId));
    },
  });
  // The source file stays: it is part of the audit trail of what was uploaded.
}
