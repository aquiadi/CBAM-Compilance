import { recordAudit } from "./audit";
import { lookupGoods } from "./cbam/goods";
import { countryCode } from "./cbam/regulatory";
import type { Db, Queryable } from "./db";
import { UserError } from "./errors";
import { storeFile } from "./files";
import { hashToken, newId, newToken } from "./ids";
import { updateWorkspace } from "./workspace/store";
import type { Actor, Workspace } from "./workspace/types";

/**
 * Supplier data requests.
 *
 * The operator asks a precursor supplier for its CBAM values through a link;
 * the supplier fills in a form - no account needed - and attaches its
 * communication or verification report. Nothing a supplier submits reaches a
 * calculation until the operator has reviewed and accepted it, and both steps
 * are logged.
 */

export const REQUEST_DAYS = 60;

export interface SupplierSubmission {
  companyName: string;
  installationName: string;
  country: string;
  reportingYear: number;
  seeDirect: number;
  seeIndirect: number;
  sefa?: number;
  verified: boolean;
  verifierName?: string;
  contactName: string;
  contactEmail: string;
  notes?: string;
  fileName?: string;
}

export interface SupplierRequest {
  id: string;
  workspaceId: string;
  supplierName: string;
  supplierEmail: string | null;
  cnCode: string;
  message: string | null;
  status: "open" | "submitted" | "accepted" | "rejected" | "revoked";
  submission: SupplierSubmission | null;
  fileId: string | null;
  createdAt: string;
  expiresAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
}

interface Row {
  id: string;
  workspace_id: string;
  supplier_name: string;
  supplier_email: string | null;
  cn_code: string;
  message: string | null;
  status: SupplierRequest["status"];
  submission: SupplierSubmission | string | null;
  file_id: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  submitted_at: Date | string | null;
  decided_at: Date | string | null;
}

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);

function toRequest(r: Row): SupplierRequest {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    supplierName: r.supplier_name,
    supplierEmail: r.supplier_email,
    cnCode: r.cn_code,
    message: r.message,
    status: r.status,
    submission: typeof r.submission === "string" ? JSON.parse(r.submission) : r.submission,
    fileId: r.file_id,
    createdAt: iso(r.created_at) ?? "",
    expiresAt: iso(r.expires_at) ?? "",
    submittedAt: iso(r.submitted_at),
    decidedAt: iso(r.decided_at),
  };
}

export async function createSupplierRequest(
  db: Db,
  ws: Workspace,
  args: {
    supplierName: string;
    supplierEmail?: string;
    cnCode: string;
    message?: string;
    actor: Actor;
  },
): Promise<{ request: SupplierRequest; token: string }> {
  const goods = lookupGoods(args.cnCode);
  if (!goods) throw new UserError(`${args.cnCode} is not an 8-digit CN code of a CBAM good.`);
  const id = newId("sreq");
  const token = newToken();
  const expiresAt = new Date(Date.now() + REQUEST_DAYS * 86_400_000).toISOString();
  const request = await db.tx(async (q) => {
    const { rows } = await q.query<Row>(
      `INSERT INTO supplier_requests (id, workspace_id, token_hash, supplier_name, supplier_email,
                                      cn_code, message, status, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9) RETURNING *`,
      [
        id,
        ws.id,
        hashToken(token),
        args.supplierName.trim(),
        args.supplierEmail?.trim() || null,
        goods.cnCode,
        args.message?.trim() || null,
        args.actor.id,
        expiresAt,
      ],
    );
    await recordAudit(q, {
      orgId: ws.orgId,
      workspaceId: ws.id,
      actor: args.actor,
      action: "supplier.requested",
      detail: { supplier: args.supplierName, cnCode: goods.cnCode },
    });
    return toRequest(rows[0]!);
  });
  return { request, token };
}

export async function listSupplierRequests(
  q: Queryable,
  workspaceId: string,
): Promise<SupplierRequest[]> {
  const { rows } = await q.query<Row>(
    "SELECT * FROM supplier_requests WHERE workspace_id = $1 ORDER BY created_at DESC",
    [workspaceId],
  );
  return rows.map(toRequest);
}

export async function findRequestByToken(
  q: Queryable,
  token: string,
): Promise<
  (SupplierRequest & { installation: string; operator: string; year: number; orgId: string }) | null
> {
  const { rows } = await q.query<
    Row & {
      installation: string | null;
      operator: string | null;
      year: string | null;
      org_id: string;
    }
  >(
    `SELECT r.*, w.state->'installation'->>'name' AS installation,
            w.state->'installation'->>'operator' AS operator,
            w.state->'period'->>'year' AS year, w.org_id
       FROM supplier_requests r JOIN workspaces w ON w.id = r.workspace_id
      WHERE r.token_hash = $1`,
    [hashToken(token)],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    ...toRequest(r),
    installation: r.installation ?? "",
    operator: r.operator ?? "",
    year: Number(r.year ?? 0),
    orgId: r.org_id,
  };
}

