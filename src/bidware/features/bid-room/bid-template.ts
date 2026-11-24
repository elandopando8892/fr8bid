import type { WorkBook } from "xlsx";
import {
  acceptedModelKeys, billingNotice, canQuote, COMMERCIAL_MODELS, commercialPolicyKey, isLockedBrokerage, modelCopy, modelSpec, offerForm, offerPayload, offerProblems,
  offerWarnings, type BookLane, type ModelChoice, type OfferForm,
} from "./bidroom.service";
import { getLang, type Lang } from "../../i18n/language";
import { q, quoteCopy } from "../../i18n/bid-room-quote";
import { excelText, xls } from "../../i18n/bid-room-excel";

/**
 * The template is downloaded in the language of the Bid Room and imported in
 * either: a file keeps the language it was downloaded in, so each column is
 * known by its key and named with the label of the file's language.
 */
const META_KEYS = ["event_id", "invitation_id", "lane_id", "lane_number", "origin", "destination", "equipment", "baseline", "send"] as const;
const OFFER_KEYS = [
  "bid_rate", "currency", "commercial_model", "pct", "weekly_capacity", "transit_days", "valid_through",
  "equipment_available", "current_unit_location", "deadhead_distance", "deadhead_unit", "unit_details",
  "eta_pickup", "eta_delivery", "mirror_account_enabled", "best_alternative_offered", "alternative_equipment",
  "alternative_units", "alternative_notes", "best_final", "notes",
] as const satisfies ReadonlyArray<keyof OfferForm>;
type MetaKey = (typeof META_KEYS)[number];
type OfferKey = (typeof OFFER_KEYS)[number];
const columnLabel = (key: MetaKey | OfferKey, lang: Lang) => excelText(`col.${key}`, lang);

/** The offer's columns with their labels in a language (the Bid Room's by default). */
export const offerColumns = (lang: Lang = getLang()) => OFFER_KEYS.map(key => [key, columnLabel(key, lang)] as const);
/** Every header of the full template, in order. */
export const templateHeaders = (lang: Lang = getLang()) =>
  [...META_KEYS.map(key => columnLabel(key, lang)), ...OFFER_KEYS.map(key => columnLabel(key, lang))];
/** The Spanish template, for whoever names its columns in Spanish. */
export const OFFER_COLUMNS = offerColumns("es");
export const TEMPLATE_HEADERS = templateHeaders("es");
const LOCKED_HIDDEN: ReadonlySet<string> = new Set(["pct", "commercial_model"]);
const text = (v: unknown) => v == null ? "" : String(v).trim();
const norm = (v: unknown) => text(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const booleanFields = new Set<keyof OfferForm>(["mirror_account_enabled", "best_alternative_offered", "best_final"]);
const dateFields = new Set(["valid_through", "eta_pickup", "eta_delivery"]);
/**
 * What a template was downloaded against: the lane's offer and its event's
 * commercial policy. A file prepared under other accepted models is out of
 * date even when the offer itself has not changed.
 */
export const offerBaseline = (lane: BookLane) => JSON.stringify({ ...offerForm(lane), policy: commercialPolicyKey(lane) });

/** The model as a cell or a line of the review: its label, or "not chosen" (blank in the file). */
const modelLabel = (model: ModelChoice, blank = q("model.none.label")) => (model ? modelCopy(model).label : blank);

/** A value of the offer as the review shows it, in the Bid Room's language. */
export function displayOfferValue(key: keyof OfferForm, form: OfferForm): string {
  const value = form[key];
  if (key === "commercial_model") return modelLabel(form.commercial_model);
  if (key === "pct") {
    if (!form.commercial_model) return xls("val.none");
    return value === "" ? xls("val.pctDefault", modelSpec(form.commercial_model).blank) : xls("val.pct", value);
  }
  if (typeof value === "boolean") return value ? xls("val.yes") : xls("val.no");
  if (key === "equipment_available") return value === "yes" ? xls("val.yes") : value === "no" ? xls("val.no") : xls("val.none");
  return value || xls("val.none");
}

export async function buildBidTemplate(lanes: BookLane[]): Promise<WorkBook> {
  const XLSX = await import("xlsx");
  const lang = getLang();
  const lockedOnly = lanes.length > 0 && lanes.every(isLockedBrokerage);
  const columns = offerColumns(lang).filter(([key]) => !lockedOnly || !LOCKED_HIDDEN.has(key));
  const headers = [...META_KEYS.map(key => columnLabel(key, lang)), ...columns.map(([, label]) => label)];
  const yes = xls("val.yes"), no = xls("val.no");
  const rows = lanes.map(lane => {
    const form = offerForm(lane);
    return [lane.rfx_event_id || "", lane.invitation_id || "", lane.rfx_lane_id,
      lane.lane_number ?? "", lane.origin || "", lane.destination || "", lane.equipment || "",
      offerBaseline(lane), no, ...columns.map(([key]) => {
        const v = form[key];
        // Not chosen is an empty cell: the carrier may leave it that way.
        if (key === "commercial_model") return modelLabel(form.commercial_model, "");
        if (typeof v === "boolean") return v ? yes : no;
        if (key === "equipment_available") return v === "yes" ? yes : v === "no" ? no : "";
        return v;
      })];
  });
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((_, i) => ({ wch: i < 3 ? 38 : 25, hidden: i === META_KEYS.indexOf("baseline") }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, xls("sheet.offers"));
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    [xls("help.title")],
    [xls("help.send")],
    [xls("help.keep")],
    [xls("help.blank")],
    [xls("help.dates")],
    [xls("help.numbers")],
    [xls("help.values")],
    ...(lockedOnly ? [[xls("help.locked")]] : [
      [xls("help.model")],
      [xls("help.pct")],
      [], [xls("help.colModel"), xls("help.colEnter"), xls("help.colEffect"), xls("help.colMin"), xls("help.colMax"), xls("help.colDefault"), xls("help.colBilling")],
      // Only the models some lane of this file accepts.
      ...COMMERCIAL_MODELS.filter(m => lanes.some(lane => acceptedModelKeys(lane).includes(m.key))).map(m => {
        const copy = modelCopy(m.key);
        return [copy.label, copy.enter, copy.effect, m.min, m.max, m.blank, billingNotice({ commercial_model: m.key, pct: "" }) || ""];
      }),
    ]),
  ]), xls("sheet.help"));
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
  throw new Error(xls("err.yesNo", label));
}

