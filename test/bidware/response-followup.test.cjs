const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { buildSync } = require('esbuild');
const { fixture, uid } = require('./response-followup.fixture.cjs');
let read, calls;
function load(file) {
  const built = buildSync({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['@/lib/api-client'] });
  const module = { exports: {} };
  vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, Date, Set, Map, require: () => ({ callRatewareApi: async (action, body) => { calls.push({ action, body }); return read(); } }) });
  return module.exports;
}
const { readResponseFollowup } = load('src/bidware/features/rfx-admin/response-followup.service.ts');
const { reconcileResponses, responseSourcePath, followupCurrent, FOLLOWUP_TTL } = load('src/bidware/features/rfx-admin/response-followup.ts');
async function run(data = fixture()) { calls = []; read = () => data.context; return readResponseFollowup(data.scope); }

test('read is one existing RFx read without synchronization or commercial actions', async () => {
  const d = fixture(), evidence = await run(d);
  assert.equal(calls.length, 1); assert.equal(calls[0].action, 'list_rfx_event_context');
  assert.equal(calls[0].body.rfx_event_id, d.scope.eventId); assert.equal(Object.keys(calls[0].body).length, 1);
  assert.equal(evidence.signals.length, 2);
});
test('responses, team messages, activity and existing offers remain distinct by route', async () => {
  const d = fixture(), before = JSON.stringify(d), rows = reconcileResponses(d.lanes, await run(d));
  const row = n => rows.find(r => r.id === uid(n));
  assert.equal(row(1001).reason, 'offer'); assert.equal(row(1001).response, 'event');
  assert.equal(row(1011).reason, 'reply_without_offer'); assert.equal(row(1011).response, 'event');
  assert.equal(row(1002).response, 'lane'); assert.equal(row(1012).response, 'unobserved');
  assert.equal(row(1004).reason, 'activity_without_offer'); assert.equal(row(1005).reason, 'unobserved');
  assert.equal(row(1006).reason, 'excluded'); assert.equal(row(1003).reason, 'offer_attention');
  assert.equal(row(1003).sources.length, 0); assert.equal(row(1003).issues.join(','), 'expired,transit');
  assert.equal(JSON.stringify(d), before);
});
for (const status of ['quoted', 'delivered', 'read', 'sent', 'drafted', 'delivery_unknown']) test(`${status} is not a response`, async () => {
  const d = fixture(); d.context.outreach_messages[0].tracking_state = status;
  assert.equal((await run(d)).signals.filter(s => s.kind === 'queue').length, 0);
});
test('partial coverage retains positive observations and does not assert absence', async () => {
  const d = fixture(); d.context.outreach_messages_limited = true;
  const e = await run(d), rows = reconcileResponses(d.lanes, e);
  assert.equal(e.partial, true); assert.equal(rows.find(r => r.id === uid(1005)).reason, 'unknown');
  assert.equal(rows.find(r => r.id === uid(1002)).response, 'lane');
});
test('missing chat with explicit warning is partial, without warning is invalid', async () => {
  const d = fixture(); d.context.chat = null; d.context.warnings.chat = 'Synthetic unavailable';
  assert.equal((await run(d)).partial, true); delete d.context.warnings.chat; await assert.rejects(run(d));
});
test('unattributed group carrier response stays unknown', async () => {
  const d = fixture(), t = d.thread(650, 2, 100); t.thread_type = 'event_group'; t.vendor_id = null; t.rfx_lane_id = null; t.messages[0].vendor_id = null; t.messages[0].rfx_lane_id = null;
  d.context.chat.rows = [t]; const e = await run(d); assert.equal(e.partial, true); assert.equal(e.signals.filter(s => s.kind === 'chat').length, 0);
});
test('group reply can identify only its explicit carrier and route', async () => {
  const d = fixture(), t = d.thread(650, 2, 100); t.thread_type = 'event_group'; t.vendor_id = null; t.rfx_lane_id = null; d.context.chat.rows = [t];
  const rows = reconcileResponses(d.lanes, await run(d)); assert.equal(rows.find(r => r.id === uid(1002)).response, 'lane'); assert.equal(rows.find(r => r.id === uid(1012)).response, 'unobserved');
});
for (const [name, change] of [
  ['foreign event', d => { d.context.chat.event.id = uid(999); }],
  ['foreign organization', d => { d.context.chat.event.organization_id = 'other'; }],
  ['foreign queue source', d => { d.context.outreach_messages[0].rfx_event_id = uid(999); }],
  ['foreign thread', d => { d.context.chat.rows[0].rfx_event_id = uid(999); }],
  ['foreign message', d => { d.context.chat.rows[0].messages[0].rfx_event_id = uid(999); }],
  ['wrong thread', d => { d.context.chat.rows[0].messages[0].thread_id = uid(999); }],
  ['wrong vendor', d => { d.context.chat.rows[0].messages[0].vendor_id = uid(999); }],
  ['wrong route', d => { d.context.chat.rows[0].messages[0].rfx_lane_id = uid(999); }],
  ['duplicate message', d => { d.context.outreach_messages.push(d.context.outreach_messages[0]); }],
  ['duplicate thread', d => { d.context.chat.rows.push(d.context.chat.rows[0]); }],
  ['missing coverage', d => { delete d.context.outreach_messages_limited; }],
  ['malformed rows', d => { d.context.outreach_messages = null; }],
  ['duplicate activity', d => { d.context.response_vendor_ids.push(uid(1)); }],
]) test(`rejects ${name}`, async () => { const d = fixture(); change(d); await assert.rejects(run(d)); });
for (const [name, change] of [
  ['duplicate invitation', d => { d.lanes[0].invitations.push(d.lanes[0].invitations[0]); }],
  ['duplicate vendor route', d => { d.lanes[0].invitations.push({ ...d.lanes[0].invitations[0], id: uid(999) }); }],
  ['foreign lane', d => { d.lanes[0].rfx_event_id = uid(999); }],
  ['wrong invitation route', d => { d.lanes[0].invitations[0].rfx_lane_id = uid(999); }],
  ['wrong vendor master', d => { d.lanes[0].invitations[0].vendors.id = uid(999); }],
  ['contradictory source invitation', d => { d.context.outreach_messages[0].rfx_lane_vendor_id = uid(1002); }],
  ['unknown source route', d => { d.context.outreach_messages[0].rfx_lane_id = uid(999); }],
]) test(`rejects ${name} before displaying totals`, async () => { const d = fixture(); change(d); const e = await run(d); assert.throws(() => reconcileResponses(d.lanes, e)); });
test('viewer can read, an unverified role cannot call the API', async () => {
  const d = fixture(); d.scope.role = 'viewer'; await run(d); d.scope.role = 'unknown'; await assert.rejects(run(d)); assert.equal(calls.length, 0);
});
test('scope, backwards clocks and five-minute expiry invalidate snapshots', async () => {
  const d = fixture(), e = await run(d); assert.equal(followupCurrent(e, d.scope, e.checkedAt), true);
  assert.equal(followupCurrent(e, d.scope, e.checkedAt - 1), false); assert.equal(followupCurrent(e, d.scope, e.checkedAt + FOLLOWUP_TTL), false);
  for (const key of ['userId', 'organizationId', 'role', 'eventId']) assert.equal(followupCurrent(e, { ...d.scope, [key]: 'changed' }, e.checkedAt), false);
});
test('anonymous display keeps stable IDs and hides names', async () => {
  const d = fixture(), rows = reconcileResponses(d.lanes, await run(d), () => 'Carrier A-01'); assert.ok(rows.every(r => r.name === 'Carrier A-01')); assert.equal(rows[0].vendorId, uid(1));
});
test('same-day zero transit is valid; missing or negative transit is advisory only', async () => {
  const d = fixture(), offer = d.lanes[0].invitations[0]; offer.transit_days = 0;
  const evidence = await run(d); assert.equal(reconcileResponses(d.lanes, evidence)[0].issues.length, 0);
  offer.transit_days = -1; assert.ok(reconcileResponses(d.lanes, evidence)[0].issues.includes('transit'));
  offer.transit_days = ''; assert.ok(reconcileResponses(d.lanes, evidence)[0].issues.includes('transit'));
});
test('source URLs retain exact event and source and encode path/query input', () => {
  assert.equal(responseSourcePath(uid(800), { id: uid(600), kind: 'chat' }), `/rfx/${uid(800)}/chat?thread=${uid(600)}`);
  assert.ok(responseSourcePath('x/y', { id: 'a&b', kind: 'queue' }).includes('x%2Fy/delivery?message=a%26b'));
});
