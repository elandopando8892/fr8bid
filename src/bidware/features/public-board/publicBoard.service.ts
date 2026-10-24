import { extra } from "@/i18n/public-board";
import { callRfxBidApi } from "@/lib/api-client";

/**
 * Public Bid Room board: the read-only marketplace of every event that is
 * open, closed or awarded, without carrier identity. Served by the token-less
 * `rfx-bid-api` public actions, the same ones rateware's public board uses.
 *
 * The board is one row per LANE (publicBidRoomBoard); events are grouped here.
 */

/** live · closing (closes within the day) · expired (deadline passed or closed) · awarded */
export type BoardStatus = "live" | "closing" | "expired" | "awarded";

export interface BoardRow {
  /** The lane id. */
  id: string;
  event_id: string;
  board_status: BoardStatus;
  /** Only live lanes take invitation requests (the server checks it too). */
  is_bid_available: boolean;
  due_state?: { due_date?: string | null; days_remaining?: number | null; status?: string };
  visibility?: { mode?: string };
  event: {
    id: string;
    rfx_id?: string;
    name?: string;
    event_type?: string;
    status?: string;
    due_date?: string | null;
    updated_at?: string;
  };
  lane: {
    id: string;
    lane_number?: number | null;
    origin?: string;
    destination?: string;
    origin_market?: string;
    destination_market?: string;
    equipment?: string;
    trailer?: string;
    operation?: string;
    service?: string;
    weekly_volume?: number | null;
  };
  route_label?: string;
  fit_tags?: string[];
  /** null when the event is private: activity is not shown. */
  quote_count: number | null;
  /** Rates only on an open leaderboard. */
  best_rate: number | null;
  currency: string | null;
  total_weekly_capacity: number | null;
  last_quote_at: string | null;
  quote_visibility: "open" | "hidden";
}

export interface BoardSummary {
  events: number;
  opportunities: number;
  live: number;
  closing: number;
  expired: number;
  awarded: number;
  lanes_with_quotes: number;
  total_quotes: number;
}

export interface BoardResponse {
  rows?: BoardRow[];
  summary?: BoardSummary;
  refresh_seconds?: number;
  generated_at?: string;
  /** With `since`: nothing changed since then. */
  not_modified?: boolean;
}

/** With `since` (the last `generated_at`) the server answers `not_modified` when nothing moved. */
export async function loadBoard(since?: string) {
  return await callRfxBidApi<BoardResponse>("public_bid_room_board", since ? { since } : {});
}

export interface BoardEvent {
  id: string;
  rfx_id?: string;
  name: string;
  event_type?: string;
  due_date?: string | null;
  status: BoardStatus;
  lanes: BoardRow[];
  /** null when the event is private. */
  quotes: number | null;
  equipment: string[];
  last_quote_at: string | null;
}

const STATUS_ORDER: Record<BoardStatus, number> = { live: 0, closing: 1, awarded: 2, expired: 3 };

/** Events in board order: live first, then closing, awarded, expired; most recent activity first. */
export function groupByEvent(rows: BoardRow[]): BoardEvent[] {
  const map = new Map<string, BoardEvent>();
  for (const row of rows) {
    const id = String(row.event_id || row.event?.id);
    const entry =
      map.get(id) ??
      ({
        id,
        rfx_id: row.event?.rfx_id,
        name: row.event?.name || row.event?.rfx_id || "Oportunidad",
        event_type: row.event?.event_type,
        due_date: row.event?.due_date,
        status: row.board_status,
        lanes: [],
        quotes: null,
        equipment: [],
        last_quote_at: null,
      } satisfies BoardEvent);
    entry.lanes.push(row);
    if (row.quote_count != null) entry.quotes = (entry.quotes ?? 0) + row.quote_count;
    const equipment = [row.lane?.equipment, row.lane?.trailer].filter(Boolean).join(" ");
    if (equipment && !entry.equipment.includes(equipment)) entry.equipment.push(equipment);
    if (row.last_quote_at && (!entry.last_quote_at || row.last_quote_at > entry.last_quote_at)) {
      entry.last_quote_at = row.last_quote_at;
    }
    map.set(id, entry);
  }
  for (const entry of map.values()) entry.lanes.sort((a, b) => Number(a.lane?.lane_number ?? 0) - Number(b.lane?.lane_number ?? 0));
  return [...map.values()].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      String(b.last_quote_at ?? "").localeCompare(String(a.last_quote_at ?? "")),
  );
}

/** "Monterrey, NL → Laredo, TX", or the first route and how many more. */
export function routeSummary(lanes: BoardRow[]): string {
  const routes = [...new Set(lanes.map((l) => `${l.lane?.origin ?? "—"} → ${l.lane?.destination ?? "—"}`))];
  if (routes.length <= 1) return routes[0] ?? "—";
  return `${routes[0]} y ${routes.length - 1} ruta${routes.length === 2 ? "" : "s"} más`;
}