function validateDates(form: OfferForm, lang: Lang) {
  for (const key of ["valid_through", "eta_pickup", "eta_delivery"] as const) {
    const v = form[key];
    if (!v) continue;
    const pattern = key === "valid_through" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const d = new Date(v.length === 10 ? `${v}T00:00` : v);
    const dateParts = v.slice(0, 10).split("-").map(Number);
    if (!pattern.test(v) || !Number.isFinite(d.getTime()) || d.getFullYear() !== dateParts[0] ||
        d.getMonth() + 1 !== dateParts[1] || d.getDate() !== dateParts[2] ||
        (v.length > 10 && (d.getHours() !== Number(v.slice(11, 13)) || d.getMinutes() !== Number(v.slice(14, 16))))) {
      throw new Error(xls("err.dateFormat", columnLabel(key, lang)));
    }
  }
  if (form.eta_pickup && form.eta_delivery && new Date(form.eta_delivery) <= new Date(form.eta_pickup)) {
    throw new Error(xls("err.etaOrder"));
  }
}

/** The three ways a model may be written in a file: its key or its label in either language. */
const modelNames = (m: (typeof COMMERCIAL_MODELS)[number]) =>
  [m.key, m.label, quoteCopy[`model.${m.key}.label`].es, quoteCopy[`model.${m.key}.label`].en].map(norm);

/**
 * Exact schema, explicit selected rows, and current-book identity; file values never supply credentials.
 * The file's language is the one of its sheet («Ofertas» or «Offers») and its headers must all be in it;
 * the messages go in the Bid Room's language and name the columns as the file does.
 */
