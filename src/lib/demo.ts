import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Installation, ReportingPeriod } from "./cbam/types";

/**
 * The demo installation.
 *
 * A mid-size Chhattisgarh secondary steel producer on the coal-DRI + induction
 * furnace route, which is the shape of most Indian steel exposed to CBAM: three
 * linked processes, sponge iron made and consumed on site, and a rebar mill
 * whose output is the part that actually ships to Europe.
 */
export const DEMO_INSTALLATION: Installation = {
  id: "inst_shakti_raigarh",
  name: "Raigarh Works",
  operator: "Shakti Steel & Power Ltd",
  street: "Industrial Growth Centre, Phase II, Kharsia Road",
  city: "Raigarh",
  state: "Chhattisgarh",
  postcode: "496001",
  country: "IN",
  unlocode: "INIXY1",
  contactName: "R. Deshpande",
  contactEmail: "cbam@shaktisteel.example",
  processes: [
    {
      id: "proc_dri",
      name: "DRI Kiln #1 & #2",
      category: "dri",
      route: "Coal-based rotary kiln",
      // Raw material handling serves the kiln feed, so its diesel is attributed
      // here. A shared site activity has to land somewhere; recording that
      // choice as configuration makes it reviewable instead of invisible.
      aliases: ["DRI Kiln", "Kiln", "Sponge Iron Plant", "Material Handling"],
    },
    {
      id: "proc_eaf",
      name: "Melt Shop (IF/EAF)",
      category: "crude_steel",
      route: "DRI-EAF with scrap",
      aliases: ["Melt Shop", "Induction Furnace", "SMS", "Steel Melt Shop"],
    },
    {
      id: "proc_rolling",
      name: "Rolling Mill",
      category: "iron_or_steel_products",
      route: "Hot rolling, TMT",
      aliases: ["Rolling Mill", "Bar Mill", "TMT Mill", "Workshop"],
    },
  ],
  // Sponge iron feeds the melt shop, billets feed the rolling mill. Without
  // these links the rebar looks almost emission-free, because the mill only
  // burns reheating fuel - every real tonne of CO2 is upstream.
  precursorLinks: [
    { fromProcessId: "proc_dri", toProcessId: "proc_eaf", cnCode: "72031000" },
    { fromProcessId: "proc_eaf", toProcessId: "proc_rolling", cnCode: "72071100" },
  ],
};

/**
 * Reporting period. The transitional regime ended with 2025; 2026 is the first
 * year that actually costs money, so the demo sits mid-year with eight months
 * of actuals - which is exactly when an exporter wants to see the number.
 */
export const DEMO_PERIOD: ReportingPeriod = {
  year: 2026,
  start: "2026-01-01",
  end: "2026-08-31",
  regime: "definitive",
};

export interface DemoFile {
  fileName: string;
  content: string;
}

export function loadDemoFiles(): DemoFile[] {
  const dir = join(process.cwd(), "data", "demo");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".csv"))
    .sort()
    .map((fileName) => ({ fileName, content: readFileSync(join(dir, fileName), "utf8") }));
}
