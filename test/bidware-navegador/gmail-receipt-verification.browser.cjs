// Real UI/services, isolated API fixtures. No production, Gmail or PostgreSQL certification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3223';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/gmail-receipts-20261008/browser');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function run(browser, lang, role = 'admin') {
  let user = { id: uid(99), email: 'fixture@heymarksman.com', app_metadata: { roles: [role] }, user_metadata: {} };
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ user, lang }) => {
    if(window.top !== window) return; // Never inject auth fixture storage into the sandboxed email.
    if(!localStorage.getItem('bidware.team.lang')) localStorage.setItem('bidware.team.lang', lang);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now()/1000)+36000, token_type: 'bearer' }));
  }, { user, lang });
  const event = { id: uid(1), name: 'Fixture RFx', rfx_id: 'RFX-FIXTURE', status: 'draft' };
  const lane = { id: uid(4), rfx_event_id: event.id, origin: 'Monterrey', destination: 'Dallas', equipment: 'Truck Trailer', trailer: 'Dry Van', config: 'Single', operation: 'D2D Export', service: 'One Way', invitations: [] };
  const compact = { provider_message_id:'abc123',sent_at:'2026-10-08T12:00:00Z', id: uid(2), rfx_event_id: event.id, vendor_id: uid(3), channel: 'email', status: 'sent', subject: 'Stored fixture subject', recipient_email: 'controlled@example.test', vendors: { vendor_name: 'Fixture carrier' } };
  const persisted = { ...compact, sender_email: 'sender@example.test', text_body: '<b>Literal stored text</b>', html_body: `<h2>Stored D2D Export / One Way</h2><script>parent.__reviewExecuted=true;fetch('https://blocked.example.test/script')</script><img src="https://blocked.example.test/image"><a href="https://blocked.example.test/link">Private fixture link</a><form action="https://blocked.example.test/form"><button>Submit</button></form>` };
  let mode = 'html', pendingResolve, startedResolve, lateGate; let verification='found_sent',verificationCount=0,releaseVerification,startedVerification,verificationGate;
  const calls = [], external = [], errors = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if(url.origin === origin) return route.continue();
    if(url.hostname !== 'bidware-fixture.supabase.co') { external.push(url.href); return route.abort(); }
    if(url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    if(url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    const input = request.postDataJSON(); calls.push(input);
    switch(input.action) {
      case 'list_rfx_detail': return route.fulfill({ json: { event: { ...event, id: input.event_id }, lanes: [lane] } });
      case 'list_outreach_templates': return route.fulfill({ json: { rows: [{ id: uid(5), owner_email: 'org:fixture', name: 'Fixture ES', canonical_language: 'es', channel: 'email', subject: 'Fixture sample', html_body: '<p>{{trailer}} | {{config}} | {{operation}} | {{service}}</p>', is_default: true }] } });
      case 'list_outreach_campaigns': return route.fulfill({ json: { rows: [] } });
      case 'list_gmail_connections': return route.fulfill({ json: { rows: [] } });
      case 'list_outreach_messages': return route.fulfill({ json: { rows: user.id === uid(99) && input.rfx_event_id === event.id ? [compact] : [], total: user.id === uid(99) && input.rfx_event_id === event.id ? 1 : 0, has_more: false } });
      case 'get_outreach_tracking_summary': return route.fulfill({ json: { total: 1, drafted: 1, by_status: { drafted: 1 }, by_channel: { email: 1 } } });
      case 'list_rfx_invitation_wave_reviews': return route.fulfill({ json: { rows: [] } });
      case 'verify_outreach_gmail_message': {
        assert.equal(input.id,compact.id);assert.equal(input.rfx_event_id,event.id);assert.equal(input.provider_message_id,undefined);verificationCount++;
        if(verification==='late'){startedVerification();await verificationGate;}
        if(verification==='api-error')return route.fulfill({status:503,json:{error:'PRIVATE_PROVIDER_ERROR'}});
        return route.fulfill({json:verification==='malformed'?{state:'found_sent',http_status:404,checked_at:'invalid'}:{state:verification==='late'?'found_sent':verification,checked_at:'2026-10-08T18:00:00Z',http_status:verification==='not_found'?404:verification==='provider_rejected'?403:verification.startsWith('found')||verification==='late'?200:null,reason_codes:verification==='provider_rejected'?['rateLimitExceeded']:[]}});
      }
      case 'get_outreach_message': {
        assert.equal(input.id, compact.id); assert.equal(input.rfx_event_id, event.id);
        if(mode === 'late') { if(startedResolve) startedResolve(); await lateGate; }
        if(mode === 'expired') return route.fulfill({ status: 401, json: { error: 'Fixture session expired' } });
        if(mode === 'denied') return route.fulfill({ status: 403, json: { error: 'Fixture denied' } });
        const row = user.id !== uid(99) || mode === 'missing' ? null : mode === 'wrong-event' ? { ...persisted, rfx_event_id: uid(10) } : mode === 'wrong-id' ? { ...persisted, id: uid(20) } : mode === 'text' ? { ...persisted, html_body: null } : persisted;
        return route.fulfill({ json: { row } });
      }
      default: errors.push(`Unexpected API ${input.action}`); return route.fulfill({ status: 501, json: { error: 'Unexpected isolated action' } });
    }
  });

  const page=await context.newPage();page.setDefaultTimeout(process.env.RED?4000:15000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>{if(!e.message.includes("serviceWorker"))errors.push(e.message);});
  const label=(es,en)=>lang==='es'?es:en,dialog=()=>page.getByRole('dialog',{name:label('Mensaje guardado','Stored message'),exact:true}),receipt=()=>dialog().getByRole('region',{name:label('Recibo guardado','Stored receipt'),exact:true}),button=()=>receipt().getByRole('button',{name:label('Comprobar en Gmail','Verify in Gmail'),exact:true}),review=()=>page.getByRole('button',{name:label('Revisar mensaje','Review message'),exact:true});
  try{
   await page.goto(origin+'/rfx/'+event.id+'/delivery',{waitUntil:'networkidle'});await review().click();await dialog().getByText(/sender@example.test/).waitFor();assert.equal(await receipt().count(),1,'Receipt should be shown alongside the stored message');assert.ok((await receipt().innerText()).includes('abc123'));assert.equal(verificationCount,0,'No automatic Google lookup when opening');
   if(role==='viewer'){assert.equal(await button().isEnabled(),false);await page.screenshot({path:path.join(output,lang+'-'+role+'.png'),fullPage:true});return{lang,role,passed:true,verifications:0};}
   for(const state of ['found_sent','found_not_sent','not_found','provider_rejected','unavailable','missing','no_receipt','not_connected','scope_missing','credentials_unavailable','api-error','malformed']){
    verification=state;const prior=verificationCount;await button().click();await receipt().getByRole('button',{name:label('Comprobando en Gmail…','Verifying in Gmail…'),exact:true}).waitFor({state:'hidden'});assert.equal(verificationCount,prior+1);const text=await receipt().innerText();assert.ok(!text.includes('PRIVATE'));assert.ok(text.includes('abc123'),'Stored receipt survives lookup errors');if(state==='found_sent')assert.ok(text.includes(label('Google encontró ese identificador con la etiqueta Enviados.','Google found that identifier with the Sent label.')));if(state==='not_found')assert.ok(text.includes(label('Google no encontró ese identificador','Google did not find that identifier')));if(state==='api-error'||state==='malformed')assert.ok(text.includes(label('No se pudo completar la consulta','The lookup could not be completed')));
   }
   await page.setViewportSize({width:390,height:844});assert.ok(await receipt().evaluate(el=>el.scrollWidth<=el.clientWidth));await dialog().screenshot({path:path.join(output,lang+'-'+role+'-mobile.png')});
   await dialog().getByRole('button',{name:label('Cerrar','Close'),exact:true}).click();await page.reload({waitUntil:'networkidle'});const before=verificationCount;await review().click();await receipt().waitFor();assert.equal(verificationCount,before,'Reload does not repeat the lookup');
   verification='late';verificationGate=new Promise(resolve=>releaseVerification=resolve);const started=new Promise(resolve=>startedVerification=resolve);await button().click();await started;assert.equal(await receipt().getByRole('button',{name:label('Comprobando en Gmail…','Verifying in Gmail…'),exact:true}).isEnabled(),false);await dialog().getByRole('button',{name:label('Cerrar','Close'),exact:true}).click();releaseVerification();await page.waitForLoadState('networkidle');assert.equal(await dialog().count(),0);
   await review().click();await receipt().waitFor();verification='late';verificationGate=new Promise(resolve=>releaseVerification=resolve);const accountStarted=new Promise(resolve=>startedVerification=resolve);await button().click();await accountStarted;
   user={...user,id:uid(100),app_metadata:{roles:['viewer']}};await page.evaluate(async id=>{const {supabase}=await import('/src/bidware/lib/supabase.ts');const token='eyJhbGciOiJub25lIn0.'+btoa(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+36000}))+'.fixture';const {error}=await supabase.auth.setSession({access_token:token,refresh_token:'fixture-only'});if(error)throw error;},user.id);releaseVerification();await page.waitForLoadState('networkidle');assert.equal(await page.getByText('abc123',{exact:true}).count(),0,'Another account cannot retain the previous receipt');
   assert.ok(calls.every(c=>c.action==='verify_outreach_gmail_message'||c.action==='get_outreach_message'||c.action==='get_outreach_tracking_summary'||c.action.startsWith('list_')));assert.deepEqual(external,[]);assert.deepEqual(errors,[]);return{lang,role,passed:true,verifications:verificationCount,realGoogleCalls:0};
  }finally{await context.close();}
}
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];try{const cases=process.env.RED?[['es','admin']]:[['es','admin'],['en','admin'],['es','operator'],['en','operator'],['es','viewer'],['en','viewer']];for(const args of cases){results.push(await run(browser,...args));console.log('PASS',...args);}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
