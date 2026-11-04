/* Actual RFx page/services, isolated stateful API. Never calls production. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3066';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const baseline = process.argv.includes('--baseline');
const root = path.resolve('.test-output/rfx-catalog-conflict');
const output = path.join(root, baseline ? 'baseline' : 'final');
const draftId = '00000000-0000-4000-8000-000000000001';
const sourceId = '00000000-0000-4000-8000-000000000002';
async function run(browser, lang, mode, mobile = false) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', app_metadata: { roles: ['admin'] }, user_metadata: {} };
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 1050 } });
  await ctx.addInitScript(({ user, lang }) => {
    localStorage.setItem('bidware.team.lang', lang);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_at: Math.floor(Date.now()/1000)+36000, expires_in: 36000, token_type: 'bearer' }));
  }, { user, lang });
  const event = { id: draftId, rfx_id: 'RFX-CONTROLLED', name: 'Controlled draft', status: 'draft', event_type: 'rfx', currency: 'USD' };
  const sourceEvent = { ...event, id: sourceId, name: 'Controlled source' };
  const sourceLane = { id: 'source-lane', lane_number: 1, origin: 'Monterrey, NL', origin_city: 'Monterrey', origin_state: 'NL', origin_country: 'MX', destination: 'Guadalajara, JAL', destination_city: 'Guadalajara', destination_state: 'JAL', destination_country: 'MX', equipment: 'Truck Trailer', trailer: mode === 'mixed' ? 'FixtureBox' : 'Dry Van', config: 'FixtureOne', operation: 'Intra-Mex', service: 'One Way', weekly_volume: 1, invitations: [] };
  const imported = [], calls = [], unexpected = [], errors = [];
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
    if (!url.pathname.endsWith('/functions/v1/rateware-api')) { unexpected.push(url.pathname); return route.abort(); }
    const input = req.postDataJSON(); calls.push(input); let body;
    switch (input.action) {
      case 'list_rfx_events': body = { rows: [sourceEvent] }; break;
      case 'list_rfx_detail': body = input.event_id === sourceId ? { event: sourceEvent, lanes: [sourceLane] } : { event, lanes: imported }; break;
      case 'list_catalog_values': body = { rows: [['equipment','Truck Trailer'],['trailer','Dry Van'],['config','Single'],['config','Tandem'],['operation','Intra-Mex'],['service','One Way']].map(([category, value]) => ({ category, raw_value: value, normalized_value: value, active: true, code: value, source: 'seed' })) }; break;
      case 'save_catalog_value':
        assert.equal(input.catalog_value.normalized_value, input.catalog_value.category === 'config' ? 'Single' : 'Dry Van');
        if (mode === 'conflict' || (mode === 'mixed' && input.catalog_value.category === 'config')) return route.fulfill({ status: 409, json: { error: '409: Fixture backend message', code: 'CATALOG_ALIAS_CONFLICT' } });
        if (mode === 'unrelated') return route.fulfill({ status: 409, json: { error: 'Fixture unrelated conflict', code: 'OTHER_CONFLICT' } });
        if (mode === 'wrong-status') return route.fulfill({ status: 503, json: { error: 'Fixture unavailable', code: 'CATALOG_ALIAS_CONFLICT' } });
        if (mode === 'mixed') return route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } });
        body = { row: { id: 'alias-fixture', ...input.catalog_value, active: true, source: 'manual' } }; break;
      case 'import_rfx_lanes':
        assert.equal(input.event_id, draftId); assert.equal(input.rows.length, 1);
        assert.equal(input.rows[0].config, 'Single'); assert.equal(input.rows[0].trailer, 'Dry Van');
        imported.push({ ...input.rows[0], id: 'imported-lane', invitations: [] }); body = { inserted: 1, skipped: 0 }; break;
      default: unexpected.push(input.action); return route.fulfill({ status: 501, json: { error: 'Unexpected fixture action' } });
    }
    return route.fulfill({ json: structuredClone(body) });
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  const t = (es, en) => lang === 'es' ? es : en;
  await page.goto(`${origin}/rfx/new/${draftId}?step=3`);
  await page.waitForLoadState('networkidle');
  if (!(await page.getByRole('radio', { name: t('Copiar de evento anterior', 'Copy from previous event') }).count())) {
    await page.screenshot({ path: path.join(output, 'diagnostic.png'), fullPage: true });
    throw new Error(JSON.stringify({ visible: await page.locator('body').innerText(), unexpected, errors, calls }));
  }
  await page.getByRole('radio', { name: t('Copiar de evento anterior', 'Copy from previous event') }).click();
  await page.locator('select').filter({ has: page.locator(`option[value="${sourceId}"]`) }).selectOption(sourceId);
  await page.getByRole('button', { name: t('Agregar sus rutas', 'Add its lanes'), exact: true }).click();
  await page.waitForLoadState('networkidle');
  for (const [raw, value] of [['FixtureOne','Single'], ...(mode === 'mixed' ? [['FixtureBox','Dry Van']] : [])]) {
    const row = page.locator('.nev-maprow').filter({ has: page.getByText(raw, { exact: true }) }).filter({ has: page.locator('select') });
    await row.waitFor({ state: 'visible' });
    await row.locator('select').selectOption(value);
    await row.getByRole('checkbox').check();
    await row.locator('button.primary').click();
  }
  await page.locator('.nev-head').getByRole('button', { name: t('Guardar borrador','Save draft'), exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  await dialog.getByRole('button', { name: mode === 'cancel' ? t('Cancelar','Cancel') : t('Continuar','Continue'), exact: true }).click();
  let notice = '';
  if (mode === 'cancel') {
    assert.equal(calls.filter(c => c.action === 'save_catalog_value' || c.action === 'import_rfx_lanes').length, 0);
    assert.equal(imported.length, 0);
  } else {
    const banner = page.locator('.banner.info').filter({ hasText: t('ruta(s) guardadas','lane(s) saved') });
    await banner.waitFor(); notice = await banner.innerText();
    assert.equal(imported.length, 1);
    assert.equal(calls.filter(c => c.action === 'save_catalog_value').length, mode === 'mixed' ? 2 : 1);
    assert.equal(calls.filter(c => c.action === 'import_rfx_lanes').length, 1);
    if (!baseline && ['conflict','mixed'].includes(mode)) {
      assert.match(notice, lang === 'es' ? /no están disponibles para este equipo/ : /not available to this team/);
      assert.match(notice, lang === 'es' ? /conservan el valor elegido/ : /keep the selected value/);
      assert(!notice.includes('Fixture backend message'));
      if (mode === 'mixed') assert(notice.includes(t('no se pudieron guardar 1 sinónimo(s): FixtureBox','could not save 1 synonym(s): FixtureBox')));
    } else if (mode !== 'success') {
      assert(notice.includes(t(`no se pudieron guardar ${mode === 'mixed' ? 2 : 1} sinónimo(s):`, `could not save ${mode === 'mixed' ? 2 : 1} synonym(s):`)));
      assert(!notice.includes(t('no están disponibles para este equipo','not available to this team')));
    } else {
      assert.equal(notice, t('1 ruta(s) guardadas en el borrador.','1 lane(s) saved in the draft.'));
    }
    if (lang === 'en') assert(!/sinónimo|guardadas|equipo|elegido/.test(notice));
  }
  const name = `${lang}-${mode}-${mobile ? 'mobile' : 'desktop'}`;
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  if (!baseline && !['conflict','mixed'].includes(mode)) {
    const prior = JSON.parse(fs.readFileSync(path.join(root,'baseline','results.json'),'utf8')).find(r => r.name === name);
    assert.equal(notice, prior.notice, 'Unaffected visible copy must match the baseline');
    assert.deepEqual(calls.filter(c => ['save_catalog_value','import_rfx_lanes'].includes(c.action)), prior.writes, 'Writes must match the baseline');
  }
  const writesBeforeReload = calls.filter(c => ['save_catalog_value','import_rfx_lanes'].includes(c.action));
  await page.reload();
  await page.getByRole('radio', { name: t('Copiar de evento anterior','Copy from previous event') }).waitFor();
  if (mode !== 'cancel') {
    await page.locator('.banner.info').filter({ hasText: t('Este borrador ya tiene 1 ruta(s).','This draft already has 1 lane(s).') }).waitFor();
  }
  assert.deepEqual(calls.filter(c => ['save_catalog_value','import_rfx_lanes'].includes(c.action)), writesBeforeReload, 'Reload must not retry alias writes or lane import');
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  await ctx.close();
  return { name, language: lang, mode, viewport: mobile ? '390x844' : '1440x1050', notice, writes: calls.filter(c => ['save_catalog_value','import_rfx_lanes'].includes(c.action)), reload_without_repeat: true, persisted_lane_count: imported.length, external_requests: 0, page_errors: errors.length, simulated: true };
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ headless: true }); const results = [];
  try {
    for (const lang of ['es','en']) {
      for (const mode of ['conflict','success','unrelated','wrong-status','mixed','cancel']) results.push(await run(browser,lang,mode));
      results.push(await run(browser,lang,'conflict',true));
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify({ baseline, passed: results.length, output }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