export async function parseBidTemplate(data: ArrayBuffer, lanes: BookLane[]): Promise<ImportedOffer[]> {
  if (data.byteLength > 5 * 1024 * 1024) throw new Error(xls("err.tooBig"));
  const XLSX = await import("xlsx");
  const book = XLSX.read(data, { type: "array", cellFormula: true, sheetRows: 1002 });
  const lang = (["es", "en"] as const).find(l => book.Sheets[excelText("sheet.offers", l)]);
  if (!lang) throw new Error(xls("err.noSheet"));
  const sheet = book.Sheets[excelText("sheet.offers", lang)];
  const label = (key: MetaKey | OfferKey) => columnLabel(key, lang);
  const full = templateHeaders(lang);
  const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
  if (range.e.r > 1000 || range.e.c >= full.length) throw new Error(xls("err.size"));
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith("!") && (cell.f || cell.F || cell.t === "e")) throw new Error(xls("err.formula", address));
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const header = (rows[0] || []).map(text);
  const lockedLabels = [...LOCKED_HIDDEN].map(key => label(key as OfferKey));
  const schema = lockedLabels.some(h => header.includes(h)) ? full : full.filter(h => !lockedLabels.includes(h));
  if (header.length !== schema.length || schema.some(h => header.filter(v => v === h).length !== 1)) {
    throw new Error(xls("err.headers"));
  }
  const result: ImportedOffer[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((values, index) => {
    if (values.every(v => text(v) === "")) return;
    const row = index + 2;
    const get = (key: MetaKey | OfferKey) => values[header.indexOf(label(key))];
    try {
      const selected = yesNo(get("send"), label("send"), true);
      if (!selected) return;
      const lane = lanes.find(l => l.rfx_lane_id === text(get("lane_id")) &&
        l.rfx_event_id === text(get("event_id")) && l.invitation_id === text(get("invitation_id")));
      if (!lane || !lane.invitation_id) throw new Error(xls("err.foreign"));
      if (seen.has(lane.rfx_lane_id)) throw new Error(xls("err.duplicate"));
      seen.add(lane.rfx_lane_id);
      if (!canQuote(lane)) throw new Error(xls("err.closed"));
      const baseline = text(get("baseline"));
      if (baseline !== offerBaseline(lane)) throw new Error(xls("err.stale"));
      const form = offerForm(lane);
      for (const key of OFFER_KEYS) {
        const name = label(key);
        if (!header.includes(name)) {
          if (!isLockedBrokerage(lane) || !LOCKED_HIDDEN.has(key)) throw new Error(xls("err.missing"));
          continue;
        }
        let value = get(key);
        if (dateFields.has(key) && typeof value === "number") {
          const parts = XLSX.SSF.parse_date_code(value, { date1904: !!book.Workbook?.WBProps?.date1904 });
          if (!parts) throw new Error(xls("err.date", name));
          const pad = (n: number) => String(n).padStart(2, "0");
          value = `${parts.y}-${pad(parts.m)}-${pad(parts.d)}${key === "valid_through" ? "" : `T${pad(parts.H)}:${pad(parts.M)}`}`;
        }
        if (booleanFields.has(key)) {
          Object.assign(form, { [key]: yesNo(value, name, true) ?? false });
        } else if (key === "equipment_available") {
          const answer = yesNo(value, name, true);
          form.equipment_available = answer === null ? "" : answer ? "yes" : "no";
        } else if (key === "commercial_model") {
          // An empty cell leaves the model as the lane has it: its own, the event's only one, or none.
          if (norm(value) === "") continue;
          const model = COMMERCIAL_MODELS.find(m => modelNames(m).includes(norm(value)));
          if (!model) throw new Error(xls("err.model", name, excelText("sheet.help", lang)));
          const accepted = acceptedModelKeys(lane);
          if (!accepted.includes(model.key)) {
            throw new Error(xls("err.modelNotAccepted", name, accepted.map(k => modelCopy(k).label).join(", ")));
          }
          form.commercial_model = model.key;
        } else {
          Object.assign(form, { [key]: text(value) });
        }
      }
      form.currency = form.currency.toUpperCase();
      if (!/^[A-Z]{3}$/.test(form.currency)) throw new Error(xls("err.currency", label("currency")));
      if (!["mi", "km"].includes(form.deadhead_unit)) throw new Error(xls("err.deadheadUnit", label("deadhead_unit")));
      for (const key of ["bid_rate", "pct", "weekly_capacity", "transit_days", "deadhead_distance", "alternative_units"] as const) {
        if (form[key] && !/^\d+(\.\d+)?$/.test(form[key])) throw new Error(xls("err.number", label(key)));
      }
      validateDates(form, lang);
      if (!form.best_alternative_offered && (form.alternative_equipment || form.alternative_units || form.alternative_notes)) {
        throw new Error(xls("err.alternative", label("best_alternative_offered")));
      }
      const problems = offerProblems(form);
      if (problems.length) throw new Error(problems.join(" "));
      // Validate full serialization before presenting an actionable plan.
      offerPayload(form, lane);
      result.push({ row, lane, form, baseline, warnings: offerWarnings(form) });
    } catch (error) {
      throw new Error(xls("err.row", row, error instanceof Error ? error.message : String(error)));
    }
  });
  if (!result.length) throw new Error(xls("err.none", label("send")));
  return result;
}

export function currentOfferForSend(offer: ImportedOffer, lanes: BookLane[]): BookLane {
  const lane = lanes.find(l => l.rfx_lane_id === offer.lane.rfx_lane_id &&
    l.invitation_id === offer.lane.invitation_id && l.rfx_event_id === offer.lane.rfx_event_id);
  // The baseline carries the event's commercial policy too: a plan reviewed under
  // other accepted models is not sent, because the same offer could be stored with another one.
  if (!lane || !canQuote(lane) || offerBaseline(lane) !== offer.baseline) {
    throw new Error(xls("err.changed", offer.lane.lane_number ?? offer.row));
  }
  return lane;
}
