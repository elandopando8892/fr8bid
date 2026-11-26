import type { CampoDocumento, ValorLeido } from "../../../dominio/documentos";
import {
  BORDER_CROSSINGS,
  catalogLabel,
  EQUIPMENT_TYPES,
  PACKAGING_TYPES,
  SHIPPER_SERVICE_TYPES,
  TRUCK_TYPES,
  type CatalogOption,
} from "./catalog";
import { emptyLane, parseAmount, placeFromText, placeText, type Lang, type LaneDraft, type RequestDraft, type RequestKind } from "./request.model";

/**
 * The lane questions a pasted email, an Excel in any layout or a PDF can
 * answer (prioridad 8). Each answer becomes a lane the shipper confirms; what
 * the document doesn't say stays blank and the usual flags point at it.
 */
const values = (list: CatalogOption[]) => list.map((entry) => entry.value);

export function laneFields(kind: RequestKind, lang: Lang): CampoDocumento[] {
  const es = lang === "es";
  return [
    { clave: "origin", etiqueta: es ? "Origen" : "Origin", tipo: "texto", nota: "Ciudad, Estado, País (MX, US o CA)" },
    { clave: "destination", etiqueta: es ? "Destino" : "Destination", tipo: "texto", nota: "Ciudad, Estado, País (MX, US o CA)" },
    { clave: "equipment", etiqueta: es ? "Tipo de equipo" : "Equipment type", tipo: "opcion", opciones: values(EQUIPMENT_TYPES), nota: "caja seca = Dry Van, plataforma = Flatbed, refrigerado = Reefer" },
    { clave: "truck", etiqueta: es ? "Tipo de camión" : "Truck type", tipo: "opcion", opciones: values(TRUCK_TYPES), nota: "tráiler, tractocamión o caja de 48/53 pies = Truck Trailer" },
    {
      clave: "loads",
      etiqueta: kind === "spot" ? (es ? "Cargas" : "Loads") : es ? "Cargas por semana" : "Loads per week",
      tipo: "texto",
      nota: kind === "spot" ? "número de cargas a mover" : "número de cargas por semana; si da un total al mes o al año, déjalo vacío y ponlo en notas",
    },
    { clave: "commodity", etiqueta: es ? "Producto" : "Commodity", tipo: "texto" },
    { clave: "weight", etiqueta: es ? "Peso promedio" : "Average weight", tipo: "texto", nota: "solo el número, sin unidad" },
    { clave: "weight_unit", etiqueta: es ? "Unidad de peso" : "Weight unit", tipo: "opcion", opciones: ["lb", "kg"] },
    { clave: "packaging", etiqueta: es ? "Embalaje" : "Packaging", tipo: "opcion", opciones: values(PACKAGING_TYPES) },
    { clave: "hazmat", etiqueta: "Hazmat", tipo: "opcion", opciones: ["Yes", "No"] },
    { clave: "service", etiqueta: es ? "Tipo de servicio" : "Service type", tipo: "opcion", opciones: values(SHIPPER_SERVICE_TYPES) },
    { clave: "border_crossing", etiqueta: es ? "Cruce fronterizo" : "Border crossing", tipo: "opcion", opciones: values(BORDER_CROSSINGS) },
    { clave: "pickup_date", etiqueta: es ? "Fecha de carga" : "Pickup date", tipo: "texto", nota: "AAAA-MM-DD, solo si da una fecha" },
    { clave: "annual_volume", etiqueta: es ? "Volumen anual" : "Annual volume", tipo: "texto", nota: "número de cargas al año, solo si lo dice" },
    { clave: "notes", etiqueta: es ? "Notas" : "Notes", tipo: "texto", nota: "condiciones de la ruta: citas, maniobras, horarios, volumen al mes" },
  ];
}

const number = (text: string) => {
  const n = parseAmount(text);
  return n === undefined ? "" : String(n);
};

/**
 * A lane from what the shipper confirmed. The country comes only from the
 * document: a city alone («Laredo») keeps it blank for the shipper to pick,
 * rather than borrowing the link's country.
 */
