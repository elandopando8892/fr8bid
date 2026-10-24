import type { WorkBook } from "xlsx";
import {
  billingNotice, canQuote, COMMERCIAL_MODELS, modelSpec, offerForm, offerPayload, offerProblems,
  offerWarnings, type BookLane, type OfferForm,
} from "./bidroom.service";

export const OFFER_COLUMNS = [
  ["bid_rate", "Tarifa carrier"], ["currency", "Moneda"],
  ["commercial_model", "Modelo comercial"], ["pct", "Porcentaje"],
  ["weekly_capacity", "Capacidad semanal"], ["transit_days", "Tránsito (días)"],
  ["valid_through", "Vigente hasta"], ["equipment_available", "Equipo disponible"],
  ["current_unit_location", "Ubicación de unidad"], ["deadhead_distance", "Vacío al origen"],
  ["deadhead_unit", "Unidad de vacío"], ["unit_details", "Detalle de unidad"],
  ["eta_pickup", "ETA recolección"], ["eta_delivery", "ETA entrega"],
  ["mirror_account_enabled", "Cuenta espejo GPS"], ["best_alternative_offered", "Ofrezco alternativa"],
  ["alternative_equipment", "Equipo alternativo"], ["alternative_units", "Unidades alternativas"],
  ["alternative_notes", "Condiciones alternativas"], ["best_final", "Oferta final"], ["notes", "Notas"],
] as const satisfies ReadonlyArray<readonly [keyof OfferForm, string]>;
const META = ["Evento ID", "Invitación ID", "Ruta ID", "Ruta #", "Origen", "Destino", "Equipo", "Base de oferta", "Enviar ruta"];
export const TEMPLATE_HEADERS = [...META, ...OFFER_COLUMNS.map(([, label]) => label)];
const text = (v: unknown) => v == null ? "" : String(v).trim();
const norm = (v: unknown) => text(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const booleanFields = new Set<keyof OfferForm>(["mirror_account_enabled", "best_alternative_offered", "best_final"]);
const dateFields = new Set(["valid_through", "eta_pickup", "eta_delivery"]);
export const offerBaseline = (lane: BookLane) => JSON.stringify(offerForm(lane));

export function displayOfferValue(key: keyof OfferForm, form: OfferForm): string {
  const value = form[key];
  if (key === "commercial_model") return modelSpec(form.commercial_model).label;
  if (key === "pct") return `${value || modelSpec(form.commercial_model).blank} %${value === "" ? " (predeterminado)" : ""}`;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (key === "equipment_available") return value === "yes" ? "Sí" : value === "no" ? "No" : "Sin dato";
  return value || "Sin dato";
}

export async function buildBidTemplate(lanes: BookLane[]): Promise<WorkBook> {
  const XLSX = await import("xlsx");
  const rows = lanes.map(lane => {
    const form = offerForm(lane);
    return [lane.rfx_event_id || "", lane.invitation_id || "", lane.rfx_lane_id,
      lane.lane_number ?? "", lane.origin || "", lane.destination || "", lane.equipment || "",
      offerBaseline(lane), "No", ...OFFER_COLUMNS.map(([key]) => {
        const v = form[key];
        if (key === "commercial_model") return modelSpec(form.commercial_model).label;
        if (typeof v === "boolean") return v ? "Sí" : "No";
        if (key === "equipment_available") return v === "yes" ? "Sí" : v === "no" ? "No" : "";
        return v;
      })];
  });
  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]);
  sheet["!cols"] = TEMPLATE_HEADERS.map((_, i) => ({ wch: i < 3 ? 38 : 25, hidden: i === 7 }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Ofertas");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Cómo responder"],
    ["Marca Sí en Enviar ruta solo para las ofertas que deseas registrar. Importar no envía."],
    ["Conserva las columnas, IDs y Base de oferta; usa esta plantilla únicamente con la misma invitación."],
    ["Los campos vacíos sustituyen/borran el dato anterior al enviar. Revisa todos los datos antes de confirmar."],
    ["Fechas: AAAA-MM-DD. ETA: AAAA-MM-DDTHH:mm en la zona horaria de tu navegador."],
    ["Números: punto decimal, sin separadores de miles. Sí/No para confirmaciones. Vacío: mi o km."],
    ["Usa valores, no fórmulas. Si ya cambió una oferta, descarga una plantilla nueva."],
    ["Porcentaje vacío: se aplica el predeterminado del modelo. No escribas 0.03 para 3 %; escribe 3."],
    [], ["Modelo", "Captura", "Efecto", "Mínimo %", "Máximo %", "Predeterminado %", "Facturación"],
    ...COMMERCIAL_MODELS.map(m => [m.label, m.enter, m.effect, m.min, m.max, m.blank, billingNotice({ commercial_model: m.key, pct: "" }) || ""]),
  ]), "Instrucciones y modelos");
  return book;
}

