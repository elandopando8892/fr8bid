/* Local-only: real UI, isolated responses, unknown provider requests fail closed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3018';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/cierre-guardas');
const event = { id: 'event-fixture', name: 'Cierre aislado', rfx_id: 'RFX-TEST', customer: 'Cliente de prueba', status: 'open', currency: 'USD' };
const vendor = { id: 'carrier-a', vendor_name: 'Carrier A de prueba', primary_email: 'a@example.test', status: 'active' };
const offer = { id: 'invitation-a', vendor_id: vendor.id, vendors: vendor, invitation_status: 'quoted', award_role: 'primary', bid_rate: 1200, currency: 'USD', valid_through: '2099-12-31' };
const lane = { id: 'lane-a', rfx_event_id: event.id, lane_number: 1, origin: 'Monterrey, NL', destination: 'Dallas, TX', currency: 'USD', invitations: [offer] };
const confirmation = { rfx_lane_vendor_id: offer.id, vendor_id: vendor.id, segment_key: 'general', rubric_key: 'logistics_model', answer: 'disagree', updated_at: '2026-09-30T12:00:00Z' };
const scenarios = [
  { name: 'vencida', patch: { valid_through: '2000-01-01' }, enabled: false },
  { name: 'bloqueado', patch: { vendors: { ...vendor, status: 'blocked' } }, enabled: false },
  { name: 'respaldo-vencido', extra: { ...offer, id: 'invitation-b', vendor_id: 'carrier-b', award_role: 'backup', valid_through: '2000-01-01' }, enabled: false },
  { name: 'rubro-rechazado', rows: [confirmation], enabled: false },
  { name: 'respuesta-vigente', rows: [confirmation, { ...confirmation, answer: 'agree', updated_at: '2026-10-01T12:00:00Z' }], enabled: true },
  { name: 'sin-rubros-aviso', enabled: true },
  { name: 'operator', role: 'operator', enabled: false },
  { name: 'viewer', role: 'viewer', enabled: false },
  { name: 'lane-pendiente', pendingLane: true, enabled: false },
  { name: 'lane-desierto', voidLane: true, enabled: true },
];
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [], unknown = [], errors = [], writes = [], deniedRequests = [];
  try {
    const selected = process.env.GUARD_CASES ? scenarios.filter(s => process.env.GUARD_CASES.split(',').includes(s.name)) : scenarios;
    assert(selected.length > 0, 'Debe ejecutarse al menos un caso');
    for (const language of ['es', 'en']) for (const scenario of selected) {
      const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', app_metadata: { roles: [scenario.role || 'admin'] }, user_metadata: {} };
      const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Mexico_City', viewport: { width: 1440, height: 1050 } });
      await context.addInitScript(({ user, language }) => {
        localStorage.setItem('bidware.team.lang', language);
        localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture-only', expires_at: Math.floor(Date.now() / 1000) + 36000, token_type: 'bearer' }));
      }, { user, language });
      const lanes = [{ ...lane, invitations: [{ ...offer, ...scenario.patch }, ...(scenario.extra ? [scenario.extra] : [])] }];
      if (scenario.pendingLane || scenario.voidLane) lanes.push({ ...lane, id: 'lane-b', lane_number: 2, invitations: [], no_award_at: scenario.voidLane ? '2026-09-30T12:00:00Z' : null, no_award_reason: 'Cancelación de prueba' });
      const reads = {
        dashboard_summary: {}, list_rfx_process_projects: { rows: [] },
        list_rfx_events: { rows: [event] }, event_origins: { origins: {}, folios: {} },
        list_rfx_detail: { event, lanes }, list_rfx_segment_confirmations: { rows: scenario.rows || [] },
        list_staging_options: { categories: {}, mx_crossings: [], us_crossings: [] },
        list_gmail_connections: { rows: [] }, get_whatsapp_connection_status: { row: null },
        list_whatsapp_templates: { rows: [] }, list_outreach_templates: { rows: [] },
        list_rfx_invitation_wave_reviews: { rows: [] }, list_bid_room_chat: { rows: [] },
      };
      let stageError = null;
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (url.hostname !== 'bidware-fixture.supabase.co') { unknown.push(url.hostname); return route.abort(); }
        if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
        const input = request.postDataJSON();
        if (input?.action === 'closeout_awarded_rfx_to_rateware' && stageError) {
          deniedRequests.push({ language, stage: stageError });
          return route.fulfill({ status: 409, json: { error: 'Backend guard message', code: '409', stage: stageError, incident_id: 'fixture-incident' } });
        }
        if (!input || !(input.action in reads)) {
          unknown.push(input?.action || url.pathname);
          if (input?.action) writes.push(input.action);
          return route.fulfill({ status: 501, json: { error: 'Unexpected request in isolated test' } });
        }
        return route.fulfill({ json: reads[input.action] });
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin+'/rfx/'+event.id+'/detalle');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: /Close/ }).first().click();
      const close = page.locator('.close-side > button').first();
      await close.waitFor();
      const enabled = await close.isEnabled();
      results.push({ language, name: scenario.name, expected: scenario.enabled, enabled });
      if (enabled !== scenario.enabled || ['vencida', 'bloqueado', 'sin-rubros-aviso'].includes(scenario.name)) await page.screenshot({ path: path.join(output, `${language}-${scenario.name}.png`), fullPage: true });
      if (scenario.name === 'sin-rubros-aviso') for (const [stage, key] of [['rfx_closeout_expired', 'closeoutExpired'], ['rfx_closeout_blocked', 'closeoutBlocked'], ['rfx_closeout_refused', 'closeoutRefused']]) {
        stageError = stage;
        const translated = await page.evaluate(async ({ key }) => {
          const { closeoutToRateware } = await import('/src/bidware/features/rfx-admin/award.service.ts');
          const { tr } = await import('/src/bidware/i18n/rfx-admin.ts');
          try { await closeoutToRateware('event-fixture', 'fixture-only'); return null; }
          catch (e) { return { expected: tr(key), message: e.message, status: e.status, stage: e.stage, incidentId: e.incidentId }; }
        }, { key });
        assert(translated);
        assert.equal(translated.message, translated.expected);
        assert.equal(translated.status, 409);
        assert.equal(translated.stage, stage);
        assert.equal(translated.incidentId, 'fixture-incident');
        stageError = null;
      }
      // The same guard must survive a reload, not depend on a stale stage state.
      await page.reload(); await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: /Close/ }).first().click();
      assert.equal(await close.isEnabled(), enabled);
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ results, unknown, errors, writes, deniedRequests }, null, 2));
  assert.deepEqual(unknown, []); assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  assert.deepEqual(results.filter(r => r.enabled !== r.expected), [], 'Las alertas críticas deben bloquear la acción de cierre');
  console.log(`${results.length} escenarios de cierre ES/EN y recarga: OK; cero escrituras o solicitudes externas`);
})().catch(e => { console.error(e); process.exitCode = 1; });
