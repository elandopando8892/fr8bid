/**
 * The shipper's own request, reached by the customer RFI link. Two forms share
 * one model: a spot request (one screen) and an RFQ wizard (RFx, mini-bid,
 * contract). Lanes carry the columns of MARKSMAN's RFI template and its
 * catalogs (./catalog); requirements are rateware's RFI questionnaire by
 * operating segment (./rubric). Both save through rfx-bid-api's customer RFI
 * actions, so rateware and "Crear evento" read the same records as always.
 */
import {
  BORDER_CROSSINGS,
  CONFIG_TYPES,
  EQUIPMENT_TYPES,
  FACILITY_TYPES,
  LOAD_TYPES,
  OPERATION_TYPES,
  PACKAGING_TYPES,
  RFI_OPERATION_TYPE,
  RFI_SERVICE_TYPE,
  SCHEDULE_TYPES,
  SERVICE_TYPES,
  TRUCK_TYPES,
  catalogValue,
  operationFor,
  type CatalogOption,
} from "./catalog";
import { placeFromText, placeText, plain, titleCase, type Place } from "./places";
import {
  GENERAL_GROUPS,
  SEGMENT_KEYS,
  segmentKeyRows,
  segmentLabel,
  segmentModelRows,
  segmentMoreRows,
  type RubricCategory,
  type RubricRow,
} from "./rubric";

export type { Place } from "./places";
export { countryFromWord, countryOfState, placeFromText, placeText } from "./places";

export type Lang = "es" | "en";
export type RequestKind = "spot" | "rfq";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** One route, with the columns of the RFI template's route matrix. */
export interface LaneDraft {
  key: string;
  /** Operating segment ("" = inferred from the route). */
  segment: string;
  // Salida / Outbound
  origin: Place | null;
  origin_shipper: string;
  origin_facility: string;
  origin_load_type: string;
  origin_load_hours: string;
  origin_schedule: string;
  origin_window: string;
  // Llegada / Inbound
  destination: Place | null;
  destination_consignee: string;
  destination_facility: string;
  destination_unload_type: string;
  destination_unload_hours: string;
  destination_schedule: string;
  destination_window: string;
  // Unidad y operación
  /** Tipo de camión (Truck Type). */
  truck: string;
  /** Tipo de equipo (Equipment Type). */
  equipment: string;
  config: string;
  /** Tipo de operación; "" = inferred from the countries. */
  operation: string;
  service: string;
  // Cruce
  border_crossing: string;
  border_days: string;
  customs_broker: string;
  transfer: string;
  // Carga
  commodity: string;
  hazmat: boolean;
  hazmat_un: string;
  invoice_value: string;
  packaging: string;
  pieces: string;
  stacks: string;
  weight: string;
  weight_unit: "lb" | "kg";
  cubic_meters: string;
  // Volumen y programación
  daily: Record<Weekday, string>;
  annual_volume: string;
  /** Spot: loads to move. RFQ: expected weekly volume. */
  loads: string;
  shipment_kind: string;
  lead_time_days: string;
  // Servicio
  driver_assist: string;
  team_driver: string;
  transit_days: string;
  distance: string;
  pickup_date: string;
  additional_items: string;
  notes: string;
  /** Columns this form doesn't edit (e.g. from rateware's own form): sent back untouched. */
  extra?: Record<string, unknown>;
}

export interface Contact {
  company: string;
  name: string;
  email: string;
  phone: string;
}

export interface Answer {
  value: string;
  note: string;
}

export interface RequestDraft {
  kind: RequestKind;
  contact: Contact;
  /** Kept from drafts started in rateware's form; this form no longer asks it. */
  scope: string;
  currency: "USD" | "MXN";
  segments: string[];
  /** Keyed `${segment or "general"}:${row key}`. */
  answers: Record<string, Answer>;
  /** Anything else the carriers should know (rateware's notes and exceptions). */
  notes: string;
  /** The request's main commodity: a lane that leaves its own empty takes this one. */
  commodity: string;
  /** The request's standard equipment type (template value), likewise. */
  equipment: string;
  lanes: LaneDraft[];
}

export interface RequestProject {
  id: string;
  title: string | null;
  customer_name: string | null;
  customer_contact_name: string | null;
  opportunity_type: string | null;
  due_date: string | null;
  status: string | null;
}

export interface RequestSubmission {
  status: string | null;
  submitted_at: string | null;
  response: unknown;
}

/** get_customer_rfi */
export interface RequestResponse {
  project: RequestProject;
  link: { id: string; status: string; expires_at: string | null; submitted_at: string | null };
  submission: RequestSubmission | null;
  lanes: Record<string, unknown>[];
}

export const requestKind = (opportunityType: string | null | undefined): RequestKind =>
  String(opportunityType || "spot").toLowerCase() === "spot" ? "spot" : "rfq";

// ------------------------------------------------------------- operation / segment

export const crossesBorder = (lane: Pick<LaneDraft, "origin" | "destination">) =>
  Boolean(lane.origin?.country && lane.destination?.country && lane.origin.country !== lane.destination.country);

export const inferredOperation = (lane: Pick<LaneDraft, "origin" | "destination">) =>
  operationFor(lane.origin?.country, lane.destination?.country);

export const laneOperation = (lane: LaneDraft) => lane.operation || inferredOperation(lane);

/** Lanes that cross, or whose operation is a crossing leg, ask the border columns. */
export const asksCrossing = (lane: LaneDraft) => crossesBorder(lane) || RFI_OPERATION_TYPE[laneOperation(lane)] === "crossborder";

const CROSSBORDER_OPERATIONS = new Set(["D2D Export", "D2D Import", "MX Northbound", "MX Southbound", "US/CA Northbound", "US/CA Southbound"]);

/**
 * The operating segment a lane's own answers settle. A domestic lane can be
 * local, regional or national, which only the shipper knows.
 */
