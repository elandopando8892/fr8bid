import { useState, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync } from "@/components/confirm";
import { Empty, ErrorBanner, InfoBanner, Pill, dateShort, money } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import {
  ACTION_STATUS_LABEL,
  ACTION_TYPE_LABEL,
  applyPlaybook,
  deleteRecord,
  LANE_STATUS_LABEL,
  LOCATION_TYPE_LABEL,
  moveOpportunityStage,
  OPEN_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  PLAYBOOKS,
  PRIORITY_LABEL,
  promoteRfi,
  RFI_STATUS_LABEL,
  setActionStatus,
  type ChildEntity,
  type ShipperRecord,
} from "./crm.service";
import { RecordDialog, SPECS } from "./RecordDialog";

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const dash = <span className="cell-sub">—</span>;
const today = () => new Date().toISOString().slice(0, 10);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface Column {
  label: string;
  render: (row: ShipperRecord) => ReactNode;
}

/**
 * One kind of record under a shipper: its table, "add" and "edit" through the
 * same form, and "delete", which is an Administrador's (delete_shipper_record).
 */
function RecordsCard({
  entity,
  shipperId,
  rows,
  columns,
  onChanged,
  emptyHint,
  header,
  rowActions,
  defaults,
}: {
  entity: ChildEntity;
  shipperId: string;
  rows: ShipperRecord[];
  columns: Column[];
  onChanged: () => void;
  emptyHint: string;
  header?: (run: Runner) => ReactNode;
  rowActions?: (row: ShipperRecord, run: Runner) => ReactNode;
  defaults?: Record<string, string>;
}) {
  const { can } = useAuth();
  const canWork = can("operate");
  const isAdmin = can("admin");
  const spec = SPECS[entity];
  const [editing, setEditing] = useState<ShipperRecord | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run: Runner = async (task) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await task();
      if (message) setNotice(message);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: ShipperRecord) => {
    const ok = await confirmAsync(
      `Se eliminará ${spec.gender === "f" ? "esta" : "este"} ${spec.noun} del shipper. No se puede deshacer.\n\n¿Continuar?`,
    );
    if (ok) await run(async () => {
      await deleteRecord(entity, shipperId, row.id);
      return `${capital(spec.noun)} ${spec.gender === "f" ? "eliminada" : "eliminado"}.`;
    });
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
        <h2 style={{ margin: 0 }}>{spec.title}</h2>
        <span className="cell-sub">{rows.length}</span>
        <div className="spacer" />
        <button disabled={!canWork || busy} title={canWork ? undefined : NEED_REASON.operate} onClick={() => setEditing("new")}>
          Agregar {spec.noun}
        </button>
      </div>
      <div style={{ display: "grid", gap: 10, padding: notice || error || header ? "12px 16px 0" : 0 }}>
        {notice && <InfoBanner>{notice}</InfoBanner>}
        {error && <ErrorBanner message={error} />}
        {header?.(run)}
      </div>
      {!rows.length ? (
        <div style={{ padding: 16 }}>
          <Empty title={`Sin ${spec.plural}`} hint={emptyHint} />
        </div>
      ) : (
        <table className="data" style={{ border: "none" }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.label}>{column.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.label}>{column.render(row)}</td>
                ))}
                <td style={{ whiteSpace: "nowrap" }}>
                  {rowActions?.(row, run)}
                  <button className="ne-link" disabled={!canWork || busy} onClick={() => setEditing(row)}>
                    Editar
                  </button>
                  <button
                    className="ne-link"
                    disabled={!isAdmin || busy}
                    title={isAdmin ? undefined : NEED_REASON.admin}
                    onClick={() => remove(row)}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <RecordDialog
          spec={spec}
          shipperId={shipperId}
          record={editing === "new" ? null : editing}
          defaults={defaults}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice(`${capital(spec.noun)} ${spec.gender === "f" ? "guardada" : "guardado"}.`);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

type Runner = (task: () => Promise<string | void>) => Promise<void>;

interface TabProps {
  shipperId: string;
  rows: ShipperRecord[];
  onChanged: () => void;
}

