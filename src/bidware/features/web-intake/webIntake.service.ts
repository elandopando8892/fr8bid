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
  /** Campaign keys the site captured (utm_*, click ids, landing_path); empty when none. */
  attribution?: Record<string, unknown> | null;
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
  config: string;
  service: string;
  packaging: string;
  hazmat: string;
  notes: string;
}

const field = (lead: Record<string, unknown>, key: string) => {
  const value = lead[key];
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
};

/** A whole positive number of loads, or empty for the operator to complete. */
const loads = (value: string) => (/^\d+(\.\d+)?$/.test(value) && Number(value) > 0 ? value : "");

/** Border answers that are not a crossing point (the group site's RFI offers them). */
const NOT_A_CROSSING = new Set(["no crossing", "not sure"]);

/**
 * The lane the operator starts from: what the visitor wrote, nothing invented.
 * The group site's detailed RFI sends the RFI template's values, so equipment,
 * service and packaging arrive ready; what has no lane column goes to notes.
 */
export function laneFromLead(lead: Record<string, unknown>): WebLane {
  const weight = field(lead, "weight_lbs").replace(/[,\s]/g, "");
  const border = field(lead, "border");
  const notes = ([
    ["noteNeed", field(lead, "operation")],
    ["noteOriginFacility", field(lead, "origin_facility")],
    ["noteDestinationFacility", field(lead, "destination_facility")],
    ["noteBorder", border.toLowerCase() === "not sure" ? border : ""],
    ["noteSchedule", field(lead, "schedule")],
    ["noteSeasonality", field(lead, "seasonality")],
    ["noteLeadTime", field(lead, "lead_time")],
  ] as const).filter(([, value]) => value).map(([label, value]) => `${tr(label)}: ${value}`).join("\n");
  return {
    origin_text: [field(lead, "origin_city"), field(lead, "origin_postal_code")].filter(Boolean).join(" "),
    destination_text: [field(lead, "destination_city"), field(lead, "destination_postal_code")].filter(Boolean).join(" "),
    truck_type: field(lead, "truck_type"),
    weekly_volume: loads(field(lead, "loads_per_week")),
    average_weight: /^\d+(\.\d+)?$/.test(weight) ? weight : "",
    trailer_requirements: field(lead, "trailer_type"),
    border_crossing: NOT_A_CROSSING.has(border.toLowerCase()) ? "" : border,
    product: field(lead, "product"),
    target_rate: field(lead, "target_rate"),
    config: field(lead, "configuration"),
    service: field(lead, "service_type"),
    packaging: field(lead, "packaging"),
    hazmat: field(lead, "hazmat"),
    notes,
  };
}

/** Most lanes one website request can carry (rateware#214): the lead's own plus nine in lead.lanes. */
export const MAX_WEB_LANES = 10;

/**
 * Every lane of a website request, in the visitor's order: the first from the
 * lead's own fields (with its notes), the rest from lead.lanes, which use the
 * same field names. Entries that are not objects are ignored.
 */
export function lanesFromLead(lead: Record<string, unknown>): WebLane[] {
  const extra = Array.isArray(lead.lanes) ? lead.lanes : [];
  const more = extra.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => laneFromLead(entry));
  return [laneFromLead(lead), ...more].slice(0, MAX_WEB_LANES);
}

/** How many lanes a stored lead brings, for the tray's list. */
export function laneCount(lead: Record<string, unknown>): number {
  return lanesFromLead(lead).length;
}

/** Where a lead came from, as the site captured it: campaign, else landing page. */
export function leadSource(row: Pick<WebIntake, "attribution">): string {
  const a = row.attribution && typeof row.attribution === "object" ? row.attribution : {};
  const value = (key: string) => (typeof a[key] === "string" ? String(a[key]).trim() : "");
  const campaign = [value("utm_source"), value("utm_medium"), value("utm_campaign")].filter(Boolean).join(" / ");
  if (campaign) return campaign;
  if (value("gclid") || value("gbraid") || value("wbraid")) return "Google Ads";
  if (value("msclkid")) return "Microsoft Ads";
  return value("landing_path");
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

/** What blocks promoting the chosen lanes; with several, each item names its lane. */
export function missingForLanes(lanes: WebLane[], shipperId: string | null): string[] {
  if (!lanes.length) return [tr("noLaneChosen")];
  const shipper = shipperId ? [] : [tr("shipper")];
  if (lanes.length === 1) return [...shipper, ...missingForPromotion(lanes[0], "x")];
  return [...shipper, ...lanes.flatMap((lane, i) => missingForPromotion(lane, "x").map((item) => `${tr("laneN", String(i + 1))}: ${item}`))];
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

export async function promoteWebLead(intakeId: string, shipperId: string, lanes: WebLane | WebLane[], currency: "USD" | "MXN") {
  const list = Array.isArray(lanes) ? lanes : [lanes];
  if (!list.length || list.length > MAX_WEB_LANES) throw new Error(tr("errLane"));
  const clean = list.map((lane) => Object.fromEntries(Object.entries(lane).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)));
  // One lane keeps the original request shape, so it works with any quotedesk-api;
  // several go as `lanes`, which an older quotedesk-api refuses before writing anything.
  return callQuotedeskApi<{ project_id: string; replayed: boolean }>("promote_web_lead", {
    intake_id: intakeId, shipper_id: shipperId, ...(clean.length === 1 ? { lane: clean[0] } : { lanes: clean }), currency,
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
