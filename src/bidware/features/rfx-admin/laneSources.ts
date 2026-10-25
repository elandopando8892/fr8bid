import { callRatewareApi } from "@/lib/api-client";
import { catalogLabel, PACKAGING_TYPES } from "@/features/shipper-request/catalog";
import { importLanes as readTemplateLanes } from "@/features/shipper-request/excel";
import { plain } from "@/features/shipper-request/places";
import { laneOperation, parseAmount, placeText, type LaneDraft as RequestLane, type Place } from "@/features/shipper-request/request.model";
import { searchLocations, type LocationOption } from "@/features/quotedesk/quotedesk.service";
import type { RfxLane } from "@/types/domain";
import { fetchRfxDetail } from "./rfx.service";
import { parsePastedLanes } from "./newEvent.service";
import {
  cityKey,
  emptySourceLane,
  matchPlace,
  mexicanState,
  placeQuery,
  RUBRIC_KEYS,
  stateMarkets,
  type CatalogField,
  type CatalogRow,
  type LaneRubrics,
  type PlaceLookup,
  type SourceLane,
  type SourcePlace,
} from "./laneImport";

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
const amount = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parseAmount(value) ?? null;
};

// ------------------------------------------------------------- catalog and places

/** The shared catalog with its synonyms (rateware's Admin Catalogs). */
export async function loadCatalogRows(): Promise<CatalogRow[]> {
  const res = await callRatewareApi<{ rows?: CatalogRow[] }>("list_catalog_values", {});
  return res.rows ?? [];
}

/** The location catalog's places for a name, however it's accented or abbreviated (see searchLocations). */
export const searchPlaces = (search: string, country?: string, limit = 12): Promise<LocationOption[]> => searchLocations(search, country, limit);

/**
 * Where a place text stands in the location catalog: matched without doubt, or
 * what to offer the team — the rows of that city when there's a doubt, or, for a
 * Mexican town the catalog doesn't have (it keeps markets, not every
 * municipality), the markets of its state.
 */
export async function lookupPlace(place: SourcePlace): Promise<PlaceLookup> {
  const { search, country, state } = placeQuery(place);
  if (search.length < 2) return { status: "pending", suggestions: [] };
  const options = await searchPlaces(search, country);
  const match = matchPlace(place.text, options);
  if (match) return { status: "ok", option: match };
  const sameCity = options.filter((option) => cityKey(option.city) === cityKey(search));
  const mexican = mexicanState(state);
  if (sameCity.length || !mexican || (country && country !== "MX")) {
    return { status: "pending", suggestions: (sameCity.length ? sameCity : options).slice(0, 8) };
  }
  const markets = stateMarkets(state, await searchPlaces(mexican.search, "MX", 50));
  return markets.length ? { status: "pending", suggestions: markets, nearby: true } : { status: "pending", suggestions: options.slice(0, 8) };
}

/** A synonym in the shared catalog: the next file that says `raw` resolves to `value`. */
export const saveCatalogAlias = (field: CatalogField, raw: string, value: string) =>
  callRatewareApi("save_catalog_value", {
    catalog_value: { category: field, raw_value: raw, normalized_value: value, note: "Sinónimo guardado al crear un bid event en Fr8Bid" },
  });

/** A synonym in the location catalog, with the geography of the place it points to. */
export const saveLocationAlias = (alias: string, targetLocationId: string) =>
  callRatewareApi("save_location_alias", { alias, target_location_id: targetLocationId });

// ------------------------------------------------------------- Excel

/** A shipper-template lane (RFI template or our own) as a lane of the new event. */
function requestPlace(place: Place | null): SourcePlace {
  if (!place) return { text: "" };
  return { text: placeText(place), city: place.city ?? null, state: place.state_code ?? null, country: place.country ?? null, postal: place.postal_code ?? null };
}

export function lanesFromRequest(lanes: RequestLane[], from: string): SourceLane[] {
  return lanes.map((lane) => {
    const details = [
      lane.commodity && `Producto: ${lane.commodity}`,
      lane.hazmat && `Hazmat${lane.hazmat_un ? ` ${lane.hazmat_un}` : ""}`,
      lane.packaging && `Embalaje: ${catalogLabel(PACKAGING_TYPES, lane.packaging, "es")}${lane.pieces ? ` (${lane.pieces} piezas)` : ""}`,
      lane.origin_window && `Ventana de recogida: ${lane.origin_window}`,
      lane.destination_window && `Ventana de entrega: ${lane.destination_window}`,
      lane.border_crossing && `Cruce: ${lane.border_crossing}`,
      lane.notes,
    ].filter(Boolean);
    return {
      ...emptySourceLane(from),
      origin: requestPlace(lane.origin),
      destination: requestPlace(lane.destination),
      equipment: lane.truck,
      trailer: lane.equipment,
      config: lane.config,
      // The template leaves the operation for the countries to settle.
      operation: laneOperation(lane),
      service: lane.service,
      weekly_volume: amount(lane.loads),
      annual_volume: amount(lane.annual_volume),
      notes: details.join(" · "),
      rubrics: lane.additional_items ? { service_specifications: lane.additional_items } : {},
    };
  });
}

