/**
 * Lanes for a new bid event, from wherever the team has them — an Excel (our
 * template or MARKSMAN's RFI template), a paste, a previous event or a
 * Ratebook — checked against the shared catalog before they're created.
 *
 * A value the catalog doesn't know is never dropped: the team maps it (and can
 * save it as a synonym so the next file resolves on its own), keeps it as
 * written, or leaves the lane out. The catalog's official names stay the FCM's
 * ("Intra-Mex"); the template's names reach them through their synonyms.
 */
import {
  CONFIG_TYPES,
  EQUIPMENT_TYPES,
  OPERATION_TYPES,
  SERVICE_TYPES,
  TRUCK_TYPES,
  type CatalogOption,
} from "@/features/shipper-request/catalog";
import { countryFromWord, placeFromText, placeText, plain, type Place } from "@/features/shipper-request/places";
import type { LocationOption } from "@/features/quotedesk/quotedesk.service";
import type { LaneRubrics } from "./newEvent.service";
import type { Lang } from "@/i18n/language";

export type CatalogField = "equipment" | "trailer" | "config" | "operation" | "service";

/** Bid Room lane columns: `equipment` is the truck type, `trailer` the equipment type. */
export const CATALOG_FIELDS: { key: CatalogField; label: string }[] = [
  { key: "equipment", label: "Tipo de camión" },
  { key: "trailer", label: "Tipo de equipo" },
  { key: "config", label: "Configuración" },
  { key: "operation", label: "Operación" },
  { key: "service", label: "Servicio" },
];
const FIELDS = CATALOG_FIELDS.map((field) => field.key);

/** A row of rateware's shared catalog (list_catalog_values). */
export interface CatalogRow {
  source?: string | null;
  category: string;
  raw_value: string;
  normalized_value: string;
  code?: string | null;
  active?: boolean | null;
}

export interface CatalogIndex {
  /** Official values per field (active rows), sorted. */
  options: Record<CatalogField, string[]>;
  /** Any name (raw, official, code, the template's Spanish/English) → official value. */
  lookup: Record<CatalogField, Map<string, string>>;
  /** Official value → how the team reads it (the template's Spanish name, else itself). */
  labels: Record<CatalogField, Map<string, string>>;
}

/** The template's names for each field, in both languages. */
const TEMPLATE_LISTS: Record<CatalogField, CatalogOption[]> = {
  equipment: TRUCK_TYPES,
  trailer: EQUIPMENT_TYPES,
  config: CONFIG_TYPES,
  operation: OPERATION_TYPES,
  service: SERVICE_TYPES,
};

/** rateware's own precedence when two rows claim the same name (sourceRank). */
function sourceRank(source: string | null | undefined) {
  const text = String(source ?? "");
  if (text === "rateware_manual_catalog" || text.startsWith("rateware_reference_")) return 0;
  if (text === "rateware_google_catalog" || text === "cusCatalog") return 1;
  if (text === "rateware_seed") return 3;
  return 2;
}

export function buildCatalogIndex(rows: CatalogRow[]): CatalogIndex {
  const options = {} as CatalogIndex["options"];
  const lookup = {} as CatalogIndex["lookup"];
  const labels = {} as CatalogIndex["labels"];
  for (const field of FIELDS) {
    const active = rows.filter((row) => row.category === field && row.active !== false && String(row.normalized_value ?? "").trim());
    const best = new Map<string, { value: string; rank: number }>();
    for (const row of active) {
      const value = row.normalized_value.trim();
      const rank = sourceRank(row.source);
      for (const name of [row.raw_value, row.normalized_value, row.code]) {
        const key = plain(name);
        if (!key) continue;
        const current = best.get(key);
        if (!current || rank < current.rank || (rank === current.rank && value.localeCompare(current.value) < 0)) {
          best.set(key, { value, rank });
        }
      }
    }
    const map = new Map([...best].map(([key, entry]) => [key, entry.value]));
    const label = new Map<string, string>();
    // The template's Spanish and English names reach the official value through its own name.
    for (const entry of TEMPLATE_LISTS[field]) {
      const target = map.get(plain(entry.value));
      if (!target) continue;
      if (!label.has(target)) label.set(target, entry.es);
      for (const name of [entry.es, entry.en]) {
        const key = plain(name);
        if (key && !map.has(key)) map.set(key, target);
      }
    }
    options[field] = [...new Set(active.map((row) => row.normalized_value.trim()))].sort((a, b) => a.localeCompare(b));
    lookup[field] = map;
    labels[field] = label;
  }
  return { options, lookup, labels };
}

