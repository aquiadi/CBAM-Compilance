import { NextResponse } from "next/server";
import { apiWorkspaceContext } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { DocumentImportSchema, importDocumentLines } from "@/lib/workspace/documents";

export const dynamic = "force-dynamic";

/** Turns checked document lines into draft datasets, one per kind. */
export async function POST(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const body = await parseJson(request, DocumentImportSchema);
  if (!body.ok) return body.response;
  try {
    const datasets = await importDocumentLines(r.ctx.db, r.ctx.workspace, r.ctx.actor, body.data);
    return NextResponse.json({
      ok: true,
      datasets: datasets.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        kind: d.mapping.kind,
        records: d.activities.length,
        rejected: d.rejected.length,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
