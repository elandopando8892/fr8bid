import { tr } from "@/i18n/carrier-crm";
import { callRatewareApi } from "@/lib/api-client";
import { env } from "@/config/env";
import type { Vendor } from "@/types/domain";

/**
 * Keeping a carrier reachable: the link it uses to update its own profile,
 * and the emails that bounced.
 */

/**
 * A new link for the carrier to fill in or update its profile
 * (/carrier-profile.html). Each call makes another one, valid 30 days;
 * `origin` points it at Bidware (rateware falls back to its own site).
 */
export async function createProfileLink(vendorId: string) {
  return await callRatewareApi<{ id: string; url: string; expires_at: string }>(
    "create_vendor_profile_request",
    { vendor_id: vendorId, expires_in_days: 30, origin: env.appOrigin },
  );
}

export interface Bounce {
  email: string;
  reason?: string | null;
  source?: string | null;
  detected_at?: string | null;
}

/** Carriers with an email that bounced and nobody replaced yet (tag email_bounce). */
export async function listBouncedVendors() {
  // The full row: the bounces live in profile_data, which the lightweight list leaves out.
  const res = await callRatewareApi<{ rows?: Vendor[] }>("list_vendors", { tag: "email_bounce", limit: 250 });
  return res.rows ?? [];
}

export function openBounces(vendor: Vendor): Bounce[] {
  const profile = vendor.profile_data as { bounced_emails?: unknown } | null | undefined;
  const list = Array.isArray(profile?.bounced_emails) ? profile.bounced_emails : [];
  return list.filter(
    (b): b is Bounce & { resolved_at?: string | null } =>
      Boolean(b && typeof b === "object" && (b as Bounce).email && !(b as { resolved_at?: unknown }).resolved_at),
  );
}

/** The mail server's diagnostic, in the team's words. */
export function bounceReason(reason?: string | null): string {
  const text = String(reason || "").toLowerCase();
  if (/dns|mx lookup|domain not found|no such domain/.test(text)) return tr("text104");
  if (/mailbox is full|quota|blocks limit|over quota/.test(text)) return tr("text105");
  if (
    /5\.1\.1|does not exist|doesn't exist|no such user|user unknown|not found|address rejected|mailbox unavailable|requested action not taken|tried to reach/.test(
      text,
    )
  )
    return tr("text106");
  return tr("text107");
}

/**
 * Puts the right address in place of the bounced one: it becomes the primary
 * email if the bounced one was, the bounce is marked resolved and the block
 * lifted, so the carrier can be invited again.
 */
export async function replaceBouncedEmail(
  vendorId: string,
  bouncedEmail: string,
  replacementEmail: string,
  operationId?: string,
): Promise<{ row: Vendor; cleanupWarning?: string }> {
  const res = await callRatewareApi<{ row: Vendor }>("replace_bounced_vendor_email", {
    id: vendorId,
    bounced_email: bouncedEmail.trim().toLowerCase(),
    replacement_email: replacementEmail.trim().toLowerCase(),
    operation_id: operationId ?? crypto.randomUUID(),
  });
  // Older servers can list the primary again among secondary emails.
  // Keep this compatibility cleanup; current servers exclude it themselves.
  const primary = String(res.row?.primary_email ?? "").toLowerCase();
  const others = (Array.isArray(res.row?.secondary_emails) ? res.row.secondary_emails : []).map((e) =>
    String(e).toLowerCase(),
  );
  if (primary && others.includes(primary)) {
    try {
      return await callRatewareApi<{ row: Vendor }>("update_vendor", {
        id: vendorId,
        patch: { secondary_emails: others.filter((e) => e !== primary) },
      });
    } catch (error) {
      // The replacement was acknowledged before this optional legacy cleanup.
      // Preserve that result so the operator does not repeat a resolved bounce.
      return { ...res, cleanupWarning: (error as Error).message || String(error) };
    }
  }
  return res;
}

export interface ContactPatch {
  contact_name?: string;
  primary_email?: string;
  whatsapp_phone?: string;
}

/**
 * Corrects a carrier's contact. Only the fields in `patch` are sent: an empty
 * field in update_vendor erases that column, so untouched ones stay out.
 */
export async function updateVendorContact(vendorId: string, patch: ContactPatch) {
  return await callRatewareApi<{ row: Vendor }>("update_vendor", { id: vendorId, patch });
}

/**
 * Reads the last 45 days of delivery-failure notices in the sending Gmail
 * (sales@) and records the new bounces. It also takes a bounced address off
 * the carrier's contacts ("cleaned").
 */
export async function syncGmailBounces() {
  return await callRatewareApi<{ scanned?: number; detected?: number; blocked?: number; cleaned_vendors?: number }>(
    "sync_gmail_bounces",
    { limit: 50 },
  );
}
