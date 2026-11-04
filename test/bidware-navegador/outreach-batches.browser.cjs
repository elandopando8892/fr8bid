// Real UI and published API client; isolated Auth/API. No external mail or data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{transform}=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3183';
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output=path.resolve(process.env.TEST_OUTPUT||'.test-output/mail-batches-20261006/browser');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const productionApi=require('node:fs').readFileSync('src/bidware/lib/api-client.ts','utf8');
async function run(browser,lang,scenario){
 const total=scenario==='large'?301:scenario==='happy'?121:51;
 let user={id:uid(9999),email:'fixture@heymarksman.com',app_metadata:{roles:[scenario==='viewer'?'viewer':'admin']}};
 const event={id:uid(9000),rfx_id:'RFx-FIXTURE',name:'Fixture paced queue',status:'draft'};
 const rows=Array.from({length:total},(_,i)=>({id:uid(i+1),rfx_event_id:event.id,vendor_id:uid(i+1000),channel:'email',recipient_email:`fixture${i}@example.test`,status:'drafted',updated_at:scenario==='missing-version'?undefined:'2026-10-17T10:00:00.123456+00:00',subject:'Synthetic request',metadata:{vendor_name:'Fixture carrier '+i}}));
 const calls=[],errors=[],unexpected=[];
 const context=await browser.newContext({viewport:scenario==='five'?{width:390,height:844}:{width:1440,height:1000}});
 await context.addInitScript(({lang,user})=>{localStorage.setItem('bidware.team.lang',lang);localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));},{lang,user});
 const cleanApi=(await transform(productionApi,{loader:'ts',format:'esm'})).code.replace(/from "@\/([^"\n]+)"/g,(_,p)=>`from "/src/bidware/${p}.ts"`);
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin){if(url.pathname==='/src/bidware/lib/api-client.ts')return route.fulfill({contentType:'application/javascript',body:cleanApi});return route.continue();}
  if(url.hostname!=='bidware-fixture.supabase.co'){unexpected.push(url.origin);return route.abort();}
  if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
  const input=req.postDataJSON();if(!input){unexpected.push(req.method()+" "+url.pathname);return route.fulfill({status:400,json:{error:"Unexpected fixture request"}});}calls.push(input);
  switch(input.action){
   case 'list_rfx_detail':return route.fulfill({json:{event,lanes:[]}});
   case 'list_rfx_invitation_wave_reviews':return route.fulfill({json:{rows:[]}});
   case 'get_outreach_tracking_summary':return route.fulfill({json:{total,states:{drafted:rows.filter(r=>r.status==='drafted').length,sent:rows.filter(r=>r.status==='sent').length,failed:rows.filter(r=>r.status==='failed').length}}});
   case 'list_outreach_messages':{const filtered=input.tracking_status?rows.filter(r=>r.status===input.tracking_status):rows;const off=input.offset||0,limit=input.limit||100;return route.fulfill({json:{rows:filtered.slice(off,off+limit),total:filtered.length,has_more:off+limit<filtered.length}});}
   case 'send_outreach_messages':{
    assert.deepEqual(input.expected_versions.map(v=>v.id).sort(),[...input.ids].sort());assert.ok(input.expected_versions.every(v=>v.updated_at==='2026-10-17T10:00:00.123456+00:00'));assert.ok(input.ids.length<=50);assert.equal(input.confirmed,true);assert.equal(input.confirmation_action,input.action);
    if(scenario==='version')return route.fulfill({status:409,json:{error:'OUTREACH_VERSION_CONFLICT: refresh and review'}});
    const selected=rows.filter(r=>input.ids.includes(r.id));assert.ok(selected.every(r=>r.status==='drafted'),'No confirmed row is resent');
    selected.forEach(r=>{r.status='sent';r.sent_at='2026-10-06T12:00:00Z';});
    if(scenario==='partial')selected.at(-1).status='failed';
    if(scenario==='lost')return route.abort();
    return route.fulfill({json:{sent:selected.length-(scenario==='partial'?1:0),failed:scenario==='partial'?1:0}});
   }
   default:unexpected.push(input.action);return route.fulfill({status:501,json:{error:'Unexpected fixture action'}});
  }
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const text=(es,en)=>lang==='es'?es:en;
 const sends=()=>calls.filter(c=>c.action==='send_outreach_messages');
 const approve=()=>page.locator('.bw header').first().getByRole('button',{name:lang==='es'?/^Aprobar y enviar \(/:/^Approve and send \(/});
 const status=()=>page.getByRole('status').filter({hasText:lang==='es'?/Pausa de/:/Pausing/});
 try{
  await page.goto(origin+`/rfx/${event.id}/delivery`,{waitUntil:'networkidle',timeout:30000});
  await page.locator('.sidebar-role').waitFor({state:'attached'});
  await page.getByRole('button',{name:lang==='es'?/^Seleccionar todos los listos/:/^Select all ready/}).click();
  assert.match(await approve().innerText(),new RegExp(String(total)));
  if(scenario==='viewer'){assert.equal(await approve().isEnabled(),false);assert.equal(sends().length,0);return{lang,scenario,total,passed:true};}
  if(scenario==='five')await page.getByLabel(text('Pausa entre tandas','Pause between batches')).selectOption('5');
  await page.clock.install();await page.clock.pauseAt(new Date());
  await approve().click();
  if(scenario==='missing-version'){
   await page.getByText(lang==='es'?/La versión aprobada del correo/:/The approved email version/).waitFor();
   assert.equal(sends().length,0);assert.equal(await page.getByRole('dialog').count(),0);
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);return{lang,scenario,total,sends:0,passed:true};
  }
  if(scenario==='version')rows[0].updated_at='2026-10-17T10:00:00.123457+00:00';
  await page.getByRole('dialog').getByRole('button',{name:text('Aprobar y enviar','Approve and send'),exact:true}).click();
  if(scenario==='version'){
   await page.getByText(lang==='es'?/La versión aprobada del correo/:/The approved email version/).waitFor();
   await page.clock.fastForward(600000);assert.equal(sends().length,1);assert.ok(rows.every(r=>r.status==='drafted'));
   await page.screenshot({path:path.join(output,`${lang}-version-conflict.png`),fullPage:false});
  }else if(['lost','partial'].includes(scenario)){
   await page.getByText(lang==='es'?/Envío detenido:/:/Sending stopped:/).waitFor();
   await page.clock.fastForward(600000);assert.equal(sends().length,1);
  }else{
   await status().waitFor();assert.equal(sends().length,1);
   if(['happy','five'].includes(scenario)){await page.getByLabel(text("Pausa entre tandas","Pause between batches")).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${lang}-${scenario}-waiting.png`),fullPage:false});}
   if(scenario==='stop'){
    await page.getByRole('button',{name:text('Detener tandas pendientes','Stop pending batches')}).click();
    await page.clock.fastForward(1001);await page.getByText(lang==='es'?/Tandas detenidas:/:/Batches stopped:/).waitFor();
    await page.clock.fastForward(600000);assert.equal(sends().length,1);
   }else if(scenario==='reload'){
    await page.reload({waitUntil:'networkidle',timeout:30000});await page.clock.fastForward(600000);assert.equal(sends().length,1);
   }else if(scenario==='identity'){
    user={...user,id:uid(9998),app_metadata:{roles:['viewer']}};
    await page.evaluate(async id=>{const {supabase}=await import('/src/bidware/lib/supabase.ts');const token=`eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+36000}))}.fixture`;const {error}=await supabase.auth.setSession({access_token:token,refresh_token:'fixture-only'});if(error)throw error;},user.id);
    await page.locator('.sidebar-role').filter({hasText:text('Consulta','Viewer')}).waitFor({state:'attached'});
    await page.clock.fastForward(600000);assert.equal(sends().length,1);
   }else{
    const pause=scenario==='five'?300000:60000;
    for(let count=1;count<Math.ceil(total/50);count++){
     await page.clock.fastForward(pause-1);assert.equal(sends().length,count,'No early batch');
     await page.clock.fastForward(2);
     if(count+1<Math.ceil(total/50))await status().filter({hasText:text(`tanda ${count+2} de`,`batch ${count+2} of`)}).waitFor();
    }
    await page.getByText(lang==='es'?/Envío terminado:/:/Sending complete:/).waitFor();
    assert.equal(sends().length,Math.ceil(total/50));assert.equal(new Set(sends().flatMap(c=>c.ids)).size,total);
    assert.equal(new Set(sends().map(c=>c.operation_id)).size,sends().length);
   }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  return{lang,scenario,total,sends:sends().length,passed:true};
 }catch(error){console.error({lang,scenario,errors,unexpected,actions:calls.map(c=>c.action)});await page.screenshot({path:path.join(output,`${lang}-${scenario}-failure.png`),fullPage:true}).catch(()=>{});throw error;}finally{await context.close();}
}
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];try{for(const lang of ['es','en'])for(const scenario of ['happy','five','large','stop','lost','partial','identity','reload','viewer','version','missing-version']){results.push(await run(browser,lang,scenario));console.log('PASS',lang,scenario);}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
