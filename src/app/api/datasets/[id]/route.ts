import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiWorkspaceContext } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { removeDataset, updateDatasetMapping } from "@/lib/workspace/datasets";

export const dynamic = "force-dynamic";

const Edits = z.object({
  kind: z.enum(["fuel", "electricity", "process_material", "production", "precursor"]).optional(),
  columns: z
    .array(
      z.object({
        sourceColumn: z.string().max(300),
        targetField: z.string().max(60).nullable(),
        detectedUnit: z.string().max(30).nullable().optional(),
      }),
    )
    .max(200)
    .optional(),
  values: z
    .array(
      z.object({
        target: z.enum(["factor", "process", "supply"]),
        sourceValue: z.string().max(300),
        resolvedId: z.string().max(100).nullable(),
      }),
    )
    .max(500)
    .optional(),
  defaults: z.object({ originCountry: z.string().max(80).nullable().optional() }).optional(),
  sheetName: z.string().max(100).optional(),
  headerRow: z.number().int().min(1).max(200).optional(),
});

/** Saves the operator's corrections to a dataset's mapping and rebuilds its records. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Edits);
  if (!body.ok) return body.response;
  try {
    const ds = await updateDatasetMapping(r.ctx.db, r.ctx.workspace, id, body.data, r.ctx.actor);
    return NextResponse.json({
      ok: true,
      records: ds.activities.length,
      rejected: ds.rejected.length,
      skipped: ds.skipped.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  try {
    await removeDataset(r.ctx.db, r.ctx.workspace, id, r.ctx.actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
