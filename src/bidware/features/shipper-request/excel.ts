import {
  BORDER_CROSSINGS,
  CONFIG_TYPES,
  EQUIPMENT_TYPES,
  FACILITY_TYPES,
  LOAD_TYPES,
  OPERATION_TYPES,
  PACKAGING_TYPES,
  SCHEDULE_TYPES,
  SERVICE_TYPES,
  SHIPMENT_KINDS,
  SHIPPER_SERVICE_TYPES,
  TRUCK_TYPES,
  YES_NO,
  catalogValue,
  type CatalogOption,
} from "./catalog";
import { crossingValue, emptyLane, parseAmount, placeFromText, WEEKDAYS, type Lang, type LaneDraft, type Weekday } from "./request.model";

type Column =
  | "origin" | "origin_zip" | "origin_shipper" | "origin_facility" | "origin_load_type" | "origin_load_hours" | "origin_schedule" | "origin_window"
  | "destination" | "destination_zip" | "destination_consignee" | "destination_facility" | "destination_unload_type" | "destination_unload_hours"
  | "destination_schedule" | "destination_window" | "truck" | "equipment" | "config" | "operation" | "service" | "border_crossing" | "border_days"
  | "customs_broker" | "transfer" | "commodity" | "hazmat" | "invoice_value" | "packaging" | "pieces" | "stacks" | "weight" | "cubic_meters"
  | Weekday | "annual_volume" | "loads" | "shipment_kind" | "lead_time" | "driver_assist" | "team_driver" | "transit_days" | "distance"
  | "additional_items" | "notes";

interface ColumnSpec {
  key: Column;
  es: string;
  en: string;
  /** The template's hint row. */
  hint: string;
  /** Starred in the template. */
  required?: boolean;
  aliases?: string[];
}

/**
 * The route matrix of MARKSMAN's RFI template (RFi_Template SPA/ENG, columns
 * B–BE), in its order and with its headers, minus our pricing columns
 * (AX–BC). A workbook filled on the original template imports as is.
 */
