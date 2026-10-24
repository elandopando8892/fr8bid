import { words, extra } from "@/i18n/carrier-templates";
import { callRatewareApi, ApiError } from "@/lib/api-client";
import type { CarrierListTemplate } from "@/types/domain";

/**
 * Carrier list templates.
 *
 * These use the DEDICATED template API (`*_carrier_list_template*`), not the
 * generic vendor_segments actions: the dedicated handler owns lifecycle,
 * optimistic versioning and the idempotent materialisation into an RFx. It sits
 * behind the CARRIER_LIST_TEMPLATES_V2_ENABLED flag. Its effective value must
 * be verified in the target environment; this source does not prove activation.
 *
 * Contract notes taken from the deployed handler, not from guesswork:
 *  - the stored name column is `segment_name`;
 *  - EVERY write action (update/duplicate/archive/restore) requires
 *    `expected_version`, and answers 409 instead of overwriting;
 *  - `duplicate` also requires the new `name`;
 *  - writes require the `vendors:manage` permission in the caller's
 *    app_metadata, and every action requires an organization-scoped workspace.
 *
 * Membership is a static, de-duplicated set of vendor UUIDs from Carrier CRM.
 * Loading a template never creates carriers and never sends anything.
 */

export interface ListTemplatesFilters extends Record<string, unknown> {
  lifecycle_status?: "draft" | "active" | "archived";
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListTemplatesResult {
  rows: CarrierListTemplate[];
  total: number;
  has_more: boolean;
}

export async function listCarrierTemplates(
  filters: ListTemplatesFilters = {},
): Promise<ListTemplatesResult> {
  const res = await callRatewareApi<{
    rows?: CarrierListTemplate[];
    total?: number;
    has_more?: boolean;
  }>("list_carrier_list_templates", filters);
  return {
    rows: res.rows ?? [],
    total: res.total ?? res.rows?.length ?? 0,
    has_more: Boolean(res.has_more),
  };
}

/** Load every 200-row page. Never return a partial or overlapping catalog.
 * Bound requests so an inconsistent server cannot keep polling forever.
 */
export async function listAllCarrierTemplates(
  filters: Pick<ListTemplatesFilters, "lifecycle_status" | "search"> = {},
): Promise<ListTemplatesResult> {
  const rows: CarrierListTemplate[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  for (let page = 0; page < 50; page++) {
    const result = await listCarrierTemplates({ ...filters, limit: 200, offset: rows.length });
    if (!Number.isSafeInteger(result.total) || result.total < 0 ||
        (total !== undefined && result.total !== total)) throw new Error(extra("catalogChanged"));
    total = result.total;
    if (total > 10000) throw new Error(extra("catalogTooLarge"));
    for (const row of result.rows) {
      if (!row.id || ids.has(row.id)) throw new Error(extra("catalogChanged"));
      ids.add(row.id);
      rows.push(row);
    }
    if (!result.has_more) {
      if (rows.length !== total) throw new Error(extra("catalogChanged"));
      return { rows, total, has_more: false };
    }
    if (!result.rows.length || rows.length >= total) throw new Error(extra("catalogChanged"));
  }
  throw new Error(extra("catalogTooLarge"));
}

/**
 * `usage_context: "carrier_fit"` is not cosmetic: the backend writes a
 * `carrier_template.load_in_carrier_fit` audit entry when it is present, which
 * is how rateware traces where a materialisation came from.
 */
export async function getCarrierTemplate(
  id: string,
  usageContext?: "carrier_fit",
): Promise<CarrierListTemplate | null> {
  const res = await callRatewareApi<{ row?: CarrierListTemplate }>("get_carrier_list_template", {
    template_id: id,
    ...(usageContext ? { usage_context: usageContext } : {}),
  });
  const row = res.row ?? null;
  // A bookmarked URL can outlive an active template's place in the catalog.
  if (usageContext === "carrier_fit" && row && row.lifecycle_status !== "active") {
    throw new Error(extra("extra3"));
  }
  return row;
}

export interface SaveTemplateInput {
  segment_name: string;
  description?: string;
  vendor_ids: string[];
  lifecycle_status?: "draft" | "active";
}

export async function createCarrierTemplate(input: SaveTemplateInput) {
  return await callRatewareApi("create_carrier_list_template", {
    segment_name: input.segment_name,
    description: input.description ?? "",
    vendor_ids: dedupe(input.vendor_ids),
    lifecycle_status: input.lifecycle_status ?? "draft",
  });
}

/**
 * Lifecycle transitions have dedicated actions: `update` refuses to move a
 * template in or out of `archived`.
 */
export async function updateCarrierTemplate(
  id: string,
  expectedVersion: number,
  patch: Partial<SaveTemplateInput>,
) {
  return await callRatewareApi("update_carrier_list_template", {
    template_id: id,
    expected_version: expectedVersion,
    ...patch,
    ...(patch.vendor_ids ? { vendor_ids: dedupe(patch.vendor_ids) } : {}),
  });
}

/** The copy always starts as a fresh draft at version 1, under a new name. */
export async function duplicateCarrierTemplate(
  id: string,
  expectedVersion: number,
  name: string,
) {
  return await callRatewareApi("duplicate_carrier_list_template", {
    template_id: id,
    expected_version: expectedVersion,
    name,
  });
}

/** Archiving is reversible — there is no hard delete from the normal UI. */
export async function archiveCarrierTemplate(id: string, expectedVersion: number) {
  return await callRatewareApi("archive_carrier_list_template", {
    template_id: id,
    expected_version: expectedVersion,
  });
}

/** Restore refuses unless at least one member still exists in the organization. */
export async function restoreCarrierTemplate(id: string, expectedVersion: number) {
  return await callRatewareApi("restore_carrier_list_template", {
    template_id: id,
    expected_version: expectedVersion,
  });
}

/**
 * Resolves uploaded rows against Carrier CRM. READ-ONLY for vendors: it never
 * creates or edits a carrier, it only reports what each row points at.
 *
 * Identifier priority, from the deployed resolver: CRM UUID > USDOT or MC >
 * email > name. And one rule worth knowing: a single match found ONLY by name
 * is never auto-assigned — it comes back `ambiguous` with
 * `requires_manual_confirmation`, because two carriers can share a name.
 */
export type ResolutionStatus = "matched" | "ambiguous" | "not_found" | "duplicate";

export interface RowResolution {
  source_row_number: number;
  status: ResolutionStatus;
  reason: string;
  vendor_id: string | null;
  candidate_vendor_ids: string[];
  requires_manual_confirmation: boolean;
}

export interface ResolveResult {
  rows: RowResolution[];
  summary: { total: number; matched: number; ambiguous: number; not_found: number; duplicates: number };
}

export async function resolveCarrierTemplateRows(rows: unknown[]): Promise<ResolveResult> {
  const res = await callRatewareApi<Partial<ResolveResult>>("resolve_carrier_list_template_rows", { rows });
  return {
    rows: res.rows ?? [],
    summary: res.summary ?? { total: 0, matched: 0, ambiguous: 0, not_found: 0, duplicates: 0 },
  };
}

export const REASON_LABEL: Record<string, string> = {
  get workspace_uuid(){return words("word2");},
  unique_usdot: "USDOT",
  unique_mc: "MC",
  get unique_email(){return words("word3");},
  get name_candidate(){return words("word4");},
  get duplicate_vendor(){return words("word5");},
  get missing_identifier(){return words("word6");},
  get not_found_in_organization(){return words("word7");},
  get not_found(){return words("word8");},
};

/** Display name across the app: the column is `segment_name`. */
export function templateName(t: CarrierListTemplate): string {
  return (t.segment_name as string) || (t.name as string) || extra("extra0");
}

export function templateVersion(t: CarrierListTemplate): number {
  return Number(t.template_version) || 1;
}

export function memberCount(t: CarrierListTemplate): number {
  return Number(t.member_count ?? t.vendor_ids?.length ?? 0) || 0;
}

/**
 * Turns the backend's error codes into something an operator can act on. These
 * strings are the real ones the handler returns, so a new code shows up as the
 * raw message instead of being swallowed.
 */
export function explainTemplateError(err: unknown): string {
  const e = err as ApiError;
  const code = String(e?.code ?? "");
  const message = e?.message || String(err);
  // Several different conditions answer 409 (name taken, version moved,
  // template inactive...). Branch on the code, never on the status alone, or
  // a duplicate name gets reported as "someone else edited it".
  if (code === "template_name_conflict") {
    return extra("extra1");
  }
  if (code === "template_version_conflict") {
    return extra("extra2", message);
  }
  if (code === "carrier_template_inactive") {
    return extra("extra3");
  }
  if (code === "carrier_template_workspace_required") {
    return extra("extra4");
  }
  if (/vendors:manage/i.test(message)) {
    return extra("extra5");
  }
  if (/not enabled/i.test(message)) {
    return extra("extra6");
  }
  return message;
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}
