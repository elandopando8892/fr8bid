// Real conversion and request model; only API boundaries are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const built=await build({stdin:{contents:`export * from './src/bidware/features/shipper-intake/intake.service.ts'; export {submitRequest} from './src/bidware/features/shipper-request/request.service.ts'; export {emptyDraft,emptyLane} from './src/bidware/features/shipper-request/request.model.ts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'isolated-api',setup(b){
  b.onResolve({filter:/^@\/lib\/api-client$/},()=>({path:'api',namespace:'fixture'}));
  b.onResolve({filter:/quotedesk\.service$/},()=>({path:'quote',namespace:'fixture'}));
  b.onResolve({filter:/^@\//},a=>({path:resolve('src/bidware',a.path.slice(2)+'.ts')}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='api'?`export const callQuotedeskApi=(action,payload)=>globalThis.intakeFixture.quoteApi(action,payload); export const callRatewareApi=(action,payload)=>globalThis.intakeFixture.api(action,payload); export const callRfxBidApi=(action,payload)=>globalThis.intakeFixture.publicApi(action,payload);`:`export const createQuote=input=>globalThis.intakeFixture.create(input); export const saveQuoteLane=(id,lane)=>globalThis.intakeFixture.lane(id,lane);`,loader:'js'}));
}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
globalThis.window={location:{origin:'http://127.0.0.1:3182'}};
function setup(){
  const calls=[];
  const project={id:uid(1),customer_id:uid(2),title:'Controlled Spot',opportunity_type:'spot',status:'rfi_submitted',rfi_status:'submitted',notes:null};
  const draft=m.emptyDraft('spot',project);draft.contact={company:'Fixture',name:'Controlled',email:'controlled@example.test',phone:'555'};
  draft.currency='USD';draft.lanes=[{...m.emptyLane('spot'),origin:{city:'Monterrey',state_code:'NL',country:'MX'},destination:{city:'Dallas',state_code:'TX',country:'US',zip_prefix:'752'},truck:'Truck Trailer',equipment:"Dry Van 53'",service:'One Way',border_crossing:'Nuevo Laredo / Laredo',loads:'1',weight:'1000',weight_unit:'kg',notes:'Controlled cargo'}];
  const detail={project:{...project},rfi_submission:{status:'submitted',updated_at:'2026-10-06T12:00:00.123456Z',submitted_at:'2026-10-06T12:00:00Z',response:{bidware:{version:2,draft}}},lanes:[]};
  const quote={id:uid(3),folio:'Q-9001'};
  const fixture={api:async(action,payload)=>{calls.push({action,payload});if(action==='get_rfx_process_project')return detail; if(action==='update_rfx_process_project'){detail.project.notes=payload.patch.notes;return{};}throw Error('Unexpected action');},create:async input=>{calls.push({action:'create_quote',input});return quote;},lane:async(id,lane)=>{calls.push({action:'save_quote_lane',id,lane});return{};}};
  fixture.quoteApi=async(action,payload)=>{calls.push({action,payload});if(action==='list_spot_request_quotes')return {rows:[]};if(action==='convert_spot_request_to_quote')return {quote,source_project_id:project.id,replayed:false};throw Error('Unexpected QuoteDesk action');};
  globalThis.intakeFixture=fixture;
  return{project,detail,draft,quote,fixture,calls};
}

test('one atomic call sends only source and exact version',async()=>{const x=setup();assert.deepEqual(await m.createQuoteFromRequest(x.project),x.quote);assert.deepEqual(x.calls.map(c=>c.action),['get_rfx_process_project','convert_spot_request_to_quote']);assert.deepEqual(x.calls[1].payload,{project_id:x.project.id,expected_submission_updated_at:'2026-10-06T12:00:00.123456Z'});});
for(const scenario of ['unsubmitted','non-spot','wrong-project','no-shipper','missing-version'])test('reject '+scenario+' before conversion',async()=>{const x=setup();if(scenario==='unsubmitted')x.detail.rfi_submission.status='draft';if(scenario==='non-spot')x.detail.project.opportunity_type='program';if(scenario==='wrong-project')x.detail.project.id=uid(50);if(scenario==='no-shipper')x.detail.project.customer_id=null;if(scenario==='missing-version')delete x.detail.rfi_submission.updated_at;await assert.rejects(()=>m.createQuoteFromRequest(x.project));assert.equal(x.calls.length,1);});
test('lost response recovers durable receipt without second write',async()=>{const x=setup();x.fixture.quoteApi=async(action,payload)=>{x.calls.push({action,payload});if(action==='convert_spot_request_to_quote')throw Error('Failed to fetch');return{rows:[{source_project_id:x.project.id,quote:x.quote}]};};assert.deepEqual(await m.createQuoteFromRequest(x.project),x.quote);assert.equal(x.calls.filter(c=>c.action==='convert_spot_request_to_quote').length,1);});
test('unresolved result fails without old multi-POST fallback',async()=>{const x=setup();x.fixture.quoteApi=async(action,payload)=>{x.calls.push({action,payload});throw Error('Unavailable');};await assert.rejects(()=>m.createQuoteFromRequest(x.project));assert.deepEqual(x.calls.map(c=>c.action),['get_rfx_process_project','convert_spot_request_to_quote','list_spot_request_quotes']);});
for(const step of ['read','write'])test('account change stops continuation after '+step,async()=>{const x=setup();let current=true;if(step==='read'){const original=x.fixture.api;x.fixture.api=async(...args)=>{const r=await original(...args);current=false;return r;};}else x.fixture.quoteApi=async action=>{x.calls.push({action});current=false;throw Error('Failed to fetch');};await assert.rejects(()=>m.createQuoteFromRequest(x.project,()=>current));assert.equal(x.calls.some(c=>c.action==='list_spot_request_quotes'),false);assert.equal(x.calls.filter(c=>c.action==='convert_spot_request_to_quote').length,step==='read'?0:1);});
test('list uses durable quote even when project notes are empty',async()=>{const x=setup();x.fixture.api=async()=>({rows:[x.project]});x.fixture.quoteApi=async()=>({rows:[{source_project_id:x.project.id,quote:x.quote}]});const [row]=await m.listShipperProjects();assert.deepEqual(m.projectQuote(row),x.quote);assert.equal(m.awaitsTeam(row),false);});
test('receipt outage fails the list rather than offering duplicate conversion',async()=>{const x=setup();x.fixture.api=async()=>({rows:[x.project]});x.fixture.quoteApi=async()=>{throw Error('Unavailable');};await assert.rejects(()=>m.listShipperProjects());});
test('changed private link during save prevents the subsequent submission',async()=>{const x=setup();let current=true;const publicCalls=[];x.fixture.publicApi=async action=>{publicCalls.push(action);current=false;return{};};await assert.rejects(()=>m.submitRequest('A',x.draft,{},()=>current));assert.deepEqual(publicCalls,['save_customer_rfi']);});
test('submission saves the same payload first and preserves unknown source data',async()=>{const x=setup();const publicCalls=[];x.fixture.publicApi=async(action,payload)=>{publicCalls.push({action,payload});return{};};await m.submitRequest('A',x.draft,{source_extension:{kept:true}});assert.deepEqual(publicCalls.map(c=>c.action),['save_customer_rfi','submit_customer_rfi']);assert.deepEqual(publicCalls[0].payload,publicCalls[1].payload);assert.deepEqual(publicCalls[0].payload.rfi.source_extension,{kept:true});});
