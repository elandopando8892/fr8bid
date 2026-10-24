import { tr } from "@/i18n/quotedesk";
import { callQuotedeskApi, callRatewareApi } from "@/lib/api-client";

/**
 * QuoteDesk talks to its own edge function (quotedesk-api) for quotes and to
 * rateware-api for the shared catalogs: CRM shippers, locations and options.
 * The server computes base cost, all-in and margin; calc.ts only previews them.
 */

export type QuoteStatus =
  | "new"
  | "estimating"
  | "quoted"
  | "bid_room"
  | "won"
  | "lost"
  | "expired"
  | "archived";

export type MarkupMode = "percent_on_cost" | "fixed_amount" | "target_margin";
export type AccessorialUnit = "hour" | "event" | "trip" | "day" | "mile" | "other";
export type Currency = "USD" | "MXN";

export interface AccessorialLine {
  code: string | null;
  label: string;
  unit: AccessorialUnit;
  quantity: number;
  rate: number;
  subtotal: number;
}

export interface CatalogItem {
  id: string;
  code: string;
  label: string;
  unit: AccessorialUnit;
  default_rate: number | string;
  currency: Currency;
  sort_order: number;
  active: boolean;
}

export interface Quote {
  id: string;
  folio: string;
  folio_number: number;
  shipper_id: string | null;
  shipper_name: string | null;
  shipper_opportunity_id: string | null;
  title: string | null;
  quote_type: "spot" | "contract";
  channel: string;
  requested_by: string | null;
  assigned_to_email: string | null;
  currency: Currency;
  fx_usd_mxn: number | string | null;
  fx_rate_date: string | null;
  valid_until: string | null;
  status: QuoteStatus;
  status_changed_at: string;
  quoted_at: string | null;
  closed_at: string | null;
  outcome_reason: string | null;
  rfx_event_id: string | null;
  bid_room_launched_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteLane {
  id: string;
  quote_id: string;
  lane_number: number;
  created_at: string;
  updated_at: string;
  origin: string | null;
  origin_city: string | null;
  origin_state: string | null;
  origin_country: string | null;
  origin_postal_code: string | null;
  origin_market: string | null;
  origin_region: string | null;
  destination: string | null;
  destination_city: string | null;
  destination_state: string | null;
  destination_country: string | null;
  destination_postal_code: string | null;
  destination_market: string | null;
  destination_region: string | null;
  equipment: string | null;
  trailer: string | null;
  config: string | null;
  operation: string | null;
  service: string | null;
  border_crossing: string | null;
  crossing_model: string | null;
  weight_lb: number | string | null;
  weekly_volume: number | string | null;
  mx_miles: number | string | null;
  us_miles: number | string | null;
  miles_source: string | null;
  linehaul_mx: number | string | null;
  linehaul_us: number | string | null;
  fuel_amount: number | string | null;
  fsc_per_mile: number | string | null;
  fsc_rate_date: string | null;
  fsc_diesel_per_gallon: number | string | null;
  border_amount: number | string | null;
  carrier_rate: number | string | null;
  accessorials: AccessorialLine[];
  markup_mode: MarkupMode;
  markup_value: number | string | null;
  base_cost: number | string | null;
  accessorials_total: number | string | null;
  markup_amount: number | string | null;
  all_in_rate: number | string | null;
  margin_amount: number | string | null;
  margin_pct: number | string | null;
  cost_source: "manual" | "bid_room_award" | "fcm";
  rfx_lane_id: string | null;
  notes: string | null;
  metadata: Record<string, any>;
}

export interface QuoteSummary {
  lane_count: number;
  priced_lane_count: number;
  base_cost_total: number;
  accessorials_total: number;
  all_in_total: number;
  margin_total: number;
  margin_pct: number | null;
}

export interface QuoteRow extends Quote {
  first_lane: { origin: string | null; destination: string | null; equipment: string | null } | null;
  summary: QuoteSummary;
}

export interface QuoteList {
  rows: QuoteRow[];
  kpis: { counts: Partial<Record<QuoteStatus, number>>; avg_margin_pct: number | null };
}

export interface LinkedEvent {
  id: string;
  rfx_id: string | null;
  name: string | null;
  status: string | null;
  event_type: string | null;
  due_date: string | null;
}

export interface LaneAward {
  bid_rate: number;
  currency: string;
  vendor_name: string | null;
  awarded_at: string | null;
}

export interface QuoteDetail {
  quote: Quote;
  lanes: QuoteLane[];
  summary: QuoteSummary;
  event: LinkedEvent | null;
  awards: Record<string, LaneAward>;
}

export interface BorderCrossing {
  crossing_name: string;
  mx_city: string;
  mx_state: string;
  us_city: string;
  us_state: string;
}

export interface QuoteContext {
  accessorial_catalog: CatalogItem[];
  fx: { usd_mxn: number | null; rate_date: string; source: string } | null;
  fuel: {
    state_region: Record<string, string>;
    regions: { region: string; fsc_per_mile: number | null; index_date: string }[];
  };
  border_crossings: BorderCrossing[];
  /** Legs missing from the mileage catalog are measured with Google Routes. */
  google_routes_enabled?: boolean;
  email?: { sender: string; connected: boolean };
}

/** A place as rateware's location search returns it. */
export interface LocationOption {
  id?: string;
  value: string;
  label: string;
  zip_prefix?: string | null;
  city?: string | null;
  state_code?: string | null;
  state_name?: string | null;
  country?: string | null;
  market?: string | null;
  region?: string | null;
}

export interface StagingOptions {
  categories: Record<string, string[]>;
  mx_crossings: string[];
  us_crossings: string[];
}

export interface MilesLeg {
  scope: "mx" | "us" | "border";
  from?: string;
  to?: string;
  miles?: number | null;
  found?: boolean;
  crossing?: string;
  /** "catalog" (rateware_lane_mileage) or "google_routes". */
  provider?: string | null;
  provider_error?: string | null;
}

export interface MilesSuggestion {
  mx_miles: number | null;
  us_miles: number | null;
  legs: MilesLeg[];
  fuel: { region: string; fsc_per_mile: number | null; diesel_per_gallon?: number | null; index_date: string; state: string } | null;
  complete: boolean;
  miles_source?: string | null;
  google_routes_enabled?: boolean;
  reason?: string;
}

export interface QuoteEmailReceipt {
  id: string;
  recipient_email: string;
  cc_emails: string[];
  subject: string;
  status: "sending" | "sent" | "failed" | "delivery_unknown";
  attempt: number;
  error: string | null;
  attempted_at: string;
  sent_at: string | null;
}

export interface QuoteEmailPreview {
  to: string | null;
  cc: string[];
  contact_name: string | null;
  note: string | null;
  from: string;
  subject: string;
  text: string;
  html: string;
  checksum: string;
  suppressed: string[];
  history: QuoteEmailReceipt[];
}

export interface ShipperOption {
  id: string;
  shipper_name: string | null;
  legal_name: string | null;
  industry: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
}

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  get new() { return tr("text151"); },
  get estimating() { return tr("text152"); },
  get quoted() { return tr("text153"); },
  get bid_room() { return tr("text154"); },
  get won() { return tr("text155"); },
  get lost() { return tr("text156"); },
  get expired() { return tr("text157"); },
  get archived() { return tr("text158"); },
};

