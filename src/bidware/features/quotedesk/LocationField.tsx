import { tr } from "@/i18n/quotedesk";
import { useLang } from "@/i18n/language";
import { useEffect, useRef, useState } from "react";
import { searchLocations, type LocationOption } from "./quotedesk.service";

const COUNTRIES = [
  { key: "MX", label: "MX" },
  { key: "US", label: "US" },
  { key: "CA", label: "CA" },
];

/** What a lane stores for one end of the route. */
export interface PlaceValue {
  label: string;
  city: string | null;
  state: string | null;
  state_name?: string | null;
  country: string;
  postal: string | null;
  market: string | null;
  region: string | null;
}

export function placeFromOption(option: LocationOption, country: string): PlaceValue {
  const place = (option.country || country || "").toUpperCase();
  const mx = place === "MX";
  return {
    // MX places are "City, State"; the catalog's ZIP-prefixed MX rows keep the name only.
    label: mx && option.city ? [option.city, option.state_code].filter(Boolean).join(", ") : option.value || option.label,
    city: option.city ?? null,
    state: option.state_code ?? null,
    state_name: option.state_name ?? null,
    country: place,
    postal: mx ? null : option.zip_prefix ?? null,
    market: option.market ?? null,
    region: option.region ?? null,
  };
}

/** The MX catalog repeats a city once per postal prefix; show it once. */
function oneOptionPerCity(rows: LocationOption[]): LocationOption[] {
  const seen = new Map<string, LocationOption>();
  for (const row of rows) {
    const key = [row.city, row.state_code, row.market].map((v) => String(v ?? "").toUpperCase()).join("|");
    const current = seen.get(key);
    if (!current || (/^\d/.test(current.value) && !/^\d/.test(row.value))) seen.set(key, row);
  }
  return [...seen.values()];
}

/** Geography granularity follows FCM: MX = city + state; US/CA = 3-digit ZIP and/or KMA market. */
export function placeHint(place: PlaceValue | null): string {
  if (!place) return "";
  if (place.country === "MX") return [place.city, place.state].filter(Boolean).join(", ") || tr("text131");
  return [place.postal ? `ZIP3 ${place.postal}` : null, place.market].filter(Boolean).join(" · ") || "ZIP3 / KMA";
}

export function LocationField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: PlaceValue | null;
  onChange: (next: PlaceValue | null) => void;
  disabled?: boolean;
}) {
  useLang();
  const [country, setCountry] = useState(value?.country || "MX");
  const [query, setQuery] = useState(value?.label ?? "");
  const [options, setOptions] = useState<LocationOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The last search came back empty: say so instead of showing nothing.
  const [noResults, setNoResults] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    setQuery(value?.label ?? "");
    if (value?.country) setCountry(value.country);
  }, [value?.label, value?.country]);

  useEffect(() => {
    if (!open) return;
    const text = query.trim();
    if (text.length < 2 || text === value?.label) {
      setOptions([]);
      setNoResults(false);
      return;
    }
    const id = ++seq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchLocations(text, country)
        .then((rows) => {
          if (id === seq.current) {
            const next = country === "MX" ? oneOptionPerCity(rows) : rows;
            setOptions(next);
            setNoResults(!next.length);
            setError(null);
          }
        })
        .catch((e) => id === seq.current && setError((e as Error).message))
        .finally(() => id === seq.current && setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, country, open, value?.label]);

  return (
    <div className="field qd-location">
      <div className="qd-field-head">
        <span>{label}</span>
        <div className="qd-country">
          {COUNTRIES.map((c) => (
            <button
              key={c.key}
              type="button"
              disabled={disabled}
              className={country === c.key ? "active" : undefined}
              onClick={() => {
                setCountry(c.key);
                if (value && value.country !== c.key) onChange(null);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <input
        value={query}
        disabled={disabled}
        placeholder={country === "MX" ? tr("text132") : tr("text133")}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value && e.target.value !== value.label) onChange(null);
        }}
      />
      <span className="qd-hint">{value ? placeHint(value) : tr("text134")}</span>
      {open && (searching || options.length > 0 || error || noResults) && (
        <div className="qd-options" role="listbox">
          {searching && <div className="qd-option muted">{tr("text135")}</div>}
          {error && <div className="qd-option muted">{error}</div>}
          {!searching && !error && noResults && (
            <div className="qd-option muted">
              {tr("text136")}{country === "MX" ? "" : tr("text137")}.
            </div>
          )}
          {options.map((option) => (
            <button
              type="button"
              key={`${option.id}-${option.value}`}
              className="qd-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const next = placeFromOption(option, country);
                onChange(next);
                setQuery(next.label);
                setOpen(false);
              }}
            >
              <strong>{country === "MX" ? placeFromOption(option, country).label : option.value}</strong>
              <span>
                {(country === "MX"
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
