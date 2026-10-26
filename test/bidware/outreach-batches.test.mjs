import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=await build({entryPoints:['src/bidware/features/outreach/send-batches.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {planSendBatches,runSendBatches}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const rows=n=>Array.from({length:n},(_,i)=>({id:'message-'+i,channel:'email',updated_at:'2026-10-17T10:00:00.123456+00:00'}));
// Synthetic review evidence only; no signature is sent to a real provider.
const whatsappRow = () => ({ id: 'whatsapp-1', channel: 'whatsapp',
 updated_at: '2026-10-17T10:00:00.123456+00:00',
 whatsapp_approval: {contract:'bidware.whatsapp-approval.v1', fingerprint:'a'.repeat(64),
 issued_at: 1792742400000, expires_at: 1792743300000, signature:'b'.repeat(64)} });
function setup(n=121,minutes=1){let serial=0,active=true;const calls=[],waits=[],progress=[];const plan=planSendBatches(rows(n),new Map(),()=>String(++serial));const options={batches:plan,intervalMinutes:minutes,isCurrent:()=>active,send:async(ids,ch,op)=>{calls.push({ids,ch,op});return{sent:ids.length};},wait:async(ms)=>{waits.push(ms);},onProgress:p=>progress.push(p)};return{plan,options,calls,waits,progress,stop:()=>active=false};}
test('selection has no total cap; unique IDs, batches of 50 and stable exact payload IDs',()=>{let serial=0;const ids=new Map();const input=[...rows(301),...rows(2)];const a=planSendBatches(input,ids,()=>String(++serial));const b=planSendBatches(input,ids,()=>String(++serial));assert.deepEqual(a,b);assert.deepEqual(a.map(b=>b.ids.length),[50,50,50,50,50,50,1]);assert.equal(new Set(a.flatMap(b=>b.ids)).size,301);assert.notEqual(planSendBatches(rows(49),ids,()=>String(++serial))[0].operationId,a[0].operationId);});
for(const minutes of [1,5])test('pause '+minutes+' minute(s) after each completed batch, never before first/after last',async()=>{const x=setup(121,minutes);const r=await runSendBatches(x.options);assert.equal(r.status,'complete');assert.equal(r.sent,121);assert.deepEqual(x.waits,[minutes*60000,minutes*60000]);assert.deepEqual(x.calls.map(c=>c.ids.length),[50,50,21]);});
test('stop/account/event invalidation while waiting prevents subsequent batches',async()=>{const x=setup();x.options.wait=async()=>x.stop();const r=await runSendBatches(x.options);assert.equal(r.status,'stopped');assert.equal(x.calls.length,1);});
test('invalid identity before start produces no send',async()=>{const x=setup();x.stop();const r=await runSendBatches(x.options);assert.equal(r.status,'stopped');assert.equal(x.calls.length,0);});
for(const result of [{sent:49,failed:1},{sent:49,skipped:1},{sent:49,delivery_unknown:1},{},{sent:50,failures:[{reason:'failure'}]}])test('partial/malformed outcome stops without retries '+JSON.stringify(result),async()=>{const x=setup();x.options.send=async()=>{x.calls.push(1);return result;};const r=await runSendBatches(x.options);assert.equal(r.status,'attention');assert.equal(x.calls.length,1);assert.equal(x.waits.length,0);});
test('lost response stops and exposes uncertainty without retry',async()=>{const x=setup();x.options.send=async()=>{x.calls.push(1);throw Error('connection lost');};const r=await runSendBatches(x.options);assert.equal(r.status,'attention');assert.match(r.error,/connection lost/);assert.equal(x.calls.length,1);assert.equal(x.waits.length,0);});
test('channels stay separate in a single serial sequence',async()=>{let n=0;const plan=planSendBatches([...rows(1),whatsappRow()],new Map(),()=>String(++n));assert.deepEqual(plan.map(b=>b.channel),['email','whatsapp']);const x=setup();x.options.batches=plan;await runSendBatches(x.options);assert.equal(x.calls.length,2);assert.deepEqual(x.waits,[60000]);});

// Exercise the real service contract at its API boundary, including pagination.
const service=await build({entryPoints:['src/bidware/features/outreach/outreach.service.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'api-fixture',setup(b){
 b.onResolve({filter:/^@\/lib\/api-client$/},()=>({path:'api',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const callRatewareApi=(a,p)=>globalThis.batchFixture(a,p);',loader:'js'}));
 b.onResolve({filter:/^@\/config\/env$/},()=>({path:'env',namespace:'env'}));
 b.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env={appOrigin:"http://127.0.0.1:3183"};',loader:'js'}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(service.outputFiles[0].text).toString('base64'));
test('reads all draft pages with the same event scope',async()=>{const calls=[];globalThis.batchFixture=async(a,p)=>{calls.push(p);const all=rows(601);return{rows:all.slice(p.offset,p.offset+p.limit),total:601,has_more:p.offset+p.limit<601};};const result=await api.listAllQueueDrafts('event-a','email');assert.equal(result.rows.length,601);assert.deepEqual(calls.map(c=>c.offset),[0,250,500]);assert.ok(calls.every(c=>c.rfx_event_id==='event-a'&&c.enforce_rfx_event_scope&&c.tracking_status==='drafted'));});
test('page read failure and stale scope cannot approve a partial selection',async()=>{let calls=0;globalThis.batchFixture=async()=>{if(calls++)throw Error('page unavailable');return{rows:rows(250),total:500,has_more:true};};await assert.rejects(()=>api.listAllQueueDrafts('a','email'),/page unavailable/);let active=true;globalThis.batchFixture=async()=>{active=false;return{rows:rows(1),total:1};};await assert.rejects(()=>api.listAllQueueDrafts('a','email',()=>active),/scope changed/);});
test('non-advancing pagination errors instead of looping',async()=>{globalThis.batchFixture=async()=>({rows:rows(250),total:600,has_more:true});await assert.rejects(()=>api.listAllQueueDrafts('a','email'),/did not advance/);});
test('draft generation retains the published email zero-limit request and channel separation',async()=>{const calls=[];globalThis.batchFixture=async(a,p)=>{calls.push({a,p});return{};};await api.generateOutreachDrafts({campaign_id:'a',channel:'email',operation_id:'same-op'});await api.generateOutreachDrafts({campaign_id:'a',channel:'whatsapp',operation_id:'other-op'});assert.deepEqual(calls[0].p.contact_policy,{daily_limit:0});assert.equal(calls[0].a,'generate_outreach_drafts');assert.equal(calls[1].a,'generate_outreach_drafts');assert.equal(calls[1].p.operation_id,'other-op');assert.equal(calls[0].p.operation_id,'same-op');assert.equal(calls[1].p.contact_policy,undefined);});

test('approval freezes microsecond versions and a new revision gets a new operation',async()=>{
 let n=0;const cache=new Map(),input=rows(1),before=planSendBatches(input,cache,()=>String(++n));
 input[0].updated_at='2026-10-17T10:00:00.123457+00:00';
 const after=planSendBatches(input,cache,()=>String(++n));
 assert.notEqual(before[0].operationId,after[0].operationId);
 assert.equal(before[0].expectedVersions[0].updated_at,'2026-10-17T10:00:00.123456+00:00');
 const x=setup(1);x.options.batches=before;x.options.send=async(ids,ch,op,expected)=>{assert.deepEqual(expected,before[0].expectedVersions);return{sent:1};};
 await runSendBatches(x.options);
});
for (const channel of ['email','whatsapp']) test(channel+' requires a nonempty consistent version',()=>{
 for (const updated_at of [undefined,null,'',0]) {
  assert.throws(()=>planSendBatches([{id:'a',channel,updated_at}],new Map(),()=>''),/OUTREACH_APPROVAL_REQUIRED/);
 }
 const row={id:'a',channel,updated_at:'2026-10-17T10:00:00.123456+00:00'};
 assert.throws(()=>planSendBatches([row,{...row,updated_at:'2026-10-17T10:00:00.123457+00:00'}],new Map(),()=>''),/OUTREACH_APPROVAL_REQUIRED/);
});

test('WhatsApp freezes review evidence and changed approval gets a new operation',()=>{
 const row=whatsappRow(), cache=new Map(); let serial=0;
 const before=planSendBatches([row],cache,()=>String(++serial));
 const original=structuredClone(row.whatsapp_approval);
 row.whatsapp_approval.signature='c'.repeat(64);
 const after=planSendBatches([row],cache,()=>String(++serial));
 assert.deepEqual(before[0].expectedVersions,[{id:row.id,updated_at:row.updated_at,whatsapp_approval:original}]);
 assert.notEqual(before[0].operationId,after[0].operationId);
 assert.deepEqual(planSendBatches([row],cache,()=>String(++serial)),after);
});

test('WhatsApp conflicting signed reviews cannot share a batch',()=>{
 const row=whatsappRow();
 for(const conflicting of [null,undefined,{...row.whatsapp_approval,signature:'c'.repeat(64)}]) {
  assert.throws(()=>planSendBatches([row,{...row,whatsapp_approval:conflicting}],new Map(),()=>''),/OUTREACH_APPROVAL_REQUIRED/);
 }
});

test('both transports carry exact versions and keep channel-specific confirmations',async()=>{
 const calls=[];globalThis.batchFixture=async(a,p)=>{calls.push({a,p});return{sent:1};};
 const email=[{id:'a',updated_at:'2026-10-17T10:00:00.123456+00:00'}];
 const row=whatsappRow();
 const whatsapp=[{id:row.id,updated_at:row.updated_at,whatsapp_approval:row.whatsapp_approval}];
 await api.sendOutreachMessages(['a'],'email','operation',email);
 await api.sendOutreachMessages([row.id],'whatsapp','other',whatsapp);
 assert.deepEqual(calls,[
  {a:'send_outreach_messages',p:{ids:['a'],expected_versions:email,channel:'email',provider:'gmail',confirmed:true,confirmation_action:'send_outreach_messages',operation_id:'operation'}},
  {a:'send_whatsapp_outreach_messages',p:{ids:[row.id],expected_versions:whatsapp,confirmed:true,confirmation_action:'send_whatsapp_outreach_messages',operation_id:'other'}},
 ]);
});