export function valueLabel(index: CatalogIndex, field: CatalogField, value: string, lang: Lang = "es") {
  const label = index.labels[field].get(value);
  if (!label) return value;
  return lang === "es" ? label : TEMPLATE_LISTS[field].find((entry) => entry.es === label)?.en ?? label;
}

export function resolveValue(index: CatalogIndex, field: CatalogField, text: string): string | null {
  const key = plain(text);
  return key ? index.lookup[field].get(key) ?? null : null;
}

// ------------------------------------------------------------- suggestions

/**
 * How people describe a unit or an operation in their own files ("Caja 53
 * grado alimenticio", "Exportación D2D", "Redondo"), on accent-free lowercase
 * text. First match wins; a suggestion is only offered, never applied alone.
 */
const WORDS: Record<CatalogField, [string, RegExp][]> = {
  equipment: [
    ["1.5 tons", /\b1 5 ?(t|ton|tons|toneladas)\b|\bcargo van\b|\bsprinter\b|^van$|\bcamioneta\b(?! (de )?3 5)/],
    ["3.5 tons", /\b3 5 ?(t|ton|tons|toneladas)?\b|\bbox truck\b|\bcamioneta (de )?3 5\b/],
    ["Rabon", /\brabon\b|\bstraight truck\b|\b(8|10) ?(t|ton|tons|toneladas)\b/],
    ["Thorton", /\bt?h?orton\b|\b(12|14|15|16|18) ?(t|ton|tons|toneladas)\b/],
    ["Truck Trailer", /\btruck trailer\b|\btract(o|or)|\btrailer\b|\bt3 s[23]\b|\bfull\b|\b(53|48)\b|\bcaja\b|\bdry van\b|\breefer\b|\bplataforma\b|\bflat ?bed\b/],
  ],
  trailer: [
    ["Reefer", /\breefer\b|refriger|\bthermo\b|\btermo\b|frigor|temperatura controlada/],
    ["Flatbed", /\bflat ?bed\b|\bplataforma\b/],
    ["Hazmat", /\bhazmat\b|\bhaz mat\b|peligros|hazardous/],
    ["Chassis", /\bchass?is\b|\bchasis\b|\bcontenedor\b|\bcontainer\b|portacontenedor/],
    ["Dry Van", /\bdry ?van\b|\bcaja seca\b|\bseca\b|\bdv\b|\bbox\b|\bcaja\b/],
  ],
  config: [
    ["Tandem", /\btandem\b|\bfull\b|\bdoble\b|\bdouble\b|\bt3 s2 r4\b/],
    ["Single", /\bsencill|\bsingle\b/],
  ],
  operation: [
    ["MX Drayage", /\bdrayage\b|\barrastre\b|\bpuerto\b|\bport\b|\bportacontenedor/],
    ["US Northbound", /\b(us|usa|eeuu|us ca)\b.*\b(northbound|norte)\b|\b(northbound|norte)\b.*\b(us|usa|eeuu)\b/],
    ["US Southbound", /\b(us|usa|eeuu|us ca)\b.*\b(southbound|sur)\b|\b(southbound|sur)\b.*\b(us|usa|eeuu)\b/],
    ["MX Northbound", /\bnorthbound\b|\bhacia el norte\b/],
    ["MX Southbound", /\bsouthbound\b|\bhacia el sur\b/],
    ["D2D Export", /\bexport/],
    ["D2D Import", /\bimport/],
    ["Local MX", /\blocal\b/],
    ["Intra-Mex", /\bnacional\b|\bdomestic|\bdomestico\b|\bintra ?m(e)?x|\binterplanta\b|\bftl mx\b/],
  ],
  service: [
    ["Roundtrip", /\bround ?trip\b|\bredondo\b|\brt\b/],
    ["Expedited", /\bexpedit|\burgente\b|\bexpress\b/],
    ["Dedicated", /\bdedicad|\bdedicated\b/],
    ["Milkrun", /\bmilk ?run\b/],
    ["Backhaul", /\bbackhaul\b|\bretorno\b/],
    ["One Way", /\bone ?way\b|\bsencillo\b|\bow\b|\bspot\b/],
  ],
};

