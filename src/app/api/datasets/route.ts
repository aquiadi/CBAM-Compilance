import { NextResponse } from "next/server";
import { apiWorkspaceContext, jsonError } from "@/lib/auth/context";
import { errorResponse } from "@/lib/http";
import { DATASET_SCHEMAS, type DatasetKind } from "@/lib/ingest/schema";
import { addDataset } from "@/lib/workspace/datasets";

export const dynamic = "force-dynamic";
// A model-proposed mapping on a large file can take a while.
export const maxDuration = 120;

/**
 * Uploads a CSV or .xlsx file. It becomes a draft dataset with a proposed
 * mapping; nothing counts until someone reviews and confirms it.
 */
export async function POST(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Send the file as multipart/form-data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "No file was attached.");
  const kindRaw = form.get("kind");
  const kind =
    typeof kindRaw === "string" && kindRaw in DATASET_SCHEMAS
      ? (kindRaw as DatasetKind)
      : undefined;
  const useModel = form.get("useModel") === "true";

  try {
    const dataset = await addDataset(r.ctx.db, r.ctx.workspace, {
      fileName: file.name.slice(0, 200),
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      actor: r.ctx.actor,
      useModel,
      kind,
    });
    return NextResponse.json({ ok: true, datasetId: dataset.id });
  } catch (error) {
    return errorResponse(error);
  }
}
