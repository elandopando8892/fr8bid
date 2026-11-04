/* Local-only harness. All provider requests are intercepted; unknown requests fail closed. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3222';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const mode = 'gmail-check';
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

async function run(browser,lang,role,mobile=false){
 user.id='11111111-1111-4111-8111-111111111111';user.app_metadata.roles=[role];const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1050}});const calls=[],unknown=[],errors=[];let state='available',releaseLate,startedLate,lateGate;
 await ctx.addInitScript(({user,lang})=>{localStorage.setItem('bidware.team.lang',lang);localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));},{user,lang});
 await ctx.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();if(url.hostname!=='bidware-fixture.supabase.co'){unknown.push(url.origin);return route.abort();}if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204,body:''});const input=req.postDataJSON();calls.push(input);if(input.action==='check_gmail_connection'){if(state==='late'){startedLate();await lateGate;}if(state==='error')return route.fulfill({status:503,json:{error:'PRIVATE PROVIDER ERROR'}});return route.fulfill({json:state==='malformed'?{state:'available',http_status:403,checked_at:'invalid',reason_codes:['PRIVATE_REASON']}:{state:state==='late'?'available':state,stage:'profile',checked_at:'2026-10-08T18:00:00Z',http_status:state==='provider_rejected'?403:200,reason_codes:state==='provider_rejected'?['failedPrecondition']:[],send_scope_granted:true}});}if(!(input.action in responses)){unknown.push(input.action);return route.fulfill({status:501,json:{error:'Unexpected fixture action'}});}return route.fulfill({json:responses[input.action]});});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.RED?4000:15000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(e.message));const label=(es,en)=>lang==='es'?es:en,button=()=>page.getByRole('button',{name:label('Comprobar Gmail','Check Gmail'),exact:true}),checks=()=>calls.filter(c=>c.action==='check_gmail_connection').length;
 try{
 await page.goto(origin+'/integraciones',{waitUntil:'networkidle'});await page.screenshot({path:path.join(output,lang+'-'+role+'-'+mobile+'-before.png'),fullPage:true});
 assert.equal(await button().count(),1,'A Gmail profile check should be available without sending a message');assert.equal(checks(),0,'no automatic provider check on page load');
 if(role==='viewer'){assert.equal(await button().isEnabled(),false);return{lang,role,mobile,passed:true,checks:0};}
 for(const next of ['available','provider_rejected','scope_missing','credentials_unavailable','identity_unconfirmed','unavailable','error','malformed']){state=next;await button().click();const region=page.getByRole('region',{name:label('Comprobación actual de Gmail','Current Gmail check'),exact:true});await button().waitFor({state:'visible'});await page.getByRole('button',{name:label('Comprobando Gmail…','Checking Gmail…'),exact:true}).waitFor({state:'hidden'});const text=await region.innerText();assert.ok(!/PRIVATE/.test(text));if(next==='available'){assert.ok(text.includes(label('Google confirmó acceso al perfil','Google confirmed access to the profile')));await page.screenshot({path:path.join(output,lang+'-'+role+'-'+mobile+'-available.png'),fullPage:true});assert.ok(await region.evaluate(el=>el.scrollWidth<=el.clientWidth));await page.locator('section.card').filter({has:page.getByRole('heading',{name:'Gmail',exact:true})}).screenshot({path:path.join(output,lang+'-'+role+'-'+mobile+'-available-card.png')});}if(next==='provider_rejected')assert.ok(text.includes('failedPrecondition'));if(['error','malformed'].includes(next))assert.ok(text.includes(label('No se pudo completar la comprobación','The check could not be completed')));}
 await page.screenshot({path:path.join(output,lang+'-'+role+'-'+mobile+'-after.png'),fullPage:true});
 const currentRegion=page.getByRole('region',{name:label('Comprobación actual de Gmail','Current Gmail check'),exact:true});assert.ok(await currentRegion.evaluate(el=>el.scrollWidth<=el.clientWidth),'Gmail check must fit its card');await page.locator('section.card').filter({has:page.getByRole('heading',{name:'Gmail',exact:true})}).screenshot({path:path.join(output,lang+'-'+role+'-'+mobile+'-gmail-card.png')});
 const beforeReload=checks();await page.reload({waitUntil:'networkidle'});assert.equal(checks(),beforeReload);
 state='late';lateGate=new Promise(resolve=>releaseLate=resolve);const started=new Promise(resolve=>startedLate=resolve);await button().click();await started;assert.equal(await page.getByRole('button',{name:label('Comprobando Gmail…','Checking Gmail…'),exact:true}).isEnabled(),false);
 assert.equal(await page.getByRole('button',{name:label('Sincronizar rebotes','Sync bounces'),exact:true}).isEnabled(),false,'Another Gmail operation cannot start while the profile check is pending');
 await page.goto(origin+'/rfx',{waitUntil:'domcontentloaded'});releaseLate();await page.waitForLoadState('networkidle');assert.equal(await page.getByRole('region',{name:label('Comprobación actual de Gmail','Current Gmail check'),exact:true}).count(),0);
 await page.goto(origin+'/integraciones',{waitUntil:'networkidle'});state='late';lateGate=new Promise(resolve=>releaseLate=resolve);const pendingAccount=new Promise(resolve=>startedLate=resolve);await button().click();await pendingAccount;
 user.id='22222222-2222-4222-8222-222222222222';user.app_metadata.roles=['viewer'];
 await page.evaluate(async id=>{const {supabase}=await import('/src/bidware/lib/supabase.ts');const token='eyJhbGciOiJub25lIn0.'+btoa(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+36000}))+'.fixture';const {error}=await supabase.auth.setSession({access_token:token,refresh_token:'fixture-only'});if(error)throw error;},user.id);
 await page.getByText(label('Consulta','Viewer'),{exact:true}).waitFor({state:'attached'});releaseLate();await page.waitForLoadState('networkidle');assert.equal(await button().isEnabled(),false);assert.ok(!(await page.getByRole('region',{name:label('Comprobación actual de Gmail','Current Gmail check'),exact:true}).innerText()).includes(label('Google confirmó acceso al perfil','Google confirmed access to the profile')),'Late result cannot appear in the new account');
 assert.ok(calls.every(c=>c.action==='check_gmail_connection'||c.action==='get_whatsapp_connection_status'||c.action==='event_origins'||c.action.startsWith('list_')),'Only the profile check and existing reads are allowed');assert.deepEqual(unknown,[]);assert.deepEqual(errors,[]);return{lang,role,mobile,passed:true,checks:checks(),realProviderCalls:0};
 }finally{await ctx.close();}
}
(async()=>{const browser=await chromium.launch({headless:true}),results=[];try{const cases=process.env.RED?[['es','admin',false]]:process.env.GMAIL_VISUAL?[['es','admin',true],['en','operator',true]]:[['es','admin',false],['en','admin',false],['es','operator',false],['en','operator',false],['es','viewer',false],['en','viewer',false],['es','admin',true],['en','operator',true]];for(const c of cases){results.push(await run(browser,...c));console.log('PASS',...c);}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
