import { extra } from "@/i18n/carrier-templates";
/**
 * Reading a carrier list from a spreadsheet, before anything touches the
 * backend. Pure except for the lazy SheetJS import.
 *
 * The header aliases and row shape are ported verbatim from rateware's
 * `src/carrier-list-template-file.js`, so a sheet that works there works here.
 *
 * SheetJS is the patched 0.20.3 build from cdn.sheetjs.com, NOT npm's
 * `xlsx@0.18.5` that rateware loads from esm.sh — that one carries
 * CVE-2023-30533 (prototype pollution on crafted files) and CVE-2024-22363
 * (ReDoS). It is imported on demand, so CSV-only users never download it.
 */

/** The backend refuses more than this in one resolve call. */
export const TEMPLATE_IMPORT_MAX_ROWS = 1000;

export const ACCEPTED_FILE_TYPES = ".csv,.tsv,.txt,.xlsx,.xls";

function normalizedHeader(value: unknown = ""): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const HEADER_ALIASES: Record<string, string> = {
  vendor_id: "vendor_id",
  crm_vendor_id: "vendor_id",
  id_proveedor_crm: "vendor_id",
  id_de_proveedor_crm: "vendor_id",
  crm_id: "crm_id",
  legacy_crm_id: "crm_id",
  usdot: "usdot_number",
  usdot_number: "usdot_number",
  us_dot_number: "usdot_number",
  numero_usdot: "usdot_number",
  numero_de_usdot: "usdot_number",
  mc: "mc_number",
  mc_number: "mc_number",
  numero_mc: "mc_number",
  numero_de_mc: "mc_number",
  primary_email: "primary_email",
  email: "primary_email",
  contact_email: "primary_email",
  correo_electronico_principal: "primary_email",
  correo_principal: "primary_email",
  vendor_name: "vendor_name",
  carrier_name: "vendor_name",
  carrier: "vendor_name",
  vendor: "vendor_name",
  company_name: "vendor_name",
  nombre_del_proveedor: "vendor_name",
  nombre_de_proveedor: "vendor_name",
  nombre_del_transportista: "vendor_name",
};

const IDENTIFYING_HEADERS = [
  "vendor_id",
  "crm_id",
  "usdot_number",
  "mc_number",
  "primary_email",
  "vendor_name",
];

export function mapHeader(value: unknown): string {
  const header = normalizedHeader(value);
  return HEADER_ALIASES[header] || header;
}

/** One row as the backend resolver expects it. */
export interface ImportRow {
  vendor_id: string;
  crm_id: string;
  usdot_number: string;
  /** Duplicated on purpose: the resolver reads `row.usdot`. */
  usdot: string;
  mc_number: string;
  primary_email: string;
  vendor_name: string;
  /** The spreadsheet row, so every result can be traced back to a line. */
  source_row_number: number;
}

export class TemplateImportError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Finds the header row anywhere near the top (sheets often carry a title
 * first), then turns every non-empty line under it into an object.
 */
export function rowsFromMatrix(matrix: unknown[][]): Record<string, unknown>[] {
  const rows = Array.isArray(matrix) ? matrix : [];
  const headerIndex = rows.findIndex((row) =>
    (Array.isArray(row) ? row : []).map(mapHeader).some((h) => IDENTIFYING_HEADERS.includes(h)),
  );
  if (headerIndex < 0) {
    throw new TemplateImportError(
      extra("extra7"),
      "missing_headers",
    );
  }
  const headers = (rows[headerIndex] as unknown[]).map(mapHeader);
  return rows
    .slice(headerIndex + 1)
    .map((row, index) => {
      const item: Record<string, unknown> = {};
      headers.forEach((header, col) => {
        if (header) item[header] = Array.isArray(row) ? (row[col] ?? "") : "";
      });
      item.source_row_number = headerIndex + index + 2;
      return item;
    })
    .filter((row) =>
      Object.entries(row).some(
        ([k, v]) => k !== "source_row_number" && String(v ?? "").trim(),
      ),
    );
}

