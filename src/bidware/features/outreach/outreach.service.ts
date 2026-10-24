import type { ApprovedMessageVersion, WhatsappApproval } from "./send-batches";
import { extra, deliveryText } from "@/i18n/outreach";
import { callRatewareApi } from "@/lib/api-client";
import { env } from "@/config/env";

/**
 * Outreach = the Launch-phase surfaces: Message prepares drafts, Delivery queue
 * is the only place anything is sent. Everything here hits the shared
 * rateware-api, so drafts and delivery state are the same rows rateware shows.
 *
 * Signatures verified against the edge function, and the status vocabulary
 * against production data.
 */

/** Stored status values that actually occur in outreach_messages. */
export type MessageStatus =
  | "drafted"
  | "queued"
  | "sending"
  | "sent"
  | "bounced"
  | "failed"
  | "delivery_unknown"
  | "archived";

export interface OutreachMessage {
  id: string;
  campaign_id?: string;
  rfx_event_id?: string;
  vendor_id?: string;
  channel?: "email" | "whatsapp" | string;
  provider?: "gmail" | "meta" | string;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  subject?: string | null;
  html_body?: string | null;
  text_body?: string | null;
  whatsapp_text?: string | null;
  whatsapp_body?: string | null;
  sender_email?: string | null;
  sender_address?: string | null;
  vendors?: { vendor_name?: string | null } | null;
  status?: MessageStatus | string;
  delivery_status?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  failed_at?: string | null;
  sent_at?: string | null;
  bounce_status?: string | null;
  suppressed_at?: string | null;
  suppression_reason?: string | null;
  manual_sent_at?: string | null;
  whatsapp_template_name?: string | null;
  whatsapp_template_language?: string | null;
  whatsapp_approval?: WhatsappApproval | null;
  whatsapp_approval_error?: string | null;
  whatsapp_preview?: { kind: "pending" | "receipt"; text: string; from: string; to: string; template_name: string; language: string; category: string; parameters: string[]; expires_at: number | null } | null;
  meta_whatsapp_group_id?: string | null;
  delivery_error?: string | null;
  outcome_reason?: string | null;
  /** Where it stands for the carrier (see TrackingState). */
  tracking_state?: string | null;
  metadata?: { vendor_name?: string | null; [key: string]: unknown } | null;
  [key: string]: unknown;
}

/**
 * Where a message stands for the carrier, as the server tracks it: a draft
 * whose carrier already quoted counts as "quoted", a bounce as "bounced" even
 * if it was archived afterwards.
 */
export type TrackingState =
  | "drafted"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "manual_sent"
  | "delivery_unknown"
  | "failed"
  | "replied"
  | "quoted"
  | "bounced"
  | "suppressed"
  | "archived";

export const TRACKING_LABEL: Record<TrackingState, string> = {
  get drafted() { return extra("extra0"); },
  get queued() { return extra("extra1"); },
  get sending() { return extra("extra2"); },
  get sent() { return extra("extra3"); },
  get delivered() { return extra("extra4"); },
  get read() { return extra("extra5"); },
  get manual_sent() { return extra("extra6"); },
  get delivery_unknown() { return extra("extra7"); },
  get failed() { return extra("extra8"); },
  get replied() { return extra("extra9"); },
  get quoted() { return extra("extra10"); },
  get bounced() { return extra("extra11"); },
  get suppressed() { return extra("extra12"); },
  get archived() { return extra("extra13"); },
};

export type QueueChannel = "all" | "email" | "whatsapp";

const channelsOf = (channel: QueueChannel) => (channel === "all" ? undefined : [channel]);

export interface QueuePage {
  rows: OutreachMessage[];
  total: number;
  offset: number;
  has_more: boolean;
}

/** The server hands out at most 250 messages per call. */
export const QUEUE_PAGE_SIZE = 100;

