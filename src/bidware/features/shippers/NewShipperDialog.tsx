import { tr } from "@/i18n/shipper-shared";
import { useLang, getLang } from "@/i18n/language";
import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorBanner, InfoBanner, Pill } from "@/components/ui";
import {
  cleanDomain,
  createShipper,
  domainFromEmail,
  findShipperMatches,
  MATCH_LABEL,
  saveContact,
  shipperLabel,
  SHIPPER_STATUS_LABEL,
  type NewShipperInput,
  type Shipper,
  type ShipperMatch,
} from "./shippers.service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A new shipper in the shared CRM. Before creating it, the dialog looks for
 * the same company already there (same domain, same or a similar name, also
 * among the archived) so the team uses that one instead of a duplicate. A
 * live shipper with the same domain blocks the creation, as the backend does.
 */
export function NewShipperDialog({
  initialName = "",
  onClose,
  onCreated,
  onUseExisting,
}: {
  initialName?: string;
  onClose: () => void;
  onCreated: (row: Shipper) => void;
  /** Picking one of the matches instead of creating; without it, matches open in a new tab. */
  onUseExisting?: (row: Shipper) => void;
}) {
  useLang();
  const [form, setForm] = useState<NewShipperInput>({ shipper_name: initialName, status: "prospect", headquarters_country: "MX" });
  const [domainTouched, setDomainTouched] = useState(false);
  const [matches, setMatches] = useState<ShipperMatch[]>([]);
  const [checking, setChecking] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const set = (key: keyof NewShipperInput) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const name = form.shipper_name.trim();
  const email = (form.primary_contact_email ?? "").trim();
  const emailValid = !email || EMAIL.test(email);
  // The company's domain, typed or taken from the contact's email.
  const domain = cleanDomain(form.domain) || (domainTouched ? "" : domainFromEmail(email));

  useEffect(() => {
    const id = ++seq.current;
    if (name.length < 3 && !domain) {
      setMatches([]);
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = window.setTimeout(() => {
      findShipperMatches(name, domain)
        .then((found) => {
          if (id !== seq.current) return;
          setMatches(found);
          setSure(false);
        })
        .catch(() => id === seq.current && setMatches([]))
        .finally(() => id === seq.current && setChecking(false));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [name, domain]);

  const domainTaken = matches.find((m) => m.reason === "domain" && m.shipper.status !== "archived");
  const needsSure = matches.length > 0 && !domainTaken;
  const canSave = Boolean(name) && emailValid && !domainTaken && (!needsSure || sure) && !checking && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const status = form.status === "active" ? "active" : "prospect";
      const input: NewShipperInput = { shipper_name: name, status, relationship_stage: status === "active" ? "customer" : "target" };
      for (const [key, value] of Object.entries(form) as [keyof NewShipperInput, string | undefined][]) {
        const text = (value ?? "").trim();
        if (text && !(key in input)) input[key] = text;
      }
      if (domain) input.domain = domain;
      const row = await createShipper(input);
      // The primary contact also goes to the contact list, where the detail page shows it.
      if (input.primary_contact_name) {
        await saveContact(row.id, {
          contact_name: input.primary_contact_name,
          email: input.primary_contact_email || null,
          phone: input.primary_contact_phone || null,
          preferred_channel: input.primary_contact_email ? "email" : input.primary_contact_phone ? "phone" : null,
          is_primary: true,
        }).catch(() => undefined);
      }
      onCreated(row);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const field = (label: string, key: keyof NewShipperInput, placeholder = "", type = "text") => (
    <label className="field" style={{ flex: 1 }}>
      <span>{label}</span>
      <input type={type} value={form[key] ?? ""} placeholder={placeholder} onChange={(e) => set(key)(e.target.value)} />
    </label>
  );

  return (
    <Dialog
      title={tr("text012")}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            {tr("text013")}</button>
          <div className="spacer" />
          <button className="primary" disabled={!canSave} onClick={save}>
            {busy ? tr("text014") : checking ? tr("text015") : tr("text016")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {error && <ErrorBanner message={error} />}

        <label className="field">
          <span>{tr("text017")}</span>
          <input autoFocus value={form.shipper_name} placeholder={tr("text018")} onChange={(e) => set("shipper_name")(e.target.value)} />
        </label>
        <div className="row" style={{ alignItems: "flex-start" }}>
          {field(tr("text019"), "legal_name", tr("text020"))}
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text021")}</span>
            <input
              value={domainTouched ? form.domain ?? "" : form.domain || domain}
              placeholder={tr("text022")}
              onChange={(e) => {
                setDomainTouched(true);
                set("domain")(e.target.value);
              }}
            />
          </label>
        </div>

        {matches.length > 0 && (
          <div className={domainTaken ? "banner error" : "banner warn"} style={{ display: "grid", gap: 6 }}>
            <strong>
              {domainTaken
                ? tr("text023")
                : tr("text024")}
            </strong>
            {matches.slice(0, 5).map(({ shipper, reason }) => (
              <div key={shipper.id} className="row" style={{ gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="cell-title">
                    {shipperLabel(shipper)} {shipper.status === "archived" && <Pill tone="amber">{getLang() === "en" ? "Archived" : SHIPPER_STATUS_LABEL.archived}</Pill>}
                  </div>
                  <div className="cell-sub">
                    {[getLang() === "en" ? { domain: "same domain", name: "same name", similar: "similar name" }[reason] : MATCH_LABEL[reason], shipper.domain, shipper.headquarters_city, shipper.primary_contact_name].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="spacer" />
                {onUseExisting && shipper.status !== "archived" ? (
                  <button type="button" onClick={() => onUseExisting(shipper)}>
                    {tr("text025")}</button>
                ) : (
                  <a className="ne-link" href={`/shippers/${shipper.id}`} target="_blank" rel="noreferrer">
                    {tr("text026")}</a>
                )}
              </div>
            ))}
            {domainTaken && <span className="cell-sub">{tr("text027")}</span>}
            {needsSure && (
              <label className="row" style={{ gap: 6, alignItems: "center" }}>
                <input type="checkbox" style={{ width: 15 }} checked={sure} onChange={(e) => setSure(e.target.checked)} />
                <span>{tr("text028")}</span>
              </label>
            )}
            {matches.some((m) => m.shipper.status === "archived") && (
              <span className="cell-sub">{tr("text029")}</span>
            )}
          </div>
        )}

        <div className="row" style={{ alignItems: "flex-start" }}>
          {field(tr("text030"), "industry", tr("text031"))}
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text032")}</span>
            <select value={form.status} onChange={(e) => set("status")(e.target.value)}>
              <option value="prospect">{tr("text033")}</option>
              <option value="active">{tr("text034")}</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          {field(tr("text035"), "primary_contact_name")}
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text036")}</span>
            <input type="email" value={form.primary_contact_email ?? ""} onChange={(e) => set("primary_contact_email")(e.target.value)} />
            {!emailValid && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{tr("text037")}</span>}
          </label>
          {field(tr("text038"), "primary_contact_phone", "+52 81 …", "tel")}
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          {field(tr("text039"), "headquarters_city", "Monterrey")}
          {field(tr("text040"), "headquarters_state", "NL")}
          <label className="field" style={{ width: 110 }}>
            <span>{tr("text041")}</span>
            <select value={form.headquarters_country} onChange={(e) => set("headquarters_country")(e.target.value)}>
              <option value="MX">MX</option>
              <option value="US">US</option>
              <option value="CA">CA</option>
            </select>
          </label>
        </div>
        <InfoBanner>{tr("text042")}</InfoBanner>
      </div>
    </Dialog>
  );
}