export interface ImportedOffer {
  row: number;
  lane: BookLane;
  form: OfferForm;
  baseline: string;
  warnings: string[];
}

function yesNo(value: unknown, label: string, allowBlank = false): boolean | null {
  const s = norm(value);
  if (!s && allowBlank) return null;
  if (["si", "yes", "true", "1"].includes(s)) return true;
  if (["no", "false", "0"].includes(s)) return false;
  throw new Error(`${label}: escribe Sí o No.`);
}

function validateDates(form: OfferForm) {
  for (const key of ["valid_through", "eta_pickup", "eta_delivery"] as const) {
    const v = form[key];
    if (!v) continue;
    const pattern = key === "valid_through" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const d = new Date(v.length === 10 ? `${v}T00:00` : v);
    const dateParts = v.slice(0, 10).split("-").map(Number);
    if (!pattern.test(v) || !Number.isFinite(d.getTime()) || d.getFullYear() !== dateParts[0] ||
        d.getMonth() + 1 !== dateParts[1] || d.getDate() !== dateParts[2] ||
        (v.length > 10 && (d.getHours() !== Number(v.slice(11, 13)) || d.getMinutes() !== Number(v.slice(14, 16))))) {
      throw new Error(`${OFFER_COLUMNS.find(([k]) => k === key)![1]}: fecha inválida; usa el formato de las instrucciones.`);
    }
  }
  if (form.eta_pickup && form.eta_delivery && new Date(form.eta_delivery) <= new Date(form.eta_pickup)) {
    throw new Error("La ETA de entrega debe ser posterior a la recolección.");
  }
}

