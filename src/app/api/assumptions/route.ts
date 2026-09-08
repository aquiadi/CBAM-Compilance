import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Updates the certificate price, exchange rate and compliance year. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      etsPriceEur?: number;
      inrPerEur?: number;
      year?: number;
    };

    updateState((s) => {
      if (typeof body.etsPriceEur === "number" && body.etsPriceEur > 0 && body.etsPriceEur < 1000) {
        s.assumptions.etsPriceEur = body.etsPriceEur;
      }
      if (typeof body.inrPerEur === "number" && body.inrPerEur > 0 && body.inrPerEur < 1000) {
        s.assumptions.inrPerEur = body.inrPerEur;
      }
      if (typeof body.year === "number" && body.year >= 2024 && body.year <= 2040) {
        s.assumptions.year = Math.round(body.year);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
