import { tr } from "@/i18n/rfx-admin";
import { locale } from "@/i18n/language";
import { isContacted, type LaneWithInvitations } from "./stages";

/**
 * The live auction as the team reads it (wireframe 03): who leads each lane,
 * who was just undercut, what moved in the last minutes. Everything derives
 * from list_rfx_detail plus the carriers' portal history; nothing is stored.
 */

type Row = Record<string, unknown>;

const text = (v: unknown) => String(v ?? "").trim();
const lower = (v: unknown) => text(v).toLowerCase();

/** The USD/MXN rate rateware sends with the detail (pesos per dollar), when it has one. */
export interface Fx {
  rate: number;
  rate_date: string | null;
}

export function fxOf(detail: Row | null | undefined): Fx | null {
  const fx = (detail?.comparison_fx ?? null) as Row | null;
  const rate = Number(fx?.rate);
  return fx && Number.isFinite(rate) && rate > 0 ? { rate, rate_date: text(fx.rate_date) || null } : null;
}

/** A priced offer still in play. A bid procurement rejects loses its rate, so it drops out by itself. */
export const isOffer = (i: Row) =>
  i.bid_rate != null && Number.isFinite(Number(i.bid_rate)) && lower(i.invitation_status) !== "archived";

export const currencyOf = (o: Row, lane?: Row) => (text(o.currency) || text(lane?.currency) || "USD").toUpperCase();

/**
 * One scale per lane: a lane that quotes in one currency compares as is; a
 * mixed lane compares in USD, pesos through the day's rate. Without a rate an
 * MXN offer can't be compared with a USD one and stays unranked — the public
 * board's own rule.
 */
function comparableRate(o: Row, lane: Row, fx: Fx | null, mixed: boolean): number | null {
  const rate = Number(o.bid_rate);
  if (!Number.isFinite(rate)) return null;
  if (!mixed) return rate;
  const currency = currencyOf(o, lane);
  if (currency === "USD") return rate;
  if (currency === "MXN" && fx) return rate / fx.rate;
  return null;
}

/** When the carrier last answered: its own timestamp, else the row's. */
const answeredAt = (o: Row) => {
  const at = Date.parse(text(o.responded_at) || text(o.updated_at));
  return Number.isFinite(at) ? at : 0;
};

/** The design's "Δ 15 MIN". */
export const WINDOW_MS = 15 * 60 * 1000;

export type Delta =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "moved"; amount: number }
  | { kind: "captured" };

/**
 * The carriers' own revisions inside the window, oldest first, keyed by
 * invitation. Every bid a carrier sends from its Bid Room leaves a portal
 * row with the offer it replaced (`metadata.before`).
 */
export function recentRevisions(history: Row[], now: number, windowMs = WINDOW_MS): Map<string, Row[]> {
  const byOffer = new Map<string, { at: number; row: Row }[]>();
  for (const row of history) {
    if (lower(row.channel) !== "portal" || lower(row.status) !== "quoted") continue;
    const at = Date.parse(text(row.occurred_at) || text(row.created_at));
    if (!Number.isFinite(at) || now - at > windowMs) continue;
    const id = text(((row.metadata ?? {}) as Row).rfx_lane_vendor_id);
    if (!id) continue;
    byOffer.set(id, [...(byOffer.get(id) ?? []), { at, row }]);
  }
  return new Map(
    [...byOffer].map(([id, list]) => [id, list.sort((a, b) => a.at - b.at).map((entry) => entry.row)]),
  );
}

/**
 * How the offer moved inside the window: against the offer it had when the
 * window opened. A capture by the team leaves no portal row, so all it can say
 * is that the offer was captured.
 */
export function deltaOf(o: Row, revisions: Row[] | undefined, now: number, windowMs = WINDOW_MS): Delta {
  if (revisions?.length) {
    const before = (((revisions[0].metadata ?? {}) as Row).before ?? {}) as Row;
    const start = before.bid_rate == null ? NaN : Number(before.bid_rate);
    const sameCurrency = !text(before.currency) || text(before.currency).toUpperCase() === currencyOf(o);
    if (!Number.isFinite(start) || !sameCurrency) return { kind: "new" };
    const amount = Number(o.bid_rate) - start;
    return Math.abs(amount) < 0.005 ? { kind: "none" } : { kind: "moved", amount };
  }
  if (lower(o.response_source) === "manual_operator" && now - answeredAt(o) <= windowMs) return { kind: "captured" };
  return { kind: "none" };
}

/** Why an offer may not hold: its validity ends within three days (or ended), or there is no unit. */
export function riskOf(o: Row, now: number, days = 3): string | null {
  if (o.equipment_available === false) return tr("text561");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(o.valid_through));
  if (!m) return null;
  const day = new Date(+m[1], +m[2] - 1, +m[3]);
  const end = new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59).getTime();
  const label = day.toLocaleDateString(locale(), { day: "numeric", month: "short" });
  if (end < now) return tr("text562", label);
  if (end - now <= days * 86_400_000) return tr("text563", label);
  return null;
}

export type BidState = "primary" | "backup" | "void" | "at_risk" | "leader" | "outbid" | "active";

