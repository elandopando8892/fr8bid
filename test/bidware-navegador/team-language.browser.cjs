/* Local-only harness. All provider requests are intercepted; unknown requests fail closed. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3011';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const mode = process.argv[2] || 'baseline';
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output', mode);
fs.mkdirSync(output, { recursive: true });
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', role: 'authenticated', app_metadata: { roles: ['admin'] }, user_metadata: { name: 'Test Team' } };
const event = { id: 'event-fixture', rfx_id: 'RFX-TEST', name: 'Fixture event', customer: 'Fixture customer', status: 'open', event_type: 'rfx', due_date: '2026-10-15', created_at: '2026-09-30T12:00:00Z', currency: 'USD' };
const invitation = { id: 'invitation-fixture', vendor_id: 'vendor-fixture', vendor_name: 'Fixture Carrier', invitation_status: 'quoted', outreach_sent_at: '2026-09-29T12:00:00Z', invited_at: '2026-09-29T12:00:00Z', bid_rate: 1200, currency: 'USD', valid_through: '2026-10-20', primary_email: 'carrier@example.test', vendor_email: 'carrier@example.test', award_role: 'primary' };
const lane = { id: 'lane-fixture', rfx_event_id: event.id, lane_number: 1, origin: 'Monterrey, NL', destination: 'Dallas, TX', origin_country: 'MX', destination_country: 'US', equipment: 'Truck Trailer', trailer: 'Dry Van', operation: 'D2D Export', service: 'One Way', weekly_volume: 5, target_rate: 1400, currency: 'USD', invitation_count: 1, bid_count: 1, invitations: [invitation] };
const summary = { lane_count: 1, priced_lane_count: 1, base_cost_total: 1200, accessorials_total: 0, all_in_total: 1440, margin_total: 240, margin_pct: 16.67 };
const quote = { id: 'quote-fixture', folio: 'QD-TEST', title: 'Fixture quote', shipper_id: 'shipper-fixture', shipper_name: 'Fixture customer', quote_type: 'spot', channel: 'email', status: 'estimating', currency: 'USD', fx_usd_mxn: 18, valid_until: '2026-10-15', created_at: '2026-09-30T12:00:00Z' };
const quoteLane = { ...lane, id: 'quote-lane', quote_id: quote.id, origin_city: 'Monterrey', origin_state: 'NL', destination_city: 'Dallas', destination_state: 'TX', linehaul_mx: 500, linehaul_us: 700, fuel_amount: 0, border_amount: 0, accessorials: [], markup_mode: 'percent_on_cost', markup_value: 20, base_cost: 1200, all_in_rate: 1440, margin_pct: 16.67, cost_source: 'manual', metadata: {} };
const vendor = { id: 'vendor-fixture', vendor_name: 'Fixture Carrier', legal_name: 'Fixture Carrier LLC', primary_email: 'carrier@example.test', domain: 'example.test', base_stage: 'procurement', funnel_stage: 'targeted', effective_funnel_stage: 'targeted', status: 'inactive', preferred_channel: 'email', profile_data: {} };
const responses = {
 dashboard_summary: { vendors: 1234, archived_vendors: 0, rfx_open_events: 2, rfx_bids_since: 3 },
 list_rfx_process_projects: { rows: [] }, list_rfx_events: { rows: [event] },
 list_rfx_detail: { event, lanes: [lane] }, event_origins: { origins: { [event.id]: 'manual' }, folios: {} },
 list_rfx_segment_confirmations: { rows: [] },
 list_quotes: { rows: [{ ...quote, first_lane: quoteLane, summary }], kpis: { counts: { estimating: 1 }, avg_margin_pct: 16.67 } },
 get_quote: { quote, lanes: [quoteLane], summary, event: null, awards: {} },
 get_context: { accessorial_catalog: [], fx: { usd_mxn: 18, rate_date: '2026-09-30', source: 'fixture' }, fuel: { state_region: {}, regions: [] }, border_crossings: [], email: { sender: 'sales@example.test', connected: false } },
 list_staging_options: { categories: { equipment: ['Truck Trailer'], trailer: ['Dry Van'], config: ['Single'], operation: ['D2D Export'], service: ['One Way'] }, mx_crossings: [], us_crossings: [] },
 list_fcm_cost_bases: { bases: [], engine_check: { status: 'unknown' } },
 list_gmail_connections: { allowed_sender: 'sales@example.test', rows: [{ mailbox_email: 'sales@example.test', status: 'connected', sender_name: 'MARKSMAN Procurement', bounces_synced_at: '2026-09-29T12:00:00Z' }] },
 get_whatsapp_connection_status: { row: null }, list_whatsapp_templates: { rows: [] },
 list_google_chat_connections: { rows: [], allowed_account: 'sales@example.test' },
 list_vendors: { rows: [vendor], total: 1 }, vendor_funnel: { rows: [vendor], stages: [{ key: 'targeted', count: 1 }], summary: {} },
 list_carrier_list_templates: { rows: [] }, list_shippers: { rows: [] }, list_contact_history: { rows: [] },
 list_rfx_invitation_wave_reviews: { rows: [] },
 consolidate_exact_vendor_duplicates: { dry_run: true, duplicate_groups: 0, duplicates_to_remove: 0, preview: [] },
 list_bid_room_chat: { rows: [], google_chat_configured: false },
 list_catalog_values: { rows: [] }, list_location_catalog_values: { rows: [] },
 list_outreach_templates: { rows: [] }, list_ratebooks: { rows: [] },
};
(async () => {
 const browser = await chromium.launch({ headless: true });
 const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block' });
 const unknown = []; const errors = []; const calls = [];
 await ctx.addInitScript(({ user, language }) => {
  const now = Math.floor(Date.now()/1000);
  localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ access_token: 'fixture.token.only', refresh_token: 'fixture-refresh', expires_in: 36000, expires_at: now+36000, token_type: 'bearer', user }));
  if (!localStorage.getItem('bidware.team.lang')) localStorage.setItem('bidware.team.lang', language);
 }, { user, language: mode === 'en' ? 'en' : 'es' });
 await ctx.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  if(url.origin === origin) return route.continue();
  if(url.hostname !== 'bidware-fixture.supabase.co') { unknown.push(req.url()); return route.abort(); }
  let body;
  if(url.pathname === '/auth/v1/user') body = user;
  else if(url.pathname.startsWith('/rest/v1/')) body = [];
  else if(url.pathname.startsWith('/functions/v1/')) {
   const input = req.postDataJSON(); calls.push(input);
   if(!(input.action in responses)) { unknown.push(input.action); return route.fulfill({ status: 501, json: { error: 'Unmocked action' } }); }
   body = responses[input.action];
  } else { unknown.push(url.pathname); return route.abort(); }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': origin } });
 });
 const page = await ctx.newPage();
 page.on('pageerror', error => { console.error(error); errors.push(error.stack || error.message); });
 page.on('console', m => { if(m.type()==='error') console.error(m.text(),m.location()); });
 const routes = [['dashboard','/'], ['quotedesk','/quotedesk'], ['quote-detail','/quotedesk/quote-fixture'], ['rfx','/rfx'], ['new-event','/rfx/new'], ['workbench','/rfx/event-fixture'], ['event-chat','/rfx/event-fixture/chat'], ['integrations','/integraciones'], ['crm','/crm'], ['crm-hygiene','/crm/higiene'], ['crm-bounces','/crm/rebotes']];
 async function capture(name) {
  await page.screenshot({ path: path.join(output, name+'.png'), fullPage: true });
  await page.locator('.main-col').screenshot({ path: path.join(output, name+'-content.png') });
  fs.writeFileSync(path.join(output,name+'.txt'), await page.locator('body').innerText());
 }
 for(const [name, route] of routes) {
  await page.goto(origin+route); await page.waitForLoadState('networkidle');
  await capture(name);
  if (name==='quotedesk') {
   await page.getByRole('button', {name: /^(Nueva cotización|New quote)$/}).click();
   await capture('new-quote-dialog');
  }
  if(name==='crm') {
   await page.getByRole('button', {name: /^(Nuevo carrier|New carrier)$/}).click();
   await capture('new-carrier-dialog');
  }
  if(name==='workbench') for(const stage of ['Build','Launch','Operate','Close']) {
   const button=page.getByRole('button', { name: new RegExp(stage) }).first();
   if(await button.count() && await button.isEnabled()) {
    await button.click(); await page.waitForLoadState('networkidle');
    await capture('stage-'+stage);
   }
  }
 }
 if(mode!=='baseline') {
  await page.goto(origin+'/crm'); await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:/^(Nuevo carrier|New carrier)$/}).click();
  const field=page.getByPlaceholder(/Transportes Ejemplo|Example Transport/);
  await field.fill('Texto del usuario sin modificar');
  // An open dialog covers the shell; another tab can still change the preference.
  const otherTab=await ctx.newPage(); await otherTab.goto(origin+'/'); await otherTab.waitForLoadState('networkidle');
  await otherTab.getByRole('button',{name:mode==='en'?'ES':'EN',exact:true}).click();
  await page.waitForFunction(expected=>document.documentElement.lang===expected,mode==='en'?'es':'en');
  await otherTab.close();
  assert.equal(await field.inputValue(),'Texto del usuario sin modificar');
  assert.equal(await page.evaluate(()=>localStorage.getItem('bidware.team.lang')),mode==='en'?'es':'en');
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('html').getAttribute('lang'),mode==='en'?'es':'en');
  await page.getByRole('button',{name:mode==='en'?'EN':'ES',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+'/integraciones'); await page.waitForLoadState('networkidle');
  await capture('mobile-integrations');
 }
 fs.writeFileSync(path.join(output,'result.json'), JSON.stringify({ errors, unknown, actions: [...new Set(calls.map(c=>c.action))] },null,2));
 await browser.close();
 assert.deepEqual(errors, []); assert.deepEqual(unknown, []);
 console.log('Local screenshots and intercepted flows passed:', output);
})().catch(e=>{console.error(e);process.exit(1);});
