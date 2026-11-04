// Real Bidware screens and API clients. All Auth/API boundaries are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {transform}=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3182';
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output=path.resolve(process.env.TEST_OUTPUT||'.test-output/intake-quotedesk-20261006/browser');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
const productionApi=require('node:fs').readFileSync('src/bidware/lib/api-client.ts','utf8');
async function run(browser,lang,scenario,mobile=false){
  const calls=[],unexpected=[],errors=[];let user={id:uid(99),email:'fixture@heymarksman.com',app_metadata:{roles:[scenario==='viewer'?'viewer':'operator']}};
  const project={id:uid(1),customer_id:uid(2),customer_name:'Fixture Shipper',title:'Controlled Spot',customer_contact_name:'Controlled',customer_contact_email:'controlled@example.test',opportunity_type:'spot',status:'rfi_submitted',rfi_status:'submitted',notes:null,lane_count:1,updated_at:'2026-10-06T12:00:00Z',created_at:'2026-10-06T12:00:00Z'};
  const draft={kind:'spot',contact:{company:'Fixture Shipper',name:'Controlled',email:'controlled@example.test',phone:'555'},currency:'USD',segments:[],answers:{},notes:'',commodity:'Controlled cargo',equipment:"Dry Van 53'",lanes:[{key:'controlled-lane',origin:{city:'Monterrey',state_code:'NL',country:'MX'},destination:{city:'Dallas',state_code:'TX',country:'US',zip_prefix:'752'},truck:'Truck Trailer',equipment:"Dry Van 53'",service:'One Way',border_crossing:'Nuevo Laredo / Laredo',loads:'1',weight:'1000',weight_unit:'kg',notes:'Controlled lane'}]};
  let submission={updated_at:'2026-10-06T12:00:00.123456Z',status:['happy','submit-response-lost'].includes(scenario)?'draft':'submitted',submitted_at:['happy','submit-response-lost'].includes(scenario)?null:'2026-10-06T12:00:00Z',response:{bidware:{version:2,draft}}};
  const lanes=[];let quote=null,holdDetail=null,holdToken=null;
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
  await context.addInitScript(({lang,user})=>{if(window.top!==window.self)return;localStorage.setItem('bidware.team.lang',lang);localStorage.setItem('bidware.request.lang',lang);localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer'}));},{lang,user});
  const summary=()=>({lane_count:lanes.length,priced_lane_count:0,base_cost_total:0,accessorials_total:0,all_in_total:0,margin_total:0,margin_pct:null});
  const detail=()=>({quote,lanes,summary:summary(),linked_event:null});
  const cleanApi=(await transform(productionApi,{loader:'ts',format:'esm'})).code.replace(/from "@\/([^"\n]+)"/g,(_,p)=>`from "/src/bidware/${p}.ts"`);
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin){if(url.pathname==='/src/bidware/lib/api-client.ts')return route.fulfill({contentType:'application/javascript',body:cleanApi});return route.continue();}
    if(url.hostname!=='bidware-fixture.supabase.co'){unexpected.push(url.origin);return route.abort();}
    if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
    const input=req.postDataJSON();calls.push(input);
    const json=data=>route.fulfill({json:data});
    if(input.action==='get_customer_rfi'){
      if(scenario==='expired')return route.fulfill({status:410,json:{error:'Link expired'}});
      if(scenario==='inactive')return route.fulfill({status:404,json:{error:'PGRST116 no rows'}});
      const payload={project,link:{id:uid(10),status:'active',expires_at:null},submission,lanes:[]};
      if(input.token==='B'){payload.project={...project,id:uid(5),title:'Request B',customer_name:'Fixture B'};payload.submission={status:'draft',response:{bidware:{version:2,draft:{...draft,commodity:'Cargo B'}}}};if(holdToken){holdToken.started.resolve();await holdToken.gate.promise;}}
      return json(payload);
    }
    if(input.action==='save_customer_rfi'){if(submission.status==='submitted')return route.fulfill({status:400,json:{error:'This Customer RFI has already been submitted.'}});submission={...submission,response:input.rfi};return json({saved:true});}
    if(input.action==='submit_customer_rfi'){submission={updated_at:'2026-10-06T12:00:00.123456Z',status:'submitted',submitted_at:'2026-10-06T12:00:00Z',response:input.rfi};if(scenario==='submit-response-lost')return route.abort();return json({submitted:true});}
    if(input.action==='list_rfx_process_projects')return json({rows:[project]});
    if(input.action==='list_shippers')return json({rows:[]});
    if(input.action==='get_rfx_process_project'){if(holdDetail){holdDetail.started.resolve();await holdDetail.gate.promise;}return json({project,rfi_submission:submission,lanes:[]});}
    if(input.action==='list_spot_request_quotes')return json({rows:quote?[{source_project_id:project.id,quote:{id:quote.id,folio:quote.folio}}]:[]});
    if(input.action==='convert_spot_request_to_quote'){
      assert.equal(input.expected_submission_updated_at,'2026-10-06T12:00:00.123456Z');
      if(scenario==='atomic-failure')return route.fulfill({status:503,json:{error:'spot_conversion_unavailable'}});
      const replayed=Boolean(quote);
      if(!quote){quote={id:uid(3),folio:'Q-9001',shipper_name:'Fixture Shipper',shipper_id:uid(2),title:project.title,status:'new',quote_type:'spot',currency:'USD',rfx_event_id:null,valid_until:null,fx_usd_mxn:null};
        lanes.push({id:uid(4),quote_id:uid(3),lane_number:1,origin:'Monterrey, NL',origin_city:'Monterrey',origin_country:'MX',destination:'Dallas, TX',destination_city:'Dallas',destination_country:'US',destination_postal_code:'752',equipment:'Truck Trailer',trailer:"Dry Van 53'",weekly_volume:null,notes:submission.response.bidware.draft.commodity,metadata:{},accessorials:[]});}
      if(scenario==='conversion-response-lost')return route.abort();
      return json({quote:{id:quote.id,folio:quote.folio},source_project_id:project.id,lane_count:lanes.length,replayed});
    }
    if(input.action==='get_quote')return json(detail());
    if(input.action==='get_context')return json({accessorials:[],fx:null,fuel:{state_region:{},regions:[]},border_crossings:[],email:{connected:false}});
    if(input.action==='list_fcm_cost_bases')return json({bases:[],default_id:null,tiers:[]});
    if(input.action==='list_staging_options')return json({categories:{},mx_crossings:[],us_crossings:[]});
    unexpected.push(input.action);return route.fulfill({status:501,json:{error:'Unexpected isolated action'}});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const text=(es,en)=>lang==='es'?es:en;
  const openIntake=async()=>{await page.goto(origin+'/intake',{waitUntil:'networkidle',timeout:30000});await page.locator('.sidebar-role').waitFor({state:'attached'});};
  const createButton=()=>page.getByRole('button',{name:text('Crear cotización →','Create quote →'),exact:true});
  try{
    if(['happy','submit-response-lost','expired','inactive','token-change'].includes(scenario)){
      await page.goto(origin+'/rfi/A',{waitUntil:'networkidle',timeout:30000});await page.getByRole('button',{name:lang.toUpperCase(),exact:true}).click();
      if(['expired','inactive'].includes(scenario)){
        await page.getByText(scenario==='expired'?text('Esta liga ya venció. Pide una nueva a tu contacto en MARKSMAN.','This link has expired. Ask your MARKSMAN contact for a new one.'):text('Esta liga no está activa. Pide una nueva a tu contacto en MARKSMAN.','This link isn\'t active. Ask your MARKSMAN contact for a new one.'),{exact:true}).waitFor();assert.equal(calls.filter(c=>/^save_|^submit_/.test(c.action)).length,0);
      }else if(scenario==='token-change'){
        holdToken={started:deferred(),gate:deferred()};await page.evaluate(()=>{history.pushState({},'','/rfi/B');dispatchEvent(new PopStateEvent('popstate'));});await holdToken.started.promise;
        assert.equal(await page.locator('.sr-basics input').count(),0,'Old request form must disappear while the new link loads');holdToken.gate.resolve();await page.locator('.sr-basics input').first().waitFor();assert.equal(await page.locator('.sr-basics input').first().inputValue(),'Cargo B');
      }else{
        await page.locator('.sr-basics input').first().fill('Updated controlled cargo');await page.waitForFunction(()=>document.querySelector('.sr-save.ok'));
        await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.sr-basics input').first().inputValue(),'Updated controlled cargo');
        await page.getByRole('button',{name:text('Enviar solicitud','Send request'),exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:text('Enviar','Send'),exact:true}).click();
        if(scenario==='submit-response-lost'){
          await page.getByText(text('Algo falló de nuestro lado. Vuelve a intentar en un momento; no cierres esta página.','Something failed on our side. Try again in a moment; keep this page open.'),{exact:true}).waitFor();
          await page.getByRole('button',{name:text('Enviar solicitud','Send request'),exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:text('Enviar','Send'),exact:true}).click();await page.getByRole('button',{name:text('Enviar solicitud','Send request'),exact:true}).waitFor({state:'hidden'});
        }else await page.getByRole('heading',{name:text('Recibimos tu solicitud','We got your request'),exact:true}).waitFor();
        await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByRole('button',{name:text('Enviar solicitud','Send request'),exact:true}).count(),0);
        await openIntake();await createButton().click();await page.waitForURL('**/quotedesk/'+uid(3));await page.getByRole('heading',{name:'Q-9001 · Fixture Shipper',exact:true}).waitFor();await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:'Q-9001 · Fixture Shipper',exact:true}).waitFor();assert.equal(lanes.length,1);assert.match(lanes[0].notes,/Updated controlled cargo/);assert.equal(calls.filter(c=>c.action==='convert_spot_request_to_quote').length,1);assert.equal(calls.filter(c=>c.action==='submit_customer_rfi').length,1);
      }
    }else{
      await openIntake();
      if(scenario==='viewer')assert.equal(await createButton().isEnabled(),false,'Viewer must not be offered conversion');
      else if(scenario==='account-change'){
        holdDetail={started:deferred(),gate:deferred()};await createButton().click();await holdDetail.started.promise;user={...user,id:uid(100)};
        await page.evaluate(async id=>{const {supabase}=await import('/src/bidware/lib/supabase.ts');const token=`eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+36000}))}.fixture`;const{error}=await supabase.auth.setSession({access_token:token,refresh_token:'fixture'});if(error)throw error;},user.id);await page.waitForLoadState('networkidle',{timeout:2000}).catch(()=>{});holdDetail.gate.resolve();await page.waitForLoadState('networkidle');assert.equal(calls.filter(c=>c.action==='convert_spot_request_to_quote').length,0,'Old account continuation must not create under the new session');
      }else{
        await createButton().click();
        if(scenario==='atomic-failure'){
          await page.getByText(text('No pudimos confirmar la conversión. Actualiza la lista o vuelve a intentar desde esta solicitud; no crees otra cotización manualmente.','We could not confirm the conversion. Refresh the list or retry from this request; do not create another quote manually.'),{exact:true}).waitFor();
          assert.equal(quote,null);assert.equal(lanes.length,0);assert.equal(calls.filter(c=>c.action==='convert_spot_request_to_quote').length,1);
        }else{
          await page.getByRole('heading',{name:'Q-9001 · Fixture Shipper',exact:true}).waitFor();
          await openIntake();await page.getByRole('link',{name:/Q-9001/}).waitFor();await page.reload({waitUntil:'networkidle'});
          await page.getByRole('link',{name:/Q-9001/}).waitFor();assert.equal(await createButton().count(),0);
          assert.equal(calls.filter(c=>c.action==='convert_spot_request_to_quote').length,1);assert.equal(lanes.length,1);
        }

      }
    }
    assert.equal(calls.some(c=>['create_quote','save_quote_lane','update_rfx_process_project'].includes(c.action)),false);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);await page.screenshot({path:path.join(output,`${lang}-${scenario}${mobile?'-mobile':''}.png`),fullPage:true});return{lang,scenario,mobile,creates:calls.filter(c=>c.action==='convert_spot_request_to_quote').length,realRequests:0,errors};
  }catch(e){fs.writeFileSync(path.join(output,`${lang}-${scenario}-failure.txt`),e.stack+'\n'+await page.locator('body').innerText()+'\nActions: '+calls.map(c=>c.action).join(', '));throw e;}
  finally{holdDetail?.gate.resolve();holdToken?.gate.resolve();await context.close();}
}
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];try{const scenarios=['happy','submit-response-lost','atomic-failure','conversion-response-lost','account-change','viewer','token-change','expired','inactive'].filter(s=>!process.argv[2]||s===process.argv[2]);assert(scenarios.length);for(const lang of ['es','en'])for(const scenario of scenarios){results.push(await run(browser,lang,scenario));console.log('PASS '+lang+' '+scenario);}if(!process.argv[2])for(const lang of ['es','en'])results.push(await run(browser,lang,'happy',true));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
