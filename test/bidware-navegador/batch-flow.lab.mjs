// Actual Message/Queue components against a loopback-only, read-only synthetic API.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createRequire as __cr } from 'node:module'; const { build  } = __cr(__cr(import.meta.url).resolve('vite'))('esbuild');
const require = createRequire(import.meta.url), { fixture, reader, uid } = require('./batch-flow.fixture.cjs');
const root = process.cwd();
export async function startFlowLab() {
  const out = path.join(root, '.test-output/bidware-artifacts/engine-flow-01-20261026/lab'); fs.mkdirSync(out, { recursive: true });
  const data = fixture();
  fs.writeFileSync(path.join(out, 'auth.tsx'), `import {useSyncExternalStore} from 'react';
const listeners=new Set<()=>void>();let kind='admin';
let state=make();function make(){return {user:{id:kind==='other'?'${uid(901)}':'${data.scope.userId}',app_metadata:{organization_id:kind==='other'?'org_other':'${data.scope.organizationId}'}},role:kind==='viewer'?'viewer':kind==='operator'?'operator':'admin',roleLoaded:kind!=='unverified'}}
export const identity=()=>state;export function change(value:string){kind=value;state=make();listeners.forEach(fn=>fn())}
export function useAuth(){const s=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>state);return {...s,can:(need:string)=>need==='read'||(s.roleLoaded&&s.role!=='viewer')}}
`);
  fs.writeFileSync(path.join(out, 'api.ts'), `import {identity} from './auth';
export class ApiError extends Error{status:number;code?:string;constructor(message:string,init:any={}){super(message);this.status=init.status||0;this.code=init.code}}
export async function callRatewareApi(action:string,body:any={}){const who=identity();const r=await fetch('/api',{method:'POST',headers:{'content-type':'application/json','x-org':who.user.app_metadata.organization_id,'x-role':who.role},body:JSON.stringify({action,...body})});const value=await r.json();if(!r.ok)throw new ApiError(value.error||'Synthetic read failed',{status:r.status});return value}
`);
  fs.writeFileSync(path.join(out, 'env.ts'), `export const env={appOrigin:window.location.origin};export const isConfigured=true;`);
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route,Link} from 'react-router-dom';import {MessagePage} from '@/features/outreach/MessagePage';import {DeliveryQueuePage} from '@/features/outreach/DeliveryQueuePage';import {BatchFlowPanel} from '@/features/outreach/BatchFlowPanel';import {setLang} from '@/i18n/language';import {change} from './auth';import '@/styles/global.css';
const originalNow=Date.now;let offset=0;Date.now=()=>originalNow()+offset;
function expire(){offset+=301000;window.dispatchEvent(new Event('focus'))}
function Lab(){return <BrowserRouter><div className="lab-controls" style={{padding:12,background:'#fff1e8',display:'flex',gap:8,flexWrap:'wrap'}}><b>LAB · DATOS SINTÉTICOS</b>{['admin','operator','viewer','other','unverified'].map(role=><button key={role} onClick={()=>change(role)}>{role}</button>)}<button onClick={()=>setLang('es')}>ES</button><button onClick={()=>setLang('en')}>EN</button><button onClick={expire}>Vencer lectura</button><Link to="/rfx/${data.scope.eventId}/message">Mensaje lab</Link><Link to="/rfx/${data.scope.eventId}/delivery">Cola lab</Link><Link to="/rfx/${uid(801)}/message">Otro RFx lab</Link></div>
<Routes><Route path="/rfx/:id/message" element={<MessagePage/>}/><Route path="/rfx/:id/delivery" element={<DeliveryQueuePage/>}/><Route path="/panel" element={<BatchFlowPanel eventId="${data.scope.eventId}"/>}/><Route path="*" element={<p>Destino de navegación existente; no se ejecuta su acción en este laboratorio.</p>}/></Routes></BrowserRouter>}
createRoot(document.getElementById('root')!).render(<Lab/>);
`);
  const buildOptions = { entryPoints: [path.join(out, 'entry.tsx')], bundle: true, format: 'esm', jsx: 'automatic', alias: { '@/auth/AuthContext': path.join(out, 'auth.tsx'), '@/lib/api-client': path.join(out, 'api.ts'), '@/config/env': path.join(out, 'env.ts'), '@': path.join(root, 'src', 'bidware') }, define: { 'process.env.NODE_ENV': '"development"' }, sourcemap: false };
  await build({ ...buildOptions, outfile: path.join(out, 'app.js') });
  // Compare with the exact pre-change copies. Other existing files use the same checkout.
  const before = process.env.BIDWARE_BASELINE || path.resolve(root, '../bidware-base');
  await build({ ...buildOptions, outfile: path.join(out, 'baseline.js'), plugins: [{ name: 'previous-screens', setup(build) {
    build.onLoad({ filter: /[\\/]outreach[\\/](MessagePage|DeliveryQueuePage)\.tsx$/ }, args => {
      const relative = path.relative(path.join(root, 'src', 'bidware'), args.path), file = path.join(before, 'src', relative);
      return { contents: fs.readFileSync(file, 'utf8'), loader: 'tsx', resolveDir: path.dirname(args.path) };
    });
  } }] });
  let mode = 'normal'; const calls = [], held = [], rejected = [];
  const respond = (res, status, value) => { if (res.destroyed) return; res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  const api = reader(data);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET') {
      if (url.pathname === '/results') return respond(res, 200, { mode, calls, rejected, writes: 0 });
      const assets = { '/app.js': 'app.js', '/app.css': 'app.css', '/baseline.js': 'baseline.js', '/baseline.css': 'baseline.css' };
      const file = assets[url.pathname];
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'self' about:; worker-src 'none'");
      if (file) { res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript'); return res.end(fs.readFileSync(path.join(out, file))); }
      if (url.pathname === '/favicon.ico') { res.statusCode = 204; return res.end(); }
      const bundle = url.searchParams.has('baseline') ? 'baseline' : 'app';
      res.setHeader('content-type', 'text/html'); return res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ENG-FLOW-01 · laboratorio</title><link rel="stylesheet" href="/${bundle}.css"></head><body><div id="root"></div><script type="module" src="/${bundle}.js"></script></body></html>`);
    }
    let raw = ''; for await (const chunk of req) raw += chunk;
    let body; try { body = JSON.parse(raw); } catch { return respond(res, 400, { error: 'Invalid synthetic request' }); }
    if (url.pathname === '/control') {
      mode = body.mode;
      if (mode === 'release') { mode = 'normal'; held.splice(0).forEach(fn => fn()); }
      return respond(res, 200, { mode });
    }
    if (url.pathname !== '/api') return respond(res, 404, { error: 'Not in lab' });
    const allowed = ['list_outreach_campaigns', 'preview_outreach_audience', 'list_rfx_invitation_wave_reviews', 'list_outreach_audience_segments', 'list_outreach_messages', 'get_outreach_message', 'list_rfx_detail', 'list_outreach_templates', 'list_gmail_connections', 'get_outreach_tracking_summary', 'list_contact_history'];
    calls.push({ action: body.action, org: req.headers['x-org'], role: req.headers['x-role'], mode, offset: body.offset, event: body.rfx_event_id || body.event_id });
    if (!allowed.includes(body.action)) { rejected.push(body.action); return respond(res, 405, { error: 'Writes forbidden by the lab' }); }
    if (req.headers['x-org'] !== data.scope.organizationId || ((body.rfx_event_id || body.event_id) && (body.rfx_event_id || body.event_id) !== data.scope.eventId)) return respond(res, 404, { error: 'Synthetic event not accessible' });
    if (mode === 'forbidden') return respond(res, 403, { error: 'Synthetic permission denied' });
    if (mode === 'interrupt' && body.action === 'preview_outreach_audience') return req.socket.destroy();
    let value;
    switch (body.action) {
      case 'list_rfx_detail': value = { event: { id: data.scope.eventId, name: 'RFx sintético · preparación de lote', rfx_id: 'RFx-LAB', status: 'draft', organization_id: data.scope.organizationId }, lanes: [{ id: uid(850), origin: 'Origen sintético', destination: 'Destino sintético', invitations: data.audience.map(a => ({ vendor_id: a.vendor_id, invitation_status: 'drafted', vendors: { vendor_name: a.vendor_name } })) }] }; break;
      case 'list_outreach_templates': value = { rows: [{ id: uid(600), name: 'Plantilla Spanish sintética', subject: 'Prueba {{vendor_name}}', html_body: '<p>Prueba sintética sin envío.</p>', canonical_language: 'es', is_default: true, owner_email: null }, { id: uid(601), name: 'Plantilla alternativa sintética', subject: 'Prueba alternativa', html_body: '<p>Otro texto sintético.</p>', canonical_language: 'es', owner_email: null }] }; break;
      case 'list_gmail_connections': value = { rows: [{ id: uid(620), mailbox_email: 'sender@example.test', status: 'connected', access_token_expires_at: '2099-01-01' }] }; break;
      case 'get_outreach_tracking_summary': value = { total: data.messages.length, states: { drafted: 6, sent: 1, failed: 1 } }; break;
      case 'get_outreach_message': value = { row: data.messages.find(row => row.id === body.id && row.rfx_event_id === body.rfx_event_id) ?? null }; break;
      case 'list_contact_history': value = { contract: 'bidware.whatsapp-evidence.v1', view: 'pending', scope: null, rows: [], total: 0, has_more: false }; break;
      default: value = await api(body.action, body);
    }
    if (body.action === 'list_outreach_campaigns' && mode === 'ambiguous') {
      value.rows.push({ ...value.rows[0], id: uid(701), name: 'Campaña sintética B' });
      if (body.rfx_event_id) value.total = value.rows.length;
    }
    if (body.action === 'preview_outreach_audience') {
      if (mode === 'foreign') value.rfx_event_id = uid(801);
      if (mode === 'partial') value.total++;
      if (mode === 'hold') return held.push(() => respond(res, 200, value));
    }
    return respond(res, 200, value);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, out, eventId: data.scope.eventId, data, result: () => ({ calls, rejected, writes: 0 }), close: async () => {
    held.splice(0).forEach(fn => fn()); fs.writeFileSync(path.join(out, 'http-final.json'), JSON.stringify({ calls, rejected, writes: 0 }, null, 2));
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lab = await startFlowLab(); console.log(`ENG-FLOW-01 synthetic read-only lab: ${lab.origin}/rfx/${lab.eventId}/message`);
  process.on('SIGINT', async () => { await lab.close(); process.exit(0); });
}