export const STATUS_TONE: Record<QuoteStatus, "" | "green" | "orange" | "blue" | "amber" | "red" | "indigo"> = {
  new: "orange",
  estimating: "amber",
  quoted: "green",
  bid_room: "blue",
  won: "indigo",
  lost: "red",
  expired: "red",
  archived: "",
};

export const CHANNELS = [
  { key: "email", get label() { return tr("text159"); } },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "phone", get label() { return tr("text160"); } },
  { key: "rfi", get label() { return tr("text161"); } },
  { key: "portal", label: "Portal" },
  { key: "other", get label() { return tr("text162"); } },
] as const;

export const UNIT_LABEL: Record<AccessorialUnit, string> = {
  get hour() { return tr("text163"); },
  get event() { return tr("text164"); },
  get trip() { return tr("text165"); },
  get day() { return tr("text166"); },
  get mile() { return tr("text167"); },
  get other() { return tr("text168"); },
};

export const MARKUP_MODES: { key: MarkupMode; label: string; hint: string }[] = [
  { key: "percent_on_cost", get label() { return tr("text169"); }, get hint() { return tr("text170"); } },
  { key: "fixed_amount", get label() { return tr("text171"); }, get hint() { return tr("text172"); } },
  { key: "target_margin", get label() { return tr("text173"); }, get hint() { return tr("text174"); } },
];

