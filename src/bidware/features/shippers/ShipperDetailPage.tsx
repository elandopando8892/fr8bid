import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, InfoBanner, Pill, Spinner, StatusPill, TopBar, dateShort } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import { listRfxEvents } from "@/features/rfx-admin/rfx.service";
import { listQuotes, STATUS_LABEL as QUOTE_STATUS_LABEL, type QuoteRow } from "@/features/quotedesk/quotedesk.service";
import type { RfxEvent } from "@/types/domain";
import { ContactDialog } from "./ContactDialog";
import { OPEN_STAGES } from "./crm.service";
import { ActivityTab, ProfileLinkCard } from "./ShipperExtras";
import { ActionsTab, LanesTab, LocationsTab, OpportunitiesTab, RfisTab } from "./ShipperRecordsTabs";
import {
  archiveShipper,
  CHANNEL_LABEL,
  cleanDomain,
  deleteContact,
  getShipper,
  restoreShipper,
  saveContact,
  shipperLabel,
  SHIPPER_STAGE_LABEL,
  SHIPPER_STATUS_LABEL,
  SHIPPER_TONE,
  updateShipper,
  type ShipperContact,
  type ShipperField,
} from "./shippers.service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELDS: { key: ShipperField; label: string; type?: "email" | "url" | "tel"; options?: Record<string, string>; wide?: boolean }[] = [
  { key: "shipper_name", label: "Nombre del shipper *", wide: true },
  { key: "legal_name", label: "Razón social" },
  { key: "domain", label: "Dominio" },
  { key: "website", label: "Sitio web", type: "url" },
  { key: "industry", label: "Industria" },
  { key: "segment", label: "Segmento" },
  { key: "status", label: "Estado", options: { prospect: "Prospecto", active: "Activo", inactive: "Inactivo" } },
  { key: "relationship_stage", label: "Relación", options: SHIPPER_STAGE_LABEL },
  { key: "account_owner_email", label: "Responsable de la cuenta (correo)", type: "email" },
  { key: "primary_contact_name", label: "Contacto principal" },
  { key: "primary_contact_email", label: "Correo del contacto principal", type: "email" },
  { key: "primary_contact_phone", label: "Teléfono del contacto principal", type: "tel" },
  { key: "headquarters_city", label: "Ciudad (sede)" },
  { key: "headquarters_state", label: "Estado (sede)" },
  { key: "headquarters_country", label: "País (sede)", options: { MX: "MX", US: "US", CA: "CA" } },
  { key: "notes", label: "Notas", wide: true },
];

const TABS = [
  ["resumen", "Resumen"],
  ["contactos", "Contactos"],
  ["oportunidades", "Oportunidades"],
  ["acciones", "Próximas acciones"],
  ["rfis", "RFIs"],
  ["sitios", "Sitios"],
  ["rutas", "Rutas"],
  ["actividad", "Actividad"],
] as const;
type Tab = (typeof TABS)[number][0];

/**
 * One shipper, as rateware's Shipper CRM keeps it: its data and profile link,
 * its contacts, opportunities, next actions, RFIs, sites and lanes, and what
 * the team did with it. Saving sends only the fields that changed. Archiving,
 * restoring and deleting records are an Administrador's.
 */
