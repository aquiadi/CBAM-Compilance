import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiWorkspaceContext, publicBaseUrl } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { createSupplierRequest } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

const Body = z.object({
  supplierName: z.string().trim().min(1).max(200),
  supplierEmail: z.string().trim().max(254).optional(),
  cnCode: z.string().trim().min(8).max(20),
  message: z.string().trim().max(2000).optional(),
});

/** Creates a link a supplier can use to submit its CBAM values. */
export async function POST(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  try {
    const { request: created, token } = await createSupplierRequest(r.ctx.db, r.ctx.workspace, {
      ...body.data,
      actor: r.ctx.actor,
    });
    return NextResponse.json({
      ok: true,
      id: created.id,
      link: `${publicBaseUrl(request)}/supplier/${token}`,
      expiresAt: created.expiresAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
