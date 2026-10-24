import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorBanner, InfoBanner, Pill } from "@/components/ui";
import { useLang } from "@/i18n/language";
import { offerText as t } from "@/i18n/offer-detail";
import { domainLabel } from "@/i18n/domain";
import { ANSWERS, RUBRICS } from "@/features/bid-room/bidroom.service";
import { laneSegmentKey, type ConfirmationRow } from "./confirmations.service";
import type { LaneWithInvitations } from "./stages";
import { comparisonOffers, formatOfferValue, latestOfferResponses, offerFields, offerValidity } from "./offer-presentation";
import { buildComparisonWorkbook, comparisonName, comparisonStatus } from "./offer-comparison-export";

export function OfferComparisonDialog({ lane, confirmations, anonymous = false, displayName, onClose }: {
  lane: LaneWithInvitations; confirmations: ConfirmationRow[]; anonymous?: boolean;
  displayName?: (offer: Record<string, unknown>) => string; onClose: () => void;
}) {
  const lang = useLang();
  const active = useRef(false), locked = useRef(false);
  const current = useRef({ lane, confirmations, anonymous, displayName, lang });
  current.current = { lane, confirmations, anonymous, displayName, lang };
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exported, setExported] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setExportError(""); setExported(false); }, [lane, confirmations, anonymous, displayName, lang]);
  const offers = comparisonOffers(lane), evaluatedAt = Date.now();
  const responses = offers.map(offer => latestOfferResponses(confirmations, offer, laneSegmentKey(lane)));
  const validityLabels = { valid: "validityValid", expired: "validityExpired", invalid: "validityInvalid", unknown: "validityUnknown" } as const;
  const nameOf = (offer: Record<string, unknown>, index: number) => comparisonName(offer, index, anonymous, displayName);
  const value = (offer: Record<string, unknown>, key: typeof offerFields[number]) => formatOfferValue(offer, key, t, anonymous);
  async function download() {
    if (locked.current || !offers.length) return;
    const snapshot = current.current;
    const live = () => active.current && Object.keys(snapshot).every(key => snapshot[key as keyof typeof snapshot] === current.current[key as keyof typeof snapshot]);
    locked.current = true; setExporting(true); setExportError(""); setExported(false);
    try {
      const book = await buildComparisonWorkbook({ ...snapshot, evaluatedAt });
      if (!live()) return;
      const XLSX = await import("xlsx");
      if (!live()) return;
      XLSX.writeFile(book, "comparativo-rfx.xlsx", { compression: true });
      setExported(true);
    } catch (error) {
      if (live()) setExportError(error instanceof Error && error.message === t("exportTooLarge") ? error.message : t("exportError"));
    } finally {
      locked.current = false;
      if (active.current) setExporting(false);
    }
  }
  return <Dialog title={t("comparisonTitle")} ariaLabel={t("comparisonTitle")} width={1120} onClose={onClose}>
    <p><b>{String(lane.origin || "—")} → {String(lane.destination || "—")}</b></p>
    <InfoBanner>{t("comparisonNote")}</InfoBanner>
    {offers.length > 0 && <p><button type="button" disabled={exporting} onClick={download}>{t(exporting ? "exporting" : "exportButton")}</button></p>}
    {exportError && <ErrorBanner message={exportError} />}
    {exported && <p role="status">{t("exported")}</p>}
    {offers.length > 0 && <p className="cell-sub">{t("comparisonOffers")}: {offers.length}. {t("comparisonScroll")}</p>}
    {!offers.length ? <p>{t("comparisonEmpty")}</p> : <div role="region" aria-label={t("comparisonTable")} tabIndex={0} style={{ overflowX: "auto", maxWidth: "100%", marginTop: 16 }}>
      <table className="data" aria-label={t("comparisonTable")} style={{ minWidth: `calc(clamp(120px, 18vw, 210px) + ${offers.length * 170}px)`, tableLayout: "fixed" }}>
        <thead><tr><th style={{ width: "clamp(120px, 18vw, 210px)" }}>{t("comparisonField")}</th>{offers.map((offer, index) => <th key={String(offer.id)} style={{ minWidth: 170, whiteSpace: "normal", overflowWrap: "anywhere" }}>{nameOf(offer, index)}
          {["archived", "declined", "rejected", "withdrawn"].includes(String(offer.invitation_status).toLowerCase()) && <div><Pill tone="amber">{t("inactiveOffer")}</Pill></div>}
        </th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">{t("comparisonStatus")}</th>{offers.map(offer => <td key={String(offer.id)}>{comparisonStatus(offer)}</td>)}</tr>
          {offerFields.map(key => <tr key={key}><th scope="row" style={{ position: "sticky", left: 0, background: "var(--panel, #fff)", overflowWrap: "anywhere" }}>{t(key)}</th>{offers.map(offer => <td key={String(offer.id)} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", verticalAlign: "top" }}>
            {value(offer, key)}
            {key === "bid_rate" && <div className="cell-sub">{offer.currency ? value(offer, "currency") : t("currencyUnknown")}</div>}
            {key === "valid_through" && <div><Pill tone={offerValidity(offer, evaluatedAt) === "valid" ? "green" : "amber"}>{t(validityLabels[offerValidity(offer, evaluatedAt)])}</Pill></div>}
          </td>)}</tr>)}
          <tr><th scope="row">{t("final")}</th>{offers.map(offer => <td key={String(offer.id)}>{typeof offer.best_final === "boolean" ? t(offer.best_final ? "yes" : "no") : t("pending")}</td>)}</tr>
          {RUBRICS.map(rubric => <tr key={rubric.key}><th scope="row" style={{ position: "sticky", left: 0, background: "var(--panel, #fff)" }}>{domainLabel(rubric.label)}</th>{offers.map((offer, index) => {
            const row = responses[index].get(rubric.key), answer = ANSWERS.find(a => a.key === row?.answer);
            return <td key={String(offer.id)} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", verticalAlign: "top" }}>{answer ? domainLabel(answer.label) : t("pending")}{row?.comment && <p className="cell-sub">{anonymous ? t("hidden") : row.comment}</p>}</td>;
          })}</tr>)}
        </tbody>
      </table>
    </div>}
  </Dialog>;
}
