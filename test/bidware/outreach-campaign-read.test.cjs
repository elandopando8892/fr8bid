const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { buildSync } = require('esbuild');
const { fixture, reader, uid } = require('./batch-flow.fixture.cjs');
const source = buildSync({ entryPoints: ['src/bidware/features/outreach/outreach.service.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', define: { 'process.env.NODE_ENV': '"production"' }, external: ['@/lib/api-client', '@/config/env'] }).outputFiles[0].text;
function service(read) {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: id => id === '@/lib/api-client' ? { callRatewareApi: read } : { env: {} }, Date, Set, Map });
  return module.exports.listOutreachCampaigns;
}
test('Message and launch recover the saved campaign beyond the global 100-row cap', async () => {
  const data = fixture(), first = data.campaigns[0];
  data.campaigns.push(...Array.from({ length: 130 }, (_, i) => ({ ...first, id: uid(10000+i), rfx_event_id: uid(20000+i) })));
  const rows = await service(reader(data))(data.scope.eventId);
  assert.equal(rows.length, 1); assert.equal(rows[0].id, first.id);
  assert.equal(data.calls[0].rfx_event_id, data.scope.eventId);
});
test('global callers retain their legacy request', async () => {
  const data = fixture(); const rows = await service(reader(data))();
  assert.equal(rows.length, 1); assert.equal(data.calls[0].rfx_event_id, undefined);
});
for (const fault of ['legacy','partial','scope','org','duplicate','archived']) test(`${fault} cannot become first preparation in Message`, async () => {
  const data=fixture(); const read=reader(data,(v,a)=>{
    if(a!=='list_outreach_campaigns')return v;
    if(fault==='legacy')delete v.campaign_read_version;
    if(fault==='partial')v.total++;
    if(fault==='scope')v.rows[0].rfx_event_id=uid(999);
    if(fault==='org')v.rows[0].organization_id='other';
    if(fault==='duplicate'){v.rows.push(v.rows[0]);v.total++;}
    if(fault==='archived')v.rows[0].status='archived';
    return v;
  });
  await assert.rejects(service(read)(data.scope.eventId));assert.equal(data.calls.length,1);
});
