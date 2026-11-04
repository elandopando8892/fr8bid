import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startFollowupLab } from './response-followup.lab.mjs';
const require = createRequire(import.meta.url), { uid } = require('./response-followup.fixture.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const lab = await startFollowupLab(), browser = await chromium.launch({ headless: true });
const results = [], consoleErrors = [], external = [], protectedBefore = JSON.stringify(lab.data.lanes);
const contextReads = () => lab.calls.filter(c => c.action === 'list_rfx_event_context');
const route = `/rfx/${uid(800)}`, panel = p => p.locator('details.response-followup');
const rows = p => p.locator('[data-followup-row]');
const row = (p, n) => p.locator(`[data-followup-row="${uid(n)}"]`);
async function go(p, suffix = '') { await p.goto(lab.url + route + suffix, { waitUntil: 'domcontentloaded' }); await p.locator('.op-tabs').waitFor(); }
async function expand(p) { await panel(p).locator('summary').click(); await rows(p).first().waitFor(); }
async function readFailure(p) { await panel(p).locator('summary').click(); await panel(p).getByRole('status').getByText('No se pudo validar', { exact: false }).waitFor(); assert.equal(await rows(p).count(), 0); }
async function check(name, fn, options = {}) {
  lab.release(); lab.setMode('normal');
  const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1365, height: 1000 } });
  await context.route('**/*', async request => { const url = new URL(request.request().url()); if (url.origin === lab.url) return request.continue(); external.push(url.origin); return request.abort(); });
  const p = await context.newPage(); p.on('pageerror', e => consoleErrors.push(e.message));
  const started = contextReads().length;
  try { await fn(p); results.push({ name, pass: true, contextReads: contextReads().length - started }); console.log(`PASS ${results.length}: ${name}`); }
  catch (error) { results.push({ name, pass: false, error: String(error) }); await p.screenshot({ path: path.join(lab.out, `failure-${Date.now()}.png`), fullPage: true }); throw error; }
  finally { await context.close(); }
}
try {
  await check('lazy section preserves existing offers; opening reads once', async p => {
    await go(p); assert.equal(contextReads().length, 0); await expand(p); assert.equal(await rows(p).count(), 9); assert.equal(contextReads().length, 1);
    assert.match(await row(p, 1011).innerText(), /ruta sin confirmar/); assert.match(await row(p, 1002).innerText(), /vinculada a esta ruta/);
    assert.match(await row(p, 1004).innerText(), /no acredita respuesta/); assert.equal(await row(p, 1005).getByRole('link').count(), 0);
  });
  await check('filters, search and distinct carrier/route counts', async p => {
    await go(p); await expand(p); assert.equal(await panel(p).locator('dd').allTextContents().then(v => v.join(',')), '6,2,3,1');
    await panel(p).getByLabel('Filtrar seguimiento', { exact: true }).selectOption('reply_without_offer'); assert.equal(await rows(p).count(), 2);
    await panel(p).getByLabel('Buscar carrier o ruta', { exact: true }).fill('Origin B'); assert.equal(await rows(p).count(), 1);
    await panel(p).getByLabel('Buscar carrier o ruta', { exact: true }).fill('missing'); assert.equal(await rows(p).count(), 0);
  });
  await check('existing offer detail and route comparison preserve amount and share', async p => {
    await go(p); await expand(p); await row(p, 1001).getByRole('button', { name: 'Ver oferta', exact: true }).click();
    const dialog = p.getByRole('dialog'); await dialog.waitFor(); assert.match(await dialog.innerText(), /1,650|1650/); assert.match(await dialog.innerText(), /3/);
    await dialog.getByRole('button', { name: /Cerrar/ }).click();
    await row(p, 1001).getByRole('button', { name: 'Comparar ruta', exact: true }).click(); await p.getByRole('dialog').waitFor(); assert.match(await p.getByRole('dialog').innerText(), /1,650|1650/);
  });
  await check('exact chat link opens requested existing thread without marking read', async p => {
    await go(p); await expand(p); await row(p, 1002).getByRole('link', { name: 'Ver conversación', exact: true }).click();
    await p.waitForURL(`**/chat?thread=${uid(600)}`); await p.getByRole('heading', { name: 'Conversaciones', exact: true }).waitFor();
    await p.getByText('Synthetic response only', { exact: true }).last().waitFor();
    assert.equal(new URL(p.url()).searchParams.get('thread'), uid(600)); assert.equal(lab.forbidden.length, 0);
  });
  await check('invalid requested conversation never falls back to the first one', async p => {
    await p.goto(`${lab.url}${route}/chat?thread=${uid(999)}`); await p.getByText('La conversación solicitada no está disponible en este RFx.', { exact: true }).waitFor();
    assert.equal(await p.getByRole('button', { name: 'Marcar como leído', exact: true }).count(), 0);
  });
  await check('queue link retains the exact RFx and message id', async p => {
    await go(p); await expand(p); await row(p, 1011).getByRole('link', { name: 'Ver mensaje en Cola', exact: true }).click();
    await p.locator('[data-queue-target]').waitFor(); assert.equal(new URL(p.url()).pathname + new URL(p.url()).search, `${route}/delivery?message=${uid(500)}`);
  });
  for (const mode of ['partial', 'chat_limited']) await check(`${mode}: positives retained; absence not asserted`, async p => {
    lab.setMode(mode); await go(p); await expand(p); await panel(p).getByText(/Corte parcial:/).waitFor(); assert.match(await row(p, 1005).innerText(), /sin confirmar por cobertura parcial/);
  });
  for (const mode of ['error', 'forbidden', 'missing', 'malformed', 'foreign', 'lost']) await check(`${mode}: failure hides totals without automatic retry`, async p => {
    const before = contextReads().length; lab.setMode(mode); await go(p); await readFailure(p);
    assert.equal(contextReads().length - before, 1); assert.equal(await panel(p).locator('dd').count(), 0);
  });
  await check('manual retry after error is explicit and works', async p => {
    lab.setMode('error'); await go(p); await readFailure(p); const before = contextReads().length; lab.setMode('normal');
    await panel(p).getByRole('button', { name: 'Actualizar seguimiento', exact: true }).click(); await rows(p).first().waitFor(); assert.equal(contextReads().length - before, 1);
  });
  await check('cancel and late response never restore discarded totals', async p => {
    lab.setMode('hold'); await go(p); await panel(p).locator('summary').click(); await panel(p).getByText('Consultando actividad del RFx…', { exact: true }).waitFor();
    await panel(p).getByRole('button', { name: 'Cancelar lectura', exact: true }).click(); lab.release(); await panel(p).getByText('Actualiza para consultar', { exact: false }).waitFor(); assert.equal(await rows(p).count(), 0);
  });
  await check('closing the section discards the previous cut; reopening reads again', async p => {
    await go(p); await expand(p); const before = contextReads().length; await panel(p).locator('summary').click(); assert.equal(await rows(p).count(), 0);
    await expand(p); assert.equal(contextReads().length - before, 1);
  });
  for (const name of ['busy', 'reading']) await check(`${name} pauses results and resumes with one fresh read`, async p => {
    await go(p); await expand(p); const before = contextReads().length; await p.evaluate(n => window.labControls[n](true), name);
    await panel(p).getByText(/Lectura pausada/).waitFor(); assert.equal(await rows(p).count(), 0); assert.equal(contextReads().length, before);
    await p.evaluate(n => window.labControls[n](false), name); await rows(p).first().waitFor(); assert.equal(contextReads().length - before, 1);
  });
  await check('refreshing event detail invalidates and re-reads its join', async p => {
    await go(p); await expand(p); const before = contextReads().length; await p.evaluate(() => window.labControls.reload()); await rows(p).first().waitFor(); assert.equal(contextReads().length - before, 1);
  });
  for (const role of ['viewer', 'operator']) await check(`${role} reads without a business write`, async p => {
    await go(p); await p.getByRole('button', { name: role, exact: true }).click(); await expand(p); assert.equal(await rows(p).count(), 9); assert.equal(contextReads().at(-1).role, role);
  });
  for (const role of ['unverified', 'noorg', 'signedout']) await check(`${role} invalidates results and starts no new context read`, async p => {
    await go(p); await expand(p); const before = contextReads().length; await p.getByRole('button', { name: role, exact: true }).click(); await p.getByText('Se necesita una sesión, organización y rol verificados para consultar.', { exact: true }).waitFor();
    assert.equal(await rows(p).count(), 0); assert.equal(contextReads().length, before);
  });
  await check('other organization cannot retain or recover the preceding snapshot', async p => {
    await go(p); await expand(p); await p.getByRole('button', { name: 'other', exact: true }).click(); assert.equal(await rows(p).count(), 0);
    await panel(p).locator('summary').click(); await panel(p).getByText(/No se pudo validar/).waitFor(); assert.equal(await rows(p).count(), 0);
  });
  await check('late response after account switch cannot leak old results', async p => {
    lab.setMode('hold'); await go(p); await panel(p).locator('summary').click(); await panel(p).getByText(/Consultando actividad/).waitFor();
    await p.getByRole('button', { name: 'other', exact: true }).click(); lab.release(); assert.equal(await rows(p).count(), 0); assert.equal(await panel(p).locator('dd').count(), 0);
  });
  await check('other RFx never shows the prior RFx source data', async p => {
    await go(p); await expand(p); await p.getByRole('link', { name: 'Other RFx lab', exact: true }).click();
    await panel(p).locator('summary').click(); await panel(p).getByText(/No se pudo validar/).waitFor(); assert.equal(await rows(p).count(), 0);
  });
  await check('expiry hides the cut and focus does not make a network request', async p => {
    await p.clock.install({ time: new Date('2026-10-26T18:00:00Z') }); await go(p); await expand(p); const before = contextReads().length;
    await p.clock.fastForward(300001); await panel(p).getByText(/El corte venció/).waitFor(); assert.equal(await rows(p).count(), 0);
    await p.evaluate(() => { dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); }); assert.equal(contextReads().length, before);
  });
  await check('language changes do not re-read and anonymous search does not expose names', async p => {
    await go(p); await expand(p); const before = contextReads().length; await p.getByRole('button', { name: 'EN', exact: true }).click(); await panel(p).getByText('Response and offer follow-up', { exact: true }).waitFor();
    assert.equal(contextReads().length, before); await p.getByLabel('Anonymous view', { exact: true }).check(); assert.equal(await panel(p).getByText(/Synthetic carrier/).count(), 0);
    await panel(p).getByLabel('Search carrier or route', { exact: true }).fill('Synthetic carrier'); assert.equal(await rows(p).count(), 0);
  });
  await check('double click is bounded and does not duplicate reads', async p => {
    await go(p); await expand(p); lab.setMode('hold'); const before = contextReads().length;
    await panel(p).getByRole('button', { name: 'Actualizar seguimiento', exact: true }).dblclick({ force: true }); await panel(p).getByText(/Consultando actividad/).waitFor(); assert.equal(contextReads().length - before, 1); lab.release(); await rows(p).first().waitFor();
  });
  await check('reload recovers only read data; no persistent follow-up store', async p => {
    await go(p); await expand(p); await p.reload(); await p.locator('.op-tabs').waitFor(); assert.equal(await rows(p).count(), 0); await expand(p); assert.equal(await rows(p).count(), 9);
  });
  await check('strict mode does not accept obsolete lifecycle results', async p => { await go(p, '?strict'); await expand(p); assert.equal(await rows(p).count(), 9); });
  await check('batch of over 200 relations filters across all rows and expands display in bounded steps', async p => {
    const saved = structuredClone(lab.data.lanes);
    try {
      for (let n = 0; n < 201; n++) lab.data.lanes[0].invitations.push({ id: uid(5000 + n), vendor_id: uid(7000 + n), rfx_lane_id: uid(100), rfx_event_id: uid(800), invitation_status: 'invited', vendors: { id: uid(7000 + n), vendor_name: `Batch synthetic ${n}` } });
      await go(p); await expand(p); assert.equal(await rows(p).count(), 40);
      await panel(p).getByRole('button', { name: 'Ver más relaciones', exact: true }).click(); assert.equal(await rows(p).count(), 80);
      await panel(p).getByLabel('Buscar carrier o ruta', { exact: true }).fill('Batch synthetic 200'); assert.equal(await rows(p).count(), 1); assert.match(await rows(p).innerText(), /Batch synthetic 200/);
    } finally { lab.data.lanes = saved; }
  });
  await check('desktop ES candidate and baseline preserve existing offer values and controls', async p => {
    await go(p, '?baseline'); const before = await p.locator('.op-tabs').innerText(); const offers = await p.locator('.op-table').innerText(); await p.screenshot({ path: path.join(lab.out, 'baseline-desktop-es.png'), fullPage: true });
    await go(p); assert.equal(await p.locator('.op-tabs').innerText(), before); assert.equal(await p.locator('.op-table').innerText(), offers);
    await expand(p); await p.screenshot({ path: path.join(lab.out, 'candidate-desktop-es.png'), fullPage: true });
  });
  await check('mobile EN panel fits the viewport and its table scrolls within the panel', async p => {
    await go(p, '?baseline'); await p.getByRole('button', { name: 'EN', exact: true }).click(); const baselineOffers = await p.locator('.op-table').innerText();
    await p.screenshot({ path: path.join(lab.out, 'baseline-mobile-en.png'), fullPage: true });
    await go(p); assert.equal(await p.locator('.op-table').innerText(), baselineOffers); await expand(p); await p.screenshot({ path: path.join(lab.out, 'candidate-mobile-en.png'), fullPage: true });
    const bounds = await panel(p).evaluate(el => { const box = el.getBoundingClientRect(); return { left: box.left, right: box.right, viewport: innerWidth, width: box.width }; });
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport + 1); assert.ok(bounds.width > 250);
    const text = await panel(p).innerText(); for (const word of ['Respuesta', 'Oferta', 'Vigencia', 'Actualizar', 'ruta sin', 'Carriers del detalle']) assert.ok(!text.includes(word));
  }, { mobile: true });
  assert.equal(external.length, 0); assert.equal(lab.forbidden.length, 0); assert.equal(consoleErrors.length, 0); assert.equal(JSON.stringify(lab.data.lanes), protectedBefore);
} finally {
  const receipt = { at: new Date().toISOString(), results, calls: lab.calls, external, forbidden: lab.forbidden, consoleErrors, fixturePreserved: JSON.stringify(lab.data.lanes) === protectedBefore,
    limits: 'Synthetic in-memory API only. Queue target checks its exact URL; existing Queue behavior is covered by its prior regression suite. No production or PostgreSQL reads/writes.' };
  fs.writeFileSync(path.join(lab.out, `browser-results-${Date.now()}.json`), JSON.stringify(receipt, null, 2));
  await browser.close(); await lab.close();
}
console.log(JSON.stringify({ passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, readCalls: lab.calls.length, forbidden: lab.forbidden.length, external: external.length, out: lab.out }));
