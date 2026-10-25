import { COPY, SHIPPER_FIELDS, SECTIONS, CONTACT_FIELDS, LOCATION_FIELDS, type Lang, type Text } from "@/i18n/shipper-profile";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorBanner, InfoBanner, Spinner } from "@/components/ui";
import {
  getShipperProfile,
  submitShipperProfile,
  type ProfileResponse,
  type PublicContact,
  type PublicLocation,
  type Section,
} from "./shipperProfile.service";

/**
 * A shipper's own profile, from the private link the team creates on the
 * shipper's page. The backend composes it as `/shipper-profile.html?token=…`
 * on Bidware's origin, so Bidware answers that exact path.
 *
 * Nothing the shipper didn't touch is sent back: company fields go only when
 * they changed, sections go whole (the backend replaces them whole), and
 * contacts and sites go only when they are new or edited.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (value: unknown) => (Array.isArray(value) ? value.join(", ") : value === null || value === undefined ? "" : String(value));
const blankContact = (): PublicContact => ({ name: "", title: "", department: "", email: "", phone: "", whatsapp_phone: "", preferred_channel: "", is_primary: false, notes: "" });
const blankLocation = (): PublicLocation => ({
  location_name: "", location_type: "", address_line_1: "", address_line_2: "", city: "", state_code: "", country_code: "", postal_code: "",
  contact_name: "", contact_email: "", contact_phone: "", operating_hours: "", handling_type: "", appointment_required: false, notes: "",
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function initialLang(param: string | null): Lang {
  if (param === "en" || param === "es") return param;
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

export function ShipperProfilePage() {
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";
  const [lang, setLang] = useState<Lang>(() => initialLang(search.get("lang")));
  const [original, setOriginal] = useState<ProfileResponse | null>(null);
  const [shipper, setShipper] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<Record<Section, Record<string, string>>>({ company: {}, onboarding: {}, network: {}, billing: {} });
  const [contacts, setContacts] = useState<PublicContact[]>([]);
  const [locations, setLocations] = useState<PublicLocation[]>([]);
  const [who, setWho] = useState({ name: "", email: "" });
  const [loading, setLoading] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const c = (text: Text) => text[lang];

  function adopt(profile: ProfileResponse) {
    setOriginal(profile);
    setShipper(Object.fromEntries(SHIPPER_FIELDS.map((f) => [f.key, str(profile.shipper[f.key])])));
    setSections(
      Object.fromEntries(
        SECTIONS.map((section) => [section.key, Object.fromEntries(section.fields.map((f) => [f.key, str(profile.shipper.profile_data?.[section.key]?.[f.key])]))]),
      ) as Record<Section, Record<string, string>>,
    );
    setContacts(profile.contacts.map((contact) => ({ ...contact })));
    setLocations(profile.locations.map((location) => ({ ...location })));
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setGone(false);
    setError(null);
    setNotice(null);
    getShipperProfile(token)
      .then(adopt)
      .catch((e) => {
        const status = (e as { status?: number }).status;
        if (status === 404 || status === 410) setGone(true);
        else setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const payload = useMemo(() => {
    if (!original) return null;
    const shipperPatch: Record<string, string | null> = {};
    for (const field of SHIPPER_FIELDS) {
      const value = (shipper[field.key] ?? "").trim();
      if (value !== str(original.shipper[field.key]).trim()) shipperPatch[field.key] = value || null;
    }
    const profileData: Partial<Record<Section, Record<string, unknown>>> = {};
    for (const section of SECTIONS) {
      const before = original.shipper.profile_data?.[section.key] ?? {};
      const changed = section.fields.some((f) => (sections[section.key][f.key] ?? "").trim() !== str(before[f.key]).trim());
      // The backend replaces a section whole, so it goes with everything it had.
      if (changed) profileData[section.key] = { ...before, ...Object.fromEntries(section.fields.map((f) => [f.key, (sections[section.key][f.key] ?? "").trim()])) };
    }
    const byId = <T extends { id?: string }>(rows: T[], id?: string) => rows.find((row) => row.id === id);
    const editedContacts = contacts.filter((contact) =>
      contact.id ? !same(contact, byId(original.contacts, contact.id)) : Boolean(str(contact.name).trim() || str(contact.email).trim()),
    );
    const editedLocations = locations.filter((location) =>
      location.id
        ? !same(location, byId(original.locations, location.id))
        : Boolean(str(location.location_name).trim() || str(location.city).trim() || str(location.address_line_1).trim()),
    );
    return { shipper: shipperPatch, profile_data: profileData, contacts: editedContacts, locations: editedLocations };
  }, [original, shipper, sections, contacts, locations]);

  const hasChanges = Boolean(
    payload && (Object.keys(payload.shipper).length || Object.keys(payload.profile_data).length || payload.contacts.length || payload.locations.length),
  );
  const nameMissing = payload?.shipper.shipper_name === null;
  const emails = [...contacts.map((x) => x.email), ...locations.map((x) => x.contact_email)].map(str).filter((x) => x.trim());
  const badEmail = emails.some((email) => !EMAIL.test(email.trim())) || Boolean(who.email.trim() && !EMAIL.test(who.email.trim()));
  const whoMissing = !who.name.trim() || !who.email.trim();

  async function save() {
    if (!payload) return;
    if (!hasChanges) return setNotice(c(COPY.nothing));
    if (nameMissing) return setError(c(COPY.nameRequired));
    if (badEmail) return setError(c(COPY.badEmail));
    if (whoMissing) return setError(c(COPY.whoRequired));
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await submitShipperProfile(token, { ...payload, submitted_contact: { name: who.name.trim(), email: who.email.trim() } });
      adopt(await getShipperProfile(token));
      setNotice(c(COPY.saved));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404 || status === 410) setGone(true);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: ReactNode, sub?: string) => (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 60px" }}>
      <div className="brand" style={{ paddingLeft: 0 }}>
        <span className="dot" /> Marksman
      </div>
      <div className="public-head">
        <div>
          <p className="crumb">{c(COPY.eyebrow)}</p>
          <h1>{str(original?.shipper.shipper_name) || c(COPY.eyebrow)}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
        <div className="spacer" />
        <div className="profile-lang" role="group" aria-label="Idioma / Language">
          {(["es", "en"] as Lang[]).map((l) => (
            <button key={l} type="button" className={lang === l ? "active" : ""} onClick={() => setLang(l)}>
              {l === "es" ? c(COPY.spanishLanguage) : "English"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gap: 14 }}>{children}</div>
    </div>
  );

  if (!token) return shell(<InfoBanner>{c(COPY.missing)}</InfoBanner>);
  if (loading) return shell(<Spinner label={c(COPY.loading)} />);
  if (gone) return shell(<ErrorBanner message={c(COPY.gone)} />);
  if (!original) return shell(<ErrorBanner message={error ?? c(COPY.gone)} />);

  const expires = original.request.expires_at
    ? new Date(original.request.expires_at).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  const input = (label: string, value: string, set: (value: string) => void, opts: { type?: string; long?: boolean; wide?: boolean } = {}) => (
    <label key={label} className="field" style={opts.wide || opts.long ? { gridColumn: "1 / -1" } : undefined}>
      <span>{label}</span>
      {opts.long ? (
        <textarea rows={3} value={value} onChange={(e) => set(e.target.value)} />
      ) : (
        <input type={opts.type ?? "text"} value={value} onChange={(e) => set(e.target.value)} />
      )}
    </label>
  );

  const card = (title: string, help: string, children: ReactNode, action?: ReactNode) => (
    <section className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>{help}</p>
        </div>
        <div className="spacer" />
        {action}
      </div>
      {children}
    </section>
  );

  return shell(
    <>
      <InfoBanner title={`${c(COPY.expires)} ${expires}.`}>
        {c(COPY.intro)} {c(COPY.privacy)}
      </InfoBanner>

      {card(
        c(COPY.company),
        c(COPY.companyHelp),
        <div className="profile-grid">
          {SHIPPER_FIELDS.map((field) =>
            input(c(field.label), shipper[field.key] ?? "", (value) => setShipper((s) => ({ ...s, [field.key]: value }))),
          )}
        </div>,
      )}

      {SECTIONS.map((section) => (
        <div key={section.key}>
          {card(
            c(section.title),
            c(section.help),
            <div className="profile-grid">
              {section.fields.map((field) =>
                input(
                  c(field.label),
                  sections[section.key][field.key] ?? "",
                  (value) => setSections((s) => ({ ...s, [section.key]: { ...s[section.key], [field.key]: value } })),
                  { long: field.long },
                ),
              )}
            </div>,
          )}
        </div>
      ))}

      {card(
        c(COPY.contacts),
        c(COPY.contactsHelp),
        <div style={{ display: "grid", gap: 12 }}>
          {contacts.map((contact, i) => {
            const set = (patch: Partial<PublicContact>) => setContacts((rows) => rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));
            return (
              <div key={contact.id ?? `new-${i}`} style={{ borderTop: i ? "1px solid var(--line)" : "none", paddingTop: i ? 12 : 0 }}>
                <div className="profile-grid">
                  {CONTACT_FIELDS.map((field) => input(c(field.label), str(contact[field.key]), (value) => set({ [field.key]: value }), { type: field.type }))}
                  <label className="field">
                    <span>{lang === "es" ? "Canal preferido" : "Preferred channel"}</span>
                    <select value={str(contact.preferred_channel)} onChange={(e) => set({ preferred_channel: e.target.value })}>
                      <option value="">—</option>
                      <option value="email">{lang === "es" ? "Correo" : "Email"}</option>
                      <option value="phone">{lang === "es" ? "Teléfono" : "Phone"}</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </label>
                  {input(lang === "es" ? "Notas" : "Notes", str(contact.notes), (value) => set({ notes: value }), { wide: true })}
                </div>
                <div className="row" style={{ gap: 10, marginTop: 6 }}>
                  <label className="row" style={{ gap: 6, alignItems: "center" }}>
                    <input type="checkbox" style={{ width: 15 }} checked={Boolean(contact.is_primary)} onChange={(e) => set({ is_primary: e.target.checked })} />
                    <span>{c(COPY.primary)}</span>
                  </label>
                  {!contact.id && (
                    <button type="button" className="ne-link" onClick={() => setContacts((rows) => rows.filter((_, j) => j !== i))}>
                      {c(COPY.remove)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>,
        <button type="button" onClick={() => setContacts((rows) => [...rows, blankContact()])}>
          {c(COPY.addContact)}
        </button>,
      )}

      {card(
        c(COPY.locations),
        c(COPY.locationsHelp),
        <div style={{ display: "grid", gap: 12 }}>
          {locations.map((location, i) => {
            const set = (patch: Partial<PublicLocation>) => setLocations((rows) => rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));
            return (
              <div key={location.id ?? `new-${i}`} style={{ borderTop: i ? "1px solid var(--line)" : "none", paddingTop: i ? 12 : 0 }}>
                <div className="profile-grid">
                  {LOCATION_FIELDS.map((field) =>
                    input(c(field.label), str(location[field.key]), (value) => set({ [field.key]: value }), { type: field.type, wide: field.wide }),
                  )}
                  {input(lang === "es" ? "Restricciones o notas del sitio" : "Site restrictions or notes", str(location.notes), (value) => set({ notes: value }), { long: true })}
                </div>
                <div className="row" style={{ gap: 10, marginTop: 6 }}>
                  <label className="row" style={{ gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      style={{ width: 15 }}
                      checked={Boolean(location.appointment_required)}
                      onChange={(e) => set({ appointment_required: e.target.checked })}
                    />
                    <span>{c(COPY.appointment)}</span>
                  </label>
                  {!location.id && (
                    <button type="button" className="ne-link" onClick={() => setLocations((rows) => rows.filter((_, j) => j !== i))}>
                      {c(COPY.remove)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>,
        <button type="button" onClick={() => setLocations((rows) => [...rows, blankLocation()])}>
          {c(COPY.addLocation)}
        </button>,
      )}

      {card(
        c(COPY.submitter),
        c(COPY.privacy),
        <div className="profile-grid">
          {input(c(COPY.submitterName), who.name, (value) => setWho((w) => ({ ...w, name: value })))}
          {input(c(COPY.submitterEmail), who.email, (value) => setWho((w) => ({ ...w, email: value })), { type: "email" })}
        </div>,
      )}

      {error && <ErrorBanner message={error} />}
      {notice && <InfoBanner>{notice}</InfoBanner>}
      <div className="row">
        <div className="spacer" />
        <button className="primary" disabled={busy} onClick={save}>
          {busy ? c(COPY.saving) : c(COPY.save)}
        </button>
      </div>
    </>,
    str(original.shipper.legal_name) || undefined,
  );
}
