/** Review transport for the unmodified ChatGPT Python classifier. No classification rules or writes. */
import type { CarrierListTemplate } from "@/types/domain";
import { listAllCarrierTemplates } from "./templates.service";

export const MODULE_VERSION = "bidware-carrier-evidence/1.0.1-hostQA";
export const MODULE_SHA256 = "fa9ad952f97dc10b3e1e717ac1638392898b51b8d6c2763b77e2e7e35d6ee9d4";
export const TEMPLATE_NAMES = [
  ...["Intramex", "MX Northbound & Southbound", "D2D Crossborder", "US Northbound & Southbound"].flatMap(
    env => ["Dry Van", "Flatbed", "Reefer", "Hazmat", "Small Trucks"].map(family => `${env} - ${family}`)),
  ...["Chassis", "Dry Van", "Flatbed", "Reefer", "Hazmat"].map(family => `MX Port Drayage - ${family}`),
];
export const MAX_REVIEW_BYTES = 16 * 1024 * 1024;
export const REVIEW_TTL_MS = 5 * 60 * 1000;
export interface CutTemplate { template_id: string; name: string; org_id: string; version: number; vendor_ids: string[] }
export interface EvidenceCut {
  snapshot_format: "bidware-carrier-cut/1"; snapshot_id: string; captured_at: string;
  org_id: string; membership_version: string; templates: CutTemplate[]; outside_scope: number;
}
export interface PlanEntry {
  vendor_id: string; status: string; action: string; reason_codes: string[]; restrictions: string[];
  source_refs: { ref_id: string; kind: string; source: string; locator: string }[];
}
export interface PlanTemplate {
  template: string; template_id: string; template_version: number; before_vendor_ids: string[];
  proposed_additions: PlanEntry[]; proposed_removals: PlanEntry[]; pending_keeps: PlanEntry[]; held_candidates: PlanEntry[];
  after_vendor_ids_if_all_approved: string[]; removals_are_proposals_only: true;
}
export interface ReviewBundle {
  review_version: string;
  plan: { plan_version: string; module_version: string; org_id: string; snapshot_id: string; membership_version: string;
    membership_hash: string; catalog_version: string; input_hash: string; plan_hash: string; preview_only: boolean;
    auto_apply: boolean; requires_human_review: boolean; status: string; blockers: { code: string; ref: string }[]; templates: PlanTemplate[] };
  audit: { module_version: string; org_id: string; membership_version: string; membership_hash: string; catalog_version: string;
    input_hash: string; catalog_approval_ref: string | null; production_certified: boolean; evidence_scope: string;
    blockers: { code: string; ref: string }[]; summary: { pairs_evaluated: number; by_status: Record<string, number> } };
  receipt: { module_sha256: string; source_file_sha256: string; plan_hash: string; audit_hash: string; input_hash: string;
    preview_only: boolean; changes_applied: number; snapshot_bound: boolean };
}

