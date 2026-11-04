import type { CarrierReview } from './review.service';
import { selectedDraftAudience, type DraftAudiencePolicy } from './reviewed-audience';

export type FlowChannel = 'email' | 'whatsapp';
export type FlowScope = { userId: string; organizationId: string; role: string; eventId: string };
export const FLOW_TTL_MS = 5 * 60 * 1000;
export const flowScopeKey = (scope: FlowScope) => JSON.stringify([scope.userId, scope.organizationId, scope.role, scope.eventId]);
export type FlowAudienceRow = {
  vendor_id: string; vendor_name: string; email: string | null; phone: string | null;
  invitation_statuses: string[]; audience_status: string; event_status: string;
  lane_preview: string[]; shortlisted_lane_count: number;
};
export type FlowMessage = { id: string; vendor_id: string | null; campaign_id: string | null; status: string; tracking_state: string | null };
export type FlowCampaign = { id: string; template_id?: string; name: string; audience_policy?: DraftAudiencePolicy };
export type FlowReason = 'prepare' | 'not_selected' | 'not_reviewed' | 'contact_changed' | 'no_contact' | 'suppressed' | 'existing' | 'multiple' | 'uncertain' | 'response' | 'unknown';
export const FLOW_REASONS: FlowReason[] = ['prepare', 'not_reviewed', 'contact_changed', 'no_contact', 'suppressed', 'existing', 'multiple', 'uncertain', 'response', 'not_selected', 'unknown'];
export type FlowRow = {
  id: string; name: string; selected: boolean; reviewed: boolean; reason: FlowReason;
  messages: FlowMessage[]; routes: string[]; routeCount: number;
};
export type FlowSnapshot = {
  scope: FlowScope; channel: FlowChannel; checkedAt: number; campaign: FlowCampaign | null;
  rows: FlowRow[]; counts: { total: number; selected: number; reviewed: number; prepare: number; pending: number; existing: number; existingAttention: number; messages: number; outsideMessages: number };
};
export function flowIsCurrent(snapshot: FlowSnapshot, scope: FlowScope, now: number) {
  return flowScopeKey(snapshot.scope) === flowScopeKey(scope) && now >= snapshot.checkedAt && now - snapshot.checkedAt < FLOW_TTL_MS;
}

const normalizeContact = (value: string | null | undefined, channel: FlowChannel) => channel === 'email'
  ? (value ?? '').trim().toLowerCase() : (value ?? '').replace(/[^0-9]/g, '');

/** Advisory only. Never changes audience, reviews, message state or commercial eligibility. */
export function reconcileFlow(input: {
  scope: FlowScope; channel: FlowChannel; checkedAt: number; campaign: FlowCampaign | null;
  audience: FlowAudienceRow[]; reviews: CarrierReview[]; messages: FlowMessage[];
  segments: { id: string; vendor_ids?: string[] }[];
}): FlowSnapshot {
  const { scope, channel, checkedAt, campaign, reviews, messages } = input;
  // The server preview includes declined carriers; Message's audience excludes them.
  const audience = input.audience.filter(row => row.invitation_statuses.some(status => !['archived', 'declined'].includes(status)));
  const selection = selectedDraftAudience(audience.map(row => ({ id: row.vendor_id, name: row.vendor_name })), campaign?.audience_policy, input.segments);
  if (selection.unresolved) throw new Error('SELECTION_UNAVAILABLE');
  const selected = new Set(selection.selected.map(row => row.id));
  const reviewById = new Map(reviews.map(row => [row.vendor_id, row]));
  const messagesByVendor = new Map<string, FlowMessage[]>();
  for (const message of messages) {
    if (message.vendor_id) messagesByVendor.set(message.vendor_id, [...(messagesByVendor.get(message.vendor_id) ?? []), message]);
  }
  const rows = audience.map((row): FlowRow => {
    const review = reviewById.get(row.vendor_id);
    const existing = messagesByVendor.get(row.vendor_id) ?? [];
    const current = normalizeContact(channel === 'email' ? row.email : row.phone, channel);
    const prior = normalizeContact(channel === 'email' ? review?.contact_snapshot?.email : review?.contact_snapshot?.phone, channel);
    let reason: FlowReason;
    // Any existing row in the channel belongs in Queue, including another campaign.
    // Neither a failure nor a changed recipient is permission to create another draft.
    if (existing.some(message => [message.status, message.tracking_state].some(status => status && ['failed', 'bounced', 'delivery_unknown', 'sending', 'suppressed'].includes(status)))) reason = 'uncertain';
    else if (existing.length > 1) reason = 'multiple';
    else if (existing.length) reason = 'existing';
    else if (!selected.has(row.vendor_id)) reason = 'not_selected';
    else if (['suppressed', 'bounced'].includes(row.audience_status)) reason = 'suppressed';
    else if (row.audience_status === 'no_contact' || !current) reason = 'no_contact';
    else if (['quoted', 'replied'].includes(row.audience_status) || ['quoted', 'replied'].includes(row.event_status)) reason = 'response';
    else if (!review?.reviewed) reason = 'not_reviewed';
    else if (!prior || prior !== current) reason = 'contact_changed';
    else if (row.audience_status !== 'ready' || row.event_status !== 'not_invited') reason = 'unknown';
    else reason = 'prepare';
    return { id: row.vendor_id, name: row.vendor_name, selected: selected.has(row.vendor_id), reviewed: review?.reviewed === true,
      reason, messages: existing, routes: row.lane_preview, routeCount: row.shortlisted_lane_count };
  });
  const prepare = rows.filter(row => row.reason === 'prepare').length;
  const existing = rows.filter(row => row.selected && row.messages.length > 0).length;
  return { scope, channel, checkedAt, campaign, rows, counts: {
    total: rows.length, selected: selected.size, reviewed: rows.filter(row => row.selected && row.reviewed).length,
    prepare, existing, existingAttention: rows.filter(row => row.selected && ['uncertain', 'multiple'].includes(row.reason)).length,
    pending: selected.size - prepare - existing, messages: messages.length,
    outsideMessages: messages.filter(message => !message.vendor_id || !selected.has(message.vendor_id)).length,
  } };
}
