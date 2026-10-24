import { useState } from "react";
import { Dialog, ErrorBanner } from "@/components/ui";
import {
  ACTION_STATUS_LABEL,
  ACTION_TYPE_LABEL,
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  LANE_STATUS_LABEL,
  LOCATION_TYPE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  PRIORITY_LABEL,
  RFI_STATUS_LABEL,
  saveRecord,
  type ChildEntity,
  type ShipperRecord,
} from "./crm.service";

export interface FieldSpec {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "email" | "tel" | "url" | "textarea" | "select" | "checkbox";
  options?: Record<string, string>;
  wide?: boolean;
  placeholder?: string;
}

export interface EntitySpec {
  entity: ChildEntity;
  title: string;
  noun: string;
  /** "oportunidades", "RFIs"… for the empty state. */
  plural: string;
  /** The noun's gender, for "nueva oportunidad" / "nuevo sitio". */
  gender: "f" | "m";
  /** The backend asks for these on every save, updates included. */
  required: string[];
  fields: FieldSpec[];
}

/** What rateware's Shipper CRM keeps under a shipper, field by field (save_shipper_record). */
export const SPECS: Record<ChildEntity, EntitySpec> = {
  opportunities: {
    entity: "opportunities",
    title: "Oportunidades",
    noun: "oportunidad",
    plural: "oportunidades",
    gender: "f",
    required: ["opportunity_name"],
    fields: [
      { key: "opportunity_name", label: "Nombre *", wide: true, placeholder: "Contrato Monterrey → Laredo 2027" },
      { key: "stage", label: "Etapa", type: "select", options: OPPORTUNITY_STAGE_LABEL },
      { key: "probability", label: "Probabilidad (%)", type: "number" },
      { key: "estimated_value", label: "Valor estimado", type: "number" },
      { key: "currency", label: "Moneda", type: "select", options: CURRENCY_OPTIONS },
      { key: "estimated_weekly_volume", label: "Cargas por semana", type: "number" },
      { key: "target_margin", label: "Margen objetivo (%)", type: "number" },
      { key: "due_date", label: "Fecha objetivo", type: "date" },
      { key: "account_owner_email", label: "Responsable (correo)", type: "email" },
      { key: "next_action", label: "Siguiente paso", wide: true },
      { key: "notes", label: "Notas", type: "textarea", wide: true },
    ],
  },
  actions: {
    entity: "actions",
    title: "Próximas acciones",
    noun: "acción",
    plural: "próximas acciones",
    gender: "f",
    required: ["title"],
    fields: [
      { key: "title", label: "Acción *", wide: true, placeholder: "Llamar para confirmar volúmenes" },
      { key: "action_type", label: "Tipo", type: "select", options: ACTION_TYPE_LABEL },
      { key: "priority", label: "Prioridad", type: "select", options: PRIORITY_LABEL },
      { key: "status", label: "Estado", type: "select", options: ACTION_STATUS_LABEL },
      { key: "due_date", label: "Vence", type: "date" },
      { key: "owner_email_assignee", label: "Responsable (correo)", type: "email" },
      { key: "notes", label: "Notas", type: "textarea", wide: true },
    ],
  },
  rfis: {
    entity: "rfis",
    title: "RFIs",
    noun: "RFI",
    plural: "RFIs",
    gender: "m",
    required: ["rfi_name"],
    fields: [
      { key: "rfi_name", label: "Nombre del RFI *", wide: true },
      { key: "external_reference", label: "Referencia del shipper" },
      { key: "status", label: "Estado", type: "select", options: RFI_STATUS_LABEL },
      { key: "due_date", label: "Vence", type: "date" },
      { key: "source_url", label: "Liga del RFI", type: "url", wide: true },
      { key: "notes", label: "Notas", type: "textarea", wide: true },
    ],
  },
  locations: {
    entity: "locations",
    title: "Sitios",
    noun: "sitio",
    plural: "sitios",
    gender: "m",
    required: ["location_name"],
    fields: [
      { key: "location_name", label: "Nombre del sitio *", placeholder: "Planta Apodaca" },
      { key: "location_type", label: "Tipo", type: "select", options: LOCATION_TYPE_LABEL },
      { key: "address_line_1", label: "Dirección", wide: true },
      { key: "address_line_2", label: "Dirección (línea 2)", wide: true },
      { key: "city", label: "Ciudad" },
      { key: "state_code", label: "Estado" },
      { key: "country_code", label: "País", type: "select", options: COUNTRY_OPTIONS },
      { key: "postal_code", label: "Código postal" },
      { key: "market", label: "Mercado" },
      { key: "region", label: "Región" },
      { key: "contact_name", label: "Contacto del sitio" },
      { key: "contact_email", label: "Correo del sitio", type: "email" },
      { key: "contact_phone", label: "Teléfono del sitio", type: "tel" },
      { key: "operating_hours", label: "Horario", placeholder: "L-V 8:00-18:00" },
      { key: "handling_type", label: "Carga / descarga", placeholder: "Andén, montacargas…" },
      { key: "appointment_required", label: "Requiere cita", type: "checkbox" },
      { key: "notes", label: "Notas", type: "textarea", wide: true },
    ],
  },
  lanes: {
    entity: "lanes",
    title: "Rutas",
    noun: "ruta",
    plural: "rutas",
    gender: "f",
    required: ["origin", "destination"],
    fields: [
      { key: "lane_name", label: "Nombre de la ruta", wide: true },
      { key: "origin", label: "Origen *", placeholder: "Monterrey, NL" },
      { key: "destination", label: "Destino *", placeholder: "Laredo, TX" },
      { key: "origin_postal_code", label: "C.P. origen" },
      { key: "destination_postal_code", label: "C.P. destino" },
      { key: "origin_market", label: "Mercado origen" },
      { key: "destination_market", label: "Mercado destino" },
      { key: "equipment", label: "Tipo de camión" },
      { key: "trailer", label: "Tipo de equipo" },
      { key: "configuration", label: "Configuración" },
      { key: "operation", label: "Operación" },
      { key: "service", label: "Servicio" },
      { key: "weekly_volume", label: "Cargas por semana", type: "number" },
      { key: "current_rate", label: "Tarifa actual", type: "number" },
      { key: "currency", label: "Moneda", type: "select", options: CURRENCY_OPTIONS },
      { key: "status", label: "Estado", type: "select", options: LANE_STATUS_LABEL },
      { key: "notes", label: "Notas", type: "textarea", wide: true },
    ],
  },
};