/** Headers of a plain table ("Origen, Destino, Equipo, Volumen semanal…"), by what they mean. */
const TABLE_HEADERS: Record<string, keyof SourceLane | "origin" | "destination"> = {
  origen: "origin", origin: "origin", desde: "origin", from: "origin", salida: "origin",
  destino: "destination", destination: "destination", hasta: "destination", to: "destination", llegada: "destination",
  equipo: "unit", unidad: "unit", equipment: "unit", "tipo de unidad": "unit", "unit": "unit",
  "tipo de camion": "equipment", camion: "equipment", "truck type": "equipment", truck: "equipment",
  "tipo de equipo": "trailer", remolque: "trailer", caja: "trailer", trailer: "trailer", "equipment type": "trailer",
  configuracion: "config", config: "config",
  operacion: "operation", "tipo de operacion": "operation", operation: "operation",
  servicio: "service", "tipo de servicio": "service", service: "service",
  "volumen semanal": "weekly_volume", "cargas por semana": "weekly_volume", "cargas semanales": "weekly_volume", volumen: "weekly_volume",
  "weekly volume": "weekly_volume", "loads per week": "weekly_volume", loads: "weekly_volume",
  "volumen anual": "annual_volume", "annual volume": "annual_volume",
  "tarifa objetivo": "target_rate", "target rate": "target_rate", tarifa: "target_rate", target: "target_rate",
  moneda: "currency", currency: "currency",
  segmento: "segment_name", segment: "segment_name",
  notas: "notes", notes: "notes", comentarios: "notes", comments: "notes",
};

function lanesFromTable(rows: unknown[][], from: string): SourceLane[] {
  const headerIndex = rows.findIndex((row) => row.filter((cell) => TABLE_HEADERS[plain(cell)]).length >= 2);
  if (headerIndex < 0) return [];
  const columns = rows[headerIndex].map((cell) => TABLE_HEADERS[plain(cell)] ?? null);
  const lanes: SourceLane[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const cell = (key: string) => {
      const index = columns.indexOf(key as never);
      return index >= 0 ? row[index] : "";
    };
    const origin = text(cell("origin"));
    const destination = text(cell("destination"));
    if (!origin && !destination) continue;
    lanes.push({
      ...emptySourceLane(from),
      origin: { text: origin },
      destination: { text: destination },
      unit: text(cell("unit")),
      equipment: text(cell("equipment")),
      trailer: text(cell("trailer")),
      config: text(cell("config")),
      operation: text(cell("operation")),
      service: text(cell("service")),
      weekly_volume: amount(cell("weekly_volume")),
      annual_volume: amount(cell("annual_volume")),
      target_rate: amount(cell("target_rate")),
      currency: text(cell("currency")).toUpperCase(),
      segment_name: text(cell("segment_name")),
      notes: text(cell("notes")),
    });
  }
  return lanes;
}

/**
 * Lanes from a file: MARKSMAN's RFI template (or the shipper template) first,
 * then any table whose headers say origin, destination and the rest.
 */
export async function lanesFromFile(file: File): Promise<{ lanes: SourceLane[]; sheet: string | null; format: "template" | "table" }> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheets = book.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: "", raw: true }) as unknown[][],
  }));
  // Only the template names its columns this way; a plain table with Origen/Destino is read as a table.
  const isTemplate = sheets.some((sheet) => sheet.rows.some((row) => row.some((cell) => TEMPLATE_HEADERS.has(plain(cell)))));
  if (isTemplate) {
    const template = await readTemplateLanes(file);
    if (template.lanes.length) {
      return { lanes: lanesFromRequest(template.lanes, `Excel · ${file.name}`), sheet: template.sheet, format: "template" };
    }
  }
  for (const sheet of sheets) {
    const lanes = lanesFromTable(sheet.rows, `Excel · ${file.name}`);
    if (lanes.length) return { lanes, sheet: sheets.length > 1 ? sheet.name : null, format: "table" };
  }
  return { lanes: [], sheet: null, format: "table" };
}

/** Headers only MARKSMAN's RFI template (and our export of it) use. */
const TEMPLATE_HEADERS = new Set(
  [
    "Ubicación de salida", "Outbound Location", "Ubicación de llegada", "Inbound Location",
    "Tipo de camión", "Truck Type", "Tipo de equipo", "Equipment Type",
    "Volumen Semanl Esperado", "Volumen Semanal Esperado", "Expected Weekly Volume",
  ].map(plain),
);

