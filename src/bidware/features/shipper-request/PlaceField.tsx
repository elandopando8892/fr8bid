import { useEffect, useRef, useState } from "react";
import { placeFromText, placeText, type Lang, type Place } from "./request.model";
import { searchPlaces } from "./request.service";

const COUNTRIES = ["MX", "US", "CA"];

/** The MX catalog repeats a city once per postal prefix; show it once. */
function oneOptionPerCity(rows: Place[]): Place[] {
  const seen = new Map<string, Place>();
  for (const row of rows) {
    const key = [row.country, row.city, row.state_code, row.market].map((v) => String(v ?? "").toUpperCase()).join("|");
    const current = seen.get(key);
    if (!current || (/^\d/.test(current.value) && !/^\d/.test(row.value))) seen.set(key, row);
  }
  return [...seen.values()];
}

/**
 * Origin or destination, the way QuoteDesk picks it: a country, then a search
 * over the shared place catalog. A place that isn't in the catalog can stay
 * typed ("City, State"); the team resolves it when they quote.
 */
export function PlaceField({
  token,
  label,
  value,
  onChange,
  lang,
  invalid,
  compact,
}: {
  token: string;
  label: string;
  value: Place | null;
  onChange: (next: Place | null) => void;
  lang: Lang;
  invalid?: boolean;
  compact?: boolean;
}) {
  const [country, setCountry] = useState(value?.country || "MX");
  const [query, setQuery] = useState(placeText(value));
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);
  // While the shipper types, their text stays as typed; outside changes
  // (a picked suggestion, a restored draft, an import) replace it.
  const focused = useRef(false);
  const shown = placeText(value);

  useEffect(() => {
    if (focused.current) return;
    setQuery(shown);
    if (value?.country) setCountry(value.country);
  }, [shown, value?.country]);

  useEffect(() => {
    const text = query.trim();
    if (!open || text.length < 2 || (value?.id !== undefined && value?.id !== null && text === shown)) {
      setOptions([]);
      setSearching(false);
      return;
    }
    const id = ++seq.current;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        // A US city typed under the MX toggle still has to show up.
        let rows = await searchPlaces(token, text, country);
        if (!rows.length) rows = await searchPlaces(token, text);
        // MX repeats a city per postal prefix; US/CA keep their ZIP3 rows (FCM prices by ZIP3).
        const inMexico = (row: Place) => (row.country || country) === "MX";
        if (id === seq.current) setOptions([...oneOptionPerCity(rows.filter(inMexico)), ...rows.filter((row) => !inMexico(row))]);
      } catch {
        if (id === seq.current) setOptions([]);
      } finally {
        if (id === seq.current) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      setSearching(false);
    };
  }, [query, country, open, token, shown, value?.id]);

  const picked = value?.id !== undefined && value?.id !== null;
  const es = lang === "es";

  return (
    <div className={`field qd-location sr-place${invalid ? " sr-invalid" : ""}`}>
      <div className="qd-field-head">
        <span>{label}</span>
        <div className="qd-country" role="group" aria-label={es ? "País" : "Country"}>
          {COUNTRIES.map((code) => (
            <button
              key={code}
              type="button"
              className={country === code ? "active" : undefined}
              onClick={() => {
                setCountry(code);
                if (value && value.country !== code) onChange(query.trim() ? placeFromText(query, code) : null);
              }}
            >
              {code}
            </button>
          ))}
        </div>
      </div>
      <input
        value={query}
        placeholder={es ? "Ciudad, estado o código postal" : "City, state or ZIP code"}
        aria-invalid={invalid || undefined}
        onFocus={() => {
          focused.current = true;
          setOpen(true);
        }}
        onBlur={() => {
          focused.current = false;
          window.setTimeout(() => setOpen(false), 150);
          // "Laredo, Texas" is in the US whatever the toggle said; show it.
          if (value?.country && value.country !== country) setCountry(value.country);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // The country comes from a complete state or country name, else the toggle.
          const typed = placeFromText(e.target.value);
          onChange(typed ? { ...typed, country: typed.country ?? country } : null);
        }}
      />
      {!compact && (
        <span className="qd-hint">
          {picked
            ? [value?.market, value?.state_name, value?.country].filter(Boolean).join(" · ")
            : query.trim()
              ? es
                ? "Elige una sugerencia si aparece; si no, déjalo así."
                : "Pick a suggestion if one appears; otherwise leave it as typed."
              : " "}
        </span>
      )}
      {open && (searching || options.length > 0) && (
        <div className="qd-options" role="listbox">
          {searching && <div className="qd-option muted">{es ? "Buscando…" : "Searching…"}</div>}
          {options.map((option) => (
            <button
              type="button"
              role="option"
              key={`${option.id}-${option.value}`}
              className="qd-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const next: Place = { ...option, country: (option.country || country).toUpperCase() };
                onChange(next);
                setQuery(placeText(next));
                setOpen(false);
              }}
            >
              <strong>{placeText({ ...option, country: option.country || country })}</strong>
              <span>
                {(option.country === "MX" || country === "MX"
                  ? [option.market, option.state_name]
                  : [option.zip_prefix, option.market, option.state_code]
                )
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
