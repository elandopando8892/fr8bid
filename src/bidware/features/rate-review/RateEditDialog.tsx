import { words, tr } from "@/i18n/rate-review";
import { useLang } from "@/i18n/language";
import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorBanner } from "@/components/ui";
import { listVendors } from "@/features/carrier-crm/crm.service";
import { valueLabel, type CatalogIndex } from "@/features/rfx-admin/laneImport";
import type { Vendor } from "@/types/domain";
import { crossesBorder, type StagedRate } from "./readiness";
import { updateRate } from "./rateReview.service";

const vendorName = (v: Vendor) => (v.vendor_name as string) || (v.legal_name as string) || (v.name as string) || v.id;

/**
 * Fixes one staged rate: its carrier, dates, money and what the rate is for.
 * The carrier is linked by what the CRM knows of it (domain, email or name);
 * the server finds the carrier and fills the link.
 */
export function RateEditDialog({
  row,
  index,
  onClose,
  onSaved,
  save: persist = updateRate,
  title = tr("text001"),
}: {
  row: StagedRate;
  index: CatalogIndex | null;
  onClose: () => void;
  onSaved: (row: StagedRate) => void;
  /** Where the change goes: a staged rate by default, an approved one from the Tarifario. */
  save?: (id: string, patch: Record<string, unknown>) => Promise<{ row?: StagedRate }>;
  title?: string;
}) {
  const lang = useLang();
  const [quoteDate, setQuoteDate] = useState(String(row.quote_date ?? "").slice(0, 10));
  const [currency, setCurrency] = useState(String(row.currency ?? ""));
  const [allIn, setAllIn] = useState(String(row.all_in_rate ?? ""));
  const [capacity, setCapacity] = useState(String(row.weekly_capacity ?? ""));
  const [operation, setOperation] = useState(String(row.operation ?? ""));
  const [service, setService] = useState(String(row.service ?? ""));
  const [mxCrossing, setMxCrossing] = useState(String(row.mx_border_crossing_point ?? ""));
  const [usCrossing, setUsCrossing] = useState(String(row.us_border_crossing_point ?? ""));
  // What the all-in is made of. The server keeps each part as written and
  // does not add them up, so the all-in is still set on its own.
  const [mxLinehaul, setMxLinehaul] = useState(String(row.mx_linehaul ?? ""));
  const [usLinehaul, setUsLinehaul] = useState(String(row.us_linehaul ?? ""));
  const [fsc, setFsc] = useState(String(row.fsc ?? ""));
  const [crossingFee, setCrossingFee] = useState(String(row.border_crossing_fee ?? ""));
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Vendor[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const text = search.trim();
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const id = ++seq.current;
    const timer = window.setTimeout(() => {
      listVendors({ search: text, limit: 8 })
        .then((res) => id === seq.current && setResults(res.rows))
        .catch(() => id === seq.current && setResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const options = (field: "operation" | "service") => (index ? index.options[field] : []);
  const crossing = crossesBorder(row);

  async function save() {
    const patch: Record<string, unknown> = {};
    const changed = (value: string, current: unknown) => value.trim() !== String(current ?? "").trim();
    if (changed(quoteDate, String(row.quote_date ?? "").slice(0, 10))) patch.quote_date = quoteDate || null;
    if (changed(currency, row.currency)) patch.currency = currency || null;
    if (changed(allIn, row.all_in_rate)) patch.all_in_rate = allIn.trim() || null;
    if (changed(capacity, row.weekly_capacity)) patch.weekly_capacity = capacity.trim() || null;
    if (changed(operation, row.operation)) patch.operation = operation || null;
    if (changed(service, row.service)) patch.service = service || null;
    if (crossing && changed(mxCrossing, row.mx_border_crossing_point)) patch.mx_border_crossing_point = mxCrossing.trim() || null;
    if (crossing && changed(usCrossing, row.us_border_crossing_point)) patch.us_border_crossing_point = usCrossing.trim() || null;
    if (changed(mxLinehaul, row.mx_linehaul)) patch.mx_linehaul = mxLinehaul.trim() || null;
    if (changed(usLinehaul, row.us_linehaul)) patch.us_linehaul = usLinehaul.trim() || null;
    if (changed(fsc, row.fsc)) patch.fsc = fsc.trim() || null;
    if (changed(crossingFee, row.border_crossing_fee)) patch.border_crossing_fee = crossingFee.trim() || null;
    if (vendor) {
      // What the CRM knows of the carrier; the server resolves it to the carrier's id.
      if (vendor.domain) patch.vendor_domain = vendor.domain;
      if (vendor.primary_email) patch.vendor_email = vendor.primary_email;
      patch.vendor_name = vendorName(vendor);
    }
    if (!Object.keys(patch).length) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await persist(row.id, patch);
      if (vendor && !res.row?.vendor_id) {
        setError(tr("text002"));
        onSaved(res.row ?? row);
        return;
      }
      onSaved(res.row ?? row);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const carrier = row.vendors?.vendor_name || row.vendor_reference || row.vendor_domain || words("word0");

  return (
    <Dialog
      title={title}
      ariaLabel={title}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={saving}>
            {tr("text003")}</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? tr("text004") : tr("text005")}
          </button>
        </>
      }
    >
      <div className="rr-edit" style={{ display: "grid", gap: 10 }}>
        <div className="cell-sub">
          {row.origin || "—"} → {row.destination || "—"} · {carrier}
        </div>
        {error && <ErrorBanner message={error} />}

        <div className="field">
          <span>{tr("text006")}{row.vendor_id ? words("word1") : words("word2")}</span>
          {vendor ? (
            <div className="row" style={{ gap: 8 }}>
              <strong>{vendorName(vendor)}</strong>
              <span className="cell-sub">{vendor.domain || vendor.primary_email || ""}</span>
              <button className="ne-link" onClick={() => setVendor(null)}>
                {tr("text007")}</button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("text008")} />
              {results.length > 0 && (
                <div className="qd-options" role="listbox">
                  {results.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="qd-option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setVendor(v);
                        setSearch("");
                        setResults([]);
                      }}
                    >
                      <strong>{vendorName(v)}</strong>
                      <span>{[v.domain, v.primary_email, v.status].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text009")}</span>
            <input value={allIn} onChange={(e) => setAllIn(e.target.value)} inputMode="decimal" />
          </label>
          <label className="field" style={{ width: 110 }}>
            <span>{tr("text010")}</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="">—</option>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
              <option value="CAD">CAD</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text011")}</span>
            <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
          </label>
          <label className="field" style={{ width: 130 }}>
            <span>{tr("text012")}</span>
            <input value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" />
          </label>
        </div>

        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          {(["operation", "service"] as const).map((field) => {
            const value = field === "operation" ? operation : service;
            const set = field === "operation" ? setOperation : setService;
            const known = options(field).includes(value);
            return (
              <label key={field} className="field" style={{ flex: 1 }}>
                <span>{field === "operation" ? tr("text013") : tr("text014")}</span>
                <select value={value} onChange={(e) => set(e.target.value)}>
                  <option value="">—</option>
                  {!known && value && <option value={value}>{value}{tr("text015")}</option>}
                  {options(field).map((option) => (
                    <option key={option} value={option}>
                      {index ? valueLabel(index, field, option, lang) : option}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>

        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          {(
            [
              [tr("text016"), mxLinehaul, setMxLinehaul],
              [tr("text017"), usLinehaul, setUsLinehaul],
              ["FSC", fsc, setFsc],
              [tr("text018"), crossingFee, setCrossingFee],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="field" style={{ flex: 1 }}>
              <span>{label}</span>
              <input value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" />
            </label>
          ))}
        </div>
        {/* A cross-border rate mixes currencies across its parts, so they are not added up here. */}
        <div className="cell-sub">
          {tr("text019")}</div>

        {crossing && (
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <label className="field" style={{ flex: 1 }}>
              <span>{tr("text020")}</span>
              <input value={mxCrossing} onChange={(e) => setMxCrossing(e.target.value)} placeholder="Nuevo Laredo" />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>{tr("text021")}</span>
              <input value={usCrossing} onChange={(e) => setUsCrossing(e.target.value)} placeholder="Laredo" />
            </label>
          </div>
        )}
      </div>
    </Dialog>
  );
}
