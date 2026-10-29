// Actual Eventos/common UI/router/React/CSS; synthetic session and read promises, no auth or transport.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(resolve(root, 'package.json'));
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
const { chromium } = require(process.env.FR8_PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.env.FR8_EVENTS_OUTPUT || '../events-browser');
const baseline = process.env.FR8_EVENTS_BASELINE;
await mkdir(output, { recursive: true });
const apiSource = await readFile(resolve(root, 'src/cliente/api.ts'), 'utf8');
const errorClass = apiSource.match(/export class ErrorApi extends Error \{[\s\S]*?\n\}/)?.[0];
assert.ok(errorClass, 'Extract the unchanged original ErrorApi class without its transport/server imports');
const bundle = await build({
  stdin: { contents: `import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {BrowserRouter,Routes,Route,useLocation} from 'react-router-dom';import {Eventos} from './src/ui/Eventos';import {NavegadorGlobal} from './src/ui/comun';import {ErrorApi} from './src/cliente/api';
    const root=createRoot(document.getElementById('app'));
    window.qa={calls:[],writes:[],show:true,strict:new URLSearchParams(location.search).has('strict'),session:{listo:true,rol:'admin',modo:'rateware',correo:'admin@example.test',usuarioSimulado:'admin'},now:Date.parse('2026-10-27T12:00:00Z'),intervals:[]};
    Date.now=()=>qa.now;const interval=window.setInterval,clear=window.clearInterval;
    window.setInterval=(fn,ms,...args)=>{if(ms!==30000)return interval(fn,ms,...args);const t={id:200000+qa.intervals.length,fn:()=>fn(...args),active:true};qa.intervals.push(t);return t.id};
    window.clearInterval=id=>{const t=qa.intervals.find(t=>t.id===id);if(t)t.active=false;else clear(id)};
    qa.advance=ms=>{qa.now+=ms;qa.intervals.filter(t=>t.active).forEach(t=>t.fn())};
    const source=key=>new Proxy({eventos:()=>new Promise((resolve,reject)=>qa.calls.push({source:key,identity:{rol:qa.session.rol,correo:qa.session.correo,modo:qa.session.modo,usuarioSimulado:qa.session.usuarioSimulado},resolve,reject}))},{get(obj,key){if(key in obj)return obj[key];return(...args)=>{qa.writes.push({key,args});throw Error('Forbidden event operation '+String(key))}}});
    qa.sources={a:source('a'),b:source('b')};qa.session.api=qa.sources.a;
    qa.fail=(i,status=0)=>qa.calls[i].reject(status?new ErrorApi(status,'SYNTHETIC','Error sintético '+status):new TypeError('Fallo de red sintético'));
    function Destination(){const l=useLocation();return <h1>Destino {l.pathname}</h1>}
    window.qaRender=(patch={})=>{const{source,...rest}=patch;Object.assign(qa.session,rest);if(source)qa.session.api=qa.sources[source];
      const body=<BrowserRouter><NavegadorGlobal/><main className="contenido">{qa.show?<Routes><Route path="/" element={<Eventos/>}/><Route path="/eventos" element={<Eventos/>}/><Route path="/eventos/:id" element={<Destination/>}/><Route path="/rfx/new" element={<Destination/>}/></Routes>:<h1>Fuera del listado</h1>}</main></BrowserRouter>;
      flushSync(()=>root.render(qa.strict?<StrictMode>{body}</StrictMode>:body));};qaRender();`,
    resolveDir: root, loader: 'tsx', sourcefile: 'events-fixture.tsx' },
  bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'synthetic-session', setup(b) {
    b.onLoad({ filter: /[/\\]ui[/\\]sesion\.tsx$/ }, () => ({ loader: 'ts', contents: 'export const NOMBRE_ROL={},USUARIOS_SIMULADOS=[];export function useSesion(){return window.qa.session}' }));
    b.onLoad({ filter: /[/\\]cliente[/\\]api\.ts$/ }, () => ({ loader: 'ts', contents: errorClass }));
    if (baseline) b.onLoad({ filter: /[/\\]ui[/\\]Eventos\.tsx$/ }, async a => ({ contents: await readFile(resolve(baseline, 'Eventos.tsx'), 'utf8'), loader: 'tsx', resolveDir: dirname(a.path) }));
  } }],
});
assert.ok(!Object.keys(bundle.metafile.inputs).some(p => /node_modules.*(?:supabase|anthropic)|[/\\]servidor[/\\]|\.env|[/\\]auth[/\\]/.test(p)), 'No auth/backend/provider modules bundled');
const event = (id, estado = 'abierto', offers = 1, participants = 2) => ({ id, folio: `RFx-SYN-${id}`, nombre: `Evento sintético ${id}`, shipper: `Cliente sintético ${id}`, estado, ofertas: offers, participaciones: participants, rutas: [], plazo: '2099-12-31', prueba: true });
const datasets = { a: [event('A')], b: [event('B', 'cerrado', 2, 2), event('C', 'adjudicado', 2, 2)], empty: [] };
const results = [], external = [], writes = [], errors = [];
let assertions = 0, browser, page;
const verify = (ok, why) => { assertions++; assert.ok(ok, why); };
const server = createServer(async (req, res) => {
  if (req.method !== 'GET') { writes.push(req.method); res.writeHead(405).end(); return; }
  res.setHeader('Cache-Control', 'no-store'); const p = new URL(req.url, 'http://127.0.0.1').pathname;
  if (p === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
  else if (p === '/tokens.css' || p === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(await readFile(resolve(root, p === '/tokens.css' ? 'src/estilos/marksman-brand-tokens.css' : 'src/estilos/app.css'))); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/styles.css"><div id="app"></div><script type="module" src="/fixture.js"></script></html>'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done)); const origin = `http://127.0.0.1:${server.address().port}`;
const frames = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const count = () => page.evaluate(() => qa.calls.length);
const rows = () => page.locator('tbody tr');
const text = () => page.locator('main').innerText();
async function change(patch) { await page.evaluate(patch => qaRender(patch), patch); await frames(); }
async function fresh({ strict = false, width = 1280 } = {}) {
  await page.setViewportSize({ width, height: 1000 }); await page.goto(origin + (strict ? '/?strict' : '/'));
  await page.getByRole('heading', { name: 'Eventos', exact: true }).waitFor(); await page.waitForFunction(n => qa.calls.length === n, strict ? 2 : 1); await frames();
}
async function reply(i = 0, data = 'a') { await page.evaluate(({ i, data }) => qa.calls[i].resolve(data), { i, data: typeof data === 'string' ? datasets[data] : data }); await frames(); }
async function fail(i = 0, status = 0) { await page.evaluate(({ i, status }) => qa.fail(i, status), { i, status }); await frames(); }
async function advance(ms = 600001) { await page.evaluate(ms => qa.advance(ms), ms); await frames(); }
async function check(name, fn) { const n = assertions; try { await fn(); results.push({ name, passed: true, assertions: assertions - n }); } catch (e) { results.push({ name, passed: false, assertions: assertions - n, error: e.message }); } }
async function isB() {
  verify(await rows().count() === 2 && (await text()).includes('RFx-SYN-B') && !(await text()).includes('RFx-SYN-A'), 'Only current B rows');
  const counters = await page.locator('.contadores').textContent(); verify(counters.includes('Te toca: 2') && counters.includes('Esperando carriers: 0') && counters.includes('Entregados: 1'), 'Counters belong to current result');
}
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' }); const context = await browser.newContext();
  await context.route('**/*', route => { const r = route.request(); if (new URL(r.url()).origin !== origin) { external.push(r.url()); return route.abort(); } if (r.method() !== 'GET') { writes.push(r.method()); return route.abort(); } return route.continue(); });
  page = await context.newPage(); page.setDefaultTimeout(1800); page.setDefaultNavigationTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await check('StrictMode newer success wins even if the older response arrives last', async () => {
    await fresh({ strict: true }); await reply(1, 'b'); await reply(0, 'a'); await isB(); verify(await count() === 2, 'No extra reads');
  });
  await check('Older success cannot stop loading while the latest read is pending', async () => {
    await fresh({ strict: true }); await reply(0, 'a'); verify(await rows().count() === 0 && (await text()).includes('Leyendo Rateware'), 'Old response cannot end current loading'); await reply(1, 'b'); await isB();
  });
  await check('Old rejection cannot replace newer data', async () => {
    await fresh({ strict: true }); await reply(1, 'b'); await fail(0, 500); await isB(); verify(await page.getByRole('alert').count() === 0, 'No obsolete error');
  });
  await check('Old data cannot erase the current permission error', async () => {
    await fresh({ strict: true }); await fail(1, 403); await reply(0, 'a'); verify(await rows().count() === 0, 'No old rows after permission failure'); verify((await page.getByRole('alert').textContent()).includes('Sin permiso'), 'Current denial retained');
  });
  await check('Current empty result stays empty after an old nonempty result', async () => {
    await fresh({ strict: true }); await reply(1, 'empty'); await reply(0, 'a'); verify(await rows().count() === 0 && (await text()).includes('Aún no hay eventos en tu organización'), 'Empty remains an actual result'); verify(await page.getByRole('alert').count() === 0, 'Empty not error');
  });
  for (const patch of [{ source: 'b' }, { correo: 'other@example.test' }, { rol: 'viewer' }, { modo: 'simulado' }, { usuarioSimulado: 'ajeno' }]) await check(`Context ${JSON.stringify(patch)} retires pending success and starts its own read`, async () => {
    await fresh(); await change(patch); verify(await count() === 2, 'New context requests its own source'); await reply(1, 'b'); await reply(0, 'a');
    verify(await rows().count() === 2 && (await text()).includes('RFx-SYN-B') && !(await text()).includes('RFx-SYN-A'), 'Only current context rows');
    verify(await page.getByRole('alert').count() === 0, 'No obsolete feedback');
  });
  for (const patch of [{ source: 'b' }, { correo: 'other@example.test' }, { rol: 'viewer' }]) await check(`Context ${JSON.stringify(patch)} retires old rejection while new source waits`, async () => {
    await fresh(); await change(patch); await fail(0, 401); verify(await rows().count() === 0 && (await text()).includes('Leyendo Rateware'), 'Old error cannot replace new loading'); verify(await page.getByRole('alert').count() === 0, 'No old denial'); await reply(1, 'b'); verify(await rows().count() === 2, 'Current success admitted');
  });
  await check('Changing source immediately removes previously visible data and counters', async () => {
    await fresh(); await reply(); await change({ source: 'b' }); verify(await rows().count() === 0 && await page.locator('.contadores').count() === 0, 'Previous result hidden'); verify((await text()).includes('Leyendo Rateware'), 'Pending shown rather than old data'); await reply(1, 'b'); await isB();
  });
  await check('Same API object with a changed account also removes the previous result', async () => {
    await fresh(); await reply(); await change({ correo: 'other@example.test' }); verify(await rows().count() === 0 && await count() === 2, 'Account change is independent of API object identity'); await reply(1, 'empty'); verify((await text()).includes('Aún no hay eventos'), 'New account result shown');
  });
  await check('Readiness false clears old results, retires pending reads and performs no new read', async () => {
    await fresh(); await change({ listo: false }); await reply(); verify(await rows().count() === 0 && (await text()).includes('Leyendo Rateware'), 'Not-ready cannot display old result'); verify(await count() === 1, 'No read while not ready');
    await change({ listo: true }); verify(await count() === 2, 'Ready starts explicit current lifecycle read'); await reply(1, 'b'); await isB();
  });
  await check('Ready to false to true cannot revive an earlier request', async () => {
    await fresh(); await change({ listo: false }); await change({ listo: true }); await reply(1, 'b'); await fail(0, 500); await isB(); verify(await page.getByRole('alert').count() === 0, 'Retired error stays retired');
  });
  await check('A to B to A still retires the first A read', async () => {
    await fresh(); await change({ source: 'b' }); await change({ source: 'a' }); verify(await count() === 3, 'Three lifecycle reads'); await reply(2, 'b'); await reply(0, 'a'); await fail(1, 403); await isB();
  });
  for (const error of [false, true]) await check(`Unmount/remount ignores former ${error ? 'error' : 'success'}`, async () => {
    await fresh(); await page.evaluate(() => { qa.show = false; qaRender(); }); await frames(); await page.evaluate(() => { qa.show = true; qaRender(); }); await frames();
    verify(await count() === 2, 'New instance reads once'); if (error) await fail(0, 403); else await reply(0, 'a');
    verify(await rows().count() === 0 && (await text()).includes('Leyendo Rateware'), 'Old instance cannot affect new loading'); await reply(1, 'b'); await isB();
  });
  await check('Equivalent rerender keeps current result without another read', async () => {
    await fresh(); await reply(); await change({}); verify(await count() === 1 && await rows().count() === 1, 'Same source and context stable');
  });
  for (const status of [0, 401, 403, 404, 500]) await check(`Current ${status || 'network'} error keeps existing state semantics`, async () => {
    await fresh(); await fail(0, status); verify(await rows().count() === 0 && await page.locator('.contadores').count() === 0, 'Error is not a numeric result');
    const body = await text();
    verify(status === 404 ? body.includes('No encontrado en tu organización') : [401, 403].includes(status) ? body.includes('Sin permiso') : body.includes('Rateware no respondió') && body.includes('Los datos no son cero'), 'Existing error distinction');
    verify(await page.getByRole('button', { name: 'Reintentar', exact: true }).count() === ([0, 500].includes(status) ? 1 : 0), 'Retry affordance unchanged');
    await advance(); verify(await count() === 1, 'No automatic network retry');
  });
  await check('Retry with keyboard issues one new read and can recover', async () => {
    await fresh(); await fail(); const retry = page.getByRole('button', { name: 'Reintentar', exact: true }); await retry.focus(); await page.keyboard.press('Enter');
    verify(await count() === 2 && (await text()).includes('Leyendo Rateware'), 'Manual retry'); await reply(1, 'b'); await isB();
  });
  await check('Update uses the current read timestamp and old responses cannot reset it', async () => {
    await fresh({ strict: true }); await reply(1); await advance(); await reply(0, 'b');
    verify(await page.getByRole('button', { name: 'Actualizar', exact: true }).count() === 1, 'Ignored old response does not refresh age');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).focus(); await page.keyboard.press('Enter'); verify(await count() === 3, 'Keyboard update reads once');
    await reply(2, 'b'); await isB(); verify(await page.getByRole('button', { name: 'Actualizar', exact: true }).count() === 0, 'Current success resets timestamp');
  });
  await check('An old initial response cannot replace a newer manual update', async () => {
    await fresh({ strict: true }); await reply(1); await advance(); await page.getByRole('button', { name: 'Actualizar', exact: true }).click(); await reply(2, 'b'); await reply(0, 'a'); await isB(); verify(await count() === 3, 'No hidden extra query');
  });
  await check('Role and mode retain existing read-only presentation and New event affordance', async () => {
    await fresh(); await reply(0, 'b'); verify(await page.getByRole('link', { name: 'Nuevo evento', exact: true }).count() === 1, 'Existing admin creation link');
    await change({ rol: 'viewer' }); await reply(1, 'b'); verify(await page.getByRole('link', { name: 'Nuevo evento', exact: true }).count() === 0 && !(await text()).includes('Te toca:'), 'Viewer presentation retained');
    await change({ rol: 'admin', modo: 'simulado' }); await reply(2); verify(await page.getByRole('link', { name: 'Nuevo evento', exact: true }).count() === 0, 'Simulated-mode link policy retained');
    verify(await page.evaluate(() => qa.writes.length) === 0, 'No event action');
  });
  await check('Tab, Shift+Tab and Enter navigate through the native event link', async () => {
    await fresh(); await reply(); const link = page.getByRole('link', { name: 'Evento sintético A', exact: true });
    await page.getByRole('link', { name: 'Nuevo evento', exact: true }).focus(); await page.keyboard.press('Tab'); verify(await link.evaluate(el => el === document.activeElement), 'Event link reachable');
    await page.keyboard.press('Shift+Tab'); verify(await page.getByRole('link', { name: 'Nuevo evento', exact: true }).evaluate(el => el === document.activeElement), 'Reverse keyboard navigation');
    await link.focus(); await page.keyboard.press('Enter'); verify(await page.getByRole('heading', { name: 'Destino /eventos/A', exact: true }).isVisible(), 'Correct destination'); verify(await page.evaluate(() => qa.writes.length) === 0, 'Navigation read-only');
  });
  await check('Reload fetches once without replaying event actions', async () => {
    await fresh(); await reply(); await page.reload(); await page.getByRole('heading', { name: 'Eventos', exact: true }).waitFor(); await frames(); verify(await count() === 1 && await rows().count() === 0, 'Fresh lifecycle read only'); verify(await page.evaluate(() => qa.writes.length) === 0, 'No replay');
  });
  await check('Mobile current result remains usable', async () => {
    await fresh({ width: 390 }); await change({ source: 'b' }); await reply(1, 'b'); await reply(0, 'a'); await isB();
    verify(await page.getByRole('link', { name: 'Evento sintético B', exact: true }).isVisible(), 'Mobile current link visible'); await page.screenshot({ path: resolve(output, 'events-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 }); await page.screenshot({ path: resolve(output, 'events-desktop.png'), fullPage: true });
  });
  await check('Boundaries and browser errors', async () => { verify(external.length === 0, 'No external traffic'); verify(writes.length === 0, 'No HTTP writes'); verify(errors.length === 0, 'No unhandled browser errors'); verify(await page.evaluate(() => qa.writes.length) === 0, 'No domain operation'); });
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
const report = { kind: 'synthetic-component-browser', baseline: baseline ?? null, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, assertions, results, external, writes, errors,
  scope: 'Real Eventos/common UI/router/React/styles, fake session/context and deferred read API. No real auth, event action, business write, provider or backend.' };
await writeFile(resolve(output, 'RESULTS.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, failed: report.failed, assertions, output, failures: results.filter(r => !r.passed) })); if (report.failed) process.exitCode = 1;
