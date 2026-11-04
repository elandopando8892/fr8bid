import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startFlowLab } from './batch-flow.lab.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const lab = await startFlowLab(), browser = await chromium.launch({ headless: true });
const protectedData = () => JSON.stringify([lab.data.campaigns, lab.data.audience, lab.data.reviews, lab.data.messages, lab.data.segments]);
const beforeData = protectedData();
const results = [], errors = [], external = [];
// The lab CSP blocks workers. Playwright's injected service-worker blocker
// throws inside Message's existing sandboxed srcdoc, including the baseline.
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== lab.origin) { external.push(url.origin); return route.abort(); } return route.continue(); });
const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
const panel = () => page.locator('.flow-panel');
const noStats = async () => { await panel().locator('.flow-stats').waitFor({ state: 'hidden' }); assert.equal(await panel().locator('.flow-stats').count(), 0); };
const control = async mode => { await fetch(lab.origin + '/control', { method: 'POST', body: JSON.stringify({ mode }) }); };
const open = async (suffix = 'message', query = '') => { await page.goto(`${lab.origin}/rfx/${lab.eventId}/${suffix}${query}`, { waitUntil: 'networkidle' }); };
const reconcile = async () => { await panel().getByRole('button', { name: /^(Conciliar lote|Reconcile batch)$/ }).click(); await panel().locator('.flow-stats').waitFor(); };
async function check(name, fn) { await fn(); results.push({ name, passed: true }); console.log('PASS', name); }
try {
  await check('baseline screenshots use the pre-change Message and Queue components', async () => {
    await open('message', '?baseline'); assert.equal(await panel().count(), 0); await page.screenshot({ path: path.join(lab.out, 'baseline-message.png'), fullPage: true });
    await open('delivery', '?baseline'); assert.equal(await panel().count(), 0); await page.screenshot({ path: path.join(lab.out, 'baseline-queue.png'), fullPage: true });
  });
  await check('Message opens unchanged generation controls; reconciliation is explicit and read-only', async () => {
    await open(); await panel().waitFor(); await noStats();
    const before = lab.result().calls.filter(c => c.action === 'preview_outreach_audience').length;
    assert.ok(await page.getByRole('button', { name: /Generar borradores para/ }).count());
    await reconcile(); assert.equal(lab.result().calls.filter(c => c.action === 'preview_outreach_audience').length, before + 1);
    assert.deepEqual(await panel().locator('.flow-stats dd').allTextContents(), ['11', '10', '2', '4', '5']);
    assert.match(await panel().innerText(), /8 registros de mensajes.*3 corresponden/s);
    assert.match(await panel().innerText(), /Revisa en Cola los 2 carriers seleccionados/);
    await panel().getByText('Ver causas y registros', { exact: true }).click(); await page.screenshot({ path: path.join(lab.out, 'message-es.png'), fullPage: true });
  });
  await check('an older RFx campaign survives 130 newer unrelated campaigns in the legacy catalog', async () => {
    const original = structuredClone(lab.data.campaigns);
    try {
      lab.data.campaigns.push(...Array.from({ length: 130 }, (_, n) => ({ ...original[0], id: `00000000-0000-4000-8000-${String(80000+n).padStart(12,'0')}`, rfx_event_id: `00000000-0000-4000-8000-${String(90000+n).padStart(12,'0')}`, name: `Other synthetic event ${n}` })));
      await open(); await reconcile();
      assert.match(await panel().innerText(), /Campaña sintética A/);
      assert.equal(await page.getByRole('button', { name: /Generar borradores para 10 carriers/ }).count(), 2);
      assert.deepEqual(await panel().locator('.flow-stats dd').allTextContents(), ['11', '10', '2', '4', '5']);
      await page.screenshot({ path: path.join(lab.out, 'campaigns-over-100-es.png'), fullPage: true });
      assert.ok(lab.result().calls.some(call => call.action === 'list_outreach_campaigns' && call.event === lab.eventId));
    } finally { lab.data.campaigns = original; }
    await open(); await reconcile(); await panel().getByText('Ver causas y registros', { exact: true }).click();
  });
  await check('cause filters and empty search preserve independent candidates', async () => {
    await panel().getByLabel('Filtrar por causa').selectOption('not_reviewed'); assert.equal(await panel().locator('tbody tr').count(), 1);
    await panel().getByLabel('Buscar carrier del lote').fill('no such carrier'); assert.equal(await panel().locator('tbody tr').count(), 0);
    await panel().getByLabel('Buscar carrier del lote').fill(''); await panel().getByLabel('Filtrar por causa').selectOption('prepare'); assert.equal(await panel().locator('tbody tr').count(), 2);
  });
  await check('navigation to Queue and back rereads without regenerating anything', async () => {
    await panel().getByRole('link', { name: 'Ir a Cola de envío', exact: true }).click(); await panel().waitFor(); await noStats();
    await reconcile(); await page.screenshot({ path: path.join(lab.out, 'queue-es.png'), fullPage: true });
    await page.getByRole('link', { name: 'Mensaje lab', exact: true }).click(); await panel().waitFor(); await noStats(); await reconcile();
  });
  await check('a message link opens the exact existing read-only Queue dialog', async () => {
    await panel().getByText('Ver causas y registros', { exact: true }).click();
    const link = panel().getByRole('link', { name: /Revisar mensaje 1/ }).first();
    const href = await link.getAttribute('href'); assert.ok(href.endsWith('message=00000000-0000-4000-8000-000000001001'));
    await link.click(); await page.getByRole('dialog').waitFor(); await page.getByRole('dialog').getByText(/Mensaje sintético 1/).waitFor();
    assert.match(await page.getByRole('dialog').innerText(), /carrier5@example.test/);
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByRole('link', { name: 'Mensaje lab', exact: true }).click(); await panel().waitFor(); await reconcile();
  });
  await check('refresh failure hides the former result and explicit retry recovers', async () => {
    await control('partial'); await panel().getByRole('button', { name: 'Conciliar lote', exact: true }).click(); await panel().getByText(/La lectura llegó incompleta/).waitFor();
    await noStats(); await control('normal'); await reconcile();
  });
  await check('channel change drops the old snapshot and uses the reviewed channel contact', async () => {
    await panel().getByLabel('Canal del lote').selectOption('whatsapp'); await noStats(); await reconcile();
    assert.match(await panel().innerText(), /0 registros de mensajes/);
    await panel().getByLabel('Canal del lote').selectOption('email'); await reconcile();
  });
  await check('expiry removes data until another explicit reconciliation', async () => {
    await page.getByRole('button', { name: 'Vencer lectura', exact: true }).click(); await panel().getByText(/La lectura venció/).waitFor();
    await noStats(); await reconcile();
  });
  await check('reload does not restore or automatically execute a previous plan', async () => {
    await page.reload({ waitUntil: 'networkidle' }); await panel().waitFor(); await noStats(); await reconcile();
  });
  await check('Consulta and Operador can read without mutation; unverified session cannot read', async () => {
    await page.getByRole('button', { name: 'viewer', exact: true }).click(); await panel().waitFor(); await noStats(); await reconcile();
    for (const b of await page.getByRole('button', { name: /Generar borradores para/ }).all()) assert.equal(await b.isEnabled(), false);
    await page.getByRole('button', { name: 'operator', exact: true }).click(); await panel().waitFor(); await reconcile();
    await page.getByRole('button', { name: 'unverified', exact: true }).click(); await panel().getByText(/Se necesita una sesión verificada/).waitFor(); assert.equal(await panel().getByRole('button', { name: 'Conciliar lote' }).count(), 0);
    await page.getByRole('button', { name: 'admin', exact: true }).click(); await panel().waitFor();
  });
  await check('cancelled slow request cannot overwrite a later read', async () => {
    await control('hold'); await panel().getByRole('button', { name: 'Conciliar lote' }).click(); await panel().getByRole('button', { name: 'Cancelar lectura' }).waitFor();
    await panel().getByRole('button', { name: 'Cancelar lectura' }).click(); await control('normal'); await reconcile();
    await control('release'); assert.deepEqual(await panel().locator('.flow-stats dd').allTextContents(), ['11', '10', '2', '4', '5']);
  });
  await check('a read finishing after its five-minute window is already expired', async () => {
    await control('hold'); await panel().getByRole('button', { name: 'Conciliar lote' }).click(); await panel().getByRole('button', { name: 'Cancelar lectura' }).waitFor();
    await page.getByRole('button', { name: 'Vencer lectura' }).click(); await control('release'); await panel().getByText(/La lectura venció/).waitFor();
    await noStats(); await reconcile();
  });
  await check('channel change while reading discards the late response', async () => {
    await control('hold'); await panel().getByRole('button', { name: 'Conciliar lote' }).click(); await panel().getByRole('button', { name: 'Cancelar lectura' }).waitFor();
    await panel().getByLabel('Canal del lote').selectOption('whatsapp'); await control('release');
    await noStats(); await reconcile(); assert.match(await panel().innerText(), /0 registros de mensajes/);
    await panel().getByLabel('Canal del lote').selectOption('email'); await reconcile();
  });
  await check('foreign response and connection interruption never leave partial totals', async () => {
    await control('foreign'); await panel().getByRole('button', { name: 'Conciliar lote' }).click(); await panel().getByText(/No se pudo validar el RFx/).waitFor(); await noStats();
    await control('interrupt'); await panel().getByRole('button', { name: 'Conciliar lote' }).click(); await panel().getByText(/No se pudo completar la lectura/).waitFor(); await noStats();
    await control('normal'); await reconcile();
  });
  await check('permission denial removes a previous read and needs an explicit new read', async () => {
    await control('forbidden'); await panel().getByRole('button', { name: 'Conciliar lote' }).click(); await panel().getByText(/No se pudo completar la lectura/).waitFor(); await noStats();
    await control('normal'); await reconcile();
  });
  await check('organization switch while reading hides old names; access remains server-filtered', async () => {
    await page.goto(lab.origin + '/panel', { waitUntil: 'networkidle' }); await control('hold'); await panel().getByRole('button', { name: 'Conciliar lote' }).click();
    await panel().getByRole('button', { name: 'Cancelar lectura' }).waitFor(); await page.getByRole('button', { name: 'other', exact: true }).click();
    await control('release'); await noStats(); assert.doesNotMatch(await panel().innerText(), /Carrier sintético/);
    await panel().getByRole('button', { name: 'Conciliar lote' }).click(); await panel().getByText(/No se pudo completar la lectura/).waitFor();
    await page.getByRole('button', { name: 'admin', exact: true }).click(); await reconcile();
  });
  await check('ambiguous campaigns require a choice and selection is validated on a fresh read', async () => {
    await control('ambiguous'); await panel().getByRole('button', { name: 'Conciliar lote' }).click(); await panel().getByText(/Hay varias campañas/).waitFor();
    await noStats(); await panel().getByLabel('Campaña del lote', { exact: true }).selectOption({ label: 'Campaña sintética B' }); await reconcile();
    await control('normal'); await panel().getByRole('button', { name: 'Conciliar lote' }).click(); await panel().getByText(/La selección guardada no está disponible/).waitFor();
    assert.equal(await panel().locator('.flow-campaign').count(), 0); assert.doesNotMatch(await panel().innerText(), /Campaña sintética B/);
    await reconcile(); assert.match(await panel().innerText(), /Campaña sintética A/);
  });
  await check('template and RFx navigation invalidate the prior summary', async () => {
    await open(); await reconcile(); await page.locator('.msg-field select').first().selectOption('00000000-0000-4000-8000-000000000601'); await noStats();
    await reconcile(); assert.match(await panel().innerText(), /Primera preparación/);
    await page.getByRole('link', { name: 'Otro RFx lab', exact: true }).click(); await panel().waitFor(); await noStats();
    await panel().getByRole('button', { name: 'Conciliar lote' }).click(); await panel().getByText(/No se pudo completar la lectura/).waitFor();
  });
  await check('English labels, narrow layout and keyboard control', async () => {
    await open(); await page.locator('.lab-controls').getByRole('button', { name: 'EN', exact: true }).click(); await reconcile();
    assert.match(await panel().innerText(), /Batch preparation/); assert.doesNotMatch(await panel().innerText(), /Seleccionados|Conciliar lote|Requieren atención|Por preparar/);
    await panel().getByText('View reasons and records', { exact: true }).focus(); await page.keyboard.press('Enter');
    assert.equal(await panel().locator('details').getAttribute('open'), '');
    await page.screenshot({ path: path.join(lab.out, 'message-en.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 900 }); await page.screenshot({ path: path.join(lab.out, 'message-mobile-en.png'), fullPage: true });
    const dimensions = await panel().evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, viewport: window.innerWidth }));
    assert.ok(dimensions.right <= dimensions.viewport + 1 && dimensions.left >= 0, JSON.stringify(dimensions));
  });
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(lab.result().rejected, []); assert.equal(protectedData(), beforeData);
  console.log(`Passed ${results.length} browser scenarios, no writes or external requests`);
} finally {
  fs.writeFileSync(path.join(lab.out, 'browser-result.json'), JSON.stringify({ results, errors, external, ...lab.result() }, null, 2));
  await context.close(); await browser.close(); await lab.close();
}
