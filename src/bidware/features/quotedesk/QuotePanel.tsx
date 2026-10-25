import { locale } from "@/i18n/language";
import { tr as queueTr } from "@/i18n/quote-queue";
import { tr } from "@/i18n/quotedesk";
import { useLang, getLang } from "@/i18n/language";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { ErrorBanner, InfoBanner, Pill, Spinner, money } from "@/components/ui";
import { pct, toNumber } from "./calc";
import { LaneEditor } from "./LaneEditor";
import { LaunchBidRoomDialog } from "./LaunchBidRoomDialog";
import { SendQuoteDialog } from "./SendQuoteDialog";
import {
  STATUS_LABEL,
  STATUS_TONE,
  getQuote,
  type QuoteContext,
  type QuoteLane,
  type StagingOptions,
} from "./quotedesk.service";

const NEW_LANE = "new";
const CLOSED = ["won", "lost", "expired", "archived"];

/** "Monterrey" for MX, "Laredo, TX" for US/CA: the way the team says a lane. */
function shortPlace(lane: QuoteLane, side: "origin" | "destination"): string {
  const city = lane[`${side}_city`];
  const state = lane[`${side}_state`];
  const country = String(lane[`${side}_country`] ?? "").toUpperCase();
  if (!city) return lane[side] ?? "?";
  return country === "MX" ? city : [city, state].filter(Boolean).join(", ");
}

