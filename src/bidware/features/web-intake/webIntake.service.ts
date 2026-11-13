import { callQuotedeskApi } from "@/lib/api-client";
import { tr } from "@/i18n/web-intake";

/**
 * The website tray (quotedesk-api, rateware#210): shipper leads and carrier
 * rate sheets from heymarksman.com, xbfreight.com and the group site wait here
 * until a person decides. Promoting a lead opens a submitted Spot request that
 * the intake list above turns into a QuoteDesk quote as usual; registering a
 * rate sheet adds it to the carrier's uploads for interpretation and approval.
 * Every decision is final and is never retried automatically.
 */
export type WebIntakeKind = "lead" | "rate_sheet";
export type WebDecision = "promoted" | "registered" | "dismissed";

export interface WebIntakeReview {
  decision: WebDecision;
  actor_email: string | null;
  project_id: string | null;
  raw_upload_id: string | null;
  note: string | null;
  created_at: string;
}

export interface WebIntake {
  id: string;
  created_at: string;
  source_site: "marksman" | "xbf" | "holding" | string;
  kind: WebIntakeKind;
  lead: Record<string, unknown>;
  review: WebIntakeReview | null;
}

export interface WebLane {
  origin_text: string;
  destination_text: string;
  truck_type: string;
  weekly_volume: string;
  average_weight: string;
  trailer_requirements: string;
  border_crossing: string;
  product: string;
  target_rate: string;
}

const field = (lead: Record<string, unknown>, key: string) => {
  const value = lead[key];
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
};

/** A whole positive number of loads, or empty for the operator to complete. */
const loads = (value: string) => (/^\d+(\.\d+)?$/.test(value) && Number(value) > 0 ? value : "");

/** The lane the operator starts from: what the visitor wrote, nothing invented. */
export function laneFromLead(lead: Record<string, unknown>): WebLane {
  const weight = field(lead, "weight_lbs").replace(/[,\s]/g, "");
  return {
    origin_text: [field(lead, "origin_city"), field(lead, "origin_postal_code")].filter(Boolean).join(" "),
    destination_text: [field(lead, "destination_city"), field(lead, "destination_postal_code")].filter(Boolean).join(" "),
    truck_type: field(lead, "truck_type"),
    weekly_volume: loads(field(lead, "loads_per_week")),
    average_weight: /^\d+(\.\d+)?$/.test(weight) ? weight : "",
    trailer_requirements: field(lead, "trailer_type"),
    border_crossing: field(lead, "border"),
    product: field(lead, "product"),
    target_rate: field(lead, "target_rate"),
  };
}

/** What still blocks a promotion, in the order the form shows it. */
export function missingForPromotion(lane: WebLane, shipperId: string | null): string[] {
  const missing: string[] = [];
  if (!shipperId) missing.push(tr("shipper"));
  if (!lane.origin_text.trim()) missing.push(tr("origin"));
  if (!lane.destination_text.trim()) missing.push(tr("destination"));
  if (!lane.truck_type.trim()) missing.push(tr("truckType"));
  if (!loads(lane.weekly_volume.trim())) missing.push(tr("loadsPerWeek"));
  if (lane.average_weight.trim() && !/^\d+(\.\d+)?$/.test(lane.average_weight.trim())) missing.push(tr("weight"));
  return missing;
}

/** Server refusals in the team's words; anything else stays generic. */
export function decisionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/web_intake_already_reviewed/.test(message)) return tr("errDecided");
  if (/web_intake_is_rate_sheet|web_intake_not_rate_sheet/.test(message)) return tr("errKind");
  if (/web_lead_shipper_required|web_rate_sheet_vendor_required/.test(message)) return tr("errRecord");
  if (/web_rate_sheet_xlsx_only|web_rate_sheet_file_invalid|web_rate_sheet_not_xlsx/.test(message)) return tr("errXlsx");
  if (/web_lead_(lane_incomplete|weight_invalid|country_invalid|currency_invalid)/.test(message)) return tr("errLane");
  if (/web_intake_forbidden|web_intake_actor_required|web_intake_identity_required/.test(message)) return tr("errForbidden");
  return tr("errUnavailable");
}

/** The tray is for the commercial workspace only; elsewhere it stays hidden. */
export class WebIntakeHidden extends Error {}

export async function listWebIntake(): Promise<WebIntake[]> {
  try {
    const res = await callQuotedeskApi<{ rows?: WebIntake[] }>("list_web_intake", { limit: 100 });
    return res.rows ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/web_intake_forbidden|Unknown QuoteDesk action/.test(message)) throw new WebIntakeHidden(message);
    throw new Error(tr("errUnavailable"));
  }
}

export async function promoteWebLead(intakeId: string, shipperId: string, lane: WebLane, currency: "USD" | "MXN") {
  const clean = Object.fromEntries(Object.entries(lane).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  return callQuotedeskApi<{ project_id: string; replayed: boolean }>("promote_web_lead", {
    intake_id: intakeId, shipper_id: shipperId, lane: clean, currency,
  });
}

export async function registerWebRateSheet(intakeId: string, vendorId: string) {
  return callQuotedeskApi<{ raw_upload_id: string; replayed: boolean }>("register_web_rate_sheet", {
    intake_id: intakeId, vendor_id: vendorId,
  });
}

export async function dismissWebIntake(intakeId: string, note: string) {
  return callQuotedeskApi<{ replayed: boolean }>("dismiss_web_intake", { intake_id: intakeId, note: note.trim() || undefined });
}

export async function webRateSheetUrl(intakeId: string) {
  return callQuotedeskApi<{ url: string; file_name: string }>("web_rate_sheet_url", { intake_id: intakeId });
}
