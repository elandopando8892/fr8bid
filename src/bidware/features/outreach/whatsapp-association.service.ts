import { callRatewareApi } from "@/lib/api-client";

export interface WhatsappAssociationCandidate {
  message_id: string; event_id: string; event_code: string; event_name: string;
  vendor_name: string; subject: string | null; sent_at: string; version: string;
}
export interface WhatsappAssociationReview {
  contract: "bidware.whatsapp-association.v1";
  review_scope: { subject: string; organization_id: string };
  receipt: { id: string; body_preview: string | null; occurred_at: string; received_at: string | null;
    from_phone: string | null; version: string; state: string; reason: string;
    event_id: string | null; message_id: string | null; event_code: string | null; event_name: string | null; resolved_at: string | null; resolved_by: string | null };
  candidates: WhatsappAssociationCandidate[]; total: number; offset: number; has_more: boolean;
}
export interface WhatsappAssociationDecision {
  receipt_id: string; message_id: string; operation_id: string; receipt_version: string; message_version: string;
  review_scope: { subject: string; organization_id: string };
}
const contract = "bidware.whatsapp-association.v1";
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const version = (v: unknown) => typeof v === "string" && /^[0-9a-f]{32}$/.test(v);
export async function reviewWhatsappReply(receiptId: string, offset = 0) {
  const value = await callRatewareApi<WhatsappAssociationReview>("review_whatsapp_reply_association", { receipt_id: receiptId, offset });
  if (value?.contract !== contract || value.receipt?.id !== receiptId || !version(value.receipt.version)
    || !uuid(value.review_scope?.subject) || typeof value.review_scope?.organization_id !== "string"
    || !Array.isArray(value.candidates) || value.candidates.length > 25 || value.offset !== offset
    || !Number.isSafeInteger(value.total) || value.total < 0 || typeof value.has_more !== "boolean"
    || value.candidates.some(c => !uuid(c.message_id) || !uuid(c.event_id) || !version(c.version)
      || ![c.event_code,c.event_name,c.vendor_name,c.sent_at].every(v => typeof v === "string"))) throw new Error("Invalid association review");
  return value;
}
export async function associateWhatsappReply(decision: WhatsappAssociationDecision) {
  const value = await callRatewareApi<{contract: string; receipt_id: string; message_id: string; event_id: string; replayed: boolean; resolved_at: string}>(
    "associate_whatsapp_reply", { ...decision, confirm: true });
  if (value?.contract !== contract || value.receipt_id !== decision.receipt_id || value.message_id !== decision.message_id
    || !uuid(value.event_id) || typeof value.replayed !== "boolean" || !Number.isFinite(Date.parse(value.resolved_at))) throw new Error("Invalid association result");
  return value;
}
