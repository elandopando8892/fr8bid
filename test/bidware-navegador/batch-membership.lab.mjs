// Actual React screen/services against an isolated, synthetic HTTP contract. No production URLs.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import { createRequire as __cr } from 'node:module'; const { build } = __cr(__cr(import.meta.url).resolve('vite'))('esbuild');
const require=createRequire(import.meta.url),{makeBatchFixture,uid}=require('./batch-review.fixture.cjs');
const out=path.resolve('.test-output/bidware-artifacts/engine-membership-batch-20261026/lab');fs.mkdirSync(out,{recursive:true});
const fixture=makeBatchFixture();for(const t of fixture.templates.filter(t=>t.lifecycle_status==='active')){t.vendor_ids=[uid(777)];t.member_count=1}
fs.writeFileSync(path.join(out,'fixture.json'),JSON.stringify(fixture.packet));
fs.writeFileSync(path.join(out,'auth.tsx'),`import {useSyncExternalStore} from 'react';
const listeners=new Set<()=>void>();let session={user:{id:'${uid(9001)}',app_metadata:{rateware_organization_id:'${fixture.org}'}},role:'admin',roleLoaded:true};
export const identity=()=>session;
export function change(kind:string){session={user:{id:kind==='other'?'${uid(9002)}':'${uid(9001)}',app_metadata:{rateware_organization_id:kind==='other'?'org_other':'${fixture.org}'}},role:kind==='viewer'?'viewer':'admin',roleLoaded:kind!=='unverified'};listeners.forEach(f=>f())}
export function useAuth(){const value=useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>session);return {...value,can:()=>value.roleLoaded&&value.role==='admin'}}
`);
fs.writeFileSync(path.join(out,'api.ts'),`import {identity} from './auth';export class ApiError extends Error{status:number;constructor(m:string,status:number){super(m);this.status=status}}
export async function callRatewareApi(action:string,body:any={}){const r=await fetch('/api',{method:'POST',headers:{'content-type':'application/json','x-fixture-org':identity().user.app_metadata.rateware_organization_id,'x-fixture-role':identity().role},body:JSON.stringify({action,...body})});const value=await r.json();if(!r.ok)throw new ApiError(value.error||value.code,r.status);return value}
`);
fs.writeFileSync(path.join(out,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {EvidenceReviewPage} from '@/features/carrier-templates/EvidenceReviewPage';import {setLang} from '@/i18n/language';import {change} from './auth';import '@/styles/global.css';
const realNow=Date.now;let offset=0;Date.now=()=>realNow()+offset;
async function control(mode:string){const r=await fetch('/control',{method:'POST',body:JSON.stringify({mode})});document.getElementById('lab-status')!.textContent=await r.text()}
function Lab(){return <MemoryRouter><div aria-label="Laboratorio sintético" style={{background:'#fff0e9',padding:12,display:'flex',gap:8,flexWrap:'wrap'}}><b>LAB · DATOS SINTÉTICOS</b><button onClick={()=>change('admin')}>Admin</button><button onClick={()=>change('viewer')}>Consulta</button><button onClick={()=>change('other')}>Otra organización</button><button onClick={()=>change('unverified')}>Sesión sin verificar</button><button onClick={()=>setLang('es')}>ES</button><button onClick={()=>setLang('en')}>EN</button>{['reset','normal','lost-before','lost-after','conflict','permission','uncertain-read','hold-write','release'].map(mode=><button key={mode} onClick={()=>void control(mode)}>{mode}</button>)}<button onClick={()=>{offset+=301000}}>Vencer 301s</button><span id="lab-status" role="status"/></div><EvidenceReviewPage/></MemoryRouter>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Lab/></React.StrictMode>);
`);
await build({entryPoints:[path.join(out,'entry.tsx')],outfile:path.join(out,'app.js'),bundle:true,format:'esm',jsx:'automatic',alias:{'@/auth/AuthContext':path.join(out,'auth.tsx'),'@/lib/api-client':path.join(out,'api.ts'),'@':path.resolve('src','bidware')},define:{'process.env.NODE_ENV':'"development"'}});
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Engine · laboratorio de aplicación por lotes</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
let rows=structuredClone(fixture.templates),mode='normal',attempts=0,writes=0;const calls=[],held=[];
const allowed=['list_carrier_list_templates','get_carrier_list_template','update_carrier_list_template','get_published_carrier_classification'];
function reply(res,status,value){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value))}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method==='GET'){
  if(url.pathname==='/results')return reply(res,200,{mode,attempts,writes,calls,unexpected:calls.filter(c=>!allowed.includes(c.action)),rows});
  const files={'/':'index.html','/app.js':'app.js','/app.css':'app.css'};if(!files[url.pathname])return reply(res,404,{error:'Not a lab asset'});const file=files[url.pathname];res.writeHead(200,{'content-type':file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'text/css','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'"});return res.end(fs.readFileSync(path.join(out,file)));
 }
 let raw='';for await(const chunk of req)raw+=chunk;let body;try{body=JSON.parse(raw)}catch{return reply(res,400,{error:'Invalid lab request'})}
 if(url.pathname==='/control'){mode=body.mode;if(mode==='reset'){rows=structuredClone(fixture.templates);attempts=0;writes=0;mode='normal'}if(mode==='release'){mode='normal';held.splice(0).forEach(fn=>fn())}return reply(res,200,{mode,attempts,writes})}
 if(url.pathname!=='/api')return reply(res,404,{error:'No such lab route'});
 const org=req.headers['x-fixture-org'],role=req.headers['x-fixture-role'];calls.push({action:body.action,templateId:body.template_id,expectedVersion:body.expected_version,org,role,mode});
 if(!allowed.includes(body.action))return reply(res,405,{error:'Action outside lab scope'});
 if(body.action==='get_published_carrier_classification')return reply(res,200,{schema_version:'bidware-published-classification/1',organization_id:org,status:'empty',reason:'NO_PUBLICATION',publication:null});
 if(body.action==='list_carrier_list_templates'){const data=org===fixture.org?rows:[],offset=body.offset||0;return reply(res,200,{rows:data.slice(offset,offset+(body.limit||200)),total:data.length,has_more:false})}
 const t=rows.find(t=>t.id===body.template_id&&t.organization_id===org);if(!t)return reply(res,404,{error:'Template not found'});
 if(body.action==='get_carrier_list_template'){if(mode==='uncertain-read'&&attempts===2)return req.socket.destroy();return reply(res,200,{row:t})}
 attempts++;if(role!=='admin'||mode==='permission'&&attempts===2)return reply(res,403,{error:'Not allowed'});
 if(mode==='conflict'&&attempts===2){t.template_version++;t.vendor_ids.push(uid(888));t.member_count=t.vendor_ids.length;return reply(res,409,{code:'template_version_conflict'})}
 if(mode==='lost-before'&&attempts===2)return req.socket.destroy();
 if(t.template_version!==body.expected_version)return reply(res,409,{code:'template_version_conflict'});
 const ids=body.vendor_ids,pool=new Set([...fixture.packet.rows.map(r=>r.vendor_id),uid(777)]);
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!pool.has(id)))return reply(res,400,{error:'Invalid vendor IDs'});
 const apply=()=>{t.vendor_ids=[...ids];t.member_count=ids.length;t.template_version++;writes++;if(mode==='lost-after'&&attempts===2)return req.socket.destroy();return reply(res,200,{row:t})};
 if(mode==='hold-write')return held.push(apply);return apply();
});
server.listen(3266,'127.0.0.1',()=>console.log('Membership batch lab ready http://127.0.0.1:3266; synthetic state only'));
process.on('SIGINT',()=>{fs.writeFileSync(path.join(out,'http-final.json'),JSON.stringify({calls,writes,attempts,rows},null,2));server.closeAllConnections();server.close(()=>process.exit(0))});
