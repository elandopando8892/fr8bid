// Local UI + mutable fixtures. Does not certify production, RLS or commercial approval.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3031';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/rate-review-acceptance');
const probe = process.argv.includes('--probe');
const mobileOnly = process.argv.includes('--mobile-only');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const catalog = Object.entries({ equipment: 'Truck Trailer', trailer: 'Dry Van', config: 'Single', operation: 'D2D Export', service: 'One Way' }).map(([category, value]) => ({ category, raw_value: value, normalized_value: value, active: true }));
const initial = { id: uid(1), status: 'pending_review', rfx_id: 'RFx-PILOT-LOCAL', vendor_id: uid(3), vendors: { vendor_name: 'Fixture A' }, origin: 'Monterrey', destination: 'Dallas', origin_country: 'MX', destination_country: 'US', equipment: 'Truck Trailer', trailer: 'Dry Van', config: 'Single', operation: 'D2D Export', service: 'One Way', all_in_rate: '1200', currency: 'USD', valid_through: '2026-10-07', quote_date: '2026-10-01', mx_border_crossing_point: null, us_border_crossing_point: null };
async function setup(browser, lang, fixtureRows) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  let user = { id: uid(99), email: 'fixture@heymarksman.com', app_metadata: { roles: ['admin'] } };
  await context.addInitScript(({ user, lang }) => {
    localStorage.setItem('bidware.team.lang', lang);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now()/1000)+36000, token_type: 'bearer' }));
  }, { user, lang });
  const rows = fixtureRows || [{ ...initial }, { ...initial, id: uid(2), status: 'archived', valid_through: null }];
  const calls = [], warnings = [], unexpected = [], errors = [];
  let failRead = false, failReturn = true, heldRead = null;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    const input = request.postDataJSON(); calls.push(input);
    const own = user.id === uid(99);
    switch (input.action) {
      case 'list_catalog_values': return route.fulfill({ json: { rows: catalog } });
      case 'list_rfx_events': return route.fulfill({ json: { rows: own ? [{ id: uid(4), rfx_id: initial.rfx_id, name: 'Fixture event A' }] : [] } });
      case 'list_staging': {
        const held = heldRead; heldRead = null;
        if (held) { held.started(); await held.gate; }
        await new Promise(resolve => setTimeout(resolve, 250));
        if (failRead) { failRead = false; return route.fulfill({ status: 503, json: { error: 'Fixture temporary read failure' } }); }
        return route.fulfill({ json: { rows: own ? rows.filter(row => row.status === 'pending_review') : [], total: own ? rows.filter(row => row.status === 'pending_review').length : 0 } });
      }
      case 'list_rateware': return route.fulfill({ json: { rows: own ? rows.filter(row => row.status === 'approved') : [], total: own ? rows.filter(row => row.status === 'approved').length : 0, has_more: false } });
      case 'update_staging': {
        assert.equal(user.app_metadata.roles[0], 'admin');
        const row = rows.find(row => row.id === input.id); assert(row);
        assert(!input.patch.rfx_bid_outcome, 'A staging correction must not change an RFx outcome');
        if (input.patch.status === 'approved' && row.rfx_bid_outcome && row.rfx_bid_outcome !== 'awarded') {
          return route.fulfill({ status: 409, json: { error: 'Fixture unawarded RFx bid' } });
        }
        Object.assign(row, input.patch); return route.fulfill({ json: { row } });
      }
      case 'return_rateware_to_staging': {
        assert.equal(user.app_metadata.roles[0], 'admin'); assert.deepEqual(input.ids, [uid(1)]);
        assert.equal(input.confirmed, true); assert.equal(input.confirmation_action, input.action);
        assert.equal(input.reason, 'Controlled fixture recovery; no commercial validity.');
        if (failReturn) { failReturn = false; return route.fulfill({ status: 503, json: { error: 'Fixture temporary return failure' } }); }
        assert.equal(rows[0].status, 'approved'); rows[0].status = 'pending_review';
        return route.fulfill({ json: { updated: 1 } });
      }
      default: unexpected.push(input.action); return route.fulfill({ status: 501, json: { error: 'Unexpected isolated action' } });
    }
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('console', message => { if (message.text().includes('Maximum update depth')) warnings.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  const writes = () => calls.filter(call => !/^(list_|get_)/.test(call.action));
  const text = (es, en) => lang === 'es' ? es : en;
  const row = () => page.getByRole('row').filter({ hasText: 'Fixture A' });
  const select = () => row().getByRole('checkbox').check();
  const approve = () => page.getByRole('button', { name: /^Aprobar \d|^Approve \d/ });
  async function changeUser(next, settle = true) {
    user = next;
    await page.evaluate(async id => {
      const { supabase } = await import('/src/bidware/lib/supabase.ts');
      const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ sub: id, exp: Math.floor(Date.now()/1000)+36000 }))}.fixture`;
      const { error } = await supabase.auth.setSession({ access_token: token, refresh_token: 'fixture-only' });
      if (error) throw error;
    }, user.id);
    if (settle) {
      await page.waitForLoadState('networkidle');
      // The Auth response can finish before React commits the fresh role.
      const labels = { admin: text('Administrador', 'Administrator'), operator: text('Operador', 'Operator'), viewer: text('Consulta', 'Viewer') };
      await page.locator('.sidebar-role').filter({ hasText: labels[next.app_metadata.roles[0]] }).waitFor();
    }
  }
  const holdNextRead = () => {
    let started, release;
    const waiting = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    heldRead = { started, gate };
    return { waiting, release };
  };
  return { page, context, rows, calls, warnings, unexpected, errors, writes, text, row, select, approve, changeUser, holdNextRead, failNext: () => { failRead = true; } };
}
async function workflow(browser, lang) {
  const x = await setup(browser, lang); const { page, text } = x;
  await page.goto(origin + '/tarifas');
  await page.locator('.sidebar-role').filter({ hasText: text('Administrador', 'Administrator') }).waitFor();
  await page.waitForLoadState('networkidle');
  x.failNext(); await page.getByRole('button', { name: text('Actualizar', 'Refresh'), exact: true }).click();
  await page.getByText('Fixture temporary read failure', { exact: true }).waitFor().catch(async error => {
    fs.writeFileSync(path.join(output, lang + '-initial-failure.json'), JSON.stringify({ text: await page.locator('body').innerText(), calls: x.calls, unexpected: x.unexpected, errors: x.errors }, null, 2));
    throw error;
  });
  assert.equal(x.writes().length, 0);
  await page.getByRole('button', { name: text('Actualizar', 'Refresh'), exact: true }).click();
  await page.getByText('Fixture A', { exact: true }).waitFor();
  assert.equal(await x.row().count(), 1); assert.match(await x.row().innerText(), /2026-10-07|7 oct 2026|Oct 7, 2026/i);
  const labels = { es: ['Tractocamión', 'Caja seca', 'Sencillo', 'Exportación D2D', 'Sencillo (one way)'], en: ['Truck Trailer', 'Dry Van', 'Single', 'D2D Export', 'One Way'] };
  const catalogBefore = structuredClone(x.rows);
  for (const activeLang of [lang, lang === 'es' ? 'en' : 'es', lang]) {
    await page.getByRole('button', { name: activeLang.toUpperCase(), exact: true }).click();
    await x.row().filter({ hasText: labels[activeLang][3] }).waitFor();
    for (const label of labels[activeLang]) assert((await x.row().innerText()).includes(label));
  }
  assert.deepEqual(x.rows, catalogBefore); assert.equal(x.writes().length, 0);
  await x.select(); assert.equal(await x.approve().isEnabled(), false);
  await page.getByRole('button', { name: text('Corregir', 'Correct'), exact: true }).click();
  for (const [canonical, label] of [['D2D Export', labels[lang][3]], ['One Way', labels[lang][4]]]) {
    const option = page.getByRole('dialog').locator(`option[value="${canonical}"]`);
    assert.equal(await option.textContent(), label);
    assert.equal(await option.evaluate(el => el.parentElement.value), canonical);
  }
  await page.getByLabel(text('Punto de cruce MX', 'MX crossing point'), { exact: true }).fill('Nuevo Laredo, TM');
  await page.getByRole('button', { name: text('Cancelar', 'Cancel'), exact: true }).click(); assert.equal(x.writes().length, 0);
  await page.getByRole('button', { name: text('Corregir', 'Correct'), exact: true }).click();
  await page.getByLabel(text('Punto de cruce MX', 'MX crossing point'), { exact: true }).fill('Nuevo Laredo, TM');
  await page.getByRole('button', { name: text('Guardar', 'Save'), exact: true }).click(); await page.waitForLoadState('networkidle');
  assert.deepEqual(x.writes().at(-1).patch, { mx_border_crossing_point: 'Nuevo Laredo, TM' });
  assert.equal(await x.approve().isEnabled(), false);
  await page.getByRole('button', { name: text('Corregir', 'Correct'), exact: true }).click();
  await page.getByLabel(text('Punto de cruce US', 'US crossing point'), { exact: true }).fill('Laredo, TX');
  await page.getByRole('button', { name: text('Guardar', 'Save'), exact: true }).click(); await page.waitForLoadState('networkidle');
  assert.deepEqual(x.writes().at(-1).patch, { us_border_crossing_point: 'Laredo, TX' });
  assert.equal(x.rows[0].status, 'pending_review'); assert.equal(x.rows[0].all_in_rate, '1200'); assert.equal(x.rows[0].valid_through, '2026-10-07');
  fs.writeFileSync(path.join(output, lang + '-ready-dom.txt'), await page.locator('body').innerText());
  await page.locator('.rr-bar .primary:enabled').waitFor();
  assert.equal(await x.approve().isEnabled(), true);
  await page.screenshot({ path: path.join(output, lang + '-ready.png'), fullPage: true });
  await x.approve().click(); await page.getByRole('dialog').getByRole('button', { name: text('Cancelar', 'Cancel'), exact: true }).click(); assert.equal(x.rows[0].status, 'pending_review');
  await x.approve().click(); await page.getByRole('dialog').getByRole('button', { name: text('Continuar', 'Continue'), exact: true }).click();
  await page.getByText(text('No hay tarifas en revisión', 'No rates under review'), { exact: true }).waitFor();
  assert.equal(x.rows[0].status, 'approved'); assert.equal(x.rows[1].status, 'archived');
  await page.getByRole('link', { name: text('Tarifario', 'Rate base'), exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Monterrey' }).waitFor().catch(async error => {
    fs.writeFileSync(path.join(output, lang + '-failure.json'), JSON.stringify({ text: await page.locator('body').innerText(), rows: x.rows, calls: x.calls, unexpected: x.unexpected }, null, 2)); throw error;
  });
  await page.reload(); await page.getByRole('row').filter({ hasText: 'Monterrey' }).waitFor();
  await page.screenshot({ path: path.join(output, lang + '-rate-base.png'), fullPage: true });
  if (!probe) {
    const sendBack = () => page.getByRole('button', { name: text('Regresar a revisión', 'Return to review'), exact: true });
    const dialog = () => page.getByRole('dialog');
    await sendBack().click(); await dialog().getByRole('button', { name: text('Cancelar', 'Cancel'), exact: true }).click();
    assert.equal(x.writes().length, 3); assert.equal(x.rows[0].status, 'approved');
    await sendBack().click(); await dialog().getByRole('button', { name: text('Continuar', 'Continue'), exact: true }).click();
    await page.getByText(text('Escribe por qué regresa; queda en las notas de la tarifa.', 'Enter the reason; it will be kept in the rate notes.'), { exact: true }).waitFor();
    assert.equal(x.writes().length, 3);
    async function returnWithReason() {
      await sendBack().click(); await dialog().getByRole('textbox').fill('Controlled fixture recovery; no commercial validity.');
      await dialog().getByRole('button', { name: text('Continuar', 'Continue'), exact: true }).click();
    }
    await returnWithReason(); await page.getByText('Error: Fixture temporary return failure', { exact: true }).waitFor();
    assert.equal(x.rows[0].status, 'approved'); assert.equal(await x.row().count(), 1);
    await returnWithReason(); await page.getByText(text('Ninguna tarifa con este filtro', 'No rates with this filter'), { exact: true }).waitFor();
    await page.reload(); await page.getByText(text('Ninguna tarifa con este filtro', 'No rates with this filter'), { exact: true }).waitFor();
    await page.locator('.bw header').first().getByRole('link', { name: text('Revisión de tarifas', 'Rate review'), exact: true }).click();
    await page.getByText('Fixture A', { exact: true }).waitFor(); await page.reload(); await page.getByText('Fixture A', { exact: true }).waitFor();
    assert.equal(x.rows[0].id, uid(1)); assert.equal(x.rows[0].status, 'pending_review');
    assert.equal(x.rows[0].all_in_rate, '1200'); assert.equal(x.rows[0].valid_through, '2026-10-07');
    assert.equal(x.rows[0].mx_border_crossing_point, 'Nuevo Laredo, TM'); assert.equal(x.rows[0].us_border_crossing_point, 'Laredo, TX');
    assert.equal(x.rows[1].status, 'archived'); assert.equal(x.rows.length, 2);
    await page.screenshot({ path: path.join(output, lang + '-returned-review.png'), fullPage: true });
  }
  assert.equal(x.writes().length, probe ? 3 : 5); assert.deepEqual(x.unexpected, []); assert.deepEqual(x.errors, []);
  const result = { lang, workflow: true, writes: x.writes().length, recovery: !probe, renderWarnings: x.warnings.length, archivedUntouched: true, priceValidityPreserved: true };
  await x.context.close(); return result;
}
async function isolation(browser, lang, accountChange) {
  const x = await setup(browser, lang); const { page, text } = x;
  await page.goto(origin + '/tarifas'); await page.getByText('Fixture A', { exact: true }).waitFor(); await x.select();
  await page.getByRole('button', { name: text('Corregir', 'Correct'), exact: true }).click();
  await page.getByLabel(text('Punto de cruce MX', 'MX crossing point'), { exact: true }).fill('Unsaved fixture');
  const readsBefore = x.calls.filter(c => c.action === 'list_staging').length;
  await x.changeUser({ id: uid(accountChange ? 100 : 99), email: 'fixture@heymarksman.com', app_metadata: { roles: ['viewer'] } });
  const forbiddenStatus = await page.evaluate(async rateId => {
    const { updateRate } = await import('/src/bidware/features/rate-review/rateReview.service.ts');
    try { await updateRate(rateId, { status: 'approved' }); return 200; } catch (error) { return error.status; }
  }, uid(1));
  assert.equal(forbiddenStatus, 403);
  const result = { lang, change: accountChange ? 'account' : 'role', staleDialog: await page.getByLabel(text('Punto de cruce MX', 'MX crossing point'), { exact: true }).count(), freshRead: x.calls.filter(c => c.action === 'list_staging').length > readsBefore, oldRowsHidden: !accountChange || await page.getByText('Fixture A', { exact: true }).count() === 0, writes: x.writes().length, renderWarnings: x.warnings.length };
  assert.deepEqual(x.unexpected, []); assert.deepEqual(x.errors, []); await x.context.close(); return result;
}
async function lateRead(browser, lang) {
  const x = await setup(browser, lang); const { page, text } = x;
  await page.goto(origin + '/tarifas'); await page.getByText('Fixture A', { exact: true }).waitFor();
  const held = x.holdNextRead();
  await page.getByRole('button', { name: text('Actualizar', 'Refresh'), exact: true }).click(); await held.waiting;
  await x.changeUser({ id: uid(100), email: 'fixture@heymarksman.com', app_metadata: { roles: ['viewer'] } }, false);
  await page.getByText(text('No hay tarifas en revisión', 'No rates under review'), { exact: true }).waitFor();
  held.release(); await page.waitForLoadState('networkidle');
  assert.equal(await page.getByText('Fixture A', { exact: true }).count(), 0);
  assert.equal(x.writes().length, 0); assert.deepEqual(x.unexpected, []); assert.deepEqual(x.errors, []);
  const result = { lang, lateOldResponseIgnored: true, writes: 0, renderWarnings: x.warnings.length };
  await x.context.close(); return result;
}
async function outcomes(browser, lang) {
  const variants = [['Primary', 'awarded'], ['Backup', 'backup'], ['Lost', 'not_awarded'], ['Submitted', 'submitted'], ['Withdrawn', 'withdrawn'], ['Unknown', 'future_outcome'], ['Legacy', null]];
  const fixtureRows = variants.map(([name, outcome], i) => ({ ...initial, id: uid(i + 11), vendors: { vendor_name: 'Fixture ' + name }, rfx_bid_outcome: outcome, mx_border_crossing_point: 'Nuevo Laredo, TM', us_border_crossing_point: 'Laredo, TX' }));
  const before = structuredClone(fixtureRows);
  const x = await setup(browser, lang, fixtureRows); const { page, text } = x;
  const row = name => page.getByRole('row').filter({ hasText: 'Fixture ' + name });
  await page.goto(origin + '/tarifas'); await row('Primary').waitFor();
  const labels = [text('Primaria adjudicada', 'Awarded primary'), text('Respaldo', 'Backup'), text('No adjudicada', 'Not awarded'), text('Oferta sin adjudicar', 'Unawarded bid'), text('Oferta retirada', 'Withdrawn bid'), text('Resultado RFx sin confirmar', 'Unconfirmed RFx outcome')];
  for (let i = 0; i < labels.length; i++) assert((await row(variants[i][0]).innerText()).includes(labels[i]));
  assert((await row('Legacy').innerText()).includes(text('Lista', 'Ready')));
  for (const name of ['Backup', 'Lost', 'Submitted', 'Withdrawn', 'Unknown']) {
    assert((await row(name).innerText()).includes(text('Requiere adjudicación primaria en RFx', 'Requires a primary award in RFx')));
    assert(!(await row(name).innerText()).includes(text('Lista', 'Ready')));
  }
  await row('Backup').getByRole('checkbox').check(); assert.equal(await x.approve().isEnabled(), false);
  await page.getByRole('button', { name: text('Quitar selección', 'Clear selection'), exact: true }).click();
  await page.getByRole('button', { name: text('Elegir las que se pueden aprobar', 'Select rates ready for approval'), exact: true }).click();
  for (const [name] of variants) assert.equal(await row(name).getByRole('checkbox').isChecked(), ['Primary', 'Legacy'].includes(name));
  await page.getByRole('button', { name: lang === 'es' ? 'EN' : 'ES', exact: true }).click();
  assert.equal(await row('Primary').getByRole('checkbox').isChecked(), true); assert.equal(await row('Backup').getByRole('checkbox').isChecked(), false);
  await page.getByRole('button', { name: lang === 'es' ? 'ES' : 'EN', exact: true }).click();
  await page.getByRole('button', { name: text('Quitar selección', 'Clear selection'), exact: true }).click();
  await page.getByRole('checkbox', { name: text('Elegir las tarifas de ' + initial.rfx_id, 'Select rates for ' + initial.rfx_id), exact: true }).check();
  assert.match(await x.approve().innerText(), /2/);
  await page.screenshot({ path: path.join(output, lang + '-outcomes.png'), fullPage: true });
  fs.writeFileSync(path.join(output, lang + '-outcomes-dom.txt'), await page.locator('body').innerText());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, lang + '-outcomes-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await x.approve().click(); assert.match(await page.getByRole('dialog').innerText(), /5/);
  await page.getByRole('dialog').getByRole('button', { name: text('Cancelar', 'Cancel'), exact: true }).click(); assert.equal(x.writes().length, 0);
  await x.approve().click(); await page.getByRole('dialog').getByRole('button', { name: text('Continuar', 'Continue'), exact: true }).click();
  await row('Primary').waitFor({ state: 'hidden' }); await page.reload(); await row('Backup').waitFor();
  assert.deepEqual(x.writes().map(c => c.id).sort(), [uid(11), uid(17)].sort());
  for (let i = 1; i <= 5; i++) assert.deepEqual(fixtureRows[i], before[i], 'Retained bid history must be unchanged');
  assert.equal(fixtureRows[0].status, 'approved'); assert.equal(fixtureRows[6].status, 'approved');
  assert.deepEqual(x.unexpected, []); assert.deepEqual(x.errors, []); assert.equal(x.warnings.length, 0);
  await x.context.close(); return { lang, outcomes: true, mixedSelectionApproved: 2, retainedHistory: 5, outcomeGuard: true, legacyPreserved: true, languageSelectionPreserved: true, renderWarnings: 0 };
}
async function mobileReview(browser, lang) {
  const fixtureRows = ['awarded', 'backup'].map((outcome, i) => ({ ...initial, id: uid(i + 41), vendors: { vendor_name: 'Fixture ' + (i ? 'Backup' : 'Primary') + ' · ' + 'LongCarrierName'.repeat(6) }, rfx_bid_outcome: outcome, mx_border_crossing_point: 'Nuevo Laredo, TM', us_border_crossing_point: 'Laredo, TX' }));
  const x = await setup(browser, lang, fixtureRows); const { page, text } = x;
  const primary = page.getByRole('row').filter({ hasText: 'Fixture Primary' });
  const backup = page.getByRole('row').filter({ hasText: 'Fixture Backup' });
  const noOverflow = async label => {
    const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
    assert(geometry.content <= geometry.viewport + 1, label + ': ' + JSON.stringify(geometry));
  };
  await page.goto(origin + '/tarifas'); await primary.waitFor();
  const widths = [320, 390, 640, 768, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 }); await noOverflow('Review at ' + width);
    assert.equal(await primary.locator('td').count(), 9, 'All fields remain in the same row');
    const display = await primary.evaluate(el => getComputedStyle(el).display);
    assert.equal(display, width <= 640 ? 'grid' : 'table-row');
    if (width <= 640) {
      const withinViewport = await primary.locator('td').evaluateAll(cells => cells.every(cell => { const r = cell.getBoundingClientRect(); return r.left >= 0 && r.right <= document.documentElement.clientWidth + 1; }));
      assert(withinViewport, 'All mobile fields stay reachable without horizontal scrolling');
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await backup.getByRole('checkbox').check(); assert.equal(await x.approve().isEnabled(), false);
  await page.getByRole('button', { name: text('Quitar selección', 'Clear selection'), exact: true }).click();
  await page.getByRole('button', { name: text('Elegir las que se pueden aprobar', 'Select rates ready for approval'), exact: true }).click();
  assert.equal(await primary.getByRole('checkbox').isChecked(), true); assert.equal(await backup.getByRole('checkbox').isChecked(), false);
  await noOverflow('Selected action bar');
  const approveRect = await x.approve().boundingBox(); assert(approveRect.height >= 44);
  await primary.getByRole('checkbox').focus(); assert.equal(await primary.getByRole('checkbox').evaluate(el => el === document.activeElement), true);
  const selectionId = fixtureRows[0].id;
  await primary.getByRole('button', { name: text('Corregir', 'Correct'), exact: true }).click();
  const edit = page.getByRole('dialog', { name: text('Corregir tarifa', 'Correct rate'), exact: true }); await edit.waitFor();
  await edit.getByLabel(text('Punto de cruce MX', 'MX crossing point'), { exact: true }).fill('Unsaved mobile fixture');
  const formFits = await edit.locator('input, select').evaluateAll(fields => fields.every(field => { const r = field.getBoundingClientRect(); return r.left >= 0 && r.right <= document.documentElement.clientWidth + 1; })); assert(formFits, 'Mobile correction fields fit');
  await page.screenshot({ path: path.join(output, lang + '-mobile-correction.png'), fullPage: true });
  await edit.getByRole('button', { name: text('Cancelar', 'Cancel'), exact: true }).click(); assert.equal(x.writes().length, 0);
  await x.approve().click(); await page.getByRole('dialog').getByRole('button', { name: text('Cancelar', 'Cancel'), exact: true }).click(); assert.equal(x.writes().length, 0);
  await page.getByRole('button', { name: lang === 'es' ? 'EN' : 'ES', exact: true }).click();
  assert.equal(await primary.getByRole('checkbox').isChecked(), true);
  assert.equal(await primary.locator('.rr-price').getAttribute('data-label'), lang === 'es' ? 'Rate' : 'Tarifa');
  await noOverflow('Language change');
  await page.getByRole('button', { name: lang === 'es' ? 'ES' : 'EN', exact: true }).click();
  await page.screenshot({ path: path.join(output, lang + '-mobile-review.png'), fullPage: true });
  await page.locator('.rr-group').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(output, lang + '-mobile-review-viewport.png'), fullPage: false });
  fs.writeFileSync(path.join(output, lang + '-mobile-review-dom.txt'), await page.locator('body').innerText());
  await page.setViewportSize({ width: 1440, height: 1050 }); assert.equal(await primary.getByRole('checkbox').isChecked(), true); await noOverflow('Resize preserves selection');
  await page.reload(); await primary.waitFor(); assert.equal(await primary.getByRole('checkbox').isChecked(), false);
  assert.equal(fixtureRows[0].id, selectionId); assert.equal(fixtureRows[0].status, 'pending_review');
  assert.equal(fixtureRows[1].rfx_bid_outcome, 'backup'); assert.equal(fixtureRows[0].mx_border_crossing_point, 'Nuevo Laredo, TM');
  assert.equal(x.writes().length, 0); assert.deepEqual(x.errors, []); assert.deepEqual(x.unexpected, []); assert.equal(x.warnings.length, 0);
  await x.context.close(); return { lang, mobileReview: true, widths, noPageOverflow: true, backupHeld: true, correctionCancelled: true, selectionAcrossLanguageAndResize: true, writes: 0, renderWarnings: 0 };
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const lang of ['es', 'en']) { if (mobileOnly) { results.push(await mobileReview(browser, lang)); continue; } results.push(await workflow(browser, lang)); results.push(await isolation(browser, lang, true)); results.push(await isolation(browser, lang, false)); if (!probe) { results.push(await lateRead(browser, lang)); results.push(await outcomes(browser, lang)); results.push(await mobileReview(browser, lang)); } }
    fs.writeFileSync(path.join(output, probe ? 'before.json' : 'result.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
    if (!probe) for (const result of results) { assert.equal(result.renderWarnings, 0); if (result.change) { assert.equal(result.staleDialog, 0); assert.equal(result.freshRead, true); assert.equal(result.oldRowsHidden, true); assert.equal(result.writes, 0); } }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
