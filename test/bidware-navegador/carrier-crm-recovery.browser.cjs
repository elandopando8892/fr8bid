/* Real CRM components/services, stateful synthetic transport; no production network. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3040';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve('.test-output/carrier-crm-recovery');
async function run(browser, lang, kind) {
  const role = kind === 'viewer' ? 'viewer' : kind === 'archive' ? 'admin' : 'operator';
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', app_metadata: { roles: [role], permissions: ['vendors:manage'] } };
  const vendor = { id: 'vendor-fixture', vendor_name: 'Controlled carrier', primary_email: 'controlled@example.test', base_stage: 'procurement', funnel_stage: 'targeted', effective_funnel_stage: 'targeted', status: 'inactive' };
  const rows = [vendor, { ...vendor, id: 'archived-fixture', vendor_name: 'Archived carrier', base_stage: 'archived', funnel_stage: null, effective_funnel_stage: null }];
  const calls = [], unexpected = [], errors = []; let failCreate = true, failMove = true;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  await ctx.addInitScript(({ user, lang }) => {
    if (window.top !== window.self) return;
    localStorage.setItem('bidware.team.lang', lang);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, token_type: 'bearer' }));
  }, { user, lang });
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
    const input = req.postDataJSON(); calls.push(structuredClone(input)); let body;
    switch (input.action) {
      case 'vendor_funnel': {
        const funnel = rows.filter(r => r.base_stage === 'procurement');
        body = { rows: funnel, stages: ['targeted', 'invited'].map(key => ({ key, count: funnel.filter(r => r.funnel_stage === key).length })) }; break;
      }
      case 'list_vendors': {
        const result = rows.filter(r => input.ids ? input.ids.includes(r.id) : r.base_stage === input.base_stage);
        body = { rows: result, total: result.length }; break;
      }
      case 'list_carrier_list_templates': body = { rows: [], total: 0, has_more: false }; break;
      case 'create_vendor':
        assert.notEqual(role, 'viewer'); assert.equal(input.vendor.status, 'inactive');
        if (failCreate) { failCreate = false; return route.fulfill({ status: 503, json: { error: 'Synthetic create failure' } }); }
        if (rows.some(r => r.vendor_name === input.vendor.vendor_name)) return route.fulfill({ status: 409, json: { error: 'Synthetic existing carrier', existing_vendor: vendor } });
        rows.push({ ...input.vendor, id: 'created-fixture', funnel_stage: 'targeted', effective_funnel_stage: 'targeted' }); body = { row: rows.at(-1) }; break;
      case 'bulk_update_vendors': {
        assert.notEqual(role, 'viewer'); assert.deepEqual(input.ids, [vendor.id]);
        if (input.patch.base_stage === 'archived') {
          assert.equal(role, 'admin'); assert.equal(input.confirmed, true); assert.equal(input.confirmation_action, 'bulk_update_vendors');
        }
        if (failMove && kind !== 'archive') { failMove = false; return route.fulfill({ status: 503, json: { error: 'Synthetic update failure' } }); }
        Object.assign(vendor, input.patch);
        if (input.patch.base_stage && input.patch.base_stage !== 'procurement') vendor.funnel_stage = null;
        vendor.effective_funnel_stage = vendor.funnel_stage; body = { updated: 1, rows: [vendor] }; break;
      }
      default: unexpected.push(input.action); return route.fulfill({ status: 501, json: { error: 'Unexpected fixture action' } });
    }
    return route.fulfill({ json: structuredClone(body) });
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  const text = (es, en) => lang === 'es' ? es : en;
  const writes = () => calls.filter(c => ['create_vendor', 'bulk_update_vendors'].includes(c.action));
  const open = async () => { await page.goto(origin + '/crm'); await page.waitForLoadState('networkidle'); await page.getByRole('button', { name: lang === 'es' ? 'activo' : 'active', exact: true }).waitFor(); };
  const select = () => page.getByRole('checkbox', { name: text('Seleccionar Controlled carrier', 'Select Controlled carrier'), exact: true }).check();
  const move = () => page.getByRole('button', { name: text('Mover', 'Move'), exact: true });
  const confirm = async ok => { const n = writes().length; await page.getByRole('dialog').getByRole('button', { name: ok ? text('Continuar', 'Continue') : text('Cancelar', 'Cancel'), exact: true }).click(); await page.waitForLoadState('networkidle'); if (ok) for (let i = 0; i < 30 && writes().length === n; i++) await page.waitForTimeout(100); };
  try {
    await open();
    if (kind === 'create') {
      await page.getByRole('button', { name: text('Nuevo carrier', 'New carrier'), exact: true }).click();
      const name = page.getByRole('textbox', { name: text('Razón social *', 'Legal name *'), exact: true });
      const email = page.locator('input[type="email"]');
      const create = page.getByRole('button', { name: text('Crear carrier', 'Create carrier'), exact: true });
      await name.fill('Created carrier'); await email.fill('invalid'); assert.equal(await create.isDisabled(), true); assert.equal(writes().length, 0);
      await email.fill('controlled@example.test'); await create.click(); await page.getByText('Synthetic create failure', { exact: true }).waitFor();
      assert.equal(await name.inputValue(), 'Created carrier'); assert.equal(await email.inputValue(), 'controlled@example.test'); assert.equal(rows.length, 2);
      await create.click(); await page.getByRole('cell', { name: 'Created carrier', exact: true }).waitFor(); assert.equal(rows.length, 3); await page.reload(); await page.waitForLoadState('networkidle');
      await page.getByRole('cell', { name: 'Created carrier', exact: true }).waitFor();
      await page.getByRole('button', { name: text('Nuevo carrier', 'New carrier'), exact: true }).click();
      await name.fill('Controlled carrier'); await email.fill('controlled@example.test'); await create.click(); await page.getByText('Synthetic existing carrier', { exact: true }).waitFor();
      assert.equal(rows.length, 3); assert.equal(await name.inputValue(), 'Controlled carrier'); assert.equal(writes().length, 3);
    } else if (kind === 'status') {
      const active = page.getByRole('button', { name: lang === 'es' ? 'activo' : 'active', exact: true });
      await active.click(); await confirm(false); assert.equal(writes().length, 0);
      await active.click(); await confirm(true); await page.getByText('Error: Synthetic update failure', { exact: true }).waitFor(); assert.equal(vendor.status, 'inactive');
      await active.click(); await confirm(true); for (let i = 0; i < 50 && vendor.status !== 'active'; i++) await page.waitForTimeout(100); assert.equal(vendor.status, 'active'); assert.equal(vendor.funnel_stage, 'targeted');
      await page.reload(); await page.waitForLoadState('networkidle'); assert.equal(await active.isDisabled(), true); assert.equal(writes().length, 2);
      assert(writes().every(c => Object.keys(c.patch).join() === 'status'));
    } else if (kind === 'move') {
      await select(); await page.locator('.crm-move select').selectOption('archived'); assert.equal(await move().isDisabled(), true);
      await page.locator('.crm-move select').selectOption('invited');
      await move().click(); await confirm(false); assert.equal(writes().length, 0);
      await move().click(); await confirm(true); await page.getByText('Error: Synthetic update failure', { exact: true }).waitFor(); assert.equal(vendor.funnel_stage, 'targeted'); assert.equal(await move().isEnabled(), true);
      await move().click(); await confirm(true); assert.equal(vendor.funnel_stage, 'invited'); assert.equal(vendor.status, 'inactive'); assert.equal(writes().length, 2);
      assert.deepEqual(writes().at(-1).patch, { base_stage: 'procurement', funnel_stage: 'invited' });
      await page.reload(); await page.waitForLoadState('networkidle'); await page.getByRole('button', { name: lang === 'es' ? /^Invitado\s*1$/ : /^Invited\s*1$/ }).click(); await page.getByRole('cell', { name: vendor.vendor_name, exact: true }).waitFor();
      await page.getByRole('button', { name: lang === 'es' ? /^Archivado\s*1$/ : /^Archived\s*1$/ }).click();
      await page.getByRole('checkbox', { name: text('Seleccionar Archived carrier', 'Select Archived carrier'), exact: true }).check(); assert.equal(await move().isDisabled(), true);
    } else if (kind === 'archive') {
      await select(); await page.locator('.crm-move select').selectOption('archived'); await move().click();
      await page.screenshot({ path: path.join(output, lang + '-archive-confirmation.png'), fullPage: true });
      const message = await page.getByRole('dialog').innerText(); if (lang === 'en') assert(!message.includes('archivar'), 'English confirmation must not contain Spanish archive action');
      await confirm(true); assert.equal(vendor.base_stage, 'archived'); assert.equal(vendor.funnel_stage, null); assert.equal(writes().length, 1);
    } else {
      assert.equal(await page.getByRole('button', { name: text('Nuevo carrier', 'New carrier'), exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: lang === 'es' ? 'activo' : 'active', exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: text('Enlace de perfil', 'Profile link'), exact: true }).isDisabled(), true);
      await select(); assert.equal(await move().isDisabled(), true); assert.equal(writes().length, 0);
    }
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); assert(!calls.some(c => /send|profile_request|sync_gmail|remove_vendors/.test(c.action)));
    await page.screenshot({ path: path.join(output, lang + '-' + kind + '.png'), fullPage: true });
    return { lang, kind, role, syntheticWrites: writes().length, productionRequests: 0, unexpected, errors };
  } catch (error) {
    fs.writeFileSync(path.join(output, lang + '-' + kind + '-failure.txt'), await page.locator('body').innerText());
    throw error;
  } finally { await ctx.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ headless: true }), results = [];
  try {
    for (const lang of ['es', 'en']) for (const kind of ['create', 'status', 'move', 'viewer', 'archive']) {
      const result = await run(browser, lang, kind); results.push(result); console.log(JSON.stringify(result));
    }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
