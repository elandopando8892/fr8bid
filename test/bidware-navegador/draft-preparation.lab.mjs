// Real Message and Queue components; only in-memory synthetic draft preparation.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createRequire as __cr } from 'node:module'; const { build  } = __cr(__cr(import.meta.url).resolve('vite'))('esbuild');
const require = createRequire(import.meta.url), { fixture, reader, uid } = require('./batch-flow.fixture.cjs');
export async function startDraftLab({ outName = 'lab', reconciliation = false } = {}) {
  const root = process.cwd(), out = path.resolve(root, '.test-output', 'labs', outName);
  fs.mkdirSync(out, { recursive: true });
  const data = fixture(67), originalCampaign = structuredClone(data.campaigns[0]);
  originalCampaign.audience_policy.vendor_ids = data.audience.slice(0, 63).map(a => a.vendor_id);
  data.audience.forEach((a, i) => Object.assign(a, {email: `carrier${i + 1}@example.test`, audience_status:'ready', event_status:'not_invited'}));
  data.reviews = data.audience.map((a, i) => ({vendor_id:a.vendor_id, reviewed:i < 35, contact_snapshot:{email:a.email,phone:a.phone}}));
  const protectedBefore = JSON.stringify([data.audience, data.reviews, data.segments]);
  fs.writeFileSync(path.join(out, 'auth.tsx'), `import {useSyncExternalStore} from 'react';
const listeners=new Set<()=>void>();let kind='admin';let state=make();
function make(){return {user:{id:kind==='other'?'${uid(901)}':'${data.scope.userId}',app_metadata:{organization_id:kind==='other'?'org_other':kind==='noorg'?null:'${data.scope.organizationId}'}},role:kind==='viewer'?'viewer':kind==='operator'?'operator':'admin',roleLoaded:kind!=='unverified'}}
export const identity=()=>state;export function change(value:string){kind=value;state=make();listeners.forEach(fn=>fn())}
export function useAuth(){const s=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>state);return {...s,can:(need:string)=>s.roleLoaded&&(need==='read'||(need==='admin'?s.role==='admin':s.role!=='viewer'))}}
`);
  fs.writeFileSync(path.join(out, 'api.ts'), `import {identity} from './auth';
export class ApiError extends Error{status:number;code?:string;constructor(message:string,init:any={}){super(message);this.status=init.status||0;this.code=init.code}}
export async function callRatewareApi(action:string,body:any={}){const who=identity();const r=await fetch('/api',{method:'POST',headers:{'content-type':'application/json','x-org':who.user.app_metadata.organization_id,'x-role':who.role},body:JSON.stringify({action,...body})});const value=await r.json();if(!r.ok)throw new ApiError(value.error||'Synthetic failure',{status:r.status,code:value.code});return value}
`);
  fs.writeFileSync(path.join(out, 'env.ts'), 'export const env={appOrigin:window.location.origin};export const isConfigured=true;');
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route,Link} from 'react-router-dom';import {MessagePage} from '@/features/outreach/MessagePage';import {DeliveryQueuePage} from '@/features/outreach/DeliveryQueuePage';import {ConfirmHost} from '@/components/confirm';import {setLang} from '@/i18n/language';import {change} from './auth';import '@/styles/global.css';
function Lab(){return <BrowserRouter><div className="lab-controls" style={{padding:12,background:'#fff1e8',display:'flex',gap:8,flexWrap:'wrap'}}><b>LAB · SYNTHETIC DATA</b>{['admin','operator','viewer','other','unverified','noorg'].map(role=><button key={role} onClick={()=>change(role)}>{role}</button>)}<button onClick={()=>setLang('es')}>ES</button><button onClick={()=>setLang('en')}>EN</button><Link to="/rfx/${data.scope.eventId}/message">Mensaje lab</Link><Link to="/rfx/${data.scope.eventId}/delivery">Cola lab</Link><Link to="/rfx/${uid(801)}/message">Otro RFx lab</Link></div><ConfirmHost/>
<Routes><Route path="/rfx/:id/message" element={<MessagePage/>}/><Route path="/rfx/:id/delivery" element={<DeliveryQueuePage/>}/><Route path="*" element={<p>Lab navigation only.</p>}/></Routes></BrowserRouter>}
createRoot(document.getElementById('root')!).render(new URLSearchParams(window.location.search).has('strict')?<React.StrictMode><Lab/></React.StrictMode>:<Lab/>);`);
  const options = {bundle:true,format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},entryPoints:[path.join(out,'entry.tsx')],alias:{'@/auth/AuthContext':path.join(out,'auth.tsx'),'@/lib/api-client':path.join(out,'api.ts'),'@/config/env':path.join(out,'env.ts'),'@': path.join(root, 'src', 'bidware')}};
  await build({...options,outfile:path.join(out,'app.js')});
  // Conciliación: la base es Bidware justo antes de 9880850 (conciliar a mano).
  // Independent complete snapshot of the published commit, not an old dirty checkout.
  await build({...options,alias:{...options.alias,'@':path.resolve(process.env.BIDWARE_BASELINE || path.resolve(root, reconciliation ? '../bidware-base-conciliacion' : '../bidware-base'),'src')},outfile:path.join(out,'baseline.js')});
  let mode='normal', flowMode='normal', sequence=0; const calls=[],allCalls=[],rejected=[],held=[],heldReads=[], journal=new Map();
  function reset(){data.campaigns=[structuredClone(originalCampaign)];data.messages=[];calls.length=0;rejected.length=0;journal.clear();sequence=0;flowMode='normal';}
  reset();
  const respond=(res,status,value)=>{if(res.destroyed)return;res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  const api=reader(data);
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method==='GET'){
      const files={'/app.js':'app.js','/app.css':'app.css','/baseline.js':'baseline.js','/baseline.css':'baseline.css'};
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'self' about:; worker-src 'none'");
      if(files[url.pathname]){res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(fs.readFileSync(path.join(out,files[url.pathname])));}
      if(url.pathname==='/favicon.ico'){res.statusCode=204;return res.end();}
      const b=url.searchParams.has('baseline')?'baseline':'app';res.setHeader('content-type','text/html');return res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ENG-FLOW-${reconciliation?'03':'02'} · synthetic lab</title><link rel="stylesheet" href="/${b}.css"></head><body><div id="root"></div><script type="module" src="/${b}.js"></script></body></html>`);
    }
    let raw='';for await(const chunk of req)raw+=chunk;let body;try{body=JSON.parse(raw);}catch{return respond(res,400,{error:'Invalid lab JSON'});}
    if(url.pathname==='/control'){
      if(body.reset)reset();mode=body.mode||'normal';if(body.emptyCampaign)data.campaigns=[];
      if(reconciliation){
        if(body.flowMode)flowMode=body.flowMode;
        if(body.releaseReads){flowMode='normal';heldReads.splice(0).forEach(fn=>fn());}
        if(body.multipleCampaigns)data.campaigns.push({...structuredClone(originalCampaign),id:uid(701),name:'Campaña sintética B'});
        if(body.messages) data.messages=structuredClone(body.messages);
      }
      if(mode==='release'){mode='normal';held.splice(0).forEach(fn=>fn());}return respond(res,200,{mode});
    }
    if(url.pathname!=='/api')return respond(res,404,{error:'Outside lab'});
    const call={...body,org:req.headers['x-org'],role:req.headers['x-role'],mode};calls.push(call);allCalls.push(call);
    if(call.org!==data.scope.organizationId||((body.rfx_event_id||body.event_id)&&(body.rfx_event_id||body.event_id)!==data.scope.eventId))return respond(res,404,{error:'Synthetic resource not accessible'});
    if(reconciliation&&body.action==='preview_outreach_audience'){
      if(['error','forbidden','missing'].includes(flowMode))return respond(res,flowMode==='forbidden'?403:flowMode==='missing'?404:500,{error:'Synthetic reconciliation failure'});
      if(flowMode==='foreign'){const value=await api(body.action,body);value.organization_id='org_other';return respond(res,200,value);}
      if(flowMode==='hold'){const value=await api(body.action,body);return heldReads.push(()=>respond(res,200,value));}
    }
    if(reconciliation&&flowMode==='truncated'&&body.action==='list_outreach_messages'&&body.compact){const value=await api(body.action,body);value.total++;value.has_more=false;return respond(res,200,value);}
    if(body.action==='generate_outreach_drafts'||body.action==='create_outreach_campaign'){
      if(!['admin','operator'].includes(call.role))return respond(res,403,{error:'Synthetic permission denied'});
      if(body.action==='create_outreach_campaign'){
        if(body.campaign?.rfx_event_id!==data.scope.eventId||body.campaign?.template_id!==originalCampaign.template_id||!body.campaign?.idempotency_key)return respond(res,400,{error:'Invalid synthetic campaign scope'});
        const finish=()=>{data.campaigns=[structuredClone(originalCampaign)];respond(res,200,{row:data.campaigns[0]});};
        if(mode==='campaign_lost')return req.socket.destroy();
        if(mode==='hold_campaign')return held.push(finish);
        return finish();
      }
      if(body.campaign_id!==originalCampaign.id||!body.operation_id||!body.reviewed_vendor_ids?.length||body.reviewed_vendor_ids.some(id=>!data.reviews.some(r=>r.vendor_id===id&&r.reviewed)||!originalCampaign.audience_policy.vendor_ids.includes(id)))return respond(res,409,{error:'Synthetic audience changed',code:'reviewed_audience_changed'});
      if(body.channel==='whatsapp'&&mode==='failed')return respond(res,500,{error:'Synthetic channel failure'});
      if(body.channel==='whatsapp'&&mode==='audience')return respond(res,409,{error:'Synthetic audience changed',code:'reviewed_audience_changed'});
      if(mode==='malformed')return respond(res,200,{rows:null});
      const finish=()=>{
        if(journal.has(body.operation_id))return respond(res,200,journal.get(body.operation_id));
        const ids=mode==='zero'?[]:body.reviewed_vendor_ids;
        for(const id of ids)if(!data.messages.some(m=>m.vendor_id===id&&m.channel===body.channel))data.messages.push({id:uid(2000+(++sequence)),campaign_id:body.campaign_id,rfx_event_id:data.scope.eventId,vendor_id:id,channel:body.channel,status:'drafted',tracking_state:'drafted',recipient_email:data.audience.find(a=>a.vendor_id===id)?.email,subject:'Synthetic draft',metadata:{vendor_name:'Synthetic carrier'}});
        const value={generated:ids.length,rows:[],campaign_id:body.campaign_id,requested_channels:[body.channel],skipped:mode==='zero'?body.reviewed_vendor_ids.map(id=>({vendor_id:id,reason_code:'daily_cap'})):[]};journal.set(body.operation_id,value);
        if(mode==='lost'&&body.channel==='whatsapp'){
          // Deliver headers before truncating the body: a raw socket reset before
          // headers may be transparently retried by Chromium using the same id.
          res.writeHead(200,{'content-type':'application/json','content-length':'256'});
          res.write('{"generated":');setTimeout(()=>res.destroy(),25);return;
        }
        return respond(res,200,value);
      };
      if(mode==='hold')return held.push(finish);return finish();
    }
    let value;
    switch(body.action){
      case 'list_rfx_detail':value={event:{id:data.scope.eventId,name:'Synthetic RFx · draft preparation',rfx_id:'RFx-LAB',status:'draft',organization_id:data.scope.organizationId},lanes:[{id:uid(850),origin:'Synthetic origin',destination:'Synthetic destination',invitations:data.audience.map(a=>({vendor_id:a.vendor_id,invitation_status:'drafted',vendors:{vendor_name:a.vendor_name}}))}]};break;
      case 'list_outreach_templates':value={rows:[{id:uid(600),name:'Synthetic template ES',subject:'RFx {{vendor_name}}',html_body:'<p>Synthetic draft. No sending.</p>',canonical_language:'es',is_default:true,owner_email:null,whatsapp_meta:{meta_template_status:'APPROVED',meta_template_name:'synthetic_only',meta_template_language:'es_MX'}},{id:uid(601),name:'Synthetic alternative ES',subject:'Synthetic alternative',html_body:'<p>Synthetic alternative</p>',canonical_language:'es',owner_email:null}]};break;
      case 'list_gmail_connections':value={rows:[{id:uid(620),mailbox_email:'sender@example.test',status:'connected',access_token_expires_at:'2099-01-01'}]};break;
      case 'get_outreach_tracking_summary':value={total:data.messages.length,states:{drafted:data.messages.length}};break;
      case 'list_contact_history':value={contract:'bidware.whatsapp-evidence.v1',view:'pending',scope:null,rows:[],total:0,has_more:false};break;
      case 'get_outreach_message':value={row:data.messages.find(m=>m.id===body.id)??null};break;
      default:try{value=await api(body.action,body);}catch{rejected.push(body.action);return respond(res,405,{error:'Operation forbidden in this lab'});}
    }
    return respond(res,200,value);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const result=()=>({calls,allCalls,rejected,syntheticDrafts:data.messages.length,providerCalls:0,protectedUnchanged:protectedBefore===JSON.stringify([data.audience,data.reviews,data.segments])});
  return {origin:`http://127.0.0.1:${server.address().port}`,out,eventId:data.scope.eventId,data,result,close:async()=>{held.splice(0).forEach(fn=>fn());heldReads.splice(0).forEach(fn=>fn());fs.writeFileSync(path.join(out,'http-final.json'),JSON.stringify(result(),null,2));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const lab=await startDraftLab();console.log(`${lab.origin}/rfx/${lab.eventId}/message`);process.on('SIGINT',async()=>{await lab.close();process.exit(0);});
}
