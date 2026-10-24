const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

// Compile the actual services; mock only their authenticated HTTP boundary.
function service(entry, call) {
  const code = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['@/lib/api-client', '@/i18n/carrier-templates', '@/i18n/carrier-fit'] }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === '@/lib/api-client') return { callRatewareApi: call, ApiError: class extends Error {} };
    if (name.startsWith('@/i18n/')) return { tr: x => x, extra: x => x, words: x => x };
    throw new Error(`Unexpected import ${name}`);
  }});
  return module.exports;
}
const templates = call => service('src/bidware/features/carrier-templates/templates.service.ts', call);
const members = call => service('src/bidware/features/carrier-fit/carrierFit.service.ts', call);
const ids = n => Array.from({length:n}, (_,i) => `member-${i}`);

test('catalog reads beyond 200, preserves lifecycle filter and exact count', async () => {
  const source = ids(401).map(id => ({id})), calls = [];
  const api = templates(async (action, input) => {
    assert.equal(action, 'list_carrier_list_templates'); calls.push(input);
    return {rows:source.slice(input.offset,input.offset+input.limit),total:401,has_more:input.offset+input.limit<401};
  });
  const result = await api.listAllCarrierTemplates({lifecycle_status:'active'});
  assert.equal(result.rows.length,401); assert.equal(result.has_more,false);
  assert.deepEqual(calls.map(x=>x.offset),[0,200,400]);
  assert(calls.every(x=>x.lifecycle_status==='active'&&x.limit===200));
});

for (const fault of ['duplicate','count-change','empty-page','early-end','http']) test(`catalog refuses a partial result after ${fault}`, async () => {
  let count=0;
  const api=templates(async()=>{
    if(count++===0) return {rows:[{id:'A'}],total:fault==='early-end'?3:2,has_more:true};
    if(fault==='http') throw new Error('synthetic 503');
    return {rows:fault==='empty-page'?[]:[{id:fault==='duplicate'?'A':'B'}],total:['count-change','early-end'].includes(fault)?3:2,has_more:fault!=='early-end'};
  });
  await assert.rejects(api.listAllCarrierTemplates()); assert.equal(count,2);
});

test('catalog rejects an advertised excessive size before issuing more reads', async()=>{
  let count=0;const api=templates(async()=>{count++;return {rows:[],total:10001,has_more:true};});
  await assert.rejects(api.listAllCarrierTemplates(),/catalogTooLarge/);assert.equal(count,1);
});

test('1,002 unique members use two bounded batches and preserve a missing CRM ID in the source',async()=>{
  const input=ids(1002), original=[...input], calls=[];
  const api=members(async(action,query)=>{
    assert.equal(action,'list_vendors');calls.push(query);
    return {rows:[...query.ids].reverse().filter(id=>id!=='member-1001').map(id=>({id,status:'inactive'}))};
  });
  const result=await api.listVendorsByIds([...input,input[0]]);
  assert.deepEqual(calls.map(x=>x.ids.length),[1000,2]);
  assert(calls.every(x=>x.lightweight===true&&x.limit===x.ids.length));
  assert.deepEqual(Array.from(result,x=>x.id),ids(1001));assert.deepEqual(input,original);
});

test('empty membership makes no request',async()=>{
  await members(()=>{throw new Error('Unexpected request')}).listVendorsByIds([]);
});

test('failed second member batch never resolves with the first batch',async()=>{
  let count=0;const api=members(async(_,q)=>{if(count++>0)throw new Error('synthetic 503');return {rows:q.ids.map(id=>({id}))};});
  await assert.rejects(api.listVendorsByIds(ids(1001)),/synthetic 503/);assert.equal(count,2);
});

for(const wrong of ['outside-selection','duplicate']) test(`member response rejects ${wrong}`,async()=>{
  const api=members(async()=>({rows:wrong==='duplicate'?[{id:'A'},{id:'A'}]:[{id:'unrequested'}]}));
  await assert.rejects(api.listVendorsByIds(['A']),/invalidMembers/);
});

for (const lifecycle of ['archived', 'draft', undefined, 'unknown']) test(`Carrier Fit rejects a bookmarked template with lifecycle ${lifecycle}`, async () => {
  const calls = [];
  const api = templates(async (action, input) => {
    calls.push({ action, input });
    return { row: { id: 'template-a', lifecycle_status: lifecycle, vendor_ids: ['vendor-a'] } };
  });
  let hydrated = false;
  await assert.rejects(api.getCarrierTemplate('template-a', 'carrier_fit').then(() => { hydrated = true; }), /extra3/);
  assert.equal(hydrated, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'get_carrier_list_template');
  assert.equal(calls[0].input.template_id, 'template-a');
  assert.equal(calls[0].input.usage_context, 'carrier_fit');
});

test('Carrier Fit retains exact active membership and version', async () => {
  const row = { id: 'template-a', lifecycle_status: 'active', template_version: 8, vendor_ids: ['vendor-b', 'vendor-a'] };
  const api = templates(async () => ({ row }));
  assert.equal(await api.getCarrierTemplate('template-a', 'carrier_fit'), row);
});

test('library inspection still reads an archived template without loading Carrier Fit', async () => {
  const row = { id: 'template-a', lifecycle_status: 'archived', vendor_ids: ['vendor-a'] };
  const api = templates(async (_action, input) => {
    assert.equal(input.usage_context, undefined);
    return { row };
  });
  assert.equal(await api.getCarrierTemplate('template-a'), row);
});
