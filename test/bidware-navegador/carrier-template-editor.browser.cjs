/* Actual editor/services; synthetic stateful APIs. No production/provider requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3040';
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output=path.resolve('.test-output/carrier-template-editor');
const onlyViewer=process.argv.includes('--viewer-only');
async function run(browser,lang,kind){
  const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@heymarksman.com',app_metadata:{roles:[kind==='viewer'?'viewer':'operator'],permissions:kind==='viewer'?[]:['vendors:manage']}};
  const ctx=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block'});
  await ctx.addInitScript(({user,lang})=>{if(window.top!==window.self)return;localStorage.setItem('bidware.team.lang',lang);localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));},{user,lang});
  const known='00000000-0000-4000-8000-000000000001',missing='00000000-0000-4000-8000-000000000002';
  const vendor={id:known,vendor_name:'Controlled carrier',primary_email:'controlled@example.test',base_stage:'procurement',status:'active'};
  const row={id:'template-fixture',segment_name:'Controlled template',description:'Original description',lifecycle_status:'active',status:'active',template_version:1,vendor_ids:[known,missing],member_count:2};
  const rows=[row],calls=[],unexpected=[],errors=[];let failUpdate=true,conflict=false;
  await ctx.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
    if(url.hostname!=='bidware-fixture.supabase.co'){unexpected.push(url.origin);return route.abort();}
    if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
    if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
    const input=req.postDataJSON();calls.push(structuredClone(input));let body;
    switch(input.action){
      case 'get_carrier_list_template':body={row};break;
      case 'list_carrier_list_templates':body={rows,total:rows.length,has_more:false};break;
      case 'list_vendors':body={rows:[vendor],total:1};break;
      case 'create_carrier_list_template':
        assert.equal(user.app_metadata.roles[0],'operator');assert(user.app_metadata.permissions.includes('vendors:manage'));assert.deepEqual(input.vendor_ids,[known]);
        rows.push({...input,id:'created-fixture',template_version:1,status:input.lifecycle_status,member_count:1});body={row:rows.at(-1)};break;
      case 'update_carrier_list_template':
        assert.equal(user.app_metadata.roles[0],'operator');assert(user.app_metadata.permissions.includes('vendors:manage'));assert.equal(input.template_id,row.id);
        assert.deepEqual([...input.vendor_ids].sort(),[known,missing]);
        if(conflict)return route.fulfill({status:409,json:{error:'Synthetic concurrent edit',code:'template_version_conflict',current_version:2}});
        assert.equal(input.expected_version,row.template_version);
        if(failUpdate){failUpdate=false;return route.fulfill({status:503,json:{error:'Synthetic temporary failure'}});}
        Object.assign(row,{segment_name:input.segment_name,description:input.description,template_version:row.template_version+1});body={row};break;
      default:unexpected.push(input.action);return route.fulfill({status:501,json:{error:'Unexpected fixture action'}});
    }return route.fulfill({json:structuredClone(body)});
  });
  const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const text=(es,en)=>lang==='es'?es:en;
  const open=async url=>{await page.goto(origin+url);await page.waitForLoadState('networkidle');};
  const name=()=>page.getByRole('textbox',{name:text('Nombre de la lista *','Template name *'),exact:true});
  const description=()=>page.getByRole('textbox',{name:text('Descripción','Description'),exact:true});
  const review=()=>page.getByRole('button',{name:text('Revisar lista','Review template'),exact:true});
  const save=()=>page.getByRole('button',{name:text('Guardar versión','Save version'),exact:true});
  const writes=()=>calls.filter(c=>!/^(list_|get_)/.test(c.action));
  try{
    if(kind==='create'){
      await open('/templates/new');await name().fill('Created controlled template');
      await page.locator('.tb-step').filter({hasText:/^2/}).click();await page.locator('.tb-list .tb-row').filter({hasText:'Controlled carrier'}).getByRole('checkbox').check();
      await page.getByRole('button',{name:text('Agregar →','Add →'),exact:true}).click();await review().click();
      await page.getByRole('button',{name:text('Crear lista','Create template'),exact:true}).click();await page.waitForURL('**/templates');
      await page.getByText('Created controlled template',{exact:true}).first().waitFor();await page.reload();await page.waitForLoadState('networkidle');
      assert(rows.some(r=>r.id==='created-fixture'));assert.equal(writes().length,1);
    }else{
      await open('/templates/template-fixture/edit');await name().waitFor();
      if(kind==='viewer'){
        await review().click();assert.equal(await save().isDisabled(),true,'Consulta must not be offered a save through the direct editor URL');assert.equal(writes().length,0);
      }else{
        await name().fill('Changed controlled template');await description().fill('Keep missing member');await review().click();
        await save().click();await page.getByText('Synthetic temporary failure',{exact:true}).waitFor();assert.equal(row.template_version,1);assert.equal(row.description,'Original description');
        await page.locator('.tb-step').filter({hasText:/^1/}).click();assert.equal(await name().inputValue(),'Changed controlled template');assert.equal(await description().inputValue(),'Keep missing member');
        await review().click();conflict=true;row.template_version=2;await save().click();await page.getByText(/Synthetic concurrent edit/).waitFor();
        assert.equal(row.segment_name,'Controlled template');assert.equal(row.template_version,2);
        await page.locator('.tb-step').filter({hasText:/^1/}).click();assert.equal(await name().inputValue(),'Changed controlled template');
        // Reload the newer version before deliberately reapplying the intended edit; never lower the server version.
        conflict=false;await page.reload();await page.waitForLoadState('networkidle');
        assert.equal(row.template_version,2);assert.equal(await name().inputValue(),'Controlled template');
        await name().fill('Changed controlled template');await description().fill('Keep missing member');
        await review().click();await save().click();await page.waitForURL('**/templates');
        assert.equal(row.template_version,3);assert.equal(row.description,'Keep missing member');assert.deepEqual(row.vendor_ids,[known,missing]);assert.equal(writes().length,3);
        await page.reload();await page.waitForLoadState('networkidle');await page.getByText('Changed controlled template',{exact:true}).first().waitFor();
      }
    }
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);assert(!calls.some(c=>/send_|shortlist_|invite_|publish_/.test(c.action)));
    await page.screenshot({path:path.join(output,`${lang}-${kind}.png`),fullPage:true});
    return {lang,kind,syntheticWriteRequests:writes().length,productionRequests:0,unexpected,errors};
  }catch(e){await page.screenshot({path:path.join(output,`${lang}-${kind}-failure.png`),fullPage:true});throw e;}
  finally{await ctx.close();}
}
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});try{const results=[];for(const lang of ['es','en'])for(const kind of onlyViewer?['viewer']:['create','edit','viewer'])results.push(await run(browser,lang,kind));fs.writeFileSync(path.join(output,onlyViewer?'viewer-result.json':'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