export function inferredSegment(lane: LaneDraft): string {
  const operation = laneOperation(lane);
  if (operation === "MX Drayage") return "port_drayage_mx";
  if (CROSSBORDER_OPERATIONS.has(operation) || crossesBorder(lane)) return "crossborder";
  if (lane.service === "Expedited") return "expedited";
  if (operation === "Local MX" || operation === "Local US/CA") return "local_ftl";
  return "";
}

/** The lane's segment: the shipper's pick, else what the lane settles, else the request's only segment. */
export function laneSegment(draft: Pick<RequestDraft, "segments">, lane: LaneDraft): string {
  if (lane.segment) return lane.segment;
  return inferredSegment(lane) || (draft.segments.length === 1 ? draft.segments[0] : "");
}

// ------------------------------------------------------------- drafts

let laneSeq = 0;
const newKey = () => `lane-${Date.now().toString(36)}-${(laneSeq += 1)}`;

const emptyDaily = (): Record<Weekday, string> => ({ mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" });

export function emptyLane(kind: RequestKind): LaneDraft {
  return {
    key: newKey(),
    segment: "",
    origin: null,
    origin_shipper: "",
    origin_facility: "",
    origin_load_type: "",
    origin_load_hours: "",
    origin_schedule: "",
    origin_window: "",
    destination: null,
    destination_consignee: "",
    destination_facility: "",
    destination_unload_type: "",
    destination_unload_hours: "",
    destination_schedule: "",
    destination_window: "",
    truck: "",
    equipment: "",
    config: "",
    operation: "",
    service: "One Way",
    border_crossing: "",
    border_days: "",
    customs_broker: "",
    transfer: "",
    commodity: "",
    hazmat: false,
    hazmat_un: "",
    invoice_value: "",
    packaging: "",
    pieces: "",
    stacks: "",
    weight: "",
    weight_unit: "lb",
    cubic_meters: "",
    daily: emptyDaily(),
    annual_volume: "",
    loads: kind === "spot" ? "1" : "",
    shipment_kind: kind === "spot" ? "Spot" : "",
    lead_time_days: "",
    driver_assist: "",
    team_driver: "",
    transit_days: "",
    distance: "",
    pickup_date: "",
    additional_items: "",
    notes: "",
  };
}

export const copyLane = (lane: LaneDraft): LaneDraft => ({ ...lane, daily: { ...lane.daily }, key: newKey() });

export function emptyDraft(kind: RequestKind, project: RequestProject): RequestDraft {
  return {
    kind,
    contact: { company: project.customer_name || "", name: project.customer_contact_name || "", email: "", phone: "" },
    scope: "",
    currency: "USD",
    segments: [],
    answers: {},
    notes: "",
    commodity: "",
    equipment: "",
    lanes: [emptyLane(kind)],
  };
}

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const yesNo = (value: unknown) => {
  if (value === true || /^(true|yes|si|sí|1)$/i.test(text(value))) return "Yes";
  if (value === false || /^(false|no|0)$/i.test(text(value))) return "No";
  return "";
};

// ------------------------------------------------------------- reading back

/**
 * Lane keys this form writes, plus the aliases rfx-bid-api reads for the same
 * things and the columns a stored row adds. Everything else in a lane rides
 * along untouched in `extra`.
 */
const OWN_LANE_KEYS = new Set([
  "lane_id", "id", "project_id", "submission_id", "owner_email", "owner_user_id", "organization_id", "created_at",
  "updated_at", "validation_issues", "completeness_score", "raw_payload", "origin_id", "destination_id",
  ...["origin", "destination"].flatMap((side) =>
    ["", "_location", "_text", "_name", "_site", "_city", "_state", "_st", "_province", "_country", "_postal_code", "_zip",
      "_zip_code", "_market", "_region", "_place", "_service_window", "_hours", "_facility_type", "_average_time_hours",
      "_schedule_type", "_handling_type"].map((suffix) => `${side}${suffix}`),
  ),
  "origin_shipper", "origin_contact_name", "origin_contact", "origin_load_type",
  "destination_consignee", "destination_contact_name", "destination_contact", "destination_unload_type",
  "truck_type", "equipment_type", "equipment", "trailer_requirements", "trailer", "config", "operation_type", "operation",
  "operating_segment", "segment", "service_type", "service", "scheduling_type", "frequency", "shipment_kind",
  "border_crossing", "average_border_days", "customs_broker", "transfer",
  "product", "commodity", "hazmat", "hazmat_un_number", "cargo_value", "cargo_value_currency", "packaging", "pieces", "pallets",
  "stackable_beds", "average_weight", "weight", "average_cubic_meters",
  "mon_volume", "tue_volume", "wed_volume", "thu_volume", "fri_volume", "sat_volume", "sun_volume",
  "last_annual_volume", "annual_volume", "weekly_volume", "positioning_lead_time", "pickup_lead_time_hours",
  "pickup_lead_time_days", "driver_assistance", "double_driver", "transit_days", "average_distance",
  "currency", "pickup_date", "notes", "logistics_model", "operation_criteria", "business_rules",
  "service_specifications", "carrier_requirements", "other_notes",
  // Not listed, so they ride along: target_rate, crossing_model and temperature_* from earlier forms.
]);

const omitKeys = (value: Record<string, unknown>, keys: Iterable<string>) => {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !drop.has(key)));
};

/**
 * Earlier names for template operations: rateware's form codes and the
 * shared catalog's values until it's aligned with the template.
 */
const LEGACY_OPERATION: Record<string, string> = {
  d2d_export: "D2D Export",
  d2d_import: "D2D Import",
  intra_mex: "Intra-MX",
  mx_domestic: "Intra-MX",
  us_domestic: "Intra-US/CA",
  "intra mex": "Intra-MX",
  "mx domestic": "Intra-MX",
  "us domestic": "Intra-US/CA",
  drayage: "MX Drayage",
  "us northbound": "US/CA Northbound",
  "us southbound": "US/CA Southbound",
};
const LEGACY_FACILITY: Record<string, string> = { warehouse: "Warehouse", dc: "Distribution Center", plant: "Factory" };
const LEGACY_PACKAGING: Record<string, string> = { palletized: "Pallets", crated: "Crates", totes: "Totes", other: "Other" };
const LEGACY_LEAD_DAYS: Record<string, string> = { same_day: "0", "24_hours": "1", "48_hours": "2", "72_hours": "3", one_week: "7" };

