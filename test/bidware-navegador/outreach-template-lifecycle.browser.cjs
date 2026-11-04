/* Local UI/service acceptance. Stateful API fixtures; no production or provider network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3040';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve('.test-output/outreach-template-lifecycle');
const onlyMissing = process.argv.includes('--missing-only');
const onlyResponsive = process.argv.includes('--responsive-only');
const id = '11111111-1111-4111-8111-111111111111';
async function run(browser, lang, kind) {
  const user = { id, email: 'fixture@heymarksman.com', app_metadata: { roles: [kind === 'viewer' ? 'viewer' : 'operator'] } };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  await ctx.addInitScript(({user,lang}) => {
    if (window.top !== window.self) return;
    localStorage.setItem('bidware.team.lang', lang);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now()/1000)+36000, token_type: 'bearer' }));
  }, {user,lang});
  const system = { id: 'system-fixture', name: 'System fixture', owner_email: null, channel: 'email', subject: 'System invitation', html_body: '<p>System original</p>', active: true };
  const rows = [system];
  if (kind === 'responsive') rows.push({id:'team-fixture',name:'SPRINT 15 — CORREO CONTROLADO — 20261002',owner_email:user.email,channel:'email',subject:'PRUEBA S15 REV2 {{vendor_name}}',html_body:'<p>Controlled preview {{vendor_name}}</p>',active:true});
  const event = {id:'00000000-0000-4000-8000-000000000001',name:'Controlled RFx fixture',rfx_id:'RFx-TEST',status:'draft'};
  const stored = {id:'00000000-0000-4000-8000-000000000002',rfx_event_id:event.id,vendor_id:'00000000-0000-4000-8000-000000000003',channel:'email',status:'drafted',subject:'Stored version before edit',recipient_email:'controlled@example.test',sender_email:'sender@example.test',html_body:'<p>Stored invitation before template edit</p>',vendors:{vendor_name:'Controlled carrier'}};
  const calls = [], unexpected = [], errors = [];
  let failUpdate = true;
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/v1/user') return route.fulfill({json:user});
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({json:[]});
    const input = req.postDataJSON(); calls.push(structuredClone(input));
    let body;
    switch (input.action) {
      case 'list_outreach_templates': body = {rows}; break;
      case 'list_rfx_detail': body={event,lanes:[]}; break;
      case 'list_outreach_campaigns': body={rows:[]}; break;
      case 'list_gmail_connections': body={rows:[]}; break;
      case 'list_outreach_messages': body={rows:[stored],total:1,has_more:false}; break;
      case 'get_outreach_tracking_summary': body={total:1,drafted:1,by_status:{drafted:1},by_channel:{email:1}}; break;
      case 'list_rfx_invitation_wave_reviews': body={rows:[]}; break;
      case 'get_outreach_message': assert.equal(input.id,stored.id); assert.equal(input.rfx_event_id,event.id); body={row:stored}; break;
      case 'create_outreach_template': {
        assert.equal(user.app_metadata.roles[0], 'operator');
        const row = {...input.template, id:'team-fixture', owner_email:user.email};
        rows.push(row); body = {row}; break;
      }
      case 'update_outreach_template': {
        assert.equal(input.id, 'team-fixture');
        if (failUpdate) { failUpdate = false; return route.fulfill({status:503,json:{error:'Synthetic save rejected'}}); }
        const row = rows.find(r=>r.id===input.id); Object.assign(row,input.patch); body = {row}; break;
      }
      case 'duplicate_outreach_template': {
        const source = rows.find(r=>r.id===input.id); assert(source);
        // Copy the fields the inspected handler actually duplicates; no invented version contract.
        const row = {id:'copy-fixture',owner_email:user.email,name:source.name+' Copy',channel:source.channel,subject:source.subject,html_body:source.html_body,whatsapp_body:source.whatsapp_body,active:true,is_default:false,placeholders:source.placeholders};
        rows.push(row); body={row}; break;
      }
      default: unexpected.push(input.action); return route.fulfill({status:501,json:{error:'Unexpected fixture action'}});
    }
    return route.fulfill({json:structuredClone(body)});
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', e => {
    if (e.message === "Failed to read the 'serviceWorker' property from 'Navigator': Service worker is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag.") return;
    errors.push(e.message);
  });
  const text = (es,en) => lang === 'es' ? es : en;
  const open = async url => { await page.goto(origin+url); await page.waitForLoadState('networkidle'); };
  const writes = () => calls.filter(c=>!/^(list_|get_)/.test(c.action));
  const field = (es,en) => page.getByRole('textbox',{name:text(es,en),exact:true});
  const save = () => page.getByRole('button',{name:text('Guardar','Save'),exact:true});
  const create = () => page.getByRole('button',{name:text('Crear plantilla','Create template'),exact:true});
  const viewportResults = [];
  if (kind === 'responsive') {
    for (const width of [390,320,360,768,1440]) {
      await page.setViewportSize({width,height:900});
      await open('/plantillas/team-fixture');
      await page.reload(); await page.waitForLoadState('networkidle');
      assert.equal(await field('Asunto del correo','Email subject').inputValue(),'PRUEBA S15 REV2 {{vendor_name}}');
      assert.equal(await save().isDisabled(),true);
      assert.equal(await page.locator('iframe').getAttribute('sandbox'),'');
      await page.locator('iframe').contentFrame().getByText('Controlled preview {{vendor_name}}',{exact:true}).waitFor();
      const metrics = await page.evaluate(() => ({
        viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,mainWidth:document.querySelector('main').scrollWidth,
        cards:[...document.querySelectorAll('main .card')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,top:r.top,width:r.width};}),
        controls:[...document.querySelectorAll('main input,main select,main textarea,main iframe')].map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,x:r.x,right:r.right,width:r.width,visible:r.width>0&&r.height>0};})
      }));
      viewportResults.push(metrics);
      fs.writeFileSync(path.join(output,`${lang}-responsive-${width}.json`),JSON.stringify(metrics,null,2));
      // Paint the below-fold sandboxed preview before the full-page capture.
      await page.locator('iframe').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,`${lang}-responsive-${width}.png`),fullPage:true});
      assert(metrics.documentWidth <= width+1,`${lang}/${width}: page overflows to ${metrics.documentWidth}`);
      for (const item of [...metrics.cards,...metrics.controls]) {
        assert(item.x>=-1 && item.right<=width+1,`${lang}/${width}: control or card is clipped`);
        assert(item.width>0);
      }
      assert(metrics.controls.every(item=>item.visible),'Editor controls and preview remain visible');
      assert.equal(metrics.cards.length,2);
      if(width===1440) assert(Math.abs(metrics.cards[0].top-metrics.cards[1].top)<1,'Desktop keeps two columns');
      assert.equal(writes().length,0,'Responsive readback must not write');
    }
  } else if (kind === 'missing') {
    await open('/plantillas/missing-fixture');
    const expected = text('No existe una plantilla activa con ese id (puede estar archivada o borrada).','No active template exists with this ID (it may be archived or deleted).');
    assert((await page.locator('main').last().innerText()).includes(expected), 'Missing template error must match the team language');
    assert.equal(writes().length,0);
  } else if (kind === 'viewer') {
    await open('/plantillas/nueva');
    assert.equal(await create().count(),0);
    assert.equal(await field('Nombre','Name').isDisabled(),true);
    await open('/plantillas/system-fixture');
    assert.equal(await save().count(),0); assert.equal(writes().length,0);
  } else {
    await open('/plantillas/nueva');
    await create().click(); await page.waitForLoadState('networkidle');
    assert.equal(writes().length,0,'Validation must not create a partial template');
    await field('Nombre','Name').fill('Controlled email fixture');
    await page.getByRole('combobox').selectOption('email');
    await field('Asunto del correo','Email subject').fill('Invitation {{rfx_id}}');
    await field('Cuerpo del correo (HTML)','Email body (HTML)').fill('<p>Hello {{vendor_name}}</p>');
    await create().click(); await page.waitForURL('**/plantillas/team-fixture');
    await field('Nombre','Name').waitFor();
    assert.equal(rows.length,2); assert.equal(writes().length,1);
    await page.reload(); await page.waitForLoadState('networkidle');
    assert.equal(await field('Asunto del correo','Email subject').inputValue(),'Invitation {{rfx_id}}');
    const base = rows.find(r=>r.id==='team-fixture');
    // Existing non-editor metadata must survive an edit, not be silently reset by the service.
    Object.assign(base,{is_default:true,template_scope:'canonical',canonical_language:'en',meta_template_name:'fixture-meta',meta_template_language:'en_US',meta_template_status:'APPROVED',meta_template_components:[{type:'BODY',text:'fixture'}],whatsapp_group_body:'Keep separate {{group_name}}'});
    await page.reload(); await page.waitForLoadState('networkidle');
    const edited = '<p>Updated {{vendor_name}} for {{rfx_id}}</p>';
    fs.writeFileSync(path.join(output,`${lang}-edit-before.txt`),await page.locator('body').innerText());
    await field('Cuerpo del correo (HTML)','Email body (HTML)').fill(edited);
    await save().click(); await page.getByText(/Synthetic save rejected/).waitFor();
    assert.equal(await field('Cuerpo del correo (HTML)','Email body (HTML)').inputValue(),edited);
    assert.equal(base.html_body,'<p>Hello {{vendor_name}}</p>','Rejected save must not be mistaken for persisted data');
    await save().click(); await page.getByText(text('Plantilla guardada. Los borradores que se generen desde ahora la usan; los ya generados no cambian.','Template saved. Drafts generated from now on use it; existing drafts do not change.'),{exact:true}).waitFor();
    const patch = writes().at(-1).patch;
    assert.equal(patch.is_default,true); assert.equal(patch.meta_template_name,'fixture-meta');
    assert.equal(patch.canonical_language,'en'); assert.equal(patch.whatsapp_group_body,'Keep separate {{group_name}}');
    assert.deepEqual(patch.meta_template_components,[{type:'BODY',text:'fixture'}]);
    assert.deepEqual([...patch.placeholders].sort(),['group_name','rfx_id','vendor_name']);
    await page.reload(); await page.waitForLoadState('networkidle');
    assert.equal(await field('Cuerpo del correo (HTML)','Email body (HTML)').inputValue(),edited);
    const preview = page.locator('iframe'); assert.equal(await preview.getAttribute('sandbox'),'');
    await preview.contentFrame().getByText('Updated {{vendor_name}} for {{rfx_id}}',{exact:true}).waitFor();
    await page.getByRole('button',{name:text('← Plantillas','← Templates'),exact:true}).click();
    const row = page.getByRole('row').filter({hasText:'Controlled email fixture'});
    await row.getByRole('button',{name:text('Duplicar','Duplicate'),exact:true}).click();
    await page.waitForURL('**/plantillas/copy-fixture'); await field('Nombre','Name').waitFor();
    assert.equal(await field('Nombre','Name').inputValue(),'Controlled email fixture Copy');
    assert.equal(rows.length,3); assert.equal(base.name,'Controlled email fixture'); assert.equal(base.html_body,edited);
    await page.reload(); await page.waitForLoadState('networkidle');
    assert.equal(await field('Cuerpo del correo (HTML)','Email body (HTML)').inputValue(),edited);
    await open('/plantillas/system-fixture');
    assert.equal(await save().count(),0); assert.equal(await field('Nombre','Name').isDisabled(),true);
    assert.equal(writes().length,4); // create, rejected update, successful update, duplicate
    await open(`/rfx/${event.id}/delivery`);
    await page.getByRole('button',{name:text('Revisar mensaje','Review message'),exact:true}).click();
    const reader = page.getByRole('dialog',{name:text('Mensaje guardado','Stored message')});
    await reader.locator('iframe').contentFrame().getByText('Stored invitation before template edit',{exact:true}).waitFor();
    assert((await reader.innerText()).includes('Stored version before edit'));
    assert.equal(await reader.getByRole('button').count(),1,'Stored reader only closes; it never sends');
    assert(calls.some(c=>c.action==='get_outreach_message'));
    assert.equal(base.html_body,edited);
  }
  assert.deepEqual(unexpected,[]); assert.deepEqual(errors,[]);
  assert(!calls.some(c=>/send_|publish_|generate_/.test(c.action)),'Template lifecycle must never send or publish');
  await page.screenshot({path:path.join(output,`${lang}-${kind}.png`),fullPage:true});
  const result = {lang,kind,syntheticWriteRequests:writes().length,productionRequests:0,unexpected,errors,...(kind==='responsive'?{viewportResults}: {})};
  await ctx.close(); return result;
}
(async()=>{
  fs.mkdirSync(output,{recursive:true}); const browser=await chromium.launch({headless:true});
  try { const results=[]; for (const lang of ['es','en']) for (const kind of onlyResponsive ? ['responsive'] : onlyMissing ? ['missing'] : ['lifecycle','viewer','missing']) results.push(await run(browser,lang,kind));
    fs.writeFileSync(path.join(output,onlyResponsive?'responsive-result.json':onlyMissing?'missing-result.json':'result.json'),JSON.stringify(results,null,2)); console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
