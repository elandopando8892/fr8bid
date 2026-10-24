import { OfferDetailDialog, type OfferSelection } from "./OfferDetailDialog";
import { OfferComparisonDialog } from "./OfferComparisonDialog";
import { comparisonOffers } from "./offer-presentation";
import { offerText } from "@/i18n/offer-detail";
import { tr } from "@/i18n/rfx-admin";
import { useLang, getLang } from "@/i18n/language";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "@/components/useAsync";
import { Empty, Kpis, Pill, money } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import { listEventHistory } from "./rfx.service";
import { lanesLive, operateKpis, recentRevisions, type BidState, type Delta, type Fx, type LaneLive, type LiveBid } from "./operate";
import type { LaneWithInvitations } from "./stages";
import { laneSegmentKey, termsLabel, termsOf, termsTone, type ConfirmationRow } from "./confirmations.service";

type Tab = "lanes" | "bids";

const STATE: Record<BidState, { label: string; className: string; hint?: string }> = {
  primary: { get label() { return tr("text001"); }, className: "op-state award", get hint() { return tr("text604"); } },
  backup: { get label() { return tr("text002"); }, className: "op-state award", get hint() { return tr("text605"); } },
  void: { get label() { return tr("text004"); }, className: "op-state void", get hint() { return tr("text606"); } },
  at_risk: { get label() { return tr("text607"); }, className: "op-state risk" },
  leader: { get label() { return tr("text608"); }, className: "op-state leader", get hint() { return tr("text609"); } },
  outbid: { get label() { return tr("text610"); }, className: "op-state text", get hint() { return tr("text611"); } },
  active: { get label() { return tr("text612"); }, className: "op-state text", get hint() { return tr("text613"); } },
};

const LANE_STATE: Record<LaneLive["state"], { label: string; tone: "indigo" | "" | "green" | "amber" }> = {
  awarded: { get label() { return tr("text614"); }, tone: "indigo" },
  void: { get label() { return tr("text004"); }, tone: "" },
  live: { get label() { return tr("text615"); }, tone: "green" },
  none: { get label() { return tr("text176"); }, tone: "amber" },
};

const route = (lane: LaneWithInvitations) =>
  `${String(lane.origin ?? "").trim() || "—"} → ${String(lane.destination ?? "").trim() || "—"}`;

const vendorOf = (o: Record<string, unknown>) => (o.vendors ?? {}) as Record<string, unknown>;

/** "Carrier A-17": the same carrier keeps the same code, from its id. */
function anonCode(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `Carrier ${String.fromCharCode(65 + (h % 26))}-${String(Math.floor(h / 26) % 100).padStart(2, "0")}`;
}

function deltaText(delta: Delta, currency: string): string {
  if (delta.kind === "new") return tr("text616");
  if (delta.kind === "captured") return tr("text617");
  if (delta.kind === "moved") return `${delta.amount < 0 ? "▼" : "▲"} ${money(Math.abs(delta.amount), currency)}`;
  return "—";
}

/** "hace 3 h" — how long since the carrier last answered. */
function ago(value: unknown, now: number): string {
  const at = Date.parse(String(value ?? ""));
  if (!Number.isFinite(at)) return "";
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return tr("text618");
  if (minutes < 60) return tr("text619", minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 48) return tr("text620", hours);
  return tr("text621", Math.round(hours / 24));
}

const ANON_KEY = "bidware:operate:anon";

/**
 * Operate (wireframe 03): the auction while it runs. The KPIs, the lanes and
 * every live offer with its rank, what moved in the last 15 minutes and where
 * it stands. Awarding lives in Close; this stage only watches and corrects.
 */
