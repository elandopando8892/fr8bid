import { plain } from "./places";
import type { Lang } from "./request.model";

/**
 * The lists of MARKSMAN's RFI template — the "Catalog" sheet of
 * RFI_Template.xlsx (Drive: JAGP/Business Ecosystem/MXHG/Templates), whose
 * dropdowns feed the route matrix. Values are stored exactly as the template
 * writes them; the Spanish and English labels only translate them one to one.
 */
export interface CatalogOption {
  value: string;
  es: string;
  en: string;
}

const option = (value: string, es: string, en = value): CatalogOption => ({ value, es, en });

/** Type of Location / Tipo de instalación. */
export const FACILITY_TYPES: CatalogOption[] = [
  option("Warehouse", "Almacén"),
  option("Distribution Center", "Centro de distribución"),
  option("Factory", "Fábrica"),
  option("Residential", "Residencial"),
  option("Shopping Center", "Centro comercial"),
  option("City Downtown", "Centro de la ciudad"),
  option("Remote Location", "Ubicación remota"),
  option("Government Facility", "Instalación gubernamental"),
];

/** Load/Unload Type / Tipo de carga y descarga. */
export const LOAD_TYPES: CatalogOption[] = [
  option("Live - FCFS", "En vivo - por orden de llegada (FCFS)", "Live - FCFS"),
  option("Live w/ appt", "En vivo con cita", "Live w/ appt"),
  option("Drop-Off - FCFS", "Drop-off - por orden de llegada (FCFS)", "Drop-Off - FCFS"),
  option("Drop-Off w/ appt", "Drop-off con cita", "Drop-Off w/ appt"),
];

/** Schedule Type / Tipo de horario. */
export const SCHEDULE_TYPES: CatalogOption[] = [
  option("Mon - Fri", "Lun - Vie"),
  option("Mon - Sat", "Lun - Sáb"),
  option("Mon - Sun", "Lun - Dom"),
  option("Other", "Otro"),
];

/** Truck Type / Tipo de camión. */
export const TRUCK_TYPES: CatalogOption[] = [
  option("Truck Trailer", "Tractocamión"),
  option("Thorton", "Torton"),
  option("Rabon", "Rabón"),
  option("3.5 tons", "3.5 toneladas"),
  option("1.5 tons", "1.5 toneladas"),
];

/** Equipment Type / Tipo de equipo. */
export const EQUIPMENT_TYPES: CatalogOption[] = [
  option("Dry Van", "Caja seca"),
  option("Flatbed", "Plataforma"),
  option("Reefer", "Refrigerado"),
  option("Hazmat", "Hazmat (materiales peligrosos)", "Hazmat"),
  option("Chassis", "Chasis"),
];

/** Config Type / Tipo de configuración. */
export const CONFIG_TYPES: CatalogOption[] = [option("Single", "Sencillo"), option("Tandem", "Tándem (full)")];

/** Operation Type / Tipo de operación. */
export const OPERATION_TYPES: CatalogOption[] = [
  option("D2D Export", "Exportación D2D"),
  option("D2D Import", "Importación D2D"),
  option("MX Northbound", "MX hacia el norte"),
  option("MX Southbound", "MX hacia el sur"),
  option("US/CA Northbound", "US/CA hacia el norte"),
  option("US/CA Southbound", "US/CA hacia el sur"),
  option("Intra-MX", "Intra-MX"),
  option("Intra-US/CA", "Intra-US/CA"),
  option("Local MX", "Local MX"),
  option("Local US/CA", "Local US/CA"),
  option("MX Drayage", "Drayage MX"),
];

/**
 * Service Type / Tipo de servicio. Backhaul is our own cost assumption: the
 * template lists it for the team, a shipper never picks it.
 */
export const SERVICE_TYPES: CatalogOption[] = [
  option("One Way", "Sencillo (one way)"),
  option("Roundtrip", "Redondo (roundtrip)"),
  option("Backhaul", "Backhaul"),
  option("Expedited", "Expeditado"),
  option("Milkrun", "Milk run", "Milk run"),
  option("Dedicated", "Dedicado"),
];
export const SHIPPER_SERVICE_TYPES = SERVICE_TYPES.filter((entry) => entry.value !== "Backhaul");

