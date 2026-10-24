import { tr } from "@/i18n/carrier-fit";
import type { Vendor } from "@/types/domain";

/**
 * Pure sourcing rules for Carrier Fit: who may be invited, and who is the same
 * carrier twice. No I/O, so these can be exercised directly against a dump of
 * real Carrier CRM rows.
 */

/**
 * Client-side mirror of the backend's eligibility rule, used only to warn before
 * writing. The server re-evaluates it and is the authority — a carrier that
 * looks eligible here can still come back `rejected`.
 *
 * This list must match what is DEPLOYED, not what is merged. `inactive` is
 * deliberately absent: it only means "not activated in the TMS", which never
 * stopped a carrier from bidding. rateware-api v637 stopped rejecting it, and
 * this mirror was flipped in the same pass.
 */
const BLOCKING_STATUS = ["blocked", "archived", "deleted"];

export type Eligibility = { ok: boolean; reason?: string; label: string };

export function previewEligibility(v: Vendor | undefined): Eligibility {
  if (!v?.id) return { ok: false, reason: "unavailable", label: tr("text069") };
  const status = String(v.status || "").toLowerCase();
  if (BLOCKING_STATUS.includes(status)) {
    return { ok: false, reason: `status_${status}`, label: tr("text070", status) };
  }
  if (String(v.base_stage || "").toLowerCase() === "archived") {
    return { ok: false, reason: "base_stage_archived", label: tr("text071") };
  }
  if (!hasUsableContact(v)) {
    return { ok: false, reason: "missing_contact", label: tr("text072") };
  }
  return { ok: true, label: tr("text056") };
}

/** A carrier that left the CRM (archived or deleted): it never goes into a template or an event. */
export function isRetired(v: Vendor): boolean {
  const status = String(v.status || "").toLowerCase();
  return status === "archived" || status === "deleted" || String(v.base_stage || "").toLowerCase() === "archived";
}

function hasUsableContact(v: Vendor): boolean {
  const secondary = Array.isArray(v.secondary_emails) ? v.secondary_emails : [];
  return Boolean(
    String(v.primary_email || "").trim() ||
      secondary.some((e) => String(e || "").trim()) ||
      String(v.whatsapp_phone || "").trim(),
  );
}

/* ------------------------------------------------------------------ *
 * Duplicate carriers
 *
 * A duplicate is the SAME legal entity recorded twice — nothing looser.
 * Different razones sociales are different carriers even when they look
 * related: `TA LOGISTICS INC` and `TRANSPORTES AMERICANOS` are a US and a
 * Mexican company that share one commercial contact, and both must be invited
 * on their own.
 *
 * A shared contact proves nothing at all: in this CRM 41 groups share a
 * `primary_email` (85 rows). An earlier version of this guard grouped on
 * contact, and on the active template it flagged 4 pairs and would have
 * dropped 3 legitimate carriers from a bid.
 *
 * So the rule matches the backend's `consolidate_exact_workspace_vendor_
 * duplicates`: normalized name AND normalized domain, both present. Exact.
 * ------------------------------------------------------------------ */

export interface DuplicateInfo {
  /** The twin kept selected by default; undefined when this row IS the keeper. */
  redundantOf?: string;
  twinIds: string[];
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Mirrors the backend's accent folding and punctuation stripping. */
function nameKey(v: Vendor): string {
  const raw = norm(v.vendor_name || v.legal_name || v.name);
  return raw
    .replace(/[áéíóúüñ]/g, (c) => "aeiouun"["áéíóúüñ".indexOf(c)])
    .replace(/[^a-z0-9]+/g, "");
}

/** Domain, falling back to the primary email's domain, like the backend. */
function domainKey(v: Vendor): string {
  const raw = norm(v.domain) || norm(v.primary_email).split("@")[1] || "";
  return raw.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
}

/**
 * Picks which twin stays selected: an activated carrier first, then the most
 * recently updated, then the lowest id so the choice never flickers.
 */
function keeperFirst(a: Vendor, b: Vendor): number {
  const rank = (v: Vendor) => (norm(v.status) === "active" ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const t = (v: Vendor) => String(v.updated_at ?? "");
  if (t(a) !== t(b)) return t(a) < t(b) ? 1 : -1;
  return a.id < b.id ? -1 : 1;
}

export function detectDuplicates(vendors: Vendor[]): Map<string, DuplicateInfo> {
  const buckets = new Map<string, Vendor[]>();
  for (const v of vendors) {
    const name = nameKey(v);
    const domain = domainKey(v);
    // Both parts required: a missing domain must never collapse two carriers.
    if (!name || !domain) continue;
    const key = `${name}@${domain}`;
    buckets.set(key, [...(buckets.get(key) ?? []), v]);
  }

  const out = new Map<string, DuplicateInfo>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const ordered = [...list].sort(keeperFirst);
    for (const v of ordered) {
      out.set(v.id, {
        redundantOf: v.id === ordered[0].id ? undefined : ordered[0].id,
        twinIds: ordered.filter((o) => o.id !== v.id).map((o) => o.id),
      });
    }
  }
  return out;
}

/**
 * Carriers reachable at the same address. Informational only: it never changes
 * the selection, because one contact legitimately represents several carriers.
 */
export function sharedContactGroups(vendors: Vendor[]): Map<string, string[]> {
  const buckets = new Map<string, Vendor[]>();
  for (const v of vendors) {
    const key = norm(v.primary_email);
    if (!key) continue;
    buckets.set(key, [...(buckets.get(key) ?? []), v]);
  }
  const out = new Map<string, string[]>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (const v of list) out.set(v.id, list.filter((o) => o.id !== v.id).map((o) => o.id));
  }
  return out;
}

/** The ids to pre-select: eligible, minus the redundant half of an exact pair. */
export function defaultSelection(
  memberIds: string[],
  vendorById: Map<string, Vendor>,
  duplicates: Map<string, DuplicateInfo>,
): string[] {
  return memberIds.filter((id) => {
    if (!previewEligibility(vendorById.get(id)).ok) return false;
    return !duplicates.get(id)?.redundantOf;
  });
}
