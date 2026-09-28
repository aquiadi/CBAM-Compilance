import type { AiOutcome } from "../ai/client";
import type { ActivityRecord, Installation, ReportingPeriod } from "../cbam/types";
import type { RejectedRow, SkippedRow } from "../ingest/materialise";
import type { DatasetMapping } from "../ingest/schema";

/**
 * A workspace is one installation's declaration for one reporting period: its
 * configuration, the datasets uploaded for it and every operator decision made
 * on them. Stored as one JSON document; nothing derived is stored, so a figure
 * on screen can never be stale relative to the data behind it.
 */

export interface StoredDataset {
  id: string;
  /** Source file in the files table; re-mapping reads it again. */
  fileId: string | null;
  fileName: string;
  sheetName?: string;
  sheets?: string[];
  headerRow: number;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
  mapping: DatasetMapping;
  aiOutcome: AiOutcome;
  /**
   * Only confirmed datasets feed the declaration. A new upload is a draft
   * until someone has looked at its mapping - a proposed mapping is a
   * proposal, whether a model or the heuristic produced it.
   */
  status: "draft" | "confirmed";
  confirmedAt?: string;
  confirmedBy?: string;
  activities: ActivityRecord[];
  rejected: RejectedRow[];
  skipped: SkippedRow[];
}

/**
 * Actual values a supplier communicated for one precursor, accepted by the
 * operator (typically through the supplier portal). Applied to precursor
 * records from that supplier that carry no values of their own.
 */
export interface SupplierData {
  id: string;
  supplierName: string;
  cnCode: string;
  seeDirect: number;
  seeIndirect: number;
  sefa?: number;
  verified: boolean;
  /** Supporting document: the supplier's communication or verification report. */
  evidenceFileId?: string;
  source: "supplier_portal" | "manual";
  requestId?: string;
  acceptedAt: string;
  acceptedBy: string;
}

export interface Exclusion {
  activityId: string;
  reason: string;
  at: string;
  by?: string;
}

export interface WorkspaceState {
  schemaVersion: 1;
  installation: Installation;
  period: ReportingPeriod;
  assumptions: {
    /** Price for quarters without a published Commission price. */
    etsPriceEur: number;
    inrPerEur: number;
  };
  datasets: StoredDataset[];
  exclusions: Exclusion[];
  /** Finding keys ("CP-007::title") the operator has reviewed and accepted. */
  acknowledged: string[];
  /** Why each finding was accepted, and by whom. */
  acknowledgementNotes?: Record<string, { note: string; by: string; at: string }>;
  supplierData: SupplierData[];
}

export interface Workspace {
  id: string;
  orgId: string;
  name: string;
  state: WorkspaceState;
  version: number;
  updatedAt: string;
}

/** Who did something, for the audit log. */
export interface Actor {
  id: string | null;
  label: string;
}
