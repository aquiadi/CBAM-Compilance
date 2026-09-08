import { NextResponse } from "next/server";
import { resetState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Restores the demo dataset, including every seeded defect. */
export async function POST() {
  resetState();
  return NextResponse.json({ ok: true });
}