const reject = (): never => { throw new Error("REVIEW_INVALID"); };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string" && x.length > 0);
const unique = (v: string[]) => new Set(v).size === v.length;
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
// Python orders Unicode by code point. JS's default UTF-16 order differs for astral characters.
function compare(a: string, b: string): number {
  const aa = Array.from(a, c => c.codePointAt(0)!), bb = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
}
export function canonicalJSON(value: unknown, depth = 0): string {
  if (depth > 40) return reject();
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(v => canonicalJSON(v, depth + 1)).sort(compare).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort(compare).map(k => `${JSON.stringify(k)}:${canonicalJSON(value[k], depth + 1)}`).join(",")}}`;
  return reject();
}
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJSON(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2, "0")).join("");
}
export async function makeCut(rows: CarrierListTemplate[], orgId: string, now = new Date()): Promise<EvidenceCut> {
  if (!orgId || rows.some(r => r.organization_id !== orgId)) throw new Error("REVIEW_ORGANIZATION");
  const selected = rows.filter(r => TEMPLATE_NAMES.includes(String(r.segment_name)));
  if (selected.length !== 25 || !unique(selected.map(r => String(r.segment_name)))) throw new Error("REVIEW_TAXONOMY");
  const templates = selected.map(r => {
    if (!r.id || !Number.isSafeInteger(r.template_version) || Number(r.template_version) < 1 ||
        !strings(r.vendor_ids) || !unique(r.vendor_ids) || r.lifecycle_status === "archived" ||
        (r.member_count !== undefined && r.member_count !== r.vendor_ids.length)) return reject();
    return { template_id: r.id, name: r.segment_name!, org_id: orgId, version: r.template_version!, vendor_ids: [...r.vendor_ids].sort() };
  });
  if (!unique(templates.map(t => t.template_id))) return reject();
  const membershipHash = await digest({ org_id: orgId, templates });
  return { snapshot_format: "bidware-carrier-cut/1", snapshot_id: `bidware:${now.toISOString()}:${membershipHash}`,
    captured_at: now.toISOString(), org_id: orgId, membership_version: `sha256:${membershipHash}`, templates,
    outside_scope: rows.filter(r => !TEMPLATE_NAMES.includes(String(r.segment_name)) && r.lifecycle_status !== "archived").length };
}
export async function readCurrentCut(orgId: string): Promise<EvidenceCut> {
  return makeCut((await listAllCarrierTemplates()).rows, orgId);
}
export async function parseReview(text: string): Promise<ReviewBundle> {
  if (new TextEncoder().encode(text).length > MAX_REVIEW_BYTES) throw new Error("REVIEW_SIZE");
  const b = JSON.parse(text);
  if (!object(b) || b.review_version !== "bidware-carrier-review/1" || !object(b.plan) || !object(b.audit) || !object(b.receipt)) return reject();
  const p = b.plan, a = b.audit, r = b.receipt;
  if (p.plan_version !== "bidware-carrier-plan/1" || p.module_version !== MODULE_VERSION || a.module_version !== MODULE_VERSION ||
      r.module_sha256 !== MODULE_SHA256 || !hash(r.source_file_sha256) || r.snapshot_bound !== true ||
      p.preview_only !== true || p.auto_apply !== false || p.requires_human_review !== true ||
      r.preview_only !== true || r.changes_applied !== 0 || a.production_certified !== false ||
      a.evidence_scope !== "host_supplied_input_only" || !["ready_for_host_review", "blocked"].includes(String(p.status))) return reject();
  for (const key of ["org_id", "membership_version", "membership_hash", "catalog_version", "input_hash"]) {
    if (typeof p[key] !== "string" || !p[key] || a[key] !== p[key]) return reject();
  }
  if (!hash(p.plan_hash) || !hash(p.membership_hash) || !hash(p.input_hash) || p.plan_hash !== r.plan_hash || p.input_hash !== r.input_hash) return reject();
  const { plan_hash: ignored, ...planBody } = p; void ignored;
  if (await digest(planBody) !== p.plan_hash || await digest(a) !== r.audit_hash) return reject();
  if (!Array.isArray(p.blockers) || !Array.isArray(a.blockers) || canonicalJSON(p.blockers) !== canonicalJSON(a.blockers) ||
      p.blockers.some(v => !object(v) || typeof v.code !== "string" || typeof v.ref !== "string")) return reject();
  if (!object(a.summary) || !Number.isSafeInteger(a.summary.pairs_evaluated) || !object(a.summary.by_status) ||
      Object.values(a.summary.by_status).some(n => !Number.isSafeInteger(n) || Number(n) < 0)) return reject();
  if (!Array.isArray(p.templates)) return reject();
  if (p.status === "blocked") {
    if (!p.blockers.length || p.templates.length) return reject();
  } else {
    if (p.blockers.length || p.templates.length !== 25 || typeof a.catalog_approval_ref !== "string" || !a.catalog_approval_ref.trim()) return reject();
    const names: string[] = [], ids: string[] = [];
    for (const t of p.templates) {
      if (!object(t) || typeof t.template !== "string" || !TEMPLATE_NAMES.includes(t.template) ||
          typeof t.template_id !== "string" || !t.template_id || !Number.isSafeInteger(t.template_version) ||
          !strings(t.before_vendor_ids) || !unique(t.before_vendor_ids) || !strings(t.after_vendor_ids_if_all_approved) ||
          !unique(t.after_vendor_ids_if_all_approved) || t.removals_are_proposals_only !== true) return reject();
      names.push(t.template); ids.push(t.template_id);
      for (const key of ["proposed_additions", "proposed_removals", "pending_keeps", "held_candidates"]) {
        const entries = t[key];
        if (!Array.isArray(entries) || entries.some(e => !object(e) || typeof e.vendor_id !== "string" || !e.vendor_id ||
          !["apta", "insuficiente", "contradicha"].includes(String(e.status)) || !strings(e.reason_codes) || !strings(e.restrictions) ||
          !Array.isArray(e.source_refs) || e.source_refs.some(s => !object(s) || ["ref_id", "kind", "source", "locator"].some(k => typeof s[k] !== "string")))) return reject();
      }
    }
    if (!unique(names) || !unique(ids)) return reject();
  }
  return b as unknown as ReviewBundle;
}
/** Integrity is not a signature or approval. Evidence/catalog provenance remains user supplied. */
export async function verifyAgainstCut(bundle: ReviewBundle, cut: EvidenceCut): Promise<void> {
  const p = bundle.plan;
  if (p.org_id !== cut.org_id) throw new Error("REVIEW_ORGANIZATION");
  if (p.membership_version !== cut.membership_version || p.membership_hash !== cut.membership_version.slice(7)) throw new Error("REVIEW_CHANGED");
  if (p.status === "ready_for_host_review") {
    const templates = p.templates.map(t => ({ name: t.template, template_id: t.template_id, org_id: p.org_id,
      version: t.template_version, vendor_ids: t.before_vendor_ids }));
    if (await digest({ org_id: p.org_id, templates }) !== p.membership_hash) throw new Error("REVIEW_CHANGED");
  }
}
export function downloadJSON(name: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
