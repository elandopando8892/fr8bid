import type { ConfirmationRow } from "./confirmations.service";

const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function offerRevisions(rows: unknown, invitationId: unknown) {
  if (typeof invitationId !== "string" || !invitationId || !Array.isArray(rows)) return [];
  return rows.map(record).flatMap(row => {
    const meta = record(row.metadata), before = record(meta.before), after = record(meta.after);
    if (meta.rfx_lane_vendor_id !== invitationId || !("bid_rate" in after)) return [];
    return [{ row, meta, before, after }];
  }).sort((a,b) => (Date.parse(String(b.row.occurred_at)) || 0) - (Date.parse(String(a.row.occurred_at)) || 0));
}

export function currentOfferFinal(rows: unknown, offer: Record<string, unknown>): boolean | undefined {
  if (typeof offer.best_final === "boolean") return offer.best_final;
  const latest = offerRevisions(rows, offer.id)[0];
  if (!latest) return undefined;
  const stamp = Date.parse(String(offer.responded_at));
  const amount = (v: unknown) => (typeof v === "number" || typeof v === "string") && String(v).trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  return Number.isFinite(stamp) && stamp === Date.parse(String(latest.after.responded_at)) &&
    amount(offer.bid_rate) !== null && amount(offer.bid_rate) === amount(latest.after.bid_rate) &&
    typeof offer.currency === "string" && !!offer.currency.trim() && offer.currency === latest.after.currency &&
    typeof latest.meta.best_final === "boolean" ? latest.meta.best_final : undefined;
}

export const offerFields = ["bid_rate", "currency", "weekly_capacity", "transit_days", "valid_through", "commercial_model",
  "marksman_margin_pct", "carrier_share_pct", "notes", "equipment_available", "current_unit_location",
  "deadhead_distance", "deadhead_unit", "unit_details", "eta_pickup", "eta_delivery", "mirror_account_enabled",
  "best_alternative_offered", "alternative_equipment", "alternative_units", "alternative_notes",
  "response_source", "bid_source_note"] as const;
export type OfferField = typeof offerFields[number];
type Label = OfferField | "missing" | "hidden" | "yes" | "no" | "cost_plus" | "sell_share" | "brokerage" | "fee_plus" | "manual_operator" | "carrier_portal";
const identifyingFields = new Set<OfferField>(["notes", "current_unit_location", "unit_details", "alternative_equipment", "alternative_notes", "bid_source_note"]);

export function formatOfferValue(offer: Record<string, unknown>, key: OfferField, label: (key: Label) => string, anonymous = false): string {
  const v = offer[key];
  if (v === null || v === undefined || v === "") return label("missing");
  if (anonymous && identifyingFields.has(key)) return label("hidden");
  if (typeof v === "boolean") return label(v ? "yes" : "no");
  if (key === "commercial_model") {
    if (["cost_plus", "sell_share", "brokerage", "fee_plus"].includes(String(v))) return label(String(v) as "cost_plus");
    if (anonymous) return label("hidden");
  }
  if (key === "response_source") {
    if (["manual_operator", "carrier_portal"].includes(String(v))) return label(String(v) as "manual_operator");
    if (anonymous) return label("hidden");
  }
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export function latestOfferResponses(rows: ConfirmationRow[], offer: Record<string, unknown>, segmentKey: string): Map<string, ConfirmationRow> {
  const own = offer.id ? rows.filter(row => row.rfx_lane_vendor_id === offer.id) : [];
  const source = own.length ? own : offer.vendor_id ? rows.filter(row => row.vendor_id === offer.vendor_id && row.segment_key === segmentKey) : [];
  const latest = new Map<string, ConfirmationRow>();
  for (const row of [...source].sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0))) {
    if (!latest.has(row.rubric_key)) latest.set(row.rubric_key, row);
  }
  return latest;
}

export function comparisonOffers(lane: { invitations?: Record<string, unknown>[] }): Record<string, unknown>[] {
  return (lane.invitations ?? []).filter(offer => offer.bid_rate != null && String(offer.bid_rate).trim() !== "" && Number.isFinite(Number(offer.bid_rate)) && Number(offer.bid_rate) > 0);
}

export function offerValidity(offer: Record<string, unknown>, evaluatedAt: number): "valid" | "expired" | "invalid" | "unknown" {
  const value = String(offer.valid_through ?? "").trim();
  if (!value) return "unknown";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  const start = Date.parse(`${value}T00:00:00-06:00`);
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== value) return "invalid";
  return Date.parse(`${value}T23:59:59.999-06:00`) < evaluatedAt ? "expired" : "valid";
}
