const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3197';
assert.match(origin,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output=path.resolve(process.env.TEST_OUTPUT||'.test-output/hdships-browser');fs.mkdirSync(output,{recursive:true});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function run(browser,lang,role){
 const user={id:id(1),email:'fixture@heymarksman.com',app_metadata:{roles:[role]}};
 const event={id:id(2),rfx_id:'RFx-FIXTURE',name:'Fixture event',status:'open',currency:'USD',due_date:'2099-10-15'};
 const offer={id:id(3),vendor_id:id(4),invitation_status:'quoted',vendors:{vendor_name:'Fixture Carrier'},bid_rate:1800,currency:'USD',commercial_model:'sell_share',carrier_share_pct:3,weekly_capacity:5,transit_days:2,valid_through:'2099-10-20',equipment_available:true,current_unit_location:'Test yard',deadhead_distance:0,deadhead_distance_unit:'mi',unit_details:'Test unit',eta_pickup:'2099-10-08T09:00:00Z',eta_delivery:'2099-10-10T09:00:00Z',mirror_account_enabled:false,best_alternative_offered:true,alternative_equipment:'Dry Van',alternative_units:2,alternative_notes:'Test alternative',notes:'Test offer note',response_source:'carrier_portal',responded_at:'2026-10-07T10:00:00Z',outreach_sent_at:'2026-10-06T10:00:00Z'};
 // Canonical storage contract used by submit_bid/list_rfx_detail.
 delete offer.deadhead_distance_unit;
 offer.deadhead_unit=role==='viewer'?'km':'mi';
 if(role==='viewer')offer.commercial_model='brokerage';
 const lane={id:id(5),rfx_event_id:event.id,origin:'Origin fixture',destination:'Destination fixture',equipment:'Truck Trailer',trailer:'Dry Van',operation:'D2D Export',service:'One Way',weekly_volume:5,invitations:[offer],invitation_count:1,bid_count:1};
 const rows=['queued','sending','sent','drafted'].map((status,i)=>({id:id(10+i),rfx_event_id:event.id,vendor_id:id(4),channel:'email',recipient_email:'fixture@example.test',status,subject:'Fixture '+status,metadata:{vendor_name:'Carrier '+status},...(status==='queued'?{delivery_error:'Quota exceeded',failed_at:'2026-10-06T10:00:00Z'}:{}),...(status==='sent'?{sent_at:'2026-10-07T10:00:00Z',provider_message_id:'synthetic-receipt'}:{})}));
 const calls=[],unknown=[],errors=[];
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:role==='viewer'?'America/Los_Angeles':'UTC'});
 await ctx.addInitScript(({user,lang})=>{localStorage.setItem('bidware.team.lang',lang);localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+86400*365*100,token_type:'bearer'}));},{user,lang});
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin)return route.continue();
  if(url.hostname!=='bidware-fixture.supabase.co'){unknown.push(url.origin);return route.abort();}
  if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
  const input=req.postDataJSON();if(!input){unknown.push(url.pathname);return route.abort();}calls.push(input);
  const responses={
   list_rfx_detail:{event,lanes:[lane]},event_origins:{origins:{[event.id]:'manual'},folios:{}},
   list_rfx_segment_confirmations:{rows:[{rfx_lane_vendor_id:offer.id,vendor_id:offer.vendor_id,segment_key:'d2d-export-one-way-truck-trailer-dry-van',rubric_key:'logistics_model',answer:'exception',comment:'Latest exception',updated_at:'2026-10-07T10:00:00Z'},{rfx_lane_vendor_id:offer.id,rubric_key:'logistics_model',answer:'agree',updated_at:'2026-10-06T10:00:00Z'}]},
   list_contact_history:{rows:[{occurred_at:offer.responded_at,metadata:{rfx_lane_vendor_id:offer.id,best_final:true}}]},
   list_bid_room_chat:{rows:[]},list_rfx_invitation_wave_reviews:{rows:[]},
   get_outreach_tracking_summary:{total:4,states:{queued:1,sending:1,sent:1,drafted:1}},
   list_outreach_messages:{rows:input.tracking_status?rows.filter(r=>r.status===input.tracking_status):rows,total:input.tracking_status?rows.filter(r=>r.status===input.tracking_status).length:4,has_more:false},
   get_outreach_message:{row:input.rfx_event_id===event.id?rows.find(r=>r.id===input.id)||null:null},
   draft_bid_room_carrier_message:{draft_only:true,outreach_message:rows[3],reused:false},
  };
  if(!(input.action in responses)){unknown.push(input.action);return route.fulfill({status:501,json:{error:'Unexpected fixture action'}});}
  return route.fulfill({json:responses[input.action]});
 });
 const page=await ctx.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 const text=(es,en)=>lang==='es'?es:en;
 try{
  await page.goto(origin+'/rfx/'+event.id+'/detalle',{waitUntil:'networkidle'});
  assert.equal(await page.getByText(text('PUJAS CERRADAS POR PLAZO','BIDDING CLOSED BY DEADLINE'),{exact:true}).count(),0);
  for(const stage of ['Operate','Close']){
   await page.getByRole('button',{name:new RegExp(stage)}).first().click();
   await page.getByRole('button',{name:text('Ver detalle','View details'),exact:true}).first().click();
   const dialog=page.getByRole('dialog',{name:text('Detalle de la oferta','Offer details')});
   await dialog.getByText('Latest exception',{exact:true}).waitFor();
   for(const value of ['1800','Test unit','Test yard','Test alternative','Test offer note'])assert.ok((await dialog.innerText()).includes(value));
   assert.ok((await dialog.innerText()).includes(role==='viewer'?text('XBF compra-venta','XBF buy-sell'):text('Carrier comparte factura','Carrier shares invoice')));
   assert.equal(await dialog.locator('input,textarea,select').count(),0);
   const zero=dialog.locator('div').filter({has:page.locator('dt',{hasText:text('Distancia en vacío','Deadhead distance')})}).last();assert.match(await zero.innerText(),/0/);
   const unit=dialog.locator('div').filter({has:page.locator('dt',{hasText:text('Unidad de distancia','Distance unit')})}).last();assert.equal(await unit.locator('dd').innerText(),offer.deadhead_unit);
   await dialog.screenshot({path:path.join(output,lang+'-'+role+'-'+stage+'.png')});
   await dialog.getByRole('button',{name:text('Cerrar','Close'),exact:true}).click();
  }
  if(role==='admin'){
   await page.getByRole('button',{name:/Operate/}).first().click();
   await page.getByRole('button',{name:text('Preguntar','Ask'),exact:true}).first().click();
   await page.locator('textarea').fill('Synthetic question');
   await page.getByRole('button',{name:text('Preparar pregunta','Prepare question'),exact:true}).click();
   await page.getByRole('dialog').getByRole('button',{name:text('Continuar','Continue'),exact:true}).click();
   await page.getByRole('link',{name:text('Revisar en la Cola de envío','Review in Delivery Queue')}).click();
   await page.getByRole('dialog').getByText('Fixture drafted',{exact:false}).waitFor();
   await page.reload({waitUntil:'networkidle'});
   await page.getByRole('dialog').getByText('Fixture drafted',{exact:false}).waitFor();
   await page.getByRole('dialog').getByRole('button',{name:text('Cerrar','Close'),exact:true}).click();
  }else await page.goto(origin+'/rfx/'+event.id+'/delivery',{waitUntil:'networkidle'});
  const queued=page.getByRole('row').filter({hasText:'Carrier queued'});
  const sending=page.getByRole('row').filter({hasText:'Carrier sending'});
  await queued.getByText(text('En cola · sin confirmación','Queued · not confirmed'),{exact:true}).waitFor();
  await sending.getByText(text('En proceso · sin confirmación','Sending · not confirmed'),{exact:true}).first().waitFor();
  assert.ok((await queued.innerText()).includes('Quota exceeded'));
  assert.ok(!(await queued.innerText()).includes(text('ENVIADO','SENT')));
  assert.equal(calls.filter(c=>/send_outreach_messages|capture|award/.test(c.action)).length,0);
  if(role==='viewer')assert.equal(calls.filter(c=>c.action==='draft_bid_room_carrier_message').length,0);
  await page.screenshot({path:path.join(output,lang+'-'+role+'-queue.png'),fullPage:true});
  event.due_date=new Date(Date.now()-172800000).toISOString().slice(0,10);
  await page.goto(origin+'/rfx/'+event.id+'/detalle',{waitUntil:'networkidle'});
  await page.getByText(text('PUJAS CERRADAS POR PLAZO','BIDDING CLOSED BY DEADLINE'),{exact:true}).waitFor();
  await page.getByText(text('EVENTO ABIERTO PARA REVISIÓN','EVENT OPEN FOR REVIEW'),{exact:true}).waitFor();
  assert.ok((await page.locator('header.identity').innerText()).includes(text('plazo de pujas vencido el','bidding deadline passed')));
  await page.setViewportSize({width:1180,height:1000});
  const summaryBox=await page.locator('header.identity > div').first().boundingBox();
  assert.ok(summaryBox&&summaryBox.width>=280,'The event summary must remain readable beside the utility actions');
  await page.screenshot({path:path.join(output,lang+'-'+role+'-expired.png')});
  await page.setViewportSize({width:390,height:844});
  for(const label of [text('PUJAS CERRADAS POR PLAZO','BIDDING CLOSED BY DEADLINE'),text('EVENTO ABIERTO PARA REVISIÓN','EVENT OPEN FOR REVIEW')]){
   const box=await page.getByText(label,{exact:true}).boundingBox();
   assert.ok(box&&box.x>=0&&box.x+box.width<=391,'Deadline status must fit the mobile viewport');
  }
  await page.screenshot({path:path.join(output,lang+'-'+role+'-expired-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  event.due_date='2099-10-15';
  await page.clock.install({time:new Date('2099-10-16T05:59:40Z')});
  await page.goto(origin+'/rfx/'+event.id+'/detalle',{waitUntil:'networkidle'});
  assert.equal(await page.getByText(text('PUJAS CERRADAS POR PLAZO','BIDDING CLOSED BY DEADLINE'),{exact:true}).count(),0);
  await page.clock.runFor(20000);
  await page.getByText(text('PUJAS CERRADAS POR PLAZO','BIDDING CLOSED BY DEADLINE'),{exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);
  return {lang,role,passed:true,commercialSends:0};
 }catch(e){console.error({lang,role,unknown,errors});await page.screenshot({path:path.join(output,lang+'-'+role+'-failure.png'),fullPage:true});throw e;}finally{await ctx.close();}
}
(async()=>{const browser=await chromium.launch({headless:true}),results=[];try{for(const lang of ['es','en'])for(const role of ['admin','viewer']){results.push(await run(browser,lang,role));console.log('PASS',lang,role);}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
