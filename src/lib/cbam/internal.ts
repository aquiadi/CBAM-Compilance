import type { Contribution, ProcessEmissions } from "./calc";
import { lookupGoods } from "./goods";
import type { ActivityRecord, Installation, ProductionActivity } from "./types";

/**
 * Resolution of on-site precursor flows.
 *
 * In an integrated plant most of the emissions embedded in the shipped product
 * were generated two processes upstream. Annex IV handles this by treating the
 * intermediate as a precursor carrying its own specific embedded emissions, so
 * the calculation has to run in dependency order: sponge iron before steel,
 * steel before rebar.
 *
 * This resolves that ordering, propagates the upstream intensity downstream,
 * and records each transfer as a visible contribution so the audit trail shows
 * where a downstream product's emissions actually came from.
 */

export interface InternalPrecursorResult {
  /** Emissions injected into each process from upstream, tCO2e. */
  injected: Map<string, { directT: number; indirectT: number; contributions: Contribution[] }>;
  /** Specific embedded emissions calculated per process, tCO2e/t. */
  seeByProcess: Map<string, { direct: number; indirect: number }>;
  /** Links that could not be resolved, e.g. a cycle in the routing. */
  warnings: string[];
}

/** Kahn's algorithm. A cycle means the plant routing is misdeclared, not that we should loop forever. */
function topologicalOrder(
  processIds: string[],
  links: { fromProcessId: string; toProcessId: string }[],
): { order: string[]; cyclic: string[] } {
  const indegree = new Map(processIds.map((id) => [id, 0]));
  const adjacency = new Map<string, string[]>(processIds.map((id) => [id, []]));

  for (const link of links) {
    if (!indegree.has(link.toProcessId) || !adjacency.has(link.fromProcessId)) continue;
    indegree.set(link.toProcessId, (indegree.get(link.toProcessId) ?? 0) + 1);
    adjacency.get(link.fromProcessId)!.push(link.toProcessId);
  }

  const queue = processIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  return { order, cyclic: processIds.filter((id) => !order.includes(id)) };
}

export function resolveInternalPrecursors(
  installation: Installation,
  activities: ActivityRecord[],
  emissions: ProcessEmissions[],
): InternalPrecursorResult {
  const links = installation.precursorLinks ?? [];
  const injected = new Map<
    string,
    { directT: number; indirectT: number; contributions: Contribution[] }
  >();
  const seeByProcess = new Map<string, { direct: number; indirect: number }>();
  const warnings: string[] = [];

  const processIds = installation.processes.map((p) => p.id);
  const { order, cyclic } = topologicalOrder(processIds, links);
  if (cyclic.length > 0) {
    warnings.push(
      `Circular precursor routing involving ${cyclic.join(", ")}. Those links were ignored; ` +
        `a production route cannot consume its own output.`,
    );
  }

  /** Tonnes of `cnCode` that `processId` transferred internally. */
  const internalTonnage = (processId: string, cnCode: string): number =>
    activities
      .filter(
        (a): a is ProductionActivity =>
          a.kind === "production" &&
          a.processId === processId &&
          a.cnCode === cnCode &&
          a.destination === "internal_transfer",
      )
      .reduce((s, a) => s + a.quantityT, 0);

  for (const processId of order) {
    const em = emissions.find((e) => e.processId === processId);
    if (!em) continue;

    const incoming = links.filter((l) => l.toProcessId === processId);
    let directT = 0;
    let indirectT = 0;
    const contributions: Contribution[] = [];

    for (const link of incoming) {
      const upstream = seeByProcess.get(link.fromProcessId);
      if (!upstream) continue;
      const tonnes = internalTonnage(link.fromProcessId, link.cnCode);
      if (tonnes <= 0) continue;

      const d = tonnes * upstream.direct;
      const i = tonnes * upstream.indirect;
      directT += d;
      indirectT += i;

      const fromName =
        installation.processes.find((p) => p.id === link.fromProcessId)?.name ?? link.fromProcessId;
      contributions.push({
        activityId: `internal:${link.fromProcessId}->${processId}:${link.cnCode}`,
        label: `${lookupGoods(link.cnCode)?.description ?? link.cnCode} from ${fromName} (on-site precursor)`,
        quantity: Number(tonnes.toFixed(3)),
        quantityUnit: "t",
        factorId: `internal:${link.cnCode}`,
        factorValue: Number((upstream.direct + upstream.indirect).toFixed(6)),
        factorUnit: "tCO2e/t",
        emissionsT: Number((d + i).toFixed(3)),
        formula:
          `${tonnes.toFixed(0)} t x (${upstream.direct.toFixed(4)} direct + ` +
          `${upstream.indirect.toFixed(4)} indirect) tCO2e/t, calculated for ${fromName}`,
        uncertainty: 0.08,
      });
    }

    injected.set(processId, { directT, indirectT, contributions });

    const level = em.activityLevelT;
    seeByProcess.set(processId, {
      direct: level > 0 ? (em.directT + em.precursorDirectT + directT) / level : 0,
      indirect: level > 0 ? (em.indirectT + em.precursorIndirectT + indirectT) / level : 0,
    });
  }

  return { injected, seeByProcess, warnings };
}
