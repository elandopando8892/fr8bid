import { tr as queueTr } from "@/i18n/quote-queue";
import { tr } from "@/i18n/quotedesk";
import { useLang, getLang, formatCurrency } from "@/i18n/language";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { confirmAsync, promptAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { Dialog, ErrorBanner, InfoBanner, Pill, Spinner, TopBar, dateShort, money } from "@/components/ui";
import { pct, toNumber } from "./calc";
import { LaneEditor } from "./LaneEditor";
import { LaunchBidRoomDialog } from "./LaunchBidRoomDialog";
import { SendQuoteDialog } from "./SendQuoteDialog";
import { ClientFeeAcceptancePanel } from "./ClientFeeAcceptancePanel";
import {
  customerService,
  CHANNELS,
  STATUS_LABEL,
  STATUS_TONE,
  applyBidRoomAwards,
  getQuote,
  getQuoteContext,
  getStagingOptions,
  setQuoteStatus,
  updateQuote,
  type Currency,
  type QuoteDetail,
  type QuoteStatus,
} from "./quotedesk.service";

const NEW_LANE = "new";

const UNIT_WORD: Record<string, [string, string]> = {
  get hour(): [string, string] { return [tr("text209"), tr("text210")]; },
  get event(): [string, string] { return [tr("text211"), tr("text212")]; },
  get trip(): [string, string] { return [tr("text213"), tr("text214")]; },
  get day(): [string, string] { return [tr("text215"), tr("text216")]; },
  get mile(): [string, string] { return [tr("text217"), tr("text218")]; },
  get other(): [string, string] { return [tr("text219"), tr("text220")]; },
};

function placeName(city: string | null, state: string | null, label: string | null): string {
  return city ? [city, state].filter(Boolean).join(", ") : label ?? "";
}

/** Whole dollars when exact, cents otherwise: the shipper sees the stored price. */
function price(value: unknown, currency: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return formatCurrency(n, currency, {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Plain text the analyst pastes into the email to the shipper. */
function shipperText(detail: QuoteDetail): string {
  const { quote, lanes } = detail;
  const lines = [
    tr("text221", quote.folio, quote.title ? ` · ${quote.title}` : ""),
    tr("text222", quote.shipper_name ?? ""),
    quote.valid_until ? tr("text223", dateShort(quote.valid_until)) : "",
    "",
  ];
  for (const lane of lanes) {
    lines.push(
      `${lane.lane_number}. ${placeName(lane.origin_city, lane.origin_state, lane.origin)} → ` +
        placeName(lane.destination_city, lane.destination_state, lane.destination) +
        (lane.equipment ? ` · ${lane.equipment}` : "") +
        (lane.service ? ` · ${customerService(lane.service)}` : ""),
    );
    lines.push(tr("text224", price(lane.all_in_rate, quote.currency), quote.currency));
    for (const acc of lane.accessorials ?? []) {
      const [one, many] = UNIT_WORD[acc.unit] ?? UNIT_WORD.other;
      lines.push(tr("text225", acc.label, acc.quantity, acc.quantity === 1 ? one : many, price(acc.rate, quote.currency)));
    }
  }
  lines.push("", tr("text226"));
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n");
}

export function QuoteDetailPage() {
  useLang();
  const { id = "" } = useParams();
  // Archiving and restoring are an Administrador's; the other moves are everyone's work.
  const { can, roleLoaded } = useAuth();
  const detail = useAsync(() => getQuote(id), [id]);
  const context = useAsync(getQuoteContext, []);
  const options = useAsync(getStagingOptions, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showText, setShowText] = useState(false);
  const navigate = useNavigate();
  const [emailing, setEmailing] = useState(false);
  // Route to show once the reload that contains it arrives (e.g. just saved).
  const pendingLane = useRef<string | null>(null);

  const data = detail.data;
  const quote = data?.quote;
  const lanes = data?.lanes ?? [];

  useEffect(() => {
    // While reloading, data is the previous snapshot and may not contain a
    // route that was just saved; wait until a snapshot includes it.
    if (!data || detail.loading) return;
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
  }, [data, selected, detail.loading]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const lane = lanes.find((l) => l.id === selected) ?? null;
  const locked = !quote || ["won", "lost", "expired", "archived"].includes(quote.status);
  const allPriced = lanes.length > 0 && lanes.every((l) => toNumber(l.all_in_rate) !== null);
  const awardsCount = useMemo(() => Object.keys(data?.awards ?? {}).length, [getLang(), data]);

  async function pickLane(next: string) {
    if (next === selected) return;
    if (dirty && !(await confirmAsync(tr("text227")))) return;
    setDirty(false);
    setSelected(next);
  }

  async function move(status: QuoteStatus, message: string, askReason = false) {
    if (!quote) return;
    let reason: string | undefined;
    if (askReason) {
      const answer = await promptAsync(message, "");
      if (answer === null) return;
      reason = answer;
    } else if (!(await confirmAsync(message))) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await setQuoteStatus(quote.id, status, reason);
      setNotice(tr("text228", quote.folio, STATUS_LABEL[status]));
      detail.reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function bringAwards() {
    if (!quote) return;
    const ok = await confirmAsync(
      tr("text229") +
        tr("text230"),
    );
    if (!ok) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await applyBidRoomAwards(quote.id);
      setNotice(
        res.applied
          ? tr("text231", res.applied)
          : tr("text232"),
      );
      detail.reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (detail.loading && !data) return <Spinner label={tr("text233")} />;
  if (detail.error && !data) {
    return (
      <main className="main">
        <ErrorBanner message={detail.error} />
        <Link to="/quotedesk" className="btn">
          ← QuoteDesk
        </Link>
      </main>
    );
  }
  if (!data || !quote) return null;

  const channelLabel = CHANNELS.find((c) => c.key === quote.channel)?.label ?? quote.channel;
  const fx = toNumber(quote.fx_usd_mxn);

  const actions: { label: string; run: () => void; primary?: boolean; secondary?: boolean; disabled?: boolean; title?: string }[] = [];
  const s = quote.status;
  if (["new", "estimating", "bid_room", "expired"].includes(s)) {
    actions.push({
      label: tr("text234"),
      disabled: !allPriced || dirty,
      title: allPriced ? undefined : tr("text235"),
      run: () =>
        move("quoted", tr("text236", quote.folio)),
    });
  }
  if (!quote.rfx_event_id && ["new", "estimating", "quoted"].includes(s)) {
    actions.push({
      label: tr("text120"),
      disabled: !lanes.length || dirty,
      title: lanes.length ? undefined : tr("text237"),
      run: () => setLaunching(true),
    });
  }
  if (["quoted", "bid_room"].includes(s)) {
    actions.push({ label: tr("text155"), run: () => move("won", tr("text238", quote.folio)) });
  }
  if (["new", "estimating", "quoted", "bid_room"].includes(s)) {
    actions.push({ label: tr("text156"), secondary: true, run: () => move("lost", tr("text239"), true) });
  }
  if (s === "quoted") {
    actions.push({ label: tr("text157"), secondary: true, run: () => move("expired", tr("text240", quote.folio)) });
  }
  if (["won", "lost", "expired"].includes(s)) {
    actions.push({
      label: tr("text241"),
      run: () =>
        move(s === "won" ? "quoted" : "estimating", tr("text242", quote.folio)),
    });
  }
  const adminOnly = can("admin") ? {} : { disabled: true, title: NEED_REASON.admin };
  if (s !== "archived") {
    actions.push({
      label: tr("text243"),
      secondary: true,
      ...adminOnly,
      run: () => move("archived", tr("text244", quote.folio)),
    });
  } else {
    actions.push({
      label: tr("text245"),
      primary: true,
      ...adminOnly,
      run: () => move("new", tr("text246", quote.folio)),
    });
  }

  const actionButton = (a: (typeof actions)[number]) => (
    <button
      key={a.label}
      className={a.primary ? "primary" : undefined}
      disabled={busy || a.disabled}
      title={a.title}
      onClick={a.run}
    >
      {a.label}
    </button>
  );

  return (
    <>
      <TopBar
        title={`${quote.folio} · ${quote.shipper_name ?? "Shipper"}`}
        sub={quote.title || tr("text247")}
        actions={
          <Link to="/quotedesk" className="btn">
            ← QuoteDesk
          </Link>
        }
      />
      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          {notice && <InfoBanner>{notice}</InfoBanner>}
          {actionError && <ErrorBanner message={actionError} />}
          {detail.error && (
            // A reload that fails keeps the previous snapshot on screen: say so instead of showing it as current.
            <div className="row" style={{ gap: 8 }}>
              <ErrorBanner message={tr("text248", detail.error)} />
              <button onClick={detail.reload} disabled={detail.loading}>
                {detail.loading ? tr("text249") : tr("text122")}
              </button>
            </div>
          )}

          <section className="card qd-header">
            <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
              <Pill tone={STATUS_TONE[quote.status]}>{STATUS_LABEL[quote.status].toUpperCase()}</Pill>
              <span className="qd-muted">
                {quote.quote_type === "spot" ? "Spot" : tr("text145")} {tr("text250")}{channelLabel}
                {quote.requested_by ? tr("text251", quote.requested_by) : ""} · {quote.currency}
                {fx ? tr("text252", fx.toFixed(2), dateShort(quote.fx_rate_date)) : ""}
                {quote.valid_until ? tr("text253", dateShort(quote.valid_until)) : ""}
              </span>
            </div>
            {/* One row: the next step first, the rest of the pipeline, then «Más» for edits and exits. */}
            <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <button
                className={allPriced && ["new", "estimating", "bid_room"].includes(quote.status) ? "primary" : undefined}
                onClick={() => setEmailing(true)}
                disabled={!allPriced || locked || dirty || !roleLoaded || !can("operate")}
                title={allPriced ? undefined : tr("text235")}
              >
                {queueTr("prepare")}</button>
              {actions.filter((a) => !a.secondary).map(actionButton)}
              <button onClick={() => setShowText(true)} disabled={!allPriced}>
                {tr("text256")}</button>
              <Link className="btn" to={`/quotedesk/${quote.id}/delivery`}>{queueTr("link")}</Link>
              <details className="qd-more">
                <summary className="btn">{tr("text325")} ▾</summary>
                <div
                  className="qd-more-menu"
                  // Picking an item closes the menu, as any dropdown does.
                  onClick={(e) => ((e.currentTarget.parentElement as HTMLDetailsElement).open = false)}
                >
                  <button onClick={() => setEditing(true)} disabled={busy}>
                    {tr("text254")}</button>
                  {actions.filter((a) => a.secondary).map(actionButton)}
                </div>
              </details>
            </div>
            {quote.outcome_reason && <p className="qd-muted qd-small">{tr("text257")}{quote.outcome_reason}</p>}
            {quote.notes && <p className="qd-muted qd-small">{quote.notes}</p>}
          </section>

          {data.event && (
            <div className="banner info qd-event">
              <b>{tr("text258")}</b>
              <span>
                {data.event.name || data.event.rfx_id} · {String(data.event.event_type || "").toUpperCase()} ·{" "}
                {String(data.event.status || "").toUpperCase()}
                {awardsCount ? tr("text259", awardsCount) : tr("text260")}
              </span>
              <div className="spacer" />
              <Link to={`/rfx/${data.event.id}`} className="btn">
                {tr("text261")}</Link>
              <button onClick={bringAwards} disabled={busy || !awardsCount || locked}>
                {tr("text262")}</button>
            </div>
          )}

          <div className="qd-summary-bar">
            <div>
              <span>{tr("text263")}</span>
              <strong>{data.summary.lane_count}</strong>
            </div>
            <div>
              <span>{tr("text264")}</span>
              <strong>{money(data.summary.base_cost_total + data.summary.accessorials_total, quote.currency)}</strong>
            </div>
            <div>
              <span>All-in total</span>
              <strong className="accent">{money(data.summary.all_in_total, quote.currency)}</strong>
            </div>
            <div>
              <span>{tr("text015")}</span>
              <strong className="good">
                {pct(data.summary.margin_pct)} · {money(data.summary.margin_total, quote.currency)}
              </strong>
            </div>
          </div>

          <div className="tabs qd-lane-tabs">
            {lanes.map((l) => (
              <button key={l.id} className={selected === l.id ? "active" : undefined} onClick={() => pickLane(l.id)}>
                {l.lane_number}. {l.origin_city || l.origin || "?"} → {l.destination_city || l.destination || "?"}
              </button>
            ))}
            {!locked && (
              <button className={selected === NEW_LANE ? "active" : undefined} onClick={() => pickLane(NEW_LANE)}>
                {tr("text265")}</button>
            )}
          </div>

          {selected && selected !== NEW_LANE && !lane && <Spinner label={tr("text266")} />}
          {selected && (selected === NEW_LANE || lane) && (
            <LaneEditor
              key={`${selected}-${lane?.updated_at ?? ""}`}
              quote={quote}
              lane={selected === NEW_LANE ? null : lane}
              context={context.data}
              options={options.data}
              award={lane?.rfx_lane_id ? data.awards[lane.rfx_lane_id] ?? null : null}
              locked={locked}
              onDirtyChange={setDirty}
              onSaved={(laneId) => {
                setDirty(false);
                pendingLane.current = laneId;
                setSelected(laneId);
                setNotice(tr("text267"));
                detail.reload();
              }}
              onDeleted={() => {
                setDirty(false);
                setSelected(null);
                setNotice(tr("text268"));
                detail.reload();
              }}
            />
          )}
          {context.error && <ErrorBanner message={tr("text208", context.error)} />}
          {quote.rfx_event_id && roleLoaded && can('operate') && (
            <ClientFeeAcceptancePanel key={quote.id} canOperate={can('operate')}
              scopeKey={`${quote.id}:${quote.rfx_event_id}`} />
          )}
        </div>
      </main>

      {launching && (
        <LaunchBidRoomDialog
          quote={quote}
          lanes={lanes}
          onClose={() => {
            setLaunching(false);
            // Once more on the way out, so the page shows the event even if the first refresh lost a race.
            detail.reload();
          }}
          onLaunched={() => detail.reload()}
        />
      )}
      {editing && (
        <EditQuoteDialog
          detail={data}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice(tr("text269"));
            detail.reload();
          }}
        />
      )}
      {emailing && (
        <SendQuoteDialog
          quote={quote}
          mailboxConnected={context.data?.email?.connected}
          onClose={() => setEmailing(false)}
          onPrepared={() => {
            setEmailing(false);
            setNotice(queueTr("prepared"));
            navigate(`/quotedesk/${quote.id}/delivery`);
          }}
        />
      )}
      {showText && (
        <Dialog title={tr("text256")} onClose={() => setShowText(false)}>
          <p className="qd-muted qd-small" style={{ marginTop: 0 }}>
            {tr("text270")}</p>
          <textarea className="mono" rows={14} readOnly value={shipperText(data)} style={{ width: "100%" }} />
          <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
            <button
              className="primary"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(shipperText(data))
                  .then(() => setNotice(tr("text271")))
                  .catch(() => setNotice(tr("text272")))
              }
            >
              {tr("text273")}</button>
          </div>
        </Dialog>
      )}
      {busy && <div className="qd-busy" aria-hidden />}
    </>
  );
}

function EditQuoteDialog({
  detail,
  onClose,
  onSaved,
}: {
  detail: QuoteDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLang();
  const { quote, lanes } = detail;
  const [title, setTitle] = useState(quote.title ?? "");
  const [quoteType, setQuoteType] = useState(quote.quote_type);
  const [channel, setChannel] = useState(quote.channel);
  const [requestedBy, setRequestedBy] = useState(quote.requested_by ?? "");
  const [currency, setCurrency] = useState<Currency>(quote.currency);
  const [validUntil, setValidUntil] = useState(quote.valid_until ?? "");
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCosts = lanes.some((l) => toNumber(l.base_cost) !== null || toNumber(l.accessorials_total));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateQuote(quote.id, {
        title: title.trim() || null,
        quote_type: quoteType,
        channel,
        requested_by: requestedBy.trim() || null,
        currency,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={tr("text274", quote.folio)}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>{tr("text002")}</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? tr("text092") : tr("text275")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <label className="field">
          <span>{tr("text276")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="qd-three">
          <label className="field">
            <span>{tr("text144")}</span>
            <select value={quoteType} onChange={(e) => setQuoteType(e.target.value as "spot" | "contract")}>
              <option value="spot">Spot</option>
              <option value="contract">{tr("text145")}</option>
            </select>
          </label>
          <label className="field">
            <span>{tr("text146")}</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{tr("text148")}</span>
            <select value={currency} disabled={hasCosts} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
            </select>
          </label>
        </div>
        {hasCosts && <p className="qd-muted qd-small">{tr("text277")}</p>}
        <div className="qd-two">
          <label className="field">
            <span>{tr("text147")}</span>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
          </label>
          <label className="field">
            <span>{tr("text149")}</span>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>{tr("text150")}</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="qd-error">{error}</p>}
      </div>
    </Dialog>
  );
}
