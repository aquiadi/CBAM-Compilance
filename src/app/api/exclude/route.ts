import { NextResponse } from "next/server";
import { getState, updateState } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Exclude or restore activity records after review.
 *
 * Excluded records are never deleted - they stay in the audit trail with the
 * operator's reason attached, because "why is this row not in the declaration"
 * is the first thing a verifier asks.
 */
export async function POST(request: Request) {
  try {
    const { activityIds, reason, restore } = (await request.json()) as {
      activityIds?: string[];
      reason?: string;
      restore?: boolean;
    };
    if (!activityIds?.length) {
      return NextResponse.json({ ok: false, error: "activityIds is required" }, { status: 400 });
    }

    const known = new Set(getState().datasets.flatMap((d) => d.activities.map((a) => a.id)));
    const valid = activityIds.filter((id) => known.has(id));
    if (valid.length === 0) {
      return NextResponse.json({ ok: false, error: "No matching records" }, { status: 404 });
    }

    updateState((s) => {
      if (restore) {
        s.exclusions = s.exclusions.filter((e) => !valid.includes(e.activityId));
        return;
      }
      const at = new Date().toISOString();
      for (const id of valid) {
        if (s.exclusions.some((e) => e.activityId === id)) continue;
        s.exclusions.push({ activityId: id, reason: reason ?? "Excluded on review", at });
      }
    });

    return NextResponse.json({ ok: true, affected: valid.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
