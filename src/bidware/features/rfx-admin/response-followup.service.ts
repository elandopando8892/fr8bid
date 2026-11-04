import { callRatewareApi } from '@/lib/api-client';
import type { FollowupEvidence, FollowupScope, FollowupSignal } from './response-followup';

type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid response context');
  return v as Obj;
};
const id = (v: unknown) => {
  if (typeof v !== 'string' || !v.trim() || v.length > 200) throw new Error('Invalid source identity');
  return v;
};
const nullableId = (v: unknown) => v == null ? null : id(v);
const list = (v: unknown, max: number) => { if (!Array.isArray(v) || v.length > max) throw new Error('Incomplete response context'); return v; };
const scoped = (row: Obj, scope: FollowupScope) => {
  if (row.rfx_event_id !== scope.eventId || row.organization_id != null && row.organization_id !== scope.organizationId) throw new Error('Foreign response context');
};

/** Only the existing read aggregation; never asks the provider to sync or marks a thread read. */
export async function readResponseFollowup(scope: FollowupScope): Promise<FollowupEvidence> {
  if (!scope.userId || !scope.organizationId || !scope.eventId || !['admin', 'operator', 'viewer'].includes(scope.role)) throw new Error('Unverified response scope');
  const raw = object(await callRatewareApi<unknown>('list_rfx_event_context', { rfx_event_id: scope.eventId }));
  const warnings = object(raw.warnings);
  let partial = Object.keys(warnings).length > 0;
  if (typeof raw.outreach_messages_limited !== 'boolean') throw new Error('Missing coverage');
  partial ||= raw.outreach_messages_limited;
  const activity = list(raw.response_vendor_ids, 100000).map(id);
  if (new Set(activity).size !== activity.length) throw new Error('Duplicate response identity');
  const signals: FollowupSignal[] = [];
  const seen = new Set<string>();
  for (const entry of list(raw.outreach_messages, 2000)) {
    const row = object(entry); scoped(row, scope);
    const messageId = id(row.id);
    if (seen.has(messageId)) throw new Error('Duplicate source identity');
    seen.add(messageId);
    if (row.tracking_state === 'replied' && row.vendor_id != null) {
      signals.push({ id: messageId, kind: 'queue', vendorId: id(row.vendor_id), laneId: nullableId(row.rfx_lane_id), invitationId: nullableId(row.rfx_lane_vendor_id) });
    }
  }
  if (raw.chat == null) {
    if (!warnings.chat) throw new Error('Missing conversation context');
    partial = true;
  } else {
    const chat = object(raw.chat), event = object(chat.event);
    if (event.id !== scope.eventId || event.organization_id != null && event.organization_id !== scope.organizationId) throw new Error('Foreign conversation event');
    if (typeof chat.messages_limited !== 'boolean') throw new Error('Missing conversation coverage');
    partial ||= chat.messages_limited;
    const threads = new Set<string>(), messages = new Set<string>();
    for (const entry of list(chat.rows, 10000)) {
      const thread = object(entry); scoped(thread, scope);
      const threadId = id(thread.id), vendorId = nullableId(thread.vendor_id), laneId = nullableId(thread.rfx_lane_id);
      if (threads.has(threadId)) throw new Error('Duplicate conversation identity');
      threads.add(threadId);
      if (!['event_group', 'lane_group', 'carrier_private'].includes(String(thread.thread_type))) throw new Error('Invalid conversation type');
      for (const item of list(thread.messages, 1000)) {
        const message = object(item); scoped(message, scope);
        const messageId = id(message.id);
        if (message.thread_id !== threadId || messages.has(messageId)) throw new Error('Invalid conversation message identity');
        messages.add(messageId);
        const messageVendor = nullableId(message.vendor_id), messageLane = nullableId(message.rfx_lane_id);
        if (vendorId && messageVendor && vendorId !== messageVendor || laneId && messageLane && laneId !== messageLane) throw new Error('Contradictory conversation scope');
        if (message.sender_role !== 'carrier') continue;
        const targetVendor = messageVendor || (thread.thread_type === 'carrier_private' ? vendorId : null);
        if (!targetVendor) { partial = true; continue; }
        const targetLane = messageLane || laneId;
        const key = `${threadId}:${targetVendor}:${targetLane ?? ''}`;
        if (!signals.some(signal => signal.kind === 'chat' && `${signal.id}:${signal.vendorId}:${signal.laneId ?? ''}` === key)) {
          signals.push({ id: threadId, kind: 'chat', vendorId: targetVendor, laneId: targetLane });
        }
      }
    }
    if (messages.size > 1000) throw new Error('Conversation safety bound exceeded');
  }
  return { scope: { ...scope }, checkedAt: Date.now(), partial, activity, signals };
}