/** The template value a cell names, else the cell as written (a select shows it as its own option). */
const templateOr = (list: CatalogOption[], value: unknown) => catalogValue(list, value) ?? text(value);

/** A template operation; rateware's own codes (crossborder, local…) aren't one and are left to the route. */
function operationValue(row: Record<string, unknown>): string {
  const named = text(row.operation);
  if (named) return catalogValue(OPERATION_TYPES, named) ?? LEGACY_OPERATION[plain(named)] ?? named;
  return LEGACY_OPERATION[text(row.operation_type).toLowerCase()] ?? "";
}

/** rateware's form sends its service codes; the template names the service. */
function serviceValue(row: Record<string, unknown>): string {
  const named = text(row.service);
  if (named) return catalogValue(SERVICE_TYPES, named) ?? named;
  const code = text(row.service_type).toLowerCase();
  if (code === "expedited" || code === "time_critical") return "Expedited";
  if (code === "dedicated") return "Dedicated";
  return "One Way";
}

/**
 * rateware's form keeps live/drop and appointment/FCFS apart; the template
 * joins them ("Live w/ appt"). What doesn't combine stays as it was given.
 */
function siteTiming(load: unknown, schedule: unknown): { load: string; schedule: string } {
  const templateSchedule = catalogValue(SCHEDULE_TYPES, schedule);
  const templateLoad = catalogValue(LOAD_TYPES, load);
  if (templateLoad) return { load: templateLoad, schedule: templateSchedule ?? text(schedule) };
  const kind = text(load).toLowerCase();
  const when = text(schedule).toLowerCase();
  const appointment = /appoint|cita/.test(when);
  const fcfs = /fcfs|first come|orden de llegada/.test(when);
  const live = kind === "live";
  const drop = kind === "drop" || kind === "drop_and_hook";
  if ((live || drop) && (appointment || fcfs)) {
    const joined = live ? (appointment ? "Live w/ appt" : "Live - FCFS") : appointment ? "Drop-Off w/ appt" : "Drop-Off - FCFS";
    return { load: joined, schedule: templateSchedule ?? "" };
  }
  return { load: text(load), schedule: templateSchedule ?? text(schedule) };
}

/** Legacy spellings of a crossing's cities, as the Drive template and rateware's form wrote them. */
const CROSSING_CITY_ALIASES: Record<string, string> = {
  juarez: "cd juarez",
  "ciudad juarez": "cd juarez",
  "ciudad acuna": "cd acuna",
  acuna: "cd acuna",
  otay: "otay mesa",
  yuma: "san luis",
};
const crossingCity = (part: string) => {
  const key = plain(part).replace(/[.]/g, "").replace(/\s+/g, " ").trim();
  return CROSSING_CITY_ALIASES[key] ?? key;
};

/**
 * The catalog's name for a crossing written any way: the template's US-first
 * "Laredo / Nuevo Laredo", rateware's "El Paso / Juarez", or the catalog's own.
 * Cities are compared as a set, so the order and the "Cd." never matter.
 */
export function crossingValue(value: unknown): string {
  const direct = catalogValue(BORDER_CROSSINGS, value);
  if (direct) return direct;
  const cities = text(value).split("/").map(crossingCity).filter(Boolean).sort().join("|");
  if (!cities) return "";
  const match = BORDER_CROSSINGS.find((entry) => entry.value.split("/").map(crossingCity).sort().join("|") === cities);
  return match?.value ?? text(value);
}

function leadDays(row: Record<string, unknown>): string {
  const legacy = LEGACY_LEAD_DAYS[text(row.positioning_lead_time)];
  if (legacy) return legacy;
  if (text(row.pickup_lead_time_days)) return text(row.pickup_lead_time_days);
  const hours = Number(row.pickup_lead_time_hours);
  return Number.isFinite(hours) && hours > 0 ? String(Math.round((hours / 24) * 10) / 10) : "";
}

/**
 * A lane an earlier form saved. `segmentText` gives a segment's summary of
 * unit specifications, which rateware copies into a lane that has none.
 */
