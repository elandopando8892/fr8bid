import { tr } from "@/i18n/common";
import { useLang, getLang } from "@/i18n/language";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NAV } from "@/components/AppLayout";

interface Entry {
  label: string;
  to: string;
  kind: "Módulo" | "Acción";
  /** Other words people type for it. */
  words?: string;
}

/** The common jobs, each landing where it starts. */
const ACTIONS: Entry[] = [
  { get label() { return tr("text012"); }, to: "/rfx/new", kind: "Acción", get words() { return tr("text013"); } },
  { get label() { return tr("text014"); }, to: "/quotedesk?new=1", kind: "Acción", get words() { return tr("text015"); } },
  { get label() { return tr("text016"); }, to: "/intake", kind: "Acción", get words() { return tr("text017"); } },
  { get label() { return tr("text018"); }, to: "/templates/new", kind: "Acción", get words() { return tr("text019"); } },
  { get label() { return tr("text020"); }, to: "/carrier-fit", kind: "Acción", get words() { return tr("text021"); } },
  { get label() { return tr("text022"); }, to: "/tarifas", kind: "Acción", get words() { return tr("text023"); } },
  { get label() { return tr("text024"); }, to: "/archivos", kind: "Acción", get words() { return tr("text025"); } },
  { get label() { return tr("text026"); }, to: "/crm/higiene", kind: "Acción", get words() { return tr("text027"); } },
  { get label() { return tr("text028"); }, to: "/crm/rebotes", kind: "Acción", get words() { return tr("text029"); } },
];

/** Case- and accent-insensitive. */
const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * "Buscar módulos y acciones…" (wireframe 01): every sidebar module and the
 * common jobs. Enter opens the first match; the arrows move through them.
 */
export function ModuleSearch() {
  useLang();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const entries = useMemo<Entry[]>(
    () => [
      ...NAV.flatMap((group) => group.items.map((item) => ({ label: item.label, to: item.to, kind: "Módulo" as const }))),
      ...ACTIONS,
    ],
    [getLang()],
  );
  const matches = useMemo(() => {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return entries
      .filter((entry) => {
        const haystack = fold(`${entry.label} ${entry.words ?? ""}`);
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, 8);
  }, [getLang(), entries, query]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    setQuery("");
    setOpen(false);
    input.current?.blur();
    navigate(entry.to);
  }

  return (
    <div className="module-search" role="search">
      <input
        ref={input}
        value={query}
        placeholder={tr("text030")}
        aria-label={tr("text031")}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter") {
            go(matches[cursor]);
          } else if (e.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
        }}
      />
      {open && query.trim() && (
        <ul className="module-search-list" role="listbox">
          {matches.length ? (
            matches.map((entry, i) => (
              <li
                key={`${entry.kind}-${entry.to}-${entry.label}`}
                role="option"
                aria-selected={i === cursor}
                className={i === cursor ? "on" : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(entry);
                }}
                onMouseEnter={() => setCursor(i)}
              >
                <span>{entry.label}</span>
                <em>{getLang() === "en" ? (entry.kind === "Módulo" ? "Module" : "Action") : entry.kind}</em>
              </li>
            ))
          ) : (
            <li className="empty-hit">{tr("text032")}{query.trim()}»</li>
          )}
        </ul>
      )}
    </div>
  );
}
