import { words, tr, queueRefreshText, batchText, deliveryText } from "@/i18n/outreach";
import { useLang } from "@/i18n/language";
import { confirmAsync, type ConfirmLabels } from "@/components/confirm";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import {
  canDelete,
  canApproveMessage,
  canMark,
  deleteOutreachMessages,
  deliveryLabel,
  getQueueSummary,
  listQueuePage,
  markOutreachMessages,
  mergeReviewedOutreachMessage,
  outreachReviewEvidence,
  MARK_OPTIONS,
  queueStateOf,
  QUEUE_PAGE_SIZE,
  listAllQueueDrafts,
  sendOutreachMessages,
  TRACKING_LABEL,
  type BulkResult,
  type MarkStatus,
  type OutreachMessage,
  type QueueChannel,
  type QueueState,
  type TrackingState,
} from "./outreach.service";
import { fetchRfxDetail } from "@/features/rfx-admin/rfx.service";
import { useAsync } from "@/components/useAsync";
import { newOperationId } from "@/lib/operation-id";
import { planSendBatches, runSendBatches, waitBetweenBatches, type BatchProgress } from "./send-batches";
import { Spinner, ErrorBanner, InfoBanner, Empty, Pill } from "@/components/ui";
import { LaunchHeader, LaunchTabs } from "./LaunchShell";
import { listContactReviews } from "./review.service";
import { MessageReviewDialog } from "./MessageReviewDialog";
import { outreachVendorName } from "./outreach.service";
import { tr as reviewText } from "@/i18n/outreach-review";
import { WhatsappPendingEvidence, WhatsappQueueStatus, WhatsappQueueStep } from "./WhatsappDeliveryPanel";

type Tone = "" | "green" | "red" | "indigo" | "amber";
type QueueFacts = {
  summary: Awaited<ReturnType<typeof getQueueSummary>>;
  drafts: Awaited<ReturnType<typeof listQueuePage>>;
};

const STATE_PILL: Record<QueueState, { tone: Tone; label: string }> = {
  ready: { tone: "green", get label() { return tr("text058"); } },
  blocked: { tone: "red", get label() { return tr("text059"); } },
  queued: { tone: "amber", get label() { return deliveryText("queued"); } },
  sending: { tone: "amber", get label() { return deliveryText("sending"); } },
  sent: { tone: "indigo", get label() { return tr("text060"); } },
  bounced: { tone: "amber", get label() { return tr("text061"); } },
  failed: { tone: "red", get label() { return tr("text062"); } },
  unknown: { tone: "", get label() { return tr("text063"); } },
  archived: { tone: "", get label() { return tr("text064"); } },
};

/** The row's tint: blocked in red, what already left in grey. */
const ROW_CLASS: Partial<Record<QueueState, string>> = {
  blocked: "dq-blocked",
  sent: "dq-done",
  unknown: "dq-done",
  archived: "dq-done",
  bounced: "dq-bounced",
  failed: "dq-bounced",
};

/** The states with a filter of their own, in the order a message moves. */
const STATE_ORDER: TrackingState[] = [
  "drafted", "queued", "sending", "sent", "delivered", "read", "manual_sent", "delivery_unknown",
  "replied", "quoted", "failed", "bounced", "suppressed", "archived",
];


/** "3 archivado(s), 1 sin cambio (reason)" out of what the server reports. */
function outcome(result: BulkResult, verb: string) {
  const reasons = [
    ...new Set([...(result.failures ?? []), ...(result.skipped_rows ?? [])].map((f) => f.reason).filter(Boolean)),
  ];
  const unchanged = (result.failures?.length ?? 0) + (result.skipped ?? 0);
  return (
    `${result.updated ?? result.removed ?? 0} ${verb}` +
    (unchanged ? tr("text065", unchanged) : "") +
    (reasons.length ? ` (${reasons.join("; ")})` : "")
  );
}

/**
 * Delivery queue (wireframe 18): the only place anything is sent. Drafts from
 * Message wait here; a person picks them and approves the send explicitly.
 */