const COLUMNS: ColumnSpec[] = [
  { key: "origin", es: "Ubicación de salida", en: "Outbound Location", hint: "City, State", required: true, aliases: ["origen", "origin", "origin location"] },
  { key: "origin_zip", es: "Código postal de salida", en: "Outbound Zip Code", hint: "5-digit", required: true },
  { key: "origin_shipper", es: "Remitente de salida", en: "Outbound Shipper", hint: "(Company Name)" },
  { key: "origin_facility", es: "Tipo de instalación de salida", en: "Outbound Facility Type", hint: "(Dropdown)" },
  { key: "origin_load_type", es: "Tipo de carga", en: "Load Type", hint: "(Dropdown)", required: true },
  { key: "origin_load_hours", es: "Tiempo promedio de carga", en: "Avg. Load Time", hint: "X Hours", required: true },
  { key: "origin_schedule", es: "Tipo de horario de recogida", en: "Pickup Schedule Type", hint: "(Dropdown)" },
  { key: "origin_window", es: "Ventana de servicio de recogida", en: "Pickup Service Window", hint: "(00 AM - 00 PM)" },
  { key: "destination", es: "Ubicación de llegada", en: "Inbound Location", hint: "City, State", required: true, aliases: ["destino", "destination", "destination location"] },
  { key: "destination_zip", es: "Código postal de llegada", en: "Inbound Zip Code", hint: "5-digit", required: true },
  { key: "destination_consignee", es: "Consignatario de llegada", en: "Inbound Consignee", hint: "(Company Name)" },
  { key: "destination_facility", es: "Tipo de instalación de llegada", en: "Inbound Facility Type", hint: "(Dropdown)" },
  { key: "destination_unload_type", es: "Tipo de descarga", en: "Unload Type", hint: "(Dropdown)", required: true },
  { key: "destination_unload_hours", es: "Tiempo promedio de descarga", en: "Avg. Unload Time", hint: "X Hours", required: true },
  { key: "destination_schedule", es: "Tipo de horario de entrega", en: "Delivery Schedule Type", hint: "(Dropdown)" },
  { key: "destination_window", es: "Ventana de servicio de entrega", en: "Delivery Service Window", hint: "(00 AM - 00 PM)" },
  { key: "truck", es: "Tipo de camión", en: "Truck Type", hint: "(Dropdown)", required: true },
  { key: "equipment", es: "Tipo de equipo", en: "Equipment Type", hint: "(Dropdown)", required: true },
  { key: "config", es: "Tipo de configuración", en: "Config Type", hint: "(Dropdown)", required: true },
  { key: "operation", es: "Tipo de operación", en: "Operation Type", hint: "(Dropdown)", required: true },
  { key: "service", es: "Tipo de servicio", en: "Service Type", hint: "(Dropdown)", required: true },
  { key: "border_crossing", es: "Punto de cruce fronterizo", en: "Border Crossing Point", hint: "(Dropdown)", required: true },
  { key: "border_days", es: "Promedio de días en la frontera", en: "Avg. Days at Border", hint: "(X Days)", required: true },
  { key: "customs_broker", es: "Agente Aduanal", en: "Custom Broker", hint: "(Company Name)", aliases: ["customs broker"] },
  { key: "transfer", es: "Transfer", en: "Transfer", hint: "(Company Name)" },
  { key: "commodity", es: "Producto", en: "Commodity", hint: "(Description or HS Code)", required: true, aliases: ["mercancia"] },
  { key: "hazmat", es: "¿Hazmat?", en: "If Hazmat", hint: "(insert UN number)", aliases: ["hazmat"] },
  { key: "invoice_value", es: "Valor de Factura (USD)", en: "Invoice Value (USD)", hint: "(Cargo Value)" },
  { key: "packaging", es: "Embalaje", en: "Packaging", hint: "(Dropdown)", required: true },
  { key: "pieces", es: "Piezas", en: "Pieces", hint: "(Number)" },
  { key: "stacks", es: "Camas Apilables", en: "Stacks", hint: "(Number)" },
  { key: "weight", es: "Peso Promedio", en: "Avg. Cargo Weight", hint: "(Net Lbs)", aliases: ["peso", "weight"] },
  { key: "cubic_meters", es: "Metros Cubicos Promedio", en: "Avg. Cubic Meters", hint: "(m3)" },
  { key: "mon", es: "Lun", en: "Mon", hint: "(Qty)" },
  { key: "tue", es: "Mar", en: "Tue", hint: "(Qty)" },
  { key: "wed", es: "Mie", en: "Wed", hint: "(Qty)" },
  { key: "thu", es: "Jue", en: "Thu", hint: "(Qty)" },
  { key: "fri", es: "Vie", en: "Fri", hint: "(Qty)" },
  { key: "sat", es: "Sab", en: "Sat", hint: "(Qty)" },
  { key: "sun", es: "Dom", en: "Sun", hint: "(Qty)" },
  { key: "annual_volume", es: "Último Volumen Anual", en: "Last Annual Volume", hint: "(Number)" },
  // The template's own Spanish header reads "Volumen Semanl Esperado".
  {
    key: "loads",
    es: "Volumen Semanal Esperado",
    en: "Expected Weekly Volume",
    hint: "(Number)",
    required: true,
    aliases: ["volumen semanl esperado", "cargas por semana", "loads per week"],
  },
  { key: "shipment_kind", es: "Embarque Spot o Programado?", en: "Spot or Scheduled?", hint: "(Spot / Scheduled)", required: true },
  { key: "lead_time", es: "Plazo para Recoger", en: "Pickup Lead Time", hint: "(# of Days)", required: true },
  { key: "driver_assist", es: "¿Asistencia del Conductor?", en: "Driver's Assistance?", hint: "(Yes or No)" },
  { key: "team_driver", es: "Doble Chofer", en: "Team Driver", hint: "(Yes or No)" },
  { key: "transit_days", es: "Tiempo Estimado de Tránsito", en: "Expected Transit Time", hint: "(# of Days)" },
  { key: "distance", es: "Distancia Promedio", en: "Avg. Distance", hint: "(miles or kms)" },
  {
    key: "additional_items",
    es: "Elementos adicionales en el remolque, camión, almacenamiento de carga, etc.",
    en: "Additional Items on Trailer, Truck, Cargo Holding, etc",
    hint: "(Please specify)",
    required: true,
  },
  { key: "notes", es: "Notas Adicionales", en: "Additional Notes", hint: "(Please insert a relevant information)", aliases: ["notas", "notes"] },
];

