import { NextResponse } from "next/server";
import { toCommunication, toCsv, toRegistryXml } from "@/lib/cbam/declaration";
import { getDeclaration } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Exports the declaration as JSON, CSV or Registry-shaped XML. */
export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const declaration = getDeclaration();
  const stamp = declaration.computedAt.slice(0, 10);
  const base = `carbonpass-${declaration.installation.id}-${declaration.period.year}-${stamp}`;

  if (format === "csv") {
    return new Response(toCsv(declaration), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${base}.csv"`,
      },
    });
  }

  if (format === "xml") {
    return new Response(toRegistryXml(declaration), {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename="${base}.xml"`,
      },
    });
  }

  if (format === "communication") {
    return NextResponse.json(toCommunication(declaration), {
      headers: { "content-disposition": `attachment; filename="${base}-communication.json"` },
    });
  }

  return NextResponse.json(declaration);
}
