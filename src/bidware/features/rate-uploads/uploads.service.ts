import { extra } from "@/i18n/rate-uploads";
import { ApiError, SIMULATED_MESSAGE, callFunction, callRatewareApi, functionEndpoint } from "@/lib/api-client";
import { env } from "@/config/env";
import { getAccessToken } from "@/lib/auth";

/**
 * Rate files: a carrier's price list or quote (Excel, PDF, email or image).
 *   1. create-raw-upload keeps the file;
 *   2. interpret-upload reads it (OpenAI) and turns it into rates waiting in
 *      Revisión de tarifas;
 *   3. the team approves them there into the Tarifario.
 * Most files today arrive on their own (carriers' offers by email); this is
 * the manual way in.
 */

export type DocumentType = "xlsx" | "pdf" | "email" | "image";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff"];

/** rateware's file-rules: what create-raw-upload accepts. */
export function documentTypeOf(file: File): DocumentType | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx" || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (ext === "pdf" || file.type === "application/pdf") return "pdf";
  if (ext === "eml" || file.type === "message/rfc822") return "email";
  if (IMAGE_EXTENSIONS.includes(ext) || file.type.startsWith("image/")) return "image";
  return null;
}

export const ACCEPT = ".xlsx,.pdf,.eml," + IMAGE_EXTENSIONS.map((e) => `.${e}`).join(",");

export interface RawUpload {
  id: string;
  created_at: string;
  original_filename?: string | null;
  filename?: string | null;
  document_type?: string | null;
  status?: string | null;
  vendor_id?: string | null;
  vendor_hint?: string | null;
  rfx_hint?: string | null;
  rfx_number?: string | null;
  interpreted_rate_rows?: number | null;
  expected_rate_rows?: number | null;
  audit_status?: string | null;
  audit_warnings?: unknown[] | null;
  error_message?: string | null;
  interpreted_at?: string | null;
  reprocess_count?: number | null;
  correction_note?: string | null;
  vendors?: { vendor_name?: string | null; domain?: string | null } | null;
}

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Keeps the file (multipart, so not through callFunction). */
export async function uploadFile(file: File, context: { vendorId?: string; vendor?: string; rfx?: string }) {
  const documentType = documentTypeOf(file);
  if (!documentType) throw new Error(extra("extra0", file.name));
  if (env.simulated) throw new ApiError(SIMULATED_MESSAGE, { status: 503, code: "SIMULADO", action: "create_raw_upload" });
  const token = await getAccessToken();
  if (!token) throw new ApiError(extra("extra1"), { status: 401, action: "create_raw_upload" });
  const form = new FormData();
  form.append("file", file);
  form.append("vendor_id", context.vendorId ?? "");
  form.append("vendor", context.vendor ?? "");
  form.append("rfx", context.rfx ?? "");
  form.append("document_type", documentType);
  // Through Fr8Bid's /api/funcion, which takes up to 4.5 MB per request.
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(`${file.name} pesa más de 4 MB; Fr8Bid sube archivos de hasta 4 MB.`, { status: 413, action: "create_raw_upload" });
  const response = await fetch(functionEndpoint("create-raw-upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  let data: { raw_upload?: RawUpload; error?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok || !data.raw_upload) {
    throw new ApiError(data.error || extra("extra3", response.status), {
      status: response.status,
      action: "create_raw_upload",
    });
  }
  return data.raw_upload;
}

export interface Interpretation {
  staged_rows?: number;
  diff?: { rows_before?: number; rows_after?: number; expected_after?: number };
  audit?: { status?: string; warnings?: unknown[] };
}

/**
 * Reads the file into rates for review. Reading it again archives the rates
 * it gave before; when some of those are approved, only an Administrador may.
 */
export const interpretUpload = (id: string, correctionNote = "") =>
  callFunction<Interpretation>("interpret-upload", "interpret_upload", { raw_upload_id: id, correction_note: correctionNote });

/**
 * The files, newest first; archived ones are left out. A few hundred today
 * (2026-09-28: 230), so one call brings them all.
 */
export async function listUploads() {
  const res = await callRatewareApi<{ rows?: RawUpload[]; total?: number }>("list_uploads", {
    status: "current",
    limit: 1000,
    offset: 0,
  });
  return { rows: res.rows ?? [], total: Number(res.total ?? 0) };
}

/**
 * A carrier's offer from the Bid Room, saved by the system as a file
 * (RFx…-carrier-bid-<id>.json) so it goes through the same review. Reading
 * it again or deleting it would touch the offer's rate, so those files are
 * only shown.
 */
export const isBidSnapshot = (u: RawUpload) =>
  /carrier-bid-[0-9a-f-]{36}\.json$/i.test(String(u.original_filename || u.filename || ""));

/** A link to the original file, valid 10 minutes. */
export async function sourceUrl(id: string) {
  const res = await callRatewareApi<{ url?: string }>("get_upload_source_url", { id });
  if (!res.url) throw new Error(extra("extra2"));
  return res.url;
}

/** Hides the file from the list; its rates stay as they are. */
export const archiveUpload = (id: string) =>
  callRatewareApi("archive_upload", { id, confirmed: true, confirmation_action: "archive_upload" });

/**
 * Deletes the file and every rate that came from it, approved ones included
 * (then only an Administrador may).
 */
export const removeUpload = (id: string) =>
  callRatewareApi("remove_upload", { id, confirmed: true, confirmation_action: "remove_upload" });