export interface WhatsappEvidence {
  id: string; direction: "inbound" | "outbound"; status: string | null;
  body_preview: string | null; occurred_at: string | null; received_at: string | null;
  from_phone: string | null; association_reason: string | null; provider_status: string | null;
  resolved_by?: string | null; resolved_at?: string | null;
}
/** Read-only, server-filtered projection; an unassigned receipt has no event scope. */
export async function listWhatsappEvidence({ eventId, messageId, offset = 0 }: { eventId?: string; messageId?: string; offset?: number }): Promise<{ rows: WhatsappEvidence[]; total: number; has_more: boolean }> {
  if (Boolean(eventId) !== Boolean(messageId)) throw new Error("Invalid evidence scope");
  const result = await callRatewareApi<{ contract: string; view: string; scope: { rfx_event_id: string; outreach_message_id: string } | null; rows: WhatsappEvidence[]; total: number; has_more: boolean }>("list_contact_history", {
    whatsapp_view: messageId ? "message" : "pending", ...(messageId ? { rfx_event_id: eventId, outreach_message_id: messageId } : {}), offset, limit: 25,
  });
  const nullableText = (value: unknown) => value === null || typeof value === "string";
  if (!result || result.contract !== "bidware.whatsapp-evidence.v1" || result.view !== (messageId ? "message" : "pending")
    || (messageId ? result.scope?.rfx_event_id !== eventId || result.scope?.outreach_message_id !== messageId : result.scope !== null)
    || !Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || result.total < 0
    || typeof result.has_more !== "boolean" || result.rows.length > 25
    || result.rows.some(row => !row || typeof row.id !== "string" || !row.id || !["inbound", "outbound"].includes(row.direction)
      || ![row.body_preview, row.occurred_at, row.received_at, row.from_phone, row.status, row.association_reason, row.provider_status].every(nullableText))) throw new Error("Invalid evidence response");
  return result;
}

/** Read the persisted message, not the sample/template currently in Message. */
export async function getOutreachMessage(eventId: string, messageId: string): Promise<OutreachMessage | null> {
  const { row } = await callRatewareApi<{ row?: OutreachMessage | null }>("get_outreach_message", { id: messageId, rfx_event_id: eventId });
  return row?.id === messageId && row.rfx_event_id === eventId ? row : null;
}

export const outreachVendorName = (message: OutreachMessage) => message.metadata?.vendor_name || message.vendors?.vendor_name;

/**
 * One page of the event's queue, filtered on the server. With a state the
 * page counts archived messages too, as the state counts do; without one it
 * is the active queue (archived messages left out).
 */
export async function listQueuePage(input: {
  eventId: string;
  channel: QueueChannel;
  state: TrackingState | null;
  search: string;
  offset: number;
  /** Up to 250, the server's cap; a page by default. */
  limit?: number;
}): Promise<QueuePage> {
  const res = await callRatewareApi<Partial<QueuePage>>("list_outreach_messages", {
    rfx_event_id: input.eventId,
    enforce_rfx_event_scope: true,
    compact: true,
    channels: channelsOf(input.channel),
    search: input.search || undefined,
    ...(input.state ? { tracking_status: input.state, include_archived: true } : {}),
    offset: input.offset,
    limit: input.limit ?? QUEUE_PAGE_SIZE,
  });
  return {
    rows: res.rows ?? [],
    total: Number(res.total ?? 0),
    offset: Number(res.offset ?? input.offset),
    has_more: Boolean(res.has_more),
  };
}

/** Read every draft page; never silently approve only the first 250. */
export async function listAllQueueDrafts(eventId: string, channel: QueueChannel, isCurrent = () => true): Promise<QueuePage> {
  const rows = new Map<string, OutreachMessage>();
  let offset = 0;
  while (isCurrent()) {
    const page = await listQueuePage({ eventId, channel, state: "drafted", search: "", offset, limit: 250 });
    if (!isCurrent()) throw new Error("Queue scope changed");
    const previous = rows.size;
    for (const row of page.rows) rows.set(row.id, row);
    offset += page.rows.length;
    if (!page.has_more && offset >= page.total) return { rows: [...rows.values()], total: rows.size, offset: 0, has_more: false };
    if (!page.rows.length || rows.size === previous) throw new Error("Queue pagination did not advance");
  }
  throw new Error("Queue scope changed");
}

/** How many of the event's messages sit in each state, archived ones included. */
export async function getQueueSummary(eventId: string, channel: QueueChannel) {
  const res = await callRatewareApi<{ total?: number; states?: Partial<Record<TrackingState, number>> }>(
    "get_outreach_tracking_summary",
    {
      rfx_event_id: eventId,
      channels: channelsOf(channel),
      enforce_rfx_event_scope: true,
      include_archived: true,
    },
  );
  return { total: Number(res.total ?? 0), states: res.states ?? {} };
}

