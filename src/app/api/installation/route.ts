import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { apiWorkspaceContext, jsonError } from "@/lib/auth/context";
import { lookupGoods } from "@/lib/cbam/goods";
import { ROUTE_INDICATORS } from "@/lib/cbam/regulatory";
import type { AggregatedGoodsCategoryId } from "@/lib/cbam/types";
import { errorResponse, parseJson } from "@/lib/http";
import { newId } from "@/lib/ids";
import { rebuildAllDatasets } from "@/lib/workspace/datasets";
import { getWorkspace, updateWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATEGORIES = [
  "cement_clinker",
  "cement",
  "aluminous_cement",
  "nitric_acid",
  "ammonia",
  "urea",
  "mixed_fertilisers",
  "sintered_ore",
  "pig_iron",
  "ferro_alloys",
  "dri",
  "crude_steel",
  "iron_or_steel_products",
  "unwrought_aluminium",
  "aluminium_products",
  "hydrogen",
  "electricity",
] as const satisfies readonly AggregatedGoodsCategoryId[];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();

const Body = z.object({
  installation: z.object({
    name: z.string().trim().min(1).max(160),
    operator: z.string().trim().min(1).max(160),
    street: z.string().trim().max(200),
    city: z.string().trim().max(120),
    state: z.string().trim().max(120),
    postcode: z.string().trim().max(20),
    country: z.string().trim().length(2),
    unlocode: optionalText(10),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    economicActivity: optionalText(200),
    registryOperatorId: optionalText(60),
    contactName: z.string().trim().max(120),
    contactEmail: z.string().trim().max(254),
    gridEmissionFactor: z
      .object({ value: z.number().min(0).max(2), source: z.string().trim().min(3).max(200) })
      .nullable()
      .optional(),
  }),
  period: z.object({
    year: z.number().int().min(2026).max(2034),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  processes: z
    .array(
      z.object({
        id: z.string().max(60).optional(),
        name: z.string().trim().min(1).max(120),
        category: z.enum(CATEGORIES),
        route: optionalText(120),
        benchmarkRoute: optionalText(2),
        aliases: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
      }),
    )
    .max(30),
  precursorLinks: z
    .array(
      z.object({
        fromProcessId: z.string().max(60),
        toProcessId: z.string().max(60),
        cnCode: z.string().max(20),
      }),
    )
    .max(60),
});

/**
 * Saves the installation, its reporting period and its production processes,
 * then rebuilds every dataset so section aliases and process changes flow
 * through to the records.
 */
export async function PUT(request: Request) {
  const r = await apiWorkspaceContext(request, { write: true });
  if (!r.ok) return r.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const { installation, period, processes, precursorLinks } = body.data;

  if (
    period.start.slice(0, 4) !== String(period.year) ||
    period.end.slice(0, 4) !== String(period.year)
  ) {
    return jsonError(400, "The reporting period must lie within the reporting year.");
  }
  if (period.start > period.end) return jsonError(400, "The period starts after it ends.");

  const withIds = processes.map((p) => ({ ...p, id: p.id || newId("proc") }));
  const ids = new Set(withIds.map((p) => p.id));
  if (ids.size !== withIds.length) return jsonError(400, "Two processes share an id.");
  for (const p of withIds) {
    if (p.benchmarkRoute && !ROUTE_INDICATORS[p.benchmarkRoute.toUpperCase()]) {
      return jsonError(400, `"${p.benchmarkRoute}" is not a benchmark route indicator.`);
    }
  }
  const links: { fromProcessId: string; toProcessId: string; cnCode: string }[] = [];
  for (const l of precursorLinks) {
    if (!ids.has(l.fromProcessId) || !ids.has(l.toProcessId)) {
      return jsonError(400, "A precursor link refers to a process that does not exist.");
    }
    if (l.fromProcessId === l.toProcessId) {
      return jsonError(400, "A process cannot be its own precursor.");
    }
    const goods = lookupGoods(l.cnCode);
    if (!goods) return jsonError(400, `${l.cnCode} is not an 8-digit CN code of a CBAM good.`);
    links.push({ ...l, cnCode: goods.cnCode });
  }

  try {
    await updateWorkspace(r.ctx.db, {
      workspaceId: r.ctx.workspace.id,
      actor: r.ctx.actor,
      action: "installation.updated",
      detail: {
        installation: installation.name,
        period,
        processes: withIds.map(
          (p) => `${p.name} (${p.category}${p.benchmarkRoute ? `, ${p.benchmarkRoute}` : ""})`,
        ),
      },
      mutate: (s) => {
        s.installation = {
          ...s.installation,
          ...installation,
          country: installation.country.toUpperCase(),
          latitude: installation.latitude ?? undefined,
          longitude: installation.longitude ?? undefined,
          gridEmissionFactor: installation.gridEmissionFactor ?? undefined,
          processes: withIds.map((p) => ({
            ...p,
            benchmarkRoute: p.benchmarkRoute?.toUpperCase(),
          })),
          precursorLinks: links,
        };
        s.period = { ...period, regime: "definitive" };
      },
    });
    const fresh = await getWorkspace(r.ctx.db, r.ctx.workspace.id);
    if (fresh && fresh.state.datasets.length > 0) {
      await rebuildAllDatasets(r.ctx.db, fresh, r.ctx.actor);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
