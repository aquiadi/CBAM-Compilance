import { NextResponse } from "next/server";
import { apiWorkspaceContext } from "@/lib/auth/context";
import { triageFindings } from "@/lib/ai/triage";
import { errorResponse } from "@/lib/http";
import { computeDeclaration } from "@/lib/workspace/declaration";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Runs AI triage over the current findings. Editors only: it spends model tokens. */
export async function POST(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  try {
    const result = await triageFindings(await computeDeclaration(r.ctx.db, r.ctx.workspace));
    return NextResponse.json({
      ok: true,
      summary: result.summary,
      outcome: result.outcome,
      findings: result.findings.map((f) => ({
        code: f.code,
        title: f.title,
        severity: f.severity,
        triage: f.triage ?? null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
