/* Actual page/service; controlled contacts and responses, no Gmail/production. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3040';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve('.test-output/bounce-recovery');
async function run(browser, lang, kind) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', app_metadata: { roles: [kind === 'viewer' ? 'viewer' : 'operator'], permissions: ['vendors:manage'] } };
  const bad = 'bad@example.test', good = 'good@example.test';
  const vendor = { id: 'vendor-fixture', vendor_name: 'Controlled carrier', primary_email: kind === 'legacy' ? good : bad, secondary_emails: ['other@example.test'], tags: ['email_bounce'], profile_data: { bounced_emails: [{ email: bad, reason: '5.1.1 user unknown', detected_at: '2026-10-01T12:00:00Z' }] } };
  const calls = [], unexpected = [], errors = []; let rejectReplacement = kind === 'replace', rejectSync = true, lostAcknowledgement = kind === 'lost';
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
      case 'list_vendors': assert.equal(input.tag, 'email_bounce'); body = { rows: vendor.tags.includes('email_bounce') ? [vendor] : [] }; break;
      case 'replace_bounced_vendor_email':
        assert.notEqual(kind, 'viewer'); assert.equal(input.id, vendor.id); assert.equal(input.bounced_email, bad); assert.equal(input.replacement_email, good);
        assert.match(input.operation_id, /^[0-9a-f-]{36}$/);
        const replacements = calls.filter(c => c.action === input.action);
        if (replacements.length > 1) assert.equal(input.operation_id, replacements[0].operation_id, 'An explicit retry must reuse its operation id');
        if (rejectReplacement) { rejectReplacement = false; return route.fulfill({ status: 503, json: { error: 'Synthetic replacement unavailable' } }); }
        if (vendor.profile_data.bounced_emails[0].resolved_at) {
          assert.equal(kind, 'lost'); assert.equal(replacements.length, 2);
          return route.fulfill({ json: { row: vendor, replayed: true, operation_id: input.operation_id } });
        }
        vendor.primary_email = good; vendor.secondary_emails = kind === 'legacy' ? [good, 'other@example.test'] : ['other@example.test'];
        vendor.tags = []; vendor.profile_data.bounced_emails[0].resolved_at = '2026-10-02T12:00:00Z';
        if (lostAcknowledgement) { lostAcknowledgement = false; return route.fulfill({ status: 503, json: { error: 'Synthetic acknowledgement lost' } }); }
        body = { row: vendor }; break;
      case 'update_vendor':
        assert.equal(kind, 'legacy'); assert.equal(input.id, vendor.id); assert.deepEqual(input.patch, { secondary_emails: ['other@example.test'] });
        return route.fulfill({ status: 503, json: { error: 'Synthetic legacy cleanup unavailable' } });
      case 'sync_gmail_bounces':
        assert.equal(kind, 'sync'); assert.equal(input.limit, 50);
        if (rejectSync) { rejectSync = false; return route.fulfill({ status: 503, json: { error: 'Synthetic sync unavailable' } }); }
        body = { scanned: 1, detected: 1, blocked: 1, cleaned_vendors: 1 }; break;
      default: unexpected.push(input.action); return route.fulfill({ status: 501, json: { error: 'Unexpected fixture action' } });
    }
    return route.fulfill({ json: structuredClone(body) });
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  const text = (es, en) => lang === 'es' ? es : en;
  const input = () => page.getByRole('textbox', { name: text('Correo que reemplaza a ', 'Email replacing ') + bad, exact: true });
  const replace = () => page.getByRole('button', { name: text('Reemplazar', 'Replace'), exact: true });
  const sync = () => page.getByRole('button', { name: text('Buscar rebotes en Gmail', 'Find bounces in Gmail'), exact: true });
  const writes = () => calls.filter(c => c.action !== 'list_vendors');
  const finish = async ok => { await page.getByRole('dialog').getByRole('button', { name: ok ? text('Continuar', 'Continue') : text('Cancelar', 'Cancel'), exact: true }).click(); await page.waitForLoadState('networkidle'); };
  try {
    await page.goto(origin + '/crm/rebotes'); await page.waitForLoadState('networkidle'); await input().waitFor();
    if (kind === 'viewer') {
      assert.equal(await input().isDisabled(), true); assert.equal(await replace().isDisabled(), true); assert.equal(await sync().isDisabled(), true); assert.equal(writes().length, 0);
    } else if (kind === 'sync') {
      await sync().click(); await finish(false); assert.equal(writes().length, 0);
      await sync().click(); await finish(true); await page.getByText('Error: Synthetic sync unavailable', { exact: true }).waitFor(); assert.equal(vendor.tags[0], 'email_bounce');
      await sync().click(); await finish(true); await page.getByText(new RegExp(text('Revisados 1 aviso', 'Checked 1 notice'))).waitFor(); assert.equal(writes().length, 2);
    } else {
      if (kind === 'replace') {
        await input().fill('invalid'); await replace().click(); assert.equal(writes().length, 0);
        await input().fill(bad); await replace().click(); assert.equal(writes().length, 0);
      }
      await input().fill(good); await replace().click();
      if (kind === 'replace') {
        await page.getByText('Error: Synthetic replacement unavailable', { exact: true }).waitFor(); assert.equal(await input().inputValue(), good); assert.equal(vendor.primary_email, bad);
        await replace().click();
      }
      if (kind === 'lost') {
        await page.getByText('Error: Synthetic acknowledgement lost', { exact: true }).waitFor(); assert.equal(await input().inputValue(), good); assert.equal(vendor.primary_email, good);
        await replace().click();
      }
      await input().waitFor({ state: 'detached' });
      assert.equal(vendor.primary_email, good); assert(vendor.profile_data.bounced_emails[0].resolved_at);
      if (kind === 'legacy') {
        const body = await page.locator('body').innerText();
        assert(body.includes(text('no repitas el reemplazo', 'do not repeat the replacement')));
        assert(!body.includes('Error: Synthetic legacy cleanup unavailable'));
        assert.equal(calls.filter(c => c.action === 'replace_bounced_vendor_email').length, 1);
        assert.equal(calls.filter(c => c.action === 'update_vendor').length, 1);
        await page.screenshot({ path: path.join(output, lang + '-legacy-warning.png'), fullPage: true });
      } else assert.equal(calls.filter(c => c.action === 'update_vendor').length, 0);
      await page.reload(); await page.waitForLoadState('networkidle'); assert.equal(await page.locator('input[type="email"]').count(), 0);
      assert.equal(calls.filter(c => c.action === 'replace_bounced_vendor_email').length, kind === 'legacy' ? 1 : 2);
    }
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); assert(!calls.some(c => /send_|profile_request/.test(c.action)));
    await page.screenshot({ path: path.join(output, lang + '-' + kind + '.png'), fullPage: true });
    return { lang, kind, syntheticWrites: writes().length, productionRequests: 0, unexpected, errors };
  } catch (e) { fs.writeFileSync(path.join(output, lang + '-' + kind + '-failure.txt'), await page.locator('body').innerText()); throw e; }
  finally { await ctx.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ headless: true }), results = [];
  try {
    for (const lang of ['es', 'en']) for (const kind of process.argv.includes('--legacy-only') ? ['legacy'] : ['replace', 'lost', 'legacy', 'viewer', 'sync']) {
      const result = await run(browser, lang, kind); results.push(result); console.log(JSON.stringify(result));
    }
    fs.writeFileSync(path.join(output, process.argv.includes('--legacy-only') ? 'legacy-result.json' : 'result.json'), JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
