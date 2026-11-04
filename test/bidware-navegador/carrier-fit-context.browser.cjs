// Real Carrier Fit / Auth / API client; synthetic boundaries, localhost only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {transform}=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3184';
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output=path.resolve(process.env.TEST_OUTPUT||'.test-output/carrier-fit-context-20261006/browser');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const productionApi=require('node:fs').readFileSync('src/bidware/lib/api-client.ts','utf8');
async function setup(browser,lang,mobile){
  let user={id:uid(99),email:'fixture@heymarksman.com',app_metadata:{roles:['operator'],permissions:['vendors:manage']}};
  const calls=[],errors=[],unexpected=[],participants=new Set(),journal=new Map();let failEvent=false,failTemplate=false,loseResult=false;
  const held=new Map();
  const actor=()=>user.id===uid(99)?'A':'B';
  const vendorId=(who,t)=>uid((who==='A'?30:40)+(t===uid(21)?1:0));
  const laneId=(who,e)=>uid((who==='A'?10:15)+(e===uid(2)?1:0));
  const template=(who,t)=>({id:t,segment_name:`Fixture template ${t===uid(20)?'1':'2'}`,template_version:1,lifecycle_status:'active',vendor_ids:[vendorId(who,t)]});
  const event=(who,e)=>({id:e,rfx_id:'RFx-FIXTURE',name:`Fixture event ${e===uid(1)?'1':'2'}`,status:'draft'});
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
  await context.addInitScript(({user,lang})=>{if(window.top!==window.self)return;localStorage.setItem('bidware.team.lang',lang);localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.only',refresh_token:'fixture',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));},{user,lang});
  const cleanApi=(await transform(productionApi,{loader:'ts',format:'esm'})).code.replace(/from "@\/([^"\n]+)"/g,(_,p)=>`from "/src/bidware/${p}.ts"`);
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin){if(url.pathname==='/src/bidware/lib/api-client.ts')return route.fulfill({contentType:'application/javascript',body:cleanApi});return route.continue();}
    if(url.hostname!=='bidware-fixture.supabase.co'){unexpected.push(url.origin);return route.abort();}
    if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
    const input=request.postDataJSON(),who=actor();calls.push({...input,actor:who});
    const gateKey=input.action+':'+(input.template_id||input.event_id||''),wait=held.get(gateKey);
    if(wait){wait.started.resolve();await wait.gate.promise;}
    const reply=json=>route.fulfill({json});
    if(input.action==='list_carrier_list_templates')return reply({rows:[template(who,uid(20)),template(who,uid(21))],total:2});
    if(input.action==='list_rfx_events')return reply({rows:[event(who,uid(1)),event(who,uid(2))]});
    if(input.action==='get_carrier_list_template'){
      if(failTemplate)return route.fulfill({status:503,json:{error:'Fixture template unavailable'}});return reply({row:template(who,input.template_id)});
    }
    if(input.action==='list_vendors')return reply({rows:(input.ids||[]).map(id=>({id,vendor_name:`Fixture carrier ${who} ${id===vendorId(who,uid(20))?'1':'2'}`,primary_email:`controlled-${who}-${id.slice(-2)}@example.test`,status:'inactive',base_stage:'prospect'}))});
    if(input.action==='list_rfx_detail'){
      if(failEvent){failEvent=false;return route.fulfill({status:503,json:{error:'Fixture event unavailable'}});}
      const e=input.event_id,l=laneId(who,e);
      return reply({event:event(who,e),lanes:[{id:l,lane_number:1,origin:`Origin ${e===uid(1)?'1':'2'}`,destination:'Fixture destination',equipment:'Dry Van',invitations:[...participants].filter(k=>k.startsWith(who+':'+l+':')).map(k=>({vendor_id:k.split(':')[2],invitation_status:'drafted'}))}]});
    }
    if(input.action==='shortlist_rfx_lane_vendors'){
      const ctx=input.carrier_template_context,key=who+':'+ctx.materialization_operation_id;
      if(input.lane_ids.some(id=>![laneId(who,uid(1)),laneId(who,uid(2))].includes(id))||input.vendor_ids.some(id=>![vendorId(who,uid(20)),vendorId(who,uid(21))].includes(id)))return route.fulfill({status:403,json:{error:'Fixture scope mismatch'}});
      if(!journal.has(key)){
        let inserted=0,already=0;
        for(const l of input.lane_ids)for(const v of input.vendor_ids){const pair=who+':'+l+':'+v;if(participants.has(pair))already++;else{participants.add(pair);inserted++;}}
        const res={result:'completed',counts:{selected:input.vendor_ids.length,confirmed:input.vendor_ids.length,inserted,already_present:already,rejected:0,pending:0},outcomes:[],materialization_operation_id:ctx.materialization_operation_id};journal.set(key,res);
      }
      if(loseResult){loseResult=false;return route.abort();}
      return reply(journal.get(key));
    }
    unexpected.push(input.action);return route.fulfill({status:501,json:{error:'Unexpected isolated action'}});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const text=(es,en)=>lang==='es'?es:en;
  const go=()=>page.locator('.fit-go button');
  const writes=()=>calls.filter(c=>c.action==='shortlist_rfx_lane_vendors');
  const open=async()=>{await page.goto(`${origin}/carrier-fit?template=${uid(20)}&event=${uid(1)}`,{waitUntil:'networkidle',timeout:30000});await page.getByText('Fixture carrier A 1',{exact:true}).waitFor();await go().waitFor();assert.equal(await go().isEnabled(),true);};
  const confirm=async()=>{await go().click();await page.getByRole('dialog').waitFor();};
  const approve=async()=>{await page.getByRole('dialog').getByRole('button',{name:text('Continuar','Continue'),exact:true}).click();await page.waitForLoadState('networkidle');};
  async function change(kind,settle=true){
    if(kind==='account'||kind==='role'){
      user={...user,id:kind==='account'?uid(100):uid(99),app_metadata:{roles:[kind==='role'?'viewer':'operator'],permissions:['vendors:manage']}};
      await page.evaluate(async id=>{const{ supabase}=await import('/src/bidware/lib/supabase.ts');const token=`eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+36000}))}.fixture`;const{error}=await supabase.auth.setSession({access_token:token,refresh_token:'fixture'});if(error)throw error;},user.id);
    }else{
      await page.evaluate(({kind,id})=>{const next=new URL(location.href);next.searchParams.set(kind,id);history.pushState({},'',next);dispatchEvent(new PopStateEvent('popstate'));},{kind,id:kind==='event'?uid(2):uid(21)});
    }
    if(settle)await page.waitForLoadState('networkidle');
  }
  function hold(action,id=''){const h={started:deferred(),gate:deferred()},key=action+':'+id;held.set(key,h);return{started:h.started.promise,release:()=>{held.delete(key);h.gate.resolve();}};}
  return{page,context,text,go,open,confirm,approve,change,hold,writes,calls,errors,unexpected,participants,failEvent:()=>failEvent=true,failTemplate:()=>failTemplate=true,loseResult:()=>loseResult=true};
}
async function run(browser,lang,scenario,mobile=false){
  const x=await setup(browser,lang,mobile);let h;
  try{
    await x.open();
    if(scenario.endsWith('-confirm')){
      await x.confirm();const kind=scenario.replace('-confirm','');await x.change(kind);await x.approve();assert.equal(x.writes().length,0,'Old confirmation must not write in a changed scope');assert.equal(await x.page.locator('.fit-next').count(),0);assert.equal(await x.page.getByText(/Reintentar con el mismo id|Retrying with the same ID/).count(),0,'Do not display an old operation failure in the new scope');
    }else if(scenario.endsWith('-loading')){
      const kind=scenario.replace('-loading','');h=x.hold(kind==='event'?'list_rfx_detail':'get_carrier_list_template',kind==='event'?uid(2):uid(21));await x.change(kind,false);await h.started;assert.equal(await x.go().count()!==0&&await x.go().isEnabled(),false,'New scope reads must settle before writing');h.release();await x.page.waitForFunction(()=>document.querySelector('.fit-go button')?.disabled===false);assert.equal(await x.go().isEnabled(),true);
    }else if(scenario==='event-read-error'){
      x.failEvent();await x.confirm();await x.approve();await x.page.getByText('Fixture event unavailable',{exact:true}).waitFor();assert.equal(await x.go().isEnabled(),false,'A failed event refresh cannot present old selection as ready');
    }else if(scenario==='template-read-error'){
      x.failTemplate();await x.change('template');await x.page.getByText('Fixture template unavailable',{exact:true}).waitFor();assert.equal(await x.page.getByText('Fixture carrier A 1',{exact:true}).count(),0,'Do not show stale template members after failure');assert.equal(await x.go().isEnabled(),false);
    }else if(scenario==='late-template'){
      h=x.hold('get_carrier_list_template',uid(21));await x.change('template',false);await h.started;
      await x.page.getByRole('combobox',{name:x.text('Lista','Template'),exact:true}).selectOption(uid(20));await x.page.getByText('Fixture carrier A 1',{exact:true}).waitFor();h.release();await x.page.waitForLoadState('networkidle');assert.equal(await x.page.getByText('Fixture carrier A 2',{exact:true}).count(),0);
    }else if(scenario==='late-materialization'){
      h=x.hold('shortlist_rfx_lane_vendors');await x.confirm();await x.page.getByRole('dialog').getByRole('button',{name:x.text('Continuar','Continue'),exact:true}).click();await h.started;await x.change('event',false);await x.page.getByText('Fixture carrier A 1',{exact:true}).waitFor();await x.page.waitForFunction(()=>document.querySelector('.fit-go button')?.disabled===false);assert.equal(await x.go().isEnabled(),true,'Old request must not keep the new scope busy');h.release();await x.page.waitForLoadState('networkidle');assert.equal(await x.page.locator('.fit-next').count(),0,'Late result must not offer next steps for another event');assert.equal(x.writes().length,1);
    }else if(scenario==='viewer'){
      await x.change('role');assert.equal(await x.go().isEnabled(),false);assert.equal(x.writes().length,0);
    }else{
      if(scenario==='retry'||scenario==='changed-selection'){
        x.loseResult();await x.confirm();await x.approve();await x.page.getByText(/Reintentar con el mismo id|Retrying with the same ID/).waitFor();assert.equal(x.writes().length,1);
        if(scenario==='changed-selection'){const checkbox=x.page.locator('.fit-table input[type=checkbox]');await checkbox.uncheck();await checkbox.check();}
      }
      await x.confirm();await x.approve();await x.page.locator('.fit-next').waitFor();
      if(scenario==='retry'||scenario==='changed-selection'){const ops=x.writes().map(c=>c.carrier_template_context.materialization_operation_id);scenario==='retry'?assert.equal(ops[0],ops[1]):assert.notEqual(ops[0],ops[1]);}
      assert.equal(x.participants.size,1,'Synthetic journal/participant set must not duplicate');
    }
    assert.deepEqual(x.errors,[]);assert.deepEqual(x.unexpected,[]);await x.page.screenshot({path:path.join(output,`${lang}-${scenario}${mobile?'-mobile':''}.png`),fullPage:true});return{lang,scenario,mobile,syntheticMaterializations:x.writes().length,productionRequests:0};
  }catch(e){fs.writeFileSync(path.join(output,`${lang}-${scenario}-failure.txt`),e.stack+'\n'+await x.page.locator('body').innerText()+'\n'+JSON.stringify({errors:x.errors,unexpected:x.unexpected,actions:x.calls.map(c=>({action:c.action,event:c.event_id,template:c.template_id}))}));throw e;}
  finally{h?.release();await x.context.close();}
}
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];try{const scenarios=['success','retry','changed-selection','template-confirm','event-confirm','account-confirm','role-confirm','event-loading','template-loading','event-read-error','template-read-error','late-template','late-materialization','viewer'].filter(s=>!process.argv[2]||s===process.argv[2]);assert(scenarios.length);for(const lang of ['es','en'])for(const scenario of scenarios){results.push(await run(browser,lang,scenario));console.log('PASS '+lang+' '+scenario);}if(!process.argv[2])for(const lang of ['es','en'])results.push(await run(browser,lang,'success',true));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length}));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
