import { callRfxBidApi, ApiError } from "@/lib/api-client";

/**
 * Carrier private Bid Room, over the token-based `rfx-bid-api`. The invitation
 * token IS the credential — there is no login.
 *
 * The contract detail that shapes this whole screen: **one invitation covers
 * one lane, and every lane in the carrier's book carries its OWN
 * `invitation_token`.** The token in the URL only opens the door; to price lane
 * N you must submit against that lane's token. Submitting everything against
 * the URL token would quietly re-price the same lane over and over.
 */

export type PrivateWorkspace = "master" | "bids" | "award" | "chat";

/** The event as the book projects it (rfx-bid-api publicEvent). */
export interface BookEvent {
  id?: string;
  rfx_id?: string;
  name?: string;
  event_type?: string;
  status?: string;
  due_date?: string | null;
  /** When the operation is expected to start (arranque estimado). */
  operation_start_date?: string | null;
  bid_visibility_mode?: string;
  rfx_master_package?: { segments?: Record<string, unknown>[] } & Record<string, unknown>;
}

/** rfx-bid-api dueState: the deadline is the due date at 23:59:59 Mexico City. */
export interface DueState {
  due_date?: string | null;
  days_remaining?: number | null;
  status?: "open" | "closing" | "closed" | "no_deadline" | "unknown";
}

export interface BookLane {
  rfx_lane_id: string;
  rfx_event_id?: string;
  invitation_id?: string;
  /** The token to submit THIS lane with. */
  invitation_token?: string;
  participation_status?: string;
  /** quoted | invited | declined | withdrawn | awarded | backup | not_awarded */
  business_status?: string;
  bid_rate?: number | null;
  currency?: string;
  lane_number?: number | string | null;
  origin?: string;
  destination?: string;
  equipment?: string;
  weekly_volume?: number | string | null;
  due_state?: DueState;
  event?: BookEvent;
  [key: string]: unknown;
}

export interface InvitationResponse {
  invitation?: Record<string, unknown>;
  live_board?: Record<string, unknown>;
  carrier_book?: {
    invited?: BookLane[];
    /** Open lanes of this RFx owner the carrier was not invited to. */
    open_not_invited?: BookLane[];
    carrier?: { vendor_name?: string };
    [k: string]: unknown;
  };
  bid_history?: Record<string, unknown>[];
  segment_confirmations?: Record<string, unknown>[];
  [key: string]: unknown;
}

/**
 * `carrier_book` rows carry the lane itself under `lane` (origin, equipment,
 * the six rubro texts, the segment) and the event under `event`. Everything in
 * the Bid Room reads the lane's fields flat, so they are lifted here; the row's
 * own values (currency, status, token, notes) win over the lane's.
 */
function flattenBookRow<T extends Record<string, unknown>>(row: T): T {
  const lane = (row.lane ?? {}) as Record<string, unknown>;
  const { id: laneId, ...laneFields } = lane;
  return { ...laneFields, rfx_lane_id: laneId, ...row };
}

/**
 * The backend returns the book ordered by last update, so a lane jumps to the
 * top every time it is quoted. Carriers read it against the route table in
 * the invitation email, which follows the event's lane numbers. Events keep
 * the order in which they first appear.
 */
