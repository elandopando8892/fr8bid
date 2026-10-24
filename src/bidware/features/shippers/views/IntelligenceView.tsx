import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, InfoBanner, Kpis, Pill, Spinner, dateShort, money } from "@/components/ui";
import { shipperIntelligence, type AccountRow } from "../crm.service";
import { SHIPPER_STAGE_LABEL } from "../shippers.service";

const FOCUS: [string, string][] = [
  ["all", "Todas las cuentas"],
  ["ready", "Listas para trabajar"],
  ["needs_contact", "Sin contacto"],
  ["needs_lane", "Sin rutas"],
  ["due_action", "Acción vencida"],
  ["at_risk", "En riesgo"],
];

/** What the server decided each account needs next, in the team's words. */
const PRIORITY: Record<string, { label: string; tone: "red" | "amber" | "green" | "blue" | ""; detail: (row: AccountRow) => string }> = {
  due_action: { label: "Acción vencida", tone: "red", detail: (row) => (row.next_action ? `Vence: ${row.next_action}` : "Tiene una acción vencida o por vencer en 14 días.") },
  at_risk: { label: "En riesgo", tone: "red", detail: () => "La relación necesita atención comercial." },
  needs_contact: { label: "Sin contacto", tone: "amber", detail: () => "Falta un contacto principal que funcione antes de escribirle." },
  needs_lane: { label: "Sin rutas", tone: "amber", detail: () => "Faltan sus rutas o la cobertura cotizada." },
  ready: { label: "Lista", tone: "green", detail: () => "Perfil, contacto y cobertura listos para trabajar." },
  complete: { label: "Completar perfil", tone: "", detail: () => "Completa el perfil antes de salir a buscar negocio." },
};

const health = (score: number) =>
  score >= 80 ? "Operación completa" : score >= 60 ? "Lista, con detalles" : score >= 35 ? "Necesita limpieza" : "Perfil incompleto";

/**
 * How ready each shipper is to work with, as rateware scores it: contact 28,
 * site 24, lane 24, profile 14 and a live RFI or opportunity 10 points.
 */
export function IntelligenceView() {
  const [focus, setFocus] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const data = useAsync(() => shipperIntelligence(focus, query), [focus, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const counts = data.data?.counts;
  const rows = data.data?.rows ?? [];
  const num = (value: unknown) => Number(value ?? 0);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {counts && (
        <Kpis
          items={[
            { label: "Cuentas", value: data.data?.total ?? rows.length },
            { label: "Listas para trabajar", value: counts.ready, accent: true },
            { label: "Les faltan datos", value: counts.needs_data },
            { label: "Acción vencida", value: counts.due_action },
            {
              label: "Pipeline abierto",
              value:
                counts.open_pipeline_currency === "mixed"
                  ? "Varias monedas"
                  : counts.open_pipeline_value
                    ? money(counts.open_pipeline_value, counts.open_pipeline_currency || "USD")
                    : "—",
            },
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
        <input style={{ width: 300 }} value={search} placeholder="Buscar cuenta, contacto, mercado o ruta…" aria-label="Buscar" onChange={(e) => setSearch(e.target.value)} />
        <div className="spacer" />
        <button onClick={data.reload} disabled={data.loading}>
          Actualizar
        </button>
      </div>
      {data.data?.truncated && <InfoBanner>Se muestran las primeras 1,000 cuentas; usa la búsqueda para acotar.</InfoBanner>}
      {data.error && <ErrorBanner message={data.error} />}
      {data.loading && !data.data ? (
        <Spinner label="Calculando…" />
      ) : !rows.length ? (
        <Empty title="Ninguna cuenta en esta vista" />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data" style={{ border: "none" }}>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Salud</th>
                <th>Cobertura</th>
                <th>Comercial</th>
                <th>Prioridad</th>
                <th>Última actividad</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const score = num(row.health_score);
                const priority = PRIORITY[String(row.priority ?? "complete")] ?? PRIORITY.complete;
                return (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/shippers/${row.id}`} className="cell-title">
                        {row.shipper_name}
                      </Link>
                      <div className="cell-sub">
                        {[SHIPPER_STAGE_LABEL[String(row.relationship_stage ?? "")], row.headquarters_city, row.headquarters_state].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, score)}%`, height: "100%", background: score >= 60 ? "var(--green)" : score >= 35 ? "var(--amber, #d49b1f)" : "var(--red)" }} />
                      </div>
                      <div className="cell-sub">
                        {score} · {health(score)}
                      </div>
                    </td>
                    <td className="cell-sub">
                      {num(row.contact_count)} contacto(s) · {num(row.location_count)} sitio(s)
                      <br />
                      {num(row.lane_count)} ruta(s) · {num(row.market_count)} mercado(s)
                    </td>
                    <td className="cell-sub">
                      {num(row.active_rfi_count)} RFI(s) · {num(row.open_opportunity_count)} oportunidad(es)
                      <br />
                      {num(row.open_action_count)} acción(es)
                      {row.pipeline_value ? ` · ${money(row.pipeline_value, row.pipeline_currency || "USD")}` : ""}
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      <Pill tone={priority.tone}>{priority.label}</Pill>
                      <div className="cell-sub">{priority.detail(row)}</div>
                      <Link to={`/shippers/${row.id}?tab=acciones`}>Planear acción</Link>
                    </td>
                    <td className="cell-sub">{row.last_activity_at ? dateShort(row.last_activity_at) : "—"}</td>
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
