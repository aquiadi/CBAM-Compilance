import { describe, expect, it } from "vitest";
import { parseCsv } from "../ingest/parse";
import { validateMapping } from "./mapper";
import { merge, type TriageItem } from "./triage";
import type { Finding } from "../cbam/rules";

/**
 * Tests for the boundary between the model and the engine.
 *
 * These do not need an API key, because the thing worth testing is not whether
 * the model is clever - it is whether a wrong answer from the model can reach a
 * calculation. Every test here feeds deliberately bad model output through the
 * validators and asserts that it is contained.
 */

const PROCESSES = [
  { id: "proc_dri", name: "DRI Kiln", route: "Rotary kiln" },
  { id: "proc_eaf", name: "Melt Shop", route: "EAF" },
];

const CSV = `Month,Section,Material,Qty,UOM
Jan-26,DRI Kiln,COAL,100,MT`;

const dataset = parseCsv("test.csv", CSV, "ds1");

function proposal(over: Partial<Parameters<typeof validateMapping>[1]> = {}) {
  return {
    kind: "fuel" as const,
    kindConfidence: 0.9,
    columns: [
      {
        sourceColumn: "Month",
        targetField: "period",
        confidence: 0.95,
        detectedUnit: null,
        rationale: "",
      },
      {
        sourceColumn: "Section",
        targetField: "process",
        confidence: 0.9,
        detectedUnit: null,
        rationale: "",
      },
      {
        sourceColumn: "Material",
        targetField: "material",
        confidence: 0.9,
        detectedUnit: null,
        rationale: "",
      },
      {
        sourceColumn: "Qty",
        targetField: "quantity",
        confidence: 0.9,
        detectedUnit: "MT",
        rationale: "",
      },
      {
        sourceColumn: "UOM",
        targetField: "unit",
        confidence: 0.9,
        detectedUnit: null,
        rationale: "",
      },
    ],
    values: [
      {
        sourceValue: "COAL",
        resolvedId: "coal_bituminous_in",
        target: "factor" as const,
        confidence: 0.9,
        rationale: "",
      },
    ],
    warnings: [],
    ...over,
  };
}

