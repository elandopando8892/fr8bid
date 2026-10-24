import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, Kpis, Pill, Spinner, dateShort } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import { ACTION_STATUS_LABEL, ACTION_TYPE_LABEL, actionQueue, PRIORITY_LABEL, setActionStatus } from "../crm.service";

const FOCUS: [string, string][] = [
  ["open", "Abiertas"],
  ["overdue", "Vencidas"],
  ["today", "Para hoy"],
  ["upcoming", "Próximos 7 días"],
  ["done", "Hechas"],
];

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const today = () => new Date().toISOString().slice(0, 10);

/** Every shipper's next actions in one queue, with Iniciar / Completar / Reabrir. */
export function ActionQueueView() {
  const { can } = useAuth();
  const canWork = can("operate");
  const [focus, setFocus] = useState("open");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const data = useAsync(() => actionQueue(focus, query), [focus, query]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function advance(id: string, status: string) {
    setError(null);
    try {
      await setActionStatus(id, status);
      data.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const counts = data.data?.counts;
  const rows = data.data?.rows ?? [];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {counts && (
        <Kpis
          items={[
            { label: "Abiertas", value: counts.open, accent: true },
            { label: "Para hoy", value: counts.today },
            { label: "Vencidas", value: counts.overdue },
            { label: "Hechas", value: counts.done },
          ]}
        />
      )}
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <div className="tabs" role="tablist">
          {FOCUS.map(([value, label]) => (
            <button key={value} role="tab" aria-selected={focus === value} className={focus === value ? "active" : ""} onClick={() => setFocus(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <input style={{ width: 280 }} value={search} placeholder="Buscar cuenta o acción…" aria-label="Buscar acciones" onChange={(e) => setSearch(e.target.value)} />
      </div>
      {(data.error || error) && <ErrorBanner message={(data.error || error)!} />}
      {data.loading && !data.data ? (
        <Spinner label="Cargando acciones…" />
      ) : !rows.length ? (
        <Empty title="Sin acciones en esta vista" hint="Las acciones se crean en la pestaña «Próximas acciones» de cada shipper, a mano o con un plan de trabajo." />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data" style={{ border: "none" }}>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Acción</th>
                <th>Vence</th>
                <th>Responsable</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = str(row.status) || "open";
                const late = ["open", "in_progress"].includes(status) && Boolean(row.due_date) && str(row.due_date).slice(0, 10) < today();
                const next = status === "open" ? ["in_progress", "Iniciar"] : status === "in_progress" ? ["done", "Completar"] : ["open", "Reabrir"];
                return (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/shippers/${row.shipper_id}?tab=acciones`}>{row.shipper_name}</Link>
                      {row.primary_contact_email ? <div className="cell-sub">{row.primary_contact_email}</div> : null}
                    </td>
                    <td>
                      <div className="cell-title">{str(row.title)}</div>
                      <div className="cell-sub">
                        {[ACTION_TYPE_LABEL[str(row.action_type)] ?? str(row.action_type), row.notes ? str(row.notes) : null].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td style={late ? { color: "var(--red)", fontWeight: 600 } : undefined}>{row.due_date ? dateShort(row.due_date) : <span className="cell-sub">—</span>}</td>
                    <td>{row.owner_email_assignee ? str(row.owner_email_assignee) : <span className="cell-sub">—</span>}</td>
                    <td>
                      <Pill tone={str(row.priority) === "urgent" ? "red" : str(row.priority) === "high" ? "amber" : ""}>{PRIORITY_LABEL[str(row.priority)] ?? "Normal"}</Pill>
                    </td>
                    <td>{ACTION_STATUS_LABEL[status] ?? status}</td>
                    <td>
                      <button disabled={!canWork} title={canWork ? undefined : NEED_REASON.operate} onClick={() => advance(row.id, next[0])}>
                        {next[1]}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
