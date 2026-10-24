import { tr } from "@/i18n/rfx-admin";
import { callRatewareApi } from "@/lib/api-client";
import type { RfxEvent } from "@/types/domain";

/**
 * Creating a bid event from scratch — the path for bids that do not come from
 * a shipper magic link.
 *
 * Every vocabulary here is the backend's, not invented:
 *   event_type          spot | rfx | bid
 *   status              draft | open | closed | awarded | archived
 *   bid_visibility_mode private | anonymous_rank | open_leaderboard
 * Anything else is silently coerced to the default, so the UI only offers real
 * values.
 */

/** The backend's three types, in the words the team uses (the RFx list calls `bid` Mini-bid). */
export const EVENT_TYPES = [
  { key: "spot", label: "Spot", get hint() { return tr("text371"); } },
  { key: "bid", label: "Mini-bid", get hint() { return tr("text372"); } },
  { key: "rfx", get label() { return tr("text373"); }, get hint() { return tr("text374"); } },
] as const;

/** What carriers see of each other. The most consequential setting here. */
export const VISIBILITY_MODES = [
  {
    key: "anonymous_rank",
    get label() { return tr("text375"); },
    get hint() { return tr("text376"); },
  },
  {
    key: "private",
    get label() { return tr("text377"); },
    get hint() { return tr("text378"); },
  },
  {
    key: "open_leaderboard",
    get label() { return tr("text379"); },
    get hint() { return tr("text380"); },
  },
] as const;

export interface NewEventInput {
  name: string;
  customer?: string;
  /** Shipper UUID from the CRM. The backend nulls anything that is not a UUID. */
  customer_id?: string | null;
  rfx_id?: string;
  event_type?: string;
  bid_visibility_mode?: string;
  due_date?: string | null;
  /** When the operation is expected to start (arranque estimado); carriers see it. */
  operation_start_date?: string | null;
  notes?: string;
}

export async function createEvent(input: NewEventInput): Promise<RfxEvent> {
  const res = await callRatewareApi<{ row: RfxEvent }>("create_rfx_event", {
    event: { ...input, status: "draft" },
  });
  return res.row;
}

/**
 * The next event key in the team's own style, RFx + MMDDYY + a two-digit
 * sequence of the day (RFx08272603). Left blank, the backend would name every
 * event of the same day RFx-AAAA-MM-DD.
 */
export function suggestRfxId(events: Record<string, unknown>[], now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `RFx${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getFullYear() % 100)}`;
  let last = 0;
  for (const event of events) {
    const id = String(event.rfx_id ?? "").trim();
    if (id.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) continue;
    const seq = Number(id.slice(prefix.length));
    if (Number.isInteger(seq) && seq > last) last = seq;
  }
  return `${prefix}${pad(last + 1)}`;
}

/**
 * What the draft keeps that rateware has no event column for: the operating
 * segment, the currency and the cédula become each lane's defaults when the
 * lanes are loaded. Until then they live in this browser, per draft.
 */
export interface DraftSettings {
  segment?: string;
  currency?: string;
  rubrics?: LaneRubrics;
}

const settingsKey = (eventId: string) => `bidware:new-event:${eventId}`;

export function loadDraftSettings(eventId: string): DraftSettings {
  try {
    const raw = window.localStorage.getItem(settingsKey(eventId));
    return raw ? (JSON.parse(raw) as DraftSettings) : {};
  } catch {
    return {};
  }
}

export function saveDraftSettings(eventId: string, settings: DraftSettings) {
  try {
    window.localStorage.setItem(settingsKey(eventId), JSON.stringify(settings));
  } catch {
    // A private window or blocked storage: the settings still reach the lanes when they load.
  }
}

/** The event's own fields, the only ones update_rfx_event takes. */
export interface DraftFields {
  name: string;
  customer?: string | null;
  customer_id?: string | null;
  rfx_id?: string;
  event_type: string;
  bid_visibility_mode: string;
  due_date: string | null;
  operation_start_date: string | null;
}

export async function updateDraft(eventId: string, patch: Partial<DraftFields>): Promise<RfxEvent> {
  const res = await callRatewareApi<{ row: RfxEvent }>("update_rfx_event", { id: eventId, patch });
  return res.row;
}

/** The six rubro columns live on each lane, so project-level terms are copied down. */
export interface LaneRubrics {
  logistics_model?: string;
  operation_criteria?: string;
  business_rules?: string;
  service_specifications?: string;
  carrier_requirements?: string;
  other_notes?: string;
}

