import { tr } from "@/i18n/rfx-admin";
import { useLang, locale, getLang } from "@/i18n/language";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync, promptAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { Dialog, Empty, ErrorBanner, InfoBanner, Pill, Spinner, TopBar, dateShort } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import {
  applyBidFromChat,
  authorOf,
  listEventChat,
  postChatMessage,
  startEventThread,
  threadAction,
  THREAD_AUDIENCE,
  THREAD_SEES,
  type ChatThread,
  type ThreadAction,
  type ThreadType,
} from "./chat.service";
import { fetchRfxDetail } from "./rfx.service";
import type { LaneWithInvitations } from "./stages";

const filters = (): [string, string][] => [
  ["all", tr("text220")],
  ["needs_reply", tr("text221")],
  ["unread", tr("text222")],
  ["resolved", tr("text223")],
];

const when = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : `${dateShort(value)} ${date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}`;
};

const threadName = (thread: ChatThread) => {
  if (thread.thread_type === "event_group") return tr("text224");
  const lane = thread.rfx_lanes;
  const route = lane ? [lane.origin, lane.destination].filter(Boolean).join(" → ") : "";
  if (thread.thread_type === "lane_group") return `Lane ${lane?.lane_number ?? ""} ${route}`.trim();
  return `${thread.vendors?.vendor_name || thread.vendors?.domain || "Carrier"}${route ? ` · ${route}` : ""}`;
};

const needsReply = (thread: ChatThread) => thread.communication_status === "needs_reply" || Boolean(thread.needs_reply);

/**
 * An event's conversations: the shared thread every invited carrier reads,
 * each lane's thread, and each carrier's private one. The team answers, marks
 * what needs a reply, resolves, assigns and keeps an internal note (which
 * carriers never get), and turns a bid given in the chat into the carrier's
 * offer.
 */
