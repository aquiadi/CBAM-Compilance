import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Installation, ReportingPeriod } from "../cbam/types";
import type { Db } from "../db";
import { DEMO_INSTALLATION, DEMO_PERIOD } from "../demo";
import { addDataset } from "./datasets";
import { createWorkspace, emptyState, getWorkspace } from "./store";
import type { Actor, Workspace } from "./types";

/**
 * New workspaces: either the demo plant, with its seeded defects intact, or a
 * blank installation for the operator's own data.
 */

export function blankInstallation(
  operator: string,
  contactName: string,
  contactEmail: string,
): Installation {
  return {
    id: "installation",
    name: "",
    operator,
    street: "",
    city: "",
    state: "",
    postcode: "",
    country: "IN",
    contactName,
    contactEmail,
    processes: [],
    precursorLinks: [],
  };
}

export function calendarYear(year: number): ReportingPeriod {
  return { year, start: `${year}-01-01`, end: `${year}-12-31`, regime: "definitive" };
}

function demoFiles(): { fileName: string; bytes: Uint8Array }[] {
  const dir = join(process.cwd(), "data", "demo");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".csv"))
    .sort()
    .map((fileName) => ({ fileName, bytes: new Uint8Array(readFileSync(join(dir, fileName))) }));
}

export async function createDemoWorkspace(
  db: Db,
  orgId: string,
  actor: Actor,
  period: ReportingPeriod = DEMO_PERIOD,
): Promise<Workspace> {
  let ws = await createWorkspace(db, {
    orgId,
    name: `${DEMO_INSTALLATION.name} (demo) ${period.year}`,
    state: emptyState(DEMO_INSTALLATION, period),
    actor,
  });
  for (const file of demoFiles()) {
    // Seeding uses the deterministic mapper so creating a demo never makes a
    // network call; the datasets arrive confirmed so the demo opens on a
    // complete declaration, defects included.
    await addDataset(db, ws, {
      fileName: file.fileName,
      contentType: "text/csv",
      bytes: file.bytes,
      actor,
      useModel: false,
      status: "confirmed",
    });
    ws = (await getWorkspace(db, ws.id)) ?? ws;
  }
  return ws;
}

export async function createBlankWorkspace(
  db: Db,
  args: {
    orgId: string;
    name: string;
    installation: Installation;
    period: ReportingPeriod;
    actor: Actor;
  },
): Promise<Workspace> {
  return createWorkspace(db, {
    orgId: args.orgId,
    name: args.name,
    state: emptyState(args.installation, args.period),
    actor: args.actor,
  });
}
