// Cotización rápida en escritorio: la última ruta pendiente no se puede enviar
// dos veces mientras llega la recarga, «No participo» se ve como tal y una
// recarga fallida se explica y se puede reintentar. Datos sintéticos.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3300';
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const event={id:uid(1),name:'Fixture escritorio',rfx_id:'RFx-FIXTURE',status:'open',bid_visibility_mode:'anonymous_rank'};
const lanes=['Albany','Fort Worth','Houston'].map((d,i)=>({rfx_lane_id:uid(i+10),rfx_event_id:event.id,invitation_token:'fx-'+(i+1),invitation_id:uid(i+20),lane_number:i+1,origin:'Monterrey, NL',destination:d,equipment:"Dry Van 53'",currency:'USD',bid_rate:i===0?4350:null,business_status:i===0?'quoted':'invited',event,due_state:{status:'open'}}));
(async()=>{
 const browser=await chromium.launch();
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-MX'});
 const sent=[];let slow=false;let failReload=false;let served=0;const errors=[];
 await ctx.route('**/*',async route=>{
  const u=new URL(route.request().url());
  const api=(u.origin===origin&&u.pathname==='/api/funcion')||u.hostname==='bidware-fixture.supabase.co';
  if(!api){if(u.origin===origin)return route.continue();return route.abort();}
  const body=route.request().postDataJSON()||{};
  if(body.action==='get_invitation'){
   if(slow)await new Promise(r=>setTimeout(r,2500));
   served++;
   if(failReload){failReload=false;return route.fulfill({status:503,json:{error:'Synthetic temporary failure'}});}
   return route.fulfill({json:{invitation:{rfx_event_id:event.id,rfx_events:event,rfx_lanes:lanes[1]},carrier_book:{carrier:{vendor_name:'Fixture'},invited:structuredClone(lanes),open_not_invited:[]},segment_confirmations:[]}});
  }
  if(body.action==='submit_bid'){const l=lanes.find(x=>x.invitation_token===body.token);sent.push(body.token);Object.assign(l,{bid_rate:Number(body.bid_rate),business_status:'quoted'});return route.fulfill({json:{saved:true}});}
  if(body.action==='decline_invitation'){const l=lanes.find(x=>x.invitation_token===body.token);sent.push('no:'+body.token);Object.assign(l,{business_status:'declined'});return route.fulfill({json:{saved:true}});}
  return route.fulfill({json:{}});
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const panel=page.locator('.croom-panel');
 const row=t=>page.getByRole('row').filter({hasText:t});
 try{
  await page.goto(origin+'/bid/fx-2',{waitUntil:'networkidle',timeout:30000});
  await panel.getByText('Ruta 2 de 3').waitFor();
  // «No participo» con recarga lenta: la fila dice «No participo», no «Enviada».
  slow=true;let before=served;
  await panel.getByRole('button',{name:'No participo en esta ruta'}).click();
  await page.getByRole('dialog').getByRole('button').last().click();
  await panel.getByText('Ruta 3 de 3').waitFor();
  assert.equal(served,before,'la recarga sigue en camino');
  assert.ok((await row('Fort Worth').innerText()).includes('No participo'),'la ruta rechazada se ve como no participo');
  for(let i=0;i<50&&served===before;i++)await page.waitForTimeout(100);
  await page.waitForTimeout(300);
  // Última ruta pendiente con recarga lenta: el panel no deja enviarla otra vez.
  before=served;
  await panel.getByLabel('Tarifa all-in *').fill('3590');
  await panel.getByRole('button',{name:'Enviar oferta',exact:true}).click();
  await panel.getByText('Oferta enviada. Estamos actualizando tus rutas.').waitFor();
  assert.equal(await panel.getByRole('button',{name:/Enviar/}).count(),0,'sin botón para reenviar mientras llega la recarga');
  assert.equal(served,before);
  for(let i=0;i<50&&served===before;i++)await page.waitForTimeout(100);
  await page.waitForTimeout(300);
  assert.deepEqual(sent,['no:fx-2','fx-3']);
  // Recarga fallida después de enviar: se explica y se reintenta (Albany vuelve a estar pendiente en el servidor).
  slow=false;
  lanes[0].bid_rate=null;lanes[0].business_status='invited';
  await page.reload({waitUntil:'networkidle'});
  await panel.getByText(/Ruta \d de 3/).waitFor();
  await row('Albany').getByRole('button',{name:'Cotizar'}).click();
  await panel.getByLabel('Tarifa all-in *').fill('4200');
  failReload=true;
  await panel.getByRole('button',{name:'Enviar oferta',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'no pudimos actualizar tus rutas'}).waitFor();
  assert.ok((await row('Albany').innerText()).includes('Enviada'));
  await page.getByRole('button',{name:'Volver a cargar'}).click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('alert').filter({hasText:'no pudimos actualizar tus rutas'}).waitFor({state:'detached'});
  assert.ok((await row('Albany').innerText()).includes('Cotizada'),'tras reintentar manda el servidor');
  assert.deepEqual(errors,[]);
  console.log('ok cotizacion-rapida-escritorio: última ruta sin doble envío, no participo y recarga fallida con reintento');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