export function EventChatPage() {
  useLang();
  const { id = "" } = useParams();
  const { can, user } = useAuth();
  const canWork = can("operate");
  const chat = useAsync(() => listEventChat(id), [id]);
  const detail = useAsync(() => fetchRfxDetail(id), [id]);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [applying, setApplying] = useState(false);

  const threads = useMemo(() => {
    const rows = [...(chat.data?.rows ?? [])].sort(
      (a, b) =>
        Number(needsReply(b)) - Number(needsReply(a)) ||
        String(b.last_action_at ?? b.updated_at ?? "").localeCompare(String(a.last_action_at ?? a.updated_at ?? "")),
    );
    return rows.filter((t) =>
      filter === "all"
        ? true
        : filter === "needs_reply"
          ? needsReply(t)
          : filter === "unread"
            ? t.read_status === "unread"
            : t.communication_status === "resolved",
    );
  }, [getLang(), chat.data, filter]);
  const all = chat.data?.rows ?? [];
  const selected = all.find((t) => t.id === selectedId) ?? threads[0] ?? null;
  const lanes = (detail.data?.lanes ?? []) as LaneWithInvitations[];
  const eventName = String(detail.data?.event?.name ?? detail.data?.event?.rfx_id ?? tr("text225"));
  const hasEventThread = all.some((t) => t.thread_type === "event_group");

  async function run(task: () => Promise<string | void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await task();
      if (message) setNotice(message);
      chat.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const act = (action: ThreadAction, extra: { assigned_to?: string | null; internal_note?: string | null } = {}) =>
    selected && run(async () => void (await threadAction(selected.id, action, extra)));

  async function send() {
    if (!selected || !text.trim()) return;
    if (selected.thread_type !== "carrier_private") {
      const ok = await confirmAsync(tr("text226", THREAD_AUDIENCE[selected.thread_type]));
      if (!ok) return;
    }
    await run(async () => {
      await postChatMessage({ eventId: id, threadType: selected.thread_type, laneId: selected.rfx_lane_id, vendorId: selected.vendor_id, body: text.trim() });
      setText("");
      return tr("text227");
    });
  }

  async function editNote() {
    if (!selected) return;
    const note = await promptAsync(tr("text228"), selected.internal_note ?? "");
    if (note !== null) await act("note", { internal_note: note.trim() || null });
  }

  return (
    <>
      <TopBar
        title={tr("text229")}
        sub={eventName}
        actions={
          <>
            <Link to={`/rfx/${id}`} className="btn">
              {tr("text231")}</Link>
            <button className="primary" disabled={!canWork} title={canWork ? undefined : NEED_REASON.operate} onClick={() => setComposing(true)}>
              {tr("text233")}</button>
          </>
        }
      />
      <main className="main">
        <div style={{ display: "grid", gap: 12 }}>
          {notice && <InfoBanner>{notice}</InfoBanner>}
          {(chat.error || error) && <ErrorBanner message={(chat.error || error)!} />}
          {chat.data && !chat.data.google_chat_configured && (
            <InfoBanner>{tr("text234")}</InfoBanner>
          )}
          {chat.data && !hasEventThread && (
            <div className="row">
              <span className="cell-sub">{tr("text235")}</span>
              <button
                disabled={!canWork || busy}
                onClick={() => run(async () => void (await startEventThread(id)))}
                title={canWork ? tr("text236") : NEED_REASON.operate}
              >
                {tr("text237")}</button>
            </div>
          )}

          {chat.loading && !chat.data ? (
            <Spinner label={tr("text238")} />
          ) : !all.length ? (
            <Empty title={tr("text239")} hint={tr("text240")} />
          ) : (
            <div className="chat-layout">
              <div className="card" style={{ padding: 0 }}>
                <div className="tabs" role="tablist" style={{ padding: "0 8px" }}>
                  {filters().map(([key, label]) => (
                    <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
                      {label}
                      {key === "needs_reply" && all.some(needsReply) ? <span className="tab-count">{all.filter(needsReply).length}</span> : null}
                      {key === "unread" && all.some((t) => t.read_status === "unread") ? (
                        <span className="tab-count">{all.filter((t) => t.read_status === "unread").length}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                {!threads.length && <div className="cell-sub" style={{ padding: 12 }}>{tr("text241")}</div>}
                {threads.map((thread) => {
                  const last = thread.messages[thread.messages.length - 1];
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setSelectedId(thread.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        borderTop: "1px solid var(--line)",
                        borderRadius: 0,
                        padding: "10px 12px",
                        background: selected?.id === thread.id ? "rgba(0,0,0,0.04)" : "none",
                      }}
                    >
                      <div className="row" style={{ gap: 6 }}>
                        <strong style={{ fontWeight: thread.read_status === "unread" ? 700 : 500 }}>{threadName(thread)}</strong>
                        <div className="spacer" />
                        {needsReply(thread) && <Pill tone="amber">{tr("text221")}</Pill>}
                        {thread.communication_status === "resolved" && <Pill tone="green">{tr("text242")}</Pill>}
                      </div>
                      <div className="cell-sub">{THREAD_AUDIENCE[thread.thread_type]}</div>
                      {last && (
                        <div className="cell-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {authorOf(last)}: {last.body}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {selected && (
                <div className="card" style={{ display: "grid", gap: 10 }}>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ margin: 0 }}>{threadName(selected)}</h2>
                      <div className="cell-sub">
                        {THREAD_AUDIENCE[selected.thread_type]}
                        {selected.assigned_to ? tr("text243", selected.assigned_to.startsWith("org:") ? tr("text244") : selected.assigned_to) : ""}
                      </div>
                    </div>
                    <div className="spacer" />
                    {selected.thread_type === "carrier_private" && selected.rfx_lane_id && selected.vendor_id && (
                      <button disabled={!canWork || busy} onClick={() => setApplying(true)} title={tr("text250")}>
                        {tr("text251")}</button>
                    )}
                    {selected.communication_status === "resolved" ? (
                      <button disabled={!canWork || busy} onClick={() => act("reopen")}>
                        {tr("text170")}</button>
                    ) : (
                      <button disabled={!canWork || busy} onClick={() => act("resolve")}>
                        {tr("text247")}</button>
                    )}
                    <details className="qd-more">
                      <summary className="btn">{tr("text791")} ▾</summary>
                      <div
                        className="qd-more-menu"
                        onClick={(e) => ((e.currentTarget.parentElement as HTMLDetailsElement).open = false)}
                      >
                        <button disabled={!canWork || busy} onClick={() => act(selected.read_status === "unread" ? "mark_read" : "mark_unread")}>
                          {selected.read_status === "unread" ? tr("text245") : tr("text246")}
                        </button>
                        {!needsReply(selected) && (
                          <button disabled={!canWork || busy} onClick={() => act("mark_needs_reply")}>
                            {tr("text221")}</button>
                        )}
                        <button disabled={!canWork || busy} onClick={() => act("assign", { assigned_to: user?.email ?? null })}>
                          {tr("text248")}</button>
                        <button disabled={!canWork || busy} onClick={editNote}>
                          {tr("text249")}</button>
                      </div>
                    </details>
                  </div>
                  {selected.internal_note && (
                    <InfoBanner title={tr("text252")}>{selected.internal_note}</InfoBanner>
                  )}
                  <div style={{ display: "grid", gap: 8, maxHeight: 480, overflowY: "auto" }}>
                    {selected.messages.map((m) => {
                      const team = m.sender_role !== "carrier";
                      return (
                        <div
                          key={m.id}
                          style={{
                            border: "1px solid var(--line)",
                            borderRadius: 8,
                            padding: 10,
                            background: team ? "rgba(0,0,0,0.03)" : "none",
                            marginLeft: team ? 40 : 0,
                            marginRight: team ? 0 : 40,
                          }}
                        >
                          <div className="row" style={{ marginBottom: 4 }}>
                            <strong>{authorOf(m)}</strong>
                            <div className="spacer" />
                            <span className="cell-sub">{when(m.created_at)}</span>
                          </div>
                          <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                        </div>
                      );
                    })}
                  </div>
                  <label className="field">
                    <span>{tr("text253")}{THREAD_AUDIENCE[selected.thread_type].toLowerCase()} {THREAD_SEES[selected.thread_type]}</span>
                    <textarea rows={3} value={text} disabled={!canWork} onChange={(e) => setText(e.target.value)} />
                  </label>
                  <div className="row">
                    <div className="spacer" />
                    <button className="primary" disabled={!canWork || busy || !text.trim()} onClick={send}>
                      {busy ? tr("text254") : tr("text255")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {composing && (
        <NewConversationDialog
          lanes={lanes}
          onClose={() => setComposing(false)}
          onSend={async (input) => {
            await postChatMessage({ eventId: id, ...input });
            setComposing(false);
            setNotice(tr("text256"));
            chat.reload();
          }}
        />
      )}
      {applying && selected && selected.rfx_lane_id && selected.vendor_id && (
        <ApplyBidDialog
          thread={selected}
          onClose={() => setApplying(false)}
          onApply={async (bid) => {
            const lastCarrier = [...selected.messages].reverse().find((m) => m.sender_role === "carrier");
            await applyBidFromChat({ threadId: selected.id, messageId: lastCarrier?.id, laneId: selected.rfx_lane_id!, vendorId: selected.vendor_id!, ...bid });
            setApplying(false);
            setNotice(tr("text257"));
            chat.reload();
          }}
        />
      )}
    </>
  );
}

function NewConversationDialog({
  lanes,
  onClose,
  onSend,
}: {
  lanes: LaneWithInvitations[];
  onClose: () => void;
  onSend: (input: { threadType: ThreadType; laneId?: string | null; vendorId?: string | null; body: string }) => Promise<void>;
}) {
  useLang();
  const [audience, setAudience] = useState<ThreadType>("carrier_private");
  const [laneId, setLaneId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lane = lanes.find((l) => String(l.id) === laneId);
  const carriers = (lane?.invitations ?? []).filter((i) => String(i.invitation_status ?? "") !== "archived");
  const ready = body.trim() && (audience === "event_group" || (laneId && (audience === "lane_group" || vendorId)));

  async function send() {
    if (!ready) return;
    if (audience !== "carrier_private" && !(await confirmAsync(tr("text226", THREAD_AUDIENCE[audience])))) return;
    setBusy(true);
    setError(null);
    try {
      await onSend({ threadType: audience, laneId: audience === "event_group" ? null : laneId, vendorId: audience === "carrier_private" ? vendorId : null, body: body.trim() });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={tr("text233")}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            {tr("text258")}</button>
          <div className="spacer" />
          <button className="primary" disabled={!ready || busy} onClick={send}>
            {busy ? tr("text254") : tr("text255")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {error && <ErrorBanner message={error} />}
        <label className="field">
          <span>{tr("text259")}</span>
          <select value={audience} onChange={(e) => setAudience(e.target.value as ThreadType)}>
            <option value="carrier_private">{tr("text260")}</option>
            <option value="lane_group">{tr("text261")}</option>
            <option value="event_group">{tr("text112")}</option>
          </select>
        </label>
        {audience !== "event_group" && (
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <label className="field" style={{ flex: 1 }}>
              <span>Lane</span>
              <select
                value={laneId}
                onChange={(e) => {
                  setLaneId(e.target.value);
                  setVendorId("");
                }}
              >
                <option value="">{tr("text262")}</option>
                {lanes.map((l) => (
                  <option key={String(l.id)} value={String(l.id)}>
                    {`#${String(l.lane_number ?? "")} ${String(l.origin ?? "")} → ${String(l.destination ?? "")}`}
                  </option>
                ))}
              </select>
            </label>
            {audience === "carrier_private" && (
              <label className="field" style={{ flex: 1 }}>
                <span>Carrier</span>
                <select value={vendorId} disabled={!lane} onChange={(e) => setVendorId(e.target.value)}>
                  <option value="">{lane ? tr("text263") : tr("text264")}</option>
                  {carriers.map((i) => {
                    const vendor = (i.vendors ?? {}) as Record<string, unknown>;
                    return (
                      <option key={String(i.id)} value={String(i.vendor_id)}>
                        {String(vendor.vendor_name ?? vendor.domain ?? i.vendor_id)}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>
        )}
        <label className="field">
          <span>{tr("text265")}</span>
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <InfoBanner>{THREAD_AUDIENCE[audience]} {THREAD_SEES[audience]} {tr("text266")}</InfoBanner>
      </div>
    </Dialog>
  );
}

function ApplyBidDialog({
  thread,
  onClose,
  onApply,
}: {
  thread: ChatThread;
  onClose: () => void;
  onApply: (bid: { bid_rate: number; currency: string; weekly_capacity: number | null; transit_days: number | null; notes: string | null }) => Promise<void>;
}) {
  useLang();
  const [rate, setRate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [capacity, setCapacity] = useState("");
  const [transit, setTransit] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (value: string) => (value.trim() === "" ? null : Number(value.replace(/,/g, "")));
  const bid = num(rate);
  const ok = bid !== null && Number.isFinite(bid) && bid > 0 && [num(capacity), num(transit)].every((n) => n === null || Number.isFinite(n));

  async function apply() {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await onApply({ bid_rate: bid!, currency, weekly_capacity: num(capacity), transit_days: num(transit), notes: notes.trim() || null });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={tr("text267")}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            {tr("text258")}</button>
          <div className="spacer" />
          <button className="primary" disabled={!ok || busy} onClick={apply}>
            {busy ? tr("text268") : tr("text251")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {error && <ErrorBanner message={error} />}
        <div className="cell-sub">{threadName(thread)}</div>
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text269")}</span>
            <input value={rate} inputMode="decimal" onChange={(e) => setRate(e.target.value)} />
          </label>
          <label className="field" style={{ width: 110 }}>
            <span>{tr("text057")}</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
              <option value="CAD">CAD</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text270")}</span>
            <input value={capacity} inputMode="numeric" onChange={(e) => setCapacity(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text271")}</span>
            <input value={transit} inputMode="numeric" onChange={(e) => setTransit(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>{tr("text272")}</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <InfoBanner>{tr("text273")}</InfoBanner>
      </div>
    </Dialog>
  );
}
