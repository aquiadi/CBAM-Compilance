import { NextResponse } from "next/server";
import { jsonError, sameOrigin } from "@/lib/auth/context";
import { endSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Cross-origin request refused.");
  await endSession(await getDb());
  return NextResponse.json({ ok: true });
}