describe("validateMapping", () => {
  it("passes a well-formed mapping through", () => {
    const result = validateMapping(dataset, proposal(), PROCESSES);
    expect(result.missingRequired).toHaveLength(0);
    expect(result.columns.find((c) => c.sourceColumn === "Qty")?.targetField).toBe("quantity");
    expect(result.producedBy).toBe("model");
  });

  it("drops a hallucinated target field instead of passing it to the engine", () => {
    const result = validateMapping(
      dataset,
      proposal({
        columns: [
          ...proposal().columns.slice(0, 4),
          {
            sourceColumn: "UOM",
            targetField: "carbon_intensity_factor",
            confidence: 0.99,
            detectedUnit: null,
            rationale: "",
          },
        ],
      }),
      PROCESSES,
    );
    expect(result.columns.find((c) => c.sourceColumn === "UOM")?.targetField).toBeNull();
    expect(result.warnings.join(" ")).toContain("carbon_intensity_factor");
  });

  it("drops a hallucinated emission factor id", () => {
    const result = validateMapping(
      dataset,
      proposal({
        values: [
          {
            sourceValue: "COAL",
            resolvedId: "indian_coal_grade_g11_2024",
            target: "factor",
            confidence: 0.97,
            rationale: "",
          },
        ],
      }),
      PROCESSES,
    );
    expect(result.values).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("indian_coal_grade_g11_2024");
  });

  it("drops a process id that does not exist on this installation", () => {
    const result = validateMapping(
      dataset,
      proposal({
        values: [
          {
            sourceValue: "DRI Kiln",
            resolvedId: "proc_blast_furnace",
            target: "process",
            confidence: 0.95,
            rationale: "",
          },
        ],
      }),
      PROCESSES,
    );
    expect(result.values).toHaveLength(0);
  });

  it("keeps an explicit null resolution, which is the correct answer when nothing fits", () => {
    const result = validateMapping(
      dataset,
      proposal({
        values: [
          {
            sourceValue: "DOLOCHAR",
            resolvedId: null,
            target: "factor",
            confidence: 0.2,
            rationale: "no match",
          },
        ],
      }),
      PROCESSES,
    );
    expect(result.values).toHaveLength(1);
    expect(result.values[0]?.resolvedId).toBeNull();
  });

  it("ignores a column the model invented that is not in the file", () => {
    const result = validateMapping(
      dataset,
      proposal({
        columns: [
          ...proposal().columns,
          {
            sourceColumn: "Phantom Column",
            targetField: "notes",
            confidence: 0.9,
            detectedUnit: null,
            rationale: "",
          },
        ],
      }),
      PROCESSES,
    );
    expect(result.columns.some((c) => c.sourceColumn === "Phantom Column")).toBe(false);
  });

  it("marks a column the model forgot as unmapped rather than dropping it silently", () => {
    const result = validateMapping(
      dataset,
      proposal({ columns: proposal().columns.slice(0, 3) }),
      PROCESSES,
    );
    const qty = result.columns.find((c) => c.sourceColumn === "Qty");
    expect(qty).toBeDefined();
    expect(qty?.targetField).toBeNull();
    expect(result.missingRequired).toContain("quantity");
  });

  it("refuses to let two columns feed one field, keeping the confident one", () => {
    const result = validateMapping(
      dataset,
      proposal({
        columns: [
          ...proposal().columns.slice(0, 3),
          {
            sourceColumn: "Qty",
            targetField: "quantity",
            confidence: 0.95,
            detectedUnit: "MT",
            rationale: "",
          },
          {
            sourceColumn: "UOM",
            targetField: "quantity",
            confidence: 0.4,
            detectedUnit: null,
            rationale: "",
          },
        ],
      }),
      PROCESSES,
    );
    const mapped = result.columns.filter((c) => c.targetField === "quantity");
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.sourceColumn).toBe("Qty");
  });

  it("honours a forced dataset kind over the model's classification", () => {
    const result = validateMapping(dataset, proposal({ kind: "production" }), PROCESSES, "fuel");
    expect(result.kind).toBe("fuel");
  });
});

describe("triage merge", () => {
  const findings: Finding[] = [
    { code: "CP-003", severity: "warning", title: "w", detail: "", activityIds: [], remedy: "" },
    { code: "CP-001", severity: "blocker", title: "b", detail: "", activityIds: [], remedy: "" },
  ];

  const item = (over: Partial<TriageItem>): TriageItem => ({
    code: "CP-001",
    priority: 1,
    plainEnglish: "",
    likelyCause: "",
    firstStep: "",
    effort: "hours",
    estimatedImpactT: 0,
    ...over,
  });

  it("attaches commentary to the matching finding", () => {
    const merged = merge(findings, [item({ code: "CP-001", plainEnglish: "No output recorded." })]);
    expect(merged.find((f) => f.code === "CP-001")?.triage?.plainEnglish).toBe(
      "No output recorded.",
    );
  });

  it("discards triage for a finding the engine never raised", () => {
    const merged = merge(findings, [item({ code: "CP-999", plainEnglish: "Invented problem." })]);
    expect(merged).toHaveLength(2);
    expect(merged.some((f) => f.triage?.plainEnglish === "Invented problem.")).toBe(false);
  });

  it("never lets the model's priority demote a blocker below a warning", () => {
    const merged = merge(findings, [
      item({ code: "CP-001", priority: 9 }),
      item({ code: "CP-003", priority: 1 }),
    ]);
    expect(merged[0]?.severity).toBe("blocker");
  });

  it("cannot change a finding's severity or remove it", () => {
    const merged = merge(findings, []);
    expect(merged).toHaveLength(2);
    expect(merged.map((f) => f.severity).sort()).toEqual(["blocker", "warning"]);
  });
});
