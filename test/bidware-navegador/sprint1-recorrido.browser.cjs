/* Real components/services; stateful isolated API responses and simulated delivery.
 * Does not certify PostgreSQL, a Gmail mailbox or production acceptance. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3018';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/sprint1-recorrido');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function run(browser, language) {
  const user = { id: uid(99), email: 'fixture@heymarksman.com', app_metadata: { roles: ['admin'] }, user_metadata: {} };
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1050 } });
  await ctx.addInitScript(({ user, language }) => {
    localStorage.setItem('bidware.team.lang', language);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now()/1000)+36000, token_type: 'bearer' }));
  }, { user, language });
  const project = { id: uid(1), title: 'Piloto aislado', customer_id: uid(2), customer_name: 'Shipper de prueba', opportunity_type: 'contract', status: 'rfi_sent', rfi_status: 'in progress', notes: null };
  const event = { id: uid(3), rfx_id: 'RFX-TEST', name: 'Piloto aislado', customer: 'Shipper de prueba', status: 'draft', currency: 'USD' };
  let saved = null, submitted = false, launched = false, materialized = false, staged = false, draftAvailable = true;
  const lanes = [1,2].map(n => ({ id: uid(10+n), rfx_event_id: event.id, lane_number: n, origin: 'Monterrey, NL', destination: n===1?'Guadalajara, JAL':'Querétaro, QRO', origin_country: 'MX', destination_country: 'MX', equipment: 'Truck Trailer', trailer: 'Dry Van', operation: 'Intra-Mex', service: 'One Way', currency: 'USD', invitations: [] }));
  const vendors = [1,2,3].map(n => ({ id: uid(20+n), vendor_name: `Carrier ${n} de prueba`, primary_email: `carrier${n}@example.test`, status: 'active' }));
  const messages = [], confirmations = [], reviews = [], rates = [], quotes = [], calls = [], unknown = [], errors = [];
  const results = [], operations = new Map();
  const requestResponse = () => ({ project, link: { id: uid(4), status: 'active', expires_at: '2099-01-01T00:00:00Z', submitted_at: submitted?'2026-09-30T12:00:00Z':null }, submission: { status: submitted?'submitted':'draft', submitted_at: null, response: saved }, lanes: saved?.lanes || [] });
  const detail = () => ({ event, lanes });
  const options = { categories: {}, mx_crossings: [], us_crossings: [] };
  const snapshot = uid(5), pack = uid(6);
  function api(input) {
    const a = input.action;
    calls.push(structuredClone(input));
    switch (a) {
      case 'dashboard_summary': return {};
      case 'list_shippers': return { rows: [{ id: project.customer_id, company_name: project.customer_name }] };
      case 'list_rfx_process_projects': return { rows: [project] };
      case 'list_rfx_events': return { rows: launched?[event]:[] };
      case 'event_origins': return { origins: {}, folios: {} };
      case 'list_rfx_detail': assert.equal(input.event_id, event.id); return detail();
      case 'list_rfx_segment_confirmations': return { rows: [...confirmations].reverse() };
      case 'list_contact_history': return { rows: [] };
      case 'list_staging_options': return options;
      case 'list_catalog_values': return { rows: [['equipment','Truck Trailer'],['trailer','Dry Van'],['operation','Intra-Mex'],['service','One Way']].map(([category,value])=>({category,raw_value:value,normalized_value:value,active:true,code:'fixture'})) };
      case 'get_context': return { fx: { usd_mxn: 18 }, accessorial_catalog: [], fuel: { state_region: {}, regions: [] }, border_crossings: [], email: { connected: false } };
      case 'list_gmail_connections': return { rows: [{ id: uid(7), mailbox_email: 'sales@heymarksman.com', status: 'connected', sender_name: 'MARKSMAN', bounces_synced_at: null }] };
      case 'get_whatsapp_connection_status': return { row: null };
      case 'list_whatsapp_templates': case 'list_outreach_templates': case 'list_bid_room_chat': return { rows: [] };
      case 'list_rfx_invitation_wave_reviews': return { rows: reviews };
      case 'record_rfx_invitation_wave_review': { assert.equal(input.rfx_event_id,event.id); const row={vendor_id:input.vendor_id,reviewed:input.reviewed,contact_snapshot:input.contact_snapshot,channel:input.channel}; const old=reviews.find(r=>r.vendor_id===row.vendor_id); if(old) Object.assign(old,row); else reviews.push(row); return {row}; }
      case 'get_customer_rfi': assert.equal(input.token, 'fixture-rfi'); return requestResponse();
      case 'save_customer_rfi': assert.equal(input.token, 'fixture-rfi'); saved = input.rfi; return { saved: true };
      case 'submit_customer_rfi': assert(saved); assert.deepEqual(input.rfi, saved); submitted = true; project.rfi_status='submitted'; project.status='rfi_submitted'; return { submitted: true };
      case 'create_rfx_demand_snapshot': assert(submitted); assert.equal(input.project_id, project.id); return { row: { id: snapshot }, validation_issues: [] };
      case 'create_rfx_package': assert.equal(input.demand_snapshot_id, snapshot); return { row: { id: pack } };
      case 'launch_rfx_package_to_bid_room': assert.equal(input.package_id, pack); assert.equal(input.app_origin, origin); launched=true; project.bid_room_event_id=event.id; return { rfx_event_id: event.id };
      case 'get_rfx_process_project': return { project: { ...project, opportunity_type: 'spot' }, rfi_submission: { ...requestResponse().submission, updated_at: '2026-10-06T12:00:00.123456Z' }, lanes: saved.lanes };
      case 'list_spot_request_quotes': return { rows: quotes.map(quote => ({ source_project_id: project.id, quote })) };
      case 'convert_spot_request_to_quote': {
        assert(submitted);
        assert.equal(input.project_id, project.id);
        assert.equal(input.expected_submission_updated_at, '2026-10-06T12:00:00.123456Z');
        const replayed = quotes.length > 0;
        if (!replayed) quotes.push({ id: uid(8), folio: 'Q-100' });
        return { quote: quotes[0], source_project_id: project.id, replayed };
      }
      case 'update_rfx_process_project': Object.assign(project, input.patch); return { row: project };
      case 'save_quote_lane': return { lane: { id: uid(9), ...input.lane } };
      case 'shortlist_rfx_lane_vendors': {
        assert.equal(input.carrier_template_context.template_version, 1);
        assert.equal(input.carrier_template_context.template_id, uid(30));
        if (!materialized) for (const lane of lanes) lane.invitations = vendors.map((vendor,i) => ({ id: uid(lane.lane_number*100+i), rfx_lane_id: lane.id, rfx_event_id: event.id, vendor_id: vendor.id, vendors: vendor, invitation_token: `fixture-bid-${lane.lane_number}-${i}`, invitation_status: 'shortlisted' }));
        const reused=materialized; materialized=true;
        return { ok: true, operation_id: input.carrier_template_context.materialization_operation_id, counts: { requested: 6, added: reused?0:6, already_present: reused?6:0, blocked: 0, error: 0, reconcile_required: 0 }, outcomes: [], audit_status: 'complete' };
      }
      case 'create_outreach_campaign': return { row: { id: uid(31), ...input.campaign } };
      case 'generate_outreach_drafts': {
        assert.equal(input.channel,'email'); assert.equal(input.app_origin,origin);
        if (!operations.has(input.operation_id)) { for (const offer of lanes.flatMap(l=>l.invitations)) messages.push({ id: uid(200+messages.length), rfx_event_id: event.id, channel: 'email', status: 'drafted', recipient_email: offer.vendors.primary_email, rfx_lane_vendor_id: offer.id, subject: 'Invitación aislada', html_body: `<a href="${origin}/bid/${offer.invitation_token}">Bid Room</a>` }); operations.set(input.operation_id, true); }
        return { created: messages.length, reused: true };
      }
      case 'list_outreach_messages': return { rows: messages, total: messages.length, has_more: false };
      case 'get_outreach_tracking_summary': return { total: messages.length, drafted: messages.filter(m=>m.status==='drafted').length, sent: messages.filter(m=>m.status==='sent').length, counts: {}, by_status: {}, by_channel: {} };
      case 'send_outreach_messages': {
        assert.equal(new URL(page.url()).pathname, `/rfx/${event.id}/delivery`, 'Only the Delivery queue may initiate sending');
        assert.equal(input.confirmed,true); assert.equal(input.confirmation_action, input.action);
        let sent=0; for (const m of messages.filter(m=>input.ids.includes(m.id))) if (m.status==='drafted') { m.status='sent'; sent++; }
        return { sent, failed: 0, skipped: input.ids.length-sent, provider: 'simulated' };
      }
      case 'submit_bid': {
        const offer=lanes.flatMap(l=>l.invitations).find(o=>o.invitation_token===input.token); assert(offer); Object.assign(offer,input,{invitation_status:'quoted'}); return { invitation: offer };
      }
      case 'save_segment_confirmations': {
        const offer=lanes.flatMap(l=>l.invitations).find(o=>o.invitation_token===input.token); assert(offer);
        for(const row of input.confirmations) { const existing=confirmations.find(c=>c.rfx_lane_vendor_id===offer.id && c.rubric_key===row.rubric_key && c.segment_key===row.segment_key); if(existing) Object.assign(existing,row); else confirmations.push({ ...row, vendor_id:offer.vendor_id, rfx_lane_vendor_id:offer.id, updated_at:'2026-09-30T12:00:00Z' }); }
        return { saved: input.confirmations.length };
      }
      case 'draft_bid_room_carrier_message': {
        assert.equal(input.app_origin,origin);
        let m=messages.find(m=>m.idempotency_key===input.idempotency_key);
        const reused=Boolean(m); if(!m) { m={ id:uid(299), rfx_event_id:event.id, channel:'email',status:'drafted',recipient_email:'carrier1@example.test',subject:'Pregunta aislada',html_body:input.body,idempotency_key:input.idempotency_key }; messages.push(m); }
        return { draft_only:true,reused,outreach_message:m };
      }
      case 'award_rfx_lane_vendor': { const offer=lanes.flatMap(l=>l.invitations).find(o=>o.id===input.id); assert(offer?.bid_rate); assert(input.operation_id); offer.award_role=input.award_role; return {row:offer}; }
      case 'set_rfx_lane_no_award': lanes.filter(l=>input.lane_ids.includes(l.id)).forEach(l=> { l.no_award_at='2026-09-30T12:00:00Z'; l.no_award_reason=input.reason; }); return { no_award:true,updated:1,unchanged:0,rows:[] };
      case 'closeout_awarded_rfx_to_rateware': {
        assert(input.operation_id); if(!staged) { const winner=lanes[0].invitations.find(o=>o.award_role==='primary'); assert(winner); assert(lanes[1].no_award_at); const row={ ...lanes[0], id:uid(40),vendor_id:winner.vendor_id,vendors:winner.vendors, all_in_rate:winner.bid_rate,valid_through:winner.valid_through,status:'pending_review',rfx_bid_outcome:'awarded' }; delete row.invitations; rates.push(row); winner.rate_staging_id=row.id; staged=true; }
        event.status='awarded'; return { inserted:0, linked:1, queued_for_review:1 };
      }
      case 'list_staging': return { rows: rates.filter(r=>r.status==='pending_review'), total:rates.filter(r=>r.status==='pending_review').length };
      case 'update_staging': { const row=rates.find(r=>r.id===input.id); assert(row); Object.assign(row,input.patch); return {row}; }
      case 'list_rateware': return { rows: rates.filter(r=>r.status==='approved'), total:rates.filter(r=>r.status==='approved').length,has_more:false };
      default: unknown.push(a); throw new Error(`Unexpected isolated API: ${a}`);
    }
  }
  await ctx.route('**/*', async route => {
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin) return route.continue();
    if(url.hostname!=='bidware-fixture.supabase.co') { unknown.push(url.hostname); return route.abort(); }
    if(url.pathname==='/auth/v1/user') return route.fulfill({json:user});
    if(url.pathname==='/auth/v1/logout') return route.fulfill({status:204,body:''});
    if(!draftAvailable && req.postDataJSON()?.action==='draft_bid_room_carrier_message') return route.fulfill({status:400,json:{error:'Unknown action.'}});
    try { return await route.fulfill({json:api(req.postDataJSON())}); }
    catch(e) { errors.push(e.message); return route.fulfill({status:501,json:{error:e.message}}); }
  });
  const page=await ctx.newPage(); page.setDefaultTimeout(10000); page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/intake'); await page.waitForLoadState('networkidle');
  await page.evaluate(async project => {
    const model=await import('/src/bidware/features/shipper-request/request.model.ts');
    const service=await import('/src/bidware/features/shipper-request/request.service.ts');
    const draft=model.emptyDraft('rfq', project); draft.contact.email='shipper@example.test'; draft.notes='Captura aislada';
    draft.lanes=[1,2].map(n=>({...model.emptyLane('rfq'),key:`lane-${n}`, origin:{city:'Monterrey',state_code:'NL',country:'MX'},destination:{city:n===1?'Guadalajara':'Querétaro',state_code:n===1?'JAL':'QRO',country:'MX'},truck:'Truck Trailer',equipment:'Dry Van',service:'One Way',operation:'Intra-MX',weekly_volume:'5',loads:'5'}));
    await service.saveRequest('fixture-rfi',draft,{});
    const loaded=await service.loadRequest('fixture-rfi');
    const restored=model.draftFromResponse('rfq',loaded);
    if(restored.lanes.length!==2 || restored.notes!=='Captura aislada') throw Error('Intake did not restore saved state');
    await service.submitRequest('fixture-rfi',restored,loaded.submission.response);
  },project);
  assert.equal(saved.lanes.length,2); assert(submitted); results.push('intake save/read/submit: 2 lanes');
  await page.reload(); await page.waitForLoadState('networkidle');
  const authState = await page.evaluate(async()=> { const {getSession}=await import('/src/bidware/lib/auth.ts'); return {url:location.href,session:Boolean(await getSession()),keys:Object.keys(localStorage)}; });
  assert.equal(authState.session,true,JSON.stringify({authState,calls: calls.map(c=>c.action),unknown,errors}));
  await page.evaluate(async project => {
    const intake=await import('/src/bidware/features/shipper-intake/intake.service.ts');
    await intake.createQuoteFromRequest({...project,opportunity_type:'spot'});
    await intake.createQuoteFromRequest({...project,opportunity_type:'spot'});
    const a=await intake.launchShipperProject(project.id),b=await intake.launchShipperProject(project.id);
    if(a!==b) throw Error('Retry launched a different RFx');
  },project);
  assert.equal(quotes.length,1); results.push('QuoteDesk and snapshot/package/event links with retry');
  await page.evaluate(async ({eventId,laneIds,vendorIds,templateId})=> {
    const fit=await import('/src/bidware/features/carrier-fit/carrierFit.service.ts');
    const input={laneIds,vendorIds,templateId,templateVersion:1,operationId:crypto.randomUUID()}; await fit.materializeTemplate(input); await fit.materializeTemplate(input);
    const outreach=await import('/src/bidware/features/outreach/outreach.service.ts');
    const c=await outreach.createOutreachCampaign({rfx_event_id:eventId,template_id:templateId,name:'Piloto aislado',channel:'email',idempotency_key:crypto.randomUUID()});
    const draft={campaign_id:c.row.id,channel:'email',operation_id:crypto.randomUUID()}; await outreach.generateOutreachDrafts(draft); await outreach.generateOutreachDrafts(draft);
  },{eventId:event.id,laneIds:lanes.map(l=>l.id),vendorIds:vendors.map(v=>v.id),templateId:uid(30)});
  assert.equal(lanes.flatMap(l=>l.invitations).length,6); assert.equal(messages.length,6); assert(messages.every(m=>m.status==='drafted')); results.push('Carrier Fit and 6 invitation drafts; no send');
  await page.evaluate(async ({eventId,vendors})=> { const r=await import('/src/bidware/features/outreach/review.service.ts'); for(const v of vendors) await r.recordContactReview({eventId,vendorId:v.id,reviewed:true,channel:'email',snapshot:{vendor_name:v.vendor_name,email:v.primary_email}}); const rows=await r.listContactReviews(eventId); if(rows.length!==3||rows.some(r=>!r.reviewed)) throw Error('Contact reviews not persisted'); },{eventId:event.id,vendors});
  results.push('3 carrier contacts reviewed and read back');
  await page.goto(`${origin}/rfx/${event.id}/delivery`); await page.waitForLoadState('networkidle');
  await page.locator('thead input[type="checkbox"]').check();
  await page.getByRole('button',{name:language==='es'?'Aprobar y enviar (6)':'Approve and send (6)',exact:true}).first().click();
  assert(messages.every(m=>m.status==='drafted'), 'Opening approval must not send');
  await Promise.all([
    page.waitForResponse(response => response.request().postDataJSON()?.action === 'send_outreach_messages'),
    page.getByRole('dialog').last().getByRole('button',{name:language==='es'?'Aprobar y enviar':'Approve and send',exact:true}).click(),
  ]);
  await page.waitForLoadState('networkidle');
  const deliveryOperation=calls.find(c=>c.action==='send_outreach_messages').operation_id;
  await page.evaluate(async ({ids,op}) => { const q=await import('/src/bidware/features/outreach/outreach.service.ts'); const result=await q.sendOutreachMessages(ids,'email',op); if(result.sent!==0) throw Error('Delivery duplicated'); },{ids:messages.map(m=>m.id),op:deliveryOperation});
  assert(messages.every(m=>m.status==='sent')); results.push('simulated delivery initiated on Queue; repeat sends 0');
  await page.evaluate(async offers=> {
    const bids=await import('/src/bidware/features/bid-room/bidroom.service.ts');
    for(const [i,offer] of offers.entries()) { const form=bids.offerForm({...offer,invitation_id:offer.id}); form.rate=String(1200+i*100); const payload={...bids.offerPayload(form,offer),bid_rate:1200+i*100,currency:'USD',valid_through:'2099-12-31'}; await bids.submitBid(offer.invitation_token,payload); }
    const rows=bids.RUBRICS.map(r=>({rubric_key:r.key,answer:'agree',comment:''}));
    await bids.confirmSegment(offers,'general',rows); await bids.confirmSegment(offers,'general',rows);
  },lanes[0].invitations);
  assert.equal(confirmations.length,18); results.push('3 bids and 6 rubric answers per carrier; repeated answers reuse');
  await page.goto(`${origin}/rfx/${event.id}/detalle`); await page.waitForLoadState('networkidle');
  assert.deepEqual(errors,[]); assert.deepEqual(unknown,[]);
  await page.getByRole('button',{name:/Operate/}).first().click();
  await page.getByRole('button',{name:language==='es'?'Preguntar':'Ask',exact:true}).first().click();
  await page.locator('textarea').fill('¿Incluye maniobras?');
  await page.screenshot({path:path.join(output,`${language}-pregunta-desktop.png`),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,`${language}-pregunta-mobile.png`),fullPage:true});
  await page.setViewportSize({width:1440,height:1050});
  await page.getByRole('button',{name:language==='es'?'Preparar pregunta':'Prepare question',exact:true}).click();
  const confirmation=page.getByRole('dialog').last();
  await confirmation.getByRole('button',{name:language==='es'?'Continuar':'Continue',exact:true}).click();
  await page.waitForLoadState('networkidle');
  await page.getByText(language==='es'?/Pregunta preparada/:/Question prepared/).first().waitFor();
  assert.equal(messages.at(-1).status,'drafted'); assert.equal(calls.filter(c=>c.action==='send_outreach_messages').length,2); results.push('Operate UI prepares question ES/EN and never sends');
  await page.getByRole('button',{name:/Close/}).first().click();
  const closeButton=page.locator('.close-side > button').first();
  const offeredLane=page.locator('.close-lane').filter({hasText:'Guadalajara'});
  const emptyLane=page.locator('.close-lane').filter({hasText:'Querétaro'});
  const voidLabel=language==='es'?'Declarar desierto':'Close without award';
  assert.equal(await closeButton.isEnabled(),false);
  await offeredLane.locator('.close-offer').filter({hasText:'Carrier 2 de prueba'}).getByRole('button',{name:language==='es'?'Respaldo':'Backup',exact:true}).click();
  await offeredLane.locator('.close-offer').filter({hasText:'Carrier 2 de prueba'}).getByRole('button',{name:language==='es'?'Quitar':'Remove',exact:true}).waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(lanes[0].invitations[1].award_role,'backup');
  assert.equal(await closeButton.isEnabled(),false,'A backup alone cannot close the event');
  assert.equal(await offeredLane.getByRole('button',{name:voidLabel,exact:true}).isEnabled(),false,'A lane with a backup cannot be declared void');
  const backupCall=calls.filter(c=>c.action==='award_rfx_lane_vendor').at(-1);
  await page.evaluate(async input=> { const a=await import('/src/bidware/features/rfx-admin/award.service.ts'); await a.awardLaneVendor({invitationId:input.id,role:input.award_role,operationId:input.operation_id}); },backupCall);
  await offeredLane.locator('.close-offer').filter({hasText:'Carrier 1 de prueba'}).getByRole('button',{name:language==='es'?'Primario':'Primary',exact:true}).click();
  await offeredLane.locator('.close-offer').filter({hasText:'Carrier 1 de prueba'}).getByRole('button',{name:language==='es'?'Quitar':'Remove',exact:true}).waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(lanes[0].invitations[0].award_role,'primary');
  const beforeVoid=calls.filter(c=>c.action==='set_rfx_lane_no_award').length;
  await emptyLane.getByRole('button',{name:voidLabel,exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:language==='es'?'Cancelar':'Cancel',exact:true}).click();
  assert.equal(calls.filter(c=>c.action==='set_rfx_lane_no_award').length,beforeVoid,'Cancel must not write a void decision');
  assert.equal(lanes[1].no_award_at,undefined);
  await emptyLane.getByRole('button',{name:voidLabel,exact:true}).click();
  await page.getByRole('dialog').last().getByRole('textbox').fill('Cancelación de prueba');
  await page.getByRole('dialog').last().getByRole('button',{name:language==='es'?'Continuar':'Continue',exact:true}).click();
  await emptyLane.getByText(/Cancelación de prueba/).waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(lanes[1].no_award_reason,'Cancelación de prueba');
  await page.reload(); await page.waitForLoadState('networkidle'); await page.getByRole('button',{name:/Close/}).first().click();
  assert.equal(await closeButton.isEnabled(),true);
  assert.match(await emptyLane.innerText(),/Cancelación de prueba/);
  await page.screenshot({path:path.join(output,`${language}-close.png`),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,`${language}-close-mobile.png`),fullPage:true});
  await page.setViewportSize({width:1440,height:1050});
  await closeButton.click();
  await page.getByRole('dialog').last().getByRole('button',{name:language==='es'?'Cancelar':'Cancel',exact:true}).click();
  assert.equal(calls.filter(c=>c.action==='closeout_awarded_rfx_to_rateware').length,0,'Cancel closeout must not queue a rate');
  await closeButton.click();
  await page.getByRole('dialog').last().getByRole('button',{name:language==='es'?'Continuar':'Continue',exact:true}).click();
  await page.waitForLoadState('networkidle');
  const closeCall=calls.find(c=>c.action==='closeout_awarded_rfx_to_rateware');
  await page.evaluate(async input=> { const a=await import('/src/bidware/features/rfx-admin/award.service.ts'); await a.closeoutToRateware(input.event_id,input.operation_id); },closeCall);
  assert.equal(lanes[0].invitations[1].award_role,'backup');
  assert.equal(lanes[1].no_award_reason,'Cancelación de prueba');
  results.push('Close UI ES/EN: backup blocks void/close, canceled decisions do not write, roles/reason survive reload');
  assert.equal(rates.length,1); assert.equal(rates[0].status,'pending_review'); assert.equal(lanes[0].invitations[0].rate_staging_id,rates[0].id); results.push('primary/backup/desierto -> human review; no duplicate rate');
  await page.goto(origin+'/tarifas'); await page.waitForLoadState('networkidle');
  await page.getByRole('checkbox',{name:language==='es'?/Elegir Monterrey/:/Select Monterrey/}).check();
  await page.getByRole('button',{name:language==='es'?'Aprobar 1':'Approve 1',exact:true}).click();
  assert.equal(rates[0].status,'pending_review','Opening approval must not publish the rate');
  await page.getByRole('dialog').last().getByRole('button',{name:language==='es'?'Continuar':'Continue',exact:true}).click();
  await page.waitForLoadState('networkidle');
  await page.goto(origin+'/tarifario'); await page.waitForLoadState('networkidle');
  assert.deepEqual(errors,[]); assert.deepEqual(unknown,[]);
  await page.getByText(/Monterrey, NL → Guadalajara, JAL/).first().waitFor();
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(rates[0].status,'approved'); await page.screenshot({path:path.join(output,`${language}-tarifario.png`),fullPage:true}); results.push('review -> approval -> rate base after reload');
  assert.deepEqual(unknown,[]); assert.deepEqual(errors,[]);
  const correlated=['shortlist_rfx_lane_vendors','generate_outreach_drafts','send_outreach_messages','award_rfx_lane_vendor','closeout_awarded_rfx_to_rateware'];
  const ids=Object.fromEntries(correlated.map(a=>[a,calls.filter(c=>c.action===a).map(c=>c.operation_id||c.carrier_template_context?.materialization_operation_id)]));
  for(const a of correlated) assert.equal(ids[a][0],ids[a][1],`${a}: retry must keep operation_id`);
  draftAvailable=false;
  const messageCount=messages.length,sendCount=calls.filter(c=>c.action==='send_outreach_messages').length;
  const oldBackend=await page.evaluate(async ({eventId,invitationId,laneId})=> { const {draftCarrierQuestion}=await import('/src/bidware/features/rfx-admin/rfx.service.ts'); const {tr}=await import('/src/bidware/i18n/rfx-admin.ts'); try { await draftCarrierQuestion({eventId,invitationId,laneId,body:'Fixture',requestKey:crypto.randomUUID(),operationId:crypto.randomUUID()}); return null; } catch(e) { return {status:e.status,message:e.message,expected:tr('questionBackendUnavailable')}; } },{eventId:event.id,invitationId:lanes[0].invitations[0].id,laneId:lanes[0].id});
  assert.equal(oldBackend.status,400); assert.equal(oldBackend.message,oldBackend.expected);
  assert.equal(messages.length,messageCount); assert.equal(calls.filter(c=>c.action==='send_outreach_messages').length,sendCount);
  results.push('old backend refuses draft action; translated error and no legacy send fallback');
  draftAvailable=true;
  const beforeDenied=calls.length;
  const denied=await page.evaluate(async ({invitationId,rateId})=> {
    const roles=await import('/src/bidware/lib/roles.ts'); const awards=await import('/src/bidware/features/rfx-admin/award.service.ts'); const rates=await import('/src/bidware/features/rate-review/rateReview.service.ts');
    const statusOf=async f=>{try {await f(); return 200;} catch(e) {return e.status;}};
    const codes=[];
    for(const role of ['viewer','operator']) { roles.setCurrentTeamRole(role); codes.push(await statusOf(()=>awards.awardLaneVendor({invitationId,role:'primary',operationId:crypto.randomUUID()}))); codes.push(await statusOf(()=>rates.updateRate(rateId,{status:'approved'}))); }
    roles.setCurrentTeamRole('admin');
    const auth=await import('/src/bidware/lib/auth.ts'); await auth.signOut();
    const api=await import('/src/bidware/lib/api-client.ts'); codes.push(await statusOf(()=>api.callRatewareApi('list_rfx_events')));
    return codes;
  },{invitationId:lanes[0].invitations[0].id,rateId:rates[0].id});
  assert.deepEqual(denied,[403,403,403,403,401]); assert.equal(calls.length,beforeDenied);
  results.push('viewer/operator cannot award/approve via client; absent session blocks requests');
  await ctx.close(); return {language,results,correlatedOperationIds:ids,unknown,errors,scope:'real components and services, isolated APIs and simulated provider'};
}
(async()=> { fs.mkdirSync(output,{recursive:true}); const browser=await chromium.launch({headless:true}); try { const results=[]; for(const lang of ['es','en']) results.push(await run(browser,lang)); fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2)); console.log('Recorrido local ES/EN: intake, QuoteDesk, RFx, Carrier Fit, borradores, Cola, ofertas, rubros, pregunta, adjudicación/desierto, revisión y tarifario: OK (APIs/proveedor simulados)'); } finally {await browser.close();} })().catch(e=>{console.error(e);process.exitCode=1;});