function laneFromRfi(
  stored: Record<string, unknown>,
  kind: RequestKind,
  fromBidwareV1: boolean,
  segmentText: (segment: string) => string = () => "",
): LaneDraft {
  // A stored row keeps the lane exactly as it was sent in raw_payload.
  const row = Object.keys(record(stored.raw_payload)).length ? record(stored.raw_payload) : stored;
  const side = (name: "origin" | "destination") =>
    (record(row[`${name}_place`]).value ? (row[`${name}_place`] as Place) : null) ??
    placeFromText(
      text(row[`${name}_location`] || row[`${name}_text`] || [row[`${name}_city`], row[`${name}_state`]].filter(Boolean).join(", ")),
      text(row[`${name}_country`]),
      text(row[`${name}_postal_code`]),
    );
  const origin = side("origin");
  const destination = side("destination");
  if (origin && text(row.origin_postal_code)) origin.postal_code = text(row.origin_postal_code);
  if (destination && text(row.destination_postal_code)) destination.postal_code = text(row.destination_postal_code);
  const segment = segmentsFrom([row.operating_segment || row.segment])[0] ?? "";
  const pickup = siteTiming(row.origin_load_type, row.origin_schedule_type);
  const delivery = siteTiming(row.destination_unload_type, row.destination_schedule_type);
  const daily = emptyDaily();
  for (const day of WEEKDAYS) daily[day] = text(row[`${day}_volume`]);
  const shipmentKind = text(row.shipment_kind) || (/spot/i.test(text(row.scheduling_type)) ? "Spot" : text(row.scheduling_type) ? "Scheduled" : "");
  const specs = text(row.service_specifications);
  return {
    ...emptyLane(kind),
    segment: SEGMENT_KEYS.includes(segment) ? segment : "",
    origin,
    origin_shipper: text(row.origin_shipper || row.origin_contact_name || row.origin_contact),
    origin_facility: LEGACY_FACILITY[text(row.origin_facility_type)] ?? templateOr(FACILITY_TYPES, row.origin_facility_type),
    origin_load_type: pickup.load,
    origin_load_hours: text(row.origin_average_time_hours),
    origin_schedule: pickup.schedule,
    origin_window: text(row.origin_service_window),
    destination,
    destination_consignee: text(row.destination_consignee || row.destination_contact_name || row.destination_contact),
    destination_facility: LEGACY_FACILITY[text(row.destination_facility_type)] ?? templateOr(FACILITY_TYPES, row.destination_facility_type),
    destination_unload_type: delivery.load,
    destination_unload_hours: text(row.destination_average_time_hours),
    destination_schedule: delivery.schedule,
    destination_window: text(row.destination_service_window),
    truck: templateOr(TRUCK_TYPES, row.truck_type || row.equipment_type || row.equipment),
    equipment: templateOr(EQUIPMENT_TYPES, row.trailer_requirements || row.trailer),
    config: templateOr(CONFIG_TYPES, row.config),
    operation: operationValue(row),
    service: serviceValue(row),
    border_crossing: crossingValue(row.border_crossing),
    border_days: text(row.average_border_days),
    customs_broker: text(row.customs_broker),
    transfer: typeof row.transfer === "boolean" ? "" : text(row.transfer),
    commodity: text(row.product || row.commodity),
    hazmat: row.hazmat === true || /^(true|yes|si|sí|1)$/i.test(text(row.hazmat)),
    hazmat_un: text(row.hazmat_un_number),
    invoice_value: text(row.cargo_value),
    packaging: LEGACY_PACKAGING[text(row.packaging)] ?? templateOr(PACKAGING_TYPES, row.packaging),
    pieces: text(row.pieces || row.pallets),
    stacks: typeof row.stackable_beds === "boolean" ? "" : text(row.stackable_beds),
    weight: text(row.average_weight || row.weight),
    cubic_meters: text(row.average_cubic_meters),
    daily,
    annual_volume: text(row.last_annual_volume || row.annual_volume),
    loads: text(row.weekly_volume),
    shipment_kind: shipmentKind,
    lead_time_days: leadDays(row),
    driver_assist: yesNo(row.driver_assistance),
    team_driver: yesNo(row.double_driver),
    transit_days: text(row.transit_days),
    distance: text(row.average_distance),
    pickup_date: text(row.pickup_date),
    // Bidware's first form wrote requirement summaries there, and rateware copies the
    // segment's summary into an empty lane: neither is the shipper's own text.
    additional_items: fromBidwareV1 || specs === segmentText(segment) ? "" : specs,
    notes: text(row.notes),
    extra: {
      ...omitKeys(row, OWN_LANE_KEYS),
      // rateware's checkboxes for these; this form asks a count or a name, so a yes/no stays as it was.
      ...(typeof row.stackable_beds === "boolean" ? { stackable_beds: row.stackable_beds } : {}),
      ...(typeof row.transfer === "boolean" ? { transfer: row.transfer } : {}),
    },
  };
}

/** rateware's form ticks *_ftl and legacy keys; the backend keeps these. */
function segmentsFrom(value: unknown): string[] {
  const keys = (Array.isArray(value) ? value : []).map((entry) => text(typeof entry === "object" ? record(entry).value || record(entry).segment : entry));
  const mapped = keys.map((key) => {
    const lower = key.toLowerCase();
    if (["local", "regional", "national"].includes(lower)) return `${lower}_ftl`;
    if (["mx_domestic", "us_domestic", "dedicated"].includes(lower)) return "national_ftl";
    if (lower.startsWith("d2d_")) return "crossborder";
    return key;
  });
  return [...new Set(mapped.filter(Boolean))];
}

/**
 * Answers in rateware's segment checklists: an item's observation, or a
 * ticked item with none, which says the requirement applies.
 */
function answersFromChecklists(saved: Record<string, unknown>): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  const generalKeys = new Set(GENERAL_GROUPS.flatMap((group) => group.rows.map((row) => row.key)));
  for (const checklist of Array.isArray(saved.segment_checklists) ? saved.segment_checklists : []) {
    const entry = record(checklist);
    const segment = segmentsFrom([entry.segment_key])[0];
    const segmentKeys = new Set(segment ? segmentRows(segment).map((row) => row.key) : []);
    for (const [key, raw] of Object.entries(record(entry.rubric_items))) {
      const item = record(raw);
      const observation = text(item.observation || item.answer || item.notes);
      const ticked = item.required === true || text(item.required) === "true";
      if (!observation && !ticked) continue;
      // The team's own items (custom_*) aren't questions here; the checklist keeps them.
      const scope = generalKeys.has(key) ? "general" : segmentKeys.has(key) ? segment : "";
      if (!scope) continue;
      answers[answerKey(scope, key)] = { value: observation || "Required", note: "" };
    }
  }
  return answers;
}

/**
 * Bidware's first form ticked requirements from its own short list; each
 * that has a question in rateware's questionnaire becomes that answer.
 */
const V1_REQUIREMENTS: Record<string, [string, string]> = {
  appointments: ["c_appointment_required", "Yes"],
  fsc_separate: ["d_fuel_surcharge", "Separate"],
  detention_defined: ["d_detention", "Required"],
  gps: ["e_tracking", "GPS"],
  pod: ["e_pod", "Required"],
  bol: ["e_documents", "Carta Porte / BOL"],
  seals: ["e_seals", "Required"],
  temperature: ["e_temperature", "Temperature controlled"],
  ctpat: ["f_certifications", "C-TPAT / OEA"],
  crossborder_experience: ["f_mx_us_experience", "Yes"],
  cargo_insurance: ["f_cargo_insurance", "Required"],
};

