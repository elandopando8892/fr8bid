import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const out=path.resolve('../lab/unit');fs.mkdirSync(out,{recursive:true});
await build({entryPoints:['src/bidware/features/outreach/draft-preparation.ts'],outfile:path.join(out,'draft-preparation.cjs'),bundle:true,platform:'node',format:'cjs'});
const {draftReceipt,prepareDraftChannels}=createRequire(import.meta.url)(path.join(out,'draft-preparation.cjs'));
const channels=['email','whatsapp','whatsapp_group'];
const receipt=(n=35)=>({generated:n,rows:[],skipped:[]});
function inputs(prepare=async()=>receipt()){
 const history=[],calls=[],confirmed=[];let current=true;
 return {history,calls,confirmed,leave:()=>current=false,input:{channels,campaign:async()=>'campaign',prepare:async(id,c)=>{calls.push([id,c]);return prepare(id,c)},isCurrent:()=>current,progress:s=>history.push(structuredClone(s)),confirmed:c=>confirmed.push(c)}};
}
test('current API generated count takes precedence over its deliberately empty rows',()=>assert.equal(draftReceipt(receipt()).prepared,35));
test('legacy rows and explicit zero remain valid receipts',()=>{assert.equal(draftReceipt({rows:[{},{}]}).prepared,2);assert.equal(draftReceipt(receipt(0)).prepared,0)});
for(const [name,value] of Object.entries({missing:undefined,null:null,array:[],empty:{},negative:receipt(-1),decimal:receipt(1.2),string:receipt('35'),notFinite:receipt(Infinity),badSkips:{generated:2,skipped:'bad'},nullSkip:{generated:2,skipped:[null]}}))test(`reject malformed ${name} rather than claim zero`,()=>assert.throws(()=>draftReceipt(value)));
test('scope mismatch is never confirmation',()=>{for(const data of [{campaign_id:'foreign'},{requested_channels:['whatsapp']},{requested_channels:['email','whatsapp']}])assert.throws(()=>draftReceipt({...receipt(),...data},{campaignId:'campaign',channel:'email'}))});
test('omissions keep counts and reason codes without trusting object values as text',()=>assert.deepEqual(draftReceipt({generated:0,skipped:[{reason_code:'daily_cap',reason:{html:'unsafe'}}]}),{prepared:0,skipped:[{reason_code:'daily_cap',reason:undefined}]}));
test('three channels run sequentially and publish each receipt',async()=>{const x=inputs();const r=await prepareDraftChannels(x.input);assert.equal(r.phase,'complete');assert.deepEqual(r.steps.map(s=>s.receipt.prepared),[35,35,35]);assert.deepEqual(x.calls.map(c=>c[1]),channels);assert.deepEqual(x.confirmed,channels);assert.equal(x.history[2].steps[0].state,'confirmed');assert.equal(x.history[2].steps[1].state,'waiting')});
for(const kind of ['network','server','malformed','foreign'])test(`partial ${kind} keeps first receipt, stops third, never retries`,async()=>{const x=inputs(async(_,c)=>{if(c==='email')return receipt();if(kind==='malformed')return {};if(kind==='foreign')return {...receipt(),campaign_id:'foreign'};throw new Error(kind)});const r=await prepareDraftChannels(x.input);assert.equal(r.phase,'stopped');assert.deepEqual(r.steps.map(s=>s.state),['confirmed','unconfirmed','waiting']);assert.equal(r.steps[0].receipt.prepared,35);assert.equal(x.calls.length,2);assert.deepEqual(x.confirmed,['email'])});
for(const code of ['reviewed_audience_changed','reviewed_audience_required'])test(`${code} applies only to the rejected channel`,async()=>{const x=inputs(async(_,c)=>{if(c==='email')return receipt();throw Object.assign(new Error('audience'),{code})});const r=await prepareDraftChannels(x.input);assert.equal(r.issue,'audience');assert.deepEqual(r.steps.map(s=>s.state),['confirmed','rejected','waiting']);assert.equal(r.steps[0].receipt.prepared,35)});
test('failed campaign preparation starts no channel',async()=>{const x=inputs();x.input.campaign=async()=>{throw new Error('lost response')};const r=await prepareDraftChannels(x.input);assert.equal(r.phase,'stopped');assert.ok(r.steps.every(s=>s.state==='waiting'));assert.equal(x.calls.length,0)});
test('missing campaign receipt starts no channel',async()=>{const x=inputs();x.input.campaign=async()=>'';assert.equal((await prepareDraftChannels(x.input)).phase,'stopped');assert.equal(x.calls.length,0)});
test('scope lost before campaign creates nothing',async()=>{const x=inputs();x.leave();assert.equal(await prepareDraftChannels(x.input),null);assert.equal(x.history.length,0);assert.equal(x.calls.length,0)});
test('scope lost while campaign pending prevents every channel',async()=>{const x=inputs();x.input.campaign=async()=>{x.leave();return 'campaign'};assert.equal(await prepareDraftChannels(x.input),null);assert.equal(x.calls.length,0);assert.equal(x.history.length,1)});
test('scope lost in-flight suppresses late receipt and next channel',async()=>{const x=inputs(async()=>{x.leave();return receipt()});assert.equal(await prepareDraftChannels(x.input),null);assert.equal(x.calls.length,1);assert.deepEqual(x.confirmed,[]);assert.equal(x.history.at(-1).steps[0].state,'running')});
test('late rejection after leaving cannot update another scope',async()=>{const x=inputs(async()=>{x.leave();throw new Error('late')});assert.equal(await prepareDraftChannels(x.input),null);assert.equal(x.calls.length,1);assert.equal(x.history.at(-1).phase,'running')});