/** Header text without accents, case, punctuation or its "(unit)" hint. */
const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const HEADER_OF = new Map<string, Column>(
  COLUMNS.flatMap((column) => [column.es, column.en, ...(column.aliases ?? [])].map((name) => [normalize(name), column.key] as const)),
);

/** The template's Catalog sheet, with the lists a shipper picks from. */
const CATALOG_SHEET: { es: string; en: string; list: CatalogOption[] }[] = [
  { es: "Tipo de instalación", en: "Type of Location", list: FACILITY_TYPES },
  { es: "Tipo de carga / descarga", en: "Load/Unload Type", list: LOAD_TYPES },
  { es: "Tipo de horario", en: "Schedule Type", list: SCHEDULE_TYPES },
  { es: "Tipo de camión", en: "Truck Type", list: TRUCK_TYPES },
  { es: "Tipo de equipo", en: "Equipment Type", list: EQUIPMENT_TYPES },
  { es: "Configuración", en: "Configuration", list: CONFIG_TYPES },
  { es: "Tipo de operación", en: "Operation Type", list: OPERATION_TYPES },
  { es: "Tipo de servicio", en: "Service Type", list: SHIPPER_SERVICE_TYPES },
  { es: "Punto de cruce fronterizo", en: "Border Crossing Point", list: BORDER_CROSSINGS },
  { es: "Embalaje", en: "Packaging", list: PACKAGING_TYPES },
  { es: "Spot o programado", en: "Spot or Scheduled", list: SHIPMENT_KINDS },
  { es: "Sí / No", en: "Yes / No", list: YES_NO },
];

/**
 * The route matrix in the template's layout (stars, headers, hints), a
 * Catalog sheet with the template's values and a short guide.
 */