/** Values rateware uses for how the border is crossed. */
// Interchange models carry the cruce; blue plates (direct, B1) cross without it.
export const CROSSING_MODELS = [
  { key: "direct", get label() { return tr("text175"); } },
  { key: "transfer", get label() { return tr("text176"); } },
  { key: "swap", get label() { return tr("text177"); } },
  { key: "drayage", get label() { return tr("text178"); } },
  { key: "b1", get label() { return tr("text179"); } },
] as const;

/** What the shipper sees: a backhaul is our cost assumption, sold as one-way. */
export const customerService = (service: string | null | undefined) =>
  service && /^backhaul$/i.test(service.trim()) ? "One Way" : service ?? "";

// ------------------------------------------------------------------ FCM estimate

export type FcmTier = "minimum" | "target" | "premium";
export type FcmMargins = Record<FcmTier, number>;

export interface FcmCostBase {
  id: string;
  name: string;
  code: string | null;
  scope: string | null;
  scope_label: string | null;
  operations: string[] | null;
  version: number;
  version_status: string;
  is_default: boolean;
  param_count: number;
  synced_at: string;
  margins: FcmMargins;
}

/**
 * The hourly check that QuoteDesk's copy of the FCM engine still calculates like
 * the FCM: "review" means the FCM changed and estimates may not match it.
 */
export interface FcmEngineCheck {
  status: "ok" | "review" | "unverified";
  checked_at: string | null;
  reasons: string[];
  /** The FCM release the formula was compared with (7 characters). */
  fcm_release: string | null;
}

export interface FcmBases {
  bases: FcmCostBase[];
  default_id: string | null;
  tiers: { key: FcmTier; label: string }[];
  /** Older API responses lack it. */
  engine_check?: FcmEngineCheck;
}

/** estimate_lane_fcm: money in the quote's currency (components, carrier_price) or USD (*_usd, mx/us detail). */
export interface FcmEstimate {
  cost_base: { id: string; name: string; code: string | null; version: number; scope: string | null; auto: boolean };
  tier: FcmTier;
  margin: number;
  margins: FcmMargins;
  operation: string;
  service: string;
  customer_service: string;
  /** The unit the FCM priced ("Rabón · Caja seca · Sencillo"); older estimates lack it. */
  equipment_label?: string;
  crossing_model: string | null;
  border: { carries: boolean; known: boolean; costUsd: number };
  currency: string;
  fx_usd_mxn: number | null;
  components: { linehaul_mx: number | null; linehaul_us: number | null; fuel_amount: number | null; border_amount: number | null };
  carrier_price: number;
  carrier_price_usd: number;
  mx: {
    km: number; emptyKm: number; tollsMxn: number; hours: number; fuelUsd: number; allInUsd: number;
    from: string; to: string; tolls_source: "fcm" | "manual" | "none"; hours_source: "fcm" | "google"; fcm_lane: string | null;
  } | null;
  us: {
    miles: number; rpm: number; fscPerMile: number; dieselUsdGal: number; linehaulUsd: number; fuelUsd: number;
    from: string; to: string; fcm_lane: string | null; transit_days: number;
    origin_condition: string; dest_condition: string; fsc_region: string; fsc_index_date: string;
  } | null;
  engine: { freightBaselineUsd: number; mexRequiredTariffUsd: number | null; usaFlatUsd: number | null; costFloorUsd: number };
  /** The engine check when this estimate was made; older estimates lack it. */
  engine_check?: FcmEngineCheck;
  warnings: string[];
  estimated_at: string;
}