/** "Monterrey → Laredo, TX · Reefer 53' · 24 cargas/sem" (wireframe 07). */
export function laneSummary(lane: QuoteLane | null | undefined): string {
  if (!lane) return tr("text201");
  const volume = toNumber(lane.weekly_volume);
  return [
    `${shortPlace(lane, "origin")} → ${shortPlace(lane, "destination")}`,
    lane.trailer || lane.equipment,
    volume ? tr("text278", volume.toLocaleString(locale())) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The right column of the QuoteDesk (wireframe 07): the chosen quote, its
 * stamped rubrics and the FCM drivers and cost components of one of its lanes,
 * editable in place. The full page (/quotedesk/:id) keeps the rest: status
 * moves, editing the quote's data, the shipper text and email history.
 */
export function QuotePanel({
  quoteId,
  context,
  options,
  onChanged,
  onDirtyChange,
}: {
  quoteId: string;
  context: QuoteContext | null;
  options: StagingOptions | null;
  /** The quote's numbers changed: the list should refresh. */
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  useLang();
  const { can, roleLoaded } = useAuth();
  const detail = useAsync(() => getQuote(quoteId), [quoteId]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [launching, setLaunching] = useState<"spot" | "bid" | null>(null);
  const navigate = useNavigate();
  const [emailing, setEmailing] = useState(false);
  // Route to show once the reload that contains it arrives (e.g. just saved).
  const pendingLane = useRef<string | null>(null);

  const data = detail.data;
  const quote = data?.quote;
  const lanes = useMemo(() => data?.lanes ?? [], [getLang(), data]);

  useEffect(() => {
    setSelected(null);
    setDirty(false);
    setNotice(null);
    pendingLane.current = null;
  }, [quoteId]);

  useEffect(() => {
    // While reloading, data is the previous snapshot and may not contain a
    // route that was just saved; wait until a snapshot includes it.
    if (!data || detail.loading || data.quote.id !== quoteId) return;
    if (pendingLane.current) {
      if (data.lanes.some((l) => l.id === pendingLane.current)) {
        setSelected(pendingLane.current);
        pendingLane.current = null;
      }
      return;
    }
    if (selected === NEW_LANE) return;
    if (!selected || !data.lanes.some((l) => l.id === selected)) {
      setSelected(data.lanes[0]?.id ?? NEW_LANE);
    }
  }, [data, selected, detail.loading, quoteId]);

  const markDirty = (next: boolean) => {
    setDirty(next);
    onDirtyChange(next);
  };

  async function pickLane(next: string) {
    if (next === selected) return;
    if (dirty && !(await confirmAsync(tr("text227")))) return;
    markDirty(false);
    setSelected(next);
  }

  if (detail.loading && (!data || data.quote.id !== quoteId)) return <Spinner label={tr("text233")} />;
  if (detail.error && !data) return <ErrorBanner message={detail.error} />;
  if (!data || !quote || quote.id !== quoteId) return null;

  const lane = lanes.find((l) => l.id === selected) ?? null;
  const locked = CLOSED.includes(quote.status);
  const allPriced = lanes.length > 0 && lanes.every((l) => toNumber(l.all_in_rate) !== null);
  const canLaunch = !quote.rfx_event_id && ["new", "estimating", "quoted"].includes(quote.status);
  const stale = !detail.loading && detail.error;

  return (
    <div className="qd-side-body">
      <div className="qd-side-head">
        <div>
          <h2>
            {quote.folio} · {quote.shipper_name ?? "Shipper"}
          </h2>
          <p className="qd-side-sub mono">{laneSummary(lanes[0])}</p>
        </div>
        <Pill tone={STATUS_TONE[quote.status]}>{STATUS_LABEL[quote.status].toUpperCase()}</Pill>
        <Link to={`/quotedesk/${quote.id}`} className="btn" title={tr("text285")}>
          {tr("text286")}</Link>
      </div>

      {notice && <InfoBanner>{notice}</InfoBanner>}
      {stale && <ErrorBanner message={tr("text287", detail.error)} />}

      {data.event && (
        <div className="banner info qd-event">
          <b>{tr("text258")}</b>
          <span>
            {data.event.name || data.event.rfx_id} · {String(data.event.status || "").toUpperCase()}
          </span>
          <div className="spacer" />
          <Link to={`/rfx/${data.event.id}`} className="btn">
            {tr("text261")}</Link>
        </div>
      )}

      {(lanes.length > 1 || (!locked && lanes.length > 0)) && (
        <div className="tabs qd-lane-tabs">
          {lanes.map((l) => (
            <button
              key={l.id}
              className={selected === l.id ? "active" : undefined}
              onClick={() => pickLane(l.id)}
            >
              {l.lane_number}. {shortPlace(l, "origin")} → {shortPlace(l, "destination")}
            </button>
          ))}
          {!locked && (
            <button
              className={selected === NEW_LANE ? "active" : undefined}
              onClick={() => pickLane(NEW_LANE)}
            >
              {tr("text265")}</button>
          )}
        </div>
      )}

      {selected && selected !== NEW_LANE && !lane && <Spinner label={tr("text266")} />}
      {selected && (selected === NEW_LANE || lane) && (
        <LaneEditor
          key={`${quote.id}-${selected}-${lane?.updated_at ?? ""}`}
          quote={quote}
          lane={selected === NEW_LANE ? null : lane}
          context={context}
          options={options}
          award={lane?.rfx_lane_id ? data.awards[lane.rfx_lane_id] ?? null : null}
          locked={locked}
          onDirtyChange={markDirty}
          onSaved={(laneId) => {
            markDirty(false);
            pendingLane.current = laneId;
            setSelected(laneId);
            setNotice(tr("text267"));
            detail.reload();
            onChanged();
          }}
          onDeleted={() => {
            markDirty(false);
            setSelected(null);
            setNotice(tr("text268"));
            detail.reload();
            onChanged();
          }}
        />
      )}

      <div className="qd-side-totals">
        <span>
          {data.summary.lane_count} {tr("text291")}{data.summary.lane_count === 1 ? "" : "s"} · all-in{" "}
          {money(data.summary.all_in_total, quote.currency)}
        </span>
        <strong className="qd-good">{pct(data.summary.margin_pct)}</strong>
      </div>

      <div className="qd-side-actions">
        <button
          className={allPriced && !locked ? "primary" : undefined}
          disabled={!allPriced || locked || dirty || !roleLoaded || !can("operate")}
          title={
            dirty ? tr("text292") : allPriced ? undefined : tr("text235")
          }
          onClick={() => setEmailing(true)}
        >
          {queueTr("prepare")}</button>
        <Link className="btn" to={`/quotedesk/${quote.id}/delivery`}>{queueTr("link")}</Link>
        {canLaunch && (
          <div className="qd-side-launch">
            <button disabled={!lanes.length || dirty} onClick={() => setLaunching("spot")}>
              → Bid Room: Spot
            </button>
            <button disabled={!lanes.length || dirty} onClick={() => setLaunching("bid")}>
              → Bid Room: Mini-bid
            </button>
          </div>
        )}
      </div>

      {launching && (
        <LaunchBidRoomDialog
          quote={quote}
          lanes={lanes}
          initialKind={launching}
          onClose={() => {
            setLaunching(null);
            detail.reload();
            onChanged();
          }}
          onLaunched={() => {
            detail.reload();
            onChanged();
          }}
        />
      )}
      {emailing && (
        <SendQuoteDialog
          quote={quote}
          mailboxConnected={context?.email?.connected}
          onClose={() => setEmailing(false)}
          onPrepared={() => {
            setEmailing(false);
            setNotice(queueTr("prepared"));
            navigate(`/quotedesk/${quote.id}/delivery`);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
