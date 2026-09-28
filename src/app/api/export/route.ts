import { NextResponse } from "next/server";
import { apiWorkspaceContext, jsonError } from "@/lib/auth/context";
import { toCommunication, toCsv } from "@/lib/cbam/declaration";
import { monitoringPlanHtml } from "@/lib/exports/monitoring-plan";
import { emissionsReportXlsx } from "@/lib/exports/report-xlsx";
import { supportingDocuments, verifierPack } from "@/lib/exports/verifier-pack";
import { errorResponse } from "@/lib/http";
import { computeDeclaration } from "@/lib/workspace/declaration";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "workspace"
  );
}

/**
 * Exports the declaration. Every member can export - viewers and verifiers
 * included - because reading the numbers is the point of their access.
 */
export async function GET(request: Request) {
  const r = await apiWorkspaceContext(request);
  if (!r.ok) return r.response;
  const { db, workspace: ws, actor } = r.ctx;
  const format = new URL(request.url).searchParams.get("format") ?? "json";

  try {
    const d = await computeDeclaration(db, ws);
    const base = `carbonpass-${slug(ws.state.installation.name || ws.name)}-${ws.state.period.year}-${d.computedAt.slice(0, 10)}`;
    const attachment = (name: string) => ({
      "content-disposition": `attachment; filename="${name}"`,
    });

    switch (format) {
      case "json":
        return NextResponse.json(d, { headers: attachment(`${base}.json`) });
      case "communication":
        return NextResponse.json(toCommunication(d), {
          headers: attachment(`${base}-communication.json`),
        });
      case "csv":
        return new Response(toCsv(d), {
          headers: { "content-type": "text/csv; charset=utf-8", ...attachment(`${base}.csv`) },
        });
      case "xlsx": {
        const bytes = await emissionsReportXlsx(d, ws.state, {
          workspaceName: ws.name,
          generatedBy: actor.label,
        });
        return new Response(Buffer.from(bytes), {
          headers: {
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ...attachment(`${base}-emissions-report.xlsx`),
          },
        });
      }
      case "monitoring-plan": {
        const docs = await supportingDocuments(db, ws);
        const html = monitoringPlanHtml({
          declaration: d,
          state: ws.state,
          workspaceName: ws.name,
          sourceFiles: docs.sourceFiles,
          evidence: docs.evidence,
          team: docs.members.map((m) => ({ name: m.name, email: m.email, role: m.role })),
          history: docs.history,
        });
        const inline = new URL(request.url).searchParams.get("inline") === "1";
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            ...(inline ? {} : attachment(`${base}-monitoring-methodology.html`)),
          },
        });
      }
      case "verifier-pack": {
        const zip = await verifierPack(db, ws, d, actor.label);
        return new Response(Buffer.from(zip), {
          headers: {
            "content-type": "application/zip",
            ...attachment(`${base}-verifier-pack.zip`),
          },
        });
      }
      default:
        return jsonError(400, `Unknown format "${format}".`);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
