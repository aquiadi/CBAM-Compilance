import * as z from "zod/v4";
import { recordAudit } from "./audit";
import { lookupGoods } from "./cbam/goods";
import type { Db } from "./db";
import { UserError } from "./errors";
import { getFile } from "./files";
import { newId } from "./ids";
import { updateWorkspace } from "./workspace/store";
import type { Actor, Workspace } from "./workspace/types";

/**
 * Applying supplier values read from a supplier's own document.
 *
 * The values have been read (by the model or by hand) and checked by a person
 * against the document. They are applied exactly like an accepted portal
 * submission - one entry per supplier and CN code, replacing an older one -
 * with the document attached as evidence, so the verifier sees where each
 * value came from.
 */

export const SupplierDocumentAcceptSchema = z.object({
  fileId: z.string().min(1).max(60),
  supplierName: z.string().trim().min(1).max(200),
  verified: z.boolean(),
  verifierName: z.string().trim().max(200).nullish(),
  goods: z
    .array(
      z.object({
        cnCode: z.string().trim().min(8).max(20),
        seeDirect: z.number().min(0).max(50),
        seeIndirect: z.number().min(0).max(50),
        sefa: z.number().min(0).max(20).nullish(),
        origin: z.enum(["model", "manual"]),
      }),
    )
    .min(1)
    .max(50),
});

export type SupplierDocumentAccept = z.infer<typeof SupplierDocumentAcceptSchema>;

export async function acceptSupplierDocument(
  db: Db,
  ws: Workspace,
  actor: Actor,
  input: SupplierDocumentAccept,
): Promise<number> {
  const file = await getFile(db, ws.id, input.fileId);
  if (!file || file.purpose !== "evidence") {
    throw new UserError("The document was not found. Upload it again.", 404);
  }
  if (input.verified && !input.verifierName?.trim()) {
    throw new UserError("Name the accredited verifier whose report covers these values.", 400);
  }
  const goods = input.goods.map((g) => {
    const def = lookupGoods(g.cnCode);
    if (!def) throw new UserError(`${g.cnCode} is not an 8-digit CN code of a CBAM good.`, 400);
    return { ...g, cnCode: def.cnCode };
  });

  await db.query(
    `UPDATE files SET category = $1, links = links || $2::jsonb, label = $3
      WHERE id = $4 AND workspace_id = $5`,
    [
      input.verified ? "verification_report" : "supplier_communication",
      JSON.stringify({ supplierName: input.supplierName }),
      `${input.supplierName} - CBAM communication`,
      file.id,
      ws.id,
    ],
  );

  await updateWorkspace(db, {
    workspaceId: ws.id,
    actor,
    action: "supplier.document_applied",
    detail: {
      supplier: input.supplierName,
      fileId: file.id,
      sha256: file.sha256,
      verified: input.verified,
      goods: goods.map((g) => ({ cnCode: g.cnCode, seeDirect: g.seeDirect, origin: g.origin })),
    },
    mutate: (state) => {
      for (const g of goods) {
        state.supplierData = state.supplierData.filter(
          (d) => !(d.supplierName === input.supplierName && d.cnCode === g.cnCode),
        );
        state.supplierData.push({
          id: newId("sdat"),
          supplierName: input.supplierName,
          cnCode: g.cnCode,
          seeDirect: g.seeDirect,
          seeIndirect: g.seeIndirect,
          sefa: g.sefa ?? undefined,
          verified: input.verified,
          evidenceFileId: file.id,
          source: "document",
          acceptedAt: new Date().toISOString(),
          acceptedBy: actor.label,
        });
      }
    },
  });
  if (input.verified) {
    await recordAudit(db, {
      orgId: ws.orgId,
      workspaceId: ws.id,
      actor,
      action: "supplier.verification_recorded",
      detail: { supplier: input.supplierName, verifier: input.verifierName },
    });
  }
  return goods.length;
}