/** The official value a text most likely means, for the team to confirm. */
export function suggestValue(index: CatalogIndex, field: CatalogField, text: string): string | null {
  const direct = resolveValue(index, field, text);
  if (direct) return direct;
  const words = plain(text);
  if (!words) return null;
  for (const [value, pattern] of WORDS[field]) {
    if (pattern.test(words) && index.options[field].includes(value)) return value;
  }
  const near = index.options[field].find((option) => {
    const name = plain(option);
    return name.length >= 3 && words.length >= 3 && (words.includes(name) || name.includes(words));
  });
  return near ?? null;
}

// ------------------------------------------------------------- lanes

/** One end of a lane as the source gave it. */
export interface SourcePlace {
  text: string;
  city?: string | null;
  state?: string | null;
  state_name?: string | null;
  country?: string | null;
  postal?: string | null;
  market?: string | null;
  region?: string | null;
  /** The source already carries the catalog's geography (a lane copied from an event). */
  resolved?: boolean;
}

export type { LaneRubrics };
export const RUBRIC_KEYS: (keyof LaneRubrics)[] = [
  "logistics_model",
  "operation_criteria",
  "business_rules",
  "service_specifications",
  "carrier_requirements",
  "other_notes",
];

export interface SourceLane {
  key: string;
  /** Where it came from, for the table ("Excel", "Pegado", "RFx-0926…"). */
  from: string;
  origin: SourcePlace;
  destination: SourcePlace;
  equipment: string;
  trailer: string;
  config: string;
  operation: string;
  service: string;
  /** One free-text unit ("Caja 53 grado alimenticio"): read as both truck and equipment type. */
  unit: string;
  weekly_volume: number | null;
  annual_volume: number | null;
  target_rate: number | null;
  currency: string;
  segment_name: string;
  notes: string;
  rubrics: LaneRubrics;
}

let laneSeq = 0;
export const laneKey = () => `ev-lane-${Date.now().toString(36)}-${(laneSeq += 1)}`;

export function emptySourceLane(from: string): SourceLane {
  return {
    key: laneKey(),
    from,
    origin: { text: "" },
    destination: { text: "" },
    equipment: "",
    trailer: "",
    config: "",
    operation: "",
    service: "",
    unit: "",
    weekly_volume: null,
    annual_volume: null,
    target_rate: null,
    // Empty when the source doesn't say: the event's currency fills it on import.
    currency: "",
    segment_name: "",
    notes: "",
    rubrics: {},
  };
}

/**
 * The text a lane gives for a catalog field. A free-text unit ("Caja 53
 * grado alimenticio") always says the truck type, and says the equipment type
 * only when it names one: a "Rabón" has no trailer to ask about.
 */
export function fieldText(lane: SourceLane, field: CatalogField, index?: CatalogIndex): string {
  const own = String(lane[field] ?? "").trim();
  if (own) return own;
  const unit = lane.unit.trim();
  if (!unit) return "";
  if (field === "equipment") return unit;
  if (field === "trailer") {
    const words = plain(unit);
    const named = (index && resolveValue(index, "trailer", unit)) || WORDS.trailer.some(([, pattern]) => pattern.test(words));
    return named ? unit : "";
  }
  return "";
}

// ------------------------------------------------------------- the team's decisions

/** What the team decided for one value the catalog didn't know. */
export type Choice = { kind: "map"; value: string; saveAlias: boolean } | { kind: "keep" };
export type Choices = Record<string, Choice>;
export const choiceKey = (field: string, text: string) => `${field}|${plain(text)}`;

/**
 * A place picked from the location catalog for a text it didn't match on its
 * own. `keepCity`: the town isn't in the catalog, so the lane keeps its own city
 * and takes the state, country and market of the place picked.
 */