/**
 * The cédula: the first three invite the right carriers (they widen the pool),
 * the next two warn of cost (they narrow it and raise the price).
 */
export const RUBRICS: {
  key: keyof LaneRubrics;
  label: string;
  placeholder: string;
  effect?: "widens" | "narrows";
}[] = [
  { key: "logistics_model", get label() { return tr("text381"); }, get placeholder() { return tr("text382"); }, effect: "widens" },
  { key: "operation_criteria", get label() { return tr("text383"); }, get placeholder() { return tr("text384"); }, effect: "widens" },
  { key: "business_rules", get label() { return tr("text385"); }, get placeholder() { return tr("text386"); }, effect: "widens" },
  { key: "service_specifications", get label() { return tr("text387"); }, get placeholder() { return tr("text388"); }, effect: "narrows" },
  { key: "carrier_requirements", get label() { return tr("text389"); }, get placeholder() { return tr("text390"); }, effect: "narrows" },
  { key: "other_notes", get label() { return tr("text391"); }, get placeholder() { return tr("text392"); } },
];

/** The value most rows share (ties go to the first seen), ignoring blanks. */
export function mostCommon(values: unknown[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = String(value ?? "").trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export interface LaneDraft extends LaneRubrics {
  lane_number?: number;
  origin?: string;
  destination?: string;
  equipment?: string;
  trailer?: string;
  operation?: string;
  service?: string;
  weekly_volume?: number | null;
  target_rate?: number | null;
  currency?: string;
  rfx_segment_name?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface ImportResult {
  inserted: number;
  skipped?: number;
  skipped_rows?: { row_number: number; lane_number: number }[];
  rows?: unknown[];
  mode?: string;
}

export interface ReconciledImport extends ImportResult {
  /**
   * Rows the server accepted neither as inserted nor as skipped. It drops a row
   * with no origin AND no destination without reporting it, so we compute the
   * gap rather than let rows disappear quietly.
   */
  droppedSilently: number;
  sent: number;
}

/**
 * Lanes are appended, never replaced — the handler has no replace branch. A
 * closed event refuses new lanes with 409.
 */
export async function importLanes(
  eventId: string,
  rows: LaneDraft[],
): Promise<ReconciledImport> {
  const res = await callRatewareApi<ImportResult>("import_rfx_lanes", {
    event_id: eventId,
    rows,
  });
  const inserted = res.inserted ?? 0;
  const skipped = res.skipped ?? res.skipped_rows?.length ?? 0;
  return {
    ...res,
    inserted,
    skipped,
    sent: rows.length,
    droppedSilently: Math.max(0, rows.length - inserted - skipped),
  };
}

/** Max rows the backend accepts in one import. */
export const IMPORT_ROW_LIMIT = 1000;

export type RowProblem = "no_route" | "duplicate_in_paste";

export interface ParsedRow {
  draft: LaneDraft;
  problem?: RowProblem;
  /** The twin row number when this one repeats an earlier line. */
  twinOf?: number;
}

const dedupeKey = (l: LaneDraft) =>
  [l.origin, l.destination, l.equipment, l.trailer, l.operation, l.service]
    .map((v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");

/**
 * Parses pasted rows. Tab-separated first (what a spreadsheet copy produces),
 * then comma. Nothing is discarded: a row with no route or one that repeats an
 * earlier line is marked so the operator decides, never dropped.
 */
export function parsePastedLanes(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const split = (line: string) => (line.includes("\t") ? line.split("\t") : line.split(","));

  // Drop a header line if the first cell looks like a column name.
  const first = split(lines[0])[0]?.trim().toLowerCase() ?? "";
  const body = ["origen", "origin", "from", "orig"].includes(first) ? lines.slice(1) : lines;

  const seen = new Map<string, number>();
  return body.map((line, i) => {
    const c = split(line).map((v) => v.trim());
    const draft: LaneDraft = {
      lane_number: i + 1,
      origin: c[0] || "",
      destination: c[1] || "",
      equipment: c[2] || "",
      weekly_volume: c[3] ? Number(c[3]) || null : null,
      target_rate: c[4] ? Number(c[4]) || null : null,
      notes: c[5] || "",
    };
    if (!draft.origin && !draft.destination) return { draft, problem: "no_route" as const };
    const key = dedupeKey(draft);
    const twin = seen.get(key);
    if (twin) return { draft, problem: "duplicate_in_paste" as const, twinOf: twin };
    seen.set(key, i + 1);
    return { draft };
  });
}