/** Bidware's first form: the ticks rateware's questionnaire has no question for, by their label. */
const V1_UNMAPPED_LABELS: Record<string, string> = {
  ftl: "Carga completa (FTL)",
  crossborder: "Cruce MX–US",
  recurring: "Recurrente",
  seasonal: "Estacional",
  intermodal: "Intermodal",
  flexible_windows: "Ventanas flexibles",
  transit_target: "Tránsito objetivo",
  free_time: "Tiempo libre en carga y descarga",
  multi_stop: "Multi-parada",
  accessorial_approval: "Accesorios con aprobación previa",
  min_years: "Antigüedad mínima",
  dedicated_fleet: "Flota dedicada",
};

function notesFromV1(draft: Record<string, unknown>): string {
  const picked = Object.values(record(draft.requirements)).flatMap((items) => (Array.isArray(items) ? items.map(text) : []));
  const unmapped = picked.filter((item) => !V1_REQUIREMENTS[item]).map((item) => V1_UNMAPPED_LABELS[item] ?? item);
  return [text(draft.requirement_notes), unmapped.length ? `Requisitos: ${unmapped.join(", ")}` : ""].filter(Boolean).join("\n");
}

function answersFromV1(draft: Record<string, unknown>): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  const picked = Object.values(record(draft.requirements)).flatMap((items) => (Array.isArray(items) ? items.map(text) : []));
  for (const item of picked) {
    const mapped = V1_REQUIREMENTS[item];
    if (mapped) answers[answerKey("general", mapped[0])] = { value: mapped[1], note: "" };
  }
  if (text(draft.payment_terms)) answers[answerKey("general", "d_payment_terms")] = { value: text(draft.payment_terms), note: "" };
  return answers;
}

/** Back to the form: our own saved draft first, else whatever an earlier form saved. */
export function draftFromResponse(kind: RequestKind, response: RequestResponse): RequestDraft {
  const base = emptyDraft(kind, response.project);
  const saved = record(response.submission?.response);
  const bidware = record(saved.bidware);
  const ours = record(bidware.draft);
  if (Number(bidware.version) >= 2 && Array.isArray(ours.lanes)) {
    const lanes = (ours.lanes as LaneDraft[]).map((lane) => ({
      ...emptyLane(kind),
      ...lane,
      daily: { ...emptyDaily(), ...record(lane.daily) } as Record<Weekday, string>,
      key: lane.key || newKey(),
    }));
    return {
      ...base,
      ...(ours as Partial<RequestDraft>),
      kind,
      contact: { ...base.contact, ...record(ours.contact) } as Contact,
      answers: record(ours.answers) as Record<string, Answer>,
      segments: Array.isArray(ours.segments) ? (ours.segments as string[]) : [],
      notes: text(ours.notes),
      commodity: text(ours.commodity),
      equipment: text(ours.equipment),
      lanes: lanes.length ? lanes : base.lanes,
    };
  }
  // rateware's form, or Bidware's first form (version 1): read the lanes as the backend got them.
  const fromBidwareV1 = Number(bidware.version) === 1;
  const overview = record(saved.account_overview);
  const rows = Array.isArray(saved.lanes) && saved.lanes.length ? (saved.lanes as Record<string, unknown>[]) : response.lanes;
  const specsBySegment = new Map(
    (Array.isArray(saved.segment_checklists) ? saved.segment_checklists : []).map((entry) => [
      segmentsFrom([record(entry).segment_key])[0],
      text(record(entry).service_specifications),
    ]),
  );
  const lanes = rows.map((row) => laneFromRfi(record(row), kind, fromBidwareV1, (segment) => specsBySegment.get(segment) ?? ""));
  const firstRow = record(rows[0]);
  const currency = text(
    overview.currency || record(saved.business_rules).rate_currency || firstRow.currency || record(firstRow.raw_payload).currency,
  ).toUpperCase();
  return {
    ...base,
    contact: {
      company: text(overview.company) || base.contact.company,
      name: text(overview.contact) || base.contact.name,
      email: text(overview.contact_email),
      phone: text(overview.contact_phone),
    },
    scope: text(overview.scope),
    currency: currency === "MXN" ? "MXN" : "USD",
    segments: segmentsFrom(saved.operating_segments),
    answers: fromBidwareV1 ? answersFromV1(ours) : answersFromChecklists(saved),
    notes: fromBidwareV1 ? notesFromV1(ours) : "",
    lanes: lanes.length ? lanes : base.lanes,
  };
}

// ------------------------------------------------------------- checks

export type LaneProblem = "origin" | "destination" | "truck" | "loads";

const isBlank = (lane: LaneDraft) =>
  !lane.origin && !lane.destination && !lane.truck && !lane.equipment && !lane.commodity && !lane.notes && !lane.weight;

/** What rfx-bid-api requires before it accepts a submission. */
export function laneProblems(lane: LaneDraft): LaneProblem[] {
  const problems: LaneProblem[] = [];
  if (!placeText(lane.origin)) problems.push("origin");
  if (!placeText(lane.destination)) problems.push("destination");
  if (!lane.truck && !lane.equipment) problems.push("truck");
  if (!((parseAmount(lane.loads) ?? 0) > 0)) problems.push("loads");
  return problems;
}

/** A lane as it's sent: what it leaves empty of the request's commodity and equipment, it takes. */
export const withDefaults = (draft: Pick<RequestDraft, "commodity" | "equipment">, lane: LaneDraft): LaneDraft => ({
  ...lane,
  commodity: lane.commodity || draft.commodity || "",
  equipment: lane.equipment || draft.equipment || "",
});

/** The lanes with something in them, each as it's sent (see withDefaults). */
export const filledLanes = (draft: RequestDraft) => draft.lanes.filter((lane) => !isBlank(lane)).map((lane) => withDefaults(draft, lane));

