// Isolated UI/client acceptance checks; never proves a production replay.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3040';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve('.test-output/s15-replay-check');
const operation = '23c0d300-9c31-47e8-8f08-b066bc35dcab', id = '349691cf-f8ae-4f5b-aa36-e4b62b7228b1';
async function run(browser, lang, kind) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', app_metadata: { roles: [kind === 'viewer' ? 'viewer' : 'admin'] } };
  const vendor = { id, primary_email: 's15-good@example.test', tags: [], secondary_emails: [], updated_at: '2026-10-03T04:20:12.228177+00:00', profile_data: { bounced_emails: [{ email: 's15-bad@example.test', replacement_email: 's15-good@example.test', resolved_at: '2026-10-03T04:20:12.228177+00:00' }] } };
  if (kind === 'changed-before') delete vendor.profile_data.bounced_emails[0].resolved_at;
  const before = structuredClone(vendor), calls = [], unexpected = [], errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(({user,lang}) => {
    localStorage.setItem('bidware.team.lang', lang);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));
  }, {user,lang});
  let caseReads = 0;
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'bidware-fixture.supabase.co') {unexpected.push(url.origin);return route.abort();}
    if (url.pathname === '/auth/v1/user') return route.fulfill({json:kind === 'account-change' && caseReads > 0 ? {...user,id:'22222222-2222-4222-8222-222222222222'} : user});
    const body = req.postDataJSON(); calls.push(body);
    if (body.action === 'list_vendors') {
      if (body.tag) {assert.equal(body.tag,'email_bounce');return route.fulfill({json:{rows:[]}});}
      assert.deepEqual(body.ids,[id]); assert.equal(body.lightweight,false); assert.equal(body.limit,1);
      caseReads++;
      return route.fulfill({json:{rows:kind === 'missing' ? [] : [vendor]}});
    }
    if (body.action === 'replace_bounced_vendor_email') {
      assert.deepEqual(body,{action:'replace_bounced_vendor_email',id,bounced_email:'s15-bad@example.test',replacement_email:'s15-good@example.test',operation_id:operation});
      assert.notEqual(kind,'viewer');
      if (kind === 'unavailable') return route.fulfill({status:503,json:{error:'Controlled replay unavailable'}});
      const result = {row:vendor,replayed:true,operation_id:operation,bounced_email:'s15-bad@example.test',replacement_email:'s15-good@example.test'};
      if (kind === 'wrong-receipt') result.operation_id = '22222222-2222-4222-8222-222222222222';
      if (kind === 'changed-after') result.row = {...vendor,updated_at:'2099-01-01T00:00:00Z'};
      return route.fulfill({json:result});
    }
    unexpected.push(body.action); return route.fulfill({status:501,json:{error:'Unexpected fixture action'}});
  });
  const page = await ctx.newPage(); page.on('pageerror', e=>errors.push(e.message));
  const text = (es,en)=>lang==='es'?es:en;
  try {
    await page.goto(origin+'/crm/rebotes'); await page.waitForLoadState('networkidle');
    assert.equal(await page.getByRole('region',{name:text('Comprobación controlada S15','Controlled S15 check'),exact:true}).count(),0);
    assert.equal(caseReads,0);
    await page.goto(origin+'/crm/rebotes?comprobar=s15'); await page.waitForLoadState('networkidle');
    const section = page.getByRole('region',{name:text('Comprobación controlada S15','Controlled S15 check'),exact:true});
    await section.waitFor();
    const button = section.getByRole('button',{name:text('Comprobar la resolución existente','Check the existing resolution'),exact:true});
    if (kind === 'viewer') {
      assert.equal(await button.isDisabled(),true); assert.equal(caseReads,0);
    } else {
      await button.click();
      const messages = {
        success:text('Reintento reconocido; contacto y fecha de resolución sin cambios.','Replay recognized; contact and resolution date unchanged.'),
        missing:text('El caso no conserva el estado controlado esperado. No se repitió el reemplazo.','The case no longer has the expected controlled state. The replacement was not replayed.'),
        'changed-before':text('El caso no conserva el estado controlado esperado. No se repitió el reemplazo.','The case no longer has the expected controlled state. The replacement was not replayed.'),
        unavailable:'Controlled replay unavailable',
        'account-change':text('La cuenta cambió. Se detuvo la comprobación.','The account changed. The check was stopped.'),
        'wrong-receipt':text('El servidor no confirmó el mismo reintento. No se realizará otro intento automáticamente.','The server did not confirm the same replay. No further attempt will run automatically.'),
        'changed-after':text('El servidor no confirmó el mismo reintento. No se realizará otro intento automáticamente.','The server did not confirm the same replay. No further attempt will run automatically.'),
      };
      await section.getByText(messages[kind],{exact:true}).waitFor();
      if (kind==='success') {
        assert.equal(await button.isDisabled(),true);
        assert.equal(caseReads,2);
        await page.screenshot({path:path.join(output,lang+'-success.png'),fullPage:true});
        // Language changes preserve the result and cannot issue another replay.
        await page.getByRole('button',{name:lang==='es'?'EN':'ES',exact:true}).click();
        assert.equal(calls.filter(c=>c.action==='replace_bounced_vendor_email').length,1);
      }
    }
    const replays = calls.filter(c=>c.action==='replace_bounced_vendor_email');
    assert.equal(replays.length,['viewer','missing','changed-before','account-change'].includes(kind)?0:1);
    assert.deepEqual(vendor,before); assert.deepEqual(unexpected,[]); assert.deepEqual(errors,[]);
    assert(!calls.some(c=>/send|sync|update_|create_|interpret/.test(c.action)));
    return {lang,kind,caseReads,replays:replays.length,unchanged:true,productionRequests:0};
  } finally {await ctx.close();}
}
(async()=>{
  fs.mkdirSync(output,{recursive:true}); const browser=await chromium.launch({headless:true}),results=[];
  try {
    for(const lang of ['es','en']) for(const kind of process.argv.includes('--account-only') ? ['account-change'] : ['success','missing','changed-before','unavailable','wrong-receipt','changed-after','viewer','account-change']) {
      const result=await run(browser,lang,kind);results.push(result);console.log(JSON.stringify(result));
    }
    fs.writeFileSync(path.join(output,process.argv.includes('--account-only') ? 'account-result.json' : 'result.json'),JSON.stringify(results,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