function byLaneNumber<T extends Record<string, unknown>>(rows: T[]): T[] {
  const eventOrder = new Map<string, number>();
  rows.forEach((r) => {
    const key = String(r.rfx_event_id ?? "");
    if (!eventOrder.has(key)) eventOrder.set(key, eventOrder.size);
  });
  const num = (r: T) => {
    const n = Number(r.lane_number);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  return [...rows].sort(
    (a, b) =>
      eventOrder.get(String(a.rfx_event_id ?? ""))! - eventOrder.get(String(b.rfx_event_id ?? ""))! ||
      num(a) - num(b),
  );
}

export async function getInvitation(token: string) {
  const res = await callRfxBidApi<InvitationResponse>("get_invitation", { token });
  const book = res.carrier_book;
  if (book) {
    book.invited = byLaneNumber((book.invited ?? []).map(flattenBookRow));
    book.open_not_invited = (book.open_not_invited ?? []).map(flattenBookRow);
  }
  return res;
}

/**
 * The link's own event. The book spans every event of this RFx owner that
 * invited the carrier, past ones included; rateware's portal shows only the
 * link's event (currentEventBookRows), and so does this one.
 */
export function eventLanes(book: InvitationResponse["carrier_book"], eventId: string): BookLane[] {
  return (book?.invited ?? []).filter((l) => String(l.rfx_event_id ?? "") === eventId);
}

/** The carrier's other events that can still be quoted, each opened with one of its own lane tokens. */
export function otherOpenEvents(book: InvitationResponse["carrier_book"], eventId: string) {
  const groups = new Map<string, { event: BookEvent; lanes: BookLane[] }>();
  for (const lane of book?.invited ?? []) {
    const id = String(lane.rfx_event_id ?? "");
    if (!id || id === eventId || !lane.invitation_token || windowClosed(lane)) continue;
    const group = groups.get(id) ?? { event: lane.event ?? {}, lanes: [] };
    group.lanes.push(lane);
    groups.set(id, group);
  }
  return [...groups.values()];
}

/**
 * The event's deadline. Every lane row carries the server's own reading
 * (dueState); without lanes it is worked out the same way: the due date at
 * 23:59:59 Mexico City.
 */
export function dueOf(lanes: BookLane[], dueDate?: string | null): DueState {
  const fromServer = lanes.find((l) => l.due_state?.status)?.due_state;
  if (fromServer) return fromServer;
  if (!dueDate) return { due_date: null, days_remaining: null, status: "no_deadline" };
  const at = new Date(`${String(dueDate).slice(0, 10)}T23:59:59-06:00`);
  if (Number.isNaN(at.getTime())) return { due_date: dueDate, days_remaining: null, status: "unknown" };
  const ms = at.getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  return { due_date: dueDate, days_remaining: days, status: ms < 0 ? "closed" : days <= 1 ? "closing" : "open" };
}

/** The bid window, as the server enforces it on submit (bidSubmissionBlockReason). */
export function windowClosed(lane: BookLane): boolean {
  const status = String(lane.event?.status ?? "").toLowerCase();
  return ["closed", "awarded", "archived"].includes(status) || lane.due_state?.status === "closed";
}

export type LaneState =
  | "awarded"
  | "backup"
  | "not_awarded"
  | "declined"
  | "withdrawn"
  | "quoted"
  | "closed"
  | "pending";

/** One status per lane, in the order the server decides it (businessBookStatus). */
export function laneState(lane: BookLane): LaneState {
  const status = String(lane.business_status ?? "").toLowerCase();
  if (status === "awarded" || status === "backup" || status === "not_awarded") return status;
  if (status === "declined" || status === "withdrawn") return status;
  if (status === "quoted" || lane.bid_rate != null) return "quoted";
  return windowClosed(lane) ? "closed" : "pending";
}

/** A lane can be priced while its window is open and it was not awarded. */
export function canQuote(lane: BookLane): boolean {
  const state = laneState(lane);
  return Boolean(lane.invitation_token) && !windowClosed(lane) && !["awarded", "backup", "not_awarded"].includes(state);
}

/**
 * Commercial models, keyed as the portal sends them. "direct_cost_plus", not
 * "cost_plus": the server keeps a legacy fee_plus offer as fee_plus only for
 * the direct_* spellings, so re-sending "cost_plus" would silently re-model
 * it. Percent bounds and blank defaults are the server's own (submit_bid);
 * outside the range the offer is rejected.
 */
export const COMMERCIAL_MODELS = [
  {
    key: "direct_cost_plus",
    label: "Costo + margen",
    pctField: "marksman_margin_pct",
    pctLabel: "Margen sugerido",
    min: 2,
    max: 5,
    blank: 3,
    enter: "Capturas tu costo directo como carrier.",
    effect: "El tablero suma el margen sugerido; la comisión se calcula cuando paga el cliente.",
  },
  {
    key: "carrier_share",
    label: "Carrier comparte facturación",
    pctField: "carrier_share_pct",
    pctLabel: "Share de facturación",
    min: 2,
    max: 5,
    blank: 3,
    enter: "Capturas el all-in que quieres conservar.",
    effect: "Tu tarifa no cambia; el porcentaje se cobra como comisión después del pago del cliente.",
  },
  {
    key: "xbf_buy_sell",
    label: "XBF compra-venta",
    pctField: "marksman_margin_pct",
    pctLabel: "Margen XBF sugerido",
    min: 7.5,
    max: 15,
    blank: 12,
    enter: "Capturas tu tarifa de venta a XBF.",
    effect: "El precio del tablero suma el margen XBF sugerido.",
  },
] as const;

export type ModelKey = (typeof COMMERCIAL_MODELS)[number]["key"];

/** A stored model (cost_plus, fee_plus, sell_share, brokerage…) as one of the three above. */
export function modelKeyOf(stored: unknown): ModelKey {
  const text = String(stored ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (["sell_share", "carrier_share", "shared_margin", "share"].includes(text)) return "carrier_share";
  if (["brokerage", "xbf_buy_sell", "xbf", "buy_sell"].includes(text)) return "xbf_buy_sell";
  return "direct_cost_plus";
}

export function modelSpec(key: ModelKey) {
  return COMMERCIAL_MODELS.find((m) => m.key === key) ?? COMMERCIAL_MODELS[0];
}

/** Everything `submit_bid` writes. */
export interface BidInput {
  bid_rate: number;
  currency: string;
  weekly_capacity: number | null;
  transit_days: number | null;
  valid_through: string | null;
  commercial_model: ModelKey;
  marksman_margin_pct?: number | null;
  carrier_share_pct?: number | null;
  notes: string;
  equipment_available: boolean | null;
  current_unit_location: string;
  deadhead_distance: number | null;
  deadhead_unit: "mi" | "km";
  unit_details: string;
  eta_pickup: string | null;
  eta_delivery: string | null;
  mirror_account_enabled: boolean;
  availability_validation_status: string;
  availability_validation_notes: string;
  best_alternative_offered: boolean;
  alternative_equipment: string;
  alternative_units: number | null;
  alternative_notes: string;
  /** Marks the quote as final; the backend records it as `best_final`. */
  best_final: boolean;
}

/**
 * The quote form. `submit_bid` REPLACES the whole offer — a field left out is
 * cleared, not kept — so a revision starts from the lane's current values and
 * sends every one of them back, including the ones this form keeps folded.
 */
export interface OfferForm {
  bid_rate: string;
  currency: string;
  weekly_capacity: string;
  transit_days: string;
  valid_through: string;
  commercial_model: ModelKey;
  pct: string;
  notes: string;
  equipment_available: "" | "yes" | "no";
  current_unit_location: string;
  deadhead_distance: string;
  deadhead_unit: "mi" | "km";
  unit_details: string;
  eta_pickup: string;
  eta_delivery: string;
  mirror_account_enabled: boolean;
  best_alternative_offered: boolean;
  alternative_equipment: string;
  alternative_units: string;
  alternative_notes: string;
  best_final: boolean;
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** An ISO instant as a datetime-local value, in the carrier's own clock. */
function toLocalInput(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function offerForm(lane: BookLane): OfferForm {
  const model = modelKeyOf(lane.commercial_model);
  const pct = model === "carrier_share" ? lane.carrier_share_pct : lane.marksman_margin_pct;
  const available = lane.equipment_available;
  return {
    bid_rate: str(lane.bid_rate),
    currency: str(lane.currency) || "USD",
    weekly_capacity: str(lane.weekly_capacity),
    transit_days: str(lane.transit_days),
    valid_through: str(lane.valid_through).slice(0, 10),
    commercial_model: model,
    pct: str(pct),
    notes: str(lane.notes),
    equipment_available: available === true ? "yes" : available === false ? "no" : "",
    current_unit_location: str(lane.current_unit_location),
    deadhead_distance: str(lane.deadhead_distance),
    deadhead_unit: lane.deadhead_unit === "km" ? "km" : "mi",
    unit_details: str(lane.unit_details),
    eta_pickup: toLocalInput(lane.eta_pickup),
    eta_delivery: toLocalInput(lane.eta_delivery),
    mirror_account_enabled: lane.mirror_account_enabled === true,
    best_alternative_offered: lane.best_alternative_offered === true,
    alternative_equipment: str(lane.alternative_equipment),
    alternative_units: str(lane.alternative_units),
    alternative_notes: str(lane.alternative_notes),
    best_final: false,
  };
}

/** "17,200" and "17200.00" are the same number; blank is no number. */
export function parseAmount(value: string): number | null {
  const text = value.replace(/[,\s$]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

/** Commercial notice supplied by the owner; informational, not an invoicing scheduler. */
export function billingNotice(form: Pick<OfferForm, "commercial_model" | "pct">): string | null {
  if (form.commercial_model === "xbf_buy_sell") return null;
  const pct = parseAmount(form.pct) ?? modelSpec(form.commercial_model).blank;
  const amount = Number.isFinite(pct) ? ` (${pct} %)` : "";
  return `El porcentaje acordado${amount} se facturará 5 días hábiles después de la confirmación de pago del embarcador.`;
}

/** What stops the form from being sent, in the carrier's words. */
export function offerProblems(form: OfferForm): string[] {
  const problems: string[] = [];
  const rate = parseAmount(form.bid_rate);
  if (rate === null || Number.isNaN(rate) || rate <= 0) problems.push("Escribe tu tarifa all-in.");
  for (const [value, label] of [
    [form.weekly_capacity, "La capacidad"],
    [form.transit_days, "El tránsito"],
    [form.deadhead_distance, "El vacío"],
    [form.alternative_units, "Las unidades alternas"],
  ] as const) {
    const n = parseAmount(value);
    if (n !== null && (Number.isNaN(n) || n < 0)) problems.push(`${label} debe ser un número.`);
  }
  const spec = modelSpec(form.commercial_model);
  const pct = parseAmount(form.pct);
  if (pct !== null && (Number.isNaN(pct) || pct < spec.min || pct > spec.max)) {
    problems.push(`El porcentaje va de ${spec.min} a ${spec.max} %.`);
  }
  return problems;
}

/** Advisory completeness, separate from errors: missing context never blocks a bid. */
export function offerWarnings(form: OfferForm): string[] {
  const warnings: string[] = [];
  if (!form.weekly_capacity.trim()) warnings.push("Indica la capacidad semanal que puedes comprometer.");
  if (!form.transit_days.trim()) warnings.push("Indica los días de tránsito para comparar el servicio.");
  if (!form.valid_through) warnings.push("Indica la fecha de vigencia de tu oferta.");
  if (!form.equipment_available) warnings.push("Confirma la disponibilidad de equipo: sí o no.");
  if (form.equipment_available === "yes") {
    if (!form.current_unit_location.trim()) warnings.push("Indica la ubicación actual de la unidad.");
    if (!form.deadhead_distance.trim()) warnings.push("Indica la distancia de vacío al origen; puede ser cero.");
    if (!form.unit_details.trim()) warnings.push("Agrega el detalle de la unidad y el equipo ofrecido.");
    if (!form.eta_pickup) warnings.push("Indica la fecha y hora estimadas de recolección.");
    if (!form.eta_delivery) warnings.push("Indica la fecha y hora estimadas de entrega.");
  }
  if (form.best_alternative_offered) {
    if (!form.alternative_equipment.trim() && !form.alternative_units.trim()) warnings.push("Describe el equipo o las unidades de tu oferta alternativa.");
    if (!form.alternative_notes.trim()) warnings.push("Aclara las condiciones de la oferta alternativa.");
  }
  return warnings;
}

/**
 * Validation is MARKSMAN's call once it has one (validated, mirror enabled,
 * rejected); until then the carrier only asks for the GPS mirror or not.
 */
function validationStatus(current: unknown, mirror: boolean): string {
  const status = str(current).toLowerCase();
  if (["validated", "mirror_enabled", "rejected"].includes(status)) return status;
  return mirror ? "mirror_requested" : "not_requested";
}

export function offerPayload(form: OfferForm, lane: BookLane): BidInput {
  const spec = modelSpec(form.commercial_model);
  const pct = parseAmount(form.pct);
  const num = (v: string) => parseAmount(v);
  const instant = (v: string) => (v ? new Date(v).toISOString() : null);
  return {
    bid_rate: parseAmount(form.bid_rate) ?? 0,
    currency: form.currency,
    weekly_capacity: num(form.weekly_capacity),
    transit_days: num(form.transit_days),
    valid_through: form.valid_through || null,
    commercial_model: form.commercial_model,
    // Blank sends null and the server applies the model's default.
    marksman_margin_pct: spec.pctField === "marksman_margin_pct" ? pct : null,
    carrier_share_pct: spec.pctField === "carrier_share_pct" ? pct : null,
    notes: form.notes.trim(),
    equipment_available: form.equipment_available === "yes" ? true : form.equipment_available === "no" ? false : null,
    current_unit_location: form.current_unit_location.trim(),
    deadhead_distance: num(form.deadhead_distance),
    deadhead_unit: form.deadhead_unit,
    unit_details: form.unit_details.trim(),
    eta_pickup: instant(form.eta_pickup),
    eta_delivery: instant(form.eta_delivery),
    mirror_account_enabled: form.mirror_account_enabled,
    availability_validation_status: validationStatus(lane.availability_validation_status, form.mirror_account_enabled),
    // MARKSMAN's own notes on the validation; the form never shows them but must not erase them.
    availability_validation_notes: str(lane.availability_validation_notes),
    best_alternative_offered: form.best_alternative_offered,
    alternative_equipment: form.best_alternative_offered ? form.alternative_equipment.trim() : "",
    alternative_units: form.best_alternative_offered ? num(form.alternative_units) : null,
    alternative_notes: form.best_alternative_offered ? form.alternative_notes.trim() : "",
    best_final: form.best_final,
  };
}

/** Prices ONE lane. `laneToken` must be that lane's own invitation token. */
export async function submitBid(laneToken: string, bid: BidInput) {
  return await callRfxBidApi("submit_bid", { token: laneToken, language: "es", ...bid });
}

/** Withdraws this lane's quote. Identified by the lane's token, not a bid id. */
export async function withdrawBid(laneToken: string) {
  return await callRfxBidApi("withdraw_bid", { token: laneToken });
}

/** An explicit "no participo" is worth as much as a quote for planning. */
export async function declineInvitation(laneToken: string, reason = "") {
  return await callRfxBidApi("decline_invitation", { token: laneToken, reason });
}

export async function requestLaneAccess(token: string, laneId: string) {
  return await callRfxBidApi("request_lane_access", { token, lane_id: laneId });
}

/**
 * The six rubros the carrier confirms, per segment. These keys are the exact
 * `SEGMENT_CONFIRMATION_RUBRICS` the backend validates against, and they line
 * up one-to-one with the text columns on `rfx_lanes`.
 */
export const RUBRICS = [
  { key: "logistics_model", label: "Modelo Logístico" },
  { key: "operation_criteria", label: "Criterios de Operación" },
  { key: "business_rules", label: "Reglas de Negocio" },
  { key: "service_specifications", label: "Especificaciones de Servicio" },
  { key: "carrier_requirements", label: "Perfil de Transportista" },
  { key: "other_notes", label: "Otras Notas" },
] as const;

export type RubricKey = (typeof RUBRICS)[number]["key"];

/** The answers the backend accepts. Anything else is rejected outright. */
export const ANSWERS = [
  { key: "agree", label: "De acuerdo" },
  { key: "exception", label: "Con excepción" },
  { key: "disagree", label: "No puedo" },
  { key: "not_applicable", label: "No aplica" },
] as const;

export type AnswerKey = (typeof ANSWERS)[number]["key"] | "pending";

export interface Answer {
  answer: AnswerKey;
  comment: string;
}

/**
 * rateware's laneSegmentKey, verbatim. Confirmations are stored under this
 * key and both portals, and MARKSMAN's side, read them by it.
 */
export function segmentKeyOf(lane: BookLane): string {
  return (
    String(
      lane.rfx_segment_key ||
        [lane.operation, lane.service, lane.equipment, lane.trailer].filter(Boolean).join("-") ||
        "general",
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "general"
  );
}

export function segmentNameOf(lane: BookLane): string {
  return String(
    lane.rfx_segment_name ||
      [lane.operation, lane.service, lane.equipment, lane.trailer].filter(Boolean).join(" / ") ||
      "Términos del evento",
  );
}

/** A rubro's text: the lane's own column, else the event's master package (rateware's laneChecklist). */
export function rubricText(lane: BookLane, key: RubricKey): string {
  const own = String(lane[key] ?? "").trim();
  if (own) return own;
  const segments = lane.event?.rfx_master_package?.segments;
  if (!Array.isArray(segments)) return "";
  const segmentKey = segmentKeyOf(lane);
  const segment =
    segments.find((s) => String(s.segment_key || "general") === segmentKey) ??
    segments.find((s) => Array.isArray(s.lane_ids) && (s.lane_ids as unknown[]).map(String).includes(lane.rfx_lane_id));
  if (!segment) return "";
  const checklist = Array.isArray(segment.checklist) ? (segment.checklist as Record<string, unknown>[]) : [];
  const configured = checklist.find((r) => r?.key === key);
  return String(configured?.detail || segment[key] || "").trim();
}

/** This event's segments, in lane order, with their lanes. */
export function segmentsOf(lanes: BookLane[]) {
  const map = new Map<string, { key: string; name: string; lanes: BookLane[] }>();
  for (const lane of lanes) {
    const key = segmentKeyOf(lane);
    const entry = map.get(key) ?? { key, name: segmentNameOf(lane), lanes: [] };
    entry.lanes.push(lane);
    map.set(key, entry);
  }
  return [...map.values()];
}

/**
 * The latest answer per (segment, rubro) among these lanes. Confirmations are
 * stored per lane invitation and the server lists them newest first.
 */
export function answersOf(existing: Record<string, unknown>[], lanes: BookLane[]): Map<string, Answer> {
  const ids = new Set(lanes.map((l) => String(l.invitation_id ?? "")).filter(Boolean));
  const map = new Map<string, Answer>();
  for (const row of existing) {
    if (!ids.has(String(row.rfx_lane_vendor_id ?? ""))) continue;
    const key = `${row.segment_key}::${row.rubric_key}`;
    if (!map.has(key)) map.set(key, { answer: String(row.answer || "pending") as AnswerKey, comment: String(row.comment || "") });
  }
  return map;
}

/** How far a segment's six rubros are answered. */
export function segmentProgress(segmentKey: string, answers: Map<string, Answer>) {
  let done = 0;
  let flagged = 0;
  for (const r of RUBRICS) {
    const a = answers.get(`${segmentKey}::${r.key}`)?.answer ?? "pending";
    if (a !== "pending") done += 1;
    if (a === "exception" || a === "disagree") flagged += 1;
  }
  return { done, total: RUBRICS.length, flagged };
}

/**
 * Confirms rubros on EVERY lane of the segment. Confirmations are stored per
 * lane invitation (rateware asks lane by lane); saving through one token would
 * leave the segment's other lanes unconfirmed on MARKSMAN's side. Upserts on
 * (invitation, segment, rubro), so repeating is safe.
 */
export async function confirmSegment(
  lanes: BookLane[],
  segmentKey: string,
  rows: { rubric_key: RubricKey; answer: AnswerKey; comment: string }[],
) {
  const tokens = [...new Set(lanes.map((l) => String(l.invitation_token || "")).filter(Boolean))];
  const confirmations = rows.map((r) => ({ segment_key: segmentKey, ...r }));
  for (let i = 0; i < tokens.length; i += 5) {
    await Promise.all(
      tokens.slice(i, i + 5).map((token) => callRfxBidApi("save_segment_confirmations", { token, confirmations })),
    );
  }
}

export async function listBidRoomChat(token: string) {
  return await callRfxBidApi("list_bid_room_chat", { token });
}

export async function postBidRoomChatMessage(token: string, message: Record<string, unknown>) {
  return await callRfxBidApi("post_bid_room_chat_message", { token, ...message });
}

/**
 * One lane's live board, as `get_invitation` returns it for the token's own
 * lane (rfx-bid-api liveBoardFromRows). Rank is by marketplace score (price,
 * capacity, transit, validation), not by price alone; `delta_*` is measured
 * against the LOWEST offer. What competitors reveal depends on the event's
 * bid_visibility_mode, which the server already applies: the exact distance
 * comes only on an open leaderboard, since own offer − distance = best price.
 */
export interface LiveBoardRow {
  rank: number;
  bidder: string;
  amount: number | null;
  amount_display?: string;
  currency?: string;
  marketplace_score?: number | null;
  score_bucket?: string;
  is_current?: boolean;
}

export interface LiveBoard {
  updated_at?: string;
  visibility?: {
    mode?: "private" | "anonymous_rank" | "open_leaderboard";
    competitor_names_visible?: boolean;
    competitor_rates_visible?: boolean;
    competitor_rank_visible?: boolean;
    refresh_seconds?: number;
  };
  award_outcome?: { status?: "awarded" | "backup" | "not_awarded" | "pending"; role?: string | null };
  bid_count?: number;
  current_rank?: number | null;
  currency?: string;
  position_signal?: string;
  current_score?: number | null;
  current_score_bucket?: string | null;
  current_badges?: string[];
  leader_score?: number | null;
  guidance?: string;
  delta_to_leader?: number | null;
  delta_bucket?: "leading" | "within_250" | "within_500" | "above_500" | null;
  rows?: LiveBoardRow[];
}

/**
 * The board of ONE lane, read with that lane's own token. Note: the first read
 * of a lane stamps it as viewed on MARKSMAN's side, so callers only read lanes
 * the carrier already quoted.
 */
export async function getLaneBoard(laneToken: string) {
  const res = await callRfxBidApi<{ live_board?: LiveBoard }>("get_invitation", { token: laneToken });
  return res.live_board ?? null;
}

/**
 * What the marketplace score counts besides price (rfx-bid-api
 * liveBoardRowScore), in the order of what each is worth. Confirming the
 * segment terms is NOT among them: the server keeps it as advisory context.
 */
export const SCORE_FACTORS: { label: string; hint: string; done: (lane: BookLane) => boolean }[] = [
  { label: "Capacidad semanal", hint: "cuántas cargas sostienes de verdad", done: (l) => l.weekly_capacity != null },
  { label: "Equipo disponible", hint: "decir que no resta; no decirlo casi no suma", done: (l) => l.equipment_available === true },
  { label: "Tránsito en días", hint: "menos días, más puntos", done: (l) => l.transit_days != null },
  {
    label: "Cuenta espejo de GPS",
    hint: "valida tu unidad sin llamadas",
    done: (l) =>
      l.mirror_account_enabled === true ||
      ["mirror_requested", "mirror_enabled", "validated"].includes(String(l.availability_validation_status ?? "")),
  },
  { label: "Distancia en vacío", hint: "qué tan cerca está tu unidad", done: (l) => l.deadhead_distance != null },
  { label: "ETA de recolección", hint: "el cliente planea con esto", done: (l) => Boolean(l.eta_pickup) },
];

/** What `bid_support_reply` answers (rfx-bid-api, verified against main). */
export interface SupportReply {
  question?: string;
  answer?: string;
  /** The assistant thinks a person at MARKSMAN should take it. */
  needs_ticket?: boolean;
  confidence?: "low" | "medium" | "high";
  scope?: string;
  intent_label?: string;
  support_highlights?: { label?: string; value?: string }[];
  next_steps?: string[];
  ticket_suggestion?: string;
  suggested_prompts?: string[];
  /** Present only when the question was escalated. */
  ticket?: { id?: string; google_chat?: { status?: string } } | null;
  escalation_available?: boolean;
}

/**
 * The Bid Room assistant. Asking only returns an answer built from the event,
 * the invited lanes, the visible rules and the carrier's ranking; nothing
 * reaches MARKSMAN. With `createTicket` the same question becomes a support
 * ticket, which is also posted to the team's Google Chat and shows up in the
 * carrier's profile support log.
 */
export async function askBidSupport(
  token: string,
  question: string,
  { createTicket = false }: { createTicket?: boolean } = {},
) {
  return await callRfxBidApi<SupportReply>("bid_support_reply", {
    token,
    message: question,
    language: "es",
    create_ticket: createTicket,
  });
}

/**
 * Holding a valid link is not the same as the bid still being open: the backend
 * answers 409 with `bid_window_closed` once the deadline passes, the event
 * closes, the invitation is archived, or the lane was already awarded. That
 * deserves its own message, not a generic error.
 */
export function isWindowClosed(err: unknown): boolean {
  const e = err as ApiError & { status?: number };
  return e?.status === 409;
}

export function explainBidError(err: unknown): string {
  const message = (err as Error)?.message || String(err);
  if (isWindowClosed(err)) {
    return `${message} La ventana de cotización ya cerró para este lane.`;
  }
  return message;
}

/** A lane already priced is a revision; the first one is an initial quote. */
export function isRevision(lane: BookLane): boolean {
  return lane.bid_rate != null;
}