type Value = string | boolean;

const stored = (field: FieldSpec, record: ShipperRecord | null): Value => {
  const value = record?.[field.key];
  if (field.type === "checkbox") return Boolean(value);
  if (value === null || value === undefined) return "";
  return field.type === "date" ? String(value).slice(0, 10) : String(value);
};

/**
 * A site, lane, RFI, opportunity or action of a shipper, new or edited. A new
 * one sends what was filled in; an edit sends what changed plus the fields
 * the backend asks for on every save.
 */
export function RecordDialog({
  spec,
  shipperId,
  record,
  defaults = {},
  onClose,
  onSaved,
}: {
  spec: EntitySpec;
  shipperId: string;
  record: ShipperRecord | null;
  defaults?: Record<string, Value>;
  onClose: () => void;
  onSaved: (row: ShipperRecord) => void;
}) {
  const [values, setValues] = useState<Record<string, Value>>(() =>
    Object.fromEntries(spec.fields.map((f) => [f.key, record ? stored(f, record) : defaults[f.key] ?? stored(f, null)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = (key: string) => String(values[key] ?? "").trim();
  const missing = spec.required.filter((key) => !text(key));
  const badNumber = spec.fields.find((f) => f.type === "number" && text(f.key) && !Number.isFinite(Number(text(f.key))));
  const badPercent = ["probability"].find((key) => text(key) && (Number(text(key)) < 0 || Number(text(key)) > 100));
  const canSave = !missing.length && !badNumber && !badPercent && !busy;

  async function save() {
    if (!canSave) return;
    const row: Record<string, unknown> = {};
    for (const field of spec.fields) {
      const value = values[field.key];
      const changed = record ? value !== stored(field, record) : field.type === "checkbox" ? value === true : text(field.key) !== "";
      if (!changed && !spec.required.includes(field.key)) continue;
      if (field.type === "checkbox") row[field.key] = Boolean(value);
      else if (field.type === "number") row[field.key] = text(field.key) === "" ? null : Number(text(field.key));
      else row[field.key] = text(field.key) || null;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveRecord(spec.entity, shipperId, row, record?.id));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`${record ? "Editar" : spec.gender === "f" ? "Nueva" : "Nuevo"} ${spec.noun}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <div className="spacer" />
          <button className="primary" disabled={!canSave} onClick={save}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {error && <ErrorBanner message={error} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {spec.fields.map((field) => {
            const set = (value: Value) => setValues((v) => ({ ...v, [field.key]: value }));
            const style = field.wide ? { gridColumn: "1 / -1" } : undefined;
            if (field.type === "checkbox") {
              return (
                <label key={field.key} className="row" style={{ ...style, gap: 6, alignItems: "center" }}>
                  <input type="checkbox" style={{ width: 15 }} checked={Boolean(values[field.key])} onChange={(e) => set(e.target.checked)} />
                  <span>{field.label}</span>
                </label>
              );
            }
            return (
              <label key={field.key} className="field" style={style}>
                <span>{field.label}</span>
                {field.type === "select" ? (
                  <select value={String(values[field.key])} onChange={(e) => set(e.target.value)}>
                    <option value="">—</option>
                    {!field.options?.[String(values[field.key])] && values[field.key] && (
                      <option value={String(values[field.key])}>{String(values[field.key])}</option>
                    )}
                    {Object.entries(field.options ?? {}).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea rows={3} value={String(values[field.key])} onChange={(e) => set(e.target.value)} />
                ) : (
                  <input
                    type={field.type === "number" ? "text" : field.type ?? "text"}
                    inputMode={field.type === "number" ? "decimal" : undefined}
                    value={String(values[field.key])}
                    placeholder={field.placeholder}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
              </label>
            );
          })}
        </div>
        {badNumber && <p style={{ color: "var(--red)", fontSize: 12, margin: 0 }}>«{badNumber.label}» debe ser un número.</p>}
        {badPercent && <p style={{ color: "var(--red)", fontSize: 12, margin: 0 }}>La probabilidad va de 0 a 100.</p>}
      </div>
    </Dialog>
  );
}