/**
 * Border Crossing Point / Punto de cruce fronterizo. The values are the
 * `crossing_name` rows of rateware's `border_crossing_pairs`, Mexico first,
 * the single source QuoteDesk, the FCM and the bid event use (2026-09-30).
 * The RFI template of Drive wrote them US first ("Laredo / Nuevo Laredo");
 * `crossingValue` in request.model still reads those.
 */
export const BORDER_CROSSINGS: CatalogOption[] = [
  option("Nuevo Laredo / Laredo", "Nuevo Laredo / Laredo"),
  option("Colombia / Laredo", "Colombia / Laredo"),
  option("Reynosa / Pharr", "Reynosa / Pharr"),
  option("Reynosa / McAllen", "Reynosa / McAllen"),
  option("Matamoros / Brownsville", "Matamoros / Brownsville"),
  option("Cd. Juarez / El Paso", "Cd. Juárez / El Paso"),
  option("Cd. Juarez / Santa Teresa", "Cd. Juárez / Santa Teresa"),
  option("Piedras Negras / Eagle Pass", "Piedras Negras / Eagle Pass"),
  option("Cd. Acuña / Del Rio", "Cd. Acuña / Del Rio"),
  option("Ojinaga / Presidio", "Ojinaga / Presidio"),
  option("Nogales / Nogales", "Nogales / Nogales"),
  option("Agua Prieta / Douglas", "Agua Prieta / Douglas"),
  option("Tijuana / Otay Mesa", "Tijuana / Otay Mesa"),
  option("Mexicali / Calexico", "Mexicali / Calexico"),
  option("San Luis Rio Colorado / San Luis", "San Luis Río Colorado / San Luis"),
];

/** Packaging / Embalaje. */
export const PACKAGING_TYPES: CatalogOption[] = [
  option("Pallets", "Tarimas"),
  option("Boxes", "Cajas"),
  option("Crates", "Huacales"),
  option("Bulk", "Granel"),
  option("Totes", "Totes"),
  option("Gas / Liquid", "Gas / Líquido"),
  option("Other", "Otro"),
];

/** Embarque spot o programado / Spot or Scheduled. */
export const SHIPMENT_KINDS: CatalogOption[] = [option("Spot", "Spot"), option("Scheduled", "Programado")];

export const YES_NO: CatalogOption[] = [option("Yes", "Sí"), option("No", "No")];

export const catalogLabel = (list: CatalogOption[], value: string, lang: Lang) =>
  list.find((entry) => entry.value === value)?.[lang] ?? value;

/** A typed or imported cell -> the template value it names (either language). */
export function catalogValue(list: CatalogOption[], text: unknown): string | null {
  const wanted = plain(text);
  if (!wanted) return null;
  return list.find((entry) => [entry.value, entry.es, entry.en].some((name) => plain(name) === wanted))?.value ?? null;
}

// ------------------------------------------------------------- derived values

/** The template operation a lane's countries imply. */
export function operationFor(from: string | null | undefined, to: string | null | undefined): string {
  if (from === "MX" && to === "US") return "D2D Export";
  if (from === "US" && to === "MX") return "D2D Import";
  if (from === "MX" && to === "MX") return "Intra-MX";
  if ((from === "US" || from === "CA") && (to === "US" || to === "CA")) return "Intra-US/CA";
  return "";
}

/** rfx_rfi_lanes.operation_type accepts only these; the template value rides as `operation`. */
export const RFI_OPERATION_TYPE: Record<string, string> = {
  "D2D Export": "crossborder",
  "D2D Import": "crossborder",
  "MX Northbound": "crossborder",
  "MX Southbound": "crossborder",
  "US/CA Northbound": "crossborder",
  "US/CA Southbound": "crossborder",
  "MX Drayage": "crossborder",
  "Intra-MX": "mx_domestic",
  "Intra-US/CA": "us_domestic",
  "Local MX": "local",
  "Local US/CA": "local",
};

/** rfx_rfi_lanes.service_type accepts only these; the template value rides as `service`. */
export const RFI_SERVICE_TYPE: Record<string, string> = {
  "One Way": "standard",
  Roundtrip: "standard",
  Backhaul: "standard",
  Expedited: "expedited",
  Milkrun: "recurring",
  Dedicated: "dedicated",
};
