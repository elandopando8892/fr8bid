import { useState } from "react";
import { Dialog, ErrorBanner } from "@/components/ui";
import { CHANNEL_LABEL, saveContact, type ShipperContact } from "./shippers.service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactField = "contact_name" | "title" | "department" | "email" | "phone" | "whatsapp_phone" | "preferred_channel" | "status" | "notes";

/**
 * One contact of a shipper, new or edited. The backend asks for the name on
 * every save, so it always goes; of the rest, only what changed.
 */
export function ContactDialog({
  shipperId,
  contact,
  onClose,
  onSaved,
}: {
  shipperId: string;
  contact: ShipperContact | null;
  onClose: () => void;
  onSaved: (contact: ShipperContact) => void;
}) {
  const initial = (key: ContactField) => String(contact?.[key] ?? (key === "status" ? "active" : ""));
  const [form, setForm] = useState<Record<ContactField, string>>(() => ({
    contact_name: initial("contact_name"),
    title: initial("title"),
    department: initial("department"),
    email: initial("email"),
    phone: initial("phone"),
    whatsapp_phone: initial("whatsapp_phone"),
    preferred_channel: initial("preferred_channel"),
    status: initial("status"),
    notes: initial("notes"),
  }));
  const [primary, setPrimary] = useState(Boolean(contact?.is_primary));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: ContactField) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const name = form.contact_name.trim();
  const email = form.email.trim();
  const emailValid = !email || EMAIL.test(email);
  const canSave = Boolean(name) && emailValid && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const row: Partial<ShipperContact> = { contact_name: name };
    for (const key of Object.keys(form) as ContactField[]) {
      if (key === "contact_name") continue;
      const value = form[key].trim();
      if (!contact ? value : value !== initial(key).trim()) row[key] = value || null;
    }
    if (!contact ? primary : primary !== Boolean(contact.is_primary)) row.is_primary = primary;
    try {
      onSaved(await saveContact(shipperId, row, contact?.id));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const field = (label: string, key: ContactField, type = "text", placeholder = "") => (
    <label className="field" style={{ flex: 1 }}>
      <span>{label}</span>
      <input type={type} value={form[key]} placeholder={placeholder} onChange={(e) => set(key)(e.target.value)} />
    </label>
  );

  return (
    <Dialog
      title={contact ? "Editar contacto" : "Nuevo contacto"}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <div className="spacer" />
          <button className="primary" disabled={!canSave} onClick={save}>
            {busy ? "Guardando…" : "Guardar contacto"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {error && <ErrorBanner message={error} />}
        {field("Nombre *", "contact_name")}
        <div className="row" style={{ alignItems: "flex-start" }}>
          {field("Puesto", "title", "text", "Gerente de logística")}
          {field("Área", "department", "text", "Compras, tráfico…")}
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Correo</span>
            <input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} />
            {!emailValid && <span style={{ color: "var(--red)", fontSize: 11.5 }}>Correo no válido.</span>}
          </label>
          {field("Teléfono", "phone", "tel", "+52 81 …")}
          {field("WhatsApp", "whatsapp_phone", "tel", "+52 81 …")}
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Canal preferido</span>
            <select value={form.preferred_channel} onChange={(e) => set("preferred_channel")(e.target.value)}>
              <option value="">—</option>
              {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {contact && (
            <label className="field" style={{ flex: 1 }}>
              <span>Estado</span>
              <select value={form.status} onChange={(e) => set("status")(e.target.value)}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo (ya no está)</option>
              </select>
            </label>
          )}
        </div>
        <label className="row" style={{ gap: 6, alignItems: "center" }}>
          <input type="checkbox" style={{ width: 15 }} checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
          <span>Contacto principal (el que ven QuoteDesk, Intake y el Bid Room)</span>
        </label>
        <label className="field">
          <span>Notas</span>
          <textarea rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}
