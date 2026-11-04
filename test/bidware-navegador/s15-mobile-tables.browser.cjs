/* Local regression: wide tables scroll inside data-table-scroll, never the page. Synthetic fixtures; no production. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3040';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve('.test-output/s15-mobile-tables');
const routes = ['/plantillas', '/archivos', '/crm/rebotes'];
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 1050 }];
const READS = new Set(['list_outreach_templates', 'list_uploads', 'list_vendors']);

function fixtureBody(input) {
  switch (input.action) {
    case 'list_outreach_templates':
      return { rows: [{ id: 'outreach-fixture', name: 'Controlled template with a long title', channel: 'email', subject: 'subject', html_body: 'html_body', owner_email: 'fixture' }] };
    case 'list_uploads':
      return { rows: [{ id: 'upload-fixture', original_filename: 'controlled-long-file-name-for-scroll.eml', document_type: 'email', status: 'uploaded', created_at: '2026-10-01T12:00:00Z', vendor_hint: 'Controlled carrier' }], total: 1 };
    case 'list_vendors':
      return { rows: [{ id: 'vendor-fixture', vendor_name: 'Controlled carrier', primary_email: 'good@example.test', secondary_emails: ['other@example.test'], tags: ['email_bounce'], profile_data: { bounced_emails: [{ email: 'bad@example.test', reason: '5.1.1 user unknown', detected_at: '2026-10-01T12:00:00Z' }] } }] };
  }
}

async function run(browser, route, lang, viewport) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', app_metadata: { roles: ['admin'], permissions: ['vendors:manage'] } };
  const calls = [], unexpected = [], errors = [];
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await ctx.addInitScript(({ user, lang }) => {
    if (window.top !== window.self) return;
    localStorage.setItem('bidware.team.lang', lang);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'f.x.t', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, token_type: 'bearer' }));
  }, { user, lang });
  await ctx.route('**/*', async r => {
    const req = r.request(), url = new URL(req.url());
    if (url.origin === origin) return r.continue();
    if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return r.abort(); }
    if (url.pathname === '/auth/v1/user') return r.fulfill({ json: user });
    if (url.pathname.startsWith('/rest/v1/')) return r.fulfill({ json: [] });
    if (req.method() !== 'POST') { unexpected.push(req.method() + ' ' + url.pathname); return r.fulfill({ status: 501, json: { error: 'Unexpected fixture request' } }); }
    const input = req.postDataJSON(); calls.push(input.action);
    if (!READS.has(input.action)) { unexpected.push(input.action); return r.fulfill({ status: 501, json: { error: 'Unexpected fixture action' } }); }
    return r.fulfill({ json: fixtureBody(input) });
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  const name = route.replace(/\W+/g, '-').replace(/^-/, '') + '-' + lang + '-' + viewport.width;
  try {
    await page.goto(origin + route); await page.waitForLoadState('networkidle');
    const wrap = page.locator('.data-table-scroll').first();
    await wrap.waitFor();
    assert.equal(await page.locator('.data-table-scroll > table.data').count(), 1, 'table stays an HTML table inside the wrapper');
    assert.equal(await wrap.getAttribute('tabindex'), '0');
    assert((await wrap.getAttribute('aria-label') || '').length > 0, 'wrapper has an accessible name');

    const measure = () => page.evaluate(() => {
      const w = document.querySelector('.data-table-scroll'), t = w.querySelector('table'), root = document.documentElement;
      return { rootScroll: root.scrollWidth, rootClient: root.clientWidth, rootScrollLeft: root.scrollLeft,
        wrapScroll: w.scrollWidth, wrapClient: w.clientWidth, wrapOverflowX: getComputedStyle(w).overflowX,
        tableTag: t.tagName, tableDisplay: getComputedStyle(t).display, bodyOverflowX: getComputedStyle(document.body).overflowX };
    });
    const m = await measure();
    assert(m.rootScroll <= m.rootClient + 1, `page overflows horizontally: ${m.rootScroll} > ${m.rootClient}`);
    assert.equal(m.tableTag, 'TABLE'); assert.equal(m.tableDisplay, 'table');
    assert.equal(m.wrapOverflowX, 'auto'); assert.notEqual(m.bodyOverflowX, 'hidden');
    const scrollable = m.wrapScroll > m.wrapClient + 1;
    // Fr8Bid agrupa las acciones de la fila en «Más ▾»; si la tabla cabe en 390 px no hace falta desplazarla.
    if (viewport.width < 600 && !scrollable) assert(m.wrapScroll <= m.wrapClient + 1, 'mobile table either fits or scrolls inside the wrapper');

    // Keyboard only: tab from the wrapper until the last enabled control is focused.
    await wrap.focus();
    const last = await wrap.evaluate(w => {
      const items = [...w.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex="0"]')].filter(e => !e.disabled && e !== w && e.checkVisibility());
      // Fr8Bid: las acciones de la fila van en el menú «Más ▾»; cerrado, su botón visible es el resumen.
      const el = items[items.length - 1]; el.setAttribute('data-last-control', ''); return !!el;
    });
    assert(last, 'table has at least one focusable control');
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.hasAttribute('data-last-control') ?? false);
    }
    assert(reached, 'last control reachable with Tab');
    const fit = await page.evaluate(() => {
      const w = document.querySelector('.data-table-scroll').getBoundingClientRect(), c = document.activeElement.getBoundingClientRect();
      return { left: c.left - w.left, right: w.right - c.right, rootScrollLeft: document.documentElement.scrollLeft };
    });
    assert(fit.left >= -1 && fit.right >= -1, 'focused control is inside the visible scroll area: ' + JSON.stringify(fit));
    assert.equal(fit.rootScrollLeft, 0, 'page horizontal scroll unchanged');
    const after = await measure();
    assert(after.rootScroll <= after.rootClient + 1);

    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    assert(calls.every(a => READS.has(a)), 'reads only');
    await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
    return { route, lang, viewport: viewport.width + 'x' + viewport.height, ...m, scrollable, focusFit: fit, calls: calls.length, unexpected, errors };
  } catch (e) { fs.writeFileSync(path.join(output, name + '-failure.txt'), String(e.message) + '\n' + await page.locator('body').innerText().catch(() => '')); throw e; }
  finally { await ctx.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ headless: true }), results = [];
  try {
    for (const route of routes) for (const lang of ['es', 'en']) for (const viewport of viewports) {
      const result = await run(browser, route, lang, viewport); results.push(result); console.log(JSON.stringify(result));
    }
    assert.equal(results.length, 12);
    fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
