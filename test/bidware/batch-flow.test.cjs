const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { buildSync } = require('esbuild');
const { fixture, reader, uid } = require('./batch-flow.fixture.cjs');
function load(file) {
  const built = buildSync({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['@/lib/api-client'] });
  const module = { exports: {} };
  vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require: () => ({ callRatewareApi: () => { throw new Error('Real API forbidden'); } }), Date, Set, Map });
  return module.exports;
}
const { readFlow } = load('src/bidware/features/outreach/batch-flow.service.ts');
const { flowIsCurrent, FLOW_TTL_MS } = load('src/bidware/features/outreach/batch-flow.ts');
async function run(data = fixture(), transform, options = {}, isCurrent = () => true) { return readFlow(data.scope, 'email', options, isCurrent, reader(data, transform), () => 1000); }
test('selection is reconciled with reviewed contacts, existing messages and independent exceptions', async () => {
  const data = fixture(); const { snapshot: s } = await run(data);
  assert.equal(s.counts.total, 12); assert.equal(s.counts.selected, 11); assert.equal(s.counts.reviewed, 10);
  assert.equal(s.counts.prepare, 2); assert.equal(s.counts.existing, 4); assert.equal(s.counts.pending, 5);
  assert.equal(s.counts.existingAttention, 2);
  assert.equal(s.counts.messages, 8); assert.equal(s.counts.outsideMessages, 3);
  const reasons = Object.fromEntries(s.rows.map(row => [row.id, row.reason]));
  assert.equal(reasons[uid(1)], 'prepare'); assert.equal(reasons[uid(2)], 'not_reviewed');
  assert.equal(reasons[uid(3)], 'no_contact'); assert.equal(reasons[uid(4)], 'suppressed');
  assert.equal(reasons[uid(7)], 'uncertain'); assert.equal(reasons[uid(8)], 'multiple');
  assert.equal(reasons[uid(9)], 'contact_changed'); assert.equal(reasons[uid(10)], 'response');
  assert.equal(s.rows.find(row => row.id === uid(12)).selected, false);
  assert.ok(data.calls.every(call => /^(list_|preview_)/.test(call.action)));
});
test('an explicit empty selection stays empty; all_eligible with IDs still respects those IDs', async () => {
  const data = fixture(); data.campaigns[0].audience_policy.vendor_ids = [];
  assert.equal((await run(data)).snapshot.counts.selected, 0);
  data.campaigns[0].audience_policy = { mode: 'all_eligible', vendor_ids: [uid(1)] };
  assert.equal((await run(data)).snapshot.counts.selected, 1);
});
test('selection intersects the current event, not names or historic documents', async () => {
  const data = fixture(); data.campaigns[0].audience_policy.vendor_ids = [uid(1), uid(555)];
  data.audience[1].vendor_name = data.audience[0].vendor_name;
  assert.equal((await run(data)).snapshot.counts.selected, 1);
});
test('saved segment is read; disappearance or unknown policy fails closed', async () => {
  const data = fixture(); data.campaigns[0].audience_policy = { mode: 'saved_segment', saved_segment_id: uid(91) };
  await assert.rejects(run(data));
  data.segments = [{ id: uid(91), rfx_event_id: data.scope.eventId, vendor_ids: [uid(1)] }];
  assert.equal((await run(data)).snapshot.counts.selected, 1);
  data.campaigns[0].audience_policy.mode = 'new_unknown_mode'; await assert.rejects(run(data));
});
test('declined and archived invitations do not enter the preparation audience', async () => {
  const data = fixture(); data.audience[0].invitation_statuses = ['declined']; data.audience[10].invitation_statuses = ['archived'];
  const s = (await run(data)).snapshot;
  assert.equal(s.counts.total, 10); assert.equal(s.counts.prepare, 0);
});
test('a record from another campaign prevents a new preparation for that carrier/channel', async () => {
  const data = fixture(); data.messages.push({ ...data.message(300, 1), campaign_id: uid(701) });
  assert.equal((await run(data)).snapshot.rows[0].reason, 'existing');
});
for (const status of ['delivery_unknown', 'sending', 'failed', 'bounced', 'suppressed']) test(`${status} is reconciliation, never a retry or readiness claim`, async () => {
  const data = fixture(); data.messages = [data.message(350, 1, status)];
  assert.equal((await run(data)).snapshot.rows[0].reason, 'uncertain');
});
test('changed contact or absent review snapshot never counts as reviewed for preparation', async () => {
  const data = fixture(); delete data.reviews[0].contact_snapshot;
  assert.equal((await run(data)).snapshot.rows[0].reason, 'contact_changed');
});
test('an uncertain stored status cannot be hidden by a different tracking label', async () => {
  const data = fixture(); data.messages = [{ ...data.message(351, 1, 'delivery_unknown'), tracking_state: 'sent' }];
  assert.equal((await run(data)).snapshot.rows[0].reason, 'uncertain');
  data.messages = [{ ...data.message(352, 1, 'sent'), tracking_state: 'bounced' }];
  assert.equal((await run(data)).snapshot.rows[0].reason, 'uncertain');
});
test('one carrier and channel per row even with several routes; no unearned route qualification', async () => {
  const data = fixture(); data.audience[0].shortlisted_lane_count = 4;
  assert.equal((await run(data)).snapshot.rows[0].routeCount, 4);
  assert.equal((await run(data)).snapshot.rows[0].messages.length, 0);
});
test('WhatsApp is read separately, uses reviewed phone and has no writes', async () => {
  const data = fixture(); const result = await readFlow(data.scope, 'whatsapp', {}, () => true, reader(data), () => 1000);
  assert.equal(result.snapshot.channel, 'whatsapp'); assert.equal(result.snapshot.counts.messages, 0);
  assert.equal(result.snapshot.rows[0].reason, 'prepare');
  data.reviews[0].contact_snapshot.phone = '+528188888888';
  assert.equal((await readFlow(data.scope, 'whatsapp', {}, () => true, reader(data), () => 1000)).snapshot.rows[0].reason, 'contact_changed');
});
test('multiple campaigns require explicit selection; no campaign is created', async () => {
  const data = fixture(); data.campaigns.push({ ...data.campaigns[0], id: uid(701) });
  const result = await run(data); assert.equal(result.kind, 'choose'); assert.equal(data.calls.length, 1);
  assert.equal((await run(data, undefined, { campaignId: uid(701) })).snapshot.campaign.id, uid(701));
  await assert.rejects(run(data, undefined, { campaignId: uid(999) }));
});
test('Message template selection cannot adopt a campaign from another template', async () => {
  const data = fixture();
  await assert.rejects(run(data, undefined, { templateId: uid(601), campaignId: uid(700) }));
  assert.equal((await run(data, undefined, { templateId: uid(601) })).snapshot.campaign, null);
});
test('complete scoped campaigns above the former cap remain selectable', async () => {
  const data = fixture(); data.campaigns = Array.from({ length: 100 }, (_, i) => ({ ...data.campaigns[0], id: uid(700 + i) }));
  const result = await run(data); assert.equal(result.kind, 'choose'); assert.equal(result.campaigns.length, 100);
  assert.equal(data.calls[0].rfx_event_id, data.scope.eventId);
});
test('reads every page once and accounts for all 501 messages', async () => {
  const data = fixture(); data.messages = Array.from({ length: 501 }, (_, i) => data.message(i, i % 12 + 1));
  const result = await run(data); assert.equal(result.snapshot.counts.messages, 501);
  assert.deepEqual(data.calls.filter(call => call.action === 'list_outreach_messages').map(call => call.offset), [0, 250, 500]);
});
const faults = {
  legacy_campaign_contract: (v, a) => a === 'list_outreach_campaigns' ? { rows: v.rows } : v,
  incomplete_campaigns: (v, a) => a === 'list_outreach_campaigns' ? { ...v, complete: false } : v,
  unknown_campaign_contract: (v, a) => a === 'list_outreach_campaigns' ? { ...v, campaign_read_version: 2 } : v,
  remaining_campaign_page: (v, a) => a === 'list_outreach_campaigns' ? { ...v, has_more: true } : v,
  partial_campaign_total: (v, a) => a === 'list_outreach_campaigns' ? { ...v, total: v.total + 1 } : v,
  duplicate_campaigns: (v, a) => a === 'list_outreach_campaigns' ? { ...v, rows: [v.rows[0], v.rows[0]], total: 2 } : v,
  foreign_campaign_envelope: (v, a) => a === 'list_outreach_campaigns' ? { ...v, rfx_event_id: uid(801) } : v,
  foreign_campaign_org: (v, a) => a === 'list_outreach_campaigns' ? { ...v, organization_id: 'other' } : v,
  foreign_campaign_row: (v, a) => a === 'list_outreach_campaigns' ? { ...v, rows: [{ ...v.rows[0], organization_id: 'other' }] } : v,
  archived_campaign_row: (v, a) => a === 'list_outreach_campaigns' ? { ...v, rows: [{ ...v.rows[0], status: 'archived' }] } : v,
  foreign_event: (v, a, b) => a === 'preview_outreach_audience' ? { ...v, rfx_event_id: uid(801) } : v,
  foreign_org: (v, a) => a === 'preview_outreach_audience' ? { ...v, organization_id: 'other' } : v,
  foreign_channel: (v, a) => a === 'preview_outreach_audience' ? { ...v, channel: 'whatsapp' } : v,
  incomplete_preview: (v, a) => a === 'preview_outreach_audience' ? { ...v, total: v.total + 1 } : v,
  duplicate_carrier: (v, a) => a === 'preview_outreach_audience' ? { ...v, rows: [v.rows[0], ...v.rows.slice(0, -1)] } : v,
  duplicate_review: (v, a) => a === 'list_rfx_invitation_wave_reviews' ? { rows: [v.rows[0], ...v.rows] } : v,
  missing_review_response: (v, a) => a === 'list_rfx_invitation_wave_reviews' ? {} : v,
  foreign_segment: (v, a) => a === 'list_rfx_invitation_wave_reviews' ? { ...v, rfx_event_id: uid(801) } : v,
  malformed_contact: (v, a) => a === 'preview_outreach_audience' ? { ...v, rows: [{ ...v.rows[0], phone: {} }, ...v.rows.slice(1)] } : v,
  foreign_message: (v, a) => a === 'list_outreach_messages' ? { ...v, rows: [{ ...v.rows[0], rfx_event_id: uid(801) }, ...v.rows.slice(1)] } : v,
  wrong_message_channel: (v, a) => a === 'list_outreach_messages' ? { ...v, rows: [{ ...v.rows[0], channel: 'whatsapp' }, ...v.rows.slice(1)] } : v,
  missing_message_total: (v, a) => a === 'list_outreach_messages' ? { ...v, total: undefined } : v,
  duplicate_messages: (v, a) => a === 'list_outreach_messages' ? { ...v, rows: [v.rows[0], ...v.rows.slice(0, -1)] } : v,
  partial_messages: (v, a) => a === 'list_outreach_messages' ? { ...v, total: v.total + 1 } : v,
  stuck_page: (v, a) => a === 'list_outreach_messages' ? { ...v, rows: [], has_more: true } : v,
  wrong_offset: (v, a) => a === 'list_outreach_messages' ? { ...v, offset: 999 } : v,
};
for (const [name, fault] of Object.entries(faults)) test(`${name} removes confidence instead of producing an empty/ready result`, async () => { await assert.rejects(run(fixture(), fault)); });
test('a total changing between pages invalidates the entire result', async () => {
  const data = fixture(); data.messages = Array.from({ length: 300 }, (_, i) => data.message(i, 1));
  await assert.rejects(run(data, (v, a, b) => a === 'list_outreach_messages' && b.offset ? { ...v, total: 301 } : v));
});
test('interruption is not retried; a new explicit read can recover with no writes', async () => {
  const data = fixture();
  await assert.rejects(run(data, (v, a) => { if (a === 'list_outreach_messages') throw new Error('Connection lost'); return v; }));
  assert.equal(data.calls.filter(call => call.action === 'list_outreach_messages').length, 1);
  assert.equal((await run(data)).kind, 'ready');
});
test('account switch during read stops before another page and discards the result', async () => {
  const data = fixture(); let current = true;
  await assert.rejects(run(data, (v, a) => { if (a === 'list_outreach_campaigns') current = false; return v; }, {}, () => current));
  assert.equal(data.calls.length, 1);
});
test('freshness binds user, role, organization and event and rejects clock reversal', async () => {
  const data = fixture(), s = (await run(data)).snapshot;
  assert.equal(flowIsCurrent(s, data.scope, 1000), true);
  assert.equal(flowIsCurrent(s, data.scope, 1000 + FLOW_TTL_MS), false);
  assert.equal(flowIsCurrent(s, data.scope, 999), false);
  for (const key of ['userId', 'organizationId', 'role', 'eventId']) assert.equal(flowIsCurrent(s, { ...data.scope, [key]: 'other' }, 1001), false);
});
