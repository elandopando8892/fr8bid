const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const XLSX=require('xlsx');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3207';assert.match(origin,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output=path.resolve(process.env.TEST_OUTPUT||'.test-output/offer-export/browser');fs.mkdirSync(output,{recursive:true});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function run(browser,lang,role,mobile=false){
 const t=(es,en)=>lang==='es'?es:en,user={id:id(1),email:'fixture@heymarksman.com',app_metadata:{roles:[role]}};
 const event={id:id(2),rfx_id:'RFx-FIXTURE',name:'Comparison fixture',status:'open',currency:'USD',due_date:'2099-10-15'};
 const offer={id:id(3),vendor_id:id(4),invitation_status:'quoted',vendors:{vendor_name:'Fixture Alpha'},bid_rate:1800,currency:'USD',commercial_model:'sell_share',carrier_share_pct:3,weekly_capacity:5,transit_days:2,valid_through:'2099-10-20',equipment_available:true,current_unit_location:'Private Alpha yard',deadhead_distance:0,deadhead_unit:'mi',unit_details:'Private Alpha unit',mirror_account_enabled:false,notes:'Private Alpha note',response_source:'carrier_portal',responded_at:'2026-10-07T10:00:00Z', invitation_token:'DO_NOT_EXPORT_TOKEN', metadata:{private_url:'DO_NOT_EXPORT_LINK'}};
 const beta={...offer,id:id(6),vendor_id:id(7),vendors:{vendor_name:'Fixture Beta'},bid_rate:1700,commercial_model:'cost_plus',weekly_capacity:null,valid_through:'2020-01-01',equipment_available:false};
 const gamma={...offer,id:id(8),vendor_id:id(9),vendors:{vendor_name:'Fixture Gamma'},bid_rate:30000,currency:'MXN',commercial_model:'brokerage',valid_through:null};
 const missing={...offer,id:id(10),vendor_id:id(11),vendors:{vendor_name:'Fixture Missing Currency'},bid_rate:1200,currency:null,valid_through:'2099-02-31',invitation_status:'rejected'};
 const noBid={...offer,id:id(12),vendor_id:id(13),vendors:{vendor_name:'Invitation without bid'},bid_rate:null};
 const lane={id:id(5),rfx_event_id:event.id,origin:'Origin fixture',destination:'Destination fixture',equipment:'Truck Trailer',trailer:'Dry Van',operation:'D2D Export',service:'One Way',weekly_volume:5,invitations:[offer,beta,gamma,missing,noBid],invitation_count:5,bid_count:4};
 let lanes=[lane];const calls=[],unknown=[],errors=[];
 const scenario=process.env.EXPORT_SCENARIO;
 if(scenario==='error')lanes=[{...lane,invitations:[{...offer,notes:'a'.repeat(32768)},beta,gamma,missing,noBid]}];
 let releaseWriter,writerStarted;
 const writerGate=new Promise(resolve=>{releaseWriter=resolve;});
 const writerPending=new Promise(resolve=>{writerStarted=resolve;});
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
 await ctx.addInitScript(({user,lang})=>{localStorage.setItem('bidware.team.lang',lang);localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));},{user,lang});
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin===origin){if(['close','language'].includes(scenario)&&url.pathname.includes('xlsx')){writerStarted();await writerGate;}return route.continue();}
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

   const exportButton=dialog.getByRole('button',{name:t('Descargar Excel','Download Excel'),exact:true});
   assert.equal(await exportButton.count(),1,'comparison should offer a local workbook download');
   if(['close','language'].includes(scenario)){
    const downloads=[];page.on('download',d=>downloads.push(d));
    await exportButton.click();await Promise.race([writerPending,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Writer was not requested within the fixture deadline')),15000))]);
    assert.equal(await dialog.getByRole('button',{name:t('Preparando Excel…','Preparing Excel…'),exact:true}).isEnabled(),false);
    if(scenario==='close')await dialog.getByRole('button',{name:t('Cerrar','Close'),exact:true}).click();
    else await page.evaluate(async next=>{const language=await import('/src/bidware/i18n/language.ts');language.setLang(next);},lang==='es'?'en':'es'); // Isolated language-store change, as from another tab; the modal blocks sidebar clicks.
    releaseWriter();await page.waitForLoadState('networkidle');
    assert.deepEqual(downloads,[],'a cancelled or changed-language context cannot trigger a late download');
    assert.ok(calls.every(c=>/^(list_|event_origins)/.test(c.action)));assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);
    return {lang,role,mobile,scenario,passed:true,downloads:0,writes:0};
   }
   if(scenario==='error'){
    const downloads=[];page.on('download',d=>downloads.push(d));await exportButton.click();
    await dialog.getByText(t('Una condición excede el tamaño de celda permitido por Excel. No se descargó un archivo incompleto.','A condition exceeds the cell size supported by Excel. An incomplete file was not downloaded.'),{exact:true}).waitFor();
    assert.deepEqual(downloads,[]);assert.equal(await exportButton.isEnabled(),true);
    await dialog.screenshot({path:path.join(output,lang+'-export-error.png')});
    await dialog.getByRole('button',{name:t('Cerrar','Close'),exact:true}).click();lanes=[lane];
    await page.getByRole('button',{name:t('Actualizar','Refresh'),exact:true}).click();await page.waitForLoadState('networkidle');
    await page.getByRole('button',{name:t('Comparar ofertas','Compare offers'),exact:true}).click();
    await dialog.getByText('Fixture Alpha',{exact:true}).waitFor();
    const [recovered]=await Promise.all([page.waitForEvent('download'),exportButton.click()]);await recovered.saveAs(path.join(output,lang+'-error-recovered.xlsx'));
    assert.equal(downloads.length,1,'only explicit recovery downloads the complete file');
    assert.ok(calls.every(c=>/^(list_|event_origins)/.test(c.action)));assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);
    return {lang,role,mobile,scenario,passed:true,downloads:1,writes:0};
   }
   const [download]=await Promise.all([page.waitForEvent('download'),exportButton.click()]);
   assert.equal(download.suggestedFilename(),'comparativo-rfx.xlsx');
   const file=path.join(output,lang+'-'+role+'-'+(mobile?'mobile':'desktop')+'-'+stage+'.xlsx');await download.saveAs(file);
   const book=XLSX.readFile(file), grid=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});
   assert.deepEqual(grid[0].slice(1),['Fixture Alpha','Fixture Beta','Fixture Gamma','Fixture Missing Currency']);
   assert.deepEqual(grid.find(row=>row[0]===t('Tarifa all-in','All-in rate')).slice(1),['1800','1700','30000','1200']);
   assert.deepEqual(grid.find(row=>row[0]===t('Moneda','Currency')).slice(1),['USD','USD','MXN',t('No informado','Not provided')]);
   assert.ok(JSON.stringify(grid).includes('Private Alpha exception'));
   const bytes=JSON.stringify(book);assert.ok(!/DO_NOT_EXPORT_|fixture.token.only/.test(bytes));
   for(const sheet of Object.values(book.Sheets))for(const [key,cell]of Object.entries(sheet))if(!key.startsWith('!')){assert.equal(cell.f,undefined);assert.equal(cell.l,undefined);}
   assert.equal(calls.length,callsBefore,'download must not make another API call');
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
   assert.ok(/Carrier /i.test(text));
   const [anonymousFile]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:t('Descargar Excel','Download Excel'),exact:true}).click()]);
   const anonPath=path.join(output,lang+'-anonymous.xlsx');await anonymousFile.saveAs(anonPath);const anonBook=XLSX.readFile(anonPath);
   assert.ok(!/Fixture Alpha|Fixture Beta|Fixture Gamma|Private Alpha|DO_NOT_EXPORT_|00000000-0000-4000-8000-000000000004/i.test(JSON.stringify(anonBook)),'anonymous workbook cannot reveal carrier identity, private text or IDs');
   await dialog.getByRole('button',{name:t('Cerrar','Close'),exact:true}).click();
   await page.getByLabel(t('Vista anónima','Anonymous view')).uncheck();
  }
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:/Operate/}).first().click();await page.getByRole('button',{name:t('Comparar ofertas','Compare offers'),exact:true}).first().click();
  await page.getByRole('dialog').getByText('Fixture Alpha',{exact:true}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:t('Cerrar','Close'),exact:true}).click();
  lanes=[{...lane,invitations:[{...offer,bid_rate:1810},beta,gamma,missing]}, {...lane,id:id(50),lane_number:2,origin:'Other origin',invitations:[{...offer,id:id(51),vendors:{vendor_name:'Other lane carrier'}}]}];
  await page.getByRole('button',{name:t('Actualizar','Refresh'),exact:true}).click();await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('button',{name:t('Comparar ofertas','Compare offers'),exact:true}).isEnabled(),false,'choose one lane before comparing a multi-lane event');
  await page.locator('select.filter').selectOption(lane.id);
  await page.getByRole('button',{name:t('Comparar ofertas','Compare offers'),exact:true}).click();
  const refreshed=page.getByRole('dialog',{name:t('Comparativo de ofertas','Offer comparison')});
  assert.ok((await refreshed.innerText()).includes('1810'),'refresh shows current amount');assert.ok(!(await refreshed.innerText()).includes('Other lane carrier'));
  const [freshFile]=await Promise.all([page.waitForEvent('download'),refreshed.getByRole('button',{name:t('Descargar Excel','Download Excel'),exact:true}).click()]);const freshPath=path.join(output,lang+'-'+role+'-'+mobile+'-refreshed.xlsx');await freshFile.saveAs(freshPath);const freshBook=XLSX.readFile(freshPath),freshGrid=XLSX.utils.sheet_to_json(freshBook.Sheets[freshBook.SheetNames[0]],{header:1});assert.equal(freshGrid.find(row=>row[0]===t('Tarifa all-in','All-in rate'))[1],'1810');assert.ok(!JSON.stringify(freshBook).includes('Other lane carrier'));

  await refreshed.getByRole('button',{name:t('Cerrar','Close'),exact:true}).click();
  lanes=[];await page.getByRole('button',{name:t('Actualizar','Refresh'),exact:true}).click();await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('dialog',{name:t('Comparativo de ofertas','Offer comparison')}).count(),0);
  assert.equal(await page.getByText('Fixture Alpha',{exact:true}).count(),0,'removed lane does not retain its offers');
  assert.ok(calls.every(c=>/^(list_|event_origins)/.test(c.action)));assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);
  return {lang,role,mobile,passed:true,writes:0};
 }catch(e){await page.screenshot({path:path.join(output,`${lang}-${role}-failure.png`),fullPage:true});throw e;}finally{await ctx.close();}
}
(async()=>{const browser=await chromium.launch({headless:true}),results=[];try{const cases=process.env.RED?[['es','admin',false]]:process.env.EXPORT_SCENARIO?[['es','admin',false],['en','admin',false]]:[['es','admin',false],['en','admin',false],['es','viewer',false],['en','viewer',false],['es','admin',true],['en','admin',true]];for(const args of cases){results.push(await run(browser,...args));console.log('PASS',...args);}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
