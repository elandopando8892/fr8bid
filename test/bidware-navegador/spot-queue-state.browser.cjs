// Real QuoteDesk queue + isolated APIs/auth. No production or email delivery.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3179';
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output=path.resolve('.test-output/spot-queue-state');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function setup(browser,lang){
  let user={id:uid(99),email:'fixture@heymarksman.com',app_metadata:{roles:['operator']}};
  let failRead=false,holdRead=null,holdSend=null;
  const calls=[],errors=[],unexpected=[];
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({user,lang})=>{
    if(window.top!==window.self)return;
    localStorage.setItem('bidware.team.lang',lang);
    localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));
  },{user,lang});
  const message=(actor,quoteId)=>({id:uid(actor==='A'?2:4),status:'drafted',recipient_email:'controlled@example.test',subject:`Fixture private quote ${actor}`,html_body:`<p>Fixture quote ${actor}</p>`,text_body:`Fixture quote ${actor}`,receipt:null,metadata:{quote_id:quoteId,checksum:'fixture-checksum',from:'sales@heymarksman.com',cc:[],note:null,contact_name:null}});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin)return route.continue();
    if(url.hostname!=='bidware-fixture.supabase.co'){unexpected.push(url.origin);return route.abort();}
    if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
    const input=request.postDataJSON(),actor=user.id===uid(99)?'A':'B';calls.push({...input,actor});
    if(input.action==='list_quote_queue'){
      const result={quote:{id:input.quote_id,folio:`QD-${actor}`,status:'estimating'},rows:[message(actor,input.quote_id)],total:1};
      const wait=holdRead;holdRead=null;if(wait){wait.started.resolve();await wait.gate.promise;}
      if(failRead){failRead=false;return route.fulfill({status:503,json:{error:'Fixture queue unavailable'}});}
      return route.fulfill({json:result});
    }
    if(input.action==='send_quote_queue_message'){
      const wait=holdSend;holdSend=null;if(wait){wait.started.resolve();await wait.gate.promise;}
      return route.fulfill({json:{message:{...message(actor,input.quote_id),status:'sent'},duplicate:false}});
    }
    unexpected.push(input.action);return route.fulfill({status:501,json:{error:'Unexpected isolated action'}});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const text=(es,en)=>lang==='es'?es:en;
  const prepared=()=>page.getByRole('dialog',{name:text('Cotización preparada','Prepared quote'),exact:true});
  const row=actor=>page.getByRole('row').filter({hasText:`Fixture private quote ${actor}`});
  async function open(){await page.goto(`${origin}/quotedesk/${uid(1)}/delivery`,{waitUntil:'domcontentloaded',timeout:30000});await row('A').waitFor();await page.locator('.sidebar-role').filter({hasText:text('Operador','Operator')}).waitFor();await page.waitForLoadState('networkidle');}
  async function confirm(){await page.getByRole('button',{name:text('Revisar','Review'),exact:true}).click();await prepared().getByRole('button',{name:text('Aprobar y enviar','Approve and send'),exact:true}).click();await page.getByRole('dialog').first().waitFor();}
  async function change(kind,settle=true){
    if(kind==='quote'){
      await page.evaluate(id=>{history.pushState({},'',`/quotedesk/${id}/delivery`);dispatchEvent(new PopStateEvent('popstate'));},uid(10));
    }else{
      user={...user,id:kind==='account'?uid(100):uid(99),app_metadata:{roles:[kind==='role'?'viewer':'operator']}};
      await page.evaluate(async id=>{const {supabase}=await import('/src/bidware/lib/supabase.ts');const token=`eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+36000}))}.fixture`;const {error}=await supabase.auth.setSession({access_token:token,refresh_token:'fixture-only'});if(error)throw error;},user.id);
      await page.locator('.sidebar-role').filter({hasText:kind==='role'?text('Consulta','Viewer'):text('Operador','Operator')}).waitFor();
    }
    if(settle)await page.waitForLoadState('networkidle');
  }
  function hold(kind){const value={started:deferred(),gate:deferred()};if(kind==='read')holdRead=value;else holdSend=value;return {started:value.started.promise,release:()=>value.gate.resolve()};}
  return {page,context,text,row,prepared,open,confirm,change,hold,calls,errors,unexpected,failRead:()=>failRead=true};
}
async function run(browser,lang,scenario){
  const x=await setup(browser,lang);let held;
  try{
    await x.open();
    if(scenario==='read-error'){
      x.failRead();await x.page.getByRole('button',{name:x.text('Actualizar','Refresh'),exact:true}).click();
      await x.page.getByText(x.text('No se pudo completar la acción. Actualiza la Cola y revisa el recibo antes de reintentar.','The action could not be completed. Refresh the queue and check the receipt before retrying.'),{exact:true}).waitFor();
      assert.equal(await x.row('A').count(),0,'A failed read must not present the old quote rows');
      assert.equal(await x.page.getByText(x.text('Todavía no hay envíos preparados. Desde la cotización, usa «Preparar para la Cola».','Nothing prepared yet. From the quote, use «Prepare for the queue».'),{exact:true}).count(),0,'A read failure is not an empty quote queue');
      await x.page.screenshot({path:path.join(output,`${lang}-read-error-state.png`),fullPage:true});
      await x.page.getByRole('button',{name:x.text('Actualizar','Refresh'),exact:true}).click();await x.row('A').waitFor();
    }else if(['role','account','quote'].includes(scenario)){
      await x.confirm();await x.change(scenario);
      assert.equal(await x.prepared().count(),0,'Discard the old quote dialog when its identity/role/quote scope changes');
      await x.page.getByRole('dialog').first().getByRole('button',{name:x.text('Aprobar y enviar','Approve and send'),exact:true}).click();
      await x.page.waitForLoadState('networkidle');
      assert.equal(x.calls.filter(c=>c.action==='send_quote_queue_message').length,0,'An old confirmation cannot submit a quote in a new scope');
    }else if(scenario==='late-read'){
      held=x.hold('read');await x.page.getByRole('button',{name:x.text('Actualizar','Refresh'),exact:true}).click();await held.started;
      await x.change('account',false);await x.row('B').waitFor();held.release();await x.page.waitForLoadState('networkidle');
      assert.equal(await x.row('A').count(),0);await x.row('B').waitFor();
    }else if(scenario==='late-send'){
      held=x.hold('send');await x.confirm();await x.page.getByRole('dialog').first().getByRole('button',{name:x.text('Aprobar y enviar','Approve and send'),exact:true}).click();await held.started;
      await x.change('account',false);await x.row('B').waitFor();
      assert.equal(await x.page.getByRole('button',{name:x.text('Revisar','Review'),exact:true}).isEnabled(),true,'An old account request must not hold the new account UI busy');
      held.release();await x.page.waitForLoadState('networkidle');
      assert.equal(await x.page.getByText(x.text('Envío registrado. El recibo está en la Cola.','Send recorded. The receipt is in the queue.'),{exact:true}).count(),0);
      assert.equal(x.calls.filter(c=>c.action==='send_quote_queue_message').length,1,'Do not restart an already submitted fixture send');
    }
    assert.deepEqual(x.errors,[]);assert.deepEqual(x.unexpected,[]);
    await x.page.screenshot({path:path.join(output,`${lang}-${scenario}.png`),fullPage:true});
    return {lang,scenario,fixtureSends:x.calls.filter(c=>c.action==='send_quote_queue_message').length,productionRequests:0};
  }finally{held?.release();await x.context.close();}
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});
  try{const results=[];const scenarios=['read-error','role','account','quote','late-read','late-send'].filter(s=>!process.argv[2]||process.argv[2]===s);assert(scenarios.length);for(const lang of ['es','en'])for(const scenario of scenarios)results.push(await run(browser,lang,scenario));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
