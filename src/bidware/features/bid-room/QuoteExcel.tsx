import { useEffect, useRef, useState } from "react";
import { ErrorBanner } from "@/components/ui";
import { confirmAsync } from "@/components/confirm";
import { billingNotice, eventLanes, getInvitation, modelSpec, offerPayload, submitBid, type BookLane } from "./bidroom.service";
import { buildBidTemplate, currentOfferForSend, displayOfferValue, OFFER_COLUMNS, parseBidTemplate, type ImportedOffer } from "./bid-template";

export function QuoteExcel({ token, eventId, onBusy, onSettled }: {
  token: string;
  eventId: string;
  onBusy: (busy: boolean) => void;
  onSettled: () => void;
}) {
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
      if (!lanes.length || lanes.length > 1000) throw new Error("No hay rutas disponibles o se exceden 1,000 rutas en este archivo.");
      const book = await buildBidTemplate(lanes);
      const XLSX = await import("xlsx");
      if (active.current) XLSX.writeFile(book, "ofertas-rfx.xlsx");
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : "No se pudo descargar la plantilla.");
    } finally { finish(); }
  }
  async function upload(file: File) {
    if (!start()) return;
    setPlan([]); setStatus(""); setDone([]);
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("Usa la plantilla .xlsx descargada desde este Bid Room.");
      if (file.size > 5 * 1024 * 1024) throw new Error("El archivo supera 5 MiB.");
      const data = await file.arrayBuffer();
      const lanes = await currentLanes();
      const offers = await parseBidTemplate(data, lanes);
      if (active.current) setPlan(offers);
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally { finish(); }
  }
  async function send() {
    if (!plan.length || !start()) return;
    let attempting: ImportedOffer | undefined;
    let sent = 0;
    try {
      if (plan.some(offer => billingNotice(offer.form))) {
        const accepted = await confirmAsync("Para las rutas con Costo + margen o Carrier comparte facturación, el porcentaje acordado se facturará 5 días hábiles después de la confirmación de pago del embarcador.\n\nLos porcentajes aplicables están detallados por ruta en la revisión. ¿Confirmas el envío?", { ok: "Confirmar y enviar ofertas", cancel: "Volver a revisar" });
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
        setStatus(`Enviando ruta ${lane.lane_number ?? offer.row} (${sent + 1} de ${plan.length})…`);
        attempting = offer;
        const response = await submitBid(lane.invitation_token!, offerPayload(offer.form, lane));
        const row = response.row as Record<string, unknown> | undefined;
        // The API receipt identifies the invitation (one invitation per lane).
        // v336 does not select rfx_lane_id; reject a contradictory lane if a later API includes it.
        if (!row || row.id !== lane.invitation_id ||
            (row.rfx_lane_id !== undefined && row.rfx_lane_id !== lane.rfx_lane_id)) {
          throw new Error("El servidor no confirmó la ruta esperada.");
        }
        sent++;
        attempting = undefined;
        if (!active.current) return;
        setDone(ids => [...ids, lane.rfx_lane_id]);
      }
      if (active.current) setStatus(`${sent} ofertas confirmadas. Recarga para verlas en el formulario.`);
    } catch (e) {
      if (active.current) {
        const uncertain = attempting ? ` La ruta ${attempting.lane.lane_number ?? attempting.row} quedó sin confirmación; podría haberse guardado. Compruébala al recargar.` : "";
        setStatus(`${sent} de ${plan.length} ofertas confirmadas. Secuencia detenida.`);
        setError(`${e instanceof Error ? e.message : "No se pudo completar el envío."}${uncertain} No se reintentará automáticamente.`);
      }
    } finally { if (used.current) onSettled(); finish(); }
  }

  return <section className="croom-note" aria-label="Cotizar con Excel" style={{ display: "block" }}>
    <h3>Cotizar con Excel</h3>
    <p>Descarga tus rutas, completa la plantilla y revisa las ofertas antes de enviarlas.</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" disabled={busy || consumed} onClick={download}>Descargar plantilla</button>
      <button type="button" disabled={busy || consumed} onClick={() => input.current?.click()}>Importar Excel</button>
      <input ref={input} type="file" accept=".xlsx" aria-label="Archivo de ofertas Excel" hidden disabled={busy || consumed}
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
    </div>
    {busy && <p role="status">{status || "Preparando archivo…"}</p>}
    {error && <ErrorBanner message={error} />}
    {plan.length > 0 && <div aria-label="Revisión de ofertas Excel" role="region">
      <h4>{plan.length} ofertas para revisar</h4>
      <p>Se sustituirán los datos de estas rutas. «Sin dato» borra el valor anterior. Los avisos de información faltante no bloquean el envío.</p>
      {plan.map(offer => {
        const model = modelSpec(offer.form.commercial_model);
        return <article key={offer.lane.rfx_lane_id} style={{ borderTop: "1px solid var(--border, #ddd)", padding: "12px 0" }}>
          <b>Ruta {offer.lane.lane_number ?? offer.row}: {offer.lane.origin} → {offer.lane.destination}</b>
          <p>{offer.form.bid_rate} {offer.form.currency} · {model.label} · {displayOfferValue("pct", offer.form)}</p>
          <p>{model.enter} {model.effect}</p>
          {billingNotice(offer.form) && <p><strong>{billingNotice(offer.form)}</strong></p>}
          {done.includes(offer.lane.rfx_lane_id) && <strong>Envío confirmado</strong>}
          <details><summary>Revisar todos los datos de la ruta {offer.lane.lane_number ?? offer.row}</summary>
            <dl>{OFFER_COLUMNS.map(([key, label]) => <div key={key} style={{ margin: "6px 0", overflowWrap: "anywhere" }}>
              <dt><b>{label}</b></dt><dd style={{ margin: 0 }}>{displayOfferValue(key, offer.form)}</dd>
            </div>)}</dl>
          </details>
          {offer.warnings.length > 0 && <ul>{offer.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
        </article>;
      })}
      <p>El envío avanza ruta por ruta. Mantén esta página abierta; salir detiene las siguientes rutas, pero una petición iniciada puede completarse.</p>
      {!consumed && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="primary" disabled={busy} onClick={send}>Confirmar y enviar {plan.length} ofertas</button>
        <button type="button" disabled={busy} onClick={() => setPlan([])}>Descartar revisión</button>
      </div>}
    </div>}
    {!busy && status && <p role="status">{status}</p>}
    {consumed && !busy && <button type="button" onClick={() => window.location.reload()}>Recargar y comprobar ofertas</button>}
  </section>;
}
