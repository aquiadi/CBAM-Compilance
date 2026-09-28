import { recordAudit } from "@/lib/audit";
import { apiContext, jsonError } from "@/lib/auth/context";
import { errorResponse } from "@/lib/http";
import { exportOrganisation } from "@/lib/organisation-data";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Everything the organisation has, as one zip. Owners only. */
export async function GET(request: Request) {
  const r = await apiContext(request, { roles: ["owner"] });
  if (!r.ok) return r.response;
  try {
    const limit = await rateLimit(r.ctx.db, `org-export:${r.ctx.org.id}`, 5, 3600);
    if (!limit.allowed) return jsonError(429, "Five exports an hour at most. Try again later.");
    const zip = await exportOrganisation(r.ctx.db, r.ctx.org, r.ctx.actor.label);
    await recordAudit(r.ctx.db, {
      orgId: r.ctx.org.id,
      actor: r.ctx.actor,
      action: "organisation.exported",
      detail: { bytes: zip.byteLength },
    });
    const name =
      r.ctx.org.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "organisation";
    return new Response(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${name}-carbonpass-export.zip"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
