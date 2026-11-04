import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startDraftLab} from './draft-preparation.lab.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {uid}=require('./batch-flow.fixture.cjs');
const lab=await startDraftLab({outName:'reconciliation-lab',reconciliation:true});
const browser=await chromium.launch({headless:true}),checks=[],external=[],errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1100}});
await context.route('**/*',route=>new URL(route.request().url()).origin===lab.origin?route.continue():(external.push(new URL(route.request().url()).origin),route.abort()));
const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
const panel=()=>page.locator('.flow-panel'),stats=()=>panel().locator('.flow-stats');
const control=async(body={})=>{const r=await fetch(lab.origin+'/control',{method:'POST',body:JSON.stringify(body)});assert.equal(r.status,200);};
const readCalls=()=>lab.result().calls.filter(c=>c.action==='preview_outreach_audience');
const compactCalls=()=>lab.result().calls.filter(c=>c.action==='list_outreach_messages'&&c.compact);
const writes=()=>lab.result().calls.filter(c=>['generate_outreach_drafts','create_outreach_campaign'].includes(c.action));
const waitForAudit=async(predicate)=>{const end=Date.now()+10000;while(!predicate()){assert.ok(Date.now()<end,'Expected synthetic audit event');await new Promise(resolve=>setTimeout(resolve,20));}};
const open=async(extra={},suffix='message',query='')=>{await control({mode:'normal',reset:true,...extra});await page.goto(`${lab.origin}/rfx/${lab.eventId}/${suffix}${query}`,{waitUntil:extra.flowMode==='hold'?'domcontentloaded':'networkidle'});await panel().waitFor();};
// Read completion is the visible complete snapshot. Another deliberately held
// obsolete request must not prevent testing the new channel's result.
const ready=async()=>{await stats().waitFor();};
const values=()=>stats().locator('dd').allTextContents();
const channel=async(label)=>{await panel().getByLabel(/^(Canal del lote|Batch channel)$/).selectOption({label});await ready();};
const noStats=async()=>{await stats().waitFor({state:'hidden'});assert.equal(await stats().count(),0);};
const manual=async()=>{await panel().getByRole('button',{name:/^(Conciliar lote|Reconcile batch)$/}).click();await ready();};
const start=async()=>{await page.locator('.launch-actions .primary').click();await page.getByRole('dialog').getByRole('button',{name:/^(Generar borradores|Generate drafts)$/}).click();};
const message=(n,vendor=1,status='drafted',chan='email')=>({id:uid(3000+n),rfx_event_id:lab.eventId,campaign_id:uid(700),vendor_id:uid(vendor),channel:chan,status,tracking_state:status,subject:`Synthetic message ${n}`,recipient_email:`carrier${vendor}@example.test`,metadata:{vendor_name:`Synthetic carrier ${vendor}`}});
async function check(name,fn){await fn();checks.push({name,passed:true,preview_reads:readCalls().length,compact_message_pages:compactCalls().length,synthetic_preparation_calls:writes().length});console.log('PASS',name);}
try{
 await check('baseline requires manual reconciliation; candidate reads the same batch on entry',async()=>{
  await open({},'message','?baseline');await page.locator('.msg-grid').waitFor();await noStats();assert.equal(readCalls().length,0);
  await manual();assert.deepEqual(await values(),['63','35','35','0','28']);await page.screenshot({path:path.join(lab.out,'baseline-message.png'),fullPage:true});
  await open();await ready();assert.deepEqual(await values(),['63','35','35','0','28']);assert.equal(readCalls().length,1);assert.equal(writes().length,0);
  await page.screenshot({path:path.join(lab.out,'automatic-message-es.png'),fullPage:true});
 });
 await check('manual refresh stays available and is one bounded sequence',async()=>{const before=readCalls().length;await manual();assert.equal(readCalls().length,before+1);assert.equal(writes().length,0)});
 await check('channel change reads only the visible channel automatically',async()=>{const before=readCalls().length;await channel('WhatsApp');assert.equal(readCalls().length,before+1);assert.equal(readCalls().at(-1).channel,'whatsapp');assert.deepEqual(await values(),['63','35','35','0','28'])});
 await check('confirmation pauses and invalidates the old cut; cancellation makes no drafts',async()=>{
  const before=writes().length;await page.locator('.launch-actions .primary').click();await page.getByRole('dialog').waitFor();await noStats();assert.equal(await panel().getByLabel('Canal del lote').isEnabled(),false);
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();await ready();assert.equal(writes().length,before);assert.equal(await panel().getByLabel('Canal del lote').inputValue(),'whatsapp');
 });
 await check('successful synthetic preparation is reconciled without a manual click',async()=>{
  await open();await ready();const before=readCalls().length;await start();await page.locator('.draft-preparation').getByText(/^Preparación completada/).waitFor();await ready();
  assert.deepEqual(await values(),['63','35','0','35','28']);assert.equal(readCalls().length,before+1);assert.equal(writes().filter(c=>c.action==='generate_outreach_drafts').length,1);
 });
 await check('failed later channel retains its receipt and reconciles visible WhatsApp once',async()=>{
  await open({mode:'failed'});await ready();await channel('WhatsApp');await page.locator('.msg-channel input').nth(1).check();const before=readCalls().length;await start();await page.locator('.draft-preparation').getByText(/^Preparación detenida/).waitFor();await ready();
  assert.match(await page.locator('.draft-preparation').innerText(),/35 preparados/);assert.deepEqual(await values(),['63','35','35','0','28']);assert.equal(readCalls().length,before+1);assert.equal(readCalls().at(-1).channel,'whatsapp');
 });
 await check('lost write response is reconciled from persisted synthetic records without retry',async()=>{
  await open({mode:'lost'});await ready();await channel('WhatsApp');await page.locator('.msg-channel input').nth(1).check();await start();await page.locator('.draft-preparation').getByText(/^Preparación detenida/).waitFor();await ready();
  assert.deepEqual(await values(),['63','35','0','35','28']);assert.match(await page.locator('.draft-preparation').innerText(),/Puede haber borradores guardados/);assert.equal(lab.data.messages.length,70);assert.equal(writes().filter(c=>c.action==='generate_outreach_drafts').length,2);
  await page.screenshot({path:path.join(lab.out,'lost-response-reconciled.png'),fullPage:true});
 });
 await check('Queue entry automatically reads the same records without repeating preparation',async()=>{
  const before=writes().length;await page.getByRole('link',{name:'Cola lab',exact:true}).click();await page.getByRole('heading',{name:'Cola de envío',exact:true}).waitFor();await ready();assert.deepEqual(await values(),['63','35','0','35','28']);assert.equal(writes().length,before);
  await page.screenshot({path:path.join(lab.out,'automatic-queue.png'),fullPage:true});
 });
 await check('reload drops the transient receipt and rereads persisted rows without writes',async()=>{
  const before=writes().length,reads=readCalls().length;await page.reload({waitUntil:'networkidle'});await ready();assert.equal(readCalls().length,reads+1);assert.deepEqual(await values(),['63','35','0','35','28']);assert.equal(writes().length,before);
 });
 await check('multiple campaigns wait for explicit selection then reconcile automatically',async()=>{
  await open({multipleCampaigns:true});await panel().getByText(/^Hay varias campañas/).waitFor();await noStats();assert.equal(readCalls().length,0);
  await panel().getByLabel('Campaña del lote').selectOption(uid(701));await ready();assert.match(await panel().innerText(),/Campaña del lote: Campaña sintética B/);assert.equal(readCalls().length,1);assert.equal(writes().length,0);
 });
 for(const mode of ['error','forbidden','missing','truncated','foreign'])await check(`${mode} read has no partial totals or automatic application retries`,async()=>{
  await open({flowMode:mode});await panel().locator('.flow-warning').first().waitFor();await page.waitForLoadState('networkidle');await noStats();const count=readCalls().length;
  assert.equal(count,1);await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});await page.waitForLoadState('networkidle');assert.equal(readCalls().length,count);assert.equal(writes().length,0);
 });
 await check('an error after a successful cut removes old totals; recovery is manual',async()=>{
  await open();await ready();await control({flowMode:'error'});await panel().getByRole('button',{name:'Conciliar lote',exact:true}).click();await noStats();await panel().getByText(/^No se pudo completar la lectura/).waitFor();
  const count=readCalls().length;await control({flowMode:'normal'});await page.waitForLoadState('networkidle');assert.equal(readCalls().length,count);await manual();assert.equal(readCalls().length,count+1);
 });
 await check('cancelled pending read cannot accept its late response or request message pages',async()=>{
  await open({flowMode:'hold'});await panel().getByRole('button',{name:'Cancelar lectura',exact:true}).waitFor();await panel().getByRole('button',{name:'Cancelar lectura',exact:true}).click();await noStats();
  await control({releaseReads:true});await page.waitForLoadState('networkidle');await noStats();assert.equal(compactCalls().length,0);assert.equal(readCalls().length,1);await manual();assert.equal(readCalls().length,2);
 });
 await check('changing channel ignores the former delayed response',async()=>{
  await open({flowMode:'hold'});await panel().getByRole('button',{name:'Cancelar lectura',exact:true}).waitFor();await control({flowMode:'normal'});await channel('WhatsApp');await control({releaseReads:true});await page.waitForLoadState('networkidle');
  assert.equal(await panel().getByLabel('Canal del lote').inputValue(),'whatsapp');assert.ok(compactCalls().every(c=>c.channels[0]==='whatsapp'));assert.equal(readCalls().length,2);
 });
 await check('changing organization ignores the pending response and leaks no old totals',async()=>{
  await open({flowMode:'hold'});await panel().getByRole('button',{name:'Cancelar lectura',exact:true}).waitFor();await page.getByRole('button',{name:'other',exact:true}).click();await control({releaseReads:true});await page.waitForLoadState('networkidle');await noStats();assert.equal(compactCalls().length,0);assert.equal(writes().length,0);
 });
 await check('changing RFx prevents old pages and old totals from being accepted',async()=>{
  await open({flowMode:'hold'});await panel().getByRole('button',{name:'Cancelar lectura',exact:true}).waitFor();await page.getByRole('link',{name:'Otro RFx lab',exact:true}).click();await control({releaseReads:true});await page.waitForLoadState('networkidle');await noStats();assert.equal(compactCalls().length,0);assert.equal(writes().length,0);
 });
 await check('Consulta reads automatically and cannot prepare',async()=>{await open();await ready();await page.getByRole('button',{name:'viewer',exact:true}).click();await waitForAudit(()=>readCalls().at(-1)?.role==='viewer');await ready();assert.equal(readCalls().at(-1).role,'viewer');assert.equal(await page.locator('.launch-actions .primary').isEnabled(),false);assert.equal(writes().length,0)});
 await check('Operator reads automatically in the same synthetic organization',async()=>{await page.getByRole('button',{name:'operator',exact:true}).click();await waitForAudit(()=>readCalls().at(-1)?.role==='operator');await ready();assert.equal(readCalls().at(-1).role,'operator');assert.equal(writes().length,0)});
 for(const identity of ['unverified','noorg'])await check(`${identity} identity does not start reconciliation`,async()=>{await open();await ready();const count=readCalls().length;await page.getByRole('button',{name:identity,exact:true}).click();await page.waitForLoadState('networkidle');await noStats();assert.equal(readCalls().length,count);assert.equal(writes().length,0)});
 await check('a first campaign is created only by synthetic preparation; subsequent read sees it',async()=>{
  await open({emptyCampaign:true});await ready();assert.match(await panel().innerText(),/sin campaña guardada/);await start();await page.locator('.draft-preparation').getByText(/^Preparación completada/).waitFor();await ready();assert.deepEqual(await values(),['63','35','0','35','28']);assert.equal(writes().filter(c=>c.action==='create_outreach_campaign').length,1);
 });
 await check('pagination beyond 250 records remains complete',async()=>{
  const messages=Array.from({length:501},(_,i)=>message(i+1,(i%35)+1));await open({messages});await ready();assert.match(await panel().innerText(),/501 registros de mensajes/);assert.deepEqual(compactCalls().map(c=>c.offset),[0,250,500]);assert.equal(writes().length,0);
 });
 await check('exception filters link to the exact existing record in the same RFx',async()=>{
  await open({messages:[message(1,1,'failed'),message(2,2,'replied')]});await ready();await panel().getByText('Ver causas y registros',{exact:true}).click();await panel().getByLabel('Filtrar por causa').selectOption('uncertain');
  const link=panel().locator(`a[href*="message=${uid(3001)}"]`);assert.equal(await link.count(),1);assert.equal(await link.getAttribute('href'),`/rfx/${lab.eventId}/delivery?message=${uid(3001)}`);
  await link.click();await page.getByRole('dialog').waitFor();assert.equal(writes().length,0);await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
 });
 await check('expiry hides the stale cut without background network calls',async()=>{
  await open();await ready();const count=readCalls().length;await page.evaluate(()=>{window.__flowRealNow=Date.now;const n=Date.now();Date.now=()=>n+300001;window.dispatchEvent(new Event('focus'));});await panel().getByText(/^La lectura venció/).waitFor();await noStats();assert.equal(readCalls().length,count);await page.evaluate(()=>{Date.now=window.__flowRealNow;});await manual();
 });
 await check('ES/EN and focus do not relaunch reconciliation; mobile layout stays inside the panel',async()=>{
  const count=readCalls().length;await page.getByRole('button',{name:'EN',exact:true}).first().click();await panel().getByText('The batch is read automatically. Reconcile checks the records again.',{exact:true}).waitFor();
  assert.doesNotMatch(await panel().innerText(),/Seleccionados|Por preparar|Consulta el estado|Con registro en Cola/);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForLoadState('networkidle');assert.equal(readCalls().length,count);
  await page.screenshot({path:path.join(lab.out,'automatic-message-en.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await panel().evaluate(el=>el.scrollWidth<=el.clientWidth),true);await panel().screenshot({path:path.join(lab.out,'automatic-mobile-en.png')});await page.setViewportSize({width:1440,height:1100});await page.getByRole('button',{name:'ES',exact:true}).first().click();
 });
 await check('two synchronous manual clicks cannot start overlapping sequences',async()=>{
  const count=readCalls().length;await panel().getByRole('button',{name:'Conciliar lote',exact:true}).evaluate(el=>{el.click();el.click();});await ready();assert.equal(readCalls().length,count+1);
 });
 await check('React StrictMode cleanup prevents obsolete mount reads from continuing',async()=>{await open({},'message','?strict');await ready();assert.equal(readCalls().length,1);assert.equal(compactCalls().length,1);assert.equal(writes().length,0)});
 await check('lab stays local and protected synthetic membership/audience inputs are unchanged',async()=>{assert.deepEqual(external,[]);assert.deepEqual(errors,[]);assert.deepEqual(lab.result().rejected,[]);assert.equal(lab.result().providerCalls,0);assert.equal(lab.result().protectedUnchanged,true);});
}catch(error){fs.writeFileSync(path.join(lab.out,`failure-${Date.now()}.json`),JSON.stringify({error:error.message,stack:error.stack,checks,external,errors,result:lab.result()},null,2));await page.screenshot({path:path.join(lab.out,`failure-${Date.now()}.png`),fullPage:true}).catch(()=>{});throw error;}
finally{fs.writeFileSync(path.join(lab.out,'browser-results.json'),JSON.stringify({checks,external,errors,result:lab.result()},null,2));await browser.close();await lab.close();}
