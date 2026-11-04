import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { createRequire as __cr } from 'node:module'; const { build  } = __cr(__cr(import.meta.url).resolve('vite'))('esbuild');
const require = createRequire(import.meta.url), { fixture, uid } = require('./response-followup.fixture.cjs');

export async function startFollowupLab() {
  const root = process.cwd(), out = path.resolve(root, '.test-output', 'labs', 'response-lab'); fs.mkdirSync(out, { recursive: true });
  const data = fixture();
  fs.writeFileSync(path.join(out, 'auth.tsx'), `import {useSyncExternalStore} from 'react';
const listeners=new Set<()=>void>();let kind='admin';let state=make();
function make(){return {user:kind==='signedout'?null:{id:kind==='other'?'${uid(901)}':'${data.scope.userId}',email:'synthetic@example.test',app_metadata:{organization_id:kind==='other'?'org_other':kind==='noorg'?null:'org_lab'}},role:['operator','viewer'].includes(kind)?kind:'admin',roleLoaded:kind!=='unverified'}}
export const identity=()=>state;export function change(v:string){kind=v;state=make();listeners.forEach(fn=>fn())}
export function useAuth(){const s=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>state);return {...s,can:(need:string)=>!!s.user&&s.roleLoaded&&(need==='read'||(need==='admin'?s.role==='admin':s.role!=='viewer'))}}
`);
  fs.writeFileSync(path.join(out, 'api.ts'), `import {identity} from './auth';
export class ApiError extends Error{status:number;constructor(message:string,opts:any={}){super(message);this.status=opts.status||0}}
export async function callRfxBidApi(){throw new Error('Carrier write API is forbidden in the read-only lab')}
export async function callRatewareApi(action:string,body:any={}){const who=identity();const r=await fetch('/api',{method:'POST',headers:{'content-type':'application/json','x-org':who.user?.app_metadata.organization_id||'','x-role':who.role},body:JSON.stringify({action,...body})});const value=await r.json();if(!r.ok)throw new ApiError(value.error||'Synthetic read failure',{status:r.status});return value}
`);
  fs.writeFileSync(path.join(out, 'env.ts'), 'export const env={appOrigin:window.location.origin};export const isConfigured=true;');
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route,Link,useParams,useLocation} from 'react-router-dom';import {OperateStage} from '@/features/rfx-admin/OperateStage';import {EventChatPage} from '@/features/rfx-admin/EventChatPage';import {ConfirmHost} from '@/components/confirm';import {setLang} from '@/i18n/language';import {change,useAuth} from './auth';import '@/styles/global.css';
function Operate(){const {id=''}=useParams();const [lanes,setLanes]=useState<any[]|null>(null);const [busy,setBusy]=useState(false),[reading,setReading]=useState(false);const {can}=useAuth();useEffect(()=>{let active=true;fetch('/fixture').then(r=>r.json()).then(v=>{if(active)setLanes(v.lanes)});return()=>{active=false}},[id]);(window as any).labControls={reload:()=>setLanes(v=>structuredClone(v)),busy:setBusy,reading:setReading};return lanes?<OperateStage eventId={id} lanes={lanes} fx={null} confirmations={[]} busy={busy} reading={reading} canWork={can('operate')} onCapture={()=>{throw Error('Forbidden lab action')}} onAsk={()=>{throw Error('Forbidden lab action')}} onEditBid={()=>{throw Error('Forbidden lab action')}} onReject={()=>{throw Error('Forbidden lab action')}} onAward={()=>{throw Error('Forbidden lab action')}}/>:<p>Loading synthetic detail</p>}
function QueueTarget(){const l=useLocation();return <p data-queue-target>{l.pathname+l.search}</p>}
function App(){return <BrowserRouter><div className="lab-controls" style={{padding:12,background:'#fff1e8',display:'flex',gap:8,flexWrap:'wrap'}}><strong>LAB · SYNTHETIC DATA</strong>{['admin','operator','viewer','other','unverified','noorg','signedout'].map(role=><button key={role} onClick={()=>change(role)}>{role}</button>)}<button onClick={()=>setLang('es')}>ES</button><button onClick={()=>setLang('en')}>EN</button><Link to="/rfx/${data.scope.eventId}">Operate lab</Link><Link to="/rfx/${uid(801)}">Other RFx lab</Link></div><main style={{padding:20}}><ConfirmHost/><Routes><Route path="/rfx/:id" element={<Operate/>}/><Route path="/rfx/:id/chat" element={<EventChatPage/>}/><Route path="/rfx/:id/delivery" element={<QueueTarget/>}/></Routes></main></BrowserRouter>}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('strict')?<React.StrictMode><App/></React.StrictMode>:<App/>);
`);
  const options = { bundle: true, format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, entryPoints: [path.join(out, 'entry.tsx')],
    alias: { '@/auth/AuthContext': path.join(out, 'auth.tsx'), '@/lib/api-client': path.join(out, 'api.ts'), '@/config/env': path.join(out, 'env.ts'), '@': path.join(root, 'src', 'bidware') } };
  await build({ ...options, outfile: path.join(out, 'app.js') });
  await build({ ...options, alias: { ...options.alias, '@': path.resolve(process.env.BIDWARE_BASELINE || path.resolve(root, '../bidware-base'), 'src') }, outfile: path.join(out, 'baseline.js') });
  let mode = 'normal'; const calls = [], held = [], forbidden = [];
  const respond = (res, status, value) => { if (res.destroyed) return; res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'self' about:; worker-src 'none'");
    if (req.method === 'GET') {
      if (url.pathname === '/fixture') return respond(res, 200, { lanes: data.lanes });
      if (['/app.js', '/app.css', '/baseline.js', '/baseline.css'].includes(url.pathname)) { res.setHeader('content-type', url.pathname.endsWith('css') ? 'text/css' : 'text/javascript'); return res.end(fs.readFileSync(path.join(out, url.pathname.slice(1)))); }
      if (url.pathname === '/favicon.ico') { res.statusCode = 204; return res.end(); }
      const name = url.searchParams.has('baseline') ? 'baseline' : 'app'; res.setHeader('content-type', 'text/html');
      return res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ENG-FLOW-04 · synthetic laboratory</title><link rel="stylesheet" href="/${name}.css"></head><body><div id="root"></div><script type="module" src="/${name}.js"></script></body></html>`);
    }
    if (req.method !== 'POST' || url.pathname !== '/api') { forbidden.push({ path: url.pathname, method: req.method }); return respond(res, 405, { error: 'Outside lab allowlist' }); }
    let body; try { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw); } catch { return respond(res, 400, { error: 'Invalid lab request' }); }
    const call = { ...body, role: req.headers['x-role'], organization: req.headers['x-org'], mode }; calls.push(call);
    const allowed = new Set(['list_rfx_event_context', 'list_contact_history', 'list_rfx_detail', 'list_bid_room_chat']);
    if (!allowed.has(body.action)) { forbidden.push(call); return respond(res, 405, { error: 'Writes are not implemented in this lab' }); }
    if (call.organization !== data.scope.organizationId || (body.rfx_event_id || body.event_id) !== data.scope.eventId) return respond(res, 404, { error: 'Synthetic scoped resource not found' });
    if (body.action === 'list_contact_history') return respond(res, 200, { rows: [] });
    if (body.action === 'list_rfx_detail') return respond(res, 200, { event: { id: data.scope.eventId, name: 'Synthetic RFx' }, lanes: data.lanes });
    if (body.action === 'list_bid_room_chat') return respond(res, 200, data.context.chat);
    if (['error', 'forbidden', 'missing'].includes(mode)) return respond(res, mode === 'forbidden' ? 403 : mode === 'missing' ? 404 : 500, { error: 'Synthetic source read failure' });
    const value = structuredClone(data.context);
    if (mode === 'partial') value.outreach_messages_limited = true;
    if (mode === 'chat_limited') value.chat.messages_limited = true;
    if (mode === 'foreign') value.chat.event.organization_id = 'org_other';
    if (mode === 'malformed') value.response_vendor_ids = null;
    if (mode === 'hold') return held.push(() => respond(res, 200, value));
    if (mode === 'lost') { res.writeHead(200, { 'content-type': 'application/json', 'content-length': '300' }); res.write('{"response_vendor_ids":'); return setTimeout(() => res.destroy(), 25); }
    return respond(res, 200, value);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, out, data, calls, forbidden,
    setMode: value => { mode = value; }, release: () => { mode = 'normal'; held.splice(0).forEach(fn => fn()); },
    close: async () => { held.splice(0); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