export async function downloadTemplate(lang: Lang) {
  const XLSX = await import("xlsx");
  const stars = COLUMNS.map((column) => (column.required ? "*" : ""));
  const headers = COLUMNS.map((column) => column[lang]);
  const hints = COLUMNS.map((column) => column.hint);
  const lanes = XLSX.utils.aoa_to_sheet([stars, headers, hints]);
  lanes["!cols"] = COLUMNS.map((column) => ({ wch: Math.min(34, Math.max(9, column[lang].length + 2)) }));

  const longest = Math.max(...CATALOG_SHEET.map((entry) => entry.list.length));
  const catalog = XLSX.utils.aoa_to_sheet([
    CATALOG_SHEET.map((entry) => entry[lang]),
    ...Array.from({ length: longest }, (_, i) => CATALOG_SHEET.map((entry) => entry.list[i]?.value ?? "")),
  ]);
  catalog["!cols"] = CATALOG_SHEET.map(() => ({ wch: 28 }));

  const guide = XLSX.utils.aoa_to_sheet(
    (lang === "es"
      ? [
          ["Una ruta por renglón en la hoja «Rutas», a partir del renglón 4."],
          ["Las columnas con * son las que pide el template RFI de MARKSMAN."],
          ["En las columnas (Dropdown) usa un valor de la hoja «Catálogo»; también aceptamos su nombre en español."],
          ["Ubicación: «Ciudad, Estado» (p. ej. Monterrey, NL o Laredo, TX)."],
          ["También puedes subir el template RFI original tal cual."],
        ]
      : [
          ["One lane per row on the \"Lanes\" sheet, from row 4 on."],
          ["Columns marked * are the ones MARKSMAN's RFI template requires."],
          ["In (Dropdown) columns use a value from the \"Catalog\" sheet."],
          ["Location: \"City, State\" (e.g. Monterrey, NL or Laredo, TX)."],
          ["You can also upload the original RFI template as is."],
        ]),
  );
  guide["!cols"] = [{ wch: 100 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, lanes, lang === "es" ? "Rutas" : "Lanes");
  XLSX.utils.book_append_sheet(book, catalog, lang === "es" ? "Catálogo" : "Catalog");
  XLSX.utils.book_append_sheet(book, guide, lang === "es" ? "Instrucciones" : "Instructions");
  XLSX.writeFile(book, lang === "es" ? "plantilla-rfi-marksman.xlsx" : "marksman-rfi-template.xlsx");
}

// ------------------------------------------------------------- import

type Row = unknown[];

const cellText = (value: unknown) => {
  if (typeof value === "number") return String(value);
  return String(value ?? "").trim();
};

/** The template's business-rules block, under the route matrix: the lanes end there. */
const END_OF_LANES = new Set(["business rules", "reglas de negocio", "list of criteria", "lista de criterios"]);

/** The template's hint row ("City, State", "(Dropdown)"…), right under the headers. */
const isHintRow = (row: Row) => row.filter((cell) => /^\(.*\)$|^city, state$|^5-digit$|^x (hours|days)$|^%$/i.test(cellText(cell))).length >= 3;

const zipText = (value: unknown) => {
  const text = cellText(value).replace(/\.0+$/, "");
  // Excel drops a Mexican zip's leading zero (01234 -> 1234).
  return /^\d{4}$/.test(text) ? `0${text}` : text;
};

const pick = (list: CatalogOption[], value: string) => catalogValue(list, value) ?? value;

function yesNo(value: string) {
  const text = normalize(value);
  if (!text) return "";
  if (/^(y|x|si|yes|true|1)$/.test(text)) return "Yes";
  if (/^(n|no|false|0)$/.test(text)) return "No";
  return catalogValue(YES_NO, value) ?? "";
}

/** kg, tons or lb, from the weight column's own header. */
function weightUnit(header: unknown): { unit: "lb" | "kg"; factor: number } {
  const text = String(header ?? "").toLowerCase();
  if (/\bton|tonelada/.test(text)) return { unit: "kg", factor: 1000 };
  if (/\bkg\b|kilo/.test(text)) return { unit: "kg", factor: 1 };
  return { unit: "lb", factor: 1 };
}

const amountText = (value: string) => {
  const number = parseAmount(value);
  return number === undefined ? "" : String(number);
};

interface SheetLanes {
  name: string;
  lanes: LaneDraft[];
}

function lanesFromSheet(name: string, rows: Row[]): SheetLanes | null {
  const headerIndex = rows.findIndex((row) => row.filter((cell) => HEADER_OF.has(normalize(cell))).length >= 3);
  if (headerIndex < 0) return null;
  const header = rows[headerIndex];
  const columns = header.map((cell) => HEADER_OF.get(normalize(cell)) ?? null);
  const rawAt = (row: Row, key: Column) => {
    const index = columns.indexOf(key);
    return index >= 0 ? row[index] : "";
  };
  const at = (row: Row, key: Column) => cellText(rawAt(row, key));
  const weight = weightUnit(header[columns.indexOf("weight")]);
  const lanes: LaneDraft[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (isHintRow(row)) continue;
    const cell = (key: Column) => at(row, key);
    // A number cell is already a number (18.144 is not eighteen thousand); typed text is parsed.
    const num = (key: Column) => {
      const raw = rawAt(row, key);
      return typeof raw === "number" && Number.isFinite(raw) ? String(raw) : amountText(cellText(raw));
    };
    const originText = cell("origin");
    const destinationText = cell("destination");
    if (END_OF_LANES.has(normalize(originText))) break;
    if (!originText && !destinationText) continue;
    const hazmat = cell("hazmat");
    const hazmatNo = !hazmat || /^(no|n|n\/a|na|0|false)$/i.test(hazmat);
    const weightRaw = rawAt(row, "weight");
    const weightValue = typeof weightRaw === "number" && Number.isFinite(weightRaw) ? weightRaw : parseAmount(cellText(weightRaw));
    const daily = Object.fromEntries(WEEKDAYS.map((day) => [day, num(day)])) as Record<Weekday, string>;
    lanes.push({
      ...emptyLane("rfq"),
      origin: placeFromText(originText, null, zipText(cell("origin_zip")) || null),
      origin_shipper: cell("origin_shipper"),
      origin_facility: pick(FACILITY_TYPES, cell("origin_facility")),
      origin_load_type: pick(LOAD_TYPES, cell("origin_load_type")),
      origin_load_hours: num("origin_load_hours"),
      origin_schedule: pick(SCHEDULE_TYPES, cell("origin_schedule")),
      origin_window: cell("origin_window"),
      destination: placeFromText(destinationText, null, zipText(cell("destination_zip")) || null),
      destination_consignee: cell("destination_consignee"),
      destination_facility: pick(FACILITY_TYPES, cell("destination_facility")),
      destination_unload_type: pick(LOAD_TYPES, cell("destination_unload_type")),
      destination_unload_hours: num("destination_unload_hours"),
      destination_schedule: pick(SCHEDULE_TYPES, cell("destination_schedule")),
      destination_window: cell("destination_window"),
      truck: pick(TRUCK_TYPES, cell("truck")),
      equipment: pick(EQUIPMENT_TYPES, cell("equipment")),
      config: pick(CONFIG_TYPES, cell("config")),
      operation: pick(OPERATION_TYPES, cell("operation")),
      service: pick(SERVICE_TYPES, cell("service")) || "One Way",
      border_crossing: crossingValue(cell("border_crossing")),
      border_days: num("border_days"),
      customs_broker: cell("customs_broker"),
      transfer: cell("transfer"),
      commodity: cell("commodity"),
      hazmat: !hazmatNo,
      hazmat_un: hazmatNo || /^(si|sí|yes|y|x|true|1)$/i.test(hazmat) ? "" : hazmat,
      invoice_value: num("invoice_value"),
      packaging: pick(PACKAGING_TYPES, cell("packaging")),
      pieces: num("pieces"),
      stacks: num("stacks"),
      weight: weightValue === undefined ? "" : String(Math.round(weightValue * weight.factor)),
      weight_unit: weight.unit,
      cubic_meters: num("cubic_meters"),
      daily,
      annual_volume: num("annual_volume"),
      loads: num("loads"),
      shipment_kind: pick(SHIPMENT_KINDS, cell("shipment_kind")),
      lead_time_days: num("lead_time"),
      driver_assist: yesNo(cell("driver_assist")),
      team_driver: yesNo(cell("team_driver")),
      transit_days: num("transit_days"),
      distance: cell("distance"),
      additional_items: cell("additional_items"),
      notes: cell("notes"),
    });
  }
  return { name, lanes };
}

/**
 * Lanes from our template, the original RFI template or any sheet with its
 * headers. A workbook with several route sheets (the RFI template has one per
 * language, plus one per event) imports the first with lanes and says which.
 */
export async function importLanes(file: File): Promise<{ lanes: LaneDraft[]; sheet: string | null }> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const found = book.SheetNames.map((name) =>
    lanesFromSheet(name, XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: "", raw: true }) as Row[]),
  ).filter((sheet): sheet is SheetLanes => Boolean(sheet && sheet.lanes.length));
  if (!found.length) return { lanes: [], sheet: null };
  return { lanes: found[0].lanes, sheet: found.length > 1 ? found[0].name : null };
}
