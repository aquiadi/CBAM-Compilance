import { NextResponse } from "next/server";
import { mapDataset } from "@/lib/ai/mapper";
import { loadDemoFiles } from "@/lib/demo";
import { materialise } from "@/lib/ingest/materialise";
import { parseCsv } from "@/lib/ingest/parse";
import { getState, updateState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Re-runs one file's mapping through the model and rebuilds its records. */
export async function POST(request: Request) {
  try {
    const { datasetId } = (await request.json()) as { datasetId?: string };
    if (!datasetId) {
      return NextResponse.json({ ok: false, error: "datasetId is required" }, { status: 400 });
    }

    const state = getState();
    const existing = state.datasets.find((d) => d.id === datasetId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Unknown dataset" }, { status: 404 });
    }

    const file = loadDemoFiles().find((f) => f.fileName === existing.fileName);
    if (!file) {
      return NextResponse.json(
        { ok: false, error: "Source file is no longer available" },
        { status: 410 },
      );
    }

    const parsed = parseCsv(file.fileName, file.content, datasetId);
    const { mapping, outcome } = await mapDataset(parsed, state.installation.processes);
    const { activities, rejected } = materialise(parsed, mapping, state.installation.processes);

    updateState((s) => {
      const target = s.datasets.find((d) => d.id === datasetId);
      if (!target) return;
      target.mapping = mapping;
      target.aiOutcome = outcome;
      target.activities = activities;
      target.rejected = rejected;
      // Exclusions reference activity ids that no longer exist after a re-map.
      const ids = new Set(activities.map((a) => a.id));
      s.exclusions = s.exclusions.filter(
        (e) => ids.has(e.activityId) || !existing.activities.some((a) => a.id === e.activityId),
      );
    });

    return NextResponse.json({
      ok: true,
      producedBy: outcome.producedBy,
      fallbackReason: outcome.fallbackReason,
      records: activities.length,
      rejected: rejected.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
