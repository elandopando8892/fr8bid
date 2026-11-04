/** Documentary batch reader. Does not classify, approve or write memberships. */
import type { CarrierListTemplate } from "@/types/domain";
import { MAX_REVIEW_BYTES, REVIEW_TTL_MS } from "./evidence-review";

export const BATCH_GROUPS = ["A", "B", "C", "D", "E", "F"] as const;
export type BatchGroup = typeof BATCH_GROUPS[number];
export interface BatchSource { file: string; sha256: string; locator: string; date: string }
export interface BatchRow {
  id: string; proposalId: string; batch: string; additional: boolean; vendorId: string; carrier: string;
  sourceId: string; sourceName: string; sourceVersion: number; sourceLifecycle: string;
  proposedName: string; group: BatchGroup; crmStatus: string; date: string;
  scope: string; restrictions: string; sources: BatchSource[];
}
export interface BatchReview {
  manifestHash: string; reviewedOn: string; declaredOrganization: string | null;
  rows: BatchRow[]; otherRelations: number;
}
export interface BatchCatalog {
  organizationId: string; templates: CarrierListTemplate[]; checkedAt: number;
}
export interface BatchTarget { id: string; version: number }
export type DestinationStatus = "unmapped" | "missing" | "archived" | "draft" | "changed" | "name_mismatch" | "current";

const fail = (code = "BATCH_INVALID"): never => { throw new Error(code); };
const obj = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const str = (v: unknown, max = 20000): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
// Rateware organization_id is an opaque text key (including org_...), not a UUID.
// Format checks never grant scope: the authenticated session and every row must match exactly.
const organizationKey = (v: unknown): v is string => str(v, 200) && /^[a-z\d][a-z\d_-]*$/i.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{64}$/.test(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const date = (v: unknown): v is string => typeof v === "string" && (v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v));
const unique = (xs: string[]) => new Set(xs).size === xs.length;

/** This accepts the documentary preparation format, never the legacy classifier plan.
 * A file hash/organization declaration is provenance, not authentication or approval.
 * Unknown fields are not promoted into execution instructions or rendered as HTML.
 */
export function parseBatchReview(text: string): BatchReview {
  if (new TextEncoder().encode(text).length > MAX_REVIEW_BYTES) fail("BATCH_SIZE");
  let b: unknown;
  try { b = JSON.parse(text); } catch { return fail(); }
  if (!obj(b) || b.artifact_format !== "bidware-engine-review-preparation/1" ||
      b.artifact_kind !== "documentary_mockup_not_product_contract" || b.authority !== "preparation_only" ||
      b.current_catalog_verified !== false || b.production_changes !== 0 || b.provider_requests !== 0 ||
      !hash(b.source_packet_manifest_sha256) || !date(b.source_review_date) || !b.source_review_date ||
      (b.organization_id !== null && !organizationKey(b.organization_id)) || !obj(b.summary) ||
      !Array.isArray(b.rows) || !b.rows.length || b.rows.length > 5000 || !Array.isArray(b.groups)) return fail();
  let sourceCount = 0;
  const rows = b.rows.map((r): BatchRow => {
    if (!obj(r) || !str(r.source_proposal_id, 160) || r.review_row_id !== `${b.source_packet_manifest_sha256}:${r.source_proposal_id}` ||
        !str(r.batch, 80) || typeof r.outside_L1 !== "boolean" || r.outside_L1 !== (r.batch !== "L1") ||
        !uuid(r.vendor_id) || !str(r.carrier, 500) || !uuid(r.source_template_id) || !str(r.source_template_name, 500) ||
        !count(r.source_template_version) || r.source_template_version < 1 ||
        !["draft", "active", "archived"].includes(String(r.source_template_lifecycle)) ||
        !str(r.proposed_template_name, 500) || r.target_template_id !== null ||
        !BATCH_GROUPS.includes(r.group as BatchGroup) || !str(r.crm_status_at_source_cut, 80) || !date(r.last_source_date) ||
        !str(r.evidence_scope) || !str(r.restrictions) || !Array.isArray(r.source_refs) || !r.source_refs.length ||
        r.source_refs.length > 2000 || r.applied !== false || r.approved !== false || r.invitation_authorized !== false ||
        r.current_availability_verified !== false) return fail();
    sourceCount += r.source_refs.length;
    if (sourceCount > 20000) return fail("BATCH_SIZE");
    const sources = r.source_refs.map((s): BatchSource => {
      if (!obj(s) || !str(s.file, 1500) || !hash(s.sha256) || !str(s.locator, 2000) || !date(s.date)) return fail();
      return { file: s.file, sha256: s.sha256, locator: s.locator, date: s.date };
    });
    return { id: String(r.review_row_id), proposalId: r.source_proposal_id, batch: r.batch, additional: r.outside_L1,
      vendorId: r.vendor_id, carrier: r.carrier, sourceId: r.source_template_id, sourceName: r.source_template_name,
      sourceVersion: r.source_template_version, sourceLifecycle: String(r.source_template_lifecycle), proposedName: r.proposed_template_name,
      group: r.group as BatchGroup, crmStatus: r.crm_status_at_source_cut, date: r.last_source_date,
      scope: r.evidence_scope, restrictions: r.restrictions, sources };
  });
  if (!unique(rows.map(r => r.id)) || !unique(rows.map(r => `${r.sourceId}:${r.vendorId}`))) fail("BATCH_DUPLICATE");
  const stats = batchCounts(rows), s = b.summary;
  const expected = { L1_relations: stats.primary, L1_carriers: stats.carriers, proposals: stats.groups.A,
    proposed_templates: new Set(rows.filter(r => r.group === "A").map(r => r.proposedName)).size,
    historical: stats.groups.B, exceptions: stats.exceptions, additional_L3: stats.additional };
  if (Object.entries(expected).some(([k, v]) => s[k] !== v) || !count(s.other_relations_not_reviewed) ||
      rows.some(r => r.additional && (r.batch !== "L3" || r.group !== "A"))) return fail();
  if (b.groups.length !== BATCH_GROUPS.length || !unique(b.groups.map(g => obj(g) ? String(g.code) : ""))) return fail();
  for (const group of b.groups) {
    if (!obj(group) || !BATCH_GROUPS.includes(group.code as BatchGroup)) return fail();
    const members = rows.filter(r => r.group === group.code);
    if (group.count !== members.length || group.l1_count !== members.filter(r => !r.additional).length ||
        group.additional_count !== members.filter(r => r.additional).length || !Array.isArray(group.review_row_ids) ||
        group.review_row_ids.length !== members.length || !unique(group.review_row_ids as string[]) ||
        group.review_row_ids.some(id => !members.some(r => r.id === id))) return fail();
  }
  return { manifestHash: b.source_packet_manifest_sha256, reviewedOn: b.source_review_date,
    declaredOrganization: b.organization_id as string | null, rows, otherRelations: s.other_relations_not_reviewed };
}