export const FCM_TIER_LABEL: Record<FcmTier, string> = { get minimum() { return tr("text180"); }, get target() { return tr("text181"); }, premium: "Premium" };

// ------------------------------------------------------------------ quotes

export const getQuoteContext = () => callQuotedeskApi<QuoteContext>("get_context");

export const listQuotes = (params: { status?: string; search?: string; include_archived?: boolean } = {}) =>
  callQuotedeskApi<QuoteList>("list_quotes", params);

export const getQuote = (id: string) => callQuotedeskApi<QuoteDetail>("get_quote", { id });

export async function createQuote(quote: {
  shipper_id: string;
  title?: string;
  quote_type?: string;
  channel?: string;
  requested_by?: string;
  currency?: Currency;
  valid_until?: string | null;
  notes?: string;
}): Promise<Quote> {
  const res = await callQuotedeskApi<{ quote: Quote }>("create_quote", { quote });
  return res.quote;
}

export async function updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
  const res = await callQuotedeskApi<{ quote: Quote }>("update_quote", { id, patch });
  return res.quote;
}

export async function setQuoteStatus(id: string, status: QuoteStatus, outcomeReason?: string): Promise<Quote> {
  const res = await callQuotedeskApi<{ quote: Quote }>("set_quote_status", {
    id,
    status,
    outcome_reason: outcomeReason,
  });
  return res.quote;
}

export const saveQuoteLane = (quoteId: string, lane: Partial<QuoteLane> & Record<string, unknown>) =>
  callQuotedeskApi<{ lane: QuoteLane; quote: Quote; lanes: QuoteLane[]; summary: QuoteSummary }>(
    "save_quote_lane",
    { quote_id: quoteId, lane },
  );

export const deleteQuoteLane = (id: string) =>
  callQuotedeskApi<{ removed: string; lanes: QuoteLane[]; summary: QuoteSummary }>("delete_quote_lane", { id });

export const suggestLaneMiles = (input: {
  origin: Partial<LocationOption>;
  destination: Partial<LocationOption>;
  border_crossing?: string | null;
}) => callQuotedeskApi<MilesSuggestion>("suggest_lane_miles", input);

let fcmBasesPromise: Promise<FcmBases> | null = null;
/** The workspace's FCM cost bases; loaded once per session (they change only when re-synced). */
export const listFcmCostBases = () => {
  fcmBasesPromise ??= callQuotedeskApi<FcmBases>("list_fcm_cost_bases").catch((error) => {
    fcmBasesPromise = null;
    throw error;
  });
  return fcmBasesPromise;
};

export const estimateLaneFcm = (input: {
  quote_id: string;
  origin: Partial<LocationOption>;
  destination: Partial<LocationOption>;
  border_crossing?: string | null;
  crossing_model?: string | null;
  operation?: string | null;
  service?: string | null;
  equipment?: string | null;
  trailer?: string | null;
  config?: string | null;
  mx_miles?: string | number | null;
  us_miles?: string | number | null;
  tolls_mxn?: string | number | null;
  cost_base_id?: string | null;
  tier?: FcmTier;
}) => callQuotedeskApi<FcmEstimate>("estimate_lane_fcm", input);

export const linkBidRoomEvent = (input: {
  quote_id: string;
  rfx_event_id: string;
  lane_links: { quote_lane_id: string; rfx_lane_id: string }[];
}) => callQuotedeskApi<{ quote: Quote }>("link_bid_room_event", input);

export const applyBidRoomAwards = (quoteId: string) =>
  callQuotedeskApi<QuoteDetail & { applied: number; skipped: { lane_number: number; reason: string }[] }>(
    "apply_bid_room_awards",
    { quote_id: quoteId },
  );

export async function eventOrigins(eventIds: string[]) {
  if (!eventIds.length) return { origins: {} as Record<string, string>, folios: {} as Record<string, string> };
  return callQuotedeskApi<{ origins: Record<string, string>; folios: Record<string, string> }>(
    "event_origins",
    { event_ids: eventIds },
  );
}

