// Real queue UI, isolated mutable backend. Never reaches production or sends mail.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3178';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/queue-refresh');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

async function setup(browser, lang, scenario) {
  const user = { id: uid(99), email: 'fixture@heymarksman.com', app_metadata: { roles: ['admin'] } };
  const event = { id: uid(1), rfx_id: 'RFx-FIXTURE', name: 'Fixture queue', status: 'draft' };
  const row = { id: uid(2), rfx_event_id: event.id, vendor_id: uid(3), channel: 'email', recipient_email: 'controlled@example.test', subject: 'Fixture request', status: 'drafted', metadata: { vendor_name: 'Fixture carrier A' } };
  const second = { ...row, id: uid(4), vendor_id: uid(5), metadata: { vendor_name: 'Fixture carrier B' } };
  let phase = 0, summaryFailure = scenario === 'read-failure', nextPageRead = null;
  const summaryGate = deferred(), summaryStarted = deferred(), refreshedPage = deferred();
  const calls = [], errors = [], unexpected = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({user,lang}) => {
    localStorage.setItem('bidware.team.lang', lang);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));
  }, {user,lang});
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/v1/user') return route.fulfill({json:user});
    const input = request.postDataJSON(); calls.push(input);
    const rows = phase === 0
      ? (scenario === 'partial' ? [row, second] : [row])
      : [{ ...row, status:'sent', sent_at:'2026-10-06T12:00:00Z' }, ...(scenario === 'partial' ? [{...second,status:'failed',delivery_error:'Fixture carrier unavailable'}] : [])];
    switch (input.action) {
      case 'list_rfx_detail': return route.fulfill({json:{event,lanes:[]}});
      case 'list_rfx_invitation_wave_reviews': return route.fulfill({json:{rows:[]}});
      case 'get_outreach_tracking_summary': {
        if (phase && scenario === 'staggered') { summaryStarted.resolve(); await summaryGate.promise; }
        if (phase && summaryFailure) { summaryFailure=false; return route.fulfill({status:503,json:{error:'Fixture summary unavailable'}}); }
        return route.fulfill({json:{total:rows.length,states:phase ? {sent:1,...(scenario==='partial'?{failed:1}:{})} : {drafted:rows.length}}});
      }
      case 'list_outreach_messages': {
        const filtered = input.tracking_status ? rows.filter(r => r.status === input.tracking_status) : rows;
        await route.fulfill({json:{rows:filtered,total:filtered.length,has_more:false}});
        if(input.tracking_status!=='drafted') { nextPageRead?.resolve(); nextPageRead=null; }
        if (phase && !input.tracking_status) refreshedPage.resolve();
        return;
      }
      case 'send_outreach_messages':
        phase=1;
        return route.fulfill({json:{sent:1,failed:scenario==='partial'?1:0}});
      default: unexpected.push(input.action); return route.fulfill({status:501,json:{error:'Unexpected isolated action'}});
    }
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  const text = (es,en) => lang==='es'?es:en;
  async function open() {
    await page.goto(`${origin}/rfx/${event.id}/delivery`, {waitUntil:'domcontentloaded',timeout:30000});
    await page.getByRole('row').filter({hasText:'Fixture carrier A'}).waitFor();
    await page.locator('.sidebar-role').filter({hasText:text('Administrador','Administrator')}).waitFor();
    await page.waitForLoadState('networkidle');
    assert.deepEqual(await kpis(), [scenario==='partial'?'2':'1',scenario==='partial'?'2':'1','0','0','0','0']);
  }
  const kpis = () => page.locator('.dq-kpis strong').allTextContents();
  async function send() {
    await page.getByRole('button',{name:lang==='es'?/^Seleccionar todos los listos/:/^Select all ready/}).click();
    await page.locator('.bw header').first().getByRole('button',{name:lang==='es'?/^Aprobar y enviar \(/:/^Approve and send \(/}).click();
    await page.getByRole('dialog').getByRole('button',{name:text('Aprobar y enviar','Approve and send'),exact:true}).click();
    await refreshedPage.promise;
  }
  return {page,context,calls,errors,unexpected,text,kpis,open,send,summaryGate,summaryStarted,nextPage:()=>{nextPageRead=deferred();return nextPageRead.promise;}};
}

async function run(browser, lang, scenario) {
  const x = await setup(browser,lang,scenario);
  try {
    await x.open(); await x.send();
    if (scenario==='staggered') {
      await x.summaryStarted.promise;
      // Let the fast page response render while the summary deliberately cannot settle.
      await x.page.waitForTimeout(100);
      assert.deepEqual(await x.kpis(), ['—','—','—','—','—','—'], 'Never display pre-send counters as current while refreshing');
      assert.equal(await x.page.locator('.dq-table tbody tr').count(),0,'Do not publish only the fast half of the queue');
      assert.equal(await x.page.getByRole('button',{name:lang==='es'?/^Seleccionar todos los listos/:/^Select all ready/}).isEnabled(),false);
      assert.equal((await x.page.locator('.dq-gate').innerText()).replace(/\s+/g,' '),x.text('Compuerta de envío:','Delivery gate:')+' '+x.text('Actualizando la Cola y sus contadores…','Updating the queue and its counts…'));
      await x.page.screenshot({path:path.join(output,`${lang}-updating.png`),fullPage:true});
      x.summaryGate.resolve();
    } else if (scenario==='read-failure') {
      await x.page.getByText(/Fixture summary unavailable/).first().waitFor();
      assert.deepEqual(await x.kpis(), ['—','—','—','—','—','—'],'A failed refresh must not resurrect stale ready counters');
      assert.equal(await x.page.locator('.empty').count(),0,'A read failure is not an empty queue');
      assert.equal(await x.page.getByRole('button',{name:lang==='es'?/^Seleccionar todos los listos/:/^Select all ready/}).isEnabled(),false);
      await x.page.screenshot({path:path.join(output,`${lang}-read-error.png`),fullPage:true});
      await x.page.getByRole('button',{name:x.text('Actualizar','Refresh'),exact:true}).click();
    }
    await x.page.waitForLoadState('networkidle');
    await x.page.waitForFunction(()=>[...document.querySelectorAll('.dq-kpis strong')].length===6 && [...document.querySelectorAll('.dq-kpis strong')].every(el=>el.textContent!=='—'));
    assert.deepEqual(await x.kpis(), ['0','0','0','1','0',scenario==='partial'?'1':'0']);
    assert.equal(await x.page.locator('.dq-table tbody tr').count(),scenario==='partial'?2:1);
    assert.equal(await x.page.getByRole('button',{name:lang==='es'?/^Seleccionar todos los listos/:/^Select all ready/}).isEnabled(),false);
    assert.equal(x.calls.filter(c=>c.action==='send_outreach_messages').length,1,'Refreshing never sends again');
    const summaryReads = x.calls.filter(c=>c.action==='get_outreach_tracking_summary').length;
    const draftReads = x.calls.filter(c=>c.action==='list_outreach_messages'&&c.tracking_status==='drafted').length;
    const filteredPage=x.nextPage();
    await x.page.locator('.dq-filters select').nth(1).selectOption('sent');
    await filteredPage;
    await x.page.waitForLoadState('networkidle');
    await x.page.waitForFunction(()=>[...document.querySelectorAll('.dq-kpis strong')].every(el=>el.textContent!=='—'));
    assert.equal(x.calls.filter(c=>c.action==='get_outreach_tracking_summary').length,summaryReads,'Changing the visible state must not refetch event totals');
    assert.equal(x.calls.filter(c=>c.action==='list_outreach_messages'&&c.tracking_status==='drafted').length,draftReads,'Changing the visible state must not scan all drafts again');
    await x.page.waitForFunction(()=>[...document.querySelectorAll('.dq-kpis strong')].length===6 && [...document.querySelectorAll('.dq-kpis strong')].every(el=>el.textContent!=='—'));
    assert.deepEqual(await x.kpis(), ['0','0','0','1','0',scenario==='partial'?'1':'0']);
    const activePage=x.nextPage();
    await x.page.locator('.dq-filters select').nth(1).selectOption('');
    await activePage;
    await x.page.waitForLoadState('networkidle');
    await x.page.screenshot({path:path.join(output,`${lang}-${scenario}.png`),fullPage:true});
    await x.page.reload(); await x.page.waitForLoadState('networkidle');
    await x.page.waitForFunction(()=>[...document.querySelectorAll('.dq-kpis strong')].length===6 && [...document.querySelectorAll('.dq-kpis strong')].every(el=>el.textContent!=='—'));
    assert.deepEqual(await x.kpis(), ['0','0','0','1','0',scenario==='partial'?'1':'0']);
    assert.deepEqual(x.unexpected,[]); assert.deepEqual(x.errors,[]);
    return {lang,scenario,fixtureSends:1,productionRequests:0,counters:await x.kpis(),reload:true};
  } finally { x.summaryGate.resolve(); await x.context.close(); }
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  try {
    const results=[];
    const scenarios = ['staggered','read-failure','partial'].filter(s=>!process.argv[2]||s===process.argv[2]);
    assert(scenarios.length,'Unknown fixture scenario');
    for(const lang of ['es','en']) for(const scenario of scenarios) results.push(await run(browser,lang,scenario));
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
