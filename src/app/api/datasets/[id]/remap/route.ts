import { NextResponse } from "next/server";
import { apiWorkspaceContext } from "@/lib/auth/context";
import { errorResponse } from "@/lib/http";
import { remapDataset } from "@/lib/workspace/datasets";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Re-proposes a dataset's mapping with the model, from the stored source file.
 * A per-file action rather than automatic: a model call costs money and
 * latency, and the operator decides when a file is ambiguous enough.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  try {
    const ds = await remapDataset(r.ctx.db, r.ctx.workspace, id, r.ctx.actor);
    return NextResponse.json({
      ok: true,
      producedBy: ds.aiOutcome.producedBy,
      fallbackReason: ds.aiOutcome.fallbackReason,
      records: ds.activities.length,
      rejected: ds.rejected.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
