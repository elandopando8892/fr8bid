// Real UI/services, isolated API fixtures. No production, Gmail or PostgreSQL certification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3217';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/gmail-diagnosis-20261007/browser');
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
  const compact = { id: uid(2), rfx_event_id: event.id, vendor_id: uid(3), channel: 'email', status: 'drafted', subject: 'Stored fixture subject', recipient_email: 'controlled@example.test', vendors: { vendor_name: 'Fixture carrier' } };
  const persisted = { ...compact, sender_email: 'sender@example.test', text_body: '<b>Literal stored text</b>', html_body: `<h2>Stored D2D Export / One Way</h2><script>parent.__reviewExecuted=true;fetch('https://blocked.example.test/script')</script><img src="https://blocked.example.test/image"><a href="https://blocked.example.test/link">Private fixture link</a><form action="https://blocked.example.test/form"><button>Submit</button></form>` };
  let mode = 'html', pendingResolve, startedResolve, lateGate;
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
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', e => {
    // Playwright's serviceWorkers:block init script probes this property in every frame.
    if(e.message === "Failed to read the 'serviceWorker' property from 'Navigator': Service worker is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag.") return;
    errors.push(e.message);
  });
  const url = `${origin}/rfx/${event.id}/delivery`;
  const review = () => page.getByRole('button', { name: lang === 'es' ? 'Revisar mensaje' : 'Review message', exact: true });
  const dialog = () => page.getByRole('dialog', { name: lang === 'es' ? 'Mensaje guardado' : 'Stored message' });
  const close = () => dialog().getByRole('button', { name: lang === 'es' ? 'Cerrar' : 'Close', exact: true }).click();
  await page.goto(url, { waitUntil: 'domcontentloaded' }); await review().waitFor();
  assert.equal(await page.getByText('Fixture carrier', { exact: true }).count(), 1);
  await review().click(); await dialog().getByText(/sender@example.test/).waitFor();
  assert.equal(await dialog().getByRole('button').count(), 1, 'Review has only Close, never send');
  const frame = dialog().locator('iframe');
  assert.equal(await frame.getAttribute('sandbox'), '');
  assert.equal(await frame.getAttribute('inert'), '');
  assert.equal(await frame.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await frame.contentFrame().getByText('Stored D2D Export / One Way').waitFor();
  assert.equal(await page.evaluate(() => window.__reviewExecuted), undefined);
  assert.deepEqual(external, []);
  await page.screenshot({ path: path.join(output, `${lang}-${role}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await dialog().evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.screenshot({ path: path.join(output, `${lang}-${role}-mobile.png`), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => { const l = await import('/src/bidware/i18n/language.ts'); l.setLang(l.getLang() === 'es' ? 'en' : 'es'); });
  lang = lang === 'es' ? 'en' : 'es';
  await dialog().waitFor(); await dialog().locator('iframe').contentFrame().getByText('Stored D2D Export / One Way').waitFor();
  await close();
  const initial={...persisted};
  const cases=[
   ['precondition',{status:'queued',delivery_error:'Precondition check failed.',send_result:{stage:'manual_status'}},'El proveedor rechazó una condición previa.','The provider rejected a precondition.'],
   ['historical',{status:'queued',delivery_error:'Precondition check failed.',delivery_issue:{status:'failed',occurred_at:'2026-10-07T00:10:00Z',error:'Precondition check failed.',http_status:400,reason_codes:['failedPrecondition']}},'Último fallo registrado','Last recorded failure'],
   ['quota',{status:'failed',delivery_error:'Daily Limit Exceeded',delivery_issue:{http_status:403,reason_codes:['dailyLimitExceeded']}},'El registro indica un límite de Gmail.','The record indicates a Gmail limit.'],
   ['authorization',{status:'failed',delivery_error:'Denied',delivery_issue:{http_status:403,reason_codes:['domainPolicy']}},'El registro indica un problema de acceso.','The record indicates an access problem.'],
   ['unknown',{status:'queued',delivery_error:'Transport lost',delivery_issue:{status:'delivery_unknown',error:'Transport lost'}},'El resultado no está confirmado.','The outcome is unconfirmed.'],
   ['accepted',{status:'sent',provider_message_id:'fixture-receipt',delivery_error:'Old error'},'Gmail devolvió un recibo.','Gmail returned a receipt.'],
   ['unavailable',{status:'queued',delivery_error:'Old error',delivery_issue_unavailable:true},'No se pudo consultar el historial de fallos.','Failure history could not be read.'],
   ['bare-403',{status:'queued',delivery_issue:{http_status:403,reason_codes:[]}},'Hay un fallo registrado.','A failure is recorded.'],
   ['manual',{status:'manual_sent',manual_sent_at:'2026-10-07T12:00:00Z'},'El envío fue marcado manualmente','Sending was marked manually'],
   ['recorded',{status:'sent',sent_at:'2026-10-07T12:00:00Z'},'Existe una marca de envío','A send is recorded']
  ];
  for(const [name,fields,es,en] of cases){
   for(const key of Object.keys(persisted))delete persisted[key];Object.assign(persisted,initial,fields);
   await review().click();const evidence=dialog().getByRole('region',{name:lang==='es'?'Evidencia de entrega':'Delivery evidence'});
   await evidence.getByText(lang==='es'?es:en,{exact:false}).waitFor();
   const step=evidence.locator('p').filter({hasText:lang==='es'?'Siguiente paso':'Next step'});
   assert.equal(await step.count(),1,'Each visible diagnostic has one localized next step');
   const text=await step.innerText();
   const link=step.getByRole('link',{name:lang==='es'?'Abrir Integraciones':'Open Integrations',exact:true});
   const linked=['precondition','historical','authorization'].includes(name);assert.equal(await link.count(),linked?1:0);if(linked)assert.equal(await link.getAttribute('href'),'/integraciones');
   if(name==='quota')assert.ok(text.includes(lang==='es'?'no confirma cuota disponible':'does not confirm available quota'));
   if(name==='unknown')assert.ok(text.includes(lang==='es'?'recargar la Cola no confirma el envío':'refreshing the queue does not confirm sending'));
   if(name==='recorded')assert.ok(text.includes(lang==='es'?'buzón del remitente':'sender mailbox'),'Missing ID does not point to an unavailable receipt checker');
   if(name==='bare-403')assert.ok(!text.match(/OAuth|domainPolicy|rateLimitExceeded/));
   const expectedButtons=[lang==='es'?'Cerrar':'Close'];
   if(name==='accepted')expectedButtons.push(lang==='es'?'Comprobar en Gmail':'Verify in Gmail');
   assert.deepEqual(await dialog().getByRole('button').allTextContents(),expectedButtons);
   if(name==='accepted')assert.equal(await dialog().getByRole('button',{name:expectedButtons[1],exact:true}).isEnabled(),role!=='viewer');
   assert.equal(calls.filter(c=>/send|mark|delete|verify_outreach_gmail_message/.test(c.action)).length,0);
   if(name==='historical'){assert.ok((await evidence.innerText()).includes('400'));await page.screenshot({path:path.join(output,lang+'-'+role+'-diagnosis.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await dialog().evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:path.join(output,lang+'-'+role+'-diagnosis-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});}
   await close();
  }
  for(const key of Object.keys(persisted))delete persisted[key];Object.assign(persisted,initial);
  mode = 'text'; await review().click(); await dialog().getByText('<b>Literal stored text</b>', { exact: true }).waitFor();
  assert.equal(await dialog().locator('iframe,b').count(), 0); await close();
  for(const next of ['missing', 'wrong-event', 'wrong-id', 'expired', 'denied']) {
    mode = next; await review().click();
    await dialog().getByText(next === 'expired' ? lang === 'es' ? 'Tu sesión venció. Inicia sesión otra vez.' : 'Your session expired. Sign in again.' : next === 'denied' ? lang === 'es' ? 'Tu cuenta no tiene permiso para esta acción.' : 'Your account does not have permission for this action.' : lang === 'es' ? 'Este mensaje ya no está disponible en el evento. Actualiza la Cola.' : 'This message is no longer available in this event. Refresh the queue.').waitFor();
    assert.equal(await dialog().locator('iframe').count(), 0); await close();
  }
  mode = 'late'; const started = new Promise(resolve => { startedResolve = resolve; });
  lateGate = new Promise(resolve => { pendingResolve = resolve; });
  await review().click(); await started; await close(); mode = 'html'; pendingResolve();
  await page.waitForLoadState('networkidle'); assert.equal(await page.getByRole('dialog').count(), 0);
  mode = 'html'; await page.reload(); await review().click(); await dialog().getByText(/sender@example.test/).waitFor();
  // Navigation invalidates a pending/visible message scope; a reload is a fresh read.
  await page.goto(`${origin}/rfx/${uid(10)}/delivery`); assert.equal(await page.getByRole('dialog').count(), 0);
  await page.goto(url); await review().click(); await dialog().getByText(/sender@example.test/).waitFor();
  await close();
  await page.goto(`${origin}/rfx/${event.id}/message`);
  const previewTitle = lang === 'es' ? 'Vista previa del correo' : 'Email preview';
  await page.frameLocator(`iframe[title="${previewTitle}"]`).getByText('Dry Van | Single | D2D Export | One Way', { exact: true }).waitFor();
  await page.goto(url); await review().click(); await dialog().getByText(/sender@example.test/).waitFor();
  user = { ...user, id: uid(100) };
  await page.evaluate(async id => {
    const { supabase } = await import('/src/bidware/lib/supabase.ts');
    const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ sub: id, exp: Math.floor(Date.now()/1000)+36000 }))}.fixture`;
    const { error } = await supabase.auth.setSession({ access_token: token, refresh_token: 'fixture-only' });
    if(error) throw error;
  }, user.id);
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.waitForLoadState('networkidle');
  assert.equal(await review().count(), 0, 'New account cannot retain the previous queue row');
  assert.equal(await page.getByText('Fixture carrier', { exact: true }).count(), 0);
  await page.evaluate(async () => { const a = await import('/src/bidware/lib/auth.ts'); await a.signOut(); });
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(calls.filter(c => /send|mark|delete|generate|record/.test(c.action)).length, 0);
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  await context.close(); return { role, accountChange: 'old review removed; foreign message hidden', reads: calls.filter(c => c.action === 'get_outreach_message').length, sampleVariables: 'trailer/config/operation/service', writes: 0, externalRequests: 0 };
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ headless: true });
  try { const results = []; for(const lang of ['es','en']) results.push(await run(browser,lang)); results.push(await run(browser,'en','viewer')); fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2)); console.log(JSON.stringify({ passed:true,results,output })); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
