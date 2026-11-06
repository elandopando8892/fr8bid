// Public carrier route with real components; synthetic persistence and no external requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3184';
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output=path.resolve(process.env.TEST_OUTPUT||'.test-output/carrier-capture-20261006/browser');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function run(browser,scenario,mobile=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},timezoneId:'America/Mexico_City'});
 const calls=[],unexpected=[],errors=[];let fail=scenario==='error';
 const event={id:uid(1),name:'Fixture crossborder RFx',rfx_id:'RFx-FIXTURE',status:'open',bid_visibility_mode:'private'};
 const lanes=[1,2].map(n=>({rfx_lane_id:uid(n+10),rfx_event_id:event.id,invitation_token:'fixture-lane-'+n,invitation_id:uid(n+20),lane_number:n,origin:n===1?'Monterrey':'Saltillo',destination:'Dallas',equipment:"Dry Van 53'",currency:'USD',business_status:'invited',event,due_state:{status:scenario==='closed'?'closed':'no_deadline'},lane:{id:uid(n+10),lane_number:n,origin:n===1?'Monterrey':'Saltillo',destination:'Dallas',equipment:"Dry Van 53'"}}));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin)return route.continue();
  if(url.hostname!=='bidware-fixture.supabase.co'){unexpected.push(url.origin);return route.abort();}
  const body=req.postDataJSON();calls.push(body);
  if(body.action==='get_invitation'){
   if(scenario==='invalid')return route.fulfill({status:404,json:{error:'Invitation link is invalid or has expired.'}});
   return route.fulfill({json:{invitation:{rfx_event_id:event.id,rfx_events:event,rfx_lanes:lanes[0].lane},carrier_book:{carrier:{vendor_name:'Fixture carrier'},invited:lanes,open_not_invited:[]},segment_confirmations:[]}});
  }
  if(body.action==='submit_bid'){
   if(fail){fail=false;return route.fulfill({status:503,json:{error:'Synthetic temporary failure'}});}
   const lane=lanes.find(l=>l.invitation_token===body.token);assert.ok(lane);assert.equal(scenario==='closed',false);
   Object.assign(lane,body,{business_status:'quoted'});return route.fulfill({json:{saved:true}});
  }
  unexpected.push(body.action);return route.fulfill({status:501,json:{error:'Unexpected fixture action'}});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const panel=()=>page.locator('.croom-panel');
 const field=name=>panel().locator('label').filter({has:page.locator('span').filter({hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})}).locator('input,select,textarea');
 async function sendOffer(label){
  const before=calls.filter(c=>c.action==='submit_bid').length;
  await panel().getByRole('button',{name:label,exact:true}).click();
  if(scenario==='buy_sell'){
   assert.equal(await page.getByRole('dialog').count(),0);
  }else{
   const dialog=page.getByRole('dialog');
   await dialog.getByText(/5 días hábiles después de la confirmación de pago del embarcador/).waitFor();
   assert.ok((await dialog.innerText()).includes(scenario==='share'?'(4 %)':'(3 %)'));
   assert.equal(calls.filter(c=>c.action==='submit_bid').length,before);
   if(scenario==='complete'&&before===0){
    await page.screenshot({path:path.join(output,`billing-${mobile?'mobile':'desktop'}.png`),fullPage:false});
    await dialog.getByRole('button',{name:'Volver a revisar'}).click();
    assert.equal(calls.filter(c=>c.action==='submit_bid').length,0);
    await panel().getByRole('button',{name:label,exact:true}).click();
   }
   await dialog.getByRole('button',{name:'Confirmar y enviar oferta',exact:true}).click();
  }
  await page.waitForLoadState('networkidle');
 }
 async function choose(n){await page.getByRole('row').filter({hasText:n===1?'Monterrey':'Saltillo'}).click();await panel().locator('h3').filter({hasText:n===1?'Monterrey':'Saltillo'}).waitFor();await field('Tarifa all-in *').waitFor();}
 try{
  await page.goto(origin+'/bid/fixture-lane-1',{waitUntil:'networkidle',timeout:30000});
  if(scenario==='invalid'){await page.getByText('No pudimos abrir tu Bid Room').waitFor();assert.equal(calls.filter(c=>c.action==='submit_bid').length,0);return{scenario,mobile,passed:true};}
  if(scenario==='closed'){await page.getByRole('row').filter({hasText:'Monterrey'}).click();assert.equal(await panel().getByRole('button',{name:'Enviar oferta',exact:true}).count(),0);return{scenario,mobile,passed:true};}
  await choose(1);assert.equal(await field('Equipo disponible').isVisible(),false,'las condiciones empiezan plegadas');
  await field('Tarifa all-in *').fill('1200');
  if(scenario==='share'){
   await field('Modelo comercial').selectOption('carrier_share');
   await field('Share de facturación (2–5 %)').fill('4');
  }
  if(scenario==='buy_sell'){
   await field('Modelo comercial').selectOption('xbf_buy_sell');
   assert.equal(await panel().getByRole('note',{name:'Condición de facturación'}).count(),0);
  }
  const summary=page.getByRole('region',{name:'Revisión de información de la oferta'});
  assert.ok((await summary.innerText()).includes('capacidad'));
  if(['complete','error'].includes(scenario)){
   await panel().locator('summary').click();
   for(const [name,value] of [['Capacidad/sem','4'],['Tránsito (días)','2'],['Vigente hasta','2099-12-31'],['Ubicación actual de la unidad','Monterrey'],['Vacío al origen','0'],['Detalle de la unidad','Unidad controlada 2026'],['ETA de recolección','2099-06-01T10:00'],['ETA de entrega','2099-06-03T10:00'],['Notas para MARKSMAN','Condiciones controladas']])await field(name).fill(value);
   await field('Equipo disponible').selectOption('yes');await field('Unidad').selectOption('km');
   await field('Doy cuenta espejo de GPS para validar la unidad.').check();
   await field('Tengo una oferta alternativa (otro equipo o más unidades).').check();
   for(const [name,value] of [['Equipo alterno','Reefer'],['Unidades','2'],['Condiciones','Sujeto a disponibilidad']])await field(name).fill(value);
   await summary.getByText('Datos recomendados completos').waitFor();
  }
  if(scenario==='switch'){
   assert.equal(await field('Equipo disponible').isVisible(),false);await panel().locator('summary').click();await field('Equipo disponible').waitFor({state:'visible'});await choose(2);await field('Equipo disponible').waitFor({state:'hidden'});assert.equal(await field('Tarifa all-in *').inputValue(),'');assert.equal(calls.filter(c=>c.action==='submit_bid').length,0);
  }else{
   await summary.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${scenario}-${mobile?'mobile':'desktop'}.png`),fullPage:false});
   await sendOffer('Enviar oferta');
   if(scenario==='error'){
    assert.equal(await field('Detalle de la unidad').inputValue(),'Unidad controlada 2026');assert.equal(calls.filter(c=>c.action==='submit_bid').length,1);
    await sendOffer('Enviar oferta');
   }
   assert.equal(lanes[0].bid_rate,1200);
   await page.reload({waitUntil:'networkidle'});await choose(1);
   if(['complete','error'].includes(scenario)){
    assert.equal(await field('Detalle de la unidad').inputValue(),'Unidad controlada 2026');assert.equal(await field('Equipo disponible').inputValue(),'yes');assert.equal(await field('Vacío al origen').inputValue(),'0');assert.equal(await field('ETA de recolección').inputValue(),'2099-06-01T10:00');assert.equal(await field('Condiciones').inputValue(),'Sujeto a disponibilidad');
    await field('Tarifa all-in *').fill('1250');await sendOffer('Actualizar oferta');
    assert.equal(lanes[0].unit_details,'Unidad controlada 2026');assert.equal(lanes[0].bid_rate,1250);assert.equal(lanes[1].bid_rate,undefined);
   }else{assert.equal(lanes[0].weekly_capacity,null);assert.ok((await summary.innerText()).includes('capacidad'));}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  return{scenario,mobile,passed:true,syntheticWrites:calls.filter(c=>c.action==='submit_bid').length};
 }catch(e){await page.screenshot({path:path.join(output,`failure-${scenario}.png`),fullPage:true}).catch(()=>{});console.error({scenario,mobile,errors,unexpected});throw e;}finally{await context.close();}
}
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});try{const results=[];for(const scenario of ['complete','partial','error','switch','closed','invalid','share','buy_sell']){results.push(await run(browser,scenario));console.log('PASS',scenario);}results.push(await run(browser,'complete',true));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));console.log('PASS mobile');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