export function draftProblems(draft: RequestDraft) {
  const lanes = filledLanes(draft);
  return {
    noLanes: lanes.length === 0,
    lanes: lanes.map((lane) => ({ key: lane.key, problems: laneProblems(lane) })).filter((entry) => entry.problems.length),
  };
}

// ------------------------------------------------------------- numbers

/**
 * A number as people type it: "40,000" and "18.000" are thousands, "1,5" is a
 * decimal, "3-5" means the first figure.
 */
export function parseAmount(value: unknown): number | undefined {
  const raw = String(value ?? "").replace(/\s/g, "");
  if (!raw) return undefined;
  let digits: string;
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) digits = raw.replace(/[.,]/g, "");
  else if (/^\d+,\d{1,2}$/.test(raw)) digits = raw.replace(",", ".");
  else if (/\d[.,]\d{3}[.,]\d/.test(raw)) digits = raw.replace(/[.,](?=\d{3}[.,])/g, "").replace(",", ".");
  else digits = raw.match(/\d+(?:\.\d+)?/)?.[0] ?? "";
  const number = Number(digits);
  return digits && Number.isFinite(number) ? number : undefined;
}

export const weightInPounds = (lane: LaneDraft) => {
  const weight = parseAmount(lane.weight);
  if (weight === undefined) return undefined;
  return Math.round(lane.weight_unit === "kg" ? weight * 2.20462 : weight);
};

// ------------------------------------------------------------- questionnaire

export const answerKey = (scope: string, rowKey: string) => `${scope}:${rowKey}`;
export const isAnswered = (answer: Answer | undefined) => Boolean(answer && (answer.value.trim() || answer.note.trim()));

/** Answers saying the requirement doesn't apply: rateware keeps those unticked. */
const NOT_REQUIRED = new Set(["Not required", "Not applicable", "No"]);

/** The segments a request covers: the shipper's picks plus any its lanes settle. */
export function requestSegments(draft: RequestDraft): string[] {
  return [...new Set([...draft.segments, ...filledLanes(draft).map((lane) => laneSegment(draft, lane))].filter(Boolean))];
}

/** A segment's own questions: its logistics model, its five key ones and the rest of its rubric. */
const segmentRows = (segment: string) => [...segmentModelRows(segment), ...segmentKeyRows(segment), ...segmentMoreRows(segment)];

/** A segment's checklist in rateware: its own questions, then sections C–G, which every segment repeats. */
export function segmentQuestions(segment: string): { scope: string; row: RubricRow }[] {
  return [
    ...segmentRows(segment).map((row) => ({ scope: segment, row })),
    ...GENERAL_GROUPS.flatMap((group) => group.rows.map((row) => ({ scope: "general", row }))),
  ];
}

/** rateware's observation: the answer as listed, then the shipper's words. */
const observationOf = (answer: Answer) => [answer.value.trim(), answer.note.trim()].filter(Boolean).join(" — ");

const CATEGORIES: RubricCategory[] = [
  "logistics_model",
  "operation_criteria",
  "business_rules",
  "service_specifications",
  "carrier_requirements",
  "other_notes",
];

const categoryOf = (value: unknown): RubricCategory =>
  CATEGORIES.includes(text(value) as RubricCategory) ? (text(value) as RubricCategory) : "other_notes";

/** Keys this form writes on a segment checklist; the rest of a stored one is kept. */
const OWN_CHECKLIST_KEYS = [
  "segment_key",
  "segment_name",
  "rubric_items",
  "source",
  ...CATEGORIES,
  ...CATEGORIES.map((category) => `${category}_required`),
];

/**
 * rateware's segment checklist, as its own RFI form stores it. Items this
 * form doesn't ask (the team's own, custom_*) and the checklist's other
 * fields (attachments, removed items…) stay as stored.
 */
function segmentChecklist(draft: RequestDraft, segment: string, stored: Record<string, unknown> = {}) {
  const questions = segmentQuestions(segment);
  const asked = new Set(questions.map(({ row }) => row.key));
  const rubricItems: Record<string, Record<string, unknown>> = Object.fromEntries(
    Object.entries(record(stored.rubric_items))
      .filter(([key]) => !asked.has(key))
      .map(([key, item]) => [key, record(item)]),
  );
  for (const { scope, row } of questions) {
    const answer = draft.answers[answerKey(scope, row.key)];
    if (!answer || !isAnswered(answer)) continue;
    rubricItems[row.key] = {
      category: row.category,
      label: row.es.label,
      question: row.es.question,
      expected: row.es.expected,
      required: !NOT_REQUIRED.has(answer.value.trim()),
      observation: observationOf(answer),
    };
  }
  // rateware's categorySummary: every ticked or answered item, "label: answer (or what's expected)".
  const lines = Object.fromEntries(CATEGORIES.map((category) => [category, [] as string[]])) as Record<RubricCategory, string[]>;
  const required = new Set<RubricCategory>();
  for (const item of Object.values(rubricItems)) {
    const category = categoryOf(item.category);
    const ticked = item.required === true;
    const observation = text(item.observation);
    if (ticked) required.add(category);
    if (ticked || observation) lines[category].push(`${text(item.label)}: ${observation || text(item.expected)}`);
  }
  return {
    ...omitKeys(stored, OWN_CHECKLIST_KEYS),
    segment_key: segment,
    segment_name: segmentLabel(segment, "es"),
    rubric_items: rubricItems,
    ...Object.fromEntries(
      CATEGORIES.flatMap((category) => [
        [`${category}_required`, required.has(category)],
        [category, lines[category].join("\n")],
      ]),
    ),
    attachment_links: text(stored.attachment_links),
    removed_rubric_keys: Array.isArray(stored.removed_rubric_keys) ? stored.removed_rubric_keys : [],
    source: "bidware",
  };
}

// ------------------------------------------------------------- RFI payload

/** Unanswered fields stay out; an explicit "no" (false) stays in. */
const compact = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ""));