export async function listOutreachTemplates() {
  const res = await callRatewareApi<{ rows?: any[] }>("list_outreach_templates");
  return res.rows ?? [];
}

/**
 * The handler ignores `rfx_event_id` and returns the whole workspace, so the
 * event filter has to happen here — otherwise every event's waves show up as
 * "this event's campaign".
 */
export async function listOutreachCampaigns(rfxEventId?: string) {
  const res = await callRatewareApi<{ rows?: any[] }>("list_outreach_campaigns");
  const rows = res.rows ?? [];
  return rfxEventId ? rows.filter((c) => c.rfx_event_id === rfxEventId) : rows;
}

/**
 * Hides a campaign from every list (the handler skips archived ones). Its
 * messages are untouched: sent stays sent, drafts stay in the queue.
 */
export async function archiveOutreachCampaign(id: string) {
  return await callRatewareApi<{ row: any }>("archive_outreach_campaign", {
    id,
    confirmed: true,
    confirmation_action: "archive_outreach_campaign",
  });
}

/**
 * A campaign ties an event to an outreach template. `idempotency_key` makes a
 * retried create return the same row (`reused: true`) instead of a second one.
 */
export async function createOutreachCampaign(input: {
  rfx_event_id: string;
  template_id: string;
  name: string;
  channel: string;
  idempotency_key: string;
}) {
  return await callRatewareApi<{ row: any; reused?: boolean }>("create_outreach_campaign", {
    campaign: input,
  });
}

export type DraftChannel = "email" | "whatsapp" | "whatsapp_group";

export const DRAFT_CHANNELS: { key: DraftChannel; label: string }[] = [
  { key: "email", label: "Correo (Gmail)" },
  { key: "whatsapp", label: "WhatsApp directo" },
  { key: "whatsapp_group", label: "Grupos de WhatsApp (manual)" },
];

/**
 * Drafts are generated against a CAMPAIGN (which carries the rfx_event and the
 * template), not against the event directly. This only prepares drafts — it
 * does not send.
 *
 * `app_origin` is what keeps Bidware's invitations inside Bidware: without it
 * the backend falls back to rateware's origin and the carrier would be sent to
 * rateware's Bid Room. The WhatsApp templates take the link as a parameter
 * ({{5}}), so this needs no template change — both
 * `rateware_rfx_invitation_es` and `_en` are APPROVED and stay untouched.
 */
export async function generateOutreachDrafts(input: {
  campaign_id: string;
  template_id?: string;
  invitation_ids?: string[];
  /** Message supplies its exact reviewed selection. Legacy callers are filtered on the server. */
  reviewed_vendor_ids?: string[];
  /** Exactly one: the backend refuses a mixed queue ("multi" campaigns included). */
  channel: DraftChannel;
  /** Reuse the SAME id when retrying, or the server mints a new one and the
   *  drafts are generated twice. */
  operation_id: string;
}) {
  if (input.reviewed_vendor_ids && !input.reviewed_vendor_ids.length) throw new Error("Select reviewed carriers before preparing drafts.");
  return await callRatewareApi("generate_outreach_drafts", {
    ...input,
    app_origin: env.appOrigin,
    // Backend must support explicit zero before this frontend is published.
    ...(input.channel === "email" ? { contact_policy: { daily_limit: 0 } } : {}),
  });
}

export async function listDraftAudienceSegments(eventId: string) {
  const result = await callRatewareApi<{ rows?: { id: string; vendor_ids?: string[] }[] }>("list_outreach_audience_segments", { rfx_event_id: eventId });
  return result.rows ?? [];
}

/** What a manual mark or a delete did, per the server. */
export interface BulkResult {
  updated?: number;
  removed?: number;
  skipped?: number;
  skipped_rows?: { id?: string; reason?: string }[];
  failures?: { id?: string; reason?: string }[];
}

/**
 * Manual state change on selected messages (e.g. marking them sent after
 * sending by hand). The server refuses a mix of channels unless archiving.
 */
