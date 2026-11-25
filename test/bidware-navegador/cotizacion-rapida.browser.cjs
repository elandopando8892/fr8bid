// Cotización rápida del carrier (rediseño 25-nov, prioridad 4) en un teléfono:
// hoja por ruta, «Enviar y seguir», datos copiados a las demás rutas, borrador
// que sobrevive a una recarga lenta y una confirmación encima de la hoja.
// Datos sintéticos; ninguna llamada sale de la máquina.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3300';
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const event={id:uid(1),name:'Fixture vidrio',rfx_id:'RFx-FIXTURE',status:'open',bid_visibility_mode:'anonymous_rank'};
const lanes=['Albany','Fort Worth','Houston','Trenton','Ridgeway','Windsor'].map((d,i)=>({rfx_lane_id:uid(i+10),rfx_event_id:event.id,invitation_token:'fx-'+(i+1),invitation_id:uid(i+20),lane_number:i+1,origin:'Tultitlán, MX',destination:d,equipment:"Dry Van 53'",currency:'USD',bid_rate:i===0?4350:null,business_status:i===0?'quoted':'invited',event,due_state:{status:'open'}}));
(async()=>{
 const browser=await chromium.launch();
 const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'es-MX'});
 const sent=[];let slow=false;let served=0;let slowSubmit=false;const errors=[];
 await ctx.route('**/*',async route=>{
  const u=new URL(route.request().url());
  const api=(u.origin===origin&&u.pathname==='/api/funcion')||u.hostname==='bidware-fixture.supabase.co';
  if(!api){if(u.origin===origin)return route.continue();return route.abort();}
  const body=route.request().postDataJSON()||{};
  if(body.action==='get_invitation'){
   if(slow)await new Promise(r=>setTimeout(r,2500));
   served++;
   return route.fulfill({json:{invitation:{rfx_event_id:event.id,rfx_events:event,rfx_lanes:lanes[1]},carrier_book:{carrier:{vendor_name:'Fixture'},invited:structuredClone(lanes),open_not_invited:[]},segment_confirmations:[]}});
  }
  if(body.action==='submit_bid'){if(slowSubmit)await new Promise(r=>setTimeout(r,2000));const l=lanes.find(x=>x.invitation_token===body.token);sent.push(body);Object.assign(l,{bid_rate:Number(body.bid_rate),weekly_capacity:body.weekly_capacity,business_status:'quoted'});return route.fulfill({json:{saved:true}});}
  return route.fulfill({json:{}});
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin+'/bid/fx-2',{waitUntil:'networkidle',timeout:30000});
  const sheet=page.locator('.croom-hoja');
  assert.equal(await sheet.count(),0,'sin ruta elegida no hay hoja en el teléfono');
  await page.getByRole('button',{name:'Cotizar',exact:true}).first().click();
  await sheet.getByText('Ruta 2 de 6').waitFor();
  // Tarifa, y capacidad que se copia a las demás rutas.
  await sheet.getByLabel('Tarifa all-in *').fill('2380');
  await sheet.locator('summary').click();
  await sheet.getByLabel('Capacidad/sem').fill('4');
  await sheet.getByLabel(/Usar la misma capacidad/).check();
  // La recarga después de enviar tarda: lo que se escribe en la ruta siguiente no se pierde.
  slow=true;const before=served;
  await sheet.getByRole('button',{name:'Enviar y seguir con la ruta 3'}).click();
  await sheet.getByText('Ruta 3 de 6').waitFor();
  await sheet.getByLabel('Tarifa all-in *').fill('3590');
  assert.equal(served,before,'la recarga sigue en camino mientras se escribe');
  await page.waitForFunction(()=>true);for(let i=0;i<50&&served===before;i++)await page.waitForTimeout(100);
  assert.ok(served>before,'la recarga llegó');await page.waitForTimeout(400);
  assert.equal(await sheet.getByLabel('Tarifa all-in *').inputValue(),'3590','la recarga no borra la tarifa a medio escribir');
  slow=false;
  await sheet.locator('summary').click();
  assert.equal(await sheet.getByLabel('Capacidad/sem').inputValue(),'4','la capacidad llega copiada');
  // «No participo» abre una confirmación sobre la hoja: Escape la cierra a ella, no a la hoja.
  await sheet.getByRole('button',{name:'No participo en esta ruta'}).click();
  const dialog=page.getByRole('dialog').filter({hasNot:page.locator('.croom-panel')}).last();
  await page.waitForTimeout(200);
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(()=>!document.querySelector('.croom-hoja').contains(document.activeElement)),'Tab se queda en la confirmación');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.equal(await sheet.count(),1,'Escape en la confirmación no cierra la hoja');
  // Envíos seguidos con la recarga lenta: la ruta enviada no vuelve a ofrecerse.
  slow=true;
  await sheet.getByRole('button',{name:'Enviar y seguir con la ruta 4'}).click();
  await sheet.getByText('Ruta 4 de 6').waitFor();
  await sheet.getByLabel('Tarifa all-in *').fill('2950');
  await sheet.getByRole('button',{name:'Enviar y seguir con la ruta 5'}).click();
  await sheet.getByText('Ruta 5 de 6').waitFor();
  await sheet.getByLabel('Tarifa all-in *').fill('3100');
  await sheet.getByRole('button',{name:'Enviar y seguir con la ruta 6'}).click();
  await sheet.getByText('Ruta 6 de 6').waitFor();
  assert.equal(await sheet.getByRole('button',{name:/Enviar y seguir/}).count(),0,'sin rutas pendientes no promete otra');
  // Cerrar la hoja mientras la oferta se envía: la respuesta tardía no la vuelve a abrir.
  slow=false;slowSubmit=true;
  await sheet.getByLabel('Tarifa all-in *').fill('2800');
  await sheet.getByRole('button',{name:'Enviar oferta',exact:true}).click();
  await page.getByRole('button',{name:'Cerrar'}).click();
  await page.waitForTimeout(2600);
  assert.equal(await sheet.count(),0,'la hoja cerrada sigue cerrada al terminar el envío');
  assert.deepEqual(sent.map(s=>[s.token,Number(s.bid_rate),String(s.weekly_capacity)]),[['fx-2',2380,'4'],['fx-3',3590,'4'],['fx-4',2950,'4'],['fx-5',3100,'4'],['fx-6',2800,'4']]);
  await page.getByRole('button',{name:/Cotizar rutas · 6\/6/}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('ok cotizacion-rapida: hoja, enviar y seguir, copiar a mis rutas, recarga lenta y confirmación encima');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
