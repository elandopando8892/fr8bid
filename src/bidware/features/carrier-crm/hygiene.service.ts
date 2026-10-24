import { tr } from "@/i18n/carrier-crm";
import { callRatewareApi } from "@/lib/api-client";
import type { Vendor } from "@/types/domain";

/**
 * Carrier CRM hygiene: merging the same legal entity recorded twice.
 *
 * This is the one destructive write in the app. The RPC re-points roughly a
 * dozen related tables (rfx_lane_vendors, rfx_segment_confirmations,
 * rfx_ratebook_shares, vendor_whatsapp_contacts, scorecards, profile requests…)
 * onto the surviving vendor and then **hard-deletes the loser row**. There is
 * no undo.
 *
 * The backend guards it three ways, and the UI honours all three rather than
 * papering over them:
 *  1. dry run first — a call without `dry_run: false` only previews, and the
 *     preview is clamped to one group server-side;
 *  2. one record per call — a confirmed run merges exactly ONE duplicate, the
 *     first loser of the first group (migrations 20260805061000 and
 *     20260805063000, verified in prod 2026-09-29), however many the preview
 *     counts;
 *  3. a count guard — `preview_count` must equal the CURRENT
 *     `duplicates_to_remove`, so a set that changed since you looked refuses.
 */

export interface DuplicateGroup {
  canonical_vendor_id?: string;
  canonical_vendor_name?: string;
  normalized_name?: string;
  normalized_domain?: string;
  /** Why the backend picked this survivor. */
  selection_reason?: string;
  has_source_id?: boolean;
  linked_quote_evidence?: number;
  health_score?: number;
  merged_vendor_ids?: string[];
  duplicates_removed?: number;
}

export interface DuplicatePreview {
  dry_run?: boolean;
  /** Totals across the whole workspace, not just the previewed group. */
  duplicate_groups?: number;
  duplicates_to_remove?: number;
  priority?: string[];
  match_rule?: string;
  preview?: DuplicateGroup[];
  applied?: boolean;
}

export interface MergeResult extends DuplicatePreview {
  duplicates_removed?: number;
  canonical_vendors_kept?: number;
  remaining_duplicates?: number;
  complete?: boolean;
}

/** Read-only. Safe to call as often as you like. */
export async function previewDuplicates(): Promise<DuplicatePreview> {
  return await callRatewareApi<DuplicatePreview>("consolidate_exact_vendor_duplicates", {
    dry_run: true,
  });
}

/**
 * Merges ONE duplicate record into its survivor and deletes it.
 *
 * `previewCount` must be the `duplicates_to_remove` from a preview taken just
 * now — the server compares it against the live count and refuses when they
 * differ ("The duplicate set changed from X to Y"). That is the protection
 * against merging a set that someone edited while you were reading it.
 */
export async function mergeNextDuplicate(previewCount: number): Promise<MergeResult> {
  return await callRatewareApi<MergeResult>("consolidate_exact_vendor_duplicates", {
    dry_run: false,
    preview_count: previewCount,
    confirmed: true,
    confirmation_action: "consolidate_exact_vendor_duplicates",
  });
}

/** The backend's priority, in the team's words. */
const REASON_LABEL: Record<string, string> = {
  get "Apollo Source ID in Notes"() { return tr("text123"); },
  get "Most linked quotation evidence"() { return tr("text124"); },
  get "Linked quotation evidence"() { return tr("text125"); },
  get "Highest vendor health score"() { return tr("text126"); },
  get "Vendor health score"() { return tr("text127"); },
  get source_id() { return tr("text123"); },
  get quote_evidence() { return tr("text124"); },
  get health_score() { return tr("text126"); },
};

export function reasonLabel(reason?: string): string {
  if (!reason) return "—";
  return REASON_LABEL[reason] ?? reason;
}

const PRIORITY_LABEL: Record<string, string> = {
  get "Apollo Source ID in Notes"() { return tr("text128"); },
  get "Linked quotation evidence"() { return tr("text129"); },
  get "Vendor health score"() { return tr("text130"); },
};

export const priorityLabel = (step: string) => PRIORITY_LABEL[step] ?? step;

/*
 * The same rule, computed in the page so the whole list can be shown: the
 * preview only ever returns the next group. Mirrors
 * consolidate_exact_workspace_vendor_duplicates step by step; which record a
 * group keeps is still the backend's call, made when that group's turn comes.
 */

const GENERIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "icloud.com",
  "aol.com", "proton.me", "protonmail.com", "msn.com", "gmx.com", "mail.com",
]);
const ACCENTS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" };
/** Postgres btrim: spaces only. */
const btrim = (s: string) => s.replace(/^ +| +$/g, "");
const firstFilled = (...values: unknown[]) =>
  values.map((v) => (v == null ? "" : String(v))).find((v) => v !== "") ?? "";