export async function markOutreachMessages(
  ids: string[],
  status: MarkStatus | "archived",
  channel?: string,
) {
  // The handler demands an explicit confirmation for sent/replied/archived
  // (and for any batch of 100+); without it the call is refused.
  const needsConfirmation = ["sent", "replied", "archived"].includes(status) || ids.length >= 100;
  return await callRatewareApi<BulkResult>("mark_outreach_messages", {
    ids,
    status,
    ...(channel ? { channel } : {}),
    ...(needsConfirmation
      ? { confirmed: true, confirmation_action: "mark_outreach_messages" }
      : {}),
  });
}

/** The statuses the team sets by hand, besides archiving. */
export type MarkStatus = "queued" | "sent" | "manual_sent" | "failed" | "bounced" | "replied";

export const MARK_OPTIONS: { status: MarkStatus; label: string }[] = [
  { status: "manual_sent", get label() { return extra("extra6"); } },
  { status: "sent", get label() { return extra("extra3"); } },
  { status: "replied", get label() { return extra("extra9"); } },
  { status: "bounced", get label() { return extra("extra11"); } },
  { status: "failed", get label() { return extra("extra8"); } },
  { status: "queued", get label() { return extra("extra17"); } },
];

/** The server's allowed moves (rateware-api OUTREACH_MARK_TRANSITIONS). */
const MARK_TRANSITIONS: Record<string, readonly string[]> = {
  drafted: ["queued", "failed", "bounced", "sent", "manual_sent", "delivery_unknown", "replied", "archived"],
  queued: ["sent", "failed", "bounced", "manual_sent", "delivery_unknown", "replied", "archived"],
  sending: ["sent", "delivered", "read", "failed", "bounced", "delivery_unknown", "archived"],
  sent: ["delivered", "read", "replied", "failed", "bounced", "delivery_unknown", "archived"],
  delivered: ["read", "replied", "bounced", "archived"],
  read: ["replied", "archived"],
  manual_sent: ["replied", "archived"],
  delivery_unknown: ["queued", "sent", "delivered", "read", "failed", "bounced", "replied", "archived"],
  replied: ["archived"],
  failed: ["queued", "archived", "replied", "bounced"],
  bounced: ["queued", "failed", "archived"],
  archived: [],
};

export const canMark = (m: OutreachMessage, status: MarkStatus | "archived") =>
  Boolean(MARK_TRANSITIONS[String(m.status || "").toLowerCase()]?.includes(status));

/**
 * Only a message that never went out may be deleted: the server deletes any
 * row it is given, sent ones included, so the history of what a carrier
 * received is kept by archiving instead.
 */
export const canDelete = (m: OutreachMessage) =>
  ["drafted", "queued", "failed"].includes(String(m.status || "").toLowerCase()) &&
  !m.sent_at &&
  !m.manual_sent_at;

export async function deleteOutreachMessages(ids: string[]) {
  return await callRatewareApi<BulkResult>("delete_outreach_messages", {
    ids,
    confirmed: true,
    confirmation_action: "delete_outreach_messages",
  });
}

export interface SendResult {
  sent?: number;
  failed?: number;
  skipped?: number;
  delivery_unknown?: number;
  failures?: { id?: string; reason?: string }[];
  skipped_rows?: { id?: string; reason?: string }[];
}

/** The backend caps one send call at this many messages. */
export const SEND_BATCH_LIMIT = 100;

/**
 * Actually delivers drafts. Email goes through Gmail, WhatsApp through the
 * Business API — separate endpoints, so a mixed selection is split by channel.
 * Both are correlated high-risk actions: the SAME operation id must be reused
 * when retrying one attempt, or a retry sends twice.
 */
export async function sendOutreachMessages(
  ids: string[],
  channel: "email" | "whatsapp",
  operationId: string,
  expectedVersions: ApprovedMessageVersion[] = [],
) {
  const action = channel === "email" ? "send_outreach_messages" : "send_whatsapp_outreach_messages";
  return await callRatewareApi<SendResult>(action, {
    ids,
    expected_versions: expectedVersions,
    ...(channel === "email" ? { channel: "email", provider: "gmail" } : {}),
    confirmed: true,
    confirmation_action: action,
    operation_id: operationId,
  });
}

/* ---------------------------------------------------------------------- */
/* Derived UI state                                                        */
/* ---------------------------------------------------------------------- */

export type QueueState =
  | "queued"
  | "sending"
  | "ready"
  | "blocked"
  | "sent"
  | "bounced"
  | "failed"
  | "unknown"
  | "archived";

