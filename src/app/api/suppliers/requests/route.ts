import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { validEmail } from "@/lib/auth/accounts";
import { apiWorkspaceContext, publicBaseUrl } from "@/lib/auth/context";
import { errorResponse, parseJson } from "@/lib/http";
import { sendMail } from "@/lib/mail";
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
    const link = `${publicBaseUrl(request)}/supplier/${token}`;
    const to = body.data.supplierEmail;
    const emailed =
      to && validEmail(to)
        ? await sendMail({
            to,
            subject: `CBAM emissions data request from ${r.ctx.org.name}`,
            text: [
              `${r.ctx.org.name} asks ${body.data.supplierName} for the CBAM embedded emissions of the goods you supply under CN ${body.data.cnCode}.`,
              ...(body.data.message ? ["", body.data.message] : []),
              "",
              "Enter your figures and attach your verification report here - no account needed:",
              "",
              link,
              "",
              `The link works until ${created.expiresAt.slice(0, 10)}.`,
            ].join("\n"),
          })
        : false;
    return NextResponse.json({
      ok: true,
      id: created.id,
      link,
      expiresAt: created.expiresAt,
      emailed,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
