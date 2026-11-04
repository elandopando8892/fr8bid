/* Real UI/services with isolated stateful APIs. No production/provider network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3018';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/spot-queue');
const id = '00000000-0000-4000-8000-000000000001';
async function run(browser, lang, mobile = false, role = 'operator') {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', app_metadata: { roles: [role] }, user_metadata: {} };
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 } });
  await ctx.addInitScript(({user,lang}) => {
    if (window.top !== window.self) return; // The email preview deliberately has no storage access.
    localStorage.setItem('bidware.team.lang', lang);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now()/1000)+36000, token_type: 'bearer' }));
  }, {user,lang});
  const quote = { id, folio: 'QD-TEST', title: 'Fixture quote', shipper_name: 'Fixture shipper', quote_type: 'spot', channel: 'email', status: 'estimating', currency: 'USD', fx_usd_mxn: 18, valid_until: '2099-01-01' };
  const lane = { id: 'lane-fixture', quote_id: id, lane_number: 1, origin: 'Monterrey', origin_city: 'Monterrey', origin_country: 'MX', destination: 'Dallas', destination_city: 'Dallas', destination_country: 'US', equipment: 'Truck Trailer', trailer: 'Dry Van', config: 'Single', operation: 'D2D Export', service: 'One Way', linehaul_mx: 1000, linehaul_us: 0, fuel_amount: 0, border_amount: 0, accessorials: [], carrier_cost: 1000, markup_mode: 'percent_on_cost', markup_value: 20, markup_amount: 200, all_in_rate: 1200, margin_pct: 16.67, missing_cost: false };
  const rows = [], calls = [], unexpected = [], errors = [];
  let sends = 0, outcome = 'success', lastPrepared = null, expired = false;
  const words = lang === 'en' ? {prepare:'Prepare for the queue', refresh:'Refresh preview', review:'Review', approve:'Approve and send', cancel:'Cancel', back:'Back to quote', refreshQueue:'Refresh', error:'The action could not be completed', conflict:'Refresh the queue.', sent:'Sent'} : {prepare:'Preparar para la Cola', refresh:'Actualizar vista previa', review:'Revisar', approve:'Aprobar y enviar', cancel:'Cancelar', back:'Volver a la cotización', refreshQueue:'Actualizar', error:'No se pudo completar la acción', conflict:'Actualiza la Cola.', sent:'Enviado'};
  function draft(input = {}) {
    const to = input.to || 'shipper@example.test', cc = input.cc || [], note = input.note || '';
    const html = `<h1>Fixture quote</h1><p>USD ${lane.all_in_rate}</p><p>${note}</p>`;
    const subject = 'QD-TEST · Fixture shipper', text = `USD ${lane.all_in_rate} ${note}`;
    return { to, cc, note, contact_name: null, from: 'sales@heymarksman.com', subject, text, html, checksum: crypto.createHash('sha256').update(JSON.stringify({to,cc,subject,text,html})).digest('hex'), suppressed: [], history: [] };
  }
  function api(input) {
    calls.push(structuredClone(input));
    if (expired) return { status:401, body:{error:'Fixture expired'} };
    switch(input.action) {
      case 'get_quote': return {quote,lanes:[lane],summary:{lane_count:1,all_in_total:lane.all_in_rate,margin_pct:16.67},event:null,awards:{}};
      case 'get_context': return { accessorial_catalog:[],fx:{usd_mxn:18,rate_date:'2026-09-30'},fuel:{state_region:{},regions:[]},border_crossings:[],email:{sender:'sales@heymarksman.com',connected:true} };
      case 'list_staging_options': return { categories:{equipment:['Truck Trailer'],trailer:['Dry Van'],config:['Single'],operation:['D2D Export'],service:['One Way']},mx_crossings:[],us_crossings:[] };
      case 'list_fcm_cost_bases': return { bases:[],engine_check:{status:'unknown'} };
      case 'preview_quote_email': return draft(input);
      case 'prepare_quote_email_draft': {
        assert.equal(sends,0,'Preparing must never send');
        const preview=draft(input); assert.equal(input.checksum,preview.checksum);
        lastPrepared=structuredClone(input);
        let row=rows.find(r=>r.metadata.checksum===preview.checksum);const reused=!!row;
        if(!row) { row={id:crypto.randomUUID(),status:'drafted',recipient_email:preview.to,subject:preview.subject,html_body:preview.html,text_body:preview.text,receipt:null,metadata:{...preview,quote_id:id}};rows.unshift(row); }
        return {draft_only:true,reused,message:row};
      }
      case 'list_quote_queue': return {quote,rows:rows.slice(input.offset,input.offset+20),total:rows.length};
      case 'send_quote_queue_message': {
        assert.equal(new URL(page.url()).pathname,`/quotedesk/${id}/delivery`,'Only quote queue initiates sending');
        assert.equal(input.confirmed,true);assert.equal(input.confirmation_action,input.action);
        const row=rows.find(r=>r.id===input.message_id);assert(row);
        if(role==='viewer') return {status:403,body:{error:'Fixture forbidden'}};
        if(row.metadata.checksum!==draft(row.metadata).checksum) return {status:409,body:{error:'Fixture stale quote'}};
        if(row.status==='sent') return {message:row,duplicate:true};
        if(row.status==='delivery_unknown') return {status:409,body:{error:'Fixture unknown delivery'}};
        sends++;row.receipt={id:'fixture-receipt',status:outcome==='success'?'sent':outcome==='reject'?'failed':'delivery_unknown',attempt:(row.receipt?.attempt||0)+1,recipient_email:row.recipient_email};row.status=row.receipt.status;
        if(outcome!=='success') return {status:502,body:{error:'Fixture delivery issue'}};
        quote.status='quoted'; return {message:row,duplicate:false};
      }
      default: throw new Error(`Unexpected API ${input.action}`);
    }
  }
  await ctx.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.origin===origin) return route.continue();
    if(url.hostname!=='bidware-fixture.supabase.co') { unexpected.push(url.hostname);return route.abort(); }
    if(url.pathname==='/auth/v1/user') return route.fulfill({json:user});
    try {const result=api(req.postDataJSON()); await route.fulfill({status:result.status||200,json:result.body||result});}
    catch(e){unexpected.push(e.message);await route.fulfill({status:501,json:{error:e.message}});}
  });
  const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const settled=async()=>{
    try { await page.waitForLoadState('networkidle',{timeout:30000}); }
    catch(error) {
      fs.writeFileSync(path.join(output,`${lang}-${mobile?'mobile':'desktop'}-${role}-timeout.json`),JSON.stringify({calls,unexpected,errors},null,2));
      throw error;
    }
  };
  async function prepare(edit=false) {
    await page.goto(`${origin}/quotedesk/${id}`);await settled();
    await page.getByRole('button',{name:words.prepare,exact:true}).click();await settled();
    if(edit) {
      const dialog=page.getByRole('dialog').last();
      await dialog.locator('input').nth(1).fill('copy@example.test');
      await dialog.locator('textarea').fill('Fixture note');
      assert.equal(await dialog.getByRole('button',{name:words.prepare,exact:true}).isDisabled(),true);
      await dialog.getByRole('button',{name:words.refresh,exact:true}).click();await settled();
    }
    await page.getByRole('dialog').last().getByRole('button',{name:words.prepare,exact:true}).click();
    await page.waitForURL(`**/quotedesk/${id}/delivery`);await settled();
  }
  async function review() {await page.getByRole('button',{name:words.review,exact:true}).first().click();}
  async function approve(cancel=false) {
    await page.getByRole('dialog').last().getByRole('button',{name:words.approve,exact:true}).click();
    await page.getByRole('dialog').first().getByRole('button',{name:cancel?words.cancel:words.approve,exact:true}).click();await settled();
  }
  if(role==='viewer') {
    rows.push({id:'viewer-row',status:'drafted',recipient_email:'shipper@example.test',subject:'Fixture quote',html_body:'Fixture quote',receipt:null,metadata:{cc:[],from:'sales@heymarksman.com',checksum:'fixture',quote_id:id}});
    await page.goto(`${origin}/quotedesk/${id}/delivery`);await settled();await review();
    assert.equal(await page.getByRole('button',{name:words.approve,exact:true}).isDisabled(),true);assert.equal(sends,0);
    await page.goto(`${origin}/quotedesk/${id}`);await settled();
    assert.equal(await page.getByRole('button',{name:words.prepare,exact:true}).isDisabled(),true);
  } else {
    await prepare(true);assert.equal(rows.length,1);assert.equal(sends,0);
    await page.evaluate(async input=>{const s=await import('/src/bidware/features/quotedesk/quotedesk.service.ts');await s.prepareQuoteEmailDraft(input);},lastPrepared);
    assert.equal(rows.length,1);await page.reload();await settled();await review();
    await page.getByRole('dialog').last().getByText('copy@example.test',{exact:false}).waitFor();
    await page.screenshot({path:path.join(output,`${lang}-${mobile?'mobile':'desktop'}-snapshot.png`),fullPage:true});
    await approve(true);assert.equal(sends,0);
    await review();lane.all_in_rate=1300;await approve();assert.equal(sends,0);
    await page.getByText(words.conflict,{exact:false}).waitFor();
    await page.getByRole('link',{name:words.back,exact:true}).click();await settled();
    await prepare();assert.equal(rows.length,2);await review();outcome='reject';await approve();assert.equal(sends,1);
    await page.getByText(words.error,{exact:false}).waitFor();
    await page.getByRole('button',{name:words.refreshQueue,exact:true}).click();await settled();await review();outcome='success';await approve();
    assert.equal(sends,2);assert.equal(rows[0].receipt.attempt,2);await page.reload();await settled();await review();
    assert.equal(await page.getByRole('dialog').last().getByRole('button',{name:words.approve,exact:true}).isDisabled(),true);
    await page.screenshot({path:path.join(output,`${lang}-${mobile?'mobile':'desktop'}-receipt.png`),fullPage:true});
    await page.getByRole('dialog').last().getByRole('button',{name:lang==='en'?'Close':'Cerrar',exact:true}).click();
    rows[1].status='delivery_unknown';await page.reload();await settled();await page.getByRole('button',{name:words.review,exact:true}).nth(1).click();
    assert.equal(await page.getByRole('dialog').last().getByRole('button',{name:words.approve,exact:true}).isDisabled(),true);
    await page.getByRole('dialog').last().getByRole('button',{name:lang==='en'?'Close':'Cerrar',exact:true}).click();
    expired=true;await page.getByRole('button',{name:words.refreshQueue,exact:true}).click();await settled();
    await page.getByText(lang==='en'?'Your session expired. Sign in again.':'Tu sesión venció. Inicia sesión otra vez.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:words.review,exact:true}).count(),0,'Expired reads must not keep old quote rows visible');
  }
  assert.equal(calls.some(c=>c.action==='send_quote_email'),false);
  assert.deepEqual(ctx.serviceWorkers(), []);
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  const result={lang,mobile,role,sends,apiCalls:calls.length,productionRequests:0};
  fs.writeFileSync(path.join(output,`${lang}-${mobile?'mobile':'desktop'}-${role}.json`),JSON.stringify(result,null,2));
  await ctx.close();return result;
}
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});try{const results=[];for(const lang of ['es','en']){results.push(await run(browser,lang));results.push(await run(browser,lang,true));results.push(await run(browser,lang,false,'viewer'));}console.log(JSON.stringify(results,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
