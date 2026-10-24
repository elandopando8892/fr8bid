import { env } from "@/config/env";
import { ApiError, callRatewareApi } from "@/lib/api-client";
import { tr } from "@/i18n/rfx-admin";
import type { RfxEvent, RfxLane, RfxBid } from "@/types/domain";

/**
 * Admin RFx / procurement service. Every call hits the shared rateware-api
 * Edge Function, so events, lanes, invitations, bids and awards created here
 * are the same rows rateware operates on.
 */

export async function listRfxEvents(): Promise<RfxEvent[]> {
  const res = await callRatewareApi<{ rows: RfxEvent[] }>("list_rfx_events");
  return res.rows ?? [];
}

export async function createRfxEvent(event: Partial<RfxEvent>): Promise<RfxEvent> {
  const res = await callRatewareApi<{ row: RfxEvent }>("create_rfx_event", { event });
  return res.row;
}

/**
 * Status-only archive with an audit entry. Preferred over update_rfx_event,
 * which also re-syncs the event's Ratebook package on every call.
 */
export async function archiveRfxEvent(id: string): Promise<RfxEvent> {
  const res = await callRatewareApi<{ row: RfxEvent }>("archive_rfx_event", {
    id,
    confirmed: true,
    confirmation_action: "archive_rfx_event",
  });
  return res.row;
}

/**
 * Deletes the event for good (an Administrador's). The database takes its
 * lanes, invitations (with their offers and awards) and chat along; messages,
 * campaigns, contact history, quotes and Ratebooks stay, no longer linked to
 * it. Rates already in the rate base are not touched.
 */
export async function deleteRfxEvent(id: string) {
  return await callRatewareApi<{ removed: { id: string; rfx_id?: string | null; name?: string | null } }>(
    "delete_rfx_event",
    { id, confirmed: true, confirmation_action: "delete_rfx_event" },
  );
}

export async function updateRfxEvent(id: string, patch: Partial<RfxEvent>): Promise<RfxEvent> {
  const res = await callRatewareApi<{ row: RfxEvent }>("update_rfx_event", { id, patch });
  return res.row;
}

export interface RfxDetail {
  event?: RfxEvent;
  lanes?: RfxLane[];
  bids?: RfxBid[];
  [key: string]: unknown;
}

export async function fetchRfxDetail(eventId: string): Promise<RfxDetail> {
  return await callRatewareApi<RfxDetail>("list_rfx_detail", { event_id: eventId });
}

/**
 * The event's latest contact history, every channel, newest first. Each bid a
 * carrier sends from its Bid Room leaves a "portal" row there with the offer
 * it replaced, which is how Operate tells what moved in the last minutes.
 */
export async function listEventHistory(eventId: string, limit = 300): Promise<Record<string, unknown>[]> {
  const res = await callRatewareApi<{ rows?: Record<string, unknown>[] }>("list_contact_history", {
    rfx_event_id: eventId,
    limit,
  });
  return res.rows ?? [];
}

export async function importRfxLanes(eventId: string, rows: Partial<RfxLane>[]) {
  return await callRatewareApi("import_rfx_lanes", {
    event_id: eventId,
    rows,
    append_only: true,
  });
}

export async function shortlistRfxLaneVendors(laneId: string, vendorIds: string[]) {
  return await callRatewareApi("shortlist_rfx_lane_vendors", {
    lane_id: laneId,
    vendor_ids: vendorIds,
  });
}

/** Human gate: admin explicitly authorizes carrier invitations. */
export async function inviteRfxLaneVendors(ids: string[]) {
  return await callRatewareApi("invite_rfx_lane_vendors", {
    ids,
    confirmed: true,
    confirmation_action: "invite_rfx_lane_vendors",
  });
}

/**
 * Corrects a lane (update_rfx_lane): only the fields sent change, and origin
 * and destination can't end empty. The server re-syncs the event's Ratebook.
 */
export async function updateRfxLane(id: string, patch: Record<string, unknown>) {
  return (await callRatewareApi<{ row: RfxLane }>("update_rfx_lane", { id, patch })).row;
}

export interface ManualBid {
  bid_rate: number;
  currency: string;
  weekly_capacity: number | null;
  transit_days: number | null;
  valid_through: string | null;
  notes: string | null;
  /** Where the carrier sent it: email, phone, whatsapp or other. */
  manual_source_channel: string;
  source_note: string | null;
}

/**
 * A bid a carrier sent outside its Bid Room. update_rfx_bid rewrites the whole
 * bid (capacity, transit, notes and currency included), so every field goes.
 */
export async function captureManualBid(invitationId: string, bid: ManualBid) {
  const res = await callRatewareApi<{ row: RfxBid }>("update_rfx_bid", {
    id: invitationId,
    patch: { ...bid, capture_source: "manual_operator" },
  });
  return res.row;
}

/** Declines a carrier's bid; the server refuses a bid awarded as primary or backup. */
export async function rejectRfxBid(invitationId: string, reason: string) {
  return await callRatewareApi("reject_rfx_bid", { id: invitationId, reason });
}

/**
 * Prepares a question in Delivery Queue, with the Bidware link. It never sends;
 * a backend without the draft action rejects it before any delivery. No send fallback.
 */
export async function draftCarrierQuestion(input: {
  eventId: string;
  invitationId: string;
  laneId: string;
  body: string;
  requestKey: string;
  operationId: string;
}) {
  try {
    return await callRatewareApi<{ draft_only: boolean; outreach_message: { id: string; status: string }; reused: boolean }>("draft_bid_room_carrier_message", {
      rfx_event_id: input.eventId,
      rfx_lane_vendor_id: input.invitationId,
      rfx_lane_id: input.laneId,
      body: input.body,
      idempotency_key: input.requestKey,
      app_origin: env.appOrigin,
      confirmed: true,
      confirmation_action: "draft_bid_room_carrier_message",
      operation_id: input.operationId,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400 && /unknown action/i.test(error.message)) {
      error.message = tr("questionBackendUnavailable");
    }
    throw error;
  }
}
