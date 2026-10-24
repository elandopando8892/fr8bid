import { tr } from "@/i18n/carrier-crm";
import { useLang } from "@/i18n/language";
import { useState } from "react";
import { createVendor, vendorLabel, type NewVendorInput } from "./crm.service";
import { Dialog, ErrorBanner, InfoBanner } from "@/components/ui";

/**
 * A carrier typed by hand. The razón social is the identity: two legal
 * entities that share a contact are still two carriers, so nothing here warns
 * about a repeated email — only the backend's exact-name check can refuse.
 */
export function NewCarrierDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  useLang();
  const [form, setForm] = useState<NewVendorInput>({
    vendor_name: "",
    base_stage: "procurement",
    preferred_channel: "email",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof NewVendorInput) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const email = (form.primary_email ?? "").trim();
  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSave = form.vendor_name.trim() !== "" && emailValid && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const { row } = await createVendor({ ...form, vendor_name: form.vendor_name.trim() });
      onCreated(
        tr("text203", vendorLabel(row)) +
          (form.base_stage === "procurement" ? tr("text204") : tr("text205")),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, key: keyof NewVendorInput, placeholder = "") => (
    <label className="field" style={{ flex: 1 }}>
      <span>{label}</span>
      <input
        value={(form[key] as string) ?? ""}
        placeholder={placeholder}
        onChange={(e) => set(key)(e.target.value)}
      />
    </label>
  );

  return (
    <Dialog
      title={tr("text062")}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            {tr("text206")}</button>
          <div className="spacer" />
          <button className="primary" disabled={!canSave} onClick={save}>
            {busy ? tr("text026") : tr("text207")}
          </button>
        </>
      }
    >
      {error && <ErrorBanner message={error} />}

      {field(tr("text208"), "vendor_name", tr("text209"))}
      <div className="row" style={{ alignItems: "flex-start" }}>
        {field(tr("text210"), "legal_name")}
        {field(tr("text211"), "domain", "ejemplo.com")}
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        {field(tr("text088"), "contact_name")}
        <label className="field" style={{ flex: 1 }}>
          <span>{tr("text212")}</span>
          <input
            type="email"
            value={form.primary_email ?? ""}
            onChange={(e) => set("primary_email")(e.target.value)}
          />
          {!emailValid && (
            <span style={{ color: "var(--red)", fontSize: 11.5 }}>{tr("text213")}</span>
          )}
        </label>
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        {field("WhatsApp", "whatsapp_phone", "+52 81 …")}
        <label className="field" style={{ flex: 1 }}>
          <span>{tr("text214")}</span>
          <select
            value={form.preferred_channel}
            onChange={(e) => set("preferred_channel")(e.target.value)}
          >
            <option value="email">{tr("text212")}</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="multi">{tr("text215")}</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>{tr("text216")}</span>
        <select
          value={form.base_stage}
          onChange={(e) => set("base_stage")(e.target.value)}
        >
          <option value="procurement">{tr("text217")}</option>
          <option value="sourcing">{tr("text218")}</option>
        </select>
      </label>
      <label className="field">
        <span>{tr("text219")}</span>
        <textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} />
      </label>

      <InfoBanner title={tr("text220")}>
        {tr("text221")}</InfoBanner>
    </Dialog>
  );
}