export type PlaceChoice = { kind: "map"; option: LocationOption; saveAlias: boolean; keepCity?: boolean } | { kind: "keep" };
export type PlaceChoices = Record<string, PlaceChoice>;
export const placeKey = (text: string) => plain(text);

/**
 * How a place text stands: matched by the catalog, still being looked up, or
 * waiting on the team. `nearby`: the town isn't in the catalog and the
 * suggestions are its state's markets, one place each.
 */
export type PlaceLookup =
  | { status: "searching" }
  | { status: "ok"; option: LocationOption }
  | { status: "pending"; suggestions: LocationOption[]; nearby?: boolean };

export type ValueStatus = "ok" | "empty" | "pending" | "kept";

export interface ResolvedValue {
  text: string;
  value: string;
  status: ValueStatus;
  /** Whether the catalog knew it or the team decided it. */
  via?: "catalog" | "choice";
}

export interface ResolvedPlace {
  text: string;
  status: ValueStatus | "searching";
  place: SourcePlace;
}

export interface LaneReview {
  lane: SourceLane;
  values: Record<CatalogField, ResolvedValue>;
  origin: ResolvedPlace;
  destination: ResolvedPlace;
  /** 1-based number of the earlier lane this one repeats (the server would skip it). */
  twinOf: number | null;
  omitted: boolean;
  status: "ready" | "pending" | "omitted" | "duplicate" | "no_route";
}

/**
 * A place text in its parts: "Queretaro, QE 76246" is the city, the state and
 * a postal code (Ratebooks and older events write them that way).
 */
export function placeParts(text: string): { city: string; state: string; postal: string } {
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  const zip = (value: string) => value.match(/^(.*?)\s*\b(\d{5}(?:-\d{4})?)$/);
  let postal = "";
  const cut = (value: string) => {
    const found = zip(value);
    if (!found) return value;
    postal = postal || found[2];
    return found[1].trim();
  };
  const city = cut(parts[0] ?? "");
  const state = cut(parts[1] ?? "");
  if (!postal && /^\d{5}(?:-\d{4})?$/.test(parts[2] ?? "")) postal = parts[2];
  return { city, state, postal };
}

/** The city a place text names: "Tultitlán" in "Tultitlán, MEX". */
export const textCity = (text: string) => placeParts(text).city;

/**
 * A catalog place as the lane stores it: "Saltillo, Coahuila" / "Laredo, TX",
 * with its geography. With `keepCity` the lane's own city stays and only the
 * state, country and market come from the catalog.
 */
export function placeFromOption(option: LocationOption, text: string, keepCity = false): SourcePlace {
  const country = String(option.country ?? "").toUpperCase() || null;
  const { postal } = placeParts(text);
  const city = (keepCity && textCity(text)) || option.city || null;
  const place: Place = {
    value: option.value || text,
    city,
    state_code: option.state_code ?? null,
    state_name: option.state_name ?? null,
    country,
  };
  const name = placeText(place) || text;
  return {
    // The source's own postal code stays: it says where exactly in the city.
    text: postal && name !== text ? `${name} ${postal}` : name,
    city,
    state: option.state_code ?? null,
    state_name: option.state_name ?? null,
    country,
    // A ZIP3 belongs to the catalog's city, not to a town that borrows its market.
    postal: postal || (country === "MX" || keepCity ? null : option.zip_prefix ?? null),
    market: option.market ?? null,
    region: option.region ?? null,
    resolved: true,
  };
}

function resolvePlace(place: SourcePlace, lookups: Record<string, PlaceLookup>, choices: PlaceChoices): ResolvedPlace {
  const text = place.text.trim();
  if (!text) return { text, status: "empty", place };
  if (place.resolved) return { text, status: "ok", place };
  const choice = choices[placeKey(text)];
  if (choice?.kind === "map") return { text, status: "ok", place: placeFromOption(choice.option, text, choice.keepCity) };
  if (choice?.kind === "keep") return { text, status: "kept", place };
  const lookup = lookups[placeKey(text)];
  if (!lookup || lookup.status === "searching") return { text, status: "searching", place };
  if (lookup.status === "ok") return { text, status: "ok", place: placeFromOption(lookup.option, text) };
  return { text, status: "pending", place };
}

