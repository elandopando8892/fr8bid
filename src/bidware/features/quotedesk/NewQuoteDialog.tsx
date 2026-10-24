import { tr } from "@/i18n/quotedesk";
import { useLang } from "@/i18n/language";
import { useState } from "react";
import { Dialog } from "@/components/ui";
import { ShipperPicker } from "@/components/ShipperPicker";
import { CHANNELS, createQuote, type Currency, type Quote, type ShipperOption } from "./quotedesk.service";

/** A quote always belongs to a shipper in the CRM; creating it sends nothing. */
export function NewQuoteDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (quote: Quote) => void }) {
  useLang();
  const [shipper, setShipper] = useState<ShipperOption | null>(null);
  const [title, setTitle] = useState("");
  const [quoteType, setQuoteType] = useState<"spot" | "contract">("spot");
  const [channel, setChannel] = useState("email");
  const [requestedBy, setRequestedBy] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!shipper) return;
    setSaving(true);
    setError(null);
    try {
      const quote = await createQuote({
        shipper_id: shipper.id,
        title: title.trim() || undefined,
        quote_type: quoteType,
        channel,
        requested_by: requestedBy.trim() || undefined,
        currency,
        valid_until: validUntil || null,
        notes: notes.trim() || undefined,
      });
      onCreated(quote);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={tr("text138")}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>{tr("text002")}</button>
          <button className="primary" disabled={!shipper || saving} onClick={create}>
            {saving ? tr("text139") : tr("text140")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div className="field">
          <span>{tr("text141")}</span>
          <ShipperPicker
            autoFocus
            value={shipper}
            onChange={(picked) => {
              setShipper(picked);
              if (picked && !requestedBy && picked.primary_contact_name) setRequestedBy(picked.primary_contact_name);
            }}
          />
        </div>
        <label className="field">
          <span>{tr("text142")}</span>
          <input value={title} placeholder={tr("text143")} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="qd-two">
          <label className="field">
            <span>{tr("text144")}</span>
            <select value={quoteType} onChange={(e) => setQuoteType(e.target.value as "spot" | "contract")}>
              <option value="spot">Spot</option>
              <option value="contract">{tr("text145")}</option>
            </select>
          </label>
          <label className="field">
            <span>{tr("text146")}</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="qd-three">
          <label className="field">
            <span>{tr("text147")}</span>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
          </label>
          <label className="field">
            <span>{tr("text148")}</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
            </select>
          </label>
          <label className="field">
            <span>{tr("text149")}</span>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>{tr("text150")}</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="qd-error">{error}</p>}
      </div>
    </Dialog>
  );
}