/** Loads per week the lanes add up to; a lane without volume adds nothing. */
export function weeklyLoads(rows: BoardRow[]): number {
  return rows.reduce((sum, r) => sum + (Number(r.lane?.weekly_volume) || 0), 0);
}

/** Whole loads when there are many (34), one decimal when few (0.5, 2.3). */
export function loads(value: number): string {
  if (!value) return "0";
  return value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
}

export interface Competition {
  /** 0 = no offers yet … 5 = heavily quoted. */
  level: number;
  label: string;
  tone: "green" | "amber" | "orange";
}

/**
 * How contested lanes are, from their offers per lane. For a carrier a quiet
 * lane is the opportunity, so few offers reads green. Private events don't
 * show activity, so they get no meter.
 */
export function competition(rows: BoardRow[]): Competition | null {
  const counted = rows.filter((r) => r.quote_count != null);
  if (!counted.length) return null;
  const perLane = counted.reduce((sum, r) => sum + (r.quote_count ?? 0), 0) / counted.length;
  if (perLane === 0) return { level: 0, get label() { return extra("extra0"); }, tone: "green" };
  if (perLane <= 1) return { level: 1, get label() { return extra("extra1"); }, tone: "green" };
  if (perLane <= 2.5) return { level: 2, get label() { return extra("extra1"); }, tone: "green" };
  if (perLane <= 5) return { level: 3, get label() { return extra("extra2"); }, tone: "amber" };
  if (perLane <= 9) return { level: 4, get label() { return extra("extra3"); }, tone: "orange" };
  return { level: 5, get label() { return extra("extra4"); }, tone: "orange" };
}

/** A market or a city, without the catalog's noise: "Laredo Mkt (TX)" → "Laredo (TX)", "Silao, GJ 36100" → "Silao". */
export function placeName(market?: string, place?: string): string {
  const fromMarket = String(market ?? "").replace(/\s+(Mkt|Market)\b/gi, "").trim();
  if (fromMarket) return fromMarket;
  return String(place ?? "").split(",")[0].trim() || "—";
}

export function laneEnds(row: BoardRow) {
  return {
    from: placeName(row.lane?.origin_market, row.lane?.origin),
    to: placeName(row.lane?.destination_market, row.lane?.destination),
  };
}

/** The busiest corridors of the board, by offers and then by loads. */
export function corridors(rows: BoardRow[], top = 5) {
  const map = new Map<string, { label: string; offers: number; loads: number; lanes: number }>();
  for (const row of rows) {
    const { from, to } = laneEnds(row);
    const label = `${from} → ${to}`;
    const entry = map.get(label) ?? { label, offers: 0, loads: 0, lanes: 0 };
    entry.offers += row.quote_count ?? 0;
    entry.loads += Number(row.lane?.weekly_volume) || 0;
    entry.lanes += 1;
    map.set(label, entry);
  }
  return [...map.values()].sort((a, b) => b.offers - a.offers || b.loads - a.loads).slice(0, top);
}

/** The trailer when the lane names one ("Dry Van", "Reefer"), else the equipment. */
export function equipmentOf(row: BoardRow): string {
  return String(row.lane?.trailer || row.lane?.equipment || "").trim();
}

/** Search across folio, event, route, markets and equipment. */
export function matches(row: BoardRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    row.event?.rfx_id,
    row.event?.name,
    row.lane?.origin,
    row.lane?.destination,
    row.lane?.origin_market,
    row.lane?.destination_market,
    row.lane?.equipment,
    row.lane?.trailer,
    row.lane?.operation,
    row.lane?.service,
  ]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}

export interface InviteRequest {
  event_id: string;
  lane_id: string;
  company: string;
  contact_name?: string;
  email: string;
  phone?: string;
  notes?: string;
}

/**
 * Asks MARKSMAN for an invitation to ONE lane; it lands in the team's contact
 * history. The server accepts it only while the lane is live and answers
 * `duplicate` when this email already asked for that lane.
 */
export async function requestInvite(request: InviteRequest) {
  return await callRfxBidApi<{ requested?: boolean; duplicate?: boolean; message?: string }>(
    "public_bid_room_request_invite",
    { ...request, language: "es" },
  );
}

export interface InvitationLookup {
  matched?: number;
  matched_lane_ids?: string[];
  matched_event_ids?: string[];
  message?: string;
  sent?: boolean;
  rate_limited?: boolean;
  retry_after_seconds?: number;
  error?: string;
}

/**
 * "Buscar mis invitaciones": which lanes this email is invited to. With
 * `sendLinks` the server emails the private links to that address (at most
 * once every few minutes); without it nothing is sent.
 */
export async function findInvitations(email: string, sendLinks = false) {
  return await callRfxBidApi<InvitationLookup>("public_bid_room_find_invitations", {
    email,
    send_links: sendLinks,
    language: "es",
  });
}
