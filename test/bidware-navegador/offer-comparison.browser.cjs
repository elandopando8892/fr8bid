const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3207';assert.match(origin,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output=path.resolve(process.env.TEST_OUTPUT||'.test-output/offer-comparison/browser');fs.mkdirSync(output,{recursive:true});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function run(browser,lang,role,mobile=false){
 const t=(es,en)=>lang==='es'?es:en,user={id:id(1),email:'fixture@heymarksman.com',app_metadata:{roles:[role]}};
 const event={id:id(2),rfx_id:'RFx-FIXTURE',name:'Comparison fixture',status:'open',currency:'USD',due_date:'2099-10-15'};
 const offer={id:id(3),vendor_id:id(4),invitation_status:'quoted',vendors:{vendor_name:'Fixture Alpha'},bid_rate:1800,currency:'USD',commercial_model:'sell_share',carrier_share_pct:3,weekly_capacity:5,transit_days:2,valid_through:'2099-10-20',equipment_available:true,current_unit_location:'Private Alpha yard',deadhead_distance:0,deadhead_unit:'mi',unit_details:'Private Alpha unit',mirror_account_enabled:false,notes:'Private Alpha note',response_source:'carrier_portal',responded_at:'2026-10-07T10:00:00Z'};
 const beta={...offer,id:id(6),vendor_id:id(7),vendors:{vendor_name:'Fixture Beta'},bid_rate:1700,commercial_model:'cost_plus',weekly_capacity:null,valid_through:'2020-01-01',equipment_available:false};
 const gamma={...offer,id:id(8),vendor_id:id(9),vendors:{vendor_name:'Fixture Gamma'},bid_rate:30000,currency:'MXN',commercial_model:'brokerage',valid_through:null};
 const missing={...offer,id:id(10),vendor_id:id(11),vendors:{vendor_name:'Fixture Missing Currency'},bid_rate:1200,currency:null,valid_through:'2099-02-31',invitation_status:'rejected'};
 const noBid={...offer,id:id(12),vendor_id:id(13),vendors:{vendor_name:'Invitation without bid'},bid_rate:null};
 const lane={id:id(5),rfx_event_id:event.id,origin:'Origin fixture',destination:'Destination fixture',equipment:'Truck Trailer',trailer:'Dry Van',operation:'D2D Export',service:'One Way',weekly_volume:5,invitations:[offer,beta,gamma,missing,noBid],invitation_count:5,bid_count:4};
 let lanes=[lane];const calls=[],unknown=[],errors=[];
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
 await ctx.addInitScript(({user,lang})=>{localStorage.setItem('bidware.team.lang',lang);localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));},{user,lang});
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
  if(url.hostname!=='bidware-fixture.supabase.co'){unknown.push(url.origin);return route.abort();}
  if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
  const input=req.postDataJSON();if(!input){unknown.push(url.pathname);return route.abort();}calls.push(input);
  const responses={list_rfx_detail:{event,lanes},event_origins:{origins:{[event.id]:'manual'},folios:{}},list_rfx_segment_confirmations:{rows:[{rfx_lane_vendor_id:offer.id,vendor_id:offer.vendor_id,segment_key:'d2d-export-one-way-truck-trailer-dry-van',rubric_key:'logistics_model',answer:'agree',comment:null,updated_at:'2026-10-06T10:00:00Z'},{rfx_lane_vendor_id:offer.id,vendor_id:offer.vendor_id,segment_key:'d2d-export-one-way-truck-trailer-dry-van',rubric_key:'logistics_model',answer:'exception',comment:'Private Alpha exception',updated_at:'2026-10-07T10:00:00Z'}]},list_contact_history:{rows:[]},list_bid_room_chat:{rows:[]},list_rfx_invitation_wave_reviews:{rows:[]}};
  if(!(input.action in responses)){unknown.push(input.action);return route.fulfill({status:501,json:{error:'Unexpected fixture action'}});}return route.fulfill({json:responses[input.action]});
 });
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.RED?4000:15000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin+'/rfx/'+event.id+'/detalle',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/Operate/}).first().click();
  await page.screenshot({path:path.join(output,`${lang}-${role}-${mobile?'mobile':'desktop'}-baseline.png`),fullPage:true});
  for(const stage of ['Operate','Close']){
   await page.getByRole('button',{name:new RegExp(stage)}).first().click();
   await page.waitForLoadState('networkidle');
   const baselineWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
   const callsBefore=calls.length;
   await page.getByRole('button',{name:t('Comparar ofertas','Compare offers'),exact:true}).first().click();
   const dialog=page.getByRole('dialog',{name:t('Comparativo de ofertas','Offer comparison'),exact:true});
   await dialog.getByText('Fixture Alpha',{exact:true}).waitFor();
   const text=await dialog.innerText();
   for(const value of ['Fixture Beta','Fixture Gamma','Fixture Missing Currency','1800','1700','30000','USD','MXN','Private Alpha exception'])assert.ok(text.toLowerCase().includes(value.toLowerCase()),value);
   assert.ok(!text.includes('Invitation without bid'));
   for(const label of [t('Vencida','Expired'),t('Sin vigencia informada','Validity not provided'),t('Vigencia inválida','Invalid validity'),t('Moneda sin informar','Currency not provided')])assert.ok(text.includes(label),label);
   assert.equal(await dialog.locator('input,textarea,select').count(),0);
   const rows=dialog.getByRole('row');
   assert.match(await rows.filter({hasText:t('Distancia en vacío','Deadhead distance')}).innerText(),/\b0\b/);
   assert.ok((await rows.filter({hasText:t('Cuenta espejo / GPS','Mirror account / GPS')}).innerText()).includes(t('No','No')));
   assert.equal(calls.length,callsBefore,'comparison must use already loaded data');
   if(mobile)assert.ok(await dialog.getByRole('table').evaluate(el=>el.parentElement.scrollWidth>el.parentElement.clientWidth),'mobile table remains horizontally scrollable');
   assert.ok(await page.evaluate(width=>document.documentElement.scrollWidth<=Math.max(innerWidth+1,width),baselineWidth),'comparison must not add page overflow');
   await dialog.screenshot({path:path.join(output,`${lang}-${role}-${mobile?'mobile':'desktop'}-${stage}.png`)});
   if(stage==='Operate'&&role==='admin'&&((lang==='es'&&!mobile)||(lang==='en'&&mobile))){await dialog.getByText('Private Alpha exception',{exact:true}).scrollIntoViewIfNeeded();await dialog.screenshot({path:path.join(output,`${lang}-${role}-${mobile?'mobile':'desktop'}-rubrics.png`)});}
   await dialog.getByRole('button',{name:t('Cerrar','Close'),exact:true}).click();
  }
  if(!mobile&&role==='admin'){
   await page.getByRole('button',{name:/Operate/}).first().click();
   await page.getByLabel(t('Vista anónima','Anonymous view')).check();
   await page.getByRole('button',{name:t('Comparar ofertas','Compare offers'),exact:true}).first().click();
   const dialog=page.getByRole('dialog',{name:t('Comparativo de ofertas','Offer comparison')});const text=await dialog.innerText();
   assert.ok(!/Fixture Alpha|Fixture Beta|Private Alpha/i.test(text),'anonymous comparison must not reveal carrier identity or private notes');
   assert.ok(/Carrier /i.test(text));await dialog.getByRole('button',{name:t('Cerrar','Close'),exact:true}).click();
   await page.getByLabel(t('Vista anónima','Anonymous view')).uncheck();
  }
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:/Operate/}).first().click();await page.getByRole('button',{name:t('Comparar ofertas','Compare offers'),exact:true}).first().click();
  await page.getByRole('dialog').getByText('Fixture Alpha',{exact:true}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:t('Cerrar','Close'),exact:true}).click();
  lanes=[{...lane,invitations:[{...offer,bid_rate:1810},beta,gamma,missing]}, {...lane,id:id(50),lane_number:2,origin:'Other origin',invitations:[{...offer,id:id(51),vendors:{vendor_name:'Other lane carrier'}}]}];
  await page.getByRole('button',{name:t('Actualizar','Refresh'),exact:true}).click();await page.waitForLoadState('networkidle');
  // The read settles after the network goes idle; wait for React to apply the new lane count.
  await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(button=>button.textContent?.trim()===label&&button.disabled),t('Comparar ofertas','Compare offers'));
  assert.equal(await page.getByRole('button',{name:t('Comparar ofertas','Compare offers'),exact:true}).isEnabled(),false,'choose one lane before comparing a multi-lane event');
  await page.locator('select.filter').selectOption(lane.id);
  await page.getByRole('button',{name:t('Comparar ofertas','Compare offers'),exact:true}).click();
  const refreshed=page.getByRole('dialog',{name:t('Comparativo de ofertas','Offer comparison')});
  assert.ok((await refreshed.innerText()).includes('1810'),'refresh shows current amount');assert.ok(!(await refreshed.innerText()).includes('Other lane carrier'));
  await refreshed.getByRole('button',{name:t('Cerrar','Close'),exact:true}).click();
  lanes=[];await page.getByRole('button',{name:t('Actualizar','Refresh'),exact:true}).click();await page.waitForLoadState('networkidle');
  await page.getByText('Fixture Alpha',{exact:true}).waitFor({state:'detached'});
  assert.equal(await page.getByRole('dialog',{name:t('Comparativo de ofertas','Offer comparison')}).count(),0);
  assert.equal(await page.getByText('Fixture Alpha',{exact:true}).count(),0,'removed lane does not retain its offers');
  assert.ok(calls.every(c=>/^(list_|event_origins)/.test(c.action)));assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);
  return {lang,role,mobile,passed:true,writes:0};
 }catch(e){await page.screenshot({path:path.join(output,`${lang}-${role}-failure.png`),fullPage:true});throw e;}finally{await ctx.close();}
}
(async()=>{const browser=await chromium.launch({headless:true}),results=[];try{const cases=process.env.RED?[['es','admin',false]]:[['es','admin',false],['en','admin',false],['es','viewer',false],['en','viewer',false],['es','admin',true],['en','admin',true]];for(const args of cases){results.push(await run(browser,...args));console.log('PASS',...args);}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