export function exactNameOf(v: Vendor): string {
  return btrim(firstFilled(v.vendor_name, v.legal_name, v.name))
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ACCENTS[c])
    .replace(/[^a-z0-9]+/g, "");
}

export function exactDomainOf(v: Vendor): string {
  const source = firstFilled(v.domain) || String(v.primary_email ?? "").split("@")[1] || "";
  return btrim(source)
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .replace(/^www\./i, "");
}

/** The group a carrier falls in under the exact rule, or null when the rule can't apply. */
export function exactKeyOf(v: Vendor): string | null {
  const name = exactNameOf(v);
  const domain = exactDomainOf(v);
  if (!name || !domain || GENERIC_DOMAINS.has(domain)) return null;
  return `${name}|${domain}`;
}

export interface ExactGroup {
  key: string;
  domain: string;
  members: Vendor[];
}

export function exactGroups(vendors: Vendor[]): ExactGroup[] {
  const byKey = new Map<string, Vendor[]>();
  for (const v of vendors) {
    const key = exactKeyOf(v);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), v]);
  }
  return [...byKey.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({ key, domain: key.split("|")[1], members }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface ContactCluster {
  members: Vendor[];
  /** The contacts two or more of them share, as typed. */
  emails: string[];
  phones: string[];
}

const phoneKey = (raw: unknown) => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-10) : "";
};

/**
 * Carriers that share an email or a phone, linked transitively. Archived
 * carriers are left out (nobody invites them), and so are clusters that are
 * just one company typed twice: those belong to the exact rule above.
 */
export function contactClusters(vendors: Vendor[]): ContactCluster[] {
  const live = vendors.filter((v) => String(v.base_stage ?? "").toLowerCase() !== "archived");
  const parent = live.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstByContact = new Map<string, number>();
  live.forEach((v, i) => {
    const email = String(v.primary_email ?? "").trim().toLowerCase();
    const phone = phoneKey(v.whatsapp_phone);
    for (const key of [email && `e:${email}`, phone && `p:${phone}`]) {
      if (!key) continue;
      const seen = firstByContact.get(key);
      if (seen === undefined) firstByContact.set(key, i);
      else parent[find(i)] = find(seen);
    }
  });

  const byRoot = new Map<number, number[]>();
  live.forEach((_, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), i]));

  const clusters: ContactCluster[] = [];
  for (const indexes of byRoot.values()) {
    if (indexes.length < 2) continue;
    const members = indexes.map((i) => live[i]);
    const keys = new Set(members.map((v) => exactKeyOf(v) ?? v.id));
    if (keys.size < 2) continue;
    const count = (values: string[]) => {
      const seen = new Map<string, number>();
      for (const value of values) if (value) seen.set(value, (seen.get(value) ?? 0) + 1);
      return seen;
    };
    const emails = count(members.map((v) => String(v.primary_email ?? "").trim().toLowerCase()));
    const phones = count(members.map((v) => phoneKey(v.whatsapp_phone)));
    clusters.push({
      members,
      emails: [...emails].filter(([, n]) => n > 1).map(([e]) => e),
      phones: [...phones]
        .filter(([, n]) => n > 1)
        .map(([p]) => String(members.find((v) => phoneKey(v.whatsapp_phone) === p)?.whatsapp_phone ?? p)),
    });
  }
  return clusters.sort(
    (a, b) =>
      b.members.length - a.members.length ||
      String(a.members[0].vendor_name ?? "").localeCompare(String(b.members[0].vendor_name ?? "")),
  );
}

const MX_ENTITY = /\b(s\.?\s?a\.?\s?(p\.?\s?i\.?\s?)?de\s?c\.?\s?v|s\.?\s?de\s?r\.?\s?l|s\.?\s?a\.?\s?s)\b/i;
const US_ENTITY = /\b(llc|l\.l\.c|inc|corp|corporation|ltd)\b/i;
const numberWords = () => ["", tr("text131"), tr("text132"), tr("text133"), tr("text134"), tr("text135")];

/** One line on why these are different carriers, read off their names and domains. */
export function clusterReading(cluster: ContactCluster): string {
  const names = cluster.members.map((v) => firstFilled(v.vendor_name, v.legal_name, v.name));
  const domains = new Set(cluster.members.map(exactDomainOf).filter(Boolean));
  const normalized = new Set(cluster.members.map(exactNameOf));
  const n = cluster.members.length;
  if (names.some((x) => MX_ENTITY.test(x)) && names.some((x) => US_ENTITY.test(x))) {
    return tr("text136");
  }
  if (normalized.size === 1) return tr("text137");
  if (domains.size === n) {
    const word = numberWords()[n] ? numberWords()[n][0].toUpperCase() + numberWords()[n].slice(1) : String(n);
    return tr("text138", word, numberWords()[n] || n);
  }
  if (domains.size === 1) return tr("text139");
  return tr("text140");
}
