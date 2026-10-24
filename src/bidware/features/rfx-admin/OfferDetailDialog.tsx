import { Dialog, InfoBanner } from "@/components/ui";
import { useLang, locale } from "@/i18n/language";
import { offerText as t } from "@/i18n/offer-detail";
import { domainLabel } from "@/i18n/domain";
import { ANSWERS, RUBRICS } from "@/features/bid-room/bidroom.service";
import { laneSegmentKey, type ConfirmationRow } from "./confirmations.service";
import type { LaneWithInvitations } from "./stages";
import { useAsync } from "@/components/useAsync";
import { listEventHistory } from "./rfx.service";
import { offerFields, formatOfferValue, latestOfferResponses, offerRevisions, currentOfferFinal } from "./offer-presentation";

export type OfferSelection = { lane: LaneWithInvitations; invitation: Record<string, unknown>; displayName?: string };

export function OfferDetailDialog({ selection, confirmations, onClose }: {
  selection: OfferSelection; confirmations: ConfirmationRow[]; onClose: () => void;
}) {
  useLang();
  const { lane, invitation: offer, displayName } = selection;
  const history = useAsync(() => listEventHistory(String(lane.rfx_event_id)), [lane.rfx_event_id, offer.id]);
  const usableHistory = history.loading || history.error ? [] : history.data;
  const revisions = offerRevisions(usableHistory, offer.id);
  const bestFinal = currentOfferFinal(usableHistory, offer);
  const historyAmount = (snapshot: Record<string, unknown>) => {
    const v = snapshot.bid_rate;
    return (typeof v === "number" || typeof v === "string") && String(v).trim() !== "" && Number.isFinite(Number(v)) ? String(Number(v)) : t("missing");
  };
  const historyCurrency = (snapshot: Record<string, unknown>) => typeof snapshot.currency === "string" && /^[A-Z]{3}$/.test(snapshot.currency) ? snapshot.currency : t("missing");
  const vendor = (offer.vendors ?? {}) as Record<string, unknown>;
  const latest = latestOfferResponses(confirmations, offer, laneSegmentKey(lane));
  return <Dialog title={t("title")} ariaLabel={t("title")} onClose={onClose}>
    <InfoBanner>{t("readOnly")}</InfoBanner>
    <h3>{displayName || String(vendor.vendor_name || offer.vendor_id || "—")}</h3>
    <p>{String(lane.origin || "—")} → {String(lane.destination || "—")}</p>
    <dl style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:14}}>
      {offerFields.map(key => <div key={key}><dt className="cell-sub">{t(key)}</dt><dd style={{margin:0,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{formatOfferValue(offer, key, t)}</dd></div>)}
    </dl>
    <h3>{t("final")}</h3><p>{typeof bestFinal === "boolean" ? t(bestFinal ? "yes" : "no") : t("finalUnknown")}</p>
    <section aria-label={t("history")}>
      <h3>{t("history")}</h3><p className="cell-sub">{t("historyLimit")}</p>
      {history.loading ? <p role="status">{t("historyLoading")}</p> : history.error ? <p role="alert">{t("historyError")}</p> : !revisions.length ? <p>{t("historyEmpty")}</p> : revisions.map(({row, meta, before, after}, index) => {
        const stamp = Date.parse(String(row.occurred_at));
        const source = meta.source === "rfx_bid_portal" ? t("carrier_portal") : t("missing");
        return <article key={String(row.id ?? index)} style={{borderTop:"1px solid var(--line)",padding:"12px 0",overflowWrap:"anywhere"}}>
          <b>{Number.isFinite(stamp) ? new Intl.DateTimeFormat(locale(), {dateStyle:"medium",timeStyle:"medium",timeZone:"America/Mexico_City"}).format(stamp) : t("missing")}</b>
          <p>{t("before")}: {historyAmount(before)} {historyCurrency(before)} → {t("after")}: {historyAmount(after)} {historyCurrency(after)}</p>
          <p>{t("response_source")}: {source} · {t("final")}: {typeof meta.best_final === "boolean" ? t(meta.best_final ? "yes" : "no") : t("pending")}</p>
        </article>;
      })}
    </section>
    <h3>{t("rubrics")}</h3>
    {RUBRICS.map(r => { const row = latest.get(r.key); const answer = ANSWERS.find(a => a.key === row?.answer); return <div key={r.key} style={{padding:"10px 0",borderTop:"1px solid var(--line)"}}>
      <b>{domainLabel(r.label)}</b><p style={{margin:"4px 0"}}>{answer ? domainLabel(answer.label) : t("pending")}</p>
      {row?.comment && <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{row.comment}</p>}
    </div>; })}
  </Dialog>;
}
