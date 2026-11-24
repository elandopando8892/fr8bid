import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty, Pill, money } from "@/components/ui";
import { locale, useLang } from "@/i18n/language";
import { q } from "@/i18n/bid-room-quote";
import { o } from "@/i18n/bid-room-overview";
import { SCORE_FACTORS, canQuote, getLaneBoard, laneState, type BookLane, type LiveBoard } from "./bidroom.service";

/**
 * "Mi ranking" (wireframe 27): where the carrier stands on each lane it quoted.
 *
 * The server builds one board per lane and only for that lane's token, so each
 * quoted lane is read with its own token. Unquoted lanes are NOT read: the
 * first read stamps a lane as viewed on MARKSMAN's side, and opening this tab
 * must not make every lane look viewed. Everything competitors reveal (rank,
 * names, amounts, the exact distance) is already filtered by the server per
 * the event's mode.
 */

type Tone = "" | "green" | "blue" | "amber";
type BoardState = { board: LiveBoard | null; error: string | null };

const route = (lane: BookLane) => `${String(lane.origin ?? "—")} → ${String(lane.destination ?? "—")}`;

function signalOf(lane: BookLane, board: LiveBoard | null, mode: string): { label: string; tone: Tone; sub: string } {
  const state = laneState(lane);
  if (state === "awarded") return { label: o("sig.awarded"), tone: "green", sub: o("sig.awardedSub") };
  if (state === "backup") return { label: o("sig.backup"), tone: "blue", sub: o("sig.backupSub") };
  if (state === "not_awarded") return { label: o("sig.notAwarded"), tone: "", sub: o("sig.notAwardedSub") };
  if (state === "declined") return { label: o("sig.declined"), tone: "", sub: o("sig.declinedSub") };
  if (lane.bid_rate == null) return { label: o("sig.unquoted"), tone: "", sub: o("sig.unquotedSub") };
  if (!board) return { label: "…", tone: "", sub: o("sig.loadingSub") };
  if (mode === "private") return { label: o("sig.sent"), tone: "", sub: o("sig.sentSub") };
  const place = !board.current_rank
    ? ""
    : board.bid_count
      ? o("sig.placeOf", board.current_rank, board.bid_count)
      : o("sig.place", board.current_rank);
  if (board.current_rank === 1) return { label: o("sig.leader"), tone: "green", sub: place || o("sig.leaderSub") };
  if (board.current_score_bucket === "needs_review") return { label: o("sig.far"), tone: "amber", sub: place || o("sig.farSub") };
  return { label: o("sig.competitive"), tone: "green", sub: place || o("sig.competitiveSub") };
}

/** The distance to the lowest offer: exact only on an open leaderboard, a range otherwise. */
type Distance = { value: string; sub: string; /** "4.8" on an open board: how far above the lowest offer. */ pct?: string };
function distanceOf(lane: BookLane, board: LiveBoard | null, mode: string): Distance {
  const currency = String(lane.currency || board?.currency || "USD");
  if (lane.bid_rate == null) return { value: "—", sub: o("dist.noOffer") };
  if (!board) return { value: "…", sub: "" };
  if (mode === "private") return { value: "—", sub: o("dist.notShared") };
  const delta = board.delta_to_leader;
  if (delta != null) {
    if (delta <= 0) return { value: money(0, currency), sub: o("dist.lowest") };
    const mine = board.rows?.find((r) => r.is_current)?.amount ?? Number(lane.bid_rate);
    const best = Number(mine) - delta;
    if (best <= 0) return { value: `+${money(delta, currency)}`, sub: o("dist.above") };
    const pct = ((delta / best) * 100).toFixed(1);
    return { value: `+${money(delta, currency)}`, sub: o("dist.pctAbove", pct), pct };
  }
  switch (board.delta_bucket) {
    case "leading":
      return { value: money(0, currency), sub: o("dist.lowest") };
    case "within_250":
      return { value: `< ${money(250, currency)}`, sub: o("dist.fromLowest") };
    case "within_500":
      return { value: `< ${money(500, currency)}`, sub: o("dist.fromLowest") };
    case "above_500":
      return { value: `> ${money(500, currency)}`, sub: o("dist.fromLowest") };
    default:
      return { value: "—", sub: o("dist.nobody") };
  }
}

/** "+$820 · 4.8 %" on an open board, the range otherwise. */
function distanceCell(d: Distance): string {
  return d.pct ? `${d.value} · ${d.pct} %` : d.value;
}