export function batchCounts(rows: BatchRow[]) {
  const groups = Object.fromEntries(BATCH_GROUPS.map(g => [g, rows.filter(r => r.group === g).length])) as Record<BatchGroup, number>;
  return { groups, primary: rows.filter(r => !r.additional).length, additional: rows.filter(r => r.additional).length,
    carriers: new Set(rows.filter(r => !r.additional).map(r => r.vendorId)).size,
    exceptions: rows.filter(r => !r.additional && !["A", "B"].includes(r.group)).length };
}

/** Bind scope through records returned by the authenticated API, not by filling
 * a missing organization field with the caller's organization. Every origin and
 * vendor membership must be present in that scope before any file row is shown.
 */
export function validateBatchCatalog(batch: BatchReview, organizationId: string, templates: CarrierListTemplate[], checkedAt = Date.now()): BatchCatalog {
  if (!organizationKey(organizationId) || (batch.declaredOrganization !== null && batch.declaredOrganization !== organizationId) ||
      templates.some(t => t.organization_id !== organizationId)) fail("BATCH_ORGANIZATION");
  if (!unique(templates.map(t => t.id)) || templates.some(t => !uuid(t.id) || !str(t.segment_name, 500) ||
      !count(t.template_version) || t.template_version < 1 || !["active", "draft", "archived"].includes(String(t.lifecycle_status)) ||
      !Array.isArray(t.vendor_ids) || !t.vendor_ids.every(uuid) || !unique(t.vendor_ids) ||
      (t.member_count !== undefined && t.member_count !== t.vendor_ids.length))) fail("BATCH_CATALOG");
  const sources = new Map(templates.map(t => [t.id, t]));
  if (batch.rows.some(r => !sources.get(r.sourceId)?.vendor_ids?.includes(r.vendorId))) fail("BATCH_SCOPE");
  return { organizationId, templates, checkedAt };
}

export function batchIsCurrent(catalog: BatchCatalog | null, organizationId: string, now: number) {
  return Boolean(catalog && catalog.organizationId === organizationId && now >= catalog.checkedAt && now - catalog.checkedAt < REVIEW_TTL_MS);
}

export function destinationStatus(name: string, target: BatchTarget | undefined, catalog: BatchCatalog): DestinationStatus {
  if (!target) return "unmapped";
  const t = catalog.templates.find(t => t.id === target.id);
  if (!t) return "missing";
  if (t.lifecycle_status === "archived") return "archived";
  if (t.template_version !== target.version) return "changed";
  if (t.segment_name !== name) return "name_mismatch";
  return t.lifecycle_status === "active" ? "current" : "draft";
}

export function filterBatchRows(batch: BatchReview, group: BatchGroup, template: string, search: string): BatchRow[] {
  const needle = search.trim().toLocaleLowerCase();
  return batch.rows.filter(r => r.group === group && (!template || r.proposedName === template) &&
    `${r.carrier} ${r.proposalId} ${r.proposedName}`.toLocaleLowerCase().includes(needle));
}
