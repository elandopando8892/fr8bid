import { callRatewareApi } from "@/lib/api-client";

/**
 * The contact review before inviting (wireframe 25).
 *
 * Not a batch: `record_rfx_invitation_wave_review` is one review per (event,
 * carrier). It stores who confirmed the contact, when, over which channel,
 * and a snapshot of what was checked, in saas_audit_log. Revoking writes a new
 * entry with `reviewed: false`; the latest entry per carrier is the state.
 */

export interface ContactSnapshot {
  vendor_name?: string | null;
  vendor_domain?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CarrierReview {
  vendor_id: string;
  reviewed: boolean;
  reviewed_at?: string;
  reviewed_by?: string;
  channel?: string | null;
  contact_snapshot?: ContactSnapshot;
}

/** The latest review of each carrier in the event. */
export async function listContactReviews(eventId: string): Promise<CarrierReview[]> {
  const res = await callRatewareApi<{ rows?: CarrierReview[] }>("list_rfx_invitation_wave_reviews", {
    rfx_event_id: eventId,
  });
  return res.rows ?? [];
}

export async function recordContactReview(input: {
  eventId: string;
  vendorId: string;
  reviewed: boolean;
  channel: string | null;
  snapshot: ContactSnapshot;
}): Promise<CarrierReview | null> {
  const res = await callRatewareApi<{ row?: CarrierReview }>("record_rfx_invitation_wave_review", {
    rfx_event_id: input.eventId,
    vendor_id: input.vendorId,
    reviewed: input.reviewed,
    channel: input.channel,
    contact_snapshot: input.snapshot,
  });
  return res.row ?? null;
}
