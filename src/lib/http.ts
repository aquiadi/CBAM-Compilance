import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { DatabaseNotConfiguredError } from "./db";
import { UserError } from "./errors";
import { UploadError } from "./ingest/upload";
import { WorkspaceConflictError } from "./workspace/store";

/** Parses a JSON request body against a schema, with a readable error. */
export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: message }, { status: 400 }),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Maps known failures to HTTP statuses; anything else is logged and returned as a plain 500. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof UserError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  if (error instanceof DatabaseNotConfiguredError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
  }
  if (error instanceof UploadError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  }
  if (error instanceof WorkspaceConflictError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json(
    { ok: false, error: "Something went wrong on the server. It has been logged; try again." },
    { status: 500 },
  );
}