/** Exact schema, explicit selected rows, and current-book identity; file values never supply credentials. */
export async function parseBidTemplate(data: ArrayBuffer, lanes: BookLane[]): Promise<ImportedOffer[]> {
  if (data.byteLength > 5 * 1024 * 1024) throw new Error("El archivo supera 5 MiB.");
  const XLSX = await import("xlsx");
  const book = XLSX.read(data, { type: "array", cellFormula: true, sheetRows: 1002 });
  const sheet = book.Sheets.Ofertas;
  if (!sheet) throw new Error("Falta la hoja Ofertas; descarga la plantilla de este Bid Room.");
  const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
  if (range.e.r > 1000 || range.e.c >= TEMPLATE_HEADERS.length) throw new Error("La plantilla admite hasta 1,000 rutas y sus columnas originales.");
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith("!") && (cell.f || cell.F || cell.t === "e")) throw new Error(`Celda ${address}: sustituye fórmulas o errores por valores.`);
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const header = (rows[0] || []).map(text);
  if (header.length !== TEMPLATE_HEADERS.length || TEMPLATE_HEADERS.some(h => header.filter(v => v === h).length !== 1)) {
    throw new Error("Las columnas no coinciden con la plantilla. Descarga una nueva y conserva todos sus encabezados.");
  }
  const result: ImportedOffer[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((values, index) => {
    if (values.every(v => text(v) === "")) return;
    const row = index + 2;
    const get = (name: string) => values[header.indexOf(name)];
    try {
      const selected = yesNo(get("Enviar ruta"), "Enviar ruta", true);
      if (!selected) return;
      const lane = lanes.find(l => l.rfx_lane_id === text(get("Ruta ID")) &&
        l.rfx_event_id === text(get("Evento ID")) && l.invitation_id === text(get("Invitación ID")));
      if (!lane || !lane.invitation_id) throw new Error("La ruta no pertenece a esta invitación.");
      if (seen.has(lane.rfx_lane_id)) throw new Error("La ruta está duplicada.");
      seen.add(lane.rfx_lane_id);
      if (!canQuote(lane)) throw new Error("La ruta ya no admite ofertas.");
      const baseline = text(get("Base de oferta"));
      if (baseline !== offerBaseline(lane)) throw new Error("La oferta cambió desde la descarga; descarga una nueva plantilla.");
      const form = offerForm(lane);
      for (const [key, label] of OFFER_COLUMNS) {
        let value = get(label);
        if (dateFields.has(key) && typeof value === "number") {
          const parts = XLSX.SSF.parse_date_code(value, { date1904: !!book.Workbook?.WBProps?.date1904 });
          if (!parts) throw new Error(`${label}: fecha inválida.`);
          const pad = (n: number) => String(n).padStart(2, "0");
          value = `${parts.y}-${pad(parts.m)}-${pad(parts.d)}${key === "valid_through" ? "" : `T${pad(parts.H)}:${pad(parts.M)}`}`;
        }
        if (booleanFields.has(key)) {
          Object.assign(form, { [key]: yesNo(value, label, true) ?? false });
        } else if (key === "equipment_available") {
          const answer = yesNo(value, label, true);
          form.equipment_available = answer === null ? "" : answer ? "yes" : "no";
        } else if (key === "commercial_model") {
          const model = COMMERCIAL_MODELS.find(m => norm(m.label) === norm(value) || m.key === norm(value));
          if (!model) throw new Error("Modelo comercial desconocido; usa uno de los tres modelos de la hoja Instrucciones y modelos.");
          form.commercial_model = model.key;
        } else {
          Object.assign(form, { [key]: text(value) });
        }
      }
      form.currency = form.currency.toUpperCase();
      if (!/^[A-Z]{3}$/.test(form.currency)) throw new Error("Moneda: usa tres letras, por ejemplo USD o MXN.");
      if (!["mi", "km"].includes(form.deadhead_unit)) throw new Error("Unidad de vacío: usa mi o km.");
      for (const key of ["bid_rate", "pct", "weekly_capacity", "transit_days", "deadhead_distance", "alternative_units"] as const) {
        if (form[key] && !/^\d+(\.\d+)?$/.test(form[key])) throw new Error(`${OFFER_COLUMNS.find(([k]) => k === key)![1]}: usa un número positivo o cero, con punto decimal y sin separadores.`);
      }
      validateDates(form);
      if (!form.best_alternative_offered && (form.alternative_equipment || form.alternative_units || form.alternative_notes)) {
        throw new Error("Hay datos de alternativa: marca Sí en Ofrezco alternativa o borra esos campos para no perderlos al enviar.");
      }
      const problems = offerProblems(form);
      if (problems.length) throw new Error(problems.join(" "));
      // Validate full serialization before presenting an actionable plan.
      offerPayload(form, lane);
      result.push({ row, lane, form, baseline, warnings: offerWarnings(form) });
    } catch (error) {
      throw new Error(`Fila ${row}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  if (!result.length) throw new Error("Marca Sí en Enviar ruta para al menos una oferta.");
  return result;
}

export function currentOfferForSend(offer: ImportedOffer, lanes: BookLane[]): BookLane {
  const lane = lanes.find(l => l.rfx_lane_id === offer.lane.rfx_lane_id &&
    l.invitation_id === offer.lane.invitation_id && l.rfx_event_id === offer.lane.rfx_event_id);
  if (!lane || !canQuote(lane) || offerBaseline(lane) !== offer.baseline) {
    throw new Error(`Ruta ${offer.lane.lane_number ?? offer.row}: cambió la oferta o su acceso. Recarga y descarga una nueva plantilla.`);
  }
  return lane;
}
