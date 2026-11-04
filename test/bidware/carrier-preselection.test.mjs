// Traída del árbol local de Bidware (28-oct, nunca entró a git): la preselección de O-I
// nunca se presenta como selección ni como Tier, y no sale en ninguna respuesta al carrier.
import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {projectLockedCarrierPayload} from '../../packages/carrier-commercial/locked-policy.mjs';
const candidates=Array.from({length:10},(_,i)=>({vendor_id:'fixture-vendor-'+i,name:'Carrier '+i,legal_name:'Fixture Legal '+i,ctpat:'Pendiente',gps:'Pendiente',technology:'TMS y app sin prueba'}));
const payload={schema_version:2,rfx_event_id:'fixture-event',status:'pending_cost_classification',prepared_on:'2026-10-28',candidates,routes:Array.from({length:8},(_,i)=>({lane_id:'fixture-lane-'+i,lane_number:i+1,origin:'Origin',destination:'Destination '+i,candidate_vendor_ids:candidates.map(c=>c.vendor_id),target_buy_all_in_usd:4000})),common_pending:['CTPAT y GPS/TMS pendientes'],retained:[{name:'Retained Carrier',reason:'Autoridad pendiente'}]};
const master={carrier_commercial_policy:{model:'brokerage',locked:true},carrier_preselection_internal:payload};
const bundle=await build({entryPoints:['src/bidware/features/rfx-admin/CarrierPreselection.tsx'],bundle:true,format:'esm',platform:'node',write:false,jsxFactory:'React.createElement',jsxFragment:'React.Fragment',banner:{js:"import React from 'react';"},external:['react','react-dom','react-dom/*','react/*']});
const file=path.join(process.cwd(),'node_modules','.fr8bid-preseleccion.mjs');
await writeFile(file,bundle.outputFiles[0].text);
const {CarrierPreselection,readCarrierPreselection}=await import(pathToFileURL(file).href);
test('unselected candidates render with cost classification pending and no invitation action',()=>{
 assert.ok(readCarrierPreselection(payload.rfx_event_id,master));
 const html=renderToStaticMarkup(React.createElement(CarrierPreselection,{eventId:payload.rfx_event_id,master}));
 for(const c of payload.candidates){assert.ok(html.includes(c.name));assert.ok(html.includes(c.ctpat.replaceAll('&','&amp;')));}
 for(const r of payload.routes)assert.ok(html.includes(r.destination));
 assert.ok(html.includes('0 carriers seleccionados'));assert.ok(html.includes('pendiente de clasificar por costos'));assert.ok(!html.includes('Tier A · Primario'));assert.ok(!html.includes('Tier B · Soporte'));assert.ok(!html.includes('Tier C · Spot'));assert.ok(html.includes('TMS y app del operador'));
 assert.ok(!html.includes('<button'));assert.ok(!html.includes('<form'));
});
test('foreign event or incomplete/duplicated route data never renders',()=>{
 assert.equal(readCarrierPreselection('foreign',master),null);
 for(const mutate of [x=>x.schema_version=1,x=>x.status='approved',x=>x.candidates.push(x.candidates[0]),x=>x.routes[0].candidate_vendor_ids.push(x.routes[0].candidate_vendor_ids[0]),x=>x.routes[0].candidate_vendor_ids[0]='unknown',x=>x.routes.push(x.routes[0])]){
 const changed=structuredClone(payload);mutate(changed);
 assert.equal(readCarrierPreselection(payload.rfx_event_id,{carrier_preselection_internal:changed}),null);
 }
});
test('private shortlist is removed from all carrier responses with and without a lock',()=>{
 for(const policy of [null,{model:'brokerage',locked:true}]){
 const input={event:{id:payload.rfx_event_id,rfx_master_package:{carrier_commercial_policy:policy,carrier_preselection_internal:payload}}, nested:[{carrier_preselection_internal:payload,bid_rate:1234}]};
 const before=structuredClone(input);const result=projectLockedCarrierPayload(input);
 assert.ok(!JSON.stringify(result).includes('carrier_preselection_internal'));
 assert.deepEqual(input,before);assert.equal(result.nested[0].bid_rate,1234);
 }
});
test('candidate scope has ten identities per route, no assigned tier and no retained carrier',()=>{
 assert.equal(payload.routes.length,8);assert.equal(payload.candidates.length,10);
 for(const r of payload.routes){assert.equal(new Set(r.candidate_vendor_ids).size,10);assert.equal(r.tiers,undefined);}
 for(const r of payload.retained)assert.ok(!payload.candidates.some(c=>c.legal_name===r.name));
});
test("old unpriced tier proposals cannot be presented as a classification",()=>{const previous=structuredClone(payload);previous.schema_version=1;previous.status="draft_proposal";assert.equal(readCarrierPreselection(payload.rfx_event_id,{carrier_preselection_internal:previous}),null);});