export const previewQuoteEmail = (input: { quote_id: string; to?: string; cc?: string[]; note?: string; contact_name?: string }) =>
  callQuotedeskApi<QuoteEmailPreview>("preview_quote_email", input);

export interface QuoteQueueMessage {
  id: string;
  status: string;
  recipient_email: string;
  subject: string;
  html_body: string;
  text_body: string;
  receipt: QuoteEmailReceipt | null;
  metadata: { quote_id: string; checksum: string; from: string; cc: string[]; note: string | null; contact_name: string | null };
}

export const prepareQuoteEmailDraft = (input: {
  quote_id: string; to: string; cc: string[]; note?: string; contact_name?: string; checksum: string;
}) => callQuotedeskApi<{ draft_only: true; reused: boolean; message: QuoteQueueMessage }>("prepare_quote_email_draft", input);

export const listQuoteQueue = (quoteId: string, offset = 0) =>
  callQuotedeskApi<{ quote: Quote; rows: QuoteQueueMessage[]; total: number }>("list_quote_queue", { quote_id: quoteId, offset });

export const sendQuoteQueueMessage = (quoteId: string, message: QuoteQueueMessage) =>
  callQuotedeskApi<{ message: QuoteQueueMessage; duplicate: boolean }>("send_quote_queue_message", {
    quote_id: quoteId, message_id: message.id, checksum: message.metadata.checksum,
    confirmed: true, confirmation_action: "send_quote_queue_message",
  });

export const listQuoteEmails = (quoteId: string) =>
  callQuotedeskApi<{ rows: QuoteEmailReceipt[] }>("list_quote_emails", { quote_id: quoteId });

export const saveAccessorial = (item: Partial<CatalogItem>) =>
  callQuotedeskApi<{ item: CatalogItem }>("save_accessorial", { item });

// ------------------------------------------------------- shared catalogs

export async function searchShippers(search: string): Promise<ShipperOption[]> {
  const res = await callRatewareApi<{ rows?: ShipperOption[] }>("list_shippers", {
    search: search.trim() || undefined,
    limit: 25,
    sort_by: "shipper_name",
    sort_direction: "asc",
  });
  return res.rows ?? [];
}

const withoutAccents = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Places in the shared location catalog. Its search tells accents apart and
 * matches the whole text, while the catalog mostly writes names without
 * accents and abbreviates "Ciudad" ("Queretaro", "Cd. Juarez"). So a name is
 * searched by its city ("León, GTO" → "León"), without "Ciudad"/"Cd.", both as
 * typed and without accents.
 */
export async function searchLocations(search: string, country?: string, limit = 12): Promise<LocationOption[]> {
  const city = search.split(",")[0].trim().replace(/^(ciudad|cd\.?)\s+/i, "");
  const terms = [...new Set([city, withoutAccents(city)])].filter((term) => term.length >= 2);
  if (!terms.length) return [];
  const found = await Promise.all(
    terms.map((term) =>
      callRatewareApi<{ rows?: LocationOption[] }>("search_staging_locations", { search: term, country: country || undefined, limit }).then(
        (res) => res.rows ?? [],
      ),
    ),
  );
  const seen = new Set<string>();
  const rows = found.flat().filter((option) => {
    const key = String(option.id ?? option.value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // The city itself first: "León" also matches every place of the León and Nuevo León markets.
  const cityKey = (value: unknown) => withoutAccents(String(value ?? "")).toLowerCase().replace(/^(ciudad|cd\.?)\s+/, "").trim();
  const wanted = cityKey(city);
  return rows.sort((a, b) => Number(cityKey(b.city) === wanted) - Number(cityKey(a.city) === wanted));
}

let optionsCache: Promise<StagingOptions> | null = null;

/** Equipment, trailer, config, operation and service values (cached per session). */
export function getStagingOptions(): Promise<StagingOptions> {
  if (!optionsCache) {
    optionsCache = callRatewareApi<StagingOptions>("list_staging_options").catch((error) => {
      optionsCache = null;
      throw error;
    });
  }
  return optionsCache;
}
