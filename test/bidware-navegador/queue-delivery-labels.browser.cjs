// Isolated UI fixtures: all remote requests fail closed, no production or sends.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3031';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const mode = process.argv[2] || 'es';
const lang = mode === 'en' ? 'en' : 'es';
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/queue-delivery-labels', mode);
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', app_metadata: { roles: ['admin'] } };
const event = { id: 'event-fixture', rfx_id: 'RFX-FIXTURE', name: 'Fixture event', status: 'awarded' };
const stamp = '2026-09-30T12:00:00Z';
const scenarios = [
  ['sent', { status: 'sent', sent_at: stamp }, 'enviado', 'sent'],
  ['manual', { status: 'manual_sent', manual_sent_at: stamp }, 'enviado', 'sent'],
  ['delivered', { status: 'sent', delivered_at: stamp }, 'entregado', 'delivered'],
  ['read', { status: 'sent', read_at: stamp }, 'entregado · leído', 'delivered · read'],
  ['failed', { status: 'failed', failed_at: stamp }, 'falló', 'failed'],
  ['provider-error', { status: 'failed', failed_at: stamp, delivery_error: 'Fixture provider diagnostic' }, 'Fixture provider diagnostic', 'Fixture provider diagnostic'],
  ['bounce', { status: 'bounced', bounce_status: 'hard' }, 'hard', 'hard'],
  ['suppressed-bounce', { status: 'bounced', bounce_status: 'hard', suppressed_at: stamp }, 'suprimido', 'suppressed'],
  ['missing-email', { status: 'drafted', recipient_email: null }, 'sin email de contacto', 'no contact email'],
  ['missing-phone', { status: 'drafted', channel: 'whatsapp', recipient_phone: null }, 'sin teléfono de contacto', 'no contact phone'],
  ['suppressed-recipient', { status: 'drafted', suppressed_at: stamp }, 'destinatario suprimido', 'suppressed recipient'],
  ['stored-reason', { status: 'drafted', suppressed_at: stamp, suppression_reason: 'Fixture stored reason' }, 'Fixture stored reason', 'Fixture stored reason'],
];
const rows = scenarios.map(([name, fields], index) => ({ id: `message-${index}`, rfx_event_id: event.id, vendor_id: `vendor-${index}`, channel: 'email', recipient_email: 'controlled@example.test', subject: 'Stored fixture subject', metadata: { vendor_name: `Fixture ${name}` }, ...fields }));
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--disable-lcd-text', '--disable-font-subpixel-positioning', '--font-render-hinting=none'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
    await context.addInitScript(({ user, lang }) => {
      localStorage.setItem('bidware.team.lang', lang);
      localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, token_type: 'bearer' }));
    }, { user, lang });
    const calls = [], unexpected = [], errors = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return route.abort(); }
      if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
      const input = request.postDataJSON(); calls.push(input);
      const responses = {
        list_rfx_detail: { event, lanes: [] },
        list_outreach_messages: { rows, total: rows.length, has_more: false },
        get_outreach_tracking_summary: { total: rows.length, by_status: { sent: 4, manual_sent: 1, failed: 2, bounced: 2, drafted: 4 } },
        list_rfx_invitation_wave_reviews: { rows: [] },
      };
      if (!(input.action in responses)) { unexpected.push(input.action); return route.fulfill({ status: 501, json: { error: 'Unexpected isolated action' } }); }
      return route.fulfill({ json: responses[input.action] });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/rfx/${event.id}/delivery`);
    await page.getByText('Fixture sent', { exact: true }).waitFor();
    async function checkLabels(language) {
      const result = [];
      for (const [name, , es, en] of scenarios) {
        const row = page.getByRole('row').filter({ has: page.getByText(`Fixture ${name}`, { exact: true }) });
        const cells = await row.getByRole('cell').allTextContents();
        assert.equal(cells.at(-1), language === 'en' ? en : es, name);
        result.push({ name, cells });
      }
      return result;
    }
    const labels = await checkLabels(lang);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    await page.screenshot({ path: path.join(output, 'queue.png'), fullPage: true });
    fs.writeFileSync(path.join(output, 'snapshot.json'), JSON.stringify({ text: await page.locator('body').innerText(), labels, calls }, null, 2));
    if (mode !== 'baseline') {
      await page.getByRole('button', { name: lang === 'es' ? 'EN' : 'ES', exact: true }).click();
      await checkLabels(lang === 'es' ? 'en' : 'es');
      await page.getByRole('button', { name: lang === 'es' ? 'ES' : 'EN', exact: true }).click();
      await checkLabels(lang);
      await page.reload(); await page.getByText('Fixture sent', { exact: true }).waitFor(); await checkLabels(lang);
    }
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    assert(calls.every(input => input.action.startsWith('list_') || input.action.startsWith('get_')));
    console.log(JSON.stringify({ mode, cases: scenarios.length, languageToggle: mode !== 'baseline', reload: mode !== 'baseline', writes: 0, unexpected, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