export interface LiveBid {
  offer: Row;
  lane: LaneWithInvitations;
  rate: number;
  currency: string;
  /** 1 = best all-in of the lane; ties share it. Null when it can't be compared. */
  rank: number | null;
  state: BidState;
  risk: string | null;
  delta: Delta;
}

/**
 * A lane's offers, best first. The state reads in this order: an award, a
 * lane declared void, an offer that may not hold, the leader, one undercut
 * after its last bid ("Superado"), and the rest ("Activo").
 */
export function laneBids(
  lane: LaneWithInvitations,
  fx: Fx | null,
  revisions: Map<string, Row[]>,
  now: number,
): LiveBid[] {
  const offers = (lane.invitations ?? []).filter(isOffer);
  const mixed = new Set(offers.map((o) => currencyOf(o, lane))).size > 1;
  const scored = offers.map((offer) => ({ offer, score: comparableRate(offer, lane, fx, mixed) }));
  const ranked = scored.filter((s) => s.score != null).sort((a, b) => a.score! - b.score!);
  const rankOf = (score: number | null) => (score == null ? null : ranked.filter((r) => r.score! < score).length + 1);
  const voided = Boolean(lane.no_award_at);

  return scored
    .map(({ offer, score }): LiveBid => {
      const rank = rankOf(score);
      const role = lower(offer.award_role);
      const risk = riskOf(offer, now);
      const undercut =
        score != null && ranked.some((r) => r.score! < score && answeredAt(r.offer) > answeredAt(offer));
      const state: BidState =
        role === "primary"
          ? "primary"
          : role === "backup"
            ? "backup"
            : voided
              ? "void"
              : risk
                ? "at_risk"
                : rank === 1
                  ? "leader"
                  : undercut
                    ? "outbid"
                    : "active";
      return {
        offer,
        lane,
        rate: Number(offer.bid_rate),
        currency: currencyOf(offer, lane),
        rank,
        state,
        risk,
        delta: deltaOf(offer, revisions.get(text(offer.id)), now),
      };
    })
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.rate - b.rate);
}

export interface LaneLive {
  lane: LaneWithInvitations;
  bids: LiveBid[];
  /** Carriers the invitation actually reached. */
  invited: number;
  /** The leader against the lane's target, in %; negative is below target. */
  vsTarget: number | null;
  state: "awarded" | "void" | "live" | "none";
}

export function lanesLive(
  lanes: LaneWithInvitations[],
  fx: Fx | null,
  revisions: Map<string, Row[]>,
  now: number,
): LaneLive[] {
  return lanes.map((lane) => {
    const bids = laneBids(lane, fx, revisions, now);
    const leader = bids.find((b) => b.rank === 1) ?? null;
    const target = Number(lane.target_rate);
    const vsTarget =
      leader && Number.isFinite(target) && target > 0 && leader.currency === currencyOf({}, lane)
        ? ((leader.rate - target) / target) * 100
        : null;
    const awarded = bids.some((b) => b.state === "primary");
    return {
      lane,
      bids,
      invited: new Set((lane.invitations ?? []).filter(isContacted).map((i) => text(i.vendor_id) || text(i.id))).size,
      vsTarget,
      state: awarded ? "awarded" : lane.no_award_at ? "void" : bids.length ? "live" : "none",
    };
  });
}

export interface OperateKpis {
  lanes: number;
  /** Distinct carriers the invitations reached. */
  invited: number;
  bids: number;
  /** Share of the lanes still in play (not void) with at least one offer. */
  coverage: number | null;
  /** Average of each lane's best offer; null when currencies can't be put on one scale. */
  leaderAverage: { value: number; currency: string } | null;
}

export function operateKpis(live: LaneLive[], fx: Fx | null): OperateKpis {
  const inPlay = live.filter((l) => l.state !== "void");
  const leaders = live.map((l) => l.bids.find((b) => b.rank === 1)).filter((b): b is LiveBid => Boolean(b));
  const currencies = new Set(leaders.map((b) => b.currency));
  let leaderAverage: OperateKpis["leaderAverage"] = null;
  if (leaders.length && currencies.size === 1) {
    leaderAverage = { value: leaders.reduce((sum, b) => sum + b.rate, 0) / leaders.length, currency: leaders[0].currency };
  } else if (leaders.length && fx && [...currencies].every((c) => c === "USD" || c === "MXN")) {
    const usd = leaders.map((b) => (b.currency === "MXN" ? b.rate / fx.rate : b.rate));
    leaderAverage = { value: usd.reduce((sum, v) => sum + v, 0) / usd.length, currency: "USD" };
  }
  const invitations = live.flatMap((l) => l.lane.invitations ?? []);
  return {
    lanes: live.length,
    invited: new Set(invitations.filter(isContacted).map((i) => text(i.vendor_id) || text(i.id))).size,
    bids: live.reduce((sum, l) => sum + l.bids.length, 0),
    coverage: inPlay.length ? inPlay.filter((l) => l.bids.length > 0).length / inPlay.length : null,
    leaderAverage,
  };
}
