type Candidate = {
  vendor_id: string; name: string; legal_name: string;
  ctpat: string; gps: string; technology: string;
};
type Route = {
  lane_id: string; lane_number: number; origin: string; destination: string;
  candidate_vendor_ids: string[]; target_buy_all_in_usd: number | null;
};
type CandidateReview = {
  schema_version: number; rfx_event_id: string; status: string; prepared_on: string;
  candidates: Candidate[]; routes: Route[]; common_pending: string[];
  retained: { name: string; reason: string }[];
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** An unpriced suggestion is never a carrier selection or a cost-based tier. */
export function readCarrierPreselection(eventId: string, master: unknown): CandidateReview | null {
  const data = record(record(master).carrier_preselection_internal);
  if (data.schema_version !== 2 || data.rfx_event_id !== eventId || data.status !== "pending_cost_classification" ||
      typeof data.prepared_on !== "string" || !Array.isArray(data.candidates) || !Array.isArray(data.routes) ||
      !data.routes.length || !Array.isArray(data.common_pending) || !Array.isArray(data.retained)) return null;
  const candidates = data.candidates.map(record);
  if (candidates.some(c => ["vendor_id","name","legal_name","ctpat","gps","technology"].some(k => typeof c[k] !== "string"))) return null;
  const ids = new Set(candidates.map(c => c.vendor_id));
  if (ids.size !== candidates.length) return null;
  const routes = data.routes.map(record);
  if (new Set(routes.map(r => r.lane_id)).size !== routes.length) return null;
  for (const route of routes) {
    if (typeof route.lane_id !== "string" || typeof route.lane_number !== "number" ||
        typeof route.origin !== "string" || typeof route.destination !== "string" ||
        !Array.isArray(route.candidate_vendor_ids) ||
        route.candidate_vendor_ids.some(id => !ids.has(id)) ||
        new Set(route.candidate_vendor_ids).size !== route.candidate_vendor_ids.length ||
        (route.target_buy_all_in_usd !== null && (typeof route.target_buy_all_in_usd !== "number" ||
          !Number.isFinite(route.target_buy_all_in_usd) || route.target_buy_all_in_usd <= 0))) return null;
  }
  if (data.common_pending.some(p => typeof p !== "string") ||
      data.retained.some(r => typeof record(r).name !== "string" || typeof record(r).reason !== "string")) return null;
  return data as unknown as CandidateReview;
}

export function CarrierPreselection({eventId, master}: {eventId: string; master: unknown}) {
  const data = readCarrierPreselection(eventId, master);
  if (!data) return null;
  const byId = new Map(data.candidates.map(c => [c.vendor_id,c]));
  const names = (ids: string[]) => ids.map(id => byId.get(id)!.name).sort((a,b) => a.localeCompare(b)).join(" · ");
  return <section className="bld-card" aria-label="Candidatos sin selección ni clasificación por costo">
    <header><h2>Transportistas candidatos · Sin selección</h2></header>
    <p><b>0 carriers seleccionados · Tier A/B/C pendiente de clasificar por costos</b></p>
    <p>{data.routes.length} rutas · {data.candidates.length} candidatos sugeridos · Corte: {data.prepared_on}.
      Los nombres son una lista exploratoria, sin orden de preferencia ni capacidad comprometida.</p>
    <p>Los objetivos de compra son referencias del bid; no son cotizaciones de estos carriers.
      Falta comparar sus costos all-in, vigencia, capacidad y condiciones, y validar CTPAT y GPS/TMS.
      No se asignan Tiers a nombres sin esa comparación.</p>
    <div style={{overflowX:"auto"}}>
      <table className="data">
        <thead><tr><th>Ruta</th><th>Origen → destino</th><th>Objetivo compra Tier A · USD all-in</th><th>Candidatos sugeridos · sin selección</th><th>Clasificación</th></tr></thead>
        <tbody>{data.routes.map(r => <tr key={r.lane_id}>
          <td>{r.lane_number}</td><td>{r.origin} → {r.destination}{r.lane_number > 6 && <div className="cell-sub">Confirmar alcance adicional</div>}</td>
          <td>{r.target_buy_all_in_usd === null ? "Pendiente" : r.target_buy_all_in_usd.toLocaleString("en-US")}</td>
          <td>{names(r.candidate_vendor_ids)}</td><td>Pendiente de comparación de costos</td>
        </tr>)}</tbody>
      </table>
    </div>
    <h3>Pendientes de CTPAT y GPS/TMS</h3>
    <p>Una declaración pública no acredita vigencia CTPAT. GPS, EDI o un portal propio no equivalen a integración con nuestro TMS.</p>
    <div style={{overflowX:"auto"}}>
      <table className="data">
        <thead><tr><th>Transportista candidato</th><th>CTPAT</th><th>GPS / monitoreo</th><th>TMS y app del operador</th></tr></thead>
        <tbody>{[...data.candidates].sort((a,b) => a.name.localeCompare(b.name)).map(c => <tr key={c.vendor_id}>
          <td title={c.legal_name}>{c.name}</td><td>{c.ctpat}</td><td>{c.gps}</td><td>{c.technology}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <details><summary>Validaciones antes de clasificar y transportistas retenidos</summary>
      <ul>{data.common_pending.map(p => <li key={p}>{p}</li>)}</ul>
      <h3>Retenidos para aclaración</h3>
      <ul>{data.retained.map(r => <li key={r.name}><b>{r.name}:</b> {r.reason}</li>)}</ul>
    </details>
  </section>;
}