/**
 * "Blocked" is NOT a stored status — the backend only knows drafted/sent/…
 * A draft is blocked when it has no usable recipient for its own channel, so we
 * derive it here and surface the reason instead of hiding the row.
 */
export function queueStateOf(m: OutreachMessage): { state: QueueState; reason?: string } {
  const s = String(m.status || "").toLowerCase();
  if (s === "archived") return { state: "archived" };
  if (s === "bounced" || m.bounce_status) {
    return { state: "bounced", reason: m.suppressed_at ? deliveryText("suppressed") : m.bounce_status || undefined };
  }
  if (s === "failed") return { state: "failed", reason: m.delivery_error || undefined };
  if (s === "delivery_unknown") return { state: "unknown" };
  if (s === "queued" || s === "sending") return { state: s };
  if (["sent", "manual_sent", "delivered", "read"].includes(s)) return { state: "sent" };
  if (s !== "drafted") return { state: "unknown" };

  // drafted -> ready unless it cannot actually go out
  if (m.channel === "email" && !m.recipient_email)
    return { state: "blocked", reason: deliveryText("missingEmail") };
  if (m.channel === "whatsapp" && !m.recipient_phone && !m.meta_whatsapp_group_id)
    return { state: "blocked", reason: deliveryText("missingPhone") };
  if (m.suppressed_at)
    return { state: "blocked", reason: m.suppression_reason || deliveryText("suppressedRecipient") };
  return { state: "ready" };
}