const amount = (value: string) => parseAmount(value);

type Checklist = ReturnType<typeof segmentChecklist>;

function rfiLane(lane: LaneDraft, index: number, draft: RequestDraft, checklists: Map<string, Checklist>) {
  const operation = laneOperation(lane);
  const crossing = asksCrossing(lane);
  const segment = laneSegment(draft, lane);
  const checklist = checklists.get(segment) as Record<string, unknown> | undefined;
  const rubric = (category: RubricCategory) => text(checklist?.[category]) || undefined;
  const days = amount(lane.lead_time_days);
  const own = compact({
    lane_id: `L${index + 1}`,
    operating_segment: segment || undefined,
    origin_location: placeText(lane.origin),
    origin_city: lane.origin?.city ? titleCase(lane.origin.city) : undefined,
    origin_state: lane.origin?.state_code || undefined,
    origin_country: lane.origin?.country || undefined,
    origin_postal_code: lane.origin?.postal_code || undefined,
    origin_market: lane.origin?.market || undefined,
    origin_region: lane.origin?.region || undefined,
    origin_shipper: lane.origin_shipper || undefined,
    origin_facility_type: lane.origin_facility || undefined,
    origin_load_type: lane.origin_load_type || undefined,
    origin_average_time_hours: amount(lane.origin_load_hours),
    origin_schedule_type: lane.origin_schedule || undefined,
    origin_service_window: lane.origin_window || undefined,
    destination_location: placeText(lane.destination),
    destination_city: lane.destination?.city ? titleCase(lane.destination.city) : undefined,
    destination_state: lane.destination?.state_code || undefined,
    destination_country: lane.destination?.country || undefined,
    destination_postal_code: lane.destination?.postal_code || undefined,
    destination_market: lane.destination?.market || undefined,
    destination_region: lane.destination?.region || undefined,
    destination_consignee: lane.destination_consignee || undefined,
    destination_facility_type: lane.destination_facility || undefined,
    destination_unload_type: lane.destination_unload_type || undefined,
    destination_average_time_hours: amount(lane.destination_unload_hours),
    destination_schedule_type: lane.destination_schedule || undefined,
    destination_service_window: lane.destination_window || undefined,
    // Truck Type and Equipment Type, as the template and QuoteDesk name them.
    truck_type: lane.truck || undefined,
    equipment_type: lane.truck || undefined,
    trailer_requirements: lane.equipment || undefined,
    config: lane.config || undefined,
    operation: operation || undefined,
    operation_type: RFI_OPERATION_TYPE[operation],
    service: lane.service || undefined,
    service_type: draft.kind === "spot" ? "spot" : RFI_SERVICE_TYPE[lane.service],
    border_crossing: crossing ? lane.border_crossing || undefined : undefined,
    average_border_days: crossing ? amount(lane.border_days) : undefined,
    customs_broker: crossing ? lane.customs_broker || undefined : undefined,
    transfer: crossing ? lane.transfer || undefined : undefined,
    product: lane.commodity || undefined,
    hazmat: lane.hazmat,
    hazmat_un_number: lane.hazmat ? lane.hazmat_un || undefined : undefined,
    cargo_value: amount(lane.invoice_value),
    cargo_value_currency: lane.invoice_value ? "USD" : undefined,
    packaging: lane.packaging || undefined,
    pieces: amount(lane.pieces),
    stackable_beds: amount(lane.stacks),
    average_weight: weightInPounds(lane),
    average_cubic_meters: amount(lane.cubic_meters),
    ...Object.fromEntries(WEEKDAYS.map((day) => [`${day}_volume`, amount(lane.daily[day])])),
    last_annual_volume: amount(lane.annual_volume),
    weekly_volume: amount(lane.loads),
    shipment_kind: lane.shipment_kind || undefined,
    scheduling_type: lane.shipment_kind === "Spot" ? "spot" : lane.shipment_kind === "Scheduled" ? "recurring" : undefined,
    pickup_lead_time_hours: days === undefined ? undefined : Math.round(days * 24),
    driver_assistance: lane.driver_assist ? lane.driver_assist === "Yes" : undefined,
    double_driver: lane.team_driver ? lane.team_driver === "Yes" : undefined,
    transit_days: amount(lane.transit_days),
    average_distance: lane.distance || undefined,
    currency: draft.currency,
    pickup_date: lane.pickup_date || undefined,
    notes: lane.notes || undefined,
    // rateware fills a lane's six rubric texts from its segment when the lane has none.
    logistics_model: rubric("logistics_model"),
    operation_criteria: rubric("operation_criteria"),
    business_rules: rubric("business_rules"),
    service_specifications: lane.additional_items || rubric("service_specifications"),
    carrier_requirements: rubric("carrier_requirements"),
    other_notes: [rubric("other_notes"), draft.notes.trim()].filter(Boolean).join("\n") || undefined,
    origin_place: lane.origin || undefined,
    destination_place: lane.destination || undefined,
  });
  // Whatever this form doesn't edit goes back exactly as it came.
  return { ...(lane.extra ?? {}), ...own };
}

/** Keys this form writes in each section it owns; other keys there are kept. */
const OWN_SECTION_KEYS: Record<string, string[]> = {
  account_overview: ["company", "contact", "contact_email", "contact_phone", "scope", "currency", "request_kind"],
  logistics_models: ["selected", "notes"],
  operational_criteria: ["notes"],
  business_rules: ["payment_terms", "rate_currency", "fuel_surcharge_policy", "notes"],
  service_requirements: ["gps_tracking_required", "tracking_frequency", "pod_required", "bol_required", "communication_channels", "notes"],
  carrier_requirements: [
    "allowed_carrier_types", "mc_dot_required", "mx_authority_required", "crossborder_experience_required", "gps_required",
    "certifications_required", "customer_preapproval_required", "preferred_carriers", "blocked_carriers", "notes",
  ],
  notes_exceptions: ["section", "note_type", "severity", "note", "notes"],
};
const OWN_SECTIONS = new Set([...Object.keys(OWN_SECTION_KEYS), "operating_segments", "segment_checklists", "lanes", "bidware"]);