export function DeliveryQueuePage() {
  const { id = "" } = useParams();
  const { user, role } = useAuth();
  // Reads, selections and pending work belong to one identity and event.
  const organization = user?.app_metadata?.rateware_organization_id || user?.app_metadata?.organization_id || "personal";
  return <DeliveryQueueContent key={`${user?.id ?? "anonymous"}:${organization}:${role}:${id}`} />;
}

function DeliveryQueueContent() {
  useLang();
  const { id = "" } = useParams();
  const { user, can, roleLoaded } = useAuth();
  const scope = `${user?.id}:${user?.app_metadata?.rateware_organization_id || user?.app_metadata?.organization_id || "personal"}:${id}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedMessage = searchParams.get("message");
  const [reviewMessage, setReviewMessage] = useState<{ id: string; scope: string } | null>(() => linkedMessage && /^[0-9a-f-]{36}$/i.test(linkedMessage) ? { id: linkedMessage, scope } : null);
  const canWork = roleLoaded && can("operate");
  const lockedTitle = canWork ? undefined : NEED_REASON.operate;
  const active = useRef(true);
  const allowed = useRef(canWork);
  allowed.current = canWork;
  const actionLocked = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const live = () => active.current && allowed.current;

  const [channel, setChannel] = useState<QueueChannel>("all");
  const [state, setState] = useState<TrackingState | null>(() => searchParams.get("state") === "drafted" ? "drafted" : null);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  // Kept by id so a selection can span pages.
  const [selected, setSelected] = useState<Map<string, OutreachMessage>>(new Map());
  // Minimal delivery evidence from explicit reviews, pinned to a message version.
  const [reviewEvidence, setReviewEvidence] = useState<Map<string, OutreachMessage>>(new Map());
  useEffect(() => {
    const expirations = [...reviewEvidence.values()].map(m => m.whatsapp_approval?.expires_at).filter((v): v is number => typeof v === "number");
    if (!expirations.length) return;
    const timer = window.setTimeout(() => setReviewEvidence(prev => new Map([...prev].filter(([, m]) =>
      !m.whatsapp_approval || m.whatsapp_approval.expires_at > Date.now()))), Math.max(0, Math.min(...expirations) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [reviewEvidence]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [evidenceRefresh, setEvidenceRefresh] = useState(0);
  const operationIds = useRef(new Map<string, string>());
  const stopRequested = useRef(false);
  const [intervalMinutes, setIntervalMinutes] = useState<1 | 5>(1);
  const [progress, setProgress] = useState<BatchProgress | null>(null);

  const detail = useAsync(() => fetchRfxDetail(id), [id]);
  // Filters and pagination only change the visible page, not event totals.
  // This component is already scoped to one identity, role and event.
  const facts = useRef<{ channel: QueueChannel; read: Promise<QueueFacts> } | null>(null);
  // Publish one complete queue read. Independently refreshed sources could
  // otherwise mix sent rows with the previous draft/ready counters.
  const queue = useAsync(
    async () => {
      if (!facts.current || facts.current.channel !== channel) {
        facts.current = {
          channel,
          read: Promise.all([
            getQueueSummary(id, channel),
            listAllQueueDrafts(id, channel, () => active.current),
          ]).then(([summary, drafts]) => ({ summary, drafts })),
        };
      }
      const [{ summary, drafts }, page] = await Promise.all([
        facts.current.read,
        listQueuePage({ eventId: id, channel, state, search, offset }),
      ]);
      return { summary, page, drafts };
    },
    [id, channel, state, search, offset],
  );
  // Old data is not actionable during refresh or after a failed read.
  const currentQueue = queue.loading || queue.error ? null : queue.data;
  allowed.current = canWork && Boolean(currentQueue);
  const summary = { data: currentQueue?.summary ?? null, error: queue.error };
  const page = { data: currentQueue?.page ?? null, loading: queue.loading };
  const drafts = { data: currentQueue?.drafts ?? null };
  const rows = page.data?.rows ?? [];
  const total = page.data?.total ?? 0;
  const states = summary.data?.states ?? {};
  const count = (...keys: TrackingState[]) => keys.reduce((sum, k) => sum + Number(states[k] ?? 0), 0);
  const draftRows = drafts.data?.rows ?? [];
  const readyDrafts = useMemo(() => draftRows.filter((m) => queueStateOf(m).state === "ready"), [draftRows]);
  const blockedDrafts = draftRows.length - readyDrafts.length;
  const scanCapped = (drafts.data?.total ?? 0) > draftRows.length;
  // Who confirmed which contact (Revisión). Not required to send; the queue says how many aren't.
  const reviews = useAsync(() => listContactReviews(id), [id]);
  const reviewed = useMemo(
    () => new Set((reviews.data ?? []).filter((r) => r.reviewed).map((r) => r.vendor_id)),
    [reviews.data],
  );
  const readyCarriers = useMemo(
    () => [...new Set(readyDrafts.map((m) => m.vendor_id).filter((v): v is string => Boolean(v)))],
    [readyDrafts],
  );
  const unreviewedReady = readyCarriers.filter((v) => !reviewed.has(v)).length;
  const sentSoFar = count("sent", "delivered", "read", "manual_sent", "replied", "quoted");

  // Another event's queue (the route stays mounted) starts with nothing selected.
  useEffect(() => {
    setSelected(new Map());
    setReviewEvidence(new Map());
    setOffset(0);
    setNotice(null);
  }, [scope]);
  useEffect(() => {
    setReviewMessage(linkedMessage && /^[0-9a-f-]{36}$/i.test(linkedMessage) ? { id: linkedMessage, scope } : null);
  }, [scope, linkedMessage]);

  // After archiving or deleting, the last page can come back empty.
  useEffect(() => {
    if (!page.loading && page.data && !rows.length && offset > 0 && total > 0) {
      setOffset(Math.floor((total - 1) / QUEUE_PAGE_SIZE) * QUEUE_PAGE_SIZE);
    }
  }, [page.loading, page.data, rows.length, offset, total]);

  /** A new filter is a new list: first page, nothing selected. */
  function filter(change: () => void) {
    if (actionLocked.current) return;
    change();
    setOffset(0);
    setSelected(new Map());
    setReviewEvidence(new Map());
    setNotice(null);
  }

  function refresh() {
    setEvidenceRefresh(value => value + 1);
    setReviewEvidence(new Map());
    facts.current = null;
    queue.reload();
    reviews.reload();
  }

  // Keep an explicit retry's selection, but use refreshed row states. Pending
  // or failed reads must never make an old selection actionable.
  const freshMessages = useMemo(
    () => new Map([...draftRows, ...rows].map((m) => [m.id, m])),
    [draftRows, rows],
  );
  const chosen = currentQueue
    ? [...selected.values()].map((m) => mergeReviewedOutreachMessage(freshMessages.get(m.id) ?? m, reviewEvidence.get(m.id)))
    : [];

  /** Keeps a scoped review's evidence; it never selects or sends anything. */
  function onReviewed(row: OutreachMessage) {
    const review = reviewMessage;
    if (!active.current || !allowed.current || !currentQueue || busy || actionLocked.current) return;
    if (!review || review.scope !== scope || review.id !== row.id || row.rfx_event_id !== id) return;
    setReviewEvidence((prev) => new Map(prev).set(row.id, outreachReviewEvidence(row)));
  }

  function forget(ids: string[]) {
    setReviewEvidence((prev) => {
      const next = new Map(prev);
      for (const key of ids) next.delete(key);
      return next;
    });
  }
  const readyEmail = chosen.filter((m) => m.channel === "email" && canApproveMessage(m));
  const readyWhatsapp = chosen.filter((m) => m.channel === "whatsapp" && canApproveMessage(m));
  const sendable = readyEmail.length + readyWhatsapp.length;
  const archivable = chosen.filter((m) => canMark(m, "archived"));
  const deletable = chosen.filter(canDelete);
  const allOnPage = rows.length > 0 && rows.every((m) => selected.has(m.id));
  const blockedChosen = chosen.filter((m) => queueStateOf(m).state === "blocked").length;

  function toggle(m: OutreachMessage) {
    if (actionLocked.current) return;
    if (selected.has(m.id)) forget([m.id]);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(m.id)) next.delete(m.id);
      else next.set(m.id, m);
      return next;
    });
  }

  function togglePage() {
    if (actionLocked.current) return;
    if (allOnPage) forget(rows.map((m) => m.id));
    setSelected((prev) => {
      const next = new Map(prev);
      for (const m of rows) {
        if (allOnPage) next.delete(m.id);
        else next.set(m.id, m);
      }
      return next;
    });
  }

  function selectReady() {
    if (actionLocked.current) return;
    setReviewEvidence(new Map());
    setSelected(new Map(readyDrafts.map((m) => [m.id, m])));
  }

  /** Runs one change on the selection, then clears it and reloads. */
  async function run(work: () => Promise<string>) {
    if (!live() || actionLocked.current) return;
    actionLocked.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = await work();
      if (live()) {
        setNotice(result);
        setSelected(new Map());
      }
    } catch (e) {
      if (live()) setNotice(tr("text066", (e as Error).message));
    } finally {
      actionLocked.current = false;
      if (active.current) {
        setBusy(false);
        refresh();
      }
    }
  }

  // ConfirmHost lives at the root: its promise can outlive this queue.
  async function confirmChange(message: string, labels?: ConfirmLabels) {
    if (!live() || actionLocked.current) return false;
    actionLocked.current = true;
    setBusy(true);
    try {
      return (await confirmAsync(message, labels)) && live();
    } finally {
      actionLocked.current = false;
      if (active.current) setBusy(false);
    }
  }

  /**
   * The gate: an explicit, human decision, never something that fires on load.
   * Freeze approved IDs, pace exact payloads and never retry automatically.
   */
  async function send() {
    if (!sendable) return;
    let batches: ReturnType<typeof planSendBatches>;
    try {
      batches = planSendBatches([...readyEmail, ...readyWhatsapp], operationIds.current, newOperationId);
    } catch {
      setNotice(readyWhatsapp.length ? reviewText("whatsappRefresh") : batchText("version"));
      return;
    }
    const parts = [
      readyEmail.length ? tr("text067", readyEmail.length) : "",
      readyWhatsapp.length ? tr("text068", readyWhatsapp.length) : "",
    ].filter(Boolean);
    const skipped = chosen.length - sendable;
    const unreviewed = new Set(
      [...readyEmail, ...readyWhatsapp].map((m) => m.vendor_id).filter((v): v is string => typeof v === "string" && !reviewed.has(v)),
    ).size;
    const ok = await confirmChange(
      tr("text069", parts.join(tr("text070"))) +
        (skipped ? tr("text071", skipped) : "") +
        (reviews.data && unreviewed
          ? tr("text072", unreviewed)
          : "") +
        tr("text073") + batchText("confirm", batches.length, intervalMinutes),
      { ok: tr("text074") },
    );
    if (!ok) return;
    await run(async () => {
      stopRequested.current = false;
      const isCurrent = () => live() && !stopRequested.current;
      const execute = async () => {
        const result = await runSendBatches({
          batches, intervalMinutes, isCurrent,
          send: sendOutreachMessages,
          wait: ms => waitBetweenBatches(ms, isCurrent),
          onProgress: value => { if (active.current) setProgress(value); },
        });
        // Retain operation IDs on uncertain outcomes. Durable server claims also
        // prevent duplicate sends across reloads and independent sessions.
        const error = result.error && /OUTREACH_(VERSION_CONFLICT|APPROVAL_REQUIRED|APPROVAL_EXPIRED)/.test(result.error)
          ? batches.some(batch => batch.channel === "whatsapp") ? reviewText("whatsappRefresh") : batchText("version") : result.error;
        return batchText(result.status, result.sent) + (error ? ` ${error}` : "");
      };
      try {
        if (navigator.locks) {
          return await navigator.locks.request("bidware-outreach-send", { ifAvailable: true }, async lock => {
            if (!lock) throw new Error(batchText("another"));
            return execute();
          });
        }
        return await execute();
      } finally {
        if (active.current) setProgress(null);
      }
    });
  }

  /** Records a status the message reached outside Bidware; nothing is sent. */
  async function mark(status: MarkStatus) {
    const label = MARK_OPTIONS.find((o) => o.status === status)?.label ?? status;
    const eligible = chosen.filter((m) => canMark(m, status));
    if (!eligible.length) {
      setNotice(tr("text079", chosen.length, label));
      return;
    }
    const left = chosen.length - eligible.length;
    const ok = await confirmChange(
      tr("text080", eligible.length, label) +
        (left ? tr("text081", left) : "") +
        tr("text082"),
    );
    if (!ok) return;
    await run(async () => {
      // The server refuses a status change that mixes channels, so one call per channel.
      const byChannel = new Map<string, string[]>();
      for (const m of eligible) {
        const ch = String(m.channel || "");
        byChannel.set(ch, [...(byChannel.get(ch) ?? []), m.id]);
      }
      const parts: string[] = [];
      for (const [ch, ids] of byChannel) {
        if (!live()) break;
        const res = await markOutreachMessages(ids, status, ch || undefined);
        parts.push(outcome(res, tr("text083", label)));
      }
      return parts.join(" · ") + ".";
    });
  }

  /** Takes messages out of the active queue; what the carrier got stays on record. */
  async function archive() {
    if (!archivable.length) return;
    const ok = await confirmChange(
      tr("text084", archivable.length),
    );
    if (!ok) return;
    await run(async () => outcome(await markOutreachMessages(archivable.map((m) => m.id), "archived"), words("word2")) + ".");
  }

  /** Deletes drafts that never went out. */
  async function remove() {
    if (!deletable.length) return;
    const left = chosen.length - deletable.length;
    const ok = await confirmChange(
      tr("text085", deletable.length) +
        (left ? tr("text086", left) : "") +
        tr("text087"),
    );
    if (!ok) return;
    await run(async () => outcome(await deleteOutreachMessages(deletable.map((m) => m.id)), words("word3")) + ".");
  }

  const from = total ? offset + 1 : 0;
  const to = offset + rows.length;
  const sendLabel = tr("text088", sendable);
  const sendTitle = lockedTitle;

  return (
    <>
      <LaunchHeader
        eventId={id}
        event={detail.data?.event}
        title={tr("text090")}
        tags={
          <>
            <Pill tone="blue">LAUNCH</Pill>
            <Pill tone="orange">{tr("text091")}</Pill>
          </>
        }
        actions={
          <>
            <button type="button" onClick={refresh} disabled={busy}>
              {tr("text092")}</button>
            <button
              type="button"
              className="primary"
              disabled={!sendable || busy || !canWork}
              title={sendTitle}
              onClick={send}
            >
              {busy ? tr("text093") : sendLabel}
            </button>
          </>
        }
      />
      <main className="main launch-main">
        <LaunchTabs eventId={id} active="delivery" />

        <div className="dq-gate">
          <b>{tr("text094")}</b>
          <span>
            {currentQueue ? <>
              {sentSoFar
                ? tr("text095", sentSoFar === 1 ? tr("text096") : tr("text097", sentSoFar))
                : tr("text098")}
              {tr("text099")}
            </> : queueRefreshText(queue.loading ? "updating" : "unavailable")}</span>
        </div>

        {reviews.data && drafts.data && readyCarriers.length > 0 && (
          <div className={`dq-review ${unreviewedReady ? "warn" : "ok"}`}>
            <b>{tr("text100")}</b>
            <span>
              {unreviewedReady
                ? tr("text101", unreviewedReady, readyCarriers.length) +
                  tr("text102")
                : tr("text103", readyCarriers.length)}
            </span>
            {unreviewedReady > 0 && <Link to={`/rfx/${id}/review`}>{tr("text104")}</Link>}
          </div>
        )}
        {reviews.error && <InfoBanner>{tr("text105")}{reviews.error}</InfoBanner>}

        {notice && <InfoBanner>{notice}</InfoBanner>}
        <div className="dq-review">
          <label>{batchText("interval")} {" "}
            <select disabled={busy} value={intervalMinutes} onChange={e => setIntervalMinutes(Number(e.target.value) as 1 | 5)}>
              <option value={1}>{batchText("one")}</option>
              <option value={5}>{batchText("five")}</option>
            </select>
          </label>
          <span>{batchText("help")}</span>
        </div>


        <div className="dq-kpis">
          <div>
            <span>{tr("text106")}</span>
            <strong>{summary.data ? count("drafted", "queued") : "—"}</strong>
          </div>
          <div>
            <span>{tr("text107")}</span>
            <strong className="ok">{drafts.data ? `${readyDrafts.length}${scanCapped ? "+" : ""}` : "—"}</strong>
          </div>
          <div>
            <span>{tr("text108")}</span>
            <strong className="bad">{drafts.data ? `${blockedDrafts}${scanCapped ? "+" : ""}` : "—"}</strong>
          </div>
          <div>
            <span>{tr("text109")}</span>
            <strong>{summary.data ? sentSoFar : "—"}</strong>
          </div>
          <div>
            <span>{tr("text110")}</span>
            <strong>{summary.data ? count("replied", "quoted") : "—"}</strong>
          </div>
          <div>
            <span>{tr("text111")}</span>
            <strong className="warn">{summary.data ? count("bounced", "failed") : "—"}</strong>
          </div>
        </div>
        {summary.error && <ErrorBanner message={summary.error} />}

        <div className="dq-filters">
          <select className="filter" disabled={busy} value={channel} onChange={(e) => filter(() => setChannel(e.target.value as QueueChannel))}>
            <option value="all">{tr("text112")}</option>
            <option value="email">{tr("text113")}</option>
            <option value="whatsapp">{tr("text114")}</option>
          </select>
          <select
            className="filter"
            disabled={busy}
            value={state ?? ""}
            onChange={(e) => filter(() => setState((e.target.value || null) as TrackingState | null))}
          >
            <option value="">{tr("text115")}</option>
            {STATE_ORDER.filter((s) => Number(states[s] ?? 0) > 0).map((s) => (
              <option key={s} value={s}>
                {tr("text116")}{TRACKING_LABEL[s]} ({states[s]})
              </option>
            ))}
          </select>
          <input
            className="filter-search"
            disabled={busy}
            placeholder={tr("text117")}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && filter(() => setSearch(searchText.trim()))}
          />
          <div className="spacer" />
          <button type="button" className="link" disabled={busy || !readyDrafts.length} onClick={selectReady}>
            {tr("text118")}{readyDrafts.length})
          </button>
          <button type="button" className="link muted" disabled={busy || !selected.size} onClick={() => { setSelected(new Map()); setReviewEvidence(new Map()); }}>
            {tr("text119")}</button>
        </div>

        {channel !== "email" && <WhatsappPendingEvidence key={scope} scope={scope} refreshKey={evidenceRefresh} onLinked={refresh} />}

        {page.loading ? (
          <Spinner label={tr("text120")} />
        ) : queue.error ? null : rows.length ? (
          <div className="dq-table">
            <table className="data fixed">
              <colgroup>
                <col style={{ width: 40 }} />
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 230 }} />
                <col style={{ width: 70 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 170 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="dq-check"
                      disabled={busy}
                      aria-label={tr("text121")}
                      checked={allOnPage}
                      onChange={togglePage}
                    />
                  </th>
                  <th>Carrier</th>
                  <th>{tr("text042")}</th>
                  <th>{tr("text038")}</th>
                  <th>{tr("text122")}</th>
                  <th>{tr("text123")}</th>
                  <th>{tr("text124")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const { state: queueState, reason } = queueStateOf(m);
                  const pill = STATE_PILL[queueState];
                  const tracking = m.tracking_state as TrackingState | null | undefined;
                  const vendor = outreachVendorName(m);
                  const contact = m.recipient_email || m.recipient_phone;
                  const language = m.whatsapp_template_language || (m.metadata?.language as string | undefined);
                  const reviewedMessage = mergeReviewedOutreachMessage(m, reviewEvidence.get(m.id));
                  return (
                    <tr key={m.id} className={`${ROW_CLASS[queueState] ?? ""}${selected.has(m.id) ? " picked" : ""}`}>
                      <td>
                        <input
                          type="checkbox"
                          className="dq-check"
                      disabled={busy}
                          aria-label={tr("text125", vendor || contact || words("word4"))}
                          checked={selected.has(m.id)}
                          onChange={() => toggle(m)}
                        />
                      </td>
                      <td className="ellipsis" title={String(vendor ?? "")}>
                        <b className="dq-vendor">{vendor || "—"}</b>
                        {m.subject && <div className="cell-sub ellipsis">{m.subject}</div>}
                        <button type="button" disabled={busy} onClick={() => { forget([m.id]); setReviewMessage({ id: m.id, scope }); }}>{reviewText("review")}</button>
                      </td>
                      <td>
                        <Pill tone={m.channel === "whatsapp" ? "green" : "blue"}>{m.channel === "whatsapp" ? "WA" : "Email"}</Pill>
                      </td>
                      <td className="mono ellipsis" title={contact || undefined}>
                        {contact || <span className="dq-missing">{tr("text126")}</span>}
                      </td>
                      <td className="mono">{language ? String(language).slice(0, 2).toUpperCase() : "—"}</td>
                      <td>
                        {m.channel === "whatsapp" ? <WhatsappQueueStatus message={reviewedMessage} /> : <Pill tone={pill.tone}>{pill.label}</Pill>}
                        {m.channel !== "whatsapp" && tracking && tracking !== m.status && TRACKING_LABEL[tracking] && (
                          <div className="cell-sub">{tr("text127")}{TRACKING_LABEL[tracking].toLowerCase()}</div>
                        )}
                      </td>
                      <td className={m.channel === "whatsapp" ? "dq-reason" : `mono ${reason ? "dq-reason" : ""}`}>
                        {m.channel === "whatsapp" ? <WhatsappQueueStep message={reviewedMessage} /> : reason || deliveryLabel(m)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="dq-pager">
              <span>
                {from}–{to}{tr("text034")}{total}
              </span>
              <div className="spacer" />
              <button type="button" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - QUEUE_PAGE_SIZE))}>
                {tr("text128")}</button>
              <button type="button" disabled={busy || !page.data?.has_more} onClick={() => setOffset(offset + QUEUE_PAGE_SIZE)}>
                {tr("text129")}</button>
            </div>
          </div>
        ) : (
          <Empty
            title={state || search ? tr("text130") : tr("text131")}
            hint={state || search ? tr("text132") : tr("text133")}
          />
        )}

        <footer className="dq-bar">
          {progress ? <>
            <div className="grow" role="status">{progress.phase === "waiting"
              ? batchText("waiting", intervalMinutes, progress.batch, progress.batches, progress.sent, progress.total)
              : batchText("sending", progress.batch, progress.batches, progress.sent, progress.total)}</div>
            <button type="button" onClick={() => { stopRequested.current = true; }}>{batchText("stop")}</button>
          </> : <>

          <div className="grow">
            <b>
              {selected.size}{tr("text134", selected.size === 1 ? "" : "s")}{tr("text135")}</b>
            <small>
              {blockedChosen
                ? tr("text136", blockedChosen, blockedChosen === 1 ? "" : "s")
                : tr("text138")}
            </small>
          </div>
          <select
            className="filter"
            value=""
            disabled={!selected.size || busy || !canWork || !currentQueue}
            title={lockedTitle}
            onChange={(e) => e.target.value && mark(e.target.value as MarkStatus)}
          >
            <option value="">{tr("text139")}</option>
            {MARK_OPTIONS.map((o) => (
              <option key={o.status} value={o.status}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" disabled={!archivable.length || busy || !canWork} title={lockedTitle} onClick={archive}>
            {tr("text140")}{archivable.length})
          </button>
          <button
            type="button"
            disabled={!deletable.length || busy || !canWork}
            title={lockedTitle ?? tr("text141")}
            onClick={remove}
          >
            {tr("text142")}{deletable.length})
          </button>
          <button
            type="button"
            className="primary dq-send"
            disabled={!sendable || busy || !canWork}
            title={sendTitle}
            onClick={send}
          >
            {busy ? tr("text093") : sendLabel}
          </button>
          </>}
        </footer>
      </main>
      {reviewMessage?.scope === scope && <MessageReviewDialog key={`${scope}:${reviewMessage.id}`} eventId={id} messageId={reviewMessage.id} onReviewed={onReviewed} onClose={() => { setReviewMessage(null); setSearchParams({}, { replace: true }); }} />}
    </>
  );
}