/** Same key the server uses to skip a lane that repeats (rfxLaneAppendKey). */
const appendKey = (origin: string, destination: string, values: Record<CatalogField, ResolvedValue>) =>
  // A value still waiting on the team counts by its own text, so two different ones never look alike.
  [origin, destination, ...FIELDS.map((field) => values[field].value || values[field].text)]
    .map((value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");

export function reviewLanes(
  lanes: SourceLane[],
  index: CatalogIndex,
  choices: Choices,
  lookups: Record<string, PlaceLookup>,
  placeChoices: PlaceChoices,
  omitted: Set<string>,
): LaneReview[] {
  const seen = new Map<string, number>();
  return lanes.map((lane, position) => {
    const values = Object.fromEntries(
      FIELDS.map((field) => {
        const text = fieldText(lane, field, index);
        if (!text) return [field, { text, value: "", status: "empty" as const }];
        const official = resolveValue(index, field, text);
        if (official) return [field, { text, value: official, status: "ok" as const, via: "catalog" as const }];
        const choice = choices[choiceKey(field, text)];
        if (choice?.kind === "map") return [field, { text, value: choice.value, status: "ok" as const, via: "choice" as const }];
        if (choice?.kind === "keep") return [field, { text, value: text, status: "kept" as const, via: "choice" as const }];
        return [field, { text, value: "", status: "pending" as const }];
      }),
    ) as Record<CatalogField, ResolvedValue>;
    const origin = resolvePlace(lane.origin, lookups, placeChoices);
    const destination = resolvePlace(lane.destination, lookups, placeChoices);
    const isOmitted = omitted.has(lane.key);
    const noRoute = !origin.text && !destination.text;
    const waiting = [origin.status, destination.status, ...FIELDS.map((field) => values[field].status)].some(
      (status) => status === "pending" || status === "searching",
    );
    let twinOf: number | null = null;
    if (!isOmitted && !noRoute) {
      const key = appendKey(origin.place.text, destination.place.text, values);
      twinOf = seen.get(key) ?? null;
      if (twinOf === null) seen.set(key, position + 1);
    }
    const status: LaneReview["status"] = isOmitted
      ? "omitted"
      : noRoute
        ? "no_route"
        : twinOf !== null
          ? "duplicate"
          : waiting
            ? "pending"
            : "ready";
    return { lane, values, origin, destination, twinOf, omitted: isOmitted, status };
  });
}

/** One value the catalog didn't know, with how many lanes carry it and what the team decided. */
export interface PendingValue {
  field: CatalogField;
  text: string;
  count: number;
  suggestion: string | null;
  choice: Choice | null;
}

/** Every value that needs or got the team's decision, pending first. */
export function pendingValues(reviews: LaneReview[], index: CatalogIndex, choices: Choices): PendingValue[] {
  const found = new Map<string, PendingValue>();
  for (const review of reviews) {
    // Only lanes that will be created: an omitted or repeated one waits on nobody.
    if (review.status !== "ready" && review.status !== "pending") continue;
    for (const field of FIELDS) {
      const value = review.values[field];
      if (value.status === "empty" || value.via === "catalog") continue;
      const key = choiceKey(field, value.text);
      const current = found.get(key);
      if (current) current.count += 1;
      else found.set(key, { field, text: value.text, count: 1, suggestion: suggestValue(index, field, value.text), choice: choices[key] ?? null });
    }
  }
  return [...found.values()].sort(
    (a, b) => Number(Boolean(a.choice)) - Number(Boolean(b.choice)) || FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field) || b.count - a.count,
  );
}

/** One place text the location catalog didn't match, and what the team decided. */
export interface PendingPlace {
  text: string;
  count: number;
  suggestions: LocationOption[];
  /** The suggestions are the markets of the town's state (it isn't in the catalog). */
  nearby: boolean;
  choice: PlaceChoice | null;
}

export function pendingPlaces(reviews: LaneReview[], lookups: Record<string, PlaceLookup>, choices: PlaceChoices): PendingPlace[] {
  const found = new Map<string, PendingPlace>();
  for (const review of reviews) {
    if (review.status !== "ready" && review.status !== "pending") continue;
    for (const place of [review.origin, review.destination]) {
      const key = placeKey(place.text);
      const choice = choices[key] ?? null;
      if (place.status !== "pending" && !choice) continue;
      const current = found.get(key);
      if (current) {
        current.count += 1;
        continue;
      }
      const lookup = lookups[key];
      const pending = lookup?.status === "pending" ? lookup : null;
      found.set(key, { text: place.text, count: 1, suggestions: pending?.suggestions ?? [], nearby: Boolean(pending?.nearby), choice });
    }
  }
  return [...found.values()].sort((a, b) => Number(Boolean(a.choice)) - Number(Boolean(b.choice)) || b.count - a.count);
}

// ------------------------------------------------------------- matching a place

/**
 * A city as both the catalog and people write it: no accents and no "Ciudad" or
 * "Cd." in front, so "Ciudad Juárez", "Cd. Juárez" and "Juárez" meet the
 * catalog's "Cd. Juarez".
 */
export const cityKey = (value: unknown) => plain(value).replace(/^(ciudad|cd) /, "");

/**
 * How people write each Mexican state, by the name the location catalog gives
 * it, and what to search to list its places ("Mexico, DF" loses its comma in
 * the search, so Mexico City goes by its code).
 */
const MX_STATES: { name: string; search: string; words: string[] }[] = [
  { name: "aguascalientes", search: "Aguascalientes", words: ["ags", "agu", "ag"] },
  { name: "baja california", search: "Baja California", words: ["bc", "bcn", "bn", "baja california norte"] },
  { name: "baja california sur", search: "Baja California Sur", words: ["bcs", "bs"] },
  { name: "campeche", search: "Campeche", words: ["camp", "cam", "cm"] },
  { name: "chiapas", search: "Chiapas", words: ["chis", "chp", "cs"] },
  { name: "chihuahua", search: "Chihuahua", words: ["chih", "chh", "ch"] },
  { name: "coahuila", search: "Coahuila", words: ["coah", "coa", "cu", "coahuila de zaragoza"] },
  { name: "colima", search: "Colima", words: ["col", "cl"] },
  { name: "mexico df", search: "DF", words: ["cdmx", "df", "d f", "cmx", "ciudad de mexico", "mexico city", "distrito federal"] },
  { name: "durango", search: "Durango", words: ["dgo", "dur", "du"] },
  { name: "estado de mexico", search: "Estado de Mexico", words: ["mex", "edomex", "edo mex", "edo de mex", "edo de mexico", "em", "mx", "mexico"] },
  { name: "guanajuato", search: "Guanajuato", words: ["gto", "gua", "gj"] },
  { name: "guerrero", search: "Guerrero", words: ["gro", "gr"] },
  { name: "hidalgo", search: "Hidalgo", words: ["hgo", "hid", "hg"] },
  { name: "jalisco", search: "Jalisco", words: ["jal", "ja"] },
  { name: "michoacan", search: "Michoacan", words: ["mich", "mic", "mc", "michoacan de ocampo"] },
  { name: "morelos", search: "Morelos", words: ["mor", "mr"] },
  { name: "nayarit", search: "Nayarit", words: ["nay", "na"] },
  { name: "nuevo leon", search: "Nuevo Leon", words: ["nl", "n l", "nle"] },
  { name: "oaxaca", search: "Oaxaca", words: ["oax", "oa"] },
  { name: "puebla", search: "Puebla", words: ["pue", "pb"] },
  { name: "queretaro", search: "Queretaro", words: ["qro", "que", "qe", "queretaro de arteaga"] },
  { name: "quintana roo", search: "Quintana Roo", words: ["qroo", "q roo", "roo", "qr"] },
  { name: "san luis potosi", search: "San Luis Potosi", words: ["slp", "sl"] },
  { name: "sinaloa", search: "Sinaloa", words: ["sin", "si"] },
  { name: "sonora", search: "Sonora", words: ["son", "so"] },
  { name: "tabasco", search: "Tabasco", words: ["tab", "tb"] },
  { name: "tamaulipas", search: "Tamaulipas", words: ["tamps", "tamp", "tam", "tm"] },
  { name: "tlaxcala", search: "Tlaxcala", words: ["tlax", "tla", "tl"] },
  { name: "veracruz", search: "Veracruz", words: ["ver", "ve", "veracruz de ignacio de la llave"] },
  { name: "yucatan", search: "Yucatan", words: ["yuc", "yu"] },
  { name: "zacatecas", search: "Zacatecas", words: ["zac", "za"] },
];
const MX_STATE_BY_WORD = new Map(MX_STATES.flatMap((state) => [state.name, ...state.words].map((word) => [word, state] as const)));

/** The Mexican state a text names ("GTO", "Edo. Méx.", "Coahuila"), if any. */
export const mexicanState = (text: unknown) => MX_STATE_BY_WORD.get(plain(text)) ?? null;

/**
 * Whether a catalog place is in the state a text names: its code, its name,
 * the start of its name ("Coah"), or how people write it ("GTO", "Edomex").
 */
export function inState(state: string, option: LocationOption): boolean {
  const words = plain(state);
  const code = plain(option.state_code);
  const name = plain(option.state_name);
  if (!words) return true;
  if (code === words || name === words || (words.length >= 3 && name.startsWith(words))) return true;
  return String(option.country ?? "").toUpperCase() === "MX" && mexicanState(words)?.name === name;
}

/**
 * The catalog's place for a text, when the search found it without doubt: same
 * city, and the same state when the text names one. Several matching rows of
 * one city (the MX catalog keeps one per postal prefix) are the same place;
 * different markets are a doubt. "Monterrey, México" names the country.
 */
export function matchPlace(text: string, options: LocationOption[]): LocationOption | null {
  const parts = placeParts(text);
  const city = cityKey(parts.city);
  const state = parts.state;
  if (!city) return null;
  const sameCity = options.filter((option) => cityKey(option.city) === city || plain(option.value) === plain(text));
  let candidates = sameCity.filter((option) => inState(state, option));
  const country = state ? countryFromWord(state) : null;
  if (!candidates.length && country) candidates = sameCity.filter((option) => String(option.country ?? "").toUpperCase() === country);
  if (!candidates.length) return null;
  const places = new Set(candidates.map((option) => [option.country, cityKey(option.city), plain(option.state_code), plain(option.market)].join("|")));
  if (places.size > 1) return null;
  return candidates.find((option) => !/^\d/.test(option.value)) ?? candidates[0];
}

/**
 * What to search the location catalog for a place text: its city, in its
 * country when the text says it ("…, TX", "…, Coahuila"), and the state it
 * names, to offer that state's markets when the town isn't in the catalog.
 */
export function placeQuery(place: SourcePlace): { search: string; country?: string; state: string } {
  const parts = placeParts(place.text);
  const parsed = placeFromText([parts.city, parts.state].filter(Boolean).join(", "));
  const city = place.city?.trim() || parts.city;
  const country = (place.country || parsed?.country || "").toUpperCase();
  const state = place.state_name || place.state || parts.state;
  return { search: city, country: country === "MX" || country === "US" || country === "CA" ? country : undefined, state };
}

/**
 * The markets of a Mexican state, one place each (the one named like its
 * market when there is one: Toluca for "Toluca Market"), to place a town the
 * catalog doesn't have.
 */
export function stateMarkets(state: string, options: LocationOption[]): LocationOption[] {
  const byMarket = new Map<string, LocationOption>();
  for (const option of options) {
    if (String(option.country ?? "").toUpperCase() !== "MX" || !inState(state, option) || !option.market) continue;
    const market = plain(option.market);
    const current = byMarket.get(market);
    const named = (candidate: LocationOption) => market.startsWith(cityKey(candidate.city));
    if (!current || (named(option) && !named(current)) || (!/^\d/.test(option.value) && /^\d/.test(current.value))) byMarket.set(market, option);
  }
  return [...byMarket.values()].sort((a, b) => String(a.market).localeCompare(String(b.market)));
}

// ------------------------------------------------------------- what gets created

export interface ImportLaneRow extends LaneRubrics {
  lane_number: number;
  origin: string;
  origin_city?: string | null;
  origin_state?: string | null;
  origin_country?: string | null;
  origin_market?: string | null;
  origin_region?: string | null;
  destination: string;
  destination_city?: string | null;
  destination_state?: string | null;
  destination_country?: string | null;
  destination_market?: string | null;
  destination_region?: string | null;
  equipment?: string;
  trailer?: string;
  config?: string;
  operation?: string;
  service?: string;
  weekly_volume?: number | null;
  annual_volume?: number | null;
  target_rate?: number | null;
  currency: string;
  rfx_segment_name?: string;
  notes?: string;
  [key: string]: unknown;
}

/** What the event sets for lanes that don't say it themselves. */
export interface LaneDefaults {
  currency?: string;
  /** An operating segment of the RFI catalog (crossborder, local_ftl…). */
  segmentKey?: string;
  segmentName?: string;
}

/**
 * The rows import_rfx_lanes gets. The event-wide terms of step 2 go on every
 * lane; a lane's own terms (copied from an event) fill whatever step 2 leaves
 * empty. The event's currency and segment fill lanes that bring none.
 */
export function toImportRows(reviews: LaneReview[], projectRubrics: LaneRubrics, defaults: LaneDefaults = {}): ImportLaneRow[] {
  return reviews
    .filter((review) => review.status === "ready")
    .map((review, position) => {
      const { lane, values, origin, destination } = review;
      const rubrics = Object.fromEntries(
        RUBRIC_KEYS.map((key) => [key, String(projectRubrics[key] ?? "").trim() || String(lane.rubrics[key] ?? "").trim() || undefined]),
      ) as LaneRubrics;
      return {
        lane_number: position + 1,
        origin: origin.place.text || origin.text,
        origin_city: origin.place.city ?? null,
        origin_state: origin.place.state ?? null,
        origin_country: origin.place.country ?? null,
        origin_market: origin.place.market ?? null,
        origin_region: origin.place.region ?? null,
        destination: destination.place.text || destination.text,
        destination_city: destination.place.city ?? null,
        destination_state: destination.place.state ?? null,
        destination_country: destination.place.country ?? null,
        destination_market: destination.place.market ?? null,
        destination_region: destination.place.region ?? null,
        equipment: values.equipment.value || undefined,
        trailer: values.trailer.value || undefined,
        config: values.config.value || undefined,
        operation: values.operation.value || undefined,
        service: values.service.value || undefined,
        weekly_volume: lane.weekly_volume,
        annual_volume: lane.annual_volume,
        target_rate: lane.target_rate,
        currency: lane.currency || defaults.currency || "USD",
        // A lane's own segment wins; otherwise the event's, whose key groups the carrier's confirmations.
        ...(lane.segment_name
          ? { rfx_segment_name: lane.segment_name }
          : defaults.segmentKey
            ? { rfx_segment_key: defaults.segmentKey, rfx_segment_name: defaults.segmentName || defaults.segmentKey }
            : {}),
        notes: lane.notes || undefined,
        ...rubrics,
      };
    });
}

/** The synonyms to save before creating, from the team's decisions still in use. */
export function aliasesToSave(reviews: LaneReview[], choices: Choices, placeChoices: PlaceChoices) {
  const catalog = new Map<string, { field: CatalogField; raw: string; value: string }>();
  const places = new Map<string, { alias: string; option: LocationOption }>();
  for (const review of reviews) {
    if (review.status !== "ready") continue;
    for (const field of FIELDS) {
      const value = review.values[field];
      const choice = choices[choiceKey(field, value.text)];
      if (value.status === "ok" && choice?.kind === "map" && choice.saveAlias && choice.value === value.value) {
        catalog.set(choiceKey(field, value.text), { field, raw: value.text, value: value.value });
      }
    }
    for (const place of [review.origin, review.destination]) {
      const choice = placeChoices[placeKey(place.text)];
      // A town that only borrows a market isn't a synonym of that place.
      if (choice?.kind === "map" && choice.saveAlias && !choice.keepCity && choice.option.id) {
        places.set(placeKey(place.text), { alias: place.text, option: choice.option });
      }
    }
  }
  return { catalog: [...catalog.values()], places: [...places.values()] };
}
