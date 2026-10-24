import { domainLabel } from "@/i18n/domain";
import { tr } from "@/i18n/rfx-admin";
import { useLang, getLang } from "@/i18n/language";
import { useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorBanner, InfoBanner, Pill, money } from "@/components/ui";
import { downloadTemplate } from "@/features/shipper-request/excel";
import type { LocationOption } from "@/features/quotedesk/quotedesk.service";
import type { RfxEvent } from "@/types/domain";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { listRfxEvents } from "./rfx.service";
import {
  buildCatalogIndex,
  CATALOG_FIELDS,
  choiceKey,
  cityKey,
  emptySourceLane,
  pendingPlaces,
  pendingValues,
  placeFromOption,
  placeKey,
  reviewLanes,
  textCity,
  valueLabel,
  type CatalogField,
  type CatalogIndex,
  type Choice,
  type Choices,
  type LaneReview,
  type PendingPlace,
  type PendingValue,
  type PlaceChoice,
  type PlaceChoices,
  type PlaceLookup,
  type SourceLane,
} from "./laneImport";
import {
  lanesFromEvent,
  lanesFromFile,
  lanesFromPaste,
  lanesFromRatebook,
  listRatebooks,
  loadCatalogRows,
  lookupPlace,
  searchPlaces,
  type RatebookOption,
} from "./laneSources";

// ------------------------------------------------------------- state

/** Looks up every place text once in the location catalog, four at a time. */
function usePlaceLookups(lanes: SourceLane[]) {
  const [lookups, setLookups] = useState<Record<string, PlaceLookup>>({});
  const started = useRef(new Set<string>());
  useEffect(() => {
    const todo = lanes
      .flatMap((lane) => [lane.origin, lane.destination])
      .filter((place) => {
        const key = placeKey(place.text);
        if (!key || place.resolved || started.current.has(key)) return false;
        started.current.add(key);
        return true;
      });
    if (!todo.length) return;
    setLookups((prev) => ({ ...prev, ...Object.fromEntries(todo.map((place) => [placeKey(place.text), { status: "searching" } as PlaceLookup])) }));
    const queue = [...todo];
    const worker = async () => {
      while (queue.length) {
        const place = queue.shift()!;
        const result = await lookupPlace(place).catch((): PlaceLookup => ({ status: "pending", suggestions: [] }));
        setLookups((prev) => ({ ...prev, [placeKey(place.text)]: result }));
      }
    };
    void Promise.all(Array.from({ length: 4 }, worker));
  }, [lanes]);
  return lookups;
}

