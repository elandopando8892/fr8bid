import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, Spinner, dateShort, money } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import { moveRelationshipStage, relationshipPipeline, type AccountRow } from "../crm.service";
import { SHIPPER_STAGE_LABEL } from "../shippers.service";

const STAGES = ["target", "qualified", "customer", "at_risk", "inactive"] as const;

/**
 * The relationship pipeline: every current shipper by its relationship stage
 * (archived ones are left out). A shipper moves with "Mover a"; the card
 * moves at once and goes back if the server refuses.
 */
export function PipelineView() {
  const { can } = useAuth();
  const canWork = can("operate");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const data = useAsync(() => relationshipPipeline(query, status), [query, status]);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setRows(data.data?.rows ?? []), [data.data]);

  async function move(row: AccountRow, stage: string) {
    const before = row.relationship_stage;
    setError(null);
    setRows((all) => all.map((r) => (r.id === row.id ? { ...r, relationship_stage: stage } : r)));
    try {
      await moveRelationshipStage(row.id, stage);
    } catch (e) {
      setRows((all) => all.map((r) => (r.id === row.id ? { ...r, relationship_stage: before } : r)));
      setError((e as Error).message);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <input style={{ width: 320 }} value={search} placeholder="Buscar shipper, dominio, contacto o ciudad…" aria-label="Buscar en el pipeline" onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
          <option value="all">Todos los vigentes</option>
          <option value="prospect">Prospectos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <div className="spacer" />
        <button onClick={data.reload} disabled={data.loading}>
          Actualizar
        </button>
      </div>
      {(data.error || error) && <ErrorBanner message={(data.error || error)!} />}
      {data.loading && !data.data ? (
        <Spinner label="Cargando pipeline…" />
      ) : !rows.length ? (
        <Empty title="No hay shippers en esta vista" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(220px, 1fr))", gap: 10, overflowX: "auto" }}>
          {STAGES.map((stage) => {
            const cards = rows.filter((row) => (row.relationship_stage || "target") === stage);
            return (
              <section key={stage} style={{ background: "var(--panel-2, rgba(0,0,0,0.03))", borderRadius: 8, padding: 8, minWidth: 220 }}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <strong>{SHIPPER_STAGE_LABEL[stage]}</strong>
                  <div className="spacer" />
                  <span className="cell-sub">{cards.length}</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {cards.map((row) => (
                    <article key={row.id} className="card" style={{ padding: 10 }}>
                      <Link to={`/shippers/${row.id}`} className="cell-title">
                        {row.shipper_name || row.id}
                      </Link>
                      <div className="cell-sub">{row.domain || row.industry || ""}</div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        {row.primary_contact_name || row.primary_contact_email ? (
                          <div>Contacto: {row.primary_contact_name || row.primary_contact_email}</div>
                        ) : (
                          <div className="cell-sub">Sin contacto</div>
                        )}
                        <div className="cell-sub">
                          {row.open_opportunity_count ?? 0} oportunidad(es) · {row.active_rfi_count ?? 0} RFI(s) · {row.open_action_count ?? 0} acción(es)
                        </div>
                        {row.pipeline_currency === "mixed" ? (
                          <div className="cell-sub">Valor abierto en varias monedas</div>
                        ) : row.pipeline_value ? (
                          <div>Valor abierto: {money(row.pipeline_value, row.pipeline_currency || "USD")}</div>
                        ) : null}
                        {row.next_action && (
                          <Link to={`/shippers/${row.id}?tab=acciones`} style={{ display: "block", marginTop: 4 }}>
                            {row.due_action_count ? "Vencida: " : "Siguiente: "}
                            {row.next_action}
                            {row.next_due_date ? ` (${dateShort(row.next_due_date)})` : ""}
                          </Link>
                        )}
                      </div>
                      <select
                        style={{ marginTop: 8, width: "100%" }}
                        value={stage}
                        disabled={!canWork}
                        title={canWork ? undefined : NEED_REASON.operate}
                        aria-label={`Mover ${row.shipper_name ?? ""} a otra etapa`}
                        onChange={(e) => move(row, e.target.value)}
                      >
                        {STAGES.map((option) => (
                          <option key={option} value={option}>
                            {option === stage ? SHIPPER_STAGE_LABEL[option] : `Mover a ${SHIPPER_STAGE_LABEL[option]}`}
                          </option>
                        ))}
                      </select>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
