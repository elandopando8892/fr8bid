import { useEffect, useRef, useState, type ReactNode } from "react";
import { ErrorBanner } from "@/components/ui";
import { useLang } from "@/i18n/language";
import { q } from "@/i18n/bid-room-quote";
import { xls } from "@/i18n/bid-room-excel";
import { confirmAsync } from "@/components/confirm";
import { billingNotice, eventLanes, getInvitation, modelCopy, isLockedBrokerage, offerPayload, submitBid, type BookLane } from "./bidroom.service";
import { buildBidTemplate, currentOfferForSend, displayOfferValue, offerColumns, parseBidTemplate, type ImportedOffer } from "./bid-template";

export function QuoteExcel({ token, eventId, onBusy, onSettled, progress }: {
  token: string;
  /** The progress line the two Excel buttons sit on (decision of Jose, 6-nov). */
  progress?: ReactNode;
  eventId: string;
  onBusy: (busy: boolean) => void;
  onSettled: () => void;
}) {
  useLang();
  const [plan, setPlan] = useState<ImportedOffer[]>([]);
  const [busy, setBusy] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const locked = useRef(false);
  const used = useRef(false);
  const active = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function start() {
    if (locked.current || used.current) return false;
    locked.current = true;
    setBusy(true); onBusy(true); setError("");
    return true;
  }
  function finish() {
    if (!active.current) return;
    locked.current = false; setBusy(false); onBusy(used.current);
  }
  async function currentLanes(): Promise<BookLane[]> {
    return eventLanes((await getInvitation(token)).carrier_book, eventId);
  }
  async function download() {
    if (!start()) return;
    try {
      const lanes = await currentLanes();
      if (!active.current) return;
      if (!lanes.length || lanes.length > 1000) throw new Error(q("xl.noLanes"));
      const book = await buildBidTemplate(lanes);
      const XLSX = await import("xlsx");
      if (active.current) XLSX.writeFile(book, xls("file.name"));
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : q("xl.downloadFailed"));
    } finally { finish(); }
  }
  async function upload(file: File) {
    if (!start()) return;
    setPlan([]); setStatus(""); setDone([]);
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error(q("xl.useTemplate"));
      if (file.size > 5 * 1024 * 1024) throw new Error(q("xl.tooBig"));
      const data = await file.arrayBuffer();
      const lanes = await currentLanes();
      const offers = await parseBidTemplate(data, lanes);
      if (active.current) setPlan(offers);
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : q("xl.readFailed"));
    } finally { finish(); }
  }
  async function send() {
    if (!plan.length || !start()) return;
    let attempting: ImportedOffer | undefined;
    let sent = 0;
    try {
      if (plan.some(offer => billingNotice(offer.form))) {
        const accepted = await confirmAsync(q("billing.excelNotice"), { ok: q("xl.confirmOk"), cancel: q("form.backToReview") });
        if (!accepted || !active.current) return;
      }
      used.current = true;
      setConsumed(true);
      let lanes = await currentLanes();
      if (!active.current) return;
      // Check the entire plan before the first write, then refresh before each subsequent one.
      plan.forEach(offer => currentOfferForSend(offer, lanes));
      for (const offer of plan) {
        if (sent) lanes = await currentLanes();
        if (!active.current) return;
        const lane = currentOfferForSend(offer, lanes);
        setStatus(q("xl.sendingLane", lane.lane_number ?? offer.row, sent + 1, plan.length));
        attempting = offer;
        const response = await submitBid(lane.invitation_token!, offerPayload(offer.form, lane));
        const row = response.row as Record<string, unknown> | undefined;
        // The API receipt identifies the invitation (one invitation per lane).
        // v336 does not select rfx_lane_id; reject a contradictory lane if a later API includes it.
        if (!row || row.id !== lane.invitation_id ||
            (row.rfx_lane_id !== undefined && row.rfx_lane_id !== lane.rfx_lane_id)) {
          throw new Error(q("xl.notConfirmed"));
        }
        sent++;
        attempting = undefined;
        if (!active.current) return;
        setDone(ids => [...ids, lane.rfx_lane_id]);
      }
      if (active.current) setStatus(q("xl.confirmedAll", sent));
    } catch (e) {
      if (active.current) {
        const uncertain = attempting ? q("xl.uncertain", attempting.lane.lane_number ?? attempting.row) : "";
        setStatus(q("xl.stopped", sent, plan.length));
        setError(`${e instanceof Error ? e.message : q("xl.sendFailed")}${uncertain}${q("xl.noRetry")}`);
      }
    } finally { if (used.current) onSettled(); finish(); }
  }

  return <section className="croom-note croom-progress" aria-label={q("xl.aria")} style={{ display: "block" }}>
    <div className="croom-progress-row">
      <div className="croom-progress-text">{progress}</div>
      <span className="croom-progress-actions">
      <span className="croom-progress-excel">{q("xl.label")}</span>
      <button type="button" className="sm" disabled={busy || consumed} onClick={download} title={q("xl.downloadTitle")}>{q("xl.download")}</button>
      <button type="button" className="sm" disabled={busy || consumed} onClick={() => input.current?.click()} title={q("xl.importTitle")}>{q("xl.import")}</button>
      </span>
      <input ref={input} type="file" accept=".xlsx" aria-label={q("xl.fileAria")} hidden disabled={busy || consumed}
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
    </div>
    {busy && <p role="status">{status || q("xl.preparing")}</p>}
    {error && <ErrorBanner message={error} />}
    {plan.length > 0 && <div aria-label={q("xl.reviewAria")} role="region">
      <h4>{q("xl.reviewTitle", plan.length)}</h4>
      <p>{q("xl.reviewNote")}</p>
      {plan.map(offer => {
        // Without a model there is nothing to explain yet: MARKSMAN defines it before awarding.
        const model = offer.form.commercial_model
          ? modelCopy(offer.form.commercial_model)
          : { label: q("model.none.label"), enter: q("form.modelNoneHint"), effect: "" };
        return <article key={offer.lane.rfx_lane_id} style={{ borderTop: "1px solid var(--border, #ddd)", padding: "12px 0" }}>
          <b>{q("xl.lane", offer.lane.lane_number ?? offer.row, String(offer.lane.origin ?? ""), String(offer.lane.destination ?? ""))}</b>
          <p>{offer.form.bid_rate} {offer.form.currency} · {model.label}{!isLockedBrokerage(offer.lane) && offer.form.commercial_model && <> · {displayOfferValue("pct", offer.form)}</>}</p>
          <p>{isLockedBrokerage(offer.lane) ? q("xl.lockedModel") : `${model.enter} ${model.effect}`.trim()}</p>
          {billingNotice(offer.form) && <p><strong>{billingNotice(offer.form)}</strong></p>}
          {done.includes(offer.lane.rfx_lane_id) && <strong>{q("xl.sentOk")}</strong>}
          <details><summary>{q("xl.reviewAll", offer.lane.lane_number ?? offer.row)}</summary>
            <dl>{offerColumns().filter(([key]) => key !== "pct" || (!isLockedBrokerage(offer.lane) && offer.form.commercial_model)).map(([key, label]) => <div key={key} style={{ margin: "6px 0", overflowWrap: "anywhere" }}>
              <dt><b>{label}</b></dt><dd style={{ margin: 0 }}>{displayOfferValue(key, offer.form)}</dd>
            </div>)}</dl>
          </details>
          {offer.warnings.length > 0 && <ul>{offer.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
        </article>;
      })}
      <p>{q("xl.sequence")}</p>
      {!consumed && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="primary" disabled={busy} onClick={send}>{q("xl.sendAll", plan.length)}</button>
        <button type="button" disabled={busy} onClick={() => setPlan([])}>{q("xl.discard")}</button>
      </div>}
    </div>}
    {!busy && status && <p role="status">{status}</p>}
    {consumed && !busy && <button type="button" onClick={() => window.location.reload()}>{q("xl.reload")}</button>}
  </section>;
}
