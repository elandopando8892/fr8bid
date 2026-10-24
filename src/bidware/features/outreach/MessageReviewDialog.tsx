import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorBanner, InfoBanner, Spinner } from "@/components/ui";
import { useLang } from "@/i18n/language";
import { tr, storedStatus } from "@/i18n/outreach-review";
import { queueError } from "@/i18n/quote-queue";
import { getOutreachMessage, outreachVendorName, type OutreachMessage } from "./outreach.service";
import { DeliveryDiagnosis } from "./DeliveryDiagnosis";
import { GmailReceiptPanel } from "./GmailReceiptPanel";
import { WhatsappDeliveryPanel } from "./WhatsappDeliveryPanel";

/** Never sends or changes message status. Explicit Gmail verification may renew credentials. */
export function MessageReviewDialog({ eventId, messageId, onClose, onReviewed }: {
  eventId: string; messageId: string; onClose: () => void;
  /** Receives only a successful scoped read while this dialog is still current. */
  onReviewed?: (row: OutreachMessage) => void;
}) {
  useLang();
  const [row, setRow] = useState<OutreachMessage | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  // Latest callback without refetching when its identity changes.
  const reviewed = useRef(onReviewed);
  reviewed.current = onReviewed;
  useEffect(() => {
    let cancelled = false;
    setRow(null); setFailure(null); setMissing(false); setLoading(true);
    getOutreachMessage(eventId, messageId)
      .then(result => {
        if (cancelled) return;
        setRow(result); setMissing(!result);
        if (result && result.id === messageId && result.rfx_event_id === eventId) reviewed.current?.(result);
      })
      .catch(error => { if (!cancelled) setFailure(error); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId, messageId]);
  const whatsapp = row?.channel === "whatsapp";
  const preview = whatsapp ? row.whatsapp_preview : null;
  const text = (whatsapp ? preview?.text : null) || row?.text_body || row?.whatsapp_text || row?.whatsapp_body;
  // Sandbox removes script/origin/form permissions. CSP blocks remote resources;
  // a non-interactive frame also cannot follow the message's private links.
  const document = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"></head><body>${row?.html_body || ""}</body></html>`;
  return <Dialog title={tr("title")} ariaLabel={tr("title")} onClose={onClose}>
    <InfoBanner>{tr("readOnly")}</InfoBanner>
    {loading && <Spinner />}
    {(missing || Boolean(failure)) && <ErrorBanner message={missing ? tr("missing") : queueError(failure)} />}
    {!loading && row && <>
      <p>{tr("carrier")}: {outreachVendorName(row) || "—"}<br />
        {tr("from")}: {preview?.from || row.sender_address || row.sender_email || "—"}<br />
        {tr("to")}: {preview?.to || row.recipient_email || row.recipient_phone || "—"}<br />
        {tr("subject")}: {row.subject || "—"}<br />
        {tr("status")}: {storedStatus(row.status)}</p>
      <DeliveryDiagnosis message={row} />
      <GmailReceiptPanel message={row} eventId={eventId} />
      {whatsapp && <WhatsappDeliveryPanel key={`${eventId}:${row.id}`} message={row} eventId={eventId} />}
      {whatsapp && !preview && <InfoBanner>{tr("whatsappUnavailable")}</InfoBanner>}
      {preview && <>
        <p>{tr("whatsappTemplate")}: {preview.template_name} · {preview.language} · {preview.category}<br />
          {preview.expires_at !== null && <>{tr("whatsappExpires")}: {new Date(preview.expires_at).toLocaleTimeString()}</>}</p>
        <InfoBanner>{tr(preview.kind === "receipt" ? "whatsappReceipt" : "whatsappExact")}</InfoBanner>
      </>}
      {!whatsapp && row.html_body && <>
        <p className="muted">{tr("remote")}</p>
        <iframe ref={frame => { frame?.setAttribute("inert", ""); }} className="qd-email-preview" sandbox="" tabIndex={-1} style={{ pointerEvents: "none" }} title={tr("preview")} srcDoc={document} />
      </>}
      {text && <details open={whatsapp || !row.html_body}><summary>{tr(preview?.kind === "pending" ? "whatsappBody" : "text")}</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</pre></details>}
      {!whatsapp && !row.html_body && !text && <p>{tr("empty")}</p>}
    </>}
  </Dialog>;
}