export function laneFrom(kind: RequestKind, read: ValorLeido[]): LaneDraft {
  const get = (key: string) => read.find((v) => v.clave === key)?.valores[0] ?? "";
  const place = (text: string) => placeFromText(text);
  const lane = emptyLane(kind);
  const date = get("pickup_date");
  const hazmat = get("hazmat");
  return {
    ...lane,
    origin: place(get("origin")),
    destination: place(get("destination")),
    equipment: get("equipment"),
    truck: get("truck"),
    // Without a volume in the document the lane waits for the shipper's number, not a default «1».
    loads: number(get("loads")),
    commodity: get("commodity"),
    weight: number(get("weight")),
    weight_unit: get("weight_unit") === "kg" ? "kg" : "lb",
    packaging: get("packaging"),
    hazmat: hazmat === "Yes",
    service: get("service") || lane.service,
    border_crossing: get("border_crossing"),
    pickup_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    annual_volume: number(get("annual_volume")),
    notes: get("notes"),
  };
}

/** One line per lane in «Revisa lo que leímos»: route first, then every value the lane will take. */
export function laneSummary(kind: RequestKind, read: ValorLeido[], lang: Lang): { titulo: string; datos: string[]; faltan: string[] } {
  const lane = laneFrom(kind, read);
  // The country each place will take, so the shipper sees it before adding the lane.
  const where = (p: LaneDraft["origin"]) => (placeText(p) ? `${placeText(p)}${p?.country ? ` (${p.country})` : ""}` : "—");
  const from = where(lane.origin);
  const to = where(lane.destination);
  const es = lang === "es";
  const datos = [
    lane.equipment ? catalogLabel(EQUIPMENT_TYPES, lane.equipment, lang) : "",
    lane.loads && read.some((v) => v.clave === "loads")
      ? kind === "spot"
        ? `${lane.loads} ${es ? (lane.loads === "1" ? "carga" : "cargas") : lane.loads === "1" ? "load" : "loads"}`
        : `${lane.loads} ${es ? "cargas/sem" : "loads/wk"}`
      : "",
    lane.commodity,
    lane.weight ? `${Number(lane.weight).toLocaleString(es ? "es-MX" : "en-US")} ${lane.weight_unit}` : "",
    lane.truck ? catalogLabel(TRUCK_TYPES, lane.truck, lang) : "",
    lane.packaging ? catalogLabel(PACKAGING_TYPES, lane.packaging, lang) : "",
    read.some((v) => v.clave === "hazmat") ? (lane.hazmat ? "Hazmat" : es ? "Sin hazmat" : "No hazmat") : "",
    lane.service ? catalogLabel(SHIPPER_SERVICE_TYPES, lane.service, lang) : "",
    lane.border_crossing ? `${es ? "Cruce" : "Crossing"}: ${catalogLabel(BORDER_CROSSINGS, lane.border_crossing, lang)}` : "",
    lane.pickup_date,
    lane.annual_volume ? `${lane.annual_volume} ${es ? "cargas/año" : "loads/yr"}` : "",
    lane.notes ? `${es ? "Notas" : "Notes"}: ${lane.notes}` : "",
  ].filter(Boolean);
  const faltan = [
    !lane.origin ? (es ? "Falta origen" : "Origin missing") : "",
    !lane.destination ? (es ? "Falta destino" : "Destination missing") : "",
    !read.some((v) => v.clave === "loads") ? (es ? "Falta volumen" : "Volume missing") : "",
    (lane.origin && !lane.origin.country) || (lane.destination && !lane.destination.country) ? (es ? "Falta país" : "Country missing") : "",
  ].filter(Boolean);
  return { titulo: `${from} → ${to}`, datos, faltan };
}

/** The read lanes join the request; blank lanes give way, as with the Excel template. */
export function addReadLanes(draft: RequestDraft, read: ValorLeido[][], filledKeys: Set<string>): RequestDraft {
  const lanes = read.map((r) => laneFrom(draft.kind, r));
  if (!lanes.length) return draft;
  return { ...draft, lanes: [...draft.lanes.filter((lane) => filledKeys.has(lane.key)), ...lanes] };
}
