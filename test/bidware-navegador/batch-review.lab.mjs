// Disposable localhost harness: real screen/services, synthetic identity and HTTP data.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { createRequire as __cr } from 'node:module'; const { build  } = __cr(__cr(import.meta.url).resolve('vite'))('esbuild');
const require=createRequire(import.meta.url), {makeBatchFixture,uid}=require('./batch-review.fixture.cjs');
const out=path.resolve('.test-output/bidware-artifacts/engine-review-readonly-20261025/lab');fs.mkdirSync(out,{recursive:true});
const fixture=makeBatchFixture();
fs.writeFileSync(path.join(out,'fixture.json'),JSON.stringify(fixture.packet));
const duplicate=structuredClone(fixture.packet);duplicate.rows.push(duplicate.rows[0]);
fs.writeFileSync(path.join(out,'duplicate.json'),JSON.stringify(duplicate));
fs.writeFileSync(path.join(out,'auth.tsx'),`import {useSyncExternalStore} from 'react';
const listeners=new Set<()=>void>();
let session={user:{id:'${uid(9001)}',app_metadata:{rateware_organization_id:'${fixture.org}'}},role:'admin',roleLoaded:true};
export const getIdentity=()=>session;
export function changeIdentity(kind:string){session={user:{id:kind==='other'?'${uid(9002)}':'${uid(9001)}',app_metadata:{rateware_organization_id:kind==='other'?'${uid(9003)}':'${fixture.org}'}},role:kind==='viewer'?'viewer':'admin',roleLoaded:kind!=='unverified'};listeners.forEach(f=>f());}
export function useAuth(){return useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>session);}
`);
fs.writeFileSync(path.join(out,'api.ts'),`import {getIdentity} from './auth';
export class ApiError extends Error {status:number;constructor(m:string,s=0){super(m);this.status=s}}
export async function callRatewareApi(action:string,body:any={}){const r=await fetch('/api',{method:'POST',headers:{'content-type':'application/json','x-fixture-org':getIdentity().user.app_metadata.rateware_organization_id},body:JSON.stringify({action,...body})});const value=await r.json();if(!r.ok)throw new ApiError(value.error,r.status);return value;}
`);
fs.writeFileSync(path.join(out,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import {EvidenceReviewPage} from '@/features/carrier-templates/EvidenceReviewPage';import {setLang} from '@/i18n/language';import {changeIdentity} from './auth';import '@/styles/global.css';
const realNow=Date.now;let offset=0;Date.now=()=>realNow()+offset;
async function control(mode:string){const r=await fetch('/control',{method:'POST',body:JSON.stringify({mode})});document.getElementById('lab-status')!.textContent=await r.text();}
function Lab(){return <MemoryRouter><div style={{background:'#fff0e9',padding:12,display:'flex',gap:8,flexWrap:'wrap'}} aria-label="Laboratorio sintético"><b>LAB · DATOS SINTÉTICOS</b>
<button onClick={()=>changeIdentity('admin')}>Admin</button><button onClick={()=>changeIdentity('viewer')}>Consulta</button><button onClick={()=>changeIdentity('other')}>Otra organización</button><button onClick={()=>changeIdentity('unverified')}>Sesión sin verificar</button>
<button onClick={()=>setLang('es')}>ES</button><button onClick={()=>setLang('en')}>EN</button>
{['normal','forbidden','foreign','partial','version','archived','missing','ambiguous','interrupt','hold','release'].map(mode=><button key={mode} onClick={()=>void control(mode)}>{mode}</button>)}
<button onClick={()=>{offset+=301000}}>Vencer 301s</button><span id="lab-status" role="status"></span></div><EvidenceReviewPage /></MemoryRouter>}
createRoot(document.getElementById('root')!).render(<Lab/>);
`);
await build({entryPoints:[path.join(out,'entry.tsx')],outfile:path.join(out,'app.js'),bundle:true,format:'esm',jsx:'automatic',
  alias:{'@/auth/AuthContext':path.join(out,'auth.tsx'),'@/lib/api-client':path.join(out,'api.ts'),'@':path.resolve('src','bidware')},
  define:{'process.env.NODE_ENV':'"development"'},sourcemap:false});
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Engine · laboratorio de revisión por lotes</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
let mode='normal';const held=[],calls=[];
function reply(res,status,value){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method==='GET'){
  if(url.pathname==='/results')return reply(res,200,{mode,calls,unexpected:calls.filter(c=>!['list_carrier_list_templates','get_published_carrier_classification'].includes(c.action)),mutations:0});
  const allowed={'/':'index.html','/app.js':'app.js','/app.css':'app.css','/fixture.json':'fixture.json','/duplicate.json':'duplicate.json'};
  if(!allowed[url.pathname])return reply(res,404,{error:'Lab file not found'});
  const name=allowed[url.pathname];res.writeHead(200,{'content-type':name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'application/json',
    'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'"});return res.end(fs.readFileSync(path.join(out,name)));
 }
 let raw='';for await(const part of req)raw+=part;
 let body;try{body=JSON.parse(raw)}catch{return reply(res,400,{error:'Invalid lab input'});}
 if(url.pathname==='/control'){
  mode=body.mode;if(mode==='release'){for(const fn of held.splice(0))fn();mode='normal';}return reply(res,200,{mode});
 }
 if(url.pathname!=='/api')return reply(res,404,{error:'Lab endpoint not found'});
 const org=req.headers['x-fixture-org'];calls.push({action:body.action,mode,org,offset:body.offset});
 if(body.action==='get_published_carrier_classification')return reply(res,200,{schema_version:'bidware-published-classification/1',organization_id:org,status:'empty',reason:'NO_PUBLICATION',publication:null});
 if(body.action!=='list_carrier_list_templates')return reply(res,405,{error:'Only synthetic catalog reads allowed'});
 if(mode==='forbidden')return reply(res,403,{error:'Fixture permission denied'});
 if(mode==='interrupt')return req.socket.destroy();
 let rows=structuredClone(fixture.templates);
 if(org!==fixture.org)rows=[];
 if(mode==='foreign')rows[0].organization_id=uid(9999);
 if(mode==='version')rows.find(t=>t.id===uid(100)).template_version=4;
 if(mode==='archived')rows.find(t=>t.id===uid(100)).lifecycle_status='archived';
 if(mode==='missing')rows=rows.filter(t=>t.id!==uid(100));
 if(mode==='ambiguous')rows.push({...rows.find(t=>t.id===uid(100)),id:uid(150)});
 const total=rows.length+(mode==='partial'?1:0),offset=body.offset||0;
 const data={rows:rows.slice(offset,offset+(body.limit||200)),total,has_more:false};
 if(mode==='hold')return held.push(()=>reply(res,200,data));
 return reply(res,200,data);
});
server.listen(3262,'127.0.0.1',()=>console.log('Batch review lab ready: http://127.0.0.1:3262 (synthetic HTTP and auth only)'));
process.on('SIGINT',()=>{fs.writeFileSync(path.join(out,'http-result.json'),JSON.stringify({calls,unexpected:calls.filter(c=>!['list_carrier_list_templates','get_published_carrier_classification'].includes(c.action))},null,2));server.closeAllConnections();server.close(()=>process.exit(0));});
