/* Local-only harness. All provider requests are intercepted; unknown requests fail closed. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3011';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const mode = process.argv[2] || 'baseline';
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/equipo-segunda', mode);
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

const stamp='2026-09-30T12:00:00Z';
const rate={id:'rate-fixture',status:'pending',vendor_id:vendor.id,vendors:{vendor_name:vendor.vendor_name},rfx_id:event.rfx_id,origin:lane.origin,destination:lane.destination,origin_country:'MX',destination_country:'US',origin_state:'NL',destination_state:'TX',origin_market:'Monterrey',destination_market:'Dallas',equipment:lane.equipment,trailer:lane.trailer,config:'Single',operation:lane.operation,service:lane.service,all_in_rate:1200,currency:'USD',quote_date:'2026-09-30',valid_through:'2026-10-20',weekly_capacity:'5',mx_border_crossing_point:'Nuevo Laredo',us_border_crossing_point:'Laredo',created_at:stamp};
const carrierTemplate={id:'template-fixture',segment_name:'Fixture Carrier List',description:'Fixture list',status:'active',lifecycle_status:'active',template_version:2,vendor_ids:[vendor.id,'vendor-other','vendor-blocked'],member_count:3,created_at:stamp,updated_at:stamp};
const vendors=[vendor,{...vendor,id:'vendor-other',vendor_name:'Other Carrier',legal_name:'Other Carrier LLC',primary_email:'other@example.test',domain:'other.example.test'},{...vendor,id:'vendor-blocked',vendor_name:'Blocked Carrier',status:'blocked'}];
const mailTemplate={id:'mail-fixture',owner_email:'fixture',name:'Fixture Invitation',channel:'multi',canonical_language:'en',subject:'Invitation {{rfx_id}}',html_body:'<p>Hello {{vendor_name}}, review your private invitation.</p>',whatsapp_body:'Your private invitation',active:true,is_default:true,created_at:stamp,updated_at:stamp,whatsapp_meta:{meta_template_status:'APPROVED'}};
const draft={id:'draft-fixture',campaign_id:'campaign-fixture',rfx_event_id:event.id,vendor_id:vendor.id,channel:'email',provider:'gmail',recipient_email:'carrier@example.test',subject:'Fixture invitation',status:'drafted',tracking_state:'drafted',metadata:{vendor_name:vendor.vendor_name},created_at:stamp};
const boardRows=['live','closing','awarded','expired'].map((status,i)=>({id:'board-'+i,event_id:'board-event-'+i,board_status:status,is_bid_available:status==='live',event:{id:'board-event-'+i,rfx_id:'RFX-'+i,name:'Fixture opportunity '+i,status:'open',due_date:i===1?'2026-09-30':'2026-10-15'},lane:{...lane,id:'board-'+i},quote_count:i===0?0:3,best_rate:1200,currency:'USD',total_weekly_capacity:10,last_quote_at:i===0?null:stamp,quote_visibility:'open'}));
Object.assign(responses,{
 list_rfx_process_projects:{rows:[{id:'project-fixture',title:'Fixture request',customer_id:'shipper-fixture',customer_name:'Fixture customer',customer_contact_name:'Fixture Contact',customer_contact_email:'customer@example.test',opportunity_type:'program',status:'draft',rfi_status:'submitted',lane_count:1,bid_room_event_id:null,bid_room_rfx_id:null,bid_room_status:null,due_date:'2026-10-15',notes:'',created_at:stamp,updated_at:stamp}]},
 list_staging:{rows:[rate],total:1},list_rateware:{rows:[{...rate,status:'approved'}],total:1,has_more:false},
 list_rateware_audit:{rows:[{id:'audit-fixture',action:'rateware.approve',created_at:stamp,actor_email:'fixture@example.test',metadata:{}}]},
 list_uploads:{rows:[{id:'upload-fixture',original_filename:'fixture.xlsx',document_type:'xlsx',status:'staged',vendor_hint:vendor.vendor_name,created_at:stamp,staged_rows:1,metadata:{}}],total:1},
 list_carrier_list_templates:{rows:[carrierTemplate],total:1,has_more:false},get_carrier_list_template:{row:carrierTemplate},
 list_vendors:{rows:vendors,total:3},list_outreach_templates:{rows:[mailTemplate]},list_outreach_campaigns:{rows:[]},
 list_outreach_messages:{rows:[draft],total:1,has_more:false},get_outreach_tracking_summary:{total:1,states:{drafted:1}},
 get_outreach_message:{row:{...draft,sender_email:'sales@example.test',html_body:'<p>Stored fixture invitation.</p>',text_body:'Stored fixture invitation.'}},
 list_rfx_invitation_wave_reviews:{rows:[]},list_shippers:{rows:[{id:'shipper-fixture',shipper_name:'Fixture customer'}]},
 public_bid_room_board:{rows:boardRows,summary:{events:4,opportunities:4,live:1,closing:1,expired:1,awarded:1,lanes_with_quotes:3,total_quotes:9},refresh_seconds:900,generated_at:stamp},
 get_upload_source_url:{url:origin+'/fixture-source'},
});
// Both invitation languages use the same English fixture content. Message content
// is user data and must not be rewritten when the team's interface language changes.
responses.list_outreach_templates.rows.push({...mailTemplate,id:'mail-es-fixture',canonical_language:'es'});
const profiles={
 'carrier-profile-api':{request:{id:'profile-fixture',status:'open',expires_at:'2026-10-30T12:00:00Z'},vendor:{...vendor},support_tickets:[]},
 'shipper-profile-api':{request:{id:'shipper-profile-fixture',status:'open',expires_at:'2026-10-30T12:00:00Z'},shipper:{id:'shipper-fixture',shipper_name:'Fixture customer',profile_data:{}},contacts:[],locations:[]},
};
(async()=>{
 // Use the same deterministic font rasterization in baseline and candidate.
 const browser=await chromium.launch({headless:true,args:['--disable-lcd-text','--disable-font-subpixel-positioning','--font-render-hinting=none']});
 const ctx=await browser.newContext({viewport:{width:1440,height:1050},locale:'es-MX',timezoneId:'America/Mexico_City'});
 const unknown=[],errors=[],calls=[],captures=[];
 await ctx.addInitScript(({user,language})=>{
  // Sandboxed email previews have an opaque origin; fixture storage belongs
  // only to the app document, never to the preview iframe.
  if(window.top!==window)return;
  const RealDate=Date, fixed=RealDate.parse('2026-09-30T18:00:00Z');
  window.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
  localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({access_token:'fixture.token.only',refresh_token:'fixture-refresh',expires_in:36000,expires_at:Math.floor(fixed/1000)+36000,token_type:'bearer',user}));
  localStorage.setItem('bidware.team.lang',language);
  localStorage.setItem('bidware_carrier_profile_lang',language);
 },{user,language:mode==='en'?'en':'es'});
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin)return route.continue();
  if(url.hostname!=='bidware-fixture.supabase.co'){unknown.push(req.url());return route.abort();}
  let body;
  if(url.pathname==='/auth/v1/user')body=user;
  else if(url.pathname.startsWith('/rest/v1/'))body=[];
  else if(url.pathname.startsWith('/functions/v1/')){
   const input=req.postDataJSON();calls.push(input);
   const api=url.pathname.split('/').at(-1);
   if(input.action==='get_profile'&&profiles[api])body=profiles[api];
   else if(input.action in responses)body=responses[input.action];
   else{unknown.push(input.action);return route.fulfill({status:501,json:{error:'Unmocked action'}});}
  }else{unknown.push(url.pathname);return route.abort();}
  return route.fulfill({status:200,json:body,headers:{'access-control-allow-origin':origin}});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});
 page.on('console',msg=>{if(msg.type()==='error')console.error('Browser error:',msg.text());});
 page.on('requestfailed',req=>console.error('Request failed:',req.url(),req.failure()?.errorText));
 const norm=s=>s.replace(/\s+/g,' ').trim();
 const dictionaries=fs.readdirSync('src/bidware/i18n').filter(f=>f.endsWith('.ts')).map(f=>fs.readFileSync('src/bidware/i18n/'+f,'utf8')).join('\n');
 const ts=require('typescript'),ast=ts.createSourceFile('copy.ts',dictionaries,ts.ScriptTarget.Latest,true),spanish=new Set();
 const propertyName=n=>n&&(ts.isIdentifier(n)||ts.isStringLiteral(n))?n.text:n?.getText(ast);
 function walk(n){if(ts.isPropertyAssignment(n)&&propertyName(n.name)==='es'&&ts.isStringLiteral(n.initializer)){const es=n.initializer.text;const en=n.parent.properties?.find(p=>propertyName(p.name)==='en')?.initializer;if(en&&ts.isStringLiteral(en)&&norm(es)!==norm(en.text)&&!/[{}]/.test(es)&&norm(es).length>2)spanish.add(norm(es));}ts.forEachChild(n,walk);}walk(ast);
 async function capture(name){
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
  await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
  const text=await page.locator('body').innerText();
  const fields=await page.locator('input,textarea,select').evaluateAll(nodes=>nodes.map(n=>({type:n.type,name:n.name,value:n.value,placeholder:n.getAttribute('placeholder'),aria:n.getAttribute('aria-label'),options:n.tagName==='SELECT'?[...n.options].map(o=>({value:o.value,label:o.label})):undefined})));
  const layout=await page.evaluate(()=>[...document.body.querySelectorAll('*')].filter(n=>!n.children.length&&n.getClientRects().length&&!['SCRIPT','STYLE'].includes(n.tagName)).map(n=>{const r=n.getBoundingClientRect();return {tag:n.tagName,text:n.textContent,rect:[r.x,r.y,r.width,r.height]};}));
  fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify({text,fields,layout},null,2));captures.push(name);
  if(mode==='en'){
   const texts=await page.evaluate(()=>{let out=[];const it=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=it.nextNode()){if(n.parentElement?.getClientRects().length&&n.parentElement.tagName!=='SCRIPT'&&n.parentElement.tagName!=='STYLE')out.push(n.textContent.replace(/\s+/g,' ').trim());}return out;});
   const fieldCopy=fields.flatMap(f=>[f.placeholder,f.aria,...(f.options||[]).map(o=>o.label)]).filter(Boolean);
   const leftover=[...new Set([...texts,...fieldCopy].filter(t=>spanish.has(norm(t))))];
   if(leftover.length){fs.writeFileSync(path.join(output,name+'-spanish.json'),JSON.stringify(leftover));throw Error(name+': Spanish UI remains: '+leftover.join(' | '));}
  }
 }
 async function open(route){await page.goto(origin+route);await page.waitForLoadState('networkidle');}
 const routes=[['intake','/intake'],['review','/tarifas'],['rate-base','/tarifario'],['uploads','/archivos'],['carrier-templates','/templates'],['template-builder','/templates/new'],['template-edit','/templates/template-fixture/edit'],['carrier-fit','/carrier-fit?template=template-fixture&event=event-fixture'],['mail-templates','/plantillas'],['mail-editor','/plantillas/mail-fixture'],['mail-new','/plantillas/nueva'],['message','/rfx/event-fixture/message'],['queue','/rfx/event-fixture/delivery'],['contact-review','/rfx/event-fixture/review'],['award-notices','/rfx/event-fixture/notices'],['board','/board'],['carrier-profile','/carrier-profile.html?token=fixture&lang='+(mode==='en'?'en':'es')],['shipper-profile','/shipper-profile.html?token=fixture&lang='+(mode==='en'?'en':'es')]];
 for(const [name,route] of routes){
  await open(route);await capture(name);
  if(name==='queue'){
   await page.getByRole('button',{name:/^(Revisar mensaje|Review message)$/,exact:true}).click();
   await page.getByRole('dialog').getByText(/sales@example.test/).waitFor();
   await capture('stored-message-dialog');await page.keyboard.press('Escape');
  }
  if(name==='review'){await page.getByRole('button',{name:/^(Corregir|Correct)$/}).first().click();await capture('rate-edit-dialog');await page.keyboard.press('Escape');}
  if(name==='rate-base'){await page.locator('.qd-more summary').first().click();await page.getByRole('button',{name:/^(Historial|History)$/}).first().click();await capture('rate-history-dialog');await page.keyboard.press('Escape');}
  if(name==='template-builder'){
   await page.locator('.tb-details input').first().fill('Fixture new template');
   for(const step of [2,3]){
    await page.locator('.tb-step').filter({hasText:new RegExp('^'+step)}).click();await capture('template-step-'+step);
    if(step===2){await page.locator('.tb-list input[type=checkbox]').first().check();await page.getByRole('button',{name:/^(Agregar →|Add →)$/}).click();}
   }
  }
  if(name==='carrier-fit'){
   await page.locator('.fit-filters button').filter({hasText:/^(Elegibles|Eligible)/}).click();assert.equal(await page.locator('.fit-table tbody tr').count(),2);await capture('fit-eligible-filter');
   await page.locator('.fit-filters button').filter({hasText:/^(Ya en el RFx|Already in the RFx)/}).click();assert.equal(await page.locator('.fit-table tbody tr').count(),1);await capture('fit-existing-filter');
  }
  if(name==='board'){
   for(const [view,es] of [['Pipeline','Por etapa'],['Spreadsheet','Tabla']]){await page.getByRole('button',{name:new RegExp('^('+view+'|'+es+')$')}).click();await capture('board-'+view.toLowerCase());}
   // Only open the access form. Its submit action remains blocked by the mock.
   await page.getByRole('button',{name:/^(Solicitar|Request)$/}).first().click();await capture('board-access-dialog');await page.keyboard.press('Escape');
  }
  if(name==='carrier-profile'){
   const steps=await page.locator('.profile-steps button').count();for(let i=1;i<steps;i++){await page.locator('.profile-steps button').nth(i).click();await capture('carrier-profile-step-'+i);}
  }
 }
 // An in-place language switch must update static filters without losing data.
 if(mode!=='baseline'){
  await open('/templates/new');
  const nameField=page.locator('.tb-details input').first();await nameField.fill('Texto del usuario sin modificar');
  const other=await ctx.newPage();await other.goto(origin+'/');await other.waitForLoadState('networkidle');
  await other.getByRole('button',{name:mode==='en'?'ES':'EN',exact:true}).click();
  await page.waitForFunction(expected=>localStorage.getItem('bidware.team.lang')===expected,mode==='en'?'es':'en');
  assert.equal(await nameField.inputValue(),'Texto del usuario sin modificar');
  await other.getByRole('button',{name:mode==='en'?'EN':'ES',exact:true}).click();
  await open('/carrier-fit?template=template-fixture&event=event-fixture');
  await page.locator('.fit-filters button').filter({hasText:/^(Elegibles|Eligible)/}).click();
  const boxes=page.locator('.fit-table input[type=checkbox]');
  await boxes.first().setChecked(!(await boxes.first().isChecked()));
  const selection=await boxes.evaluateAll(nodes=>nodes.map(n=>n.checked));
  await other.getByRole('button',{name:mode==='en'?'ES':'EN',exact:true}).click();
  await page.getByRole('button',{name:mode==='en'?/^Elegibles/:/^Eligible/}).waitFor();
  assert.equal(await page.locator('.fit-table tbody tr').count(),2);
  assert.deepEqual(await boxes.evaluateAll(nodes=>nodes.map(n=>n.checked)),selection);
  await other.getByRole('button',{name:mode==='en'?'EN':'ES',exact:true}).click();await other.close();
 }
 for(const [name,route] of [['mobile-intake','/intake'],['mobile-queue','/rfx/event-fixture/delivery']]){await page.setViewportSize({width:390,height:844});await open(route);await capture(name);}
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({errors,unknown,captures,actions:[...new Set(calls.map(c=>c.action))],calls},null,2));
 await browser.close();assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);
 assert(!calls.some(c=>/^send_|^submit_|^generate_|^create_|^update_|^record_/.test(c.action)), 'No production-like writes or sends are exercised');
 console.log('ES/EN screenshots and isolated flows passed:',output,captures.length);
})().catch(e=>{console.error(e);process.exit(1)});
