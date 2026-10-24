import { tr } from "@/i18n/carrier-crm";
import { callRatewareApi } from "@/lib/api-client";
import type { Vendor } from "@/types/domain";

/**
 * Carrier CRM pipeline.
 *
 * Two orthogonal axes, and conflating them is the classic mistake:
 *  - `base_stage`   sourcing -> procurement -> archived
 *  - `funnel_stage` position inside procurement
 *  - `status`       the TMS flag (active/inactive/invited/blocked), which is NOT
 *                   a pipeline position: a carrier can be onboarded and still
 *                   `inactive`, and `inactive` never stops them being invited.
 *
 * Moves go through `bulk_update_vendors`, which is deliberately smart: sending
 * `base_stage: "procurement"` without a funnel stage makes the server keep the
 * current one (or default to `targeted`), and moving to sourcing/archived nulls
 * the funnel stage. We send the operator's intent and let the server own those
 * derivations rather than duplicating them here.
 */

/** Canonical order, taken from VENDOR_FUNNEL_STAGES in the edge function. */
export const FUNNEL_STAGES = [
  "targeted",
  "nested",
  "drafted",
  "invited",
  "onboarded",
  "trained",
  "activated",
  "completed",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export type BaseStage = "sourcing" | "procurement" | "archived";

export interface FunnelStageInfo {
  key: FunnelStage;
  label: string;
  description?: string;
  order: number;
  count: number;
}

export interface VendorFunnel {
  stages: FunnelStageInfo[];
  rows: (Vendor & {
    funnel_stage?: string;
    effective_funnel_stage?: string;
    funnel_stage_label?: string;
    stage_days?: number;
  })[];
  summary?: Record<string, unknown>;
  warnings?: string[];
}

/**
 * Whole-organization procurement funnel: labels, descriptions and counts in one
 * call. Note `effective_funnel_stage` can differ from the stored
 * `funnel_stage` — a carrier with linked quotes is shown at `nested` even if
 * the saved stage is earlier. Display the effective one; move the stored one.
 */
export async function fetchVendorFunnel(): Promise<VendorFunnel> {
  const res = await callRatewareApi<VendorFunnel>("vendor_funnel");
  return { stages: res.stages ?? [], rows: res.rows ?? [], summary: res.summary, warnings: res.warnings };
}

export interface ListVendorsQuery extends Record<string, unknown> {
  base_stage?: BaseStage;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listVendors(query: ListVendorsQuery = {}) {
  const res = await callRatewareApi<{ rows?: Vendor[]; total?: number }>("list_vendors", {
    lightweight: true,
    limit: 250,
    ...query,
  });
  return { rows: res.rows ?? [], total: res.total ?? res.rows?.length ?? 0 };
}

/** Every carrier in the workspace, a thousand per call (the lightweight maximum). */
export async function listAllVendors(): Promise<{ rows: Vendor[]; total: number }> {
  const rows: Vendor[] = [];
  let total = 0;
  for (let page = 0; page < 20; page++) {
    const res = await listVendors({ limit: 1000, offset: rows.length });
    total = res.total;
    rows.push(...res.rows);
    if (!res.rows.length || rows.length >= total) break;
  }
  return { rows, total };
}

/** Bid Room participation per carrier: one row per lane it was put on. */
export interface BidMetrics {
  shortlisted?: number;
  invited?: number;
  viewed?: number;
  quoted?: number;
  awarded?: number;
  last_activity_at?: string | null;
}

export type VendorCard = Vendor & {
  legal_name?: string | null;
  contact_name?: string | null;
  funnel_stage?: string | null;
  bid_metrics?: BidMetrics;
  rate_metrics?: { linked_rates?: number; approved_rates?: number };
};

/**
 * Carriers by id with the full row (secondary emails, WhatsApp) and their Bid
 * Room participation, which the lightweight list leaves out. Only reads.
 */
export async function fetchVendorsByIds(ids: string[]): Promise<VendorCard[]> {
  if (!ids.length) return [];
  const res = await callRatewareApi<{ rows?: VendorCard[] }>("list_vendors", {
    ids,
    limit: Math.min(ids.length, 250),
  });
  return res.rows ?? [];
}

export interface VendorPatch extends Record<string, unknown> {
  base_stage?: BaseStage;
  funnel_stage?: FunnelStage;
  status?: "active" | "inactive" | "invited" | "blocked";
  add_tags?: string[];
}

/**
 * The backend demands an explicit confirmation for 100+ carriers or for any
 * archive, and refuses the call without it. We mirror that threshold here so
 * the operator is asked by the UI rather than surprised by an error.
 */
export function needsConfirmation(ids: string[], patch: VendorPatch): boolean {
  return ids.length >= 100 || patch.base_stage === "archived";
}

export async function moveVendors(ids: string[], patch: VendorPatch) {
  const confirmation = needsConfirmation(ids, patch)
    ? { confirmed: true, confirmation_action: "bulk_update_vendors" }
    : {};
  return await callRatewareApi<{ updated: number; rows: Vendor[] }>("bulk_update_vendors", {
    ids,
    patch,
    ...confirmation,
  });
}

export const STAGE_LABEL: Record<string, string> = {
  get sourcing() { return tr("text232"); },
  get archived() { return tr("text108"); },
  get targeted() { return tr("text233"); },
  get nested() { return tr("text234"); },
  get drafted() { return tr("text235"); },
  get invited() { return tr("text236"); },
  get onboarded() { return tr("text237"); },
  get trained() { return tr("text238"); },
  get activated() { return tr("text239"); },
  get completed() { return tr("text240"); },
};

/**
 * What each stage means, in the team's words. rateware sends its own
 * descriptions with the funnel, in English.
 */
export const STAGE_HINT: Record<string, string> = {
  get sourcing() { return tr("text109"); },
  get targeted() { return tr("text110"); },
  get nested() { return tr("text111"); },
  get drafted() { return tr("text112"); },
  get invited() { return tr("text113"); },
  get onboarded() { return tr("text114"); },
  get trained() { return tr("text115"); },
  get activated() { return tr("text116"); },
  get completed() { return tr("text117"); },
  get archived() { return tr("text118"); },
};

/** The TMS flag in the team's words, for sentences ("activo · tst-usa.com"). */
export const STATUS_WORD: Record<string, string> = {
  get active() { return tr("text119"); },
  get inactive() { return tr("text120"); },
  get invited() { return tr("text121"); },
  get blocked() { return tr("text122"); },
};

export function vendorLabel(v: Vendor): string {
  return (v.vendor_name as string) || (v.legal_name as string) || (v.name as string) || v.id;
}

export type NewVendorInput = {
  vendor_name: string;
  legal_name?: string;
  domain?: string;
  contact_name?: string;
  primary_email?: string;
  whatsapp_phone?: string;
  preferred_channel?: string;
  base_stage: "sourcing" | "procurement";
  notes?: string;
};

/**
 * One carrier, typed by hand. The backend's natural-key index answers 409 when
 * the same razón social already exists; that message names the existing record.
 */
export async function createVendor(input: NewVendorInput) {
  const vendor = Object.fromEntries(
    Object.entries(input).filter(([, v]) => typeof v !== "string" || v.trim() !== ""),
  );
  // `status` mirrors TMS activation. A carrier typed here has not been
  // activated in the TMS yet; the backend would default it to "active".
  // Inactive carriers are still eligible to bid once invited.
  return await callRatewareApi<{ row: Vendor }>("create_vendor", {
    vendor: { ...vendor, status: "inactive" },
  });
}