function scoreOf(board: LiveBoard | null, mode: string): { value: string; sub: string } {
  if (mode === "private") return { value: "—", sub: o("score.private") };
  if (!board || board.current_score == null) return { value: "—", sub: "" };
  if (board.current_rank === 1) return { value: String(board.current_score), sub: o("score.best") };
  return {
    value: String(board.current_score),
    sub: board.leader_score != null ? o("score.leaderAt", board.leader_score) : "",
  };
}

export function MyRanking({
  lanes,
  mode,
  onComplete,
}: {
  lanes: BookLane[];
  /** The event's bid_visibility_mode. */
  mode: string;
  /** Opens the quote panel on this lane, with the score fields in view. */
  onComplete: (lane: BookLane) => void;
}) {
  useLang();
  const quoted = useMemo(() => lanes.filter((l) => l.bid_rate != null && l.invitation_token), [lanes]);
  const [boards, setBoards] = useState<Record<string, BoardState>>({});
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!quoted.length) return;
    setLoading(true);
    const entries = await Promise.all(
      quoted.map(async (lane) => {
        try {
          return [lane.rfx_lane_id, { board: await getLaneBoard(String(lane.invitation_token)), error: null }] as const;
        } catch (e) {
          return [lane.rfx_lane_id, { board: null, error: (e as Error).message }] as const;
        }
      }),
    );
    setBoards(Object.fromEntries(entries));
    setLoadedAt(new Date());
    setLoading(false);
  }, [quoted]);

  // The server suggests a refresh cadence; boards move as competitors bid.
  const refreshSeconds = Math.max(
    15,
    Object.values(boards).find((b) => b.board?.visibility?.refresh_seconds)?.board?.visibility?.refresh_seconds ?? 30,
  );
  useEffect(() => {
    load();
    const id = window.setInterval(load, refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [load, refreshSeconds]);

  if (!lanes.length) return <Empty title={q("page.emptyTitle")} />;

  const selected = lanes.find((l) => l.rfx_lane_id === picked) ?? quoted[0] ?? lanes[0];
  const board = boards[selected.rfx_lane_id]?.board ?? null;
  const signal = signalOf(selected, board, mode);
  const distance = distanceOf(selected, board, mode);
  const score = scoreOf(board, mode);
  const factors = SCORE_FACTORS.map((f) => ({
    key: f.key,
    label: o(`factor.${f.key}.label`),
    hint: o(`factor.${f.key}.hint`),
    ok: f.done(selected),
  }));
  const pending = factors.filter((f) => !f.ok).length + (selected.bid_rate == null ? 1 : 0);
  const rows = board?.rows ?? [];

  return (
    <div className="croom-body">
      <div className="croom-main">
        <div className="croom-kpis">
          <div className="croom-kpis-lane">
            {selected.lane_number != null ? o("rank.lane", String(selected.lane_number)) : ""}
            {route(selected)}
          </div>
          <div>
            <span>{o("rank.signal")}</span>
            <strong className="signal">{signal.label}</strong>
            <small>{signal.sub}</small>
          </div>
          <div>
            <span>{o("rank.distance")}</span>
            <strong>{distance.value}</strong>
            <small>{distance.sub}</small>
          </div>
          <div>
            <span>{o("rank.score")}</span>
            <strong>{score.value}</strong>
            <small>{score.sub}</small>
          </div>
          <div>
            <span>{o("rank.quoted")}</span>
            <strong>{o("biz.count", quoted.length, lanes.length)}</strong>
            <small>{o("rank.unquotedCount", lanes.length - quoted.length)}</small>
          </div>
        </div>

        <div className="croom-table">
          <table className="data fixed">
            <colgroup>
              <col />
              <col style={{ width: 120 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                <th>{o("rank.colLane")}</th>
                <th>{o("rank.colOffer")}</th>
                <th>{o("rank.colVsBest")}</th>
                <th>{o("rank.colScore")}</th>
                <th>{o("rank.colSignal")}</th>
              </tr>
            </thead>
            <tbody>
              {lanes.map((lane) => {
                const state = boards[lane.rfx_lane_id];
                const b = state?.board ?? null;
                const s = signalOf(lane, b, mode);
                const d = distanceOf(lane, b, mode);
                return (
                  <tr
                    key={lane.rfx_lane_id}
                    className={`clickable${lane.rfx_lane_id === selected.rfx_lane_id ? " picked" : ""}`}
                    onClick={() => setPicked(lane.rfx_lane_id)}
                  >
                    <td className="ellipsis" title={route(lane)}>
                      {lane.lane_number != null && <span className="croom-num">{String(lane.lane_number)}</span>}
                      <span className="croom-route">{route(lane)}</span>
                    </td>
                    <td className="mono">{lane.bid_rate != null ? money(lane.bid_rate, String(lane.currency || "USD")) : "—"}</td>
                    <td className="mono croom-soft" title={state?.error ?? undefined}>
                      {state?.error ? o("dist.unavailable") : distanceCell(d)}
                    </td>
                    <td className="mono">{mode !== "private" && b?.current_score != null ? b.current_score : "—"}</td>
                    <td>
                      <Pill tone={s.tone}>{s.label.toUpperCase()}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {quoted.length > 0 && (
            <div className="croom-table-foot">
              <span>
                {loadedAt
                  ? o("rank.updated", loadedAt.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }), refreshSeconds)
                  : o("rank.loading")}
              </span>
              <div className="spacer" />
              <button type="button" className="link" disabled={loading} onClick={load}>
                {loading ? o("rank.refreshing") : o("rank.refresh")}
              </button>
            </div>
          )}
        </div>

        {mode === "open_leaderboard" && rows.length > 1 && (
          <div className="croom-table">
            <table className="data fixed">
              <colgroup>
                <col style={{ width: 70 }} />
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{o("rank.colPlace")}</th>
                  <th>{o("rank.colCarrier", route(selected))}</th>
                  <th>{o("rank.colBid")}</th>
                  <th>{o("rank.colScore")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rank} className={r.is_current ? "picked" : undefined}>
                    <td className="mono">#{r.rank}</td>
                    <td className="ellipsis">{r.is_current ? o("rank.you") : r.bidder}</td>
                    <td className="mono">{r.amount != null ? money(r.amount, String(r.currency || selected.currency || "USD")) : "—"}</td>
                    <td className="mono">{r.marketplace_score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section className="croom-card">
          <header className="croom-card-head">
            <b className="grow">{o("raise.title")}</b>
            <Pill tone={pending ? "amber" : "green"}>{pending ? o(pending === 1 ? "raise.pendingOne" : "raise.pendingMany", pending) : o("raise.complete")}</Pill>
          </header>
          <div className={`croom-check-row${selected.bid_rate != null ? " ok" : ""}`}>
            <span className="mark">{selected.bid_rate != null ? "✓" : "○"}</span>
            <span className="grow">{o("raise.rate")}</span>
            <span className="hint ayuda">{selected.bid_rate != null ? o("raise.rateOk") : o("raise.rateMissing")}</span>
          </div>
          {factors.map((f) => (
            <div key={f.key} className={`croom-check-row${f.ok ? " ok" : ""}`}>
              <span className="mark">{f.ok ? "✓" : "○"}</span>
              <span className="grow">{f.label}</span>
              <span className="hint ayuda">{f.hint}</span>
            </div>
          ))}
          <div className="croom-card-foot">
            {canQuote(selected) ? (
              <>
                <div className="spacer" />
                <button type="button" className="primary" onClick={() => onComplete(selected)}>
                  {selected.bid_rate != null ? o("raise.completeOffer") : o("raise.quoteLane")}
                </button>
              </>
            ) : (
              <span className="croom-soft">{o("raise.noChanges")}</span>
            )}
          </div>
        </section>
      </div>

      <aside className="croom-side">
        {mode === "private" ? (
          <>
            <div className="croom-eyebrow">{o("side.privateEyebrow")}</div>
            <div className="croom-box">
              <b>{o("side.privateTitle")}</b>
              <p>{o("side.privateText")}</p>
            </div>
          </>
        ) : (
          <>
            {/* Solo a quien no ha cotizado (decisión de Jose, 6-nov). */}
            {quoted.length === 0 && (
              <>
                <div className="croom-eyebrow">{o("side.unquotedEyebrow")}</div>
                <div className="croom-box">
                  <b>{o("side.lockedTitle")}</b>
                  <p>{o("side.lockedText")}</p>
                </div>
              </>
            )}
            <div className="croom-eyebrow ayuda">{o("side.notOnlyPrice")}</div>
            <p className="croom-side-text ayuda">{o("side.notOnlyPriceText")}</p>
          </>
        )}
        <div className="croom-box amber">
          <b>{o("side.closeTitle")}</b>
          <p>{o("side.closeText")}</p>
        </div>
      </aside>
    </div>
  );
}
