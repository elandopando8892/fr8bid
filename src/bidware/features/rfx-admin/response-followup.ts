import { comparisonOffers, offerValidity } from './offer-presentation';
import type { LaneWithInvitations } from './stages';

export type FollowupScope = { userId: string; organizationId: string; role: string; eventId: string };
export const followupKey = (scope: FollowupScope) => JSON.stringify([scope.userId, scope.organizationId, scope.role, scope.eventId]);
export const FOLLOWUP_TTL = 5 * 60 * 1000;
export const FOLLOWUP_REASONS = ['reply_without_offer', 'activity_without_offer', 'offer_attention', 'offer', 'unobserved', 'unknown', 'excluded'] as const;
export type FollowupReason = typeof FOLLOWUP_REASONS[number];
export type FollowupSource = { id: string; kind: 'chat' | 'queue'; laneId: string | null; invitationId?: string | null };
export type FollowupSignal = FollowupSource & { vendorId: string };
export type FollowupEvidence = { scope: FollowupScope; checkedAt: number; partial: boolean; activity: string[]; signals: FollowupSignal[] };
export type FollowupRow = {
  id: string; vendorId: string; lane: LaneWithInvitations; invitation: Record<string, unknown>;
  name: string; route: string; reason: FollowupReason; response: 'lane' | 'event' | 'activity' | 'unobserved' | 'unknown';
  sources: FollowupSource[]; hasOffer: boolean; issues: ('expired' | 'validity' | 'capacity' | 'transit')[];
};
export function followupCurrent(evidence: FollowupEvidence, scope: FollowupScope, now: number) {
  return followupKey(evidence.scope) === followupKey(scope) && now >= evidence.checkedAt && now - evidence.checkedAt < FOLLOWUP_TTL;
}
export const responseSourcePath = (eventId: string, source: FollowupSource) => source.kind === 'chat'
  ? `/rfx/${encodeURIComponent(eventId)}/chat?thread=${encodeURIComponent(source.id)}`
  : `/rfx/${encodeURIComponent(eventId)}/delivery?message=${encodeURIComponent(source.id)}`;

const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const positive = (v: unknown) => (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '' && Number.isFinite(Number(v)) && Number(v) > 0;
const transitPresent = (v: unknown) => (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;

/** A local advisory join, never an offer, communication or membership mutation. */
export function reconcileResponses(lanes: LaneWithInvitations[], evidence: FollowupEvidence, nameOf?: (id: string, name: string) => string): FollowupRow[] {
  const seen = new Set<string>();
  const pairs = new Set<string>();
  const laneIds = new Set<string>();
  const rows: FollowupRow[] = [];
  const activity = new Set(evidence.activity);
  const knownLanes = new Set(lanes.map(lane => text(lane.id)));
  const knownVendors = new Set(lanes.flatMap(lane => (lane.invitations ?? []).map(row => text(row.vendor_id))));
  const invitations = new Map(lanes.flatMap(lane => (lane.invitations ?? []).map(row => [text(row.id), { vendorId: text(row.vendor_id), laneId: text(lane.id) }] as const)));
  const partial = evidence.partial || evidence.signals.some(signal => !knownVendors.has(signal.vendorId)) || evidence.activity.some(vendorId => !knownVendors.has(vendorId));
  for (const signal of evidence.signals) {
    if (signal.laneId && !knownLanes.has(signal.laneId)) throw new Error('Unknown source lane');
    if (signal.invitationId) {
      const target = invitations.get(signal.invitationId);
      if (!target || target.vendorId !== signal.vendorId || signal.laneId && target.laneId !== signal.laneId) throw new Error('Contradictory source invitation');
    }
  }
  for (const lane of lanes) {
    const laneId = text(lane.id);
    if (!laneId || laneIds.has(laneId)) throw new Error('Invalid lane identity');
    laneIds.add(laneId);
    if (lane.rfx_event_id != null && lane.rfx_event_id !== evidence.scope.eventId) throw new Error('Foreign lane');
    const offers = new Set(comparisonOffers(lane).map(offer => offer.id));
    for (const invitation of lane.invitations ?? []) {
      const id = text(invitation.id), vendorId = text(invitation.vendor_id);
      const vendor = (invitation.vendors ?? {}) as Record<string, unknown>;
      if (!id || !vendorId || seen.has(id) || pairs.has(`${laneId}:${vendorId}`)) throw new Error('Invalid invitation identity');
      if (invitation.rfx_lane_id != null && invitation.rfx_lane_id !== laneId || invitation.rfx_event_id != null && invitation.rfx_event_id !== evidence.scope.eventId || vendor.id != null && vendor.id !== vendorId) throw new Error('Foreign invitation');
      seen.add(id); pairs.add(`${laneId}:${vendorId}`);
      const matching = evidence.signals.filter(signal => signal.vendorId === vendorId && (!signal.laneId || signal.laneId === laneId));
      const sources = [...new Map(matching.map(signal => [`${signal.kind}:${signal.id}`, signal])).values()];
      const response = matching.some(source => source.laneId === laneId) ? 'lane' : sources.length ? 'event' : activity.has(vendorId) ? 'activity' : partial ? 'unknown' : 'unobserved';
      const hasOffer = offers.has(id);
      const issues: FollowupRow['issues'] = [];
      if (hasOffer) {
        const validity = offerValidity(invitation, evidence.checkedAt);
        if (validity !== 'valid') issues.push(validity === 'expired' ? 'expired' : 'validity');
        if (!positive(invitation.weekly_capacity)) issues.push('capacity');
        if (!transitPresent(invitation.transit_days)) issues.push('transit');
      }
      const excluded = ['archived', 'declined', 'rejected', 'withdrawn'].includes(text(invitation.invitation_status).toLowerCase());
      const reason: FollowupReason = excluded ? 'excluded' : hasOffer ? issues.length ? 'offer_attention' : 'offer'
        : sources.length ? 'reply_without_offer' : response === 'activity' ? 'activity_without_offer' : response === 'unknown' ? 'unknown' : 'unobserved';
      const name = text(vendor.vendor_name) || text(vendor.domain) || vendorId;
      rows.push({ id, vendorId, lane, invitation, name: nameOf ? nameOf(vendorId, name) : name,
        route: `${text(lane.origin) || '—'} → ${text(lane.destination) || '—'}`, reason, response, sources, hasOffer, issues });
    }
  }
  return rows;
}
