import { tr } from "@/i18n/shipper-shared";
import { useLang } from "@/i18n/language";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { searchShippers, type ShipperOption } from "@/features/quotedesk/quotedesk.service";
import { NewShipperDialog } from "@/features/shippers/NewShipperDialog";

/**
 * A shipper from the shared CRM, picked by name, contact or city. When it
 * isn't there yet, it can be created right here (with the duplicate check)
 * and comes back picked.
 */
export function ShipperPicker({
  value,
  onChange,
  autoFocus,
  appearance,
}: {
  value: ShipperOption | null;
  onChange: (shipper: ShipperOption | null) => void;
  autoFocus?: boolean;
  /** "card": the picked shipper as a card with its initials (Nuevo bid event). */
  appearance?: "card";
}) {
  useLang();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ShipperOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [focused, setFocused] = useState(false);
  const seq = useRef(0);
  const typed = search.trim();
  // As a card (wireframes 02 and 13) the list opens while searching, not before.
  const showList = appearance !== "card" || focused || Boolean(typed);

  useEffect(() => {
    if (value) return;
    const id = ++seq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchShippers(search)
        .then((found) => id === seq.current && setRows(found))
        .catch((e) => id === seq.current && setError((e as Error).message))
        .finally(() => id === seq.current && setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, value]);

  const pick = (shipper: ShipperOption) => {
    setCreating(false);
    onChange(shipper);
  };

  if (value && appearance === "card") {
    const name = value.shipper_name || value.legal_name || "Shipper";
    const initials =
      name
        .split(/\s+/)
        .filter((word) => /^[\p{L}\d]/u.test(word))
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase() || "S";
    return (
      <div className="nev-shipper-card">
        <span className="nev-avatar">{initials}</span>
        <div>
          <b>{name}</b>
          <span className="mono">
            {[value.industry, value.headquarters_city, value.headquarters_state].filter(Boolean).join(" · ") ||
              tr("text001")}
          </span>
        </div>
        <button type="button" className="link" title={tr("text002")} onClick={() => onChange(null)}>
          ✕
        </button>
      </div>
    );
  }
  if (value) {
    return (
      <div className="row qd-picked">
        <div>
          <div className="cell-title">{value.shipper_name || value.legal_name}</div>
          <div className="cell-sub">
            {[value.primary_contact_name, value.primary_contact_email, value.headquarters_city].filter(Boolean).join(" · ") ||
              tr("text003")}
          </div>
        </div>
        <div className="spacer" />
        <button type="button" onClick={() => onChange(null)}>
          {tr("text004")}</button>
      </div>
    );
  }
  return (
    <>
      <input
        autoFocus={autoFocus}
        className={appearance === "card" ? "nev-search" : undefined}
        value={search}
        placeholder={appearance === "card" ? tr("text005") : tr("text006")}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {/* Pressing inside the list keeps the search focused, so a click always lands. */}
      {showList && (
        <div className="qd-shipper-list" onMouseDown={(e) => e.preventDefault()}>
          {searching && <div className="qd-option muted">{tr("text007")}</div>}
          {error && <div className="qd-option muted">{error}</div>}
          {!searching && !rows.length && !error && (
            <div className="qd-option muted">{tr("text008")}{typed ? tr("text009", typed) : ""}.</div>
          )}
          {rows.map((shipper) => (
            <button key={shipper.id} type="button" className="qd-option" onClick={() => pick(shipper)}>
              <strong>{shipper.shipper_name || shipper.legal_name}</strong>
              <span>{[shipper.industry, shipper.headquarters_city, shipper.headquarters_state].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          {can("operate") && !searching && (
            <button type="button" className="qd-option" onClick={() => setCreating(true)}>
              <strong>{tr("text010")}{typed ? ` «${typed}»` : ""}</strong>
              <span>{tr("text011")}</span>
            </button>
          )}
        </div>
      )}
      {creating &&<NewShipperDialog initialName={typed} onClose={() => setCreating(false)} onCreated={pick} onUseExisting={pick} />}
    </>
  );
}
