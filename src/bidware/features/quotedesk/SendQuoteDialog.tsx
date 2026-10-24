import { tr } from "@/i18n/quotedesk";
import { useLang } from "@/i18n/language";
import { useEffect, useState } from "react";
import { tr as queueTr, queueError } from "@/i18n/quote-queue";
import { Dialog, dateShort } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import {
  previewQuoteEmail,
  prepareQuoteEmailDraft,
  type Quote,
  type QuoteEmailPreview,
  type QuoteEmailReceipt,
} from "./quotedesk.service";

const RECEIPT_LABEL: Record<QuoteEmailReceipt["status"], string> = {
  get sending() { return tr("text294"); },
  get sent() { return tr("text295"); },
  get failed() { return tr("text296"); },
  get delivery_unknown() { return tr("text297"); },
};

const splitEmails = (value: string) =>
  value
    .split(/[,;\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * Prepares the stored-price snapshot for review in the delivery queue.
 * This dialog never calls a provider send action.
 */
export function SendQuoteDialog({
  quote,
  mailboxConnected,
  onClose,
  onPrepared,
}: {
  quote: Quote;
  mailboxConnected: boolean | undefined;
  onClose: () => void;
  onPrepared: () => void;
}) {
  useLang();
  const { can, roleLoaded } = useAuth();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<QuoteEmailPreview | null>(null);
  const [previewedWith, setPreviewedWith] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A quote made from a shipper's request goes back to whoever filled it in.
  const requestEmail =
    quote.channel === "rfi" ? String(quote.notes ?? "").match(/Contacto:[^\n]*?([^\s·,;<>()]+@[^\s·,;<>()]+\.[a-z]{2,})/i)?.[1] ?? null : null;
  const inputsKey = JSON.stringify({ to: to.trim().toLowerCase(), cc: splitEmails(cc.toLowerCase()), note: note.trim() });
  const stale = preview !== null && inputsKey !== previewedWith;

  async function refresh(first = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await previewQuoteEmail({
        quote_id: quote.id,
        to: first ? requestEmail ?? undefined : to.trim() || undefined,
        cc: first ? undefined : splitEmails(cc),
        note: first ? undefined : note.trim() || undefined,
      });
      setPreview(res);
      const nextTo = first ? res.to ?? "" : to;
      if (first) setTo(nextTo);
      setPreviewedWith(
        JSON.stringify({
          to: nextTo.trim().toLowerCase(),
          cc: first ? [] : splitEmails(cc.toLowerCase()),
          note: first ? "" : note.trim(),
        }),
      );
    } catch (e) {
      setError(queueError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id]);

  async function prepare() {
    if (!preview || stale) return;
    setSending(true);
    setError(null);
    try {
      await prepareQuoteEmailDraft({
        quote_id: quote.id,
        to: preview.to ?? "",
        cc: preview.cc,
        note: note.trim() || undefined,
        checksum: preview.checksum,
        contact_name: preview.contact_name || undefined,
      });
      onPrepared();
    } catch (e) {
      const message = queueError(e);
      setError(message);
    } finally {
      setSending(false);
    }
  }

  const blocked = !mailboxConnected
    ? tr("text303")
    : preview?.suppressed.length
      ? tr("text304", preview.suppressed.join(", "))
      : !preview?.to
        ? tr("text305")
        : null;

  return (
    <Dialog
      title={queueTr("prepareTitle", quote.folio)}
      ariaLabel={queueTr("prepareTitle", quote.folio)}
      onClose={sending ? () => undefined : onClose}
      footer={
        <>
          <button onClick={onClose} disabled={sending}>
            {tr("text002")}</button>
          {stale && (
            <button onClick={() => refresh()} disabled={loading || sending}>
              {tr("text307")}</button>
          )}
          <button className="primary" onClick={prepare} disabled={!preview || stale || loading || sending || Boolean(blocked) || !roleLoaded || !can("operate")}>
            {sending ? queueTr("preparing") : queueTr("prepare")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        <p className="qd-muted">{queueTr("gate")}</p>
        <div className="qd-two">
          <label className="field">
            <span>{tr("text310")}</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={tr("text311")} />
          </label>
          <label className="field">
            <span>{tr("text312")}</span>
            <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder={tr("text313")} />
          </label>
        </div>
        <label className="field">
          <span>{tr("text314")}</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tr("text315")}
          />
        </label>
        {preview && (
          <p className="qd-muted qd-small" style={{ margin: 0 }}>
            {tr("text316")}<strong>{preview.from}</strong> {tr("text317")}<strong>{preview.subject}</strong>
          </p>
        )}
        {stale && <p className="qd-muted qd-small">{tr("text318")}</p>}
        {blocked && preview && <p className="qd-error">{blocked}</p>}
        {error && <p className="qd-error">{error}</p>}
        {loading && !preview && <p className="qd-muted">{tr("text319")}</p>}
        {preview && (
          <iframe
            title={tr("text320")}
            className="qd-email-preview"
            sandbox=""
            srcDoc={preview.html}
          />
        )}
        {preview && preview.history.length > 0 && (
          <div className="qd-history">
            <strong>{tr("text321")}</strong>
            {preview.history.map((r) => (
              <div key={r.id} className="qd-muted qd-small">
                {RECEIPT_LABEL[r.status]} · {r.recipient_email} · {dateShort(r.sent_at || r.attempted_at)}
                {r.error ? ` · ${r.error}` : ""}
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
