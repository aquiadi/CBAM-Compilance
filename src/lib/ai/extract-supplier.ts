import * as z from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { lookupGoods } from "../cbam/goods";
import { countryCode } from "../cbam/regulatory";
import { describeError, getClient, isAiAvailable, MODEL, type AiOutcome } from "./client";
import {
  documentContent,
  documentText,
  numberInText,
  type CheckStatus,
  type DocumentMediaType,
} from "./extract";

/**
 * Reading a supplier's CBAM communication - the document a precursor supplier
 * sends with its specific embedded emissions (SEE) and free allocation
 * adjustment (SEFA), often with a verifier's opinion attached.
 *
 * Same discipline as reading bills: the model proposes values with the words
 * it read them from, every value outside the plausible range is dropped,
 * every PDF figure is looked for in the document's own text, CN codes must be
 * CBAM goods, and a person accepts each good before it is applied to a
 * single precursor.
 */

const GoodSchema = z.object({
  cnCode: z.string().describe("The 8-digit CN code as printed."),
  description: z.string().nullable(),
  seeDirect: z.number().nullable().describe("Direct specific embedded emissions, tCO2e per tonne."),
  seeIndirect: z
    .number()
    .nullable()
    .describe("Indirect specific embedded emissions, tCO2e per tonne. Null if not stated."),
  sefa: z
    .number()
    .nullable()
    .describe("Specific free allocation adjustment (SEFA), tCO2e per tonne. Null if not stated."),
  evidence: z.string().describe("A short verbatim quote containing the SEE figure."),
  page: z.number().nullable(),
  confidence: z.number(),
});

export const SupplierCommunicationSchema = z.object({
  supplierName: z
    .string()
    .nullable()
    .describe("The operator (company) that issued the communication."),
  installationName: z.string().nullable(),
  country: z.string().nullable().describe("Country of the installation."),
  reportingPeriod: z.string().nullable().describe("Reporting year or period the values cover."),
  verified: z
    .boolean()
    .nullable()
    .describe(
      "True only if the document states the values were verified by an accredited verifier.",
    ),
  verifierName: z.string().nullable(),
  goods: z.array(GoodSchema),
  warnings: z.array(z.string()),
});

export type RawSupplierCommunication = z.infer<typeof SupplierCommunicationSchema>;

export interface SupplierGood {
  id: string;
  cnCode: string;
  cnValid: boolean;
  description: string | null;
  seeDirect: number | null;
  seeIndirect: number | null;
  sefa: number | null;
  evidence: string;
  page: number | null;
  confidence: number;
  check: CheckStatus;
}

export interface SupplierCommunication {
  supplierName: string | null;
  installationName: string | null;
  country: string | null;
  reportingPeriod: string | null;
  verified: boolean;
  verifierName: string | null;
  goods: SupplierGood[];
  warnings: string[];
  textChecked: boolean;
}

const SYSTEM = `You read CBAM communications: the documents a producer of CBAM goods (steel, iron, aluminium, cement, fertilisers, hydrogen) sends its customers with the embedded emissions of what it supplied, often following the European Commission's communication template for installations.

For each good, report the CN code and the specific embedded emissions exactly as stated, in tCO2e per tonne of good: direct SEE, indirect SEE, and the specific free allocation adjustment (SEFA) if given. Rules:
- Copy figures exactly. Never compute, add up or convert them. If the document gives only a total SEE, put it in seeDirect and say so in warnings.
- Do not report emissions of the whole installation, of a precursor, or totals in tonnes of CO2 - only the per-tonne figures of each good supplied.
- verified is true only if the document says the values were verified by an accredited verifier (name the verifier); a self-declaration is not verification.
- "evidence" must quote the words containing the SEE figure. If anything is unclear, lower the confidence and explain in warnings.`;

function inRange(v: number | null, max: number): number | null {
  return v !== null && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
}

