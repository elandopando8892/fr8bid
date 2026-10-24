import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { ErrorBanner, Spinner } from "@/components/ui";
import { locale, useLang } from "@/i18n/language";
import { whatsappText as t } from "@/i18n/whatsapp-queue";
import { ApiError } from "@/lib/api-client";
import { associateWhatsappReply, reviewWhatsappReply, type WhatsappAssociationReview } from "./whatsapp-association.service";

/** Mounted inside the account/event-keyed evidence list; decisions never outlive that scope. */
export function WhatsappAssociation({ receiptId, onLinked }: { receiptId: string; onLinked: () => void }) {
  useLang();
  const { can, roleLoaded, user } = useAuth();
  const allowed = roleLoaded && can("operate");
  const [open,setOpen] = useState(false), [offset,setOffset] = useState(0), [tick,setTick] = useState(0);
  const [review,setReview] = useState<WhatsappAssociationReview | null>(null);
  const [selected,setSelected] = useState(""), [confirmed,setConfirmed] = useState(false);
  const [busy,setBusy] = useState(false), [loading,setLoading] = useState(false), [error,setError] = useState<string | null>(null);
  const [uncertain,setUncertain] = useState(false), [success,setSuccess] = useState(false);
  const live = useRef(true), locked = useRef(false);
  const scope = `${user?.id}:${user?.app_metadata?.rateware_organization_id || user?.app_metadata?.organization_id || "personal"}:${allowed}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    setSelected(""); setConfirmed(false); setReview(null); setSuccess(false); setError(null);
    if (!open) return;
    let active = true; setLoading(true);
    reviewWhatsappReply(receiptId,offset).then(value => {
      if (!active) return;
      setReview(value); setUncertain(false);
      if (value.receipt.message_id) { setSuccess(true); }
    }).catch(() => { if (active) setError(t("associationUnavailable")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open,receiptId,offset,tick,scope]);
  const chosen = review?.candidates.find(c => c.message_id === selected);
  async function save() {
    if (locked.current || !allowed || !confirmed || !chosen || !review || uncertain) return;
    const startedScope = scope; locked.current = true; setBusy(true); setError(null);
    try {
      await associateWhatsappReply({receipt_id:receiptId,message_id:chosen.message_id,operation_id:crypto.randomUUID(),
        receipt_version:review.receipt.version,message_version:chosen.version,review_scope:review.review_scope});
      if (!live.current || currentScope.current !== startedScope) return;
      setSuccess(true); onLinked();
    } catch (e) {
      if (!live.current || currentScope.current !== startedScope) return;
      setSelected(""); setConfirmed(false);
      const status = e instanceof ApiError ? e.status : 0;
      setUncertain(true);
      setError(t(status === 409 ? "associationConflict" : status === 403 ? "associationDenied" : "associationUnknown"));
    } finally { locked.current = false; if (live.current && currentScope.current === startedScope) setBusy(false); }
  }
  return <div style={{marginTop:8}}>
    {!open && <button type="button" disabled={!allowed} onClick={() => setOpen(true)}>{t("associate")}</button>}
    {!allowed && <p className="cell-sub">{t("associationReadOnly")}</p>}
    {open && <section aria-label={t("associate")} style={{border:"1px solid var(--line)",padding:12,marginTop:8}}>
      <p>{t("associationHelp")}</p>
      {loading && <Spinner label={t("loading")} />}
      {error && <ErrorBanner message={error} />}
      {success && <div role="status"><p>{t("associationSaved")}</p>
        {review?.receipt.event_code && <strong>{review.receipt.event_code} · {review.receipt.event_name}</strong>}
        {review?.receipt.resolved_by && review.receipt.resolved_at && <p className="cell-sub">{t("associationBy",review.receipt.resolved_by,new Date(review.receipt.resolved_at).toLocaleString(locale()))}</p>}
      </div>}
      {review && !success && <>
        {review.candidates.length === 0 ? <p>{t("associationNone")}</p> : <>
          <label>{t("associationTarget")}
            <select aria-label={t("associationTarget")} value={selected} disabled={!allowed || busy || uncertain}
              onChange={e => {setSelected(e.target.value);setConfirmed(false);}} style={{width:"100%",maxWidth:"100%"}}>
              <option value="">{t("associationChoose")}</option>
              {review.candidates.map(c => <option key={c.message_id} value={c.message_id}>{c.event_code} · {c.event_name} · {c.vendor_name} · {new Date(c.sent_at).toLocaleString(locale())}</option>)}
            </select>
          </label>
          {chosen && <div style={{margin:"12px 0",overflowWrap:"anywhere"}}>
            <strong>{chosen.event_code} · {chosen.event_name}</strong><p>{chosen.vendor_name}</p>
            <p>{chosen.subject || t("associationNoSubject")}</p>
            <p className="cell-sub">{t("associationSent")}: {new Date(chosen.sent_at).toLocaleString(locale())}</p>
            <label style={{display:"flex",gap:8,alignItems:"start"}}><input type="checkbox" checked={confirmed} disabled={busy || !allowed || uncertain}
              onChange={e => setConfirmed(e.target.checked)} />{t("associationConfirm")}</label>
          </div>}
          <div className="row" style={{gap:8,flexWrap:"wrap",marginTop:8}}>
            <button type="button" disabled={busy || !allowed || !chosen || !confirmed || uncertain} onClick={save}>{t(busy ? "associationSaving" : "associationSave")}</button>
            <button type="button" disabled={busy || offset===0} onClick={() => setOffset(Math.max(0,offset-25))}>{t("previous")}</button>
            <button type="button" disabled={busy || !review.has_more} onClick={() => setOffset(offset+25)}>{t("next")}</button>
          </div>
        </>}
      </>}
      <div className="row" style={{gap:8,flexWrap:"wrap",marginTop:8}}>
        <button type="button" disabled={busy || loading} onClick={() => setTick(x=>x+1)}>{t("associationCheck")}</button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>{t("associationCancel")}</button>
      </div>
    </section>}
  </div>;
}