export function OperateStage({
  eventId,
  lanes,
  fx,
  confirmations,
  busy,
  canWork,
  onCapture,
  onAsk,
  onEditBid,
  onReject,
  onAward,
}: {
  eventId: string;
  lanes: LaneWithInvitations[];
  fx: Fx | null;
  /** The carriers' answers to the rubros (wireframe 21). */
  confirmations: ConfirmationRow[];
  busy: boolean;
  canWork: boolean;
  onCapture: () => void;
  onAsk: (lane?: LaneWithInvitations, invitation?: Record<string, unknown>) => void;
  onEditBid: (lane: LaneWithInvitations, invitation: Record<string, unknown>) => void;
  onReject: (invitation: Record<string, unknown>) => void;
  /** Goes to Close, where the awards are made. */
  onAward: () => void;
}) {
  useLang();
  const [offerDetail, setOfferDetail] = useState<OfferSelection | null>(null);
  const [comparisonLaneId, setComparisonLaneId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("bids");
  const [laneId, setLaneId] = useState<string>("");
  const [anon, setAnon] = useState(() => {
    try {
      return window.localStorage.getItem(ANON_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(ANON_KEY, anon ? "1" : "0");
    } catch {
      // Blocked storage: the choice lasts this visit.
    }
  }, [anon]);

  // Reread with every reload of the event, so the minutes stay current.
  const history = useAsync(() => listEventHistory(eventId), [eventId, lanes]);
  const now = useMemo(() => Date.now(), [getLang(), lanes, history.data]);
  const revisions = useMemo(() => recentRevisions(history.data ?? [], now), [getLang(), history.data, now]);
  const live = useMemo(() => lanesLive(lanes, fx, revisions, now), [getLang(), lanes, fx, revisions, now]);
  const kpis = useMemo(() => operateKpis(live, fx), [getLang(), live, fx]);
  const bids = useMemo(
    () => live.filter((l) => !laneId || l.lane.id === laneId).flatMap((l) => l.bids),
    [getLang(), live, laneId],
  );

  const carrierName = (bid: LiveBid) => {
    const id = String(bid.offer.vendor_id ?? bid.offer.id);
    if (anon) return anonCode(id);
    return String(vendorOf(bid.offer).vendor_name ?? vendorOf(bid.offer).domain ?? bid.offer.vendor_id ?? "—");
  };
  const comparisonLane = lanes.find(lane => lane.id === comparisonLaneId);
  const comparisonTarget = laneId ? lanes.find(lane => lane.id === laneId) : lanes.length === 1 ? lanes[0] : undefined;

  return (
    <div className="op">
      {offerDetail && <OfferDetailDialog selection={offerDetail} confirmations={confirmations} onClose={() => setOfferDetail(null)} />}
      {comparisonLane && <OfferComparisonDialog lane={comparisonLane} confirmations={confirmations} anonymous={anon} displayName={offer => anon ? anonCode(String(offer.vendor_id ?? offer.id)) : String(vendorOf(offer).vendor_name ?? vendorOf(offer).domain ?? offer.vendor_id ?? "—")} onClose={() => setComparisonLaneId(null)} />}
      <Kpis
        items={[
          { label: "Lanes", value: kpis.lanes },
          { label: tr("text622"), value: kpis.invited },
          { label: "Bids", value: kpis.bids, accent: true },
          { label: tr("text623"), value: kpis.coverage == null ? "—" : `${Math.round(kpis.coverage * 100)}%` },
          {
            label: tr("text624"),
            value: kpis.leaderAverage ? money(kpis.leaderAverage.value, kpis.leaderAverage.currency) : "—",
          },
        ]}
      />

      <nav className="op-tabs">
        <button className={tab === "lanes" ? "active" : undefined} onClick={() => setTab("lanes")}>
          Lanes
        </button>
        <button className={tab === "bids" ? "active" : undefined} onClick={() => setTab("bids")}>
          {tr("text625")}</button>
        <Link to={`/rfx/${eventId}/chat`}>Chat</Link>
        <button onClick={onAward}>{tr("text626")}</button>
      </nav>

      {tab === "lanes" && (
        <table className="data op-table">
          <thead>
            <tr>
              <th>Lane</th>
              <th>{tr("text622")}</th>
              <th>{tr("text083")}</th>
              <th>{tr("text627")}</th>
              <th>{tr("text628")}</th>
              <th>Target</th>
              <th>Vs target</th>
              <th>{tr("text282")}</th>
            </tr>
          </thead>
          <tbody>
            {live.map((l) => {
              const leader = l.bids.find((b) => b.rank === 1);
              const target = Number(l.lane.target_rate);
              return (
                <tr
                  key={l.lane.id}
                  className="clickable"
                  title={tr("text629")}
                  onClick={() => {
                    setLaneId(l.lane.id);
                    setTab("bids");
                  }}
                >
                  <td className="op-lane">
                    <span className="mono">L-{String(l.lane.lane_number ?? "—").padStart(3, "0")}</span> {route(l.lane)}
                  </td>
                  <td className="mono">{l.invited}</td>
                  <td className="mono">{l.bids.length}</td>
                  <td>{leader ? carrierName(leader) : "—"}</td>
                  <td className="mono">{leader ? money(leader.rate, leader.currency) : "—"}</td>
                  <td className="mono">{target > 0 ? money(target, String(l.lane.currency ?? "") || "USD") : "—"}</td>
                  <td className={`mono${l.vsTarget != null && l.vsTarget > 0 ? " op-over" : ""}`}>
                    {l.vsTarget == null ? "—" : `${l.vsTarget > 0 ? "+" : ""}${l.vsTarget.toFixed(1)}%`}
                  </td>
                  <td>
                    <Pill tone={LANE_STATE[l.state].tone}>{LANE_STATE[l.state].label}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {tab === "bids" && (
        <>
          <div className="op-bar">
            <button
              disabled={busy || !canWork || !lanes.length}
              title={canWork ? tr("text630") : NEED_REASON.operate}
              onClick={onCapture}
            >
              {tr("text568")}</button>
            <button
              disabled={busy || !canWork || !lanes.length}
              title={canWork ? tr("text631") : NEED_REASON.operate}
              onClick={() => onAsk()}
            >
              {tr("text632")}</button>
            <Link to={`/rfx/${eventId}/delivery?state=drafted`}>{offerText("drafts")}</Link>
            <button disabled={!comparisonTarget || comparisonOffers(comparisonTarget).length === 0} onClick={() => comparisonTarget && setComparisonLaneId(String(comparisonTarget.id))}>{offerText("compare")}</button>
            {lanes.length > 1 && !laneId && <span className="cell-sub">{offerText("comparisonChooseLane")}</span>}
            <select className="filter" value={laneId} onChange={(e) => setLaneId(e.target.value)}>
              <option value="">{tr("text633")}</option>
              {lanes.map((lane) => (
                <option key={lane.id} value={lane.id}>
                  L-{String(lane.lane_number ?? "—").padStart(3, "0")} · {route(lane)}
                </option>
              ))}
            </select>
            <label className="op-anon" title={tr("text634")}>
              <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> {tr("text635")}</label>
            <span className="op-note">
              {history.error ? tr("text636") : tr("text637")}
            </span>
          </div>

          {bids.length ? (
            <table className="data op-table">
              <thead>
                <tr>
                  <th>Lane</th>
                  <th>{anon ? "Carrier (anon)" : "Carrier"}</th>
                  <th>All-in</th>
                  <th>Rank</th>
                  <th>Δ 15 min</th>
                  <th>{tr("text282")}</th>
                  <th>{tr("text638")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bids.map((bid) => {
                  const invitation = bid.offer;
                  const state = STATE[bid.state];
                  const awarded = bid.state === "primary" || bid.state === "backup";
                  return (
                    <tr key={String(bid.offer.id)} className={bid.delta.kind !== "none" ? "op-fresh" : undefined}>
                      <td className="op-lane">{route(bid.lane)}</td>
                      <td title={ago(bid.offer.responded_at, now) ? tr("text639", ago(bid.offer.responded_at, now)) : undefined}>
                        {carrierName(bid)}
                        {bid.offer.response_source === "manual_operator" && <div className="cell-sub">{tr("text640")}</div>}
                      </td>
                      <td className="mono">{money(bid.rate, bid.currency)}</td>
                      <td className="mono">{bid.rank ? `#${bid.rank}` : "—"}</td>
                      <td className="mono">{deltaText(bid.delta, bid.currency)}</td>
                      <td>
                        <span className={state.className} title={bid.risk ?? state.hint}>
                          {state.label}
                        </span>
                      </td>
                      <td>
                        {(() => {
                          const terms = termsOf(confirmations, String(invitation.id ?? ""), String(invitation.vendor_id ?? ""), laneSegmentKey(bid.lane));
                          return (
                            <Pill tone={termsTone(terms)}>
                              <span title={terms.notes.join("\n") || (terms.answered ? tr("text182") : tr("text641"))}>
                                {terms.answered ? termsLabel(terms) : tr("text642")}
                              </span>
                            </Pill>
                          );
                        })()}
                      </td>
                      <td className="op-acts">
                        <button className="ne-link" onClick={() => setOfferDetail({ lane: bid.lane, invitation, displayName: carrierName(bid) })}>{offerText("view")}</button>
                        <button className="ne-link" disabled={busy || !canWork} onClick={() => onEditBid(bid.lane, invitation)}>
                          {tr("text086")}</button>
                        <button
                          className="ne-link"
                          disabled={busy || !canWork || awarded}
                          title={awarded ? tr("text643") : undefined}
                          onClick={() => onReject(invitation)}
                        >
                          {tr("text644")}</button>
                        <button className="ne-link" disabled={busy || !canWork} onClick={() => onAsk(bid.lane, invitation)}>
                          {tr("text645")}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty
              title={laneId ? tr("text646") : tr("text647")}
              hint={tr("text648")}
            />
          )}
        </>
      )}
    </div>
  );
}