const AFFIRMATIVE = new Set(["Yes", "Required", "Preferred"]);
const LIST_PICKS = new Set([...AFFIRMATIVE, ...NOT_REQUIRED, "Customer decides", "Carrier decides", "Other / specify"]);

/** Answers to the general questions (sections C–G), as the structured fields the backend stores. */
function generalFields(draft: RequestDraft) {
  const value = (key: string) => draft.answers[answerKey("general", key)]?.value.trim() ?? "";
  const yes = (key: string) => (AFFIRMATIVE.has(value(key)) ? true : undefined);
  /** A list the shipper wrote ("Acme, Transportes X"); a pick from the answer list isn't one. */
  const list = (key: string) => {
    const answer = value(key);
    if (!answer || LIST_PICKS.has(answer)) return undefined;
    const items = answer.split(/[,;/]/).map((part) => part.trim()).filter(Boolean);
    return items.length ? items : undefined;
  };
  return {
    business_rules: compact({
      payment_terms: value("d_payment_terms") || undefined,
      rate_currency: value("d_currency") || draft.currency,
      fuel_surcharge_policy: value("d_fuel_surcharge") || undefined,
    }),
    service_requirements: compact({
      gps_tracking_required: /gps/i.test(value("e_tracking") + value("c_tracking_requirement")) || undefined,
      tracking_frequency: value("c_update_frequency") || undefined,
      pod_required: yes("e_pod"),
      bol_required: /\bbol\b/i.test(value("e_documents")) || undefined,
      communication_channels: list("e_communication"),
    }),
    carrier_requirements: compact({
      allowed_carrier_types: value("f_carrier_type") ? [value("f_carrier_type")] : undefined,
      mc_dot_required: yes("f_mc_dot"),
      mx_authority_required: yes("f_mx_permits"),
      crossborder_experience_required: yes("f_mx_us_experience"),
      gps_required: yes("f_gps"),
      certifications_required: list("f_certifications"),
      customer_preapproval_required: yes("f_prior_approval"),
      preferred_carriers: list("f_preferred_carriers"),
      blocked_carriers: list("f_blocked_carriers"),
    }),
  };
}

/**
 * A category's text for the request's sections, as rateware merges it: every
 * segment's summary (general answers repeat in each, so once), or the general
 * answers alone when no segment applies.
 */
function sectionNotes(draft: RequestDraft, checklists: Checklist[], category: RubricCategory) {
  const lines = checklists.length
    ? checklists.flatMap((checklist) => text((checklist as Record<string, unknown>)[category]).split("\n"))
    : (GENERAL_GROUPS.find((group) => group.key === category)?.rows ?? []).flatMap((row) => {
        const answer = draft.answers[answerKey("general", row.key)];
        return answer && isAnswered(answer) ? [`${row.es.label}: ${observationOf(answer)}`] : [];
      });
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))].join("\n");
}

/**
 * The full `rfi` body for save/submit_customer_rfi. Every save replaces the
 * whole request, so `base` — the response as it was loaded — contributes
 * everything this form doesn't edit.
 */
export function toRfiPayload(draft: RequestDraft, base: Record<string, unknown> = {}) {
  const segments = requestSegments(draft);
  const storedChecklists = (Array.isArray(base.segment_checklists) ? base.segment_checklists : []).map(record);
  const storedFor = (segment: string) => storedChecklists.find((entry) => segmentsFrom([entry.segment_key])[0] === segment);
  const checklists = new Map(segments.map((segment) => [segment, segmentChecklist(draft, segment, storedFor(segment))]));
  const fields = generalFields(draft);
  const notes = (category: RubricCategory) => sectionNotes(draft, [...checklists.values()], category);
  const section = (name: string, own: Record<string, unknown>) => ({
    ...omitKeys(record(base[name]), OWN_SECTION_KEYS[name] ?? []),
    ...own,
  });
  const carried = Object.fromEntries(Object.entries(base).filter(([key]) => !OWN_SECTIONS.has(key)));
  // A checklist this form didn't write, for a segment it doesn't cover (the team's own, from rateware), stays.
  const foreignChecklists = storedChecklists.filter(
    (entry) => entry.source !== "bidware" && !checklists.has(segmentsFrom([entry.segment_key])[0]),
  );
  const exceptions = [notes("other_notes"), draft.notes.trim()].filter(Boolean).join("\n");
  return {
    ...carried,
    account_overview: section(
      "account_overview",
      compact({
        company: draft.contact.company,
        contact: draft.contact.name,
        contact_email: draft.contact.email,
        contact_phone: draft.contact.phone,
        scope: draft.scope,
        currency: draft.currency,
        request_kind: draft.kind,
      }),
    ),
    operating_segments: segments.map((value) => ({ value })),
    segment_checklists: [...foreignChecklists, ...checklists.values()],
    logistics_models: section("logistics_models", compact({ selected: segments.length ? segments : undefined, notes: notes("logistics_model") })),
    operational_criteria: section("operational_criteria", compact({ notes: notes("operation_criteria") })),
    business_rules: section("business_rules", { ...fields.business_rules, ...compact({ notes: notes("business_rules") }) }),
    service_requirements: section("service_requirements", { ...fields.service_requirements, ...compact({ notes: notes("service_specifications") }) }),
    carrier_requirements: section("carrier_requirements", { ...fields.carrier_requirements, ...compact({ notes: notes("carrier_requirements") }) }),
    notes_exceptions: section(
      "notes_exceptions",
      exceptions ? { section: "general", note_type: "customer_note", severity: "info", note: exceptions } : {},
    ),
    lanes: filledLanes(draft).map((lane, index) => rfiLane(lane, index, draft, checklists)),
    bidware: { form: draft.kind, version: 2, draft },
  };
}