/** Everything step 3 keeps: the lanes, the team's decisions, and what they add up to. */
export function useLaneReview() {
  const [lanes, setLanes] = useState<SourceLane[]>([]);
  const [choices, setChoices] = useState<Choices>({});
  const [placeChoices, setPlaceChoices] = useState<PlaceChoices>({});
  const [omitted, setOmitted] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState<CatalogIndex | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const lookups = usePlaceLookups(lanes);

  useEffect(() => {
    loadCatalogRows()
      .then((rows) => setIndex(buildCatalogIndex(rows)))
      .catch((e) => setCatalogError((e as Error).message));
  }, []);

  const reviews = useMemo(
    () => (index ? reviewLanes(lanes, index, choices, lookups, placeChoices, omitted) : []),
    [getLang(), lanes, index, choices, lookups, placeChoices, omitted],
  );
  const values = useMemo(() => (index ? pendingValues(reviews, index, choices) : []), [getLang(), reviews, index, choices]);
  const places = useMemo(() => pendingPlaces(reviews, lookups, placeChoices), [getLang(), reviews, lookups, placeChoices]);
  const count = (status: LaneReview["status"]) => reviews.filter((review) => review.status === status).length;
  const summary = {
    total: reviews.length,
    ready: count("ready"),
    pending: count("pending"),
    omitted: count("omitted"),
    duplicate: count("duplicate"),
    searching: reviews.some((review) => review.origin.status === "searching" || review.destination.status === "searching"),
  };

  return {
    lanes,
    reviews,
    values,
    places,
    index,
    catalogError,
    summary,
    choices,
    placeChoices,
    addLanes: (next: SourceLane[]) => setLanes((prev) => [...prev, ...next]),
    clear: () => {
      setLanes([]);
      setOmitted(new Set());
    },
    toggleOmit: (key: string) =>
      setOmitted((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    omitMany: (keys: string[]) => setOmitted((prev) => new Set([...prev, ...keys])),
    decide: (field: string, text: string, choice: Choice | null) =>
      setChoices((prev) => {
        const next = { ...prev };
        if (choice) next[choiceKey(field, text)] = choice;
        else delete next[choiceKey(field, text)];
        return next;
      }),
    decidePlace: (text: string, choice: PlaceChoice | null) =>
      setPlaceChoices((prev) => {
        const next = { ...prev };
        if (choice) next[placeKey(text)] = choice;
        else delete next[placeKey(text)];
        return next;
      }),
    useAllSuggestions: () =>
      setChoices((prev) => {
        const next = { ...prev };
        for (const value of values) {
          if (!value.choice && value.suggestion) next[choiceKey(value.field, value.text)] = { kind: "map", value: value.suggestion, saveAlias: false };
        }
        return next;
      }),
  };
}

export type LaneReviewState = ReturnType<typeof useLaneReview>;

/** The market, only when its city isn't the place's own (El Paso priced as Las Cruces). */
const marketNote = (text: string, market?: string | null) =>
  market && cityKey(market.split(",")[0]) !== cityKey(text.split(",")[0]) ? market : null;

/** "L-004": the lane as the team numbers it in this load. */
const laneRef = (position: number) => `L-${String(position + 1).padStart(3, "0")}`;

/** The positions of the lanes that carry a value or a place the catalog didn't know. */
function lanesWithValue(reviews: LaneReview[], field: CatalogField, text: string) {
  const key = choiceKey(field, text);
  return reviews.flatMap((review, position) =>
    (review.status === "ready" || review.status === "pending") && choiceKey(field, review.values[field].text) === key ? [position] : [],
  );
}

function lanesWithPlace(reviews: LaneReview[], text: string) {
  const key = placeKey(text);
  return reviews.flatMap((review, position) =>
    (review.status === "ready" || review.status === "pending") &&
    (placeKey(review.origin.text) === key || placeKey(review.destination.text) === key)
      ? [position]
      : [],
  );
}

/** The review as a CSV the team can keep: every lane, its state and what it waits on. */
function downloadReport(reviews: LaneReview[], index: CatalogIndex, fileName: string) {
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const STATE: Record<LaneReview["status"], string> = {
    ready: tr("text274"),
    pending: tr("text110"),
    omitted: tr("text275"),
    duplicate: tr("text276"),
    no_route: tr("text277"),
  };
  const rows = [
    ["Lane", tr("text077"), tr("text078"), tr("text278"), tr("text279"), tr("text080"), tr("text081"), tr("text280"), tr("text281"), tr("text282"), tr("text110")],
    ...reviews.map((review, position) => {
      const waiting = [
        ...CATALOG_FIELDS.filter((field) => review.values[field.key].status === "pending").map(
          (field) => `${domainLabel(field.label)}: ${review.values[field.key].text}`,
        ),
        ...[review.origin, review.destination].filter((place) => place.status === "pending").map((place) => tr("text283", place.text)),
      ];
      const shown = (field: CatalogField) => {
        const value = review.values[field];
        return value.status === "ok" ? valueLabel(index, field, value.value) : value.text;
      };
      return [
        laneRef(position),
        review.origin.place.text || review.origin.text,
        review.destination.place.text || review.destination.text,
        shown("equipment"),
        shown("trailer"),
        shown("operation"),
        shown("service"),
        review.lane.weekly_volume ?? "",
        review.lane.target_rate ?? "",
        STATE[review.status],
        waiting.join(" · "),
      ];
    }),
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `${fileName.replace(/\.[^.]+$/, "") || "rutas"}-reporte.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ------------------------------------------------------------- loading

type Source = "excel" | "manual" | "event" | "ratebook";
const SOURCES: { key: Source; label: string; hint: string }[] = [
  { key: "excel", get label() { return tr("text284"); }, get hint() { return tr("text285"); } },
  { key: "manual", get label() { return tr("text286"); }, get hint() { return tr("text287"); } },
  { key: "event", get label() { return tr("text288"); }, get hint() { return tr("text289"); } },
  { key: "ratebook", get label() { return tr("text290"); }, get hint() { return tr("text291"); } },
];

function LaneSources({ state, shipperId, shipperName }: { state: LaneReviewState; shipperId: string | null; shipperName: string }) {
  useLang();
  const [source, setSource] = useState<Source>("excel");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [manual, setManual] = useState({ origin: "", destination: "", unit: "", weekly: "", target: "" });
  const [events, setEvents] = useState<RfxEvent[] | null>(null);
  const [eventId, setEventId] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [ratebooks, setRatebooks] = useState<RatebookOption[] | null>(null);
  const [ratebookId, setRatebookId] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const { summary } = state;

  useEffect(() => {
    if (source === "event" && !events) {
      listRfxEvents()
        .then((rows) => setEvents(rows))
        .catch((e) => setError((e as Error).message));
    }
  }, [source, events]);

  useEffect(() => {
    if (source !== "ratebook") return;
    setRatebooks(null);
    listRatebooks(shipperId)
      .then((rows) => setRatebooks(rows))
      .catch((e) => setError((e as Error).message));
  }, [source, shipperId]);

  async function run(load: () => Promise<{ lanes: SourceLane[]; note?: string }>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { lanes, note } = await load();
      if (!lanes.length) {
        setNotice(tr("text292"));
        return;
      }
      state.addLanes(lanes);
      setNotice(tr("text293", lanes.length, note ? ` ${note}` : ""));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function readFile(picked: File) {
    void run(async () => {
      const read = await lanesFromFile(picked);
      if (read.lanes.length) setFile(picked.name);
      return { lanes: read.lanes, note: read.sheet ? tr("text294", read.sheet) : undefined };
    });
  }

  function addManual() {
    const amount = (value: string) => (value.trim() ? Number(value.replace(/[^0-9.]/g, "")) || null : null);
    void run(async () => ({
      lanes: [
        {
          ...emptySourceLane(tr("text295")),
          origin: { text: manual.origin.trim() },
          destination: { text: manual.destination.trim() },
          unit: manual.unit.trim(),
          weekly_volume: amount(manual.weekly),
          target_rate: amount(manual.target),
        },
      ],
    }));
    setManual({ origin: "", destination: "", unit: "", weekly: "", target: "" });
  }

  const eventOptions = (events ?? [])
    .filter((event) => event.status !== "archived")
    .filter((event) => {
      const words = eventFilter.trim().toLowerCase();
      if (!words) return true;
      return [event.rfx_id, event.name, event.customer].some((value) => String(value ?? "").toLowerCase().includes(words));
    })
    .sort((a, b) => {
      // The shipper's own events first, then the newest.
      const mine = (event: RfxEvent) =>
        (shipperId && event.customer_id === shipperId) || (shipperName && String(event.customer ?? "").toLowerCase() === shipperName.toLowerCase()) ? 0 : 1;
      return mine(a) - mine(b) || String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? ""));
    });

  return (
    <>
      <div className="nev-sources" role="radiogroup" aria-label={tr("text296")}>
        {SOURCES.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={source === option.key}
            className={source === option.key ? "on" : undefined}
            onClick={() => {
              setSource(option.key);
              setNotice(null);
              setError(null);
            }}
          >
            <b>
              <i />
              {option.label}
            </b>
            <span>{option.hint}</span>
          </button>
        ))}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) readFile(picked);
        }}
      />

      {source === "excel" &&
        (file && summary.total ? (
          <div className="nev-filebar">
            <span className="mono">{file}</span>
            <span>{summary.total} {tr("text297")}</span>
            <span className="ok">{summary.ready} {tr("text298")}</span>
            {summary.pending > 0 && <span className="warn">{summary.pending} {tr("text299")}</span>}
            <span className="spacer" />
            {state.index && (
              <button className="link nev-report" onClick={() => downloadReport(state.reviews, state.index!, file)}>
                {tr("text300")}</button>
            )}
            <button
              className="link"
              disabled={busy}
              onClick={() => {
                state.clear();
                setFile(null);
                fileInput.current?.click();
              }}
            >
              {tr("text301")}</button>
          </div>
        ) : (
          <div className="nev-drop">
            <p>
              {tr("text302")}</p>
            <div className="row" style={{ gap: 8 }}>
              <button className="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
                {busy ? tr("text303") : tr("text304")}
              </button>
              <button onClick={() => void downloadTemplate("es")}>{tr("text305")}</button>
            </div>
          </div>
        ))}

      {source === "manual" && (
        <div className="nev-drop">
          <div className="nev-manual">
            <label className="nev-field">
              <span>{tr("text077")}</span>
              <input value={manual.origin} onChange={(e) => setManual({ ...manual, origin: e.target.value })} placeholder="Monterrey, NL" />
            </label>
            <label className="nev-field">
              <span>{tr("text078")}</span>
              <input value={manual.destination} onChange={(e) => setManual({ ...manual, destination: e.target.value })} placeholder="Laredo, TX" />
            </label>
            <label className="nev-field">
              <span>{tr("text079")}</span>
              <input value={manual.unit} onChange={(e) => setManual({ ...manual, unit: e.target.value })} placeholder={tr("text306")} />
            </label>
            <label className="nev-field">
              <span>{tr("text280")}</span>
              <input inputMode="numeric" value={manual.weekly} onChange={(e) => setManual({ ...manual, weekly: e.target.value })} />
            </label>
            <label className="nev-field">
              <span>{tr("text281")}</span>
              <input inputMode="decimal" value={manual.target} onChange={(e) => setManual({ ...manual, target: e.target.value })} />
            </label>
            <button disabled={busy || !(manual.origin.trim() && manual.destination.trim())} onClick={addManual}>
              {tr("text307")}</button>
          </div>
          <p className="cell-sub">{tr("text308")}</p>
          <details className="nev-paste">
            <summary>{tr("text309")}</summary>
            <label className="nev-field">
              <span>{tr("text310")}</span>
              <textarea
                rows={5}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={tr("text311")}
                className="mono"
              />
            </label>
            <button
              disabled={busy || !paste.trim()}
              onClick={() =>
                void run(async () => {
                  const lanes = lanesFromPaste(paste);
                  if (lanes.length) setPaste("");
                  return { lanes };
                })
              }
            >
              {tr("text312")}</button>
          </details>
        </div>
      )}

      {source === "event" && (
        <div className="nev-drop">
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <label className="nev-field" style={{ flex: 1 }}>
              <span>{tr("text313")}</span>
              <input value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} placeholder={tr("text314")} />
            </label>
            <label className="nev-field" style={{ flex: 2 }}>
              <span>{tr("text225")}</span>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">{events ? tr("text315") : tr("text316")}</option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {[event.rfx_id, event.name, event.customer].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy || !eventId}
              onClick={() => {
                const event = (events ?? []).find((row) => row.id === eventId);
                void run(async () => ({ lanes: await lanesFromEvent(eventId, String(event?.rfx_id || tr("text225"))) }));
              }}
            >
              {tr("text317")}</button>
          </div>
          <p className="cell-sub">{tr("text318")}</p>
        </div>
      )}

      {source === "ratebook" && (
        <div className="nev-drop">
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <label className="nev-field" style={{ flex: 1 }}>
              <span>{shipperId ? tr("text319", shipperName) : tr("text320")}</span>
              <select value={ratebookId} onChange={(e) => setRatebookId(e.target.value)}>
                <option value="">{ratebooks ? (ratebooks.length ? tr("text321") : tr("text322")) : tr("text323")}</option>
                {(ratebooks ?? []).map((ratebook) => (
                  <option key={ratebook.id} value={ratebook.id}>
                    {[ratebook.name, ratebook.shipper, tr("text324", ratebook.lanes)].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy || !ratebookId}
              onClick={() => {
                const ratebook = (ratebooks ?? []).find((row) => row.id === ratebookId);
                if (ratebook) void run(async () => ({ lanes: await lanesFromRatebook(ratebook) }));
              }}
            >
              {tr("text317")}</button>
          </div>
        </div>
      )}

      {notice && <InfoBanner>{notice}</InfoBanner>}
      {error && <ErrorBanner message={error} />}
    </>
  );
}

// ------------------------------------------------------------- the team's decisions

/** Looks up a place in the location catalog for a text it didn't match on its own. */
function PlaceSearch({ onPick }: { onPick: (option: LocationOption) => void }) {
  useLang();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<LocationOption[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setRows([]);
      return;
    }
    const id = ++seq.current;
    const timer = window.setTimeout(() => {
      searchPlaces(text)
        .then((found) => id === seq.current && setRows(found.slice(0, 8)))
        .catch(() => id === seq.current && setRows([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  return (
    <div style={{ position: "relative" }}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("text325")} />
      {rows.length > 0 && (
        <div className="qd-options" role="listbox">
          {rows.map((option) => (
            <button
              key={`${option.id}-${option.value}`}
              type="button"
              className="qd-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(option);
                setQuery("");
                setRows([]);
              }}
            >
              <strong>{placeName(option)}</strong>
              <span>{placeDetail(option)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const placeName = (option: LocationOption) =>
  option.country === "MX" && option.city ? [option.city, option.state_name || option.state_code].filter(Boolean).join(", ") : option.value || option.label;
const placeDetail = (option: LocationOption) =>
  [option.country, option.zip_prefix && option.country !== "MX" ? `ZIP3 ${option.zip_prefix}` : null, option.market].filter(Boolean).join(" · ");

/** One value the catalog didn't know, as the design reads it: received → mapped to, alias, Mapear or omitir. */
function MapValueRow({ item, state, positions }: { item: PendingValue; state: LaneReviewState; positions: number[] }) {
  useLang();
  const { can } = useAuth();
  const index = state.index!;
  const field = CATALOG_FIELDS.find((entry) => entry.key === item.field)!;
  const mapped = item.choice?.kind === "map" ? item.choice : null;
  const [draft, setDraft] = useState(mapped?.value ?? item.suggestion ?? "");
  const [alias, setAlias] = useState(mapped?.saveAlias ?? false);
  const omit = () => state.omitMany(positions.map((position) => state.reviews[position].lane.key));

  if (item.choice) {
    return (
      <div className="nev-maprow done">
        <div className="nev-ref">
          <b className="mono">{positions.length ? laneRef(positions[0]) : "—"}</b>
          <span>{domainLabel(field.label)}</span>
        </div>
        <span className="nev-received mono">{item.text}</span>
        <span className="nev-arrow">→</span>
        <span className="nev-mapped">
          ✓ {mapped ? valueLabel(index, item.field, mapped.value) : tr("text109")}
          {mapped?.saveAlias && <em> {tr("text326")}</em>}
        </span>
        <button className="link" onClick={() => state.decide(item.field, item.text, null)}>
          {tr("text327")}</button>
      </div>
    );
  }
  return (
    <div className="nev-maprow">
      <div className="nev-ref">
        <b className="mono">{positions.length ? laneRef(positions[0]) : "—"}</b>
        <span>
          {domainLabel(field.label)}
          {item.count > 1 ? tr("text328", item.count) : ""}
        </span>
      </div>
      <div className="nev-recv">
        <em>{tr("text329")}</em>
        <span className="nev-received mono">{item.text}</span>
      </div>
      <span className="nev-arrow">→</span>
      <div className="nev-target">
        <em>
          {tr("text330")}{draft && draft === item.suggestion && <Pill tone="blue">{tr("text331")}</Pill>}
        </em>
        <select value={draft} onChange={(e) => setDraft(e.target.value)}>
          <option value="">{tr("text332")}</option>
          {index.options[item.field].map((option) => (
            <option key={option} value={option}>
              {valueLabel(index, item.field, option)}
            </option>
          ))}
          <option value="__keep__">{tr("text333")}</option>
        </select>
      </div>
      <label className="nev-alias" title={can("admin") ? undefined : NEED_REASON.admin}>
        <input type="checkbox" checked={alias} disabled={!can("admin") || draft === "__keep__"} onChange={(e) => setAlias(e.target.checked)} />
        {tr("text334")}</label>
      <button
        className="primary"
        disabled={!draft}
        onClick={() =>
          state.decide(item.field, item.text, draft === "__keep__" ? { kind: "keep" } : { kind: "map", value: draft, saveAlias: alias && can("admin") })
        }
      >
        {tr("text335")}</button>
      <button className="link nev-omit" onClick={omit} title={tr("text336", positions.length)}>
        {tr("text337")}</button>
    </div>
  );
}

/** One place the location catalog couldn't settle without doubt. */
function MapPlaceRow({ item, state, positions }: { item: PendingPlace; state: LaneReviewState; positions: number[] }) {
  useLang();
  const { can } = useAuth();
  const mapped = item.choice?.kind === "map" ? item.choice : null;
  const city = textCity(item.text);
  const [draft, setDraft] = useState<LocationOption | null>(item.suggestions[0] ?? null);
  const [alias, setAlias] = useState(false);
  const omit = () => state.omitMany(positions.map((position) => state.reviews[position].lane.key));

  if (item.choice) {
    const result = mapped ? placeFromOption(mapped.option, item.text, mapped.keepCity) : null;
    return (
      <div className="nev-maprow done">
        <div className="nev-ref">
          <b className="mono">{positions.length ? laneRef(positions[0]) : "—"}</b>
          <span>{tr("text338")}{item.nearby ? " · market" : ""}</span>
        </div>
        <span className="nev-received mono">{item.text}</span>
        <span className="nev-arrow">→</span>
        <span className="nev-mapped">
          ✓ {result ? [result.text, marketNote(result.text, result.market)].filter(Boolean).join(" · ") : tr("text109")}
          {mapped?.keepCity && <em> {tr("text339")}{city} {tr("text340")}</em>}
          {mapped?.saveAlias && <em> {tr("text326")}</em>}
        </span>
        <button className="link" onClick={() => state.decidePlace(item.text, null)}>
          {tr("text327")}</button>
      </div>
    );
  }
  // A town the catalog doesn't have borrows its state's market and keeps its own name.
  const keepCity = item.nearby && Boolean(draft) && cityKey(draft?.city) !== cityKey(city);
  return (
    <div className="nev-maprow">
      <div className="nev-ref">
        <b className="mono">{positions.length ? laneRef(positions[0]) : "—"}</b>
        <span>
          {item.nearby ? tr("text341") : tr("text338")}
          {item.count > 1 ? tr("text328", item.count) : ""}
        </span>
      </div>
      <div className="nev-recv">
        <em>{tr("text329")}</em>
        <span className="nev-received mono">{item.text}</span>
      </div>
      <span className="nev-arrow">→</span>
      <div className="nev-target">
        <em>
          {tr("text330")}{draft && draft === item.suggestions[0] && <Pill tone="blue">{tr("text331")}</Pill>}
        </em>
        {item.suggestions.length > 0 ? (
          <select
            value={draft ? `${draft.id}|${draft.value}` : ""}
            onChange={(e) => setDraft(item.suggestions.find((option) => `${option.id}|${option.value}` === e.target.value) ?? null)}
          >
            {item.suggestions.slice(0, item.nearby ? 12 : 8).map((option) => (
              <option key={`${option.id}|${option.value}`} value={`${option.id}|${option.value}`}>
                {item.nearby ? `${option.market} (${placeName(option)})` : `${placeName(option)} · ${placeDetail(option)}`}
              </option>
            ))}
          </select>
        ) : (
          <span className="cell-sub">{tr("text342")}</span>
        )}
        <PlaceSearch onPick={(option) => setDraft(option)} />
      </div>
      <label className="nev-alias" title={can("admin") ? undefined : NEED_REASON.admin}>
        <input type="checkbox" checked={alias} disabled={!can("admin") || !draft?.id || keepCity} onChange={(e) => setAlias(e.target.checked)} />
        {tr("text343")}</label>
      <div className="nev-actions">
        <button
          className="primary"
          disabled={!draft}
          onClick={() =>
            draft && state.decidePlace(item.text, { kind: "map", option: draft, saveAlias: alias && !keepCity && can("admin"), keepCity })
          }
        >
          {tr("text335")}</button>
        <button className="link" onClick={() => state.decidePlace(item.text, { kind: "keep" })}>
          {tr("text344")}</button>
        <button className="link nev-omit" onClick={omit} title={tr("text345", positions.length)}>
          {tr("text337")}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- lanes

const STATUS: Record<LaneReview["status"], { label: string; tone: "green" | "amber" | "" }> = {
  ready: { get label() { return tr("text346"); }, tone: "green" },
  pending: { get label() { return tr("text347"); }, tone: "amber" },
  omitted: { get label() { return tr("text348"); }, tone: "" },
  duplicate: { get label() { return tr("text349"); }, tone: "" },
  no_route: { get label() { return tr("text350"); }, tone: "amber" },
};

function cell(index: CatalogIndex, review: LaneReview, field: CatalogField) {
  const value = review.values[field];
  if (value.status === "empty") return null;
  if (value.status === "pending") return <span className="ne-pending">{value.text}</span>;
  return valueLabel(index, field, value.value);
}

function placeCell(place: LaneReview["origin"]) {
  if (place.status === "empty") return <span className="cell-sub">—</span>;
  if (place.status === "searching") return <span className="cell-sub">{place.text} {tr("text351")}</span>;
  if (place.status === "pending") return <span className="ne-pending">{place.text}</span>;
  // The market only when it says something the text doesn't (El Paso priced as Las Cruces).
  const shown = place.place.text || place.text;
  const code = marketNote(shown, place.place.market);
  return (
    <span title={[place.place.market, place.place.region].filter(Boolean).join(" · ")}>
      {shown}
      {code && <span className="cell-sub"> ({code})</span>}
      {place.status === "kept" && <span className="cell-sub"> {tr("text352")}</span>}
    </span>
  );
}

/**
 * Step 3 (wireframe 14): load lanes from any source, settle what the catalog
 * didn't know, review. Nothing is dropped on its own: a lane leaves only when
 * someone omits it.
 */
export function LaneLoader({
  state,
  shipperId,
  shipperName,
  currency,
}: {
  state: LaneReviewState;
  shipperId: string | null;
  shipperName: string;
  /** The event's currency, for target rates that don't bring one. */
  currency: string;
}) {
  useLang();
  const { index, reviews, values, places, summary } = state;
  const mapRef = useRef<HTMLDivElement>(null);
  const suggestible = values.filter((value) => !value.choice && value.suggestion).length;
  const waiting = values.filter((value) => !value.choice).length + places.filter((place) => !place.choice).length;
  const pendingKeys = reviews.filter((review) => review.status === "pending").map((review) => review.lane.key);
  const kept = summary.ready + summary.pending;
  return (
    <div className="nev-lanes">
      <LaneSources state={state} shipperId={shipperId} shipperName={shipperName} />
      {state.catalogError && <ErrorBanner message={tr("text353", state.catalogError)} />}

      {reviews.length > 0 && index && (values.length > 0 || places.length > 0) && (
        <div className={`nev-map${waiting ? "" : " settled"}`} ref={mapRef}>
          <header>
            <b>{waiting ? tr("text354", waiting, waiting === 1 ? tr("text355") : tr("text356")) : tr("text357")}</b>
            <span className="spacer" />
            {suggestible > 0 && (
              <button className="primary" onClick={state.useAllSuggestions}>
                {tr("text358")}</button>
            )}
            {pendingKeys.length > 0 && <button onClick={() => state.omitMany(pendingKeys)}>{tr("text359")}</button>}
          </header>
          <p>
            {tr("text360")}</p>
          {values.map((item) => (
            <MapValueRow
              key={`${choiceKey(item.field, item.text)}|${item.choice ? "done" : "open"}`}
              item={item}
              state={state}
              positions={lanesWithValue(reviews, item.field, item.text)}
            />
          ))}
          {places.map((item) => (
            <MapPlaceRow
              key={`${placeKey(item.text)}|${item.choice ? "done" : "open"}`}
              item={item}
              state={state}
              positions={lanesWithPlace(reviews, item.text)}
            />
          ))}
        </div>
      )}

      {reviews.length > 0 && index && (
        <section className="nev-preview">
          <header>
            <b>{tr("text361")}</b>
            <Pill tone="blue">{tr("text362")}</Pill>
            <span className="spacer" />
            <span className="cell-sub">
              {kept === summary.total ? tr("text363", summary.total) : tr("text364", kept, summary.total)}
              {summary.searching ? tr("text365") : ""}
            </span>
          </header>
          <div className="nev-table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Lane</th>
                  <th>{tr("text077")}</th>
                  <th>{tr("text078")}</th>
                  <th>{tr("text079")}</th>
                  <th>{tr("text080")}</th>
                  <th>{tr("text081")}</th>
                  <th>Vol</th>
                  <th>Target</th>
                  <th>{tr("text282")}</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review, position) => {
                  const equipment = [cell(index, review, "equipment"), cell(index, review, "trailer")].filter(Boolean);
                  const status = STATUS[review.status];
                  return (
                    <tr
                      key={review.lane.key}
                      className={review.status === "pending" ? "nev-row-pending" : review.status === "omitted" || review.status === "duplicate" ? "nev-row-out" : undefined}
                    >
                      <td className="mono" title={review.lane.from}>
                        {laneRef(position)}
                      </td>
                      <td>{placeCell(review.origin)}</td>
                      <td>{placeCell(review.destination)}</td>
                      <td>
                        {equipment.length ? equipment.map((part, i) => <span key={i}>{i ? " · " : ""}{part}</span>) : <span className="cell-sub">—</span>}
                      </td>
                      <td>{cell(index, review, "operation") ?? <span className="cell-sub">—</span>}</td>
                      <td>{cell(index, review, "service") ?? <span className="cell-sub">—</span>}</td>
                      <td className="mono">{review.lane.weekly_volume != null ? tr("text084", review.lane.weekly_volume) : "—"}</td>
                      <td className="mono">
                        {review.lane.target_rate != null ? money(review.lane.target_rate, review.lane.currency || currency) : "—"}
                      </td>
                      <td>
                        <span className="nev-state">
                          <Pill tone={status.tone}>{status.label}</Pill>
                          {review.twinOf !== null && <span className="cell-sub">{tr("text366")}{laneRef(review.twinOf - 1)}</span>}
                          {review.status === "pending" ? (
                            <button className="link nev-jump" onClick={() => mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                              {tr("text367")}</button>
                          ) : (
                            (review.status === "ready" || review.status === "omitted") && (
                              <button className="link" onClick={() => state.toggleOmit(review.lane.key)}>
                                {review.status === "omitted" ? tr("text368") : tr("text337")}
                              </button>
                            )
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!reviews.length && <Empty title={tr("text369")} hint={tr("text370")} />}
    </div>
  );
}
