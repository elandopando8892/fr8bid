// Local UI and isolated mutable fixtures. No production, mail or Meta calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3040';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const probe = process.argv.includes('--probe');
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/sprint10-cola');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function setup(browser, lang, mixed=false) {
  let user = { id: uid(99), email: 'fixture@heymarksman.com', app_metadata: { roles: ['admin'] } };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({user,lang}) => {
    localStorage.setItem('bidware.team.lang',lang);
    localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));
  },{user,lang});
  const calls=[],errors=[],unexpected=[];
  let held=null,heldSend=null,failSend=false;
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin) return route.continue();
    if(url.hostname!=='bidware-fixture.supabase.co'){unexpected.push(url.origin);return route.abort();}
    if(url.pathname==='/auth/v1/user') return route.fulfill({json:user});
    if(url.pathname==='/auth/v1/logout') return route.fulfill({status:204,body:''});
    const input=request.postDataJSON();calls.push({...input,fixtureUser:user.id,fixtureRole:user.app_metadata.roles[0]});
    const eventId=input.rfx_event_id||input.event_id;
    const own=user.id===uid(99)&&eventId===uid(1);
    const row={id:uid(2),rfx_event_id:uid(1),vendor_id:uid(3),channel:'email',recipient_email:'controlled@example.test',subject:'Fixture stored subject',status:'drafted',metadata:{vendor_name:'Fixture private carrier A'}};
    const ownRows=mixed?[row,{...row,id:uid(5),channel:'whatsapp',recipient_email:null,recipient_phone:'+15555550101',metadata:{vendor_name:'Fixture private carrier B'}}]:[row];
    switch(input.action){
      case 'list_rfx_detail': return route.fulfill({json:{event:{id:eventId,rfx_id:'RFX-FIXTURE',name:'Fixture RFx',status:'draft'},lanes:[]}});
      case 'get_outreach_tracking_summary': return route.fulfill({json:{total:own?ownRows.length:0,by_status:{drafted:own?ownRows.length:0}}});
      case 'list_rfx_invitation_wave_reviews':return route.fulfill({json:{rows:[]}});
      case 'list_outreach_messages':{
        const wait=held;held=null;
        if(wait){wait.started();await wait.gate;}
        return route.fulfill({json:{rows:own?ownRows:[],total:own?ownRows.length:0,has_more:false}});
      }
      case 'send_outreach_messages':
        if(heldSend){const wait=heldSend;heldSend=null;wait.started();await wait.gate;}
        if(failSend){failSend=false;return route.fulfill({status:503,json:{error:'Fixture send unavailable'}});}
        return route.fulfill({json:{sent:1,failed:0}});
      case 'send_whatsapp_outreach_messages':return route.fulfill({json:{sent:1,failed:0}});
      case 'mark_outreach_messages':return route.fulfill({json:{updated:1}});
      case 'delete_outreach_messages':return route.fulfill({json:{removed:1}});
      default:unexpected.push(input.action);return route.fulfill({status:501,json:{error:'Unexpected isolated action'}});
    }
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  const text=(es,en)=>lang==='es'?es:en;
  const row=()=>page.getByRole('row').filter({hasText:'Fixture private carrier A'});
  const send=()=>page.locator('.bw header').first().getByRole('button',{name:lang==='es'?/^Aprobar y enviar \(/:/^Approve and send \(/});
  const writes=()=>calls.filter(c=>!/^(list_|get_)/.test(c.action));
  async function change(kind,settle=true){
    if(kind==='event'){
      await page.evaluate(id=>{history.pushState({},'',`/rfx/${id}/delivery`);dispatchEvent(new PopStateEvent('popstate'));},uid(10));
    }else{
      user={...user,id:kind==='account'?uid(100):uid(99),app_metadata:{roles:[kind==='role'?'viewer':'admin']}};
      await page.evaluate(async id=>{
        const {supabase}=await import('/src/bidware/lib/supabase.ts');
        const token=`eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+36000}))}.fixture`;
        const {error}=await supabase.auth.setSession({access_token:token,refresh_token:'fixture-only'});if(error)throw error;
      },user.id);
      await page.locator('.sidebar-role').filter({hasText:kind==='role'?text('Consulta','Viewer'):text('Administrador','Administrator')}).waitFor();
    }
    if(settle) await page.waitForLoadState('networkidle');
  }
  const hold=()=>{
    let started,release;const waiting=new Promise(r=>started=r),gate=new Promise(r=>release=r);held={started,gate};return {waiting,release};
  };
  const holdSend=()=>{
    let started,release;const waiting=new Promise(r=>started=r),gate=new Promise(r=>release=r);heldSend={started,gate};return {waiting,release};
  };
  async function open(){await page.goto(`${origin}/rfx/${uid(1)}/delivery`);await row().waitFor();await page.locator('.sidebar-role').filter({hasText:text('Administrador','Administrator')}).waitFor();}
  return {page,context,text,row,send,writes,calls,errors,unexpected,change,hold,holdSend,open,failNextSend:()=>{failSend=true;}};
}
async function isolation(browser,lang,kind,action='send'){
  const x=await setup(browser,lang);await x.open();await x.row().getByRole('checkbox').check();
  if(action==='send') await x.send().click();
  else if(action==='mark') await x.page.locator('.dq-bar select').selectOption('replied');
  else await x.page.getByRole('button',{name:action==='archive'?x.text('Archivar (1)','Archive (1)'):x.text('Borrar (1)','Delete (1)'),exact:true}).click();
  await x.page.getByRole('dialog').waitFor();
  const before=x.calls.filter(c=>c.action==='list_outreach_messages').length;
  await x.change(kind);
  // The root confirmation can remain visible; its old continuation must be inert.
  await x.page.getByRole('dialog').getByRole('button',{name:action==='send'?x.text('Aprobar y enviar','Approve and send'):x.text('Continuar','Continue'),exact:true}).click();
  await x.page.waitForLoadState('networkidle');
  const result={lang,kind,action,oldRowsHidden:kind==='role'?null:await x.row().count()===0,selectedRows:await x.page.locator('.dq-table tbody input:checked').count(),freshRead:x.calls.filter(c=>c.action==='list_outreach_messages').length>before,writes:x.writes().length};
  if(probe){await x.context.close();return result;}
  if(kind!=='role') assert.equal(result.oldRowsHidden,true);
  assert.equal(result.selectedRows,0);assert.equal(result.freshRead,true);assert.equal(result.writes,0);
  assert.deepEqual(x.unexpected,[]);assert.deepEqual(x.errors,[]);
  if(action==='send') await x.page.screenshot({path:path.join(output,`${lang}-${kind}.png`),fullPage:true});
  await x.context.close();return result;
}
async function late(browser,lang){
  const x=await setup(browser,lang);await x.open();const h=x.hold();
  await x.page.getByRole('button',{name:x.text('Actualizar','Refresh'),exact:true}).click();await h.waiting;
  await x.change('account',false);h.release();await x.page.waitForLoadState('networkidle');
  assert.equal(await x.row().count(),0);assert.equal(x.writes().length,0);assert.deepEqual(x.errors,[]);assert.deepEqual(x.unexpected,[]);
  await x.context.close();return {lang,lateResponseHidden:true,writes:0};
}
async function normal(browser,lang){
  const x=await setup(browser,lang);await x.open();await x.row().getByRole('checkbox').check();
  await x.send().click();await x.page.getByRole('dialog').getByRole('button',{name:x.text('Cancelar','Cancel'),exact:true}).click();assert.equal(x.writes().length,0);
  x.failNextSend();
  await x.send().evaluate(button=>{button.click();button.click();});
  await x.page.getByRole('dialog').getByRole('button',{name:x.text('Aprobar y enviar','Approve and send'),exact:true}).click();await x.page.waitForLoadState('networkidle');
  await x.page.getByText(/Fixture send unavailable/).waitFor();assert.equal(x.writes().length,1);
  await x.send().click();await x.page.getByRole('dialog').getByRole('button',{name:x.text('Aprobar y enviar','Approve and send'),exact:true}).click();await x.page.waitForLoadState('networkidle');
  assert.equal(x.writes().length,2);assert.equal(x.writes()[0].action,'send_outreach_messages');assert.deepEqual(x.writes()[0].ids,[uid(2)]);assert.equal(x.writes()[0].confirmed,true);assert(x.writes()[0].operation_id);assert.equal(x.writes()[0].operation_id,x.writes()[1].operation_id);
  assert.deepEqual(x.errors,[]);assert.deepEqual(x.unexpected,[]);await x.context.close();return {lang,cancelWrites:0,doubleClickRequests:1,retrySameOperation:true,fixtureSendRequests:2};
}
async function betweenChannels(browser,lang){
  const x=await setup(browser,lang,true);await x.open();await x.row().getByRole('checkbox').check();
  await x.page.getByRole('row').filter({hasText:'Fixture private carrier B'}).getByRole('checkbox').check();
  const h=x.holdSend();await x.send().click();await x.page.getByRole('dialog').getByRole('button',{name:x.text('Aprobar y enviar','Approve and send'),exact:true}).click();await h.waiting;
  await x.change('account',false);await x.row().waitFor({state:'detached'});h.release();await x.page.waitForLoadState('networkidle');
  assert.equal(x.writes().length,1,'Already started email cannot be canceled; second channel must not start');
  assert.equal(x.writes()[0].action,'send_outreach_messages');assert.equal(await x.row().count(),0);assert.deepEqual(x.errors,[]);assert.deepEqual(x.unexpected,[]);
  await x.context.close();return {lang,alreadyStartedFixtureEmail:1,whatsappRequestsAfterAccountChange:0};
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});
  try{const results=[];for(const lang of ['es','en']){for(const kind of ['account','role','event'])results.push(await isolation(browser,lang,kind));if(!probe){for(const action of ['mark','archive','remove'])for(const kind of ['account','event'])results.push(await isolation(browser,lang,kind,action));results.push(await late(browser,lang));results.push(await normal(browser,lang));results.push(await betweenChannels(browser,lang));}}
    fs.writeFileSync(path.join(output,probe?'before.json':'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
    if(probe) assert(results.every(r=>(r.kind==='role'||r.oldRowsHidden)&&r.freshRead&&r.writes===0),'Baseline fails identity isolation');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