export function ShipperDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some(([key]) => key === params.get("tab")) ? (params.get("tab") as Tab) : "resumen";
  const { can } = useAuth();
  const detail = useAsync(() => getShipper(id), [id]);
  const events = useAsync(() => listRfxEvents().catch(() => [] as RfxEvent[]), []);
  const quotes = useAsync(() => listQuotes({ include_archived: true }).then((res) => res.rows ?? []).catch(() => [] as QuoteRow[]), []);
  const [draft, setDraft] = useState<Partial<Record<ShipperField, string>>>({});
  const [editing, setEditing] = useState<ShipperContact | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canWork = can("operate");
  const isAdmin = can("admin");

  if (detail.loading && !detail.data) return <Spinner label="Cargando shipper…" />;
  if (detail.error || !detail.data) {
    return (
      <main className="main">
        <ErrorBanner message={detail.error || "No encontramos ese shipper."} />
        <p>
          <Link to="/shippers">Volver a Shippers</Link>
        </p>
      </main>
    );
  }

  const row = detail.data.row;
  const contacts = [...detail.data.contacts].sort(
    (a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || String(a.contact_name ?? "").localeCompare(String(b.contact_name ?? "")),
  );
  const archived = row.status === "archived";
  const stored = (key: ShipperField) => String(row[key] ?? "");
  const value = (key: ShipperField) => draft[key] ?? stored(key);
  const changed = FIELDS.map((f) => f.key).filter((key) => draft[key] !== undefined && draft[key]!.trim() !== stored(key).trim());
  const invalidEmail = (["account_owner_email", "primary_contact_email"] as const).some((key) => value(key).trim() && !EMAIL.test(value(key).trim()));
  const canSave = canWork && changed.length > 0 && Boolean(value("shipper_name").trim()) && !invalidEmail && !busy;

  const shipperEvents = (events.data ?? []).filter((event) => event.customer_id === row.id || event.shipper_id === row.id);
  // Imported or quick-created shippers carry their primary contact only in their own fields.
  const same = (a: unknown, b: unknown) => Boolean(a) && String(a).trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  const primaryMissing =
    Boolean(row.primary_contact_name) &&
    !contacts.some((c) => same(row.primary_contact_email, c.email) || same(row.primary_contact_name, c.contact_name));
  const shipperQuotes = (quotes.data ?? []).filter((quote) => quote.shipper_id === row.id);
  const openActions = detail.data.actions.filter((action) => ["open", "in_progress"].includes(String(action.status ?? "open")));
  const counts: Partial<Record<Tab, number>> = {
    contactos: contacts.length,
    oportunidades: detail.data.opportunities.filter((opportunity) => OPEN_STAGES.has(String(opportunity.stage ?? "identified"))).length,
    acciones: openActions.length,
    rfis: detail.data.rfis.length,
    sitios: detail.data.locations.length,
    rutas: detail.data.lanes.length,
  };

  async function run(label: string, task: () => Promise<string | void>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const message = await task();
      if (message) setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      const patch: Partial<Record<ShipperField, string | null>> = {};
      for (const key of changed) {
        const text = draft[key]!.trim();
        patch[key] = key === "domain" ? cleanDomain(text) || null : text || null;
      }
      await updateShipper(row.id, patch);
      setDraft({});
      detail.reload();
      return "Cambios guardados.";
    });

  const archive = async () => {
    const ok = await confirmAsync(
      `Se archivará ${shipperLabel(row)}: deja de aparecer en QuoteDesk, Intake y el Bid Room al buscar shippers. ` +
        "Su historial (cotizaciones, eventos, Ratebooks) se conserva, y un Administrador puede restaurarlo.\n\n¿Continuar?",
    );
    if (ok) await run("archive", async () => {
      await archiveShipper(row.id);
      detail.reload();
      return `${shipperLabel(row)} quedó archivado.`;
    });
  };

  const restore = () =>
    run("restore", async () => {
      await restoreShipper(row.id);
      detail.reload();
      return `${shipperLabel(row)} volvió como Prospecto; ajusta su estado si ya es cliente.`;
    });

  /**
   * The shipper's own primary-contact fields are what QuoteDesk, Intake and
   * the pickers show, so the principal contact is copied there, and only one
   * contact stays principal.
   */
  async function syncPrimary(saved: ShipperContact) {
    if (!saved.is_primary) return;
    const patch: Partial<Record<ShipperField, string | null>> = {};
    if ((saved.contact_name ?? "") !== (row.primary_contact_name ?? "")) patch.primary_contact_name = saved.contact_name;
    if ((saved.email ?? "") !== (row.primary_contact_email ?? "")) patch.primary_contact_email = saved.email;
    if ((saved.phone ?? "") !== (row.primary_contact_phone ?? "")) patch.primary_contact_phone = saved.phone;
    if (Object.keys(patch).length) await updateShipper(row.id, patch);
    for (const other of contacts.filter((c) => c.id !== saved.id && c.is_primary)) {
      await saveContact(row.id, { contact_name: other.contact_name, is_primary: false }, other.id);
    }
  }

  async function afterContactSaved(saved: ShipperContact) {
    setEditing(null);
    await run("contact", async () => {
      await syncPrimary(saved);
      detail.reload();
      return `Contacto ${saved.contact_name ?? ""} guardado.`;
    });
  }

  const makePrimary = (contact: ShipperContact) =>
    run("contact", async () => {
      const saved = await saveContact(row.id, { contact_name: contact.contact_name, is_primary: true }, contact.id);
      await syncPrimary(saved);
      detail.reload();
      return `${contact.contact_name ?? "El contacto"} es ahora el contacto principal.`;
    });

  const addPrimaryToList = () =>
    run("contact", async () => {
      await saveContact(row.id, {
        contact_name: row.primary_contact_name,
        email: row.primary_contact_email || null,
        phone: row.primary_contact_phone || null,
        preferred_channel: row.primary_contact_email ? "email" : row.primary_contact_phone ? "phone" : null,
        is_primary: true,
      });
      for (const other of contacts.filter((c) => c.is_primary)) {
        await saveContact(row.id, { contact_name: other.contact_name, is_primary: false }, other.id);
      }
      detail.reload();
      return `${row.primary_contact_name} quedó en la lista de contactos como principal.`;
    });

  const removeContact = async (contact: ShipperContact) => {
    const ok = await confirmAsync(`Se eliminará el contacto ${contact.contact_name ?? ""} de ${shipperLabel(row)}. No se puede deshacer.\n\n¿Continuar?`);
    if (ok) await run("contact", async () => {
      await deleteContact(row.id, contact.id);
      detail.reload();
      return "Contacto eliminado.";
    });
  };

  return (
    <>
      <TopBar
        title={shipperLabel(row)}
        sub={[row.domain, SHIPPER_STATUS_LABEL[row.status ?? ""], SHIPPER_STAGE_LABEL[row.relationship_stage ?? ""]].filter(Boolean).join(" · ")}
        actions={
          <>
            <button onClick={() => navigate("/shippers")}>← Shippers</button>
            {archived ? (
              <button disabled={!isAdmin || Boolean(busy)} title={isAdmin ? undefined : NEED_REASON.admin} onClick={restore}>
                {busy === "restore" ? "Restaurando…" : "Restaurar"}
              </button>
            ) : (
              <button disabled={!isAdmin || Boolean(busy)} title={isAdmin ? undefined : NEED_REASON.admin} onClick={archive}>
                {busy === "archive" ? "Archivando…" : "Archivar"}
              </button>
            )}
          </>
        }
      />
      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          {notice && <InfoBanner>{notice}</InfoBanner>}
          {error && <ErrorBanner message={error} />}
          {archived && (
            <InfoBanner title="Archivado:">
              no aparece al buscar shippers en QuoteDesk, Intake ni el Bid Room. Un Administrador puede restaurarlo.
            </InfoBanner>
          )}

          <div className="tabs" role="tablist" aria-label="Secciones del shipper">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? "active" : ""}
                onClick={() => setParams(key === "resumen" ? {} : { tab: key }, { replace: true })}
              >
                {label}
                {counts[key] ? ` · ${counts[key]}` : ""}
              </button>
            ))}
          </div>

          {tab === "resumen" && (
          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Datos del shipper</h2>
              <Pill tone={SHIPPER_TONE[row.status ?? ""] ?? ""}>{SHIPPER_STATUS_LABEL[row.status ?? ""] ?? row.status ?? "—"}</Pill>
              <div className="spacer" />
              {changed.length > 0 && (
                <button onClick={() => setDraft({})} disabled={Boolean(busy)}>
                  Descartar
                </button>
              )}
              <button className="primary" disabled={!canSave} title={canWork ? undefined : NEED_REASON.operate} onClick={save}>
                {busy === "save" ? "Guardando…" : changed.length ? `Guardar ${changed.length} cambio(s)` : "Guardar"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
              {FIELDS.map((field) => (
                <label key={field.key} className="field" style={field.wide ? { gridColumn: "1 / -1" } : undefined}>
                  <span>{field.label}</span>
                  {field.options ? (
                    <select
                      value={value(field.key)}
                      disabled={!canWork || (field.key === "status" && archived)}
                      onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                    >
                      {field.key === "status" && archived && <option value="archived">Archivado</option>}
                      {!field.options[value(field.key)] && !(field.key === "status" && archived) && <option value={value(field.key)}>{value(field.key) || "—"}</option>}
                      {Object.entries(field.options).map(([option, label]) => (
                        <option key={option} value={option}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : field.key === "notes" ? (
                    <textarea rows={3} value={value(field.key)} disabled={!canWork} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                  ) : (
                    <input
                      type={field.type ?? "text"}
                      value={value(field.key)}
                      disabled={!canWork}
                      onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
            {invalidEmail && <p style={{ color: "var(--red)", fontSize: 12, margin: "8px 0 0" }}>Revisa los correos: alguno no es válido.</p>}
          </div>
          )}

          {tab === "resumen" && <ProfileLinkCard shipperId={row.id} requests={detail.data.profile_requests} onChanged={detail.reload} />}

          {tab === "contactos" && (
          <div className="card" style={{ padding: 0 }}>
            <div className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <h2 style={{ margin: 0 }}>Contactos</h2>
              <span className="cell-sub">{contacts.length}</span>
              <div className="spacer" />
              <button disabled={!canWork || Boolean(busy)} title={canWork ? undefined : NEED_REASON.operate} onClick={() => setEditing("new")}>
                Agregar contacto
              </button>
            </div>
            {primaryMissing && (
              <div className="banner info" style={{ margin: "12px 16px 0", alignItems: "center" }}>
                <span>
                  El contacto principal de los datos del shipper, <b>{row.primary_contact_name}</b>
                  {row.primary_contact_email ? ` (${row.primary_contact_email})` : ""}, no está en esta lista.
                </span>
                <div className="spacer" />
                <button disabled={!canWork || Boolean(busy)} title={canWork ? undefined : NEED_REASON.operate} onClick={addPrimaryToList}>
                  Agregarlo a la lista
                </button>
              </div>
            )}
            {!contacts.length ? (
              <div style={{ padding: 16 }}>
                <Empty title="Sin contactos" hint="Agrega a la persona que pide las cotizaciones o los RFx; el principal es el que ven QuoteDesk e Intake." />
              </div>
            ) : (
              <table className="data" style={{ border: "none" }}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Puesto · área</th>
                    <th>Correo</th>
                    <th>Teléfono · WhatsApp</th>
                    <th>Canal</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id} style={contact.status === "inactive" ? { opacity: 0.6 } : undefined}>
                      <td>
                        <div className="cell-title">
                          {contact.contact_name} {contact.is_primary && <Pill tone="green">Principal</Pill>}
                          {contact.status === "inactive" && <Pill>Inactivo</Pill>}
                        </div>
                        {contact.notes && <div className="cell-sub">{contact.notes}</div>}
                      </td>
                      <td>{[contact.title, contact.department].filter(Boolean).join(" · ") || <span className="cell-sub">—</span>}</td>
                      <td>{contact.email || <span className="cell-sub">—</span>}</td>
                      <td>{[contact.phone, contact.whatsapp_phone ? `WA ${contact.whatsapp_phone}` : null].filter(Boolean).join(" · ") || <span className="cell-sub">—</span>}</td>
                      <td>{CHANNEL_LABEL[contact.preferred_channel ?? ""] ?? <span className="cell-sub">—</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="ne-link" disabled={!canWork || Boolean(busy)} onClick={() => setEditing(contact)}>
                          Editar
                        </button>
                        {!contact.is_primary && contact.status !== "inactive" && (
                          <button className="ne-link" disabled={!canWork || Boolean(busy)} onClick={() => makePrimary(contact)}>
                            Hacer principal
                          </button>
                        )}
                        <button
                          className="ne-link"
                          disabled={!isAdmin || Boolean(busy)}
                          title={isAdmin ? undefined : `${NEED_REASON.admin} Puedes marcarlo como inactivo en «Editar».`}
                          onClick={() => removeContact(contact)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          )}

          {tab === "resumen" && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Trabajo con este shipper</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <section>
                <div className="cell-title" style={{ marginBottom: 6 }}>
                  Cotizaciones (QuoteDesk) · {quotes.loading ? "…" : shipperQuotes.length}
                </div>
                {shipperQuotes.slice(0, 8).map((quote) => (
                  <div key={quote.id} className="row" style={{ gap: 6, padding: "3px 0" }}>
                    <Link to={`/quotedesk/${quote.id}`}>{quote.folio}</Link>
                    <span className="cell-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {quote.title || [quote.first_lane?.origin, quote.first_lane?.destination].filter(Boolean).join(" → ")}
                    </span>
                    <div className="spacer" />
                    <Pill>{QUOTE_STATUS_LABEL[quote.status] ?? quote.status}</Pill>
                  </div>
                ))}
                {!quotes.loading && !shipperQuotes.length && <div className="cell-sub">Sin cotizaciones.</div>}
              </section>
              <section>
                <div className="cell-title" style={{ marginBottom: 6 }}>
                  Eventos del Bid Room · {events.loading ? "…" : shipperEvents.length}
                </div>
                {shipperEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="row" style={{ gap: 6, padding: "3px 0" }}>
                    <Link to={`/rfx/${event.id}`}>{String(event.rfx_id ?? "") || event.name || event.id}</Link>
                    <span className="cell-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {event.name}
                    </span>
                    <div className="spacer" />
                    <StatusPill status={event.status} />
                  </div>
                ))}
                {!events.loading && !shipperEvents.length && <div className="cell-sub">Sin eventos.</div>}
              </section>
              <section>
                <div className="cell-title" style={{ marginBottom: 6 }}>
                  Ratebooks · {detail.data.ratebooks.length}
                </div>
                {detail.data.ratebooks.slice(0, 8).map((ratebook) => (
                  <div key={ratebook.id} className="row" style={{ gap: 6, padding: "3px 0" }}>
                    <span>{ratebook.name || ratebook.id}</span>
                    <div className="spacer" />
                    <span className="cell-sub">{ratebook.lane_count ? `${ratebook.lane_count} ruta(s)` : ""}</span>
                  </div>
                ))}
                {!detail.data.ratebooks.length && <div className="cell-sub">Sin Ratebooks.</div>}
              </section>
            </div>
            <p className="cell-sub" style={{ margin: "12px 0 0" }}>
              Alta: {dateShort(row.created_at)} ({row.source === "import" ? "importado" : "a mano"}) · última actualización {dateShort(row.updated_at)}
            </p>
          </div>
          )}

          {tab === "oportunidades" && (
            <OpportunitiesTab shipperId={row.id} rows={detail.data.opportunities} rfis={detail.data.rfis} onChanged={detail.reload} />
          )}
          {tab === "acciones" && <ActionsTab shipperId={row.id} rows={detail.data.actions} onChanged={detail.reload} />}
          {tab === "rfis" && (
            <RfisTab shipperId={row.id} rows={detail.data.rfis} opportunities={detail.data.opportunities} onChanged={detail.reload} />
          )}
          {tab === "sitios" && <LocationsTab shipperId={row.id} rows={detail.data.locations} onChanged={detail.reload} />}
          {tab === "rutas" && <LanesTab shipperId={row.id} rows={detail.data.lanes} onChanged={detail.reload} />}
          {tab === "actividad" && <ActivityTab shipperId={row.id} />}
        </div>
      </main>

      {editing && (
        <ContactDialog
          shipperId={row.id}
          contact={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={afterContactSaved}
        />
      )}
    </>
  );
}
