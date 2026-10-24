import { useEffect, useState } from "react";
import { ErrorBanner, Pill, Spinner } from "@/components/ui";
import { locale, useLang } from "@/i18n/language";
import { whatsappText as t } from "@/i18n/whatsapp-queue";
import { listWhatsappEvidence, type OutreachMessage, type WhatsappEvidence } from "./outreach.service";
import { whatsappStateOf } from "./whatsapp-queue-state";
import { WhatsappAssociation } from "./WhatsappAssociation";

function useReviewClock(message: OutreachMessage) {
  const [now, setNow] = useState(Date.now);
  const expiry = message.whatsapp_approval?.expires_at ?? message.whatsapp_preview?.expires_at;
  useEffect(() => {
    setNow(Date.now());
    if (typeof expiry !== "number" || !Number.isFinite(expiry) || expiry <= Date.now()) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(expiry - Date.now() + 1, 2147483647));
    return () => window.clearTimeout(timer);
  }, [expiry]);
  return now;
}
export function WhatsappQueueStatus({ message }: { message: OutreachMessage }) {
  useLang();
  const state = whatsappStateOf(message, useReviewClock(message));
  if (!state) return null;
  return <Pill tone={state.tone}>{t(state.state)}</Pill>;
}
export function WhatsappQueueStep({ message }: { message: OutreachMessage }) {
  useLang();
  const state = whatsappStateOf(message, useReviewClock(message));
  return state ? <>{t(`step_${state.state}`)}<div className="cell-sub">{t("cost")}</div></> : null;
}
const when = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(locale()) : t("missingDate");
function EvidenceRows({ rows, pending, onLinked }: { rows: WhatsappEvidence[]; pending: boolean; onLinked: () => void }) {
  return <ul style={{ paddingLeft: 20 }}>
    {rows.map(row => <li key={row.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0", overflowWrap: "anywhere" }}>
      <strong>{pending ? t("pending") : t(row.direction === "inbound" ? "incoming" : "outgoing")}</strong>
      {pending && <div className="cell-sub">{t(row.direction === "inbound" ? "incoming" : "outgoing")}{row.from_phone ? ` · +${row.from_phone.replace(/^\+/, "")}` : ""}</div>}
      {row.body_preview && <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{row.body_preview}</p>}
      <div className="cell-sub">{t("occurred")}: {when(row.occurred_at)}<br />{t("received")}: {when(row.received_at)}</div>
      {row.resolved_by && row.resolved_at && <p className="cell-sub">{t("associationBy",row.resolved_by,when(row.resolved_at))}</p>}
      {pending && row.direction === "inbound" && <WhatsappAssociation receiptId={row.id} onLinked={onLinked} />}
    </li>)}
  </ul>;
}
/** Each list/decision is tied to one mounted account/event/message. No provider requests. */
function EvidenceList({ eventId, messageId, refreshKey = 0, onLinked }: { eventId?: string; messageId?: string; refreshKey?: number; onLinked?: () => void }) {
  useLang();
  const [offset, setOffset] = useState(0), [tick, setTick] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof listWhatsappEvidence>> | null>(null);
  const [loading, setLoading] = useState(true), [failure, setFailure] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true); setResult(null); setFailure(false);
    listWhatsappEvidence({ eventId, messageId, offset }).then(value => { if (current) setResult(value); })
      .catch(() => { if (current) setFailure(true); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [eventId, messageId, offset, tick, refreshKey]);
  const pending = !messageId;
  return <>
    {loading && <Spinner label={t("loading")} />}
    {failure && <ErrorBanner message={t("unavailable")} />}
    {result && (!result.rows.length ? <p>{t(pending ? "pendingEmpty" : "evidenceMissing")}</p> : <>
      <EvidenceRows rows={result.rows} pending={pending} onLinked={() => { setOffset(0); setTick(value => value + 1); onLinked?.(); }} />
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="cell-sub">{t("page", offset + 1, offset + result.rows.length, result.total)}</span>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>{t("previous")}</button>
        <button type="button" disabled={!result.has_more} onClick={() => setOffset(offset + 25)}>{t("next")}</button>
      </div>
    </>)}
    <button type="button" disabled={loading} onClick={() => { setOffset(0); setTick(value => value + 1); }}>{t("refresh")}</button>
  </>;
}
export function WhatsappDeliveryPanel({ message, eventId }: { message: OutreachMessage; eventId: string }) {
  useLang();
  const [historyOpen, setHistoryOpen] = useState(false);
  const state = whatsappStateOf(message, useReviewClock(message));
  if (!state) return null;
  return <section aria-label={t("title")} style={{ border: "1px solid var(--line)", padding: 12, margin: "12px 0", overflowWrap: "anywhere" }}>
    <h3 style={{ marginTop: 0 }}>{t("title")}</h3>
    <WhatsappQueueStatus message={message} />
    <p>{t(`step_${state.state}`)}</p>
    {state.occurredAt && <p className="cell-sub">{t("occurred")}: {when(state.occurredAt)}</p>}
    {message.delivery_error && <p>{message.delivery_error}</p>}
    <p><strong>{t("cost")}</strong></p><p className="cell-sub">{t("costHelp")}</p>
    <details onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>{t("evidence")}</summary>
      {historyOpen && <EvidenceList key={`${eventId}:${message.id}`} eventId={eventId} messageId={message.id} />}</details>
  </section>;
}
export function WhatsappPendingEvidence({ scope, refreshKey, onLinked }: { scope: string; refreshKey: number; onLinked?: () => void }) {
  useLang();
  const [open, setOpen] = useState(false);
  return <details key={scope} onToggle={event => setOpen(event.currentTarget.open)} style={{ border: "1px solid var(--line)", padding: 12, margin: "12px 0", overflowWrap: "anywhere" }}>
    <summary>{t("pendingTitle")}</summary>
    <p className="cell-sub">{t("pendingHelp")}</p>
    {open && <EvidenceList key={scope} refreshKey={refreshKey} onLinked={onLinked} />}
  </details>;
}
