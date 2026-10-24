import { callRatewareApi } from "@/lib/api-client";
import type { StagedRate } from "@/features/rate-review/readiness";

/**
 * The rate base (tarifario): every rate the team approved, the prices
 * QuoteDesk and the Ratebooks read. Same rows as the review queue
 * (rate_staging), with status "approved".
 */

/**
 * What the server filters on. Its quick filters ("cross-border", "with
 * capacity") are ignored on this path (rateware's grid applied them in the
 * browser to the rows it had loaded), so the operation stands in for them.
 */
export interface RateBaseFilters {
  search: string;
  operation: string;
  service: string;
}

export const PAGE_SIZE = 100;

export async function listApprovedRates(filters: RateBaseFilters, offset: number, limit = PAGE_SIZE) {
  // Operation and service go as column filters with a list of one: an exact
  // match in ~2 s. A plain string is a "contains" match ("Drayage" also brings
  // "MX Drayage") and, like the `operation` / `service` parameters, took 40+ s
  // on the 55,827 approved rates (measured 2026-09-28).
  const columnFilters: Record<string, string[]> = {};
  if (filters.operation) columnFilters.operation = [filters.operation];
  if (filters.service) columnFilters.service = [filters.service];
  const res = await callRatewareApi<{ rows?: StagedRate[]; total?: number; has_more?: boolean }>("list_rateware", {
    search: filters.search,
    quick_filter: "all",
    column_filters: columnFilters,
    limit,
    offset,
  });
  return { rows: res.rows ?? [], total: Number(res.total ?? 0), has_more: Boolean(res.has_more) };
}

/** Changes one approved rate; the server keeps it approved and logs the change. */
export const updateApprovedRate = (id: string, patch: Record<string, unknown>) =>
  callRatewareApi<{ row?: StagedRate }>("update_rateware", { id, patch });

export interface RateChange {
  id: string;
  created_at: string;
  action?: string | null;
  summary?: string | null;
  actor_email?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** What happened to the rate: approval, edits, returns to review. */
export async function rateHistory(id: string) {
  const res = await callRatewareApi<{ rows?: RateChange[] }>("list_rateware_audit", { id, limit: 30 });
  return res.rows ?? [];
}

/**
 * Takes rates out of the rate base and back to the review queue, where the
 * lane and places can be fixed and the rate approved again. An Administrador's.
 */
export const returnToReview = (ids: string[], reason: string) =>
  callRatewareApi<{ returned?: number; updated?: number }>("return_rateware_to_staging", {
    ids,
    reason,
    confirmed: true,
    confirmation_action: "return_rateware_to_staging",
  });

/** Rows for a CSV, page by page, up to `max`. */
export async function collectForExport(
  filters: RateBaseFilters,
  max: number,
  onProgress: (loaded: number, total: number) => void,
) {
  const rows: StagedRate[] = [];
  for (let offset = 0; offset < max; offset += 1000) {
    const page = await listApprovedRates(filters, offset, Math.min(1000, max - offset));
    rows.push(...page.rows);
    onProgress(rows.length, page.total);
    if (!page.has_more || !page.rows.length) break;
  }
  return rows;
}

const COLUMNS: [string, (r: StagedRate) => unknown][] = [
  ["Origen", (r) => r.normalized_origin || r.origin],
  ["Destino", (r) => r.normalized_destination || r.destination],
  ["Carrier", (r) => r.vendors?.vendor_name || r.vendor_domain],
  ["Equipo", (r) => r.equipment],
  ["Remolque", (r) => r.trailer],
  ["Configuración", (r) => r.config],
  ["Operación", (r) => r.operation],
  ["Servicio", (r) => r.service],
  ["Cruce MX", (r) => r.mx_border_crossing_point],
  ["Cruce US", (r) => r.us_border_crossing_point],
  ["All-in", (r) => r.all_in_rate],
  ["Moneda", (r) => r.currency],
  ["Flete MX", (r) => r.mx_linehaul],
  ["Flete US", (r) => r.us_linehaul],
  ["FSC", (r) => r.fsc],
  ["Cruce (costo)", (r) => r.border_crossing_fee],
  ["Capacidad semanal", (r) => r.weekly_capacity],
  ["Fecha de cotización", (r) => String(r.quote_date ?? "").slice(0, 10)],
  ["RFx", (r) => r.rfx_id],
];

const cell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** A CSV Excel opens as UTF-8 (with the BOM), one rate per line. */
export function toCsv(rows: StagedRate[]) {
  const lines = [COLUMNS.map(([name]) => name).join(","), ...rows.map((r) => COLUMNS.map(([, get]) => cell(get(r))).join(","))];
  return "﻿" + lines.join("\r\n");
}

export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
