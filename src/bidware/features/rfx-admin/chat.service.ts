import { tr } from "@/i18n/rfx-admin";
import { callRatewareApi } from "@/lib/api-client";

/**
 * An event's conversations, as rateware's Bid Room keeps them. There are three
 * kinds of thread, and who reads them matters:
 * - event_group: every carrier invited to the event;
 * - lane_group: every carrier of that lane;
 * - carrier_private: only that carrier.
 * The team's side (status, assignment, internal note) never reaches carriers
 * (rfx-bid-api answers them through its carrier chat view).
 */
export type ThreadType = "event_group" | "lane_group" | "carrier_private";

export interface ChatMessage {
  id: string;
  created_at: string;
  thread_id: string;
  sender_role: string | null;
  sender_name: string | null;
  body: string | null;
  vendors?: { vendor_name?: string | null } | null;
  google_chat_sync_status?: string | null;
  google_chat_sender_name?: string | null;
}

export interface ChatThread {
  id: string;
  thread_type: ThreadType;
  title: string | null;
  rfx_lane_id: string | null;
  vendor_id: string | null;
  communication_status: string | null;
  read_status: string | null;
  needs_reply: boolean | null;
  assigned_to: string | null;
  internal_note: string | null;
  updated_at: string | null;
  last_action_at?: string | null;
  vendors?: { vendor_name?: string | null; domain?: string | null } | null;
  rfx_lanes?: { lane_number?: number | null; origin?: string | null; destination?: string | null } | null;
  messages: ChatMessage[];
}

export interface EventChat {
  rows: ChatThread[];
  google_chat_configured: boolean;
  messages_limited?: boolean;
}

/**
 * Who wrote a message. The team's messages carry the workspace key when no
 * name was given, and the ones mirrored from Google Chat the Google user id;
 * the Google Chat display name is used when there is one.
 */
export function authorOf(message: ChatMessage) {
  const name = message.google_chat_sender_name || message.sender_name || "";
  if (message.sender_role === "carrier") return name || message.vendors?.vendor_name || "Carrier";
  if (!name || name.startsWith("org:")) return "MARKSMAN";
  return name.startsWith("users/") ? tr("text111") : name;
}

export const THREAD_AUDIENCE: Record<ThreadType, string> = {
  get event_group() { return tr("text112"); },
  get lane_group() { return tr("text113"); },
  get carrier_private() { return tr("text114"); },
};

/** "lo verá" or "lo verán", as the audience is one carrier or several. */
export const THREAD_SEES: Record<ThreadType, string> = {
  get event_group() { return tr("text115"); },
  get lane_group() { return tr("text115"); },
  get carrier_private() { return tr("text116"); },
};

export const listEventChat = (eventId: string) =>
  callRatewareApi<EventChat>("list_bid_room_chat", { rfx_event_id: eventId, message_limit: 1000 });

/** Finds or opens the thread (by kind, lane and carrier) and adds the message as the team. */
export const postChatMessage = (input: { eventId: string; threadType: ThreadType; laneId?: string | null; vendorId?: string | null; body: string }) =>
  callRatewareApi("post_bid_room_chat_message", {
    rfx_event_id: input.eventId,
    thread_type: input.threadType,
    rfx_lane_id: input.laneId ?? undefined,
    vendor_id: input.vendorId ?? undefined,
    body: input.body,
    sender_name: "MARKSMAN",
  });

export type ThreadAction = "mark_read" | "mark_unread" | "mark_needs_reply" | "resolve" | "reopen" | "assign" | "note";

export const threadAction = (threadId: string, action: ThreadAction, extra: { assigned_to?: string | null; internal_note?: string | null } = {}) =>
  callRatewareApi<{ row: ChatThread }>("update_bid_room_chat_thread", { thread_id: threadId, thread_action: action, ...extra });

/** The event's shared thread; rateware opens it (and its Google Chat mirror) this way. */
export const startEventThread = (eventId: string) => callRatewareApi("sync_bid_room_event_thread", { rfx_event_id: eventId });

/**
 * A bid the carrier gave in the chat, recorded on its invitation; the thread
 * is resolved unless told otherwise. The invitation is the thread's lane and
 * carrier.
 */
export const applyBidFromChat = (input: {
  threadId: string;
  messageId?: string | null;
  laneId: string;
  vendorId: string;
  bid_rate: number;
  currency: string;
  weekly_capacity: number | null;
  transit_days: number | null;
  notes: string | null;
}) =>
  callRatewareApi("apply_bid_update_from_chat", {
    thread_id: input.threadId,
    message_id: input.messageId ?? undefined,
    rfx_lane_id: input.laneId,
    vendor_id: input.vendorId,
    bid_rate: input.bid_rate,
    currency: input.currency,
    weekly_capacity: input.weekly_capacity,
    transit_days: input.transit_days,
    notes: input.notes,
  });