const clean = (v: unknown, lower = false) => {
  const t = String(v ?? "").trim();
  return lower ? t.toLowerCase() : t;
};

export function normalizeRows(rows: Record<string, unknown>[]): ImportRow[] {
  return rows.map((row, index) => {
    const usdot = clean(row.usdot_number ?? row.usdot);
    const src = Number(row.source_row_number);
    return {
      vendor_id: clean(row.vendor_id),
      crm_id: clean(row.crm_id),
      usdot_number: usdot,
      usdot,
      mc_number: clean(row.mc_number ?? row.mc),
      primary_email: clean(row.primary_email ?? row.email, true),
      vendor_name: clean(row.vendor_name ?? row.name),
      source_row_number: Number.isFinite(src) && src > 0 ? src : index + 2,
    };
  });
}

/**
 * RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside
 * quotes. A naive split on "," breaks on the first carrier named
 * "Transportes Foo, S.A. de C.V." — which in this CRM is most of them.
 */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";

  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}

/** Reads the first sheet of a workbook. SheetJS loads only when needed. */
async function matrixFromWorkbook(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const first = workbook.Sheets[workbook.SheetNames[0]];
  if (!first) throw new TemplateImportError(extra("extra8"), "missing_first_sheet");
  return XLSX.utils.sheet_to_json(first, { header: 1, defval: "" }) as unknown[][];
}

/** Entry point: a file from the picker, or text pasted from a spreadsheet. */
export async function readCarrierList(source: File | string): Promise<ImportRow[]> {
  let matrix: unknown[][];
  if (typeof source === "string") {
    matrix = parseDelimited(source);
  } else if (/\.(xlsx|xls)$/i.test(source.name)) {
    matrix = await matrixFromWorkbook(source);
  } else if (/\.(csv|tsv|txt)$/i.test(source.name)) {
    matrix = parseDelimited(await source.text());
  } else {
    throw new TemplateImportError(
      extra("extra9"),
      "unsupported_file_type",
    );
  }

  const rows = normalizeRows(rowsFromMatrix(matrix));
  if (!rows.length) throw new TemplateImportError(extra("extra10"), "empty");
  if (rows.length > TEMPLATE_IMPORT_MAX_ROWS) {
    throw new TemplateImportError(
      extra("extra11", TEMPLATE_IMPORT_MAX_ROWS.toLocaleString(), rows.length.toLocaleString()),
      "too_many_rows",
    );
  }
  return rows;
}

/* ------------------------------------------------------------------ */

/**
 * A spreadsheet cell that starts with = + - @ is executed as a formula when
 * the exported file is opened in Excel. Prefixing it with a quote keeps a
 * carrier named "=HYPERLINK(...)" from becoming a live link. Ported from
 * rateware, which already guards against it.
 */
function csvCell(value: unknown): string {
  const original = String(value ?? "");
  const text = typeof value === "string" && /^[ ]*[=+\-@\t\r]/.test(original) ? `'${original}` : original;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exceptionCsv(
  rows: { source: ImportRow; status: string; reason: string; candidates: string[]; chosen?: string | null }[],
): string {
  const headers = [
    "source_row_number",
    "status",
    "reason",
    "vendor_id",
    "crm_id",
    "usdot_number",
    "mc_number",
    "primary_email",
    "vendor_name",
    "candidate_vendor_ids",
    "chosen_vendor_id",
  ];
  const lines = rows.map((r) =>
    [
      r.source.source_row_number,
      r.status,
      r.reason,
      r.source.vendor_id,
      r.source.crm_id,
      r.source.usdot_number,
      r.source.mc_number,
      r.source.primary_email,
      r.source.vendor_name,
      r.candidates.join(";"),
      r.chosen ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return `${headers.join(",")}\r\n${lines.join("\r\n")}${lines.length ? "\r\n" : ""}`;
}