export function validateSubmission(raw: Record<string, string>): SupplierSubmission | string {
  const num = (k: string) => {
    const v = (raw[k] ?? "").trim().replace(",", ".");
    if (v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const seeDirect = num("seeDirect");
  const seeIndirect = num("seeIndirect") ?? 0;
  const sefa = num("sefa");
  const year = num("reportingYear");
  if (seeDirect === undefined || Number.isNaN(seeDirect) || seeDirect < 0 || seeDirect > 50) {
    return "Enter the direct specific embedded emissions (tCO2e per tonne, 0-50).";
  }
  if (Number.isNaN(seeIndirect) || seeIndirect < 0 || seeIndirect > 50) {
    return "Indirect specific embedded emissions must be between 0 and 50 tCO2e per tonne.";
  }
  if (sefa !== undefined && (Number.isNaN(sefa) || sefa < 0 || sefa > 20)) {
    return "SEFA must be between 0 and 20 tCO2e per tonne.";
  }
  if (year === undefined || Number.isNaN(year) || year < 2026 || year > 2034) {
    return "Enter the reporting year the values cover (2026 or later).";
  }
  const country = countryCode(raw.country);
  if (!country) return "Enter the country of production (name or ISO code).";
  const required = ["companyName", "installationName", "contactName", "contactEmail"] as const;
  for (const k of required) {
    if (!(raw[k] ?? "").trim()) return "Fill in the company, installation and contact details.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.contactEmail ?? ""))
    return "Enter a valid contact e-mail.";
  const verified = raw.verified === "yes";
  if (verified && !(raw.verifierName ?? "").trim()) {
    return "Name the accredited verifier whose report covers these values.";
  }
  return {
    companyName: raw.companyName!.trim().slice(0, 200),
    installationName: raw.installationName!.trim().slice(0, 200),
    country,
    reportingYear: year,
    seeDirect,
    seeIndirect,
    sefa,
    verified,
    verifierName: raw.verifierName?.trim().slice(0, 200) || undefined,
    contactName: raw.contactName!.trim().slice(0, 200),
    contactEmail: raw.contactEmail!.trim().slice(0, 254),
    notes: raw.notes?.trim().slice(0, 2000) || undefined,
  };
}

export async function submitSupplierData(
  db: Db,
  request: SupplierRequest & { orgId: string },
  submission: SupplierSubmission,
  file: { fileName: string; contentType: string; bytes: Uint8Array } | null,
): Promise<void> {
  const actor: Actor = { id: null, label: `supplier: ${submission.contactEmail}` };
  await db.tx(async (q) => {
    let fileId: string | null = request.fileId;
    if (file) {
      const stored = await storeFile(q, {
        workspaceId: request.workspaceId,
        purpose: "supplier",
        fileName: file.fileName,
        contentType: file.contentType,
        bytes: file.bytes,
        label: `${submission.companyName} - CBAM data for ${request.cnCode}`,
        links: { supplierName: request.supplierName },
        actor,
      });
      fileId = stored.id;
    }
    await q.query(
      `UPDATE supplier_requests SET status = 'submitted', submission = $1, file_id = $2, submitted_at = now()
        WHERE id = $3`,
      [
        JSON.stringify({ ...submission, fileName: file?.fileName ?? submission.fileName }),
        fileId,
        request.id,
      ],
    );
    await recordAudit(q, {
      orgId: request.orgId,
      workspaceId: request.workspaceId,
      actor,
      action: "supplier.submitted",
      detail: {
        supplier: request.supplierName,
        cnCode: request.cnCode,
        seeDirect: submission.seeDirect,
        verified: submission.verified,
      },
    });
  });
}

/** Accept, reject or revoke. Accepting adds the values to the workspace. */
export async function decideSupplierRequest(
  db: Db,
  ws: Workspace,
  requestId: string,
  decision: "accept" | "reject" | "revoke",
  actor: Actor,
): Promise<void> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM supplier_requests WHERE id = $1 AND workspace_id = $2",
    [requestId, ws.id],
  );
  const row = rows[0];
  if (!row) throw new UserError("Request not found.", 404);
  const request = toRequest(row);

  if (decision === "revoke") {
    if (request.status === "accepted")
      throw new UserError("Accepted data is removed from the Suppliers list instead.", 409);
    await db.query(
      "UPDATE supplier_requests SET status = 'revoked', decided_at = now() WHERE id = $1",
      [requestId],
    );
  } else {
    if (request.status !== "submitted" || !request.submission) {
      throw new UserError("Only a submitted request can be accepted or rejected.", 409);
    }
    await db.query("UPDATE supplier_requests SET status = $1, decided_at = now() WHERE id = $2", [
      decision === "accept" ? "accepted" : "rejected",
      requestId,
    ]);
    if (decision === "accept") {
      const s = request.submission;
      if (request.fileId) {
        // The supplier's document becomes evidence of the accepted values.
        await db.query(
          `UPDATE files SET purpose = 'evidence', category = $1 WHERE id = $2 AND workspace_id = $3`,
          [s.verified ? "verification_report" : "supplier_communication", request.fileId, ws.id],
        );
      }
      await updateWorkspace(db, {
        workspaceId: ws.id,
        actor,
        action: "supplier.accepted",
        detail: {
          supplier: request.supplierName,
          cnCode: request.cnCode,
          seeDirect: s.seeDirect,
          seeIndirect: s.seeIndirect,
          sefa: s.sefa,
          verified: s.verified,
        },
        mutate: (state) => {
          state.supplierData = state.supplierData.filter(
            (d) => !(d.supplierName === request.supplierName && d.cnCode === request.cnCode),
          );
          state.supplierData.push({
            id: newId("sdat"),
            supplierName: request.supplierName,
            cnCode: request.cnCode,
            seeDirect: s.seeDirect,
            seeIndirect: s.seeIndirect,
            sefa: s.sefa,
            verified: s.verified,
            evidenceFileId: request.fileId ?? undefined,
            source: "supplier_portal",
            requestId: request.id,
            acceptedAt: new Date().toISOString(),
            acceptedBy: actor.label,
          });
        },
      });
      return;
    }
  }
  await recordAudit(db, {
    orgId: ws.orgId,
    workspaceId: ws.id,
    actor,
    action: decision === "reject" ? "supplier.rejected" : "supplier.revoked",
    detail: { supplier: request.supplierName, cnCode: request.cnCode },
  });
}
