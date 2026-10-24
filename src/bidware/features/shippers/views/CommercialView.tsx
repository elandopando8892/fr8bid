import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, InfoBanner, Kpis, Pill, Spinner, dateShort, money } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import { commercialWork, moveOpportunityStage, OPPORTUNITY_STAGE_LABEL, promoteRfi, RFI_STATUS_LABEL } from "../crm.service";

const FOCUS: [string, string][] = [
  ["all", "Todo lo vivo"],
  ["needs_rfi", "RFIs sin oportunidad"],
  ["rfi_due", "RFIs por vencer"],
  ["deal_due", "Oportunidades por vencer"],
  ["won", "Ganadas / implementación"],
  ["lost", "Perdidas"],
];

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));

/**
 * The commercial work across every shipper: RFIs, with a button to turn one
 * into an opportunity, and opportunities, with their stage. "Por vencer" is
 * due in the next 14 days, overdue included.
 */
export function CommercialView() {
  const { can } = useAuth();
  const canWork = can("operate");
  const [focus, setFocus] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const data = useAsync(() => commercialWork(query, focus), [query, focus]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function run(task: () => Promise<string | void>) {
    setError(null);
    setNotice(null);
    try {
      const message = await task();
      if (message) setNotice(message);
      data.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const counts = data.data?.counts;
  const rfis = data.data?.rfis ?? [];
  const deals = data.data?.opportunities ?? [];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {counts && (
        <Kpis
          items={[
            { label: "RFIs abiertos", value: counts.open_rfis },
            { label: "RFIs sin oportunidad", value: counts.unlinked_rfis },
            { label: "Oportunidades abiertas", value: counts.open_opportunities, accent: true },
            { label: "Ganadas", value: counts.won_opportunities },
            { label: "Vencen en 14 días", value: counts.due_soon },
          ]}
        />
      )}
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <select value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Enfoque">
          {FOCUS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input style={{ width: 300 }} value={search} placeholder="Buscar cuenta, RFI u oportunidad…" aria-label="Buscar" onChange={(e) => setSearch(e.target.value)} />
        <div className="spacer" />
        <button onClick={data.reload} disabled={data.loading}>
          Actualizar
        </button>
      </div>
      {notice && <InfoBanner>{notice}</InfoBanner>}
      {(data.error || error) && <ErrorBanner message={(data.error || error)!} />}
      {data.loading && !data.data ? (
        <Spinner label="Cargando RFIs y oportunidades…" />
      ) : (
        <>
          <div className="card" style={{ padding: 0 }}>
            <div className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <h2 style={{ margin: 0 }}>RFIs</h2>
              <span className="cell-sub">{rfis.length}</span>
            </div>
            {!rfis.length ? (
              <div style={{ padding: 16 }}>
                <Empty title="Sin RFIs en esta vista" />
              </div>
            ) : (
              <table className="data" style={{ border: "none" }}>
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>RFI</th>
                    <th>Vence</th>
                    <th>Estado</th>
                    <th>Oportunidad</th>
                  </tr>
                </thead>
                <tbody>
                  {rfis.map((rfi) => (
                    <tr key={rfi.id}>
                      <td>
                        <Link to={`/shippers/${rfi.shipper_id}?tab=rfis`}>{rfi.shipper_name}</Link>
                      </td>
                      <td>
                        <div className="cell-title">{str(rfi.rfi_name)}</div>
                        {rfi.external_reference ? <div className="cell-sub">Ref. {str(rfi.external_reference)}</div> : null}
                      </td>
                      <td>{rfi.due_date ? dateShort(rfi.due_date) : <span className="cell-sub">—</span>}</td>
                      <td>{RFI_STATUS_LABEL[str(rfi.status)] ?? str(rfi.status)}</td>
                      <td>
                        {rfi.linked_opportunity ? (
                          <span>{str(rfi.linked_opportunity.opportunity_name)}</span>
                        ) : (
                          <button
                            className="ne-link"
                            disabled={!canWork}
                            title={canWork ? undefined : NEED_REASON.operate}
                            onClick={() =>
                              run(async () => {
                                const res = await promoteRfi(rfi.id);
                                return res.created ? `Oportunidad creada desde «${str(rfi.rfi_name)}».` : "Ese RFI ya tenía su oportunidad.";
                              })
                            }
                          >
                            Crear oportunidad
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <h2 style={{ margin: 0 }}>Oportunidades</h2>
              <span className="cell-sub">{deals.length}</span>
            </div>
            {!deals.length ? (
              <div style={{ padding: 16 }}>
                <Empty title="Sin oportunidades en esta vista" />
              </div>
            ) : (
              <table className="data" style={{ border: "none" }}>
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Oportunidad</th>
                    <th>Etapa</th>
                    <th>Valor</th>
                    <th>Vence</th>
                    <th>RFx</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal) => (
                    <tr key={deal.id}>
                      <td>
                        <Link to={`/shippers/${deal.shipper_id}?tab=oportunidades`}>{deal.shipper_name}</Link>
                      </td>
                      <td>
                        <div className="cell-title">{str(deal.opportunity_name)}</div>
                        {deal.next_action ? <div className="cell-sub">Siguiente: {str(deal.next_action)}</div> : null}
                      </td>
                      <td>
                        <select
                          value={str(deal.stage) || "identified"}
                          disabled={!canWork}
                          aria-label="Etapa"
                          onChange={async (e) => {
                            const next = e.target.value;
                            if ((next === "won" || next === "lost") && !(await confirmAsync(`¿Marcar «${str(deal.opportunity_name)}» como ${OPPORTUNITY_STAGE_LABEL[next].toLowerCase()}?`))) return;
                            await run(async () => {
                              await moveOpportunityStage(deal.id, next);
                            });
                          }}
                        >
                          {Object.entries(OPPORTUNITY_STAGE_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{deal.estimated_value ? money(deal.estimated_value, str(deal.currency) || "USD") : <span className="cell-sub">—</span>}</td>
                      <td>{deal.due_date ? dateShort(deal.due_date) : <span className="cell-sub">—</span>}</td>
                      <td>
                        {deal.rfx_project?.linked_rfx_event_id ? (
                          <Link to={`/rfx/${deal.rfx_project.linked_rfx_event_id}`}>Abrir en el Bid Room</Link>
                        ) : deal.rfx_project ? (
                          <Pill>Proyecto RFx</Pill>
                        ) : (
                          <span className="cell-sub">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
