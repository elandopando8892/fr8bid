import { callRatewareApi } from '@/lib/api-client';
import type { CarrierReview } from './review.service';
import type { DraftAudiencePolicy } from './reviewed-audience';
import { reconcileFlow, type FlowAudienceRow, type FlowCampaign, type FlowChannel, type FlowMessage, type FlowScope, type FlowSnapshot } from './batch-flow';

type RecordValue = Record<string, unknown>;
type Read = (action: string, body?: RecordValue) => Promise<unknown>;
export type FlowResult = { kind: 'choose'; campaigns: FlowCampaign[] } | { kind: 'ready'; snapshot: FlowSnapshot };
export class FlowReadError extends Error {
  constructor(public code: 'incomplete' | 'scope' | 'selection' | 'changed') { super(code); }
}
const fail = (): never => { throw new FlowReadError('incomplete'); };
const record = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : fail();
const text = (value: unknown): string => typeof value === 'string' && value.length > 0 && value.length <= 2000 ? value : fail();
const optional = (value: unknown): string | null => value === null || value === undefined || value === '' ? null : text(value);
const array = (value: unknown): unknown[] => Array.isArray(value) && value.length <= 5000 ? value : fail();
const integer = (value: unknown): number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 5000 ? Number(value) : fail();
function unique(values: string[]) { if (new Set(values).size !== values.length) fail(); }
function policy(value: unknown): DraftAudiencePolicy | undefined {
  if (value === undefined || value === null) return undefined;
  const row = record(value);
  const mode = row.mode === undefined ? 'all_eligible' : text(row.mode);
  if (!['all_eligible', 'selected_carriers', 'saved_segment'].includes(mode)) throw new FlowReadError('selection');
  return { mode, vendor_ids: row.vendor_ids === undefined ? [] : array(row.vendor_ids).map(text), saved_segment_id: optional(row.saved_segment_id) };
}
function validateScope(row: RecordValue, scope: FlowScope) {
  if (row.organization_id !== undefined && row.organization_id !== scope.organizationId) throw new FlowReadError('scope');
  if (row.rfx_event_id !== undefined && row.rfx_event_id !== scope.eventId) throw new FlowReadError('scope');
}

/** Only existing read commands. Bounded pages; no create/generate/send and no retries.
 * This is a multi-read advisory snapshot, not an atomic server approval.
 */
