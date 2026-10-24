import type { OutreachMessage } from "./outreach.service";
export type WhatsappState = "review" | "reviewed" | "expired" | "queued" | "sending" | "accepted" | "delivered" | "read" | "replied" | "rejected" | "unconfirmed" | "manual" | "blocked" | "archived";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
export function whatsappStateOf(message: OutreachMessage, now = Date.now()): { state: WhatsappState; tone: "" | "amber" | "green" | "indigo" | "red"; occurredAt: string | null } | null {
  if (message.channel !== "whatsapp") return null;
  const result = record(message.send_result), callback = record(message.whatsapp_callback ?? result.webhook);
  const association = record(message.whatsapp_reply_association ?? result.manual_reply_association);
  const outcome = message.whatsapp_send_outcome ?? result.outcome;
  const stage = message.whatsapp_send_stage ?? result.stage;
  const status = String(message.status || ""), delivery = String(message.delivery_status || "");
  const providerId = typeof message.provider_message_id === "string" && message.provider_message_id.length > 0;
  // An inbound reply has its own provider ID. The stored callback binds it to
  // this outbound message; comparing inbound/outbound provider IDs would hide it.
  const callbackMatches = providerId && typeof message.id === "string" && callback.outreach_message_id === message.id
    && typeof callback.receipt_id === "string" && /^[0-9a-f-]{36}$/i.test(callback.receipt_id) && validTime(callback.occurred_at);
  const output = (state: WhatsappState, occurredAt: unknown = null) => ({ state, tone: ({ reviewed: "green", delivered: "green", read: "green", replied: "green", accepted: "indigo", rejected: "red", blocked: "red", unconfirmed: "amber", expired: "amber", sending: "amber", queued: "amber", review: "amber", manual: "", archived: "" } as const)[state], occurredAt: validTime(occurredAt) ? occurredAt : null });
  if (status === "archived") return output("archived");
  // This receipt links an actual inbound message through a human decision; it is not a manual delivery mark.
  const associationMatches = providerId && association.contract === "bidware.whatsapp-association.v1"
    && association.outreach_message_id === message.id && typeof message.rfx_event_id === "string" && association.rfx_event_id === message.rfx_event_id
    && association.outbound_provider_message_id === message.provider_message_id
    && typeof association.receipt_id === "string" && /^[0-9a-f-]{36}$/i.test(association.receipt_id)
    && validTime(association.resolved_at) && validTime(association.occurred_at);
  if (associationMatches && (status === "replied" || delivery === "replied")) return output("replied", association.occurred_at);
  // A genuine callback may settle an earlier uncertain send without changing its immutable receipt.
  if (callbackMatches && callback.status === "replied" && (status === "replied" || delivery === "replied")) return output("replied", callback.occurred_at);
  if (providerId && (status === "read" || delivery === "read") && validTime(message.read_at)) return output("read", message.read_at);
  if (providerId && (status === "delivered" || delivery === "delivered") && validTime(message.delivered_at)) return output("delivered", message.delivered_at);
  if (status === "delivery_unknown" || delivery === "delivery_unknown" || outcome === "delivery_unknown" || record(message.delivery_issue).status === "delivery_unknown") return output("unconfirmed");
  if (message.send_started_at && !message.send_completed_at && (status === "failed" || delivery === "failed")) return output("unconfirmed");
  if (status === "sending" || (message.send_started_at && !message.send_completed_at)) return output("sending", message.send_started_at);
  if (message.manual_sent_at || status === "manual_sent" || stage === "manual_status") return output("manual", message.manual_sent_at);
  if (status === "failed" || delivery === "failed") return output("rejected", message.failed_at);
  if (providerId && validTime(message.sent_at) && (status === "sent" || delivery === "sent" || outcome === "accepted")) return output("accepted", message.sent_at);
  // Missing or inconsistent callback evidence cannot establish a reply.
  if (status === "replied" || delivery === "replied" || ["sent", "delivered", "read"].includes(status)) return output("unconfirmed");
  if (message.suppressed_at || !/^\+?[1-9]\d{10,14}$/.test(message.recipient_phone || "")) return output("blocked");
  if (!["drafted", "queued"].includes(status)) return output("unconfirmed");
  const expiry = message.whatsapp_approval?.expires_at ?? message.whatsapp_preview?.expires_at;
  if (typeof expiry === "number" && Number.isFinite(expiry)) return output(expiry <= now ? "expired" : "reviewed");
  if (message.whatsapp_approval_error === "review_unavailable") return output("blocked");
  return output(status === "queued" ? "queued" : "review");
}
