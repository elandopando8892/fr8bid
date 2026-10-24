import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, Kpis, Pill, Spinner, TopBar, dateShort } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import { crmSummary } from "./crm.service";
import { NewShipperDialog } from "./NewShipperDialog";
import { ActionQueueView } from "./views/ActionQueueView";
import { CommercialView } from "./views/CommercialView";
import { DuplicatesView } from "./views/DuplicatesView";
import { ImportView } from "./views/ImportView";
import { IntelligenceView } from "./views/IntelligenceView";
import { PipelineView } from "./views/PipelineView";
import { listShippers, shipperLabel, SHIPPER_STAGE_LABEL, SHIPPER_STATUS_LABEL, SHIPPER_TONE, type Shipper } from "./shippers.service";

const PAGE = 100;

const VIEWS = [
  ["directorio", "Directorio"],
  ["pipeline", "Pipeline"],
  ["comercial", "RFIs y oportunidades"],
  ["acciones", "Cola de acciones"],
  ["inteligencia", "Inteligencia"],
  ["duplicados", "Duplicados"],
  ["importar", "Importar"],
] as const;
type View = (typeof VIEWS)[number][0];

const FILTERS = [
  { key: "", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "prospect", label: "Prospectos" },
  { key: "inactive", label: "Inactivos" },
  { key: "archived", label: "Archivados" },
];

/**
 * The shared CRM's shippers: customers and prospects, and the views rateware's
 * Shipper CRM has across all of them (pipeline, RFIs and opportunities, action
 * queue, intelligence). In the directory "Todos" leaves the archived out, as
 * the CRM does; they have their own filter.
 */
export function ShippersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view: View = VIEWS.some(([key]) => key === params.get("vista")) ? (params.get("vista") as View) : "directorio";
  const summary = useAsync(crmSummary, []);
  const { can } = useAuth();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Shipper[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const seq = useRef(0);
  const canWork = can("operate");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (offset: number) => {
      const id = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const page = await listShippers({ search: query, status: status || undefined, offset, limit: PAGE });
        if (id !== seq.current) return;
        setRows((prev) => (offset ? [...prev, ...(page.rows ?? [])] : page.rows ?? []));
        setTotal(page.total ?? 0);
      } catch (e) {
        if (id === seq.current) setError((e as Error).message);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [query, status],
  );

  useEffect(() => {
    if (view === "directorio") load(0);
  }, [load, view]);

  return (
    <>
      <TopBar
        crumb="Procurement"
        title="Shippers"
        sub="Clientes y prospectos del CRM compartido"
        actions={
          <button className="primary" disabled={!canWork} title={canWork ? undefined : NEED_REASON.operate} onClick={() => setCreating(true)}>
            Nuevo shipper
          </button>
        }
      />
      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          {summary.data && (
            <Kpis
              items={[
                { label: "Shippers", value: summary.data.total },
                { label: "Activos", value: summary.data.active, accent: true },
                { label: "Prospectos", value: summary.data.prospects },
                { label: "Sin contacto", value: summary.data.missing_contact },
                { label: "Oportunidades abiertas", value: summary.data.open_opportunities },
              ]}
            />
          )}
          <div className="tabs" role="tablist" aria-label="Vistas del CRM de shippers">
            {VIEWS.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                className={view === key ? "active" : ""}
                onClick={() => setParams(key === "directorio" ? {} : { vista: key }, { replace: true })}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "pipeline" && <PipelineView />}
          {view === "comercial" && <CommercialView />}
          {view === "acciones" && <ActionQueueView />}
          {view === "inteligencia" && <IntelligenceView />}
          {view === "duplicados" && <DuplicatesView />}
          {view === "importar" && <ImportView />}
          {view === "directorio" && (
          <>
          {error && <ErrorBanner message={error} />}
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="tabs" role="tablist">
              {FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  role="tab"
                  aria-selected={status === filter.key}
                  className={status === filter.key ? "active" : ""}
                  onClick={() => setStatus(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="spacer" />
            <input
              style={{ width: 320 }}
              value={search}
              placeholder="Buscar por nombre, dominio, contacto o ciudad…"
              aria-label="Buscar shippers"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading && !rows.length ? (
            <Spinner label="Cargando shippers…" />
          ) : !rows.length ? (
            <Empty
              title={query ? `Ningún shipper coincide con «${query}»` : "No hay shippers en esta vista"}
              hint={canWork ? "Si es un cliente nuevo, dalo de alta con «Nuevo shipper»." : undefined}
            />
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="data" style={{ border: "none" }}>
                <thead>
                  <tr>
                    <th>Shipper</th>
                    <th>Industria</th>
                    <th>Sede</th>
                    <th>Contacto principal</th>
                    <th>Estado</th>
                    <th>Relación</th>
                    <th>Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="clickable" onClick={() => navigate(`/shippers/${row.id}`)}>
                      <td>
                        <div className="cell-title">{shipperLabel(row)}</div>
                        <div className="cell-sub">{[row.legal_name !== row.shipper_name ? row.legal_name : null, row.domain].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td>{row.industry || <span className="cell-sub">—</span>}</td>
                      <td>{[row.headquarters_city, row.headquarters_state, row.headquarters_country].filter(Boolean).join(", ") || <span className="cell-sub">—</span>}</td>
                      <td>
                        <div>{row.primary_contact_name || <span className="cell-sub">—</span>}</div>
                        <div className="cell-sub">{row.primary_contact_email || ""}</div>
                      </td>
                      <td>
                        <Pill tone={SHIPPER_TONE[row.status ?? ""] ?? ""}>{SHIPPER_STATUS_LABEL[row.status ?? ""] ?? row.status ?? "—"}</Pill>
                      </td>
                      <td>{SHIPPER_STAGE_LABEL[row.relationship_stage ?? ""] ?? row.relationship_stage ?? "—"}</td>
                      <td className="cell-sub">{dateShort(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row" style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
                <span className="cell-sub">
                  {rows.length} de {total} shipper(s)
                </span>
                <div className="spacer" />
                {rows.length < total && (
                  <button disabled={loading} onClick={() => load(rows.length)}>
                    {loading ? "Cargando…" : "Mostrar más"}
                  </button>
                )}
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </main>

      {creating && (
        <NewShipperDialog
          initialName={search.trim()}
          onClose={() => setCreating(false)}
          onCreated={(row) => navigate(`/shippers/${row.id}`)}
          onUseExisting={(row) => navigate(`/shippers/${row.id}`)}
        />
      )}
    </>
  );
}
