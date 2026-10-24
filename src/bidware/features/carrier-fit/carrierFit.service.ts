import { words, tr } from "@/i18n/carrier-fit";
import { callRatewareApi } from "@/lib/api-client";
import type { Vendor } from "@/types/domain";

/**
 * Carrier Fit: turn a carrier list template into RFx participants.
 *
 * The write is `shortlist_rfx_lane_vendors` carrying a `carrier_template_context`.
 * That context is what switches the backend from the plain shortlist path to the
 * journaled template materialisation, which is:
 *  - idempotent, keyed by a client-generated `materialization_operation_id`;
 *  - version-checked against the template;
 *  - restricted to carriers that belong to the template;
 *  - restricted to lanes of a single RFx event.
 *
 * Rows land as `invitation_status: "drafted"`. Nothing is sent here — invitations
 * still require the explicit authorisation step on the event.
 */

export interface MaterializationCounts {
  selected: number;
  confirmed: number;
  inserted: number;
  already_present: number;
  rejected: number;
  pending: number;
}

export interface MaterializationOutcome {
  lane_id: string;
  vendor_id: string;
  outcome: string;
  reason?: string;
}

export interface MaterializationResult {
  result?: string;
  counts?: MaterializationCounts;
  outcomes?: MaterializationOutcome[];
  confirmed_audience_vendor_ids?: string[];
  materialization_operation_id?: string;
  template_id?: string;
  template_version?: number;
  rfx_event_id?: string;
  lane_ids?: string[];
}

/** Hydrates template members. `lightweight` returns exactly the eligibility fields. */
export async function listVendorsByIds(ids: string[]): Promise<Vendor[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const vendors = new Map<string, Vendor>();
  for (let offset = 0; offset < unique.length; offset += 1000) {
    const batch = unique.slice(offset, offset + 1000);
    const requested = new Set(batch);
    const res = await callRatewareApi<{ rows?: Vendor[] }>("list_vendors", {
      ids: batch,
      lightweight: true,
      limit: batch.length,
    });
    for (const vendor of res.rows ?? []) {
      if (!requested.has(vendor.id) || vendors.has(vendor.id)) throw new Error(words("invalidMembers"));
      vendors.set(vendor.id, vendor);
    }
  }
  // Missing members remain represented by their IDs in the template/editor.
  // A failed batch throws; an incomplete selection is never presented as ready.
  return unique.flatMap((id) => vendors.has(id) ? [vendors.get(id)!] : []);
}

export async function materializeTemplate(input: {
  laneIds: string[];
  vendorIds: string[];
  templateId: string;
  templateVersion: number;
  operationId: string;
}): Promise<MaterializationResult> {
  return await callRatewareApi<MaterializationResult>("shortlist_rfx_lane_vendors", {
    lane_ids: input.laneIds,
    vendor_ids: input.vendorIds,
    carrier_template_context: {
      template_id: input.templateId,
      template_version: input.templateVersion,
      materialization_operation_id: input.operationId,
    },
  });
}

export {
  previewEligibility,
  detectDuplicates,
  defaultSelection,
  type Eligibility,
  sharedContactGroups,
  type DuplicateInfo,
} from "./carrierFit.rules";

/**
 * The idempotency key. It must survive retries: sending the SAME uuid again
 * re-reads the journal instead of duplicating work, which is precisely what
 * makes a failed/timed-out materialisation safe to repeat.
 */
export function newOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const REASON_LABEL: Record<string, string> = {
  get unavailable(){return words("word1");},
  get missing_contact(){return words("word2");},
  get base_stage_archived(){return words("word3");},
  get status_blocked(){return words("word4");},
  get status_inactive(){return words("word5");},
  get status_archived(){return words("word6");},
  get status_deleted(){return words("word7");},
};

export function reasonLabel(reason?: string): string {
  if (!reason) return "—";
  if (reason === "DUPLICADO") return tr("text001");
  return REASON_LABEL[reason] || reason;
}
