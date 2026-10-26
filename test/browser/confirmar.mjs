// Exercises the real Confirmar component and CSS with synthetic callbacks only.
// Requires an existing Playwright installation; no dependency or service setup.
// FR8_CONFIRM_BASELINE optionally supplies a saved preimage for reproduction.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(resolve(root, 'package.json'));
const viteRequire = createRequire(require.resolve('vite/package.json'));
const { build } = viteRequire('esbuild');
const { chromium } = require(process.env.FR8_PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.env.FR8_CONFIRM_OUTPUT || 'output/confirmar');
const baseline = process.env.FR8_CONFIRM_BASELINE;
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: { contents: `import React, {StrictMode, useState} from 'react';
    import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
    import {Confirmar} from './src/ui/comun.tsx';
    window.qa={calls:[],pending:[],handled:0,forbidden:0,mode:'deferred'};
    function Fixture() {
      const [cfg,setCfg]=useState({motivo:'Motivo sintético',blocked:false,second:false});
      const [error,setError]=useState('');
      window.qaSet=patch=>flushSync(()=>setCfg(c=>({...c,...patch})));
      const confirm=id=>{
        qa.calls.push({id,motivo:cfg.motivo});
        if(qa.mode==='sync') return;
        if(qa.mode==='resolved') return Promise.resolve();
        return new Promise((done,reject)=>qa.pending.push({done,reject})).catch(e=>{
          qa.handled++; setError(e.message);
        });
      };
      return <main className="contenido"><section className="tarjeta">
        <h1>Confirmación de adjudicación · datos sintéticos</h1>
        <label htmlFor="motivo">Motivo</label>
        <textarea id="motivo" value={cfg.motivo} onChange={e=>setCfg({...cfg,motivo:e.target.value})}/>
        <label><input type="checkbox" checked={cfg.blocked}
          onChange={e=>setCfg({...cfg,blocked:e.target.checked})}/> Bloqueo externo simulado</label>
        <section aria-label="Adjudicación primaria">
          <Confirmar etiqueta="Adjudicar como primario" advertencia="Confirma la adjudicación sintética."
            deshabilitado={cfg.blocked || !cfg.motivo.trim()} onConfirmar={()=>confirm('primary')}/>
        </section>
        {cfg.second && <section aria-label="Otra acción">
          <Confirmar etiqueta="Otra acción" advertencia="Acción independiente sintética."
            onConfirmar={()=>confirm('second')}/>
        </section>}
        {error && <p role="alert">{error}</p>}
      </section></main>;
    }
    const app=createRoot(document.getElementById('app'));
    flushSync(()=>app.render(<StrictMode><Fixture/></StrictMode>));
    window.qaUnmount=()=>flushSync(()=>app.render(null));`,
    resolveDir: root, sourcefile: 'confirmar-fixture.tsx', loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'no-service-boundary', setup(b) {
    b.onLoad({ filter: /[/\\]ui[/\\]sesion\.tsx$/ }, () => ({ loader: 'ts', contents: `
      export const NOMBRE_ROL={}, USUARIOS_SIMULADOS=[];
      export function useSesion(){window.qa.forbidden++;throw Error('Unexpected session access')}` }));
    b.onLoad({ filter: /[/\\]cliente[/\\]api\.ts$/ }, () => ({ loader: 'ts', contents: `
      export class ErrorApi extends Error {constructor(){super('Unexpected API access');window.qa.forbidden++}}` }));
    if (baseline) b.onLoad({ filter: /[/\\]ui[/\\]comun\.tsx$/ }, async args => ({
      loader: 'tsx', contents: await readFile(baseline, 'utf8'), resolveDir: dirname(args.path),
    }));
  } }],
});
const assets = {
  '/tokens.css': 'src/estilos/marksman-brand-tokens.css',
  '/styles.css': 'src/estilos/app.css',
};
const external = [], networkWrites = [], errors = [], results = [];
let assertions = 0;
const verify = (ok, message) => { assertions++; assert.ok(ok, message); };
const server = createServer(async (req, res) => {
  if (req.method !== 'GET') { networkWrites.push(req.method); res.writeHead(405).end(); return; }
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  res.setHeader('Cache-Control', 'no-store');
  if (path === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/styles.css"><div id="app"></div><script type="module" src="/fixture.js"></script></html>');
  } else if (path === '/fixture.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(bundle.outputFiles[0].contents);
  } else if (assets[path]) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8'); res.end(await readFile(resolve(root, assets[path])));
  } else res.writeHead(404).end();
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, page;
const button = name => page.getByRole('button', { name, exact: true });
const primary = () => button('Adjudicar como primario');
const confirm = () => button('Sí, confirmar');
const cancel = () => button('Cancelar');
const frames = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const calls = () => page.evaluate(() => qa.calls);
async function fresh(width = 1280) {
  await page.setViewportSize({ width, height: 850 });
  await page.goto(origin); await primary().waitFor();
}
async function open() { await primary().click(); await confirm().waitFor(); }
async function settle(index = 0, fail = false) {
  await page.evaluate(({ index, fail }) => fail
    ? qa.pending[index].reject(new Error('Rechazo sintético gestionado por el llamador'))
    : qa.pending[index].done(), { index, fail });
  await frames();
}
async function check(name, fn, reproduce = false) {
  if (baseline && !reproduce) return;
  const start = assertions;
  try { await fn(); results.push({ name, passed: true, assertions: assertions - start }); }
  catch (error) { results.push({ name, passed: false, assertions: assertions - start, error: error.message }); }
}
try {
  browser = await chromium.launch({ headless: true, ...(process.env.FR8_CHROME_PATH
    ? { executablePath: process.env.FR8_CHROME_PATH } : { channel: 'chrome' }) });
  const context = await browser.newContext();
  await context.route('**/*', route => {
    const req = route.request();
    if (new URL(req.url()).origin !== origin) { external.push(req.url()); return route.abort(); }
    if (req.method() !== 'GET') { networkWrites.push(req.method()); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage(); page.setDefaultTimeout(2500);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await check('01 Initial block prevents opening and calling', async () => {
    await fresh(); await page.getByLabel('Motivo', { exact: true }).fill('');
    verify(await primary().isDisabled(), 'Initial action is disabled');
    await primary().evaluate(el => el.click()); await frames();
    verify(await confirm().count() === 0, 'No confirmation opens');
    verify((await calls()).length === 0, 'No callback');
  });
  await check('02 Opening only asks for confirmation', async () => {
    await fresh(); await open();
    verify(await confirm().isEnabled(), 'Allowed final action enabled');
    verify(await cancel().isEnabled(), 'Cancel enabled');
    verify((await calls()).length === 0, 'Opening is not execution');
  });
  await check('03 Clearing the required reason blocks final confirmation', async () => {
    await fresh(); await open(); await page.getByLabel('Motivo', { exact: true }).fill('');
    verify(await confirm().isDisabled(), 'Final action reflects the changed reason');
    verify(await cancel().isEnabled(), 'Blocked confirmation may be cancelled');
    await confirm().evaluate(el => el.click()); await frames();
    verify((await calls()).length === 0, 'Blocked click executes nothing');
  }, true);
  await check('04 A new external block prevents any callback', async () => {
    await fresh(); await open(); await page.getByLabel('Bloqueo externo simulado').check();
    await confirm().evaluate(el => el.click()); await frames();
    verify((await calls()).length === 0, 'New block prevents invocation');
    verify(await confirm().isDisabled(), 'Final action remains disabled');
  }, true);
  await check('05 Cancel remains available while blocked', async () => {
    await fresh(); await open(); await page.evaluate(() => qaSet({blocked:true}));
    await cancel().click(); await frames();
    verify(await primary().isDisabled(), 'Returns to the blocked initial action');
    verify((await calls()).length === 0, 'Cancel executes nothing');
  });
  await check('06 Removing the block requires explicit confirmation and fresh data', async () => {
    await fresh(); await open(); await page.evaluate(() => qaSet({blocked:true}));
    await page.getByLabel('Motivo', { exact: true }).fill('Motivo actualizado');
    await page.evaluate(() => qaSet({blocked:false}));
    verify((await calls()).length === 0, 'Removing a block does not execute');
    await confirm().click(); verify((await calls()).length === 1, 'One explicit invocation');
    verify((await calls())[0].motivo === 'Motivo actualizado', 'Uses current callback data');
    await settle(); verify(await primary().isEnabled(), 'Resets after completion');
  });
  await check('07 Same-turn activations invoke only once', async () => {
    await fresh(); await open(); await confirm().evaluate(el => { el.click(); el.click(); }); await frames();
    verify((await calls()).length === 1, 'Synchronous guard prevents duplicate invocation');
    verify(await button('Enviando…').isDisabled(), 'Pending action is disabled');
    verify(await cancel().isDisabled(), 'Cancel cannot replace an in-flight action');
    await settle(); verify(await primary().isEnabled(), 'Single completion resets');
  }, true);
  await check('08 Mouse double click invokes only once', async () => {
    await fresh(); await open(); await confirm().dblclick(); await frames();
    verify((await calls()).length === 1, 'Double click invokes once');
    await settle(); verify(await primary().isEnabled(), 'Double click leaves a usable component');
  });
  await check('09 A later block is retained after in-flight completion', async () => {
    await fresh(); await open(); await confirm().click();
    await page.evaluate(() => qaSet({blocked:true}));
    verify(await button('Enviando…').isDisabled(), 'Pending stays disabled');
    await settle(); verify(await primary().isDisabled(), 'New block survives completion');
    verify((await calls()).length === 1, 'No extra invocation');
  });
  for (const key of ['Enter', 'Space']) {
    await check(`10 Keyboard ${key} opens and confirms`, async () => {
      await fresh(); await primary().focus(); await page.keyboard.press(key); await frames();
      verify((await calls()).length === 0, 'Keyboard opening does not execute');
      await confirm().focus(); await page.keyboard.press(key); await frames();
      verify((await calls()).length === 1, 'Keyboard confirmation invokes once');
      await page.keyboard.press(key); verify((await calls()).length === 1, 'Repeated key while pending is ignored');
      await settle(); verify(await primary().isEnabled(), 'Keyboard flow resets');
    });
  }
  await check('11 Tab navigation skips disabled confirmation and reaches Cancel', async () => {
    await fresh(); await open(); const toggle = page.getByLabel('Bloqueo externo simulado');
    await toggle.check(); await toggle.focus(); await page.keyboard.press('Tab');
    verify(await cancel().evaluate(el => el === document.activeElement), 'Tab skips disabled final action');
    await page.keyboard.press('Enter'); await frames();
    verify(await primary().isDisabled(), 'Keyboard cancel returns to blocked initial state');
    verify((await calls()).length === 0, 'Keyboard cancellation executes nothing');
  });
  await check('12 Tab reaches allowed confirmation and cancellation', async () => {
    await fresh(); await open(); await page.getByLabel('Bloqueo externo simulado').focus();
    await page.keyboard.press('Tab');
    verify(await confirm().evaluate(el => el === document.activeElement), 'Final action is keyboard reachable');
    await page.keyboard.press('Tab');
    verify(await cancel().evaluate(el => el === document.activeElement), 'Cancel is keyboard reachable');
    await page.keyboard.press('Space'); await frames();
    verify(await primary().isEnabled(), 'Space cancels'); verify((await calls()).length === 0, 'No callback');
  });
  await check('13 Caller-managed rejection resets without retry', async () => {
    await fresh(); await open(); await confirm().click(); await settle(0, true);
    verify(await page.getByRole('alert').count() === 1, 'Caller retains its error behavior');
    verify(await primary().isEnabled(), 'Sending ends after caller handles rejection');
    verify((await calls()).length === 1, 'No automatic retry');
    await open(); await confirm().click(); await settle(1);
    verify((await calls()).length === 2, 'Another explicit confirmation may run after closure');
  });
  for (const mode of ['sync', 'resolved']) {
    await check(`14 ${mode} callback completes and releases the guard`, async () => {
      await fresh(); await page.evaluate(mode => { qa.mode=mode; }, mode); await open();
      await confirm().evaluate(el => { el.click(); el.click(); }); await frames();
      verify((await calls()).length === 1, 'Immediate completion still invokes once per confirmation');
      verify(await primary().isEnabled(), 'Returns to initial action');
      await open(); await confirm().click(); await frames();
      verify((await calls()).length === 2, 'Guard released for the next explicit confirmation');
    });
  }
  await check('15 Separate instances keep independent in-flight guards', async () => {
    await fresh(); await page.evaluate(() => qaSet({second:true})); await open(); await confirm().click();
    await button('Otra acción').click(); await confirm().click(); await frames();
    verify((await calls()).length === 2, 'Each independent action can run once');
    verify((await calls()).map(c=>c.id).join(',') === 'primary,second', 'Callbacks stay with their instance');
    await settle(0); await settle(1);
    verify(await primary().isEnabled() && await button('Otra acción').isEnabled(), 'Both instances return to initial state');
  });
  await check('16 Desktop confirmation retains labels and layout', async () => {
    await fresh(); await open();
    verify(await confirm().count() === 1 && await cancel().count() === 1, 'Native accessible button names unchanged');
    verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    await page.screenshot({path:resolve(output,'desktop-confirmation.png'),fullPage:true});
  });
  await check('17 Mobile blocked confirmation and cancellation', async () => {
    await fresh(390); await open(); await page.getByLabel('Motivo', { exact: true }).fill('');
    verify(await confirm().isDisabled() && await cancel().isEnabled(), 'Mobile uses the same block and cancel');
    verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile has no horizontal overflow');
    await page.screenshot({path:resolve(output,'mobile-blocked.png'),fullPage:true});
    await cancel().click(); verify((await calls()).length === 0, 'Mobile cancellation executes nothing');
  });
  await check('18 Reload starts with a fresh explicit confirmation', async () => {
    await fresh(); await open(); await page.reload(); await primary().waitFor();
    verify(await confirm().count() === 0, 'Confirmation is not persisted or executed by reload');
    verify((await calls()).length === 0, 'Reload has no invocation');
  });
  await check('19 No session, API or external transport is used', async () => {
    verify(await page.evaluate(() => qa.forbidden) === 0, 'No session or API stub invoked');
    verify(external.length === 0, 'No external requests');
    verify(networkWrites.length === 0, 'No network writes');
    verify(errors.length === 0, 'No browser errors');
  });
} finally {
  await browser?.close(); await new Promise(done => server.close(done));
}
const report = {
  utc: new Date().toISOString(), baseline: baseline || null,
  passed: results.filter(r => r.passed).length, total: results.length, assertions,
  external, networkWrites, errors, results,
  scope: 'Real Confirmar and CSS; synthetic parent, callbacks and guards; no live API or permissions verification',
};
await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (results.some(r => !r.passed)) process.exitCode = 1;