export async function readFlow(scope: FlowScope, channel: FlowChannel, options: { templateId?: string; campaignId?: string } = {},
  isCurrent = () => true, read: Read = callRatewareApi, now = Date.now): Promise<FlowResult> {
  const check = () => { if (!isCurrent()) throw new FlowReadError('changed'); };
  if (!scope.userId || !scope.organizationId || !scope.eventId || !['email', 'whatsapp'].includes(channel)) throw new FlowReadError('scope');
  const checkedAt = now();
  check();
  const campaignResult = record(await read('list_outreach_campaigns', { rfx_event_id: scope.eventId }));
  check();
  // Explicit version and completeness prevent fallback to the former global 100-row cap.
  if (campaignResult.campaign_read_version !== 1 || campaignResult.complete !== true || campaignResult.has_more === true) fail();
  if (campaignResult.rfx_event_id !== scope.eventId || campaignResult.organization_id !== scope.organizationId) throw new FlowReadError('scope');
  const allCampaigns = array(campaignResult.rows).map(record);
  if (integer(campaignResult.total) !== allCampaigns.length) fail();
  const campaigns: FlowCampaign[] = allCampaigns.map(row => {
    if (row.rfx_event_id !== scope.eventId || row.organization_id !== scope.organizationId) throw new FlowReadError('scope');
    if (row.status === 'archived') fail();
    return { id: text(row.id), template_id: optional(row.template_id) ?? undefined, name: optional(row.name) ?? text(row.id), audience_policy: policy(row.audience_policy) };
  });
  unique(campaigns.map(row => row.id));
  const choices = options.templateId ? campaigns.filter(row => row.template_id === options.templateId) : campaigns;
  const campaign = options.campaignId ? choices.find(row => row.id === options.campaignId) : choices.length === 1 ? choices[0] : undefined;
  if (options.campaignId && !campaign) throw new FlowReadError('selection');
  if (choices.length > 1 && !campaign) return { kind: 'choose', campaigns: choices };

  const [previewValue, reviewsValue, segmentsValue] = await Promise.all([
    read('preview_outreach_audience', { rfx_event_id: scope.eventId, channel, status_filter: 'all', audience_policy: { mode: 'all_eligible', require_contact: true } }),
    read('list_rfx_invitation_wave_reviews', { rfx_event_id: scope.eventId }),
    campaign?.audience_policy?.mode === 'saved_segment' ? read('list_outreach_audience_segments', { rfx_event_id: scope.eventId }) : Promise.resolve({ rows: [] }),
  ]);
  check();
  const preview = record(previewValue);
  validateScope(preview, scope);
  if (preview.rfx_event_id !== scope.eventId || preview.channel !== channel) throw new FlowReadError('scope');
  const audience: FlowAudienceRow[] = array(preview.rows).map(value => {
    const row = record(value); validateScope(row, scope);
    const statuses = array(row.invitation_statuses).map(text);
    if (!statuses.length) fail();
    return { vendor_id: text(row.vendor_id), vendor_name: text(row.vendor_name), email: optional(row.email), phone: optional(row.phone),
      invitation_statuses: statuses, audience_status: text(row.audience_status), event_status: text(row.event_status),
      lane_preview: array(row.lane_preview).map(text), shortlisted_lane_count: integer(row.shortlisted_lane_count) };
  });
  unique(audience.map(row => row.vendor_id));
  if (integer(preview.total) !== audience.length || integer(preview.filtered_total) !== audience.length || preview.has_more === true) fail();
  const reviewResponse = record(reviewsValue); validateScope(reviewResponse, scope);
  const reviews: CarrierReview[] = array(reviewResponse.rows).map(value => {
    const row = record(value); validateScope(row, scope);
    if (typeof row.reviewed !== 'boolean') fail();
    const snapshot = row.contact_snapshot ? record(row.contact_snapshot) : {};
    return { vendor_id: text(row.vendor_id), reviewed: row.reviewed as boolean,
      contact_snapshot: { email: optional(snapshot.email), phone: optional(snapshot.phone) } };
  });
  unique(reviews.map(row => row.vendor_id));
  const segmentResponse = record(segmentsValue); validateScope(segmentResponse, scope);
  const segments = array(segmentResponse.rows).map(value => {
    const row = record(value); validateScope(row, scope);
    if (row.active === false) throw new FlowReadError('selection');
    return { id: text(row.id), vendor_ids: array(row.vendor_ids).map(text) };
  });
  unique(segments.map(row => row.id));
  if (segmentResponse.has_more === true) fail();

  const messages: FlowMessage[] = [], seen = new Set<string>();
  let total: number | undefined;
  for (let page = 0; page < 20; page++) {
    check();
    const response = record(await read('list_outreach_messages', { rfx_event_id: scope.eventId, enforce_rfx_event_scope: true,
      compact: true, channels: [channel], include_archived: false, offset: messages.length, limit: 250 }));
    check(); validateScope(response, scope);
    const pageTotal = integer(response.total);
    if (total !== undefined && total !== pageTotal) fail();
    total = pageTotal;
    if (response.offset !== undefined && response.offset !== messages.length) fail();
    const rows = array(response.rows);
    if (rows.length > 250 || typeof response.has_more !== 'boolean') fail();
    for (const value of rows) {
      const row = record(value); validateScope(row, scope);
      if (row.rfx_event_id !== scope.eventId || row.channel !== channel) throw new FlowReadError('scope');
      const id = text(row.id);
      if (seen.has(id) || row.status === 'archived') fail();
      seen.add(id);
      messages.push({ id, vendor_id: optional(row.vendor_id), campaign_id: optional(row.campaign_id), status: text(row.status), tracking_state: optional(row.tracking_state) });
    }
    if (!response.has_more) {
      if (messages.length !== total) fail();
      check();
      return { kind: 'ready', snapshot: reconcileFlow({ scope, channel, checkedAt, campaign: campaign ?? null, audience, reviews, messages, segments }) };
    }
    if (!rows.length || messages.length >= total) fail();
  }
  return fail();
}