/** Pasted rows in the order origin · destination · unit · weekly volume · target rate · notes. */
export function lanesFromPaste(pasted: string): SourceLane[] {
  return parsePastedLanes(pasted)
    .filter((row) => row.draft.origin || row.draft.destination)
    .map((row) => ({
      ...emptySourceLane("Pegado"),
      origin: { text: text(row.draft.origin) },
      destination: { text: text(row.draft.destination) },
      unit: text(row.draft.equipment),
      weekly_volume: row.draft.weekly_volume ?? null,
      target_rate: row.draft.target_rate ?? null,
      notes: text(row.draft.notes),
    }));
}

// ------------------------------------------------------------- previous event

function eventPlace(lane: RfxLane, side: "origin" | "destination"): SourcePlace {
  const city = text(lane[`${side}_city`]);
  const country = text(lane[`${side}_country`]).toUpperCase();
  return {
    text: text(lane[side]),
    city: city || null,
    state: text(lane[`${side}_state`]) || null,
    country: country || null,
    market: text(lane[`${side}_market`]) || null,
    region: text(lane[`${side}_region`]) || null,
    // A lane that already carries the catalog's geography needs no second lookup.
    resolved: Boolean(city && country),
  };
}

/**
 * An event's lanes for a new one. Target rates stay behind: they were that
 * event's buying guidance, not this one's.
 */
export function lanesFromEventRows(lanes: RfxLane[], from: string): SourceLane[] {
  return lanes
    .filter((lane) => text(lane.origin) || text(lane.destination))
    .sort((a, b) => Number(a.lane_number ?? 0) - Number(b.lane_number ?? 0))
    .map((lane) => ({
      ...emptySourceLane(from),
      origin: eventPlace(lane, "origin"),
      destination: eventPlace(lane, "destination"),
      equipment: text(lane.equipment),
      trailer: text(lane.trailer),
      config: text(lane.config),
      operation: text(lane.operation),
      service: text(lane.service),
      weekly_volume: amount(lane.weekly_volume),
      annual_volume: amount(lane.annual_volume),
      currency: text(lane.currency).toUpperCase(),
      segment_name: text(lane.rfx_segment_name),
      notes: text(lane.notes),
      rubrics: Object.fromEntries(RUBRIC_KEYS.map((key) => [key, text(lane[key])]).filter(([, value]) => value)) as LaneRubrics,
    }));
}

export async function lanesFromEvent(eventId: string, label: string): Promise<SourceLane[]> {
  const detail = await fetchRfxDetail(eventId);
  return lanesFromEventRows(detail.lanes ?? [], label);
}

// ------------------------------------------------------------- Ratebook

export interface RatebookOption {
  id: string;
  name: string;
  shipper: string;
  packageId: string;
  lanes: number;
  status: string;
  updatedAt: string | null;
}

/** The shipper's Ratebooks, read without the Bid Room sync list_ratebooks runs by default. */
export async function listRatebooks(shipperId?: string | null): Promise<RatebookOption[]> {
  const res = await callRatewareApi<{ rows?: Record<string, unknown>[] }>("list_ratebooks", {
    shipper_id: shipperId || undefined,
    skip_bid_room_sync: true,
  });
  return (res.rows ?? [])
    .map((row) => {
      const project = (row.project ?? {}) as Record<string, unknown>;
      const pack = (row.package ?? {}) as Record<string, unknown>;
      return {
        id: text(row.id),
        name: text(row.name) || text(pack.name) || "Ratebook",
        shipper: text(row.shipper_name) || text(project.customer_name),
        packageId: text(row.rfx_package_id) || text(pack.id),
        lanes: Number(row.lane_count ?? 0),
        status: text(row.lifecycle_status) || text(row.status),
        updatedAt: text(row.updated_at) || null,
      };
    })
    .filter((row) => row.id && row.packageId && row.status !== "archived");
}

export async function lanesFromRatebook(ratebook: RatebookOption): Promise<SourceLane[]> {
  const res = await callRatewareApi<{ rows?: Record<string, unknown>[] }>("export_ratebook_routes", {
    package_id: ratebook.packageId,
    skip_bid_room_sync: true,
  });
  return (res.rows ?? [])
    .filter((row) => text(row.ratebook_id) === ratebook.id && (text(row.origin) || text(row.destination)))
    .map((row) => ({
      ...emptySourceLane(`Ratebook · ${ratebook.name}`),
      origin: { text: text(row.origin) },
      destination: { text: text(row.destination) },
      equipment: text(row.equipment),
      trailer: text(row.trailer),
      operation: text(row.operation),
      service: text(row.service),
      weekly_volume: amount(row.weekly_volume),
      currency: text(row.currency).toUpperCase(),
      segment_name: text(row.segment_name) === "All routes" ? "" : text(row.segment_name),
    }));
}
