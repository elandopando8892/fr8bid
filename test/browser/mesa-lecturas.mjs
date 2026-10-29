// Real Mesa/domain/common UI/router/CSS; deferred synthetic reads, no auth/backend transport.
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
const output = resolve(process.env.FR8_MESA_READS_OUTPUT || '../mesa-reads-browser');
const baseline = process.env.FR8_MESA_READS_BASELINE;
await mkdir(output, { recursive: true });
const apiSource = await readFile(resolve(root, 'src/cliente/api.ts'), 'utf8');
const errorClass = apiSource.match(/export class ErrorApi extends Error \{[\s\S]*?\n\}/)?.[0];
assert.ok(errorClass, 'Extract the original ErrorApi class without transport/server imports');
const bundle = await build({
  stdin: { contents: `import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {BrowserRouter,Routes,Route} from 'react-router-dom';import {Mesa} from './src/ui/Mesa';import {NavegadorGlobal} from './src/ui/comun';
    import {detalle} from './src/cliente/mapear';import {ErrorApi} from './src/cliente/api';
    const root=createRoot(document.getElementById('app'));
    window.qa={calls:[],operations:[],confirmations:[],show:true,id:'evento-test',strict:new URLSearchParams(location.search).has('strict'),session:{listo:true,rol:'admin',modo:'rateware',correo:'admin@example.test',usuarioSimulado:'admin'},now:Date.parse('2026-10-27T12:00:00Z'),intervals:[]};
    Date.now=()=>qa.now;const interval=window.setInterval,clear=window.clearInterval;
    window.setInterval=(fn,ms,...args)=>{if(ms!==30000)return interval(fn,ms,...args);const t={id:200000+qa.intervals.length,fn:()=>fn(...args),active:true};qa.intervals.push(t);return t.id};
    window.clearInterval=id=>{const t=qa.intervals.find(t=>t.id===id);if(t)t.active=false;else clear(id)};
    qa.advance=ms=>{qa.now+=ms;qa.intervals.filter(t=>t.active).forEach(t=>t.fn())};
    qa.data=(label='A',id=qa.id,receipt=null)=>detalle({event:{id,rfx_id:'RFx-SYN-'+label,name:'Evento '+label,customer:'Cliente '+label,status:label==='B'?'closed':'open',due_date:'2099-12-31'},
      lanes:[1,2].map(i=>({id:'r'+i,lane_number:i,origin_city:'Origen '+label,destination_city:'Destino '+label,equipment:'Caja seca',currency:'USD',invitations:[{id:'p'+i,vendor_id:'v'+i,vendors:{vendor_name:'Carrier '+label+i,primary_email:'carrier'+i+'@example.test'},invitation_status:'quoted',bid_rate:label==='B'?2700:1700,currency:'USD',responded_at:'2026-10-21T12:00:00Z',created_at:'2026-10-20T12:00:00Z',award_role:'primary',award_reason:'Motivo sintético',awarded_at:'2026-10-21T13:00:00Z',valid_through:'2099-12-31'}]}))},[],receipt);
    const source=key=>new Proxy({
      detalle:(id,recibo)=>new Promise((resolve,reject)=>qa.calls.push({source:key,id,recibo,identity:{rol:qa.session.rol,correo:qa.session.correo,modo:qa.session.modo,usuarioSimulado:qa.session.usuarioSimulado},resolve,reject})),
      prepararEntrega:()=>{qa.operations.push('synthetic-pure-prepare');return{estado:'preparada',operationId:'syn-op',error:null}},
      confirmarEntrega:()=>new Promise(resolve=>{qa.operations.push('synthetic-confirm');qa.confirmations.push(resolve)})
    },{get(obj,key){if(key in obj)return obj[key];return(...args)=>{qa.operations.push('FORBIDDEN:'+String(key));throw Error('Forbidden synthetic operation '+String(key))}}});
    qa.sources={a:source('a'),b:source('b')};qa.session.api=qa.sources.a;
    qa.fail=(i,status=0)=>qa.calls[i].reject(status?new ErrorApi(status,'SYNTHETIC','Error sintético '+status):new TypeError('Fallo de red sintético'));
    qa.reply=(i,label='A')=>qa.calls[i].resolve(qa.data(label,qa.calls[i].id,qa.calls[i].recibo));
    qa.confirm=()=>qa.confirmations[0]({entrega:{estado:'confirmada',operationId:'syn-op',error:null},recibo:{operationId:'syn-op',insertados:2,enlazados:0,enRevision:2,conservadosAprobados:0,stagingIds:[],estadoDestino:'pending_review',momento:'2026-10-27T12:00:00Z'}});
    window.qaRender=(patch={})=>{const{source,id,...rest}=patch;Object.assign(qa.session,rest);if(source)qa.session.api=qa.sources[source];if(id)qa.id=id;
      const body=<BrowserRouter><NavegadorGlobal/><main className="contenido">{qa.show?<Routes><Route path="*" element={<Mesa id={qa.id}/>}/></Routes>:<h1>Fuera de la Mesa</h1>}</main></BrowserRouter>;
      flushSync(()=>root.render(qa.strict?<StrictMode>{body}</StrictMode>:body));};qaRender();`,
    resolveDir: root, loader: 'tsx', sourcefile: 'mesa-reads-fixture.tsx' },
  bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'synthetic-session', setup(b) {
    b.onLoad({ filter: /[/\\]ui[/\\]sesion\.tsx$/ }, () => ({ loader: 'ts', contents: 'export const NOMBRE_ROL={},USUARIOS_SIMULADOS=[];export function useSesion(){return window.qa.session}' }));
    b.onLoad({ filter: /[/\\]cliente[/\\]api\.ts$/ }, () => ({ loader: 'ts', contents: errorClass }));
    if (baseline) b.onLoad({ filter: /[/\\]ui[/\\]Mesa\.tsx$/ }, async a => ({ contents: await readFile(resolve(baseline, 'Mesa.tsx'), 'utf8'), loader: 'tsx', resolveDir: dirname(a.path) }));
  } }],
});
assert.ok(!Object.keys(bundle.metafile.inputs).some(p => /node_modules.*(?:supabase|anthropic)|[/\\]servidor[/\\]|\.env|[/\\]auth[/\\]/.test(p)), 'No auth/backend/provider modules bundled');
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
const text = () => page.locator('main').innerText();
const hasMesa = () => page.getByRole('navigation', { name: 'Recorrido', exact: true }).count();
async function change(patch) { await page.evaluate(patch => qaRender(patch), patch); await frames(); }
async function fresh({ strict = false, width = 1280 } = {}) {
  await page.setViewportSize({ width, height: 1050 }); await page.goto(origin + (strict ? '/?strict' : '/'));
  await page.waitForFunction(n => qa.calls.length === n, strict ? 2 : 1); await frames();
}
async function reply(i = 0, label = 'A') { await page.evaluate(({ i, label }) => qa.reply(i, label), { i, label }); await frames(); }
async function fail(i = 0, status = 0) { await page.evaluate(({ i, status }) => qa.fail(i, status), { i, status }); await frames(); }
async function advance() { await page.evaluate(() => qa.advance(600001)); await frames(); }
async function check(name, fn) { const n = assertions; try { await fn(); results.push({ name, passed: true, assertions: assertions - n }); } catch (e) { results.push({ name, passed: false, assertions: assertions - n, error: e.message }); } }
async function isB(expectedStep = 'Rateware') {
  verify(await hasMesa() === 1 && (await text()).includes('RFx-SYN-B') && !(await text()).includes('RFx-SYN-A'), 'Only current B detail');
  verify((await page.locator('.cabecera').innerText()).includes('Cerrado'), 'Current event status');
  const step = await page.locator('.siguiente').innerText();
  verify(step.includes(expectedStep), `Current workflow step: expected ${expectedStep}, got ${step}`);
}
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' }); const context = await browser.newContext();
  await context.route('**/*', route => { const r = route.request(); if (new URL(r.url()).origin !== origin) { external.push(r.url()); return route.abort(); } if (r.method() !== 'GET') { writes.push(r.method()); return route.abort(); } return route.continue(); });
  page = await context.newPage(); page.setDefaultTimeout(1800); page.setDefaultNavigationTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await check('StrictMode newer detail wins if the former response arrives last', async () => {
    await fresh({ strict: true }); await reply(1, 'B'); await reply(0); await isB(); verify(await count() === 2, 'No extra reads');
  });
  await check('Old success cannot end loading while the latest detail is pending', async () => {
    await fresh({ strict: true }); await reply(0); verify(await hasMesa() === 0 && (await text()).includes('Leyendo Rateware'), 'Current loading retained'); await reply(1, 'B'); await isB();
  });
  await check('Old rejection cannot replace current detail', async () => {
    await fresh({ strict: true }); await reply(1, 'B'); await fail(0, 500); await isB(); verify(await page.getByRole('alert').count() === 0, 'No obsolete error');
  });
  await check('Old detail cannot erase a current permission failure', async () => {
    await fresh({ strict: true }); await fail(1, 403); await reply(0); verify(await hasMesa() === 0, 'No old detail after denial'); verify((await page.getByRole('alert').textContent()).includes('Sin permiso'), 'Current error retained');
  });
  for (const patch of [{ source: 'b' }, { correo: 'other@example.test' }, { rol: 'viewer' }, { modo: 'simulado' }, { usuarioSimulado: 'ajeno' }, { id: 'evento-otro' }]) await check(`Context ${JSON.stringify(patch)} retires pending success`, async () => {
    await fresh(); await change(patch); verify(await count() === 2, 'New context starts its read'); await reply(1, 'B'); await reply(0); await isB(); verify(await page.getByRole('alert').count() === 0, 'No old feedback');
  });
  for (const patch of [{ source: 'b' }, { correo: 'other@example.test' }, { rol: 'viewer' }]) await check(`Context ${JSON.stringify(patch)} retires an old error during new loading`, async () => {
    await fresh(); await change(patch); await fail(0, 401); verify(await hasMesa() === 0 && (await text()).includes('Leyendo Rateware'), 'No obsolete denial'); await reply(1, 'B'); await isB();
  });
  await check('Previously loaded detail disappears immediately on account change with the same API', async () => {
    await fresh(); await reply(); await change({ correo: 'other@example.test' }); verify(await hasMesa() === 0 && (await text()).includes('Leyendo Rateware'), 'Former detail hidden'); verify(!(await text()).includes('RFx-SYN-A'), 'No previous event breadcrumb'); await reply(1, 'B'); await isB();
  });
  await check('Readiness false clears detail and retires a pending read without starting another', async () => {
    await fresh(); await change({ listo: false }); await reply(); verify(await hasMesa() === 0 && (await text()).includes('Leyendo Rateware'), 'Not ready cannot admit old success'); verify(await count() === 1, 'No not-ready read'); await change({ listo: true }); await reply(1, 'B'); await isB();
  });
  await check('Ready to false to true does not revive the prior lifecycle', async () => {
    await fresh(); await change({ listo: false }); await change({ listo: true }); await reply(1, 'B'); await fail(0, 500); await isB(); verify(await page.getByRole('alert').count() === 0, 'Retired rejection stays retired');
  });
  await check('A to B to A cannot revive the first source read', async () => {
    await fresh(); await change({ source: 'b' }); await change({ source: 'a' }); verify(await count() === 3, 'Three explicit lifecycle reads'); await reply(2, 'B'); await reply(0); await fail(1, 403); await isB();
  });
  for (const error of [false, true]) await check(`Unmount/remount retires former ${error ? 'error' : 'success'}`, async () => {
    await fresh(); await page.evaluate(() => { qa.show = false; qaRender(); }); await frames(); await page.evaluate(() => { qa.show = true; qaRender(); }); await frames();
    if (error) await fail(0, 403); else await reply(0); verify(await hasMesa() === 0 && (await text()).includes('Leyendo Rateware'), 'Old instance cannot update new one'); await reply(1, 'B'); await isB();
  });
  await check('Equivalent rerender does not refetch or clear current detail', async () => {
    await fresh(); await reply(); await change({}); verify(await count() === 1 && await hasMesa() === 1, 'Stable input is stable');
  });
  for (const status of [0, 401, 403, 404, 500]) await check(`Current ${status || 'network'} error retains existing semantics`, async () => {
    await fresh(); await fail(0, status); verify(await hasMesa() === 0, 'Error is not event data'); const body = await text();
    verify(status === 404 ? body.includes('No encontrado en tu organización') : [401, 403].includes(status) ? body.includes('Sin permiso') : body.includes('Rateware no respondió') && body.includes('Los datos no son cero'), 'Error distinction retained');
    verify(await page.getByRole('button', { name: 'Reintentar', exact: true }).count() === ([0, 500].includes(status) ? 1 : 0), 'Retry affordance unchanged'); await advance(); verify(await count() === 1, 'No automatic retry');
  });
  await check('Manual Retry works with keyboard and admits only the current response', async () => {
    await fresh(); await fail(); await page.getByRole('button', { name: 'Reintentar', exact: true }).focus(); await page.keyboard.press('Enter'); verify(await count() === 2, 'One manual retry'); await reply(1, 'B'); await isB();
  });
  await check('Ignored older response does not renew the last-read timestamp', async () => {
    await fresh({ strict: true }); await reply(1); await advance(); await reply(0, 'B'); verify(await page.getByRole('button', { name: 'Actualizar', exact: true }).count() === 1, 'Age still stale');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).focus(); await page.keyboard.press('Enter'); verify(await count() === 3, 'One keyboard update'); await reply(2, 'B'); await isB(); verify(await page.getByRole('button', { name: 'Actualizar', exact: true }).count() === 0, 'Current read resets age');
  });
  await check('Two manual updates may finish in reverse order without reverting the detail', async () => {
    await fresh(); await reply(); await advance(); await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    verify(await hasMesa() === 1, 'Same-context refresh keeps visible controls'); await page.getByRole('button', { name: 'Actualizar', exact: true }).click(); verify(await count() === 3, 'Two explicit reads'); await reply(2, 'B'); await reply(1); await isB();
  });
  await check('Obsolete manual refresh error cannot hide a newer result', async () => {
    await fresh(); await reply(); await advance(); await page.getByRole('button', { name: 'Actualizar', exact: true }).click(); await page.getByRole('button', { name: 'Actualizar', exact: true }).click(); await reply(2, 'B'); await fail(1, 500); await isB();
  });
  await check('Stage keyboard navigation and read-only role remain unchanged', async () => {
    await fresh(); await change({ rol: 'viewer' }); await reply((await count()) - 1); const stages = page.getByRole('navigation', { name: 'Recorrido' }).getByRole('button'); await stages.first().focus(); await page.keyboard.press('Tab'); verify(await stages.nth(1).evaluate(el => el === document.activeElement), 'Stages keyboard reachable');
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter'); verify(await stages.first().getAttribute('aria-current') === 'step', 'Stage selected via keyboard'); verify(await page.getByRole('button', { name: 'Entregar a Rateware', exact: true }).count() === 0, 'Viewer cannot deliver'); verify(await page.evaluate(() => qa.operations.length) === 0, 'Navigation performs no action');
  });
  await check('Delivery confirmation is not invoked before acceptance and Cancel preserves it', async () => {
    await fresh(); await reply(0, 'B'); await page.getByRole('button', { name: 'Entregar a Rateware', exact: true }).click(); verify(await page.evaluate(() => qa.operations.length) === 0, 'Opening confirmation is pure'); await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); verify(await page.evaluate(() => qa.operations.length) === 0, 'Cancel does not deliver');
  });
  await check('A new synthetic receipt retires old refreshes and remains displayed', async () => {
    await fresh(); await reply(0, 'B'); await advance(); await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByRole('button', { name: 'Entregar a Rateware', exact: true }).click(); await page.getByRole('button', { name: 'Sí, confirmar', exact: true }).click(); verify(await page.evaluate(() => qa.confirmations.length) === 1, 'Exactly one synthetic confirmation');
    await page.evaluate(() => qa.confirm()); await frames(); const receiptReads = await page.evaluate(() => qa.calls.map((c, i) => ({ i, receipt: !!c.recibo })).filter(c => c.receipt)); verify(receiptReads.length === 1, 'One read of current receipt');
    const latest = receiptReads[0].i; await reply(latest, 'B'); const old = await page.evaluate(latest => qa.calls.map((c, i) => i).filter(i => i > 0 && i !== latest), latest); for (const i of old) await reply(i);
    await isB('Avisar a los carriers'); await page.getByRole('navigation', { name: 'Recorrido' }).getByRole('button', { name: /Entrega a Rateware/ }).click();
    verify((await text()).includes('2 tarifas insertadas'), 'Current receipt retained'); verify(await page.getByRole('button', { name: 'Entregar a Rateware', exact: true }).count() === 0, 'Confirmed receipt cannot be offered for delivery again');
    verify((await page.evaluate(() => qa.operations)).join(',') === 'synthetic-pure-prepare,synthetic-confirm', 'Only the explicitly simulated action');
    await change({ correo: 'other@example.test' }); const n = await count(); await reply(n - 1, 'B'); verify(!(await text()).includes('2 tarifas insertadas'), 'Local receipt does not leak into another account');
  });
  await check('Reload performs fresh reads and does not replay operations', async () => {
    await fresh(); await reply(); await page.reload(); await page.waitForFunction(() => qa.calls.length === 1); await frames(); verify(await hasMesa() === 0, 'Fresh loading'); verify(await page.evaluate(() => qa.operations.length) === 0, 'Reload no replay'); await reply(0, 'B'); await isB();
  });
  await check('Mobile detail remains usable after an inverted response order', async () => {
    await fresh({ width: 390 }); await change({ source: 'b' }); await reply(1, 'B'); await reply(0); await isB(); verify(await page.getByRole('navigation', { name: 'Recorrido' }).isVisible(), 'Mobile stage navigation visible');
    await page.screenshot({ path: resolve(output, 'mesa-mobile.png'), fullPage: true }); await page.setViewportSize({ width: 1280, height: 1050 }); await page.screenshot({ path: resolve(output, 'mesa-desktop.png'), fullPage: true });
  });
  await check('Network and browser boundaries', async () => { verify(external.length === 0, 'No external traffic'); verify(writes.length === 0, 'No HTTP writes'); verify(errors.length === 0, 'No unhandled browser errors'); verify(await page.evaluate(() => qa.operations.length) === 0, 'No action in current read-only fixture'); });
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
const report = { kind: 'synthetic-component-browser', baseline: baseline ?? null, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, assertions, results, external, writes, errors,
  scope: 'Real Mesa/domain/common UI/router/React/styles, fake session and deferred API; one explicitly simulated receipt confirmation. No real auth, event action, backend or provider.' };
await writeFile(resolve(output, 'RESULTS.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, failed: report.failed, assertions, output, failures: results.filter(r => !r.passed) })); if (report.failed) process.exitCode = 1;
