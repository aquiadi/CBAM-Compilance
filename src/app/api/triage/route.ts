import { NextResponse } from "next/server";
import { triageFindings } from "@/lib/ai/triage";
import { getDeclaration } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Runs AI triage over the current findings. */
export async function POST() {
  try {
    const result = await triageFindings(getDeclaration());
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
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