export function validateSupplierCommunication(
  raw: RawSupplierCommunication,
): SupplierCommunication {
  const warnings = [...raw.warnings];
  const goods = raw.goods.slice(0, 50).map((g, i): SupplierGood => {
    const digits = g.cnCode.replace(/\D/g, "");
    const cnValid = digits.length === 8 && lookupGoods(digits) !== undefined;
    if (!cnValid) warnings.push(`${g.cnCode} is not the 8-digit CN code of a CBAM good.`);
    const seeDirect = inRange(g.seeDirect, 50);
    if (g.seeDirect !== null && seeDirect === null) {
      warnings.push(
        `The direct SEE read for ${g.cnCode} (${g.seeDirect}) is outside 0-50 tCO2e/t.`,
      );
    }
    return {
      id: `g${i + 1}`,
      cnCode: cnValid ? digits : g.cnCode.trim(),
      cnValid,
      description: g.description?.trim() || null,
      seeDirect,
      seeIndirect: inRange(g.seeIndirect, 50),
      sefa: inRange(g.sefa, 20),
      evidence: g.evidence.trim().slice(0, 300),
      page: g.page !== null && Number.isInteger(g.page) && g.page > 0 ? g.page : null,
      confidence: Math.min(1, Math.max(0, Number.isFinite(g.confidence) ? g.confidence : 0)),
      check: "no_text",
    };
  });
  const verified = raw.verified === true && Boolean(raw.verifierName?.trim());
  if (raw.verified && !verified) {
    warnings.push("The document claims verification but names no verifier; treated as unverified.");
  }
  return {
    supplierName: raw.supplierName?.trim() || null,
    installationName: raw.installationName?.trim() || null,
    country: countryCode(raw.country ?? "") ?? null,
    reportingPeriod: raw.reportingPeriod?.trim() || null,
    verified,
    verifierName: verified ? raw.verifierName!.trim() : null,
    goods,
    warnings,
    textChecked: false,
  };
}

export function crossCheckSupplier(
  c: SupplierCommunication,
  text: string | null,
): SupplierCommunication {
  if (!text || text.trim() === "") return c;
  const goods = c.goods.map((g) => {
    const figures = [g.seeDirect, g.seeIndirect, g.sefa].filter((v): v is number => v !== null);
    const found = figures.length > 0 && figures.every((v) => numberInText(text, v));
    return { ...g, check: found ? ("found" as const) : ("not_found" as const) };
  });
  const missing = goods.filter((g) => g.check === "not_found").length;
  return {
    ...c,
    goods,
    textChecked: true,
    warnings:
      missing > 0
        ? [
            `${missing} good${missing > 1 ? "s have" : " has"} a figure that is not in the document's text. Check before accepting.`,
            ...c.warnings,
          ]
        : c.warnings,
  };
}

export function emptySupplierCommunication(
  reason: string,
  textChecked = false,
): SupplierCommunication {
  return {
    supplierName: null,
    installationName: null,
    country: null,
    reportingPeriod: null,
    verified: false,
    verifierName: null,
    goods: [],
    warnings: [reason],
    textChecked,
  };
}

export async function readSupplierCommunication(args: {
  bytes: Uint8Array;
  mediaType: DocumentMediaType;
  fileName: string;
}): Promise<{ communication: SupplierCommunication; outcome: AiOutcome }> {
  const text = await documentText(args.bytes, args.mediaType);
  const empty = (reason: string) => ({
    communication: emptySupplierCommunication(reason, text !== null),
    outcome: { producedBy: "heuristic" as const, fallbackReason: reason },
  });
  if (!isAiAvailable()) {
    return empty(
      "No AI model is configured (ANTHROPIC_API_KEY), so the document was not read automatically. Enter the supplier's values below.",
    );
  }
  const client = getClient();
  if (!client) return empty("The AI model is not available.");
  const started = Date.now();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: documentContent(
            args.bytes,
            args.mediaType,
            args.fileName,
            "Extract the supplier, installation, verification status and the per-good figures.",
          ),
        },
      ],
      output_config: { format: betaZodOutputFormat(SupplierCommunicationSchema) },
    });
    if (response.stop_reason === "refusal") {
      return empty("The model declined to read this document. Enter the values below.");
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return empty("The document could not be read in one pass. Enter the values below.");
    }
    return {
      communication: crossCheckSupplier(
        validateSupplierCommunication(response.parsed_output),
        text,
      ),
      outcome: {
        producedBy: "model",
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - started,
      },
    };
  } catch (error) {
    return empty(`The document could not be read automatically: ${describeError(error)}`);
  }
}