/** API delivery_issue as readLatestOutreachIssue returns it. */
interface DeliveryIssue {
  status: "failed" | "delivery_unknown";
  occurred_at: string | null;
  error: string | null;
  http_status: number | null;
  reason_codes: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const nullableString = (v: unknown) => v === null || typeof v === "string";

function deliveryIssueOf(v: unknown): DeliveryIssue | null {
  if (!isRecord(v) || (v.status !== "failed" && v.status !== "delivery_unknown")) return null;
  if (!nullableString(v.occurred_at) || !nullableString(v.error)) return null;
  if (!(v.http_status === null || Number.isInteger(v.http_status))) return null;
  if (!Array.isArray(v.reason_codes) || !v.reason_codes.every((c) => typeof c === "string")) return null;
  return { status: v.status as DeliveryIssue["status"], occurred_at: v.occurred_at as string | null, error: v.error as string | null,
    http_status: v.http_status as number | null, reason_codes: [...v.reason_codes as string[]] };
}

const REVIEW_BINDING = ["status", "recipient_email", "recipient_phone", "channel", "failed_at", "send_started_at", "send_attempt_id", "send_completed_at", "delivery_error"] as const;

/**
 * Imports only the delivery evidence a scoped review read, and only while the
 * reviewed row is the same message version and failure as the current one.
 */
export function mergeReviewedOutreachMessage(current: OutreachMessage, reviewed?: OutreachMessage | null): OutreachMessage {
  if (!reviewed) return current;
  for (const key of ["id", "rfx_event_id", "updated_at"] as const) {
    const value = current[key];
    if (typeof value !== "string" || !value || reviewed[key] !== value) return current;
  }
  if (REVIEW_BINDING.some((key) => (current[key] ?? null) !== (reviewed[key] ?? null))) return current;
  return { ...current, delivery_issue: deliveryIssueOf(reviewed.delivery_issue), delivery_issue_unavailable: reviewed.delivery_issue_unavailable === true,
    ...(current.channel === "whatsapp" ? { whatsapp_approval: reviewed.whatsapp_approval ? { ...reviewed.whatsapp_approval } : null,
      send_result: { ...(isRecord(current.send_result) ? current.send_result : {}), outcome: isRecord(reviewed.send_result) ? reviewed.send_result.outcome : null } } : {}) };
}

/** Ephemeral review evidence only: no bodies or credentials. The signed approval
 * identifies content and expires; it cannot authenticate or bypass the send role. */
export const outreachReviewEvidence = (row: OutreachMessage): OutreachMessage => ({
  id: row.id, rfx_event_id: row.rfx_event_id, updated_at: row.updated_at, status: row.status,
  recipient_email: row.recipient_email, failed_at: row.failed_at, send_completed_at: row.send_completed_at,
  delivery_error: row.delivery_error, delivery_issue: deliveryIssueOf(row.delivery_issue),
  delivery_issue_unavailable: row.delivery_issue_unavailable === true,
  send_started_at: row.send_started_at, send_attempt_id: row.send_attempt_id,
  channel: row.channel, recipient_phone: row.recipient_phone,
  ...(row.channel === "whatsapp" ? { whatsapp_approval: row.whatsapp_approval ? { ...row.whatsapp_approval } : null,
    send_result: { outcome: isRecord(row.send_result) ? row.send_result.outcome : null } } : {}),
});

const PRECONDITION_ERROR = "Precondition check failed.";
const PRECONDITION_CODES = ["failedPrecondition", "FAILED_PRECONDITION"];
const time = (v: unknown) => (typeof v === "string" && v ? Date.parse(v) : NaN);

/** A reviewed, completed precondition rejection that is bound to the current failure. */
function isReviewedPrecondition(m: OutreachMessage): boolean {
  if (m.delivery_issue_unavailable !== false) return false;
  const issue = deliveryIssueOf(m.delivery_issue);
  if (!issue || issue.status !== "failed" || !issue.error || issue.error !== m.delivery_error) return false;
  const failed = time(m.failed_at), completed = time(m.send_completed_at), occurred = time(issue.occurred_at);
  if (!Number.isFinite(failed) || !Number.isFinite(completed) || !Number.isFinite(occurred) || occurred < failed) return false;
  const known = issue.reason_codes.some((c) => PRECONDITION_CODES.includes(c));
  if (issue.http_status === null) return issue.reason_codes.length === 0 && issue.error === PRECONDITION_ERROR;
  if (issue.http_status === 400 || issue.http_status === 403) return known;
  if (issue.http_status === 412) return known || issue.error === PRECONDITION_ERROR;
  return false;
}

/**
 * Explicit approval can retry a confirmed quota rejection or a reviewed
 * precondition rejection, never an uncertain attempt.
 */
export function canApproveMessage(m: OutreachMessage): boolean {
  if (m.sent_at || m.manual_sent_at || m.provider_message_id || m.suppressed_at || m.bounce_status) return false;
  // An uncertain attempt vetoes every path, even with otherwise malformed evidence.
  if (isRecord(m.delivery_issue) && m.delivery_issue.status === "delivery_unknown") return false;
  if (m.channel === "whatsapp") {
    const approval = m.whatsapp_approval;
    const outcome = isRecord(m.send_result) ? m.send_result.outcome : null;
    if (outcome === "delivery_unknown" || (m.send_started_at && (!m.send_completed_at || !m.failed_at))) return false;
    const eligible = ["drafted", "queued"].includes(String(m.status)) || (m.status === "failed" && outcome === "failed" && m.failed_at && m.send_completed_at);
    return Boolean(eligible && approval && approval.contract === "bidware.whatsapp-approval.v1"
      && /^[a-f0-9]{64}$/.test(approval.fingerprint) && /^[a-f0-9]{64}$/.test(approval.signature)
      && approval.issued_at <= Date.now() && Date.now() < approval.expires_at
      && approval.expires_at - approval.issued_at === 900000);
  }
  if (queueStateOf(m).state === "ready") return true;
  return m.channel === "email" && Boolean(m.recipient_email) && ["queued", "failed"].includes(String(m.status))
    && Boolean(m.failed_at && m.send_completed_at)
    && (/quota exceeded|userRateLimitExceeded|rateLimitExceeded/i.test(m.delivery_error || "") || isReviewedPrecondition(m))
    && !(Date.parse(String(m.next_action_at || "")) > Date.now());
}

export function deliveryLabel(m: OutreachMessage): string {
  if (m.status === "queued" || m.status === "sending") return deliveryText(m.status) + (m.delivery_error ? ` · ${deliveryText("previousError")}: ${m.delivery_error}` : "");
  if (m.read_at) return deliveryText("read");
  if (m.delivered_at) return deliveryText("delivered");
  if (m.bounce_status) return `${m.bounce_status}${m.suppressed_at ? deliveryText("suppressedSuffix") : ""}`;
  if (m.sent_at || m.manual_sent_at) return deliveryText("sent");
  if (m.failed_at) return m.delivery_error || deliveryText("failed");
  return "—";
}
