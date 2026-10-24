import { useEffect, useRef, useState } from "react";
import { useLang } from "@/i18n/language";
import { ErrorBanner } from "@/components/ui";
import { createPublishedReader, publishedReadIsCurrent, type PublishedReadState } from "./published-classification.service";

export function PublishedClassification({ org }: { org: string }) {
  const es = useLang() === "es", text = (a: string, b: string) => es ? a : b;
  const [state, setState] = useState<PublishedReadState>({ organizationId: org, status: "loading", result: null, checkedAt: 0 });
  const [now, setNow] = useState(Date.now());
  const reader = useRef<ReturnType<typeof createPublishedReader> | null>(null);
  useEffect(() => {
    const active = createPublishedReader(org, value => { setState(value); setNow(Date.now()); });
    reader.current = active;
    void active.refresh();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { active.dispose(); reader.current = null; clearInterval(timer); };
  }, [org]);
  const matching = state.organizationId === org;
  const busy = !matching || state.status === "loading";
  const current = publishedReadIsCurrent(state, org, now);
  const publication = current ? state.result?.publication : null;
  return <section className="published-classification" aria-labelledby="published-classification-title">
    <div className="evidence-toolbar">
      <h2 id="published-classification-title">{text("Clasificación publicada", "Published classification")}</h2>
      <button disabled={busy || !org} onClick={() => void reader.current?.refresh()}>{text("Actualizar publicación", "Refresh publication")}</button>
    </div>
    <p>{text("Se carga automáticamente desde Rateware para tu organización. La publicación parcial conserva el censo y las fuentes originales.", "Loaded automatically from Rateware for your organization. This partial publication preserves the census and original sources.")}</p>
    {busy && <p role="status">{text("Cargando clasificación publicada…", "Loading published classification…")}</p>}
    {matching && state.status === "error" && <ErrorBanner message={text("No se pudo cargar y verificar la clasificación publicada. Actualiza para volver a consultar; no se muestran resultados anteriores.", "The published classification could not be loaded and verified. Refresh to query again; previous results are hidden.")} />}
    {matching && state.status === "ready" && !current && <p role="status">{text("Lectura vencida · actualiza la publicación para consultar su estado vigente.", "Read expired · refresh the publication to check its current state.")}</p>}
    {current && state.result?.status === "empty" && <p role="status">{text("No hay una clasificación publicada vigente para esta organización.", "No current published classification exists for this organization.")}</p>}
    {publication && <>
      <p role="status">{text("Publicación verificada · 13 filas", "Publication verified · 13 rows")}</p>
      <div className="evidence-counts">
        <span><b>{publication.rows.length}</b> {text("Águila de Oro · MX Northbound", "Águila de Oro · MX Northbound")}</span>
        {publication.pending.map(p => <span key={p.key}><b>{p.row_count}</b> {p.key === "nava" ? text("Nava · cruce pendiente", "Nava · crossing pending") : text("Octavio · identidad pendiente", "Octavio · identity pending")}</span>)}
      </div>
      <h3>Águila de Oro · {publication.rows[0].template_names[0]}</h3>
      <p>{text("Compatibilidad técnica aprobada. Se conserva la membresía con rol de ejecución pendiente; sin autorización para preselección RFQ, operación o contacto.", "Technical compatibility approved. Membership is retained with the execution role pending; RFQ preselection, operations and contact remain unauthorized.")}</p>
      <p>{text("El documento original indica MX Southbound. La clasificación derivada aprobada es MX Northbound; el documento y la tarifa original se conservan.", "The original document says MX Southbound. The approved derived classification is MX Northbound; the document and original rate are preserved.")}</p>
      <div className="crm-table-wrap"><table className="data evidence-table"><caption>{text("13 filas publicadas de Águila de Oro", "13 published Águila de Oro rows")}</caption><thead><tr>
        <th>{text("Embarque", "Shipment")}</th><th>{text("Origen", "Origin")}</th><th>{text("Destino", "Destination")}</th>
        <th>{text("Original", "Original")}</th><th>{text("Clasificación derivada", "Derived classification")}</th><th>{text("Fuente", "Source")}</th>
      </tr></thead><tbody>{publication.rows.map(row => <tr key={row.rate_id}>
        <td>{row.shipment_id}</td><td>{row.origin}</td><td>{row.destination}</td><td>{row.source_operation}</td><td>{row.derived_operation}</td>
        <td>{row.source_sheet} · {text("fila", "row")} {row.source_row}</td>
      </tr>)}</tbody></table></div>
      <div className="published-pending" aria-label={text("Pendientes conservados", "Retained pending cases")}>
        {publication.pending.map(p => <div key={p.key}>
          <h3>{p.key === "nava" ? "Nava" : "Octavio"} · {p.row_count} {text(p.row_count === 1 ? "fila pendiente" : "filas pendientes", p.row_count === 1 ? "pending row" : "pending rows")}</h3>
          <p>{p.key === "nava" ? text("Falta corroborar el cruce fronterizo. Se conserva la clasificación pendiente.", "The border crossing still needs corroboration. Classification remains pending.") : text("Identidad sin corroborar. Se conserva la fila original pendiente.", "Identity is uncorroborated. The original row remains pending.")}</p>
        </div>)}
      </div>
      <details className="evidence-hashes"><summary>{text("Trazabilidad de publicación", "Publication traceability")}</summary>
        <p>{text("Publicado", "Published")}: {new Date(publication.completed_at).toLocaleString(es ? "es-MX" : "en-US")}</p>
        <p>{text("Consulta", "Read")}: {new Date(state.checkedAt).toLocaleString(es ? "es-MX" : "en-US")}</p>
        <p>Run: {publication.run_id}</p><p>{text("Censo original", "Original census")}: {publication.source_run_id}</p>
        <p>Payload SHA-256: {publication.payload_sha256}</p><p>{publication.methodology_version}</p>
        <ul>{publication.rows.map(row => <li key={row.rate_id}>{row.shipment_id} · {row.rate_id} · SHA-256: {row.source_sha256}</li>)}</ul>
      </details>
    </>}
  </section>;
}