const byDue = (a: ShipperRecord, b: ShipperRecord) => str(a.due_date || "9999").localeCompare(str(b.due_date || "9999"));

export function OpportunitiesTab({ shipperId, rows, onChanged, rfis }: TabProps & { rfis: ShipperRecord[] }) {
  const { can } = useAuth();
  const canWork = can("operate");
  const sorted = [...rows].sort((a, b) => Number(!OPEN_STAGES.has(str(a.stage))) - Number(!OPEN_STAGES.has(str(b.stage))) || byDue(a, b));
  const rfiName = (id: unknown) => rfis.find((rfi) => rfi.id === id)?.rfi_name;
  return (
    <RecordsCard
      entity="opportunities"
      shipperId={shipperId}
      rows={sorted}
      onChanged={onChanged}
      emptyHint="Una oportunidad es un negocio posible con este shipper: un contrato, un RFx o una propuesta."
      defaults={{ stage: "identified", currency: "USD" }}
      columns={[
        {
          label: "Oportunidad",
          render: (row) => (
            <>
              <div className="cell-title">{str(row.opportunity_name)}</div>
              <div className="cell-sub">
                {[row.next_action ? `Siguiente: ${str(row.next_action)}` : null, row.rfi_id ? `RFI: ${str(rfiName(row.rfi_id) ?? "ligado")}` : null, row.rfx_project_id ? "Proyecto RFx creado" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </>
          ),
        },
        {
          label: "Etapa",
          render: (row) => <StageSelect row={row} disabled={!canWork} onChanged={onChanged} />,
        },
        { label: "Probabilidad", render: (row) => (row.probability !== null && row.probability !== undefined ? `${str(row.probability)}%` : dash) },
        {
          label: "Valor",
          render: (row) => (row.estimated_value ? money(row.estimated_value, str(row.currency) || "USD") : dash),
        },
        { label: "Fecha objetivo", render: (row) => (row.due_date ? dateShort(row.due_date) : dash) },
      ]}
    />
  );
}

/** Moving a deal's stage; won and lost ask first, as rateware does. */
function StageSelect({ row, disabled, onChanged }: { row: ShipperRecord; disabled: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const stage = str(row.stage) || "identified";
  async function move(next: string) {
    if (next === stage) return;
    if ((next === "won" || next === "lost") && !(await confirmAsync(`¿Marcar «${str(row.opportunity_name)}» como ${OPPORTUNITY_STAGE_LABEL[next].toLowerCase()}?`))) return;
    setBusy(true);
    try {
      await moveOpportunityStage(row.id, next);
      onChanged();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <select value={stage} disabled={disabled || busy} onChange={(e) => move(e.target.value)} aria-label="Etapa">
      {Object.entries(OPPORTUNITY_STAGE_LABEL).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function ActionsTab({ shipperId, rows, onChanged }: TabProps) {
  const { can } = useAuth();
  const canWork = can("operate");
  const order: Record<string, number> = { in_progress: 0, open: 1, done: 2, cancelled: 3 };
  const sorted = [...rows].sort((a, b) => (order[str(a.status)] ?? 1) - (order[str(b.status)] ?? 1) || byDue(a, b));
  return (
    <RecordsCard
      entity="actions"
      shipperId={shipperId}
      rows={sorted}
      onChanged={onChanged}
      emptyHint="Las acciones son el siguiente paso con la cuenta: una llamada, un correo, una reunión."
      defaults={{ action_type: "follow_up", priority: "normal" }}
      header={(run) => (
        <div>
          <div className="cell-sub" style={{ marginBottom: 6 }}>
            Planes de trabajo: cada uno abre tres acciones con sus fechas (las que ya estén abiertas no se repiten).
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {PLAYBOOKS.map((playbook) => (
              <button
                key={playbook.key}
                title={canWork ? playbook.hint : NEED_REASON.operate}
                disabled={!canWork}
                onClick={() =>
                  run(async () => {
                    const { created, skipped } = await applyPlaybook(shipperId, playbook.key);
                    return `${playbook.label}: ${created} acción(es) nueva(s)${skipped ? `; ${skipped} ya estaban abiertas` : ""}.`;
                  })
                }
              >
                {playbook.label}
              </button>
            ))}
          </div>
        </div>
      )}
      rowActions={(row, run) => {
        const status = str(row.status) || "open";
        const next = status === "open" ? ["in_progress", "Iniciar"] : status === "in_progress" ? ["done", "Completar"] : ["open", "Reabrir"];
        return (
          <button
            className="ne-link"
            disabled={!canWork}
            onClick={() =>
              run(async () => {
                await setActionStatus(row.id, next[0]);
              })
            }
          >
            {next[1]}
          </button>
        );
      }}
      columns={[
        {
          label: "Acción",
          render: (row) => (
            <>
              <div className="cell-title" style={str(row.status) === "done" || str(row.status) === "cancelled" ? { textDecoration: "line-through", opacity: 0.7 } : undefined}>
                {str(row.title)}
              </div>
              {row.notes ? <div className="cell-sub">{str(row.notes)}</div> : null}
            </>
          ),
        },
        { label: "Tipo", render: (row) => ACTION_TYPE_LABEL[str(row.action_type)] ?? (str(row.action_type) || dash) },
        { label: "Estado", render: (row) => <Pill tone={str(row.status) === "done" ? "green" : str(row.status) === "in_progress" ? "blue" : ""}>{ACTION_STATUS_LABEL[str(row.status)] ?? (str(row.status) || "Abierta")}</Pill> },
        {
          label: "Prioridad",
          render: (row) => (
            <Pill tone={str(row.priority) === "urgent" ? "red" : str(row.priority) === "high" ? "amber" : ""}>{PRIORITY_LABEL[str(row.priority)] ?? (str(row.priority) || "Normal")}</Pill>
          ),
        },
        {
          label: "Vence",
          render: (row) => {
            if (!row.due_date) return dash;
            const late = ["open", "in_progress"].includes(str(row.status) || "open") && str(row.due_date).slice(0, 10) < today();
            return <span style={late ? { color: "var(--red)", fontWeight: 600 } : undefined}>{dateShort(row.due_date)}</span>;
          },
        },
        { label: "Responsable", render: (row) => (row.owner_email_assignee ? str(row.owner_email_assignee) : dash) },
      ]}
    />
  );
}

export function RfisTab({ shipperId, rows, onChanged, opportunities }: TabProps & { opportunities: ShipperRecord[] }) {
  const { can } = useAuth();
  const canWork = can("operate");
  const dealFor = (rfi: ShipperRecord) => opportunities.find((opportunity) => opportunity.rfi_id === rfi.id);
  return (
    <RecordsCard
      entity="rfis"
      shipperId={shipperId}
      rows={[...rows].sort(byDue)}
      onChanged={onChanged}
      emptyHint="Los RFIs que el shipper manda o que le pedimos: con su referencia y su fecha."
      defaults={{ status: "draft" }}
      rowActions={(row, run) =>
        !dealFor(row) && str(row.status) !== "archived" ? (
          <button
            className="ne-link"
            disabled={!canWork}
            title={canWork ? "Crea una oportunidad en etapa RFI, ligada a este RFI" : NEED_REASON.operate}
            onClick={() =>
              run(async () => {
                const res = await promoteRfi(row.id);
                return res.created ? `Oportunidad creada desde «${str(row.rfi_name)}».` : "Ese RFI ya tenía su oportunidad.";
              })
            }
          >
            Crear oportunidad
          </button>
        ) : null
      }
      columns={[
        {
          label: "RFI",
          render: (row) => (
            <>
              <div className="cell-title">{str(row.rfi_name)}</div>
              <div className="cell-sub">
                {[row.external_reference ? `Ref. ${str(row.external_reference)}` : null].filter(Boolean).join(" · ")}
                {row.source_url ? (
                  <>
                    {" "}
                    <a href={str(row.source_url)} target="_blank" rel="noreferrer">
                      Abrir liga
                    </a>
                  </>
                ) : null}
              </div>
            </>
          ),
        },
        { label: "Estado", render: (row) => RFI_STATUS_LABEL[str(row.status)] ?? (str(row.status) || dash) },
        { label: "Vence", render: (row) => (row.due_date ? dateShort(row.due_date) : dash) },
        {
          label: "Oportunidad",
          render: (row) => {
            const deal = dealFor(row);
            return deal ? (
              <>
                <div>{str(deal.opportunity_name)}</div>
                <div className="cell-sub">{OPPORTUNITY_STAGE_LABEL[str(deal.stage)] ?? str(deal.stage)}</div>
              </>
            ) : (
              <span className="cell-sub">Sin oportunidad</span>
            );
          },
        },
      ]}
    />
  );
}

export function LocationsTab({ shipperId, rows, onChanged }: TabProps) {
  return (
    <RecordsCard
      entity="locations"
      shipperId={shipperId}
      rows={[...rows].sort((a, b) => str(a.location_name).localeCompare(str(b.location_name)))}
      onChanged={onChanged}
      emptyHint="Plantas, almacenes y centros de distribución del shipper: dónde se carga y descarga."
      defaults={{ country_code: "MX" }}
      columns={[
        {
          label: "Sitio",
          render: (row) => (
            <>
              <div className="cell-title">{str(row.location_name)}</div>
              <div className="cell-sub">{LOCATION_TYPE_LABEL[str(row.location_type)] ?? str(row.location_type)}</div>
            </>
          ),
        },
        {
          label: "Dirección",
          render: (row) => (
            <>
              <div>{[row.address_line_1, row.address_line_2].filter(Boolean).map(str).join(", ") || dash}</div>
              <div className="cell-sub">{[row.city, row.state_code, row.country_code, row.postal_code].filter(Boolean).map(str).join(", ")}</div>
            </>
          ),
        },
        {
          label: "Contacto del sitio",
          render: (row) =>
            row.contact_name || row.contact_email || row.contact_phone ? (
              <>
                <div>{str(row.contact_name)}</div>
                <div className="cell-sub">{[row.contact_email, row.contact_phone].filter(Boolean).map(str).join(" · ")}</div>
              </>
            ) : (
              dash
            ),
        },
        {
          label: "Horario",
          render: (row) => (
            <>
              <div>{str(row.operating_hours) || dash}</div>
              <div className="cell-sub">{[row.appointment_required ? "Con cita" : null, row.handling_type ? str(row.handling_type) : null].filter(Boolean).join(" · ")}</div>
            </>
          ),
        },
      ]}
    />
  );
}

export function LanesTab({ shipperId, rows, onChanged }: TabProps) {
  return (
    <RecordsCard
      entity="lanes"
      shipperId={shipperId}
      rows={[...rows].sort((a, b) => str(a.origin).localeCompare(str(b.origin)))}
      onChanged={onChanged}
      emptyHint="Las rutas que mueve el shipper: origen, destino, equipo y volumen. Sirven para saber a quién invitar."
      defaults={{ currency: "USD", status: "active" }}
      columns={[
        {
          label: "Ruta",
          render: (row) => (
            <>
              <div className="cell-title">
                {str(row.origin)} → {str(row.destination)}
              </div>
              <div className="cell-sub">{[row.lane_name, [row.origin_market, row.destination_market].filter(Boolean).map(str).join(" → ")].filter(Boolean).map(str).join(" · ")}</div>
            </>
          ),
        },
        { label: "Unidad", render: (row) => [row.equipment, row.trailer, row.configuration].filter(Boolean).map(str).join(" · ") || dash },
        { label: "Operación · servicio", render: (row) => [row.operation, row.service].filter(Boolean).map(str).join(" · ") || dash },
        { label: "Cargas / semana", render: (row) => (row.weekly_volume !== null && row.weekly_volume !== undefined ? str(row.weekly_volume) : dash) },
        { label: "Tarifa actual", render: (row) => (row.current_rate ? money(row.current_rate, str(row.currency) || "USD") : dash) },
        { label: "Estado", render: (row) => LANE_STATUS_LABEL[str(row.status)] ?? (str(row.status) || dash) },
      ]}
    />
  );
}
