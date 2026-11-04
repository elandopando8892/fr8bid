// Real Bid Room UI and XLSX files, isolated API/persistence fixture. No production traffic.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const XLSX = require('xlsx');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3185';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/carrier-excel-20261006/browser');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function run(browser, scenario, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, timezoneId: 'America/Mexico_City' });
  const calls = [], unexpected = [], errors = [];
  let previewReady = false, releaseRead, readHeld = false;
  const event = { id: uid(1), name: 'Fixture RFx Excel', rfx_id: 'RFx-FIXTURE', status: 'open', bid_visibility_mode: 'private' };
  const lanes = [1, 2, 3].map(n => ({ rfx_lane_id: uid(10 + n), rfx_event_id: event.id, invitation_id: uid(20 + n), invitation_token: 'fixture-lane-' + n, lane_number: n, origin: ['Monterrey', 'Saltillo', 'Querétaro'][n - 1], destination: 'Dallas', equipment: 'Dry Van', currency: 'USD', business_status: 'invited', event, due_state: { status: 'no_deadline' } }));
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) {
      return route.continue();
    }
    if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return route.abort(); }
    const body = req.postDataJSON(); calls.push(body);
    if (body.action === 'get_invitation') {
      if (scenario === 'navigate' && previewReady && !readHeld) { readHeld = true; await new Promise(resolve => { releaseRead = resolve; }); }
      return route.fulfill({ json: { invitation: { rfx_event_id: event.id, rfx_events: event, rfx_lanes: lanes[0] }, carrier_book: { carrier: { vendor_name: 'Fixture carrier' }, invited: lanes, open_not_invited: [] }, segment_confirmations: [] } });
    }
    if (body.action === 'submit_bid') {
      const n = calls.filter(c => c.action === 'submit_bid').length;
      const lane = lanes.find(l => l.invitation_token === body.token); assert.ok(lane);
      if (scenario === 'partial' && n === 2) {
        // Persist then lose the response: must not retry or continue to route three.
        Object.assign(lane, body, { business_status: 'quoted' });
        return route.fulfill({ status: 503, json: { error: 'Synthetic response lost' } });
      }
      if (scenario === 'malformed') return route.fulfill({ json: {} });
      if (scenario === 'wrong-invitation') return route.fulfill({ json: { row: { id: uid(999) } } });
      if (scenario === 'wrong-lane') return route.fulfill({ json: { row: { id: lane.invitation_id, rfx_lane_id: uid(999) } } });
      Object.assign(lane, body, { business_status: 'quoted' });
      // rfx-bid-api v336 returns the invitation ID and saved offer fields, not rfx_lane_id or credentials.
      const { action, token, language, best_final, ...saved } = body;
      return route.fulfill({ json: { row: { ...saved, id: lane.invitation_id, invitation_status: 'quoted' } } });
    }
    unexpected.push(body.action); return route.fulfill({ status: 501, json: { error: 'Unexpected fixture action' } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  const writes = () => calls.filter(c => c.action === 'submit_bid');
  try {
    await page.goto(origin + '/bid/fixture-lane-1', { waitUntil: 'networkidle', timeout: 45000 });
    const region = page.getByRole('region', { name: 'Cotizar con Excel', exact: true });
    const downloadPromise = page.waitForEvent('download');
    await region.getByRole('button', { name: 'Descargar plantilla' }).click();
    const download = await downloadPromise, filename = path.join(output, `${scenario}-${mobile ? 'mobile' : 'desktop'}.xlsx`);
    await download.saveAs(filename);
    const book = XLSX.readFile(filename), sheet = book.Sheets.Ofertas;
    const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
    function set(row, label, value) { sheet[XLSX.utils.encode_cell({ r: row, c: headers.indexOf(label) })] = { t: typeof value === 'number' ? 'n' : 's', v: value }; }
    for (const n of [1, 2, 3]) {
      for (const [label, value] of Object.entries({ 'Enviar ruta': 'Sí', 'Tarifa carrier': 1200 + n, 'Modelo comercial': ['Costo + margen', 'Carrier comparte facturación', 'XBF compra-venta'][n - 1], 'Porcentaje': '', 'Capacidad semanal': 2, 'Tránsito (días)': 3, 'Vigente hasta': '2099-12-31', 'Equipo disponible': 'Sí', 'Ubicación de unidad': 'Monterrey', 'Vacío al origen': 0, 'Unidad de vacío': 'km', 'Detalle de unidad': 'Unidad controlada', 'ETA recolección': '2099-06-01T10:00', 'ETA entrega': '2099-06-03T10:00', 'Cuenta espejo GPS': 'Sí', 'Ofrezco alternativa': 'Sí', 'Equipo alternativo': 'Reefer', 'Unidades alternativas': 1, 'Condiciones alternativas': 'Sujeto a confirmación', 'Notas': 'Fixture Excel' })) set(n, label, value);
    }
    if (scenario === 'foreign') set(2, 'Invitación ID', 'another-invitation');
    XLSX.writeFile(book, filename);
    await region.getByLabel('Archivo de ofertas Excel').setInputFiles(filename);
    if (scenario === 'foreign') {
      await region.getByText(/no pertenece a esta invitación/).waitFor(); assert.equal(writes().length, 0); assert.equal(await region.getByRole('button', { name: /Confirmar y enviar/ }).count(), 0);
    } else {
      const review = region.getByRole('region', { name: 'Revisión de ofertas Excel' });
      await review.getByText('3 ofertas para revisar').waitFor();
      assert.equal(writes().length, 0);
      for (const model of ['Costo + margen', 'Carrier comparte facturación', 'XBF compra-venta']) assert.ok((await review.innerText()).includes(model));
      assert.ok((await review.innerText()).includes('12 % (predeterminado)'));
      assert.equal(await review.getByText(/El porcentaje acordado \(3 %\) se facturará 5 días hábiles/).count(), 2);
      await review.getByText('Revisar todos los datos de la ruta 1', { exact: true }).click();
      assert.ok((await review.innerText()).includes('Unidad controlada'));
      await review.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${scenario}-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
      if (mobile) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page overflow');
      await review.getByText('Revisar todos los datos de la ruta 1', { exact: true }).click();
      await region.evaluate(el => el.scrollIntoView({ block: 'start' }));
      if (scenario === 'complete') await page.screenshot({ path: path.join(output, `models-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
      if (scenario === 'stale') lanes[0].bid_rate = 500;
      if (scenario === 'closed') lanes[1].due_state = { status: 'closed' };
      previewReady = true;
      await review.getByRole('button', { name: 'Confirmar y enviar 3 ofertas' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText(/5 días hábiles después de la confirmación de pago del embarcador/).waitFor();
      assert.equal(writes().length, 0);
      if (scenario === 'complete') {
        await page.screenshot({ path: path.join(output, `billing-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
        await dialog.getByRole('button', { name: 'Volver a revisar' }).click();
        assert.equal(writes().length, 0);
        await review.getByRole('button', { name: 'Confirmar y enviar 3 ofertas' }).click();
      }
      await dialog.getByRole('button', { name: 'Confirmar y enviar ofertas', exact: true }).click();
      if (scenario === 'navigate') {
        await page.waitForFunction(() => document.body.innerText.includes('Preparando archivo'));
        // SPA tab change unmounts importer while its preflight is still outstanding.
        await page.getByRole('button', { name: 'El negocio', exact: true }).click();
        assert.ok(releaseRead); releaseRead();
        await page.waitForLoadState('networkidle'); assert.equal(writes().length, 0);
      } else {
        await region.getByRole('button', { name: 'Recargar y comprobar ofertas' }).waitFor();
        await page.waitForLoadState('networkidle');
        assert.equal(await review.getByRole('button', { name: /Confirmar y enviar/ }).count(), 0);
        if (['stale', 'closed'].includes(scenario)) { assert.equal(writes().length, 0); await region.getByText(/cambió la oferta o su acceso/).waitFor(); }
        else if (scenario === 'partial') { assert.equal(writes().length, 2); await region.getByText(/podría haberse guardado/).waitFor(); assert.equal(lanes[2].bid_rate, undefined); }
        else if (['malformed', 'wrong-invitation', 'wrong-lane'].includes(scenario)) { assert.equal(writes().length, 1); await region.getByText(/no confirmó la ruta esperada/).waitFor(); }
        else {
          assert.equal(writes().length, 3);
          assert.deepEqual(writes().map(c => c.token), lanes.map(l => l.invitation_token));
          assert.deepEqual(writes().map(c => c.commercial_model), ['direct_cost_plus', 'carrier_share', 'xbf_buy_sell']);
          for (const l of lanes) { assert.equal(l.deadhead_distance, 0); assert.equal(l.unit_details, 'Unidad controlada'); assert.equal(l.mirror_account_enabled, true); assert.equal(l.alternative_notes, 'Sujeto a confirmación'); }
          await region.getByRole('button', { name: 'Recargar y comprobar ofertas' }).click();
          await page.waitForLoadState('networkidle');
          const panel = page.locator('.croom-panel');
          await page.getByRole('row').filter({ hasText: 'Querétaro' }).getByRole('button', { name: 'Revisar', exact: true }).click();
          assert.equal(await panel.locator('select').first().inputValue(), 'USD');
          assert.equal(await panel.locator('select').nth(1).inputValue(), 'xbf_buy_sell');
          assert.equal(await panel.locator('label').filter({ has: page.locator('span').filter({ hasText: /^Detalle de la unidad$/ }) }).locator('input').inputValue(), 'Unidad controlada');
          assert.equal(writes().length, 3);
        }
      }
    }
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    return { scenario, mobile, passed: true, syntheticWrites: writes().length };
  } catch (e) {
    await page.screenshot({ path: path.join(output, `failure-${scenario}.png`), fullPage: true }).catch(() => {});
    console.error({ scenario, errors, unexpected }); throw e;
  } finally { if (releaseRead) releaseRead(); await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ headless: true });
  try { const results = []; for (const scenario of ['complete', 'partial', 'malformed', 'wrong-invitation', 'wrong-lane', 'foreign', 'stale', 'closed', 'navigate']) { results.push(await run(browser, scenario)); console.log('PASS', scenario); } results.push(await run(browser, 'complete', true)); console.log('PASS mobile'); fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2)); }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
