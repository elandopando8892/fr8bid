const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3079';assert.match(origin,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output=path.resolve(process.env.TEST_OUTPUT||'.test-output/offer-history');fs.mkdirSync(output,{recursive:true});
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{const browser=await chromium.launch({headless:true});const results=[];try{for(const lang of ['es','en']){
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),unknown=[];
 const user={id:uid(1),email:'fixture@heymarksman.com',app_metadata:{roles:['admin']}};
 await ctx.addInitScript(({user,lang})=>{localStorage.setItem('bidware.team.lang',lang);localStorage.setItem('sb-bidware-fixture-auth-token',JSON.stringify({user,access_token:'fixture.token.only',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer'}));},{user,lang});
 const event={id:uid(2),name:'History fixture',status:'open',currency:'USD'};
 const offer={id:uid(3),vendor_id:uid(4),vendors:{vendor_name:'Synthetic carrier'},invitation_status:'quoted',bid_rate:120,currency:'USD',commercial_model:'sell_share',carrier_share_pct:3,responded_at:'2026-10-08T14:29:03.436Z'};
 const lane={id:uid(5),rfx_event_id:event.id,origin:'Origin',destination:'Destination',invitations:[offer]};
 const revision={id:uid(6),occurred_at:'2026-10-08T14:29:04.174Z',metadata:{rfx_lane_vendor_id:offer.id,source:'rfx_bid_portal',best_final:true,before:{bid_rate:100,currency:'USD'},after:{bid_rate:120,currency:'USD',responded_at:offer.responded_at}}};
 let historyMode='ok';
 await ctx.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();if(url.hostname!=='bidware-fixture.supabase.co'){unknown.push(url.hostname);return route.abort();}if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});const a=req.postDataJSON()?.action;
 if(a==='list_contact_history'&&historyMode==='error')return route.fulfill({status:503,json:{error:'Fixture unavailable'}});
 const responses={list_rfx_detail:{event,lanes:[lane]},event_origins:{origins:{},folios:{}},list_rfx_segment_confirmations:{rows:[]},list_bid_room_chat:{rows:[]},list_rfx_invitation_wave_reviews:{rows:[]},list_contact_history:{rows:historyMode==='empty'?[]:[revision,{...revision,id:uid(7),metadata:{...revision.metadata,rfx_lane_vendor_id:uid(99),before:{bid_rate:987654,currency:'MXN'}}}]}};
 if(!(a in responses)){unknown.push(a);return route.abort();}return route.fulfill({json:responses[a]});});
 const page=await ctx.newPage();page.setDefaultTimeout(10000);
 const open=async()=>{await page.goto(origin+'/rfx/'+event.id+'/detalle');await page.getByRole('button',{name:/Close/}).first().click();await page.getByRole('button',{name:lang==='es'?'Ver detalle':'View details',exact:true}).first().click();await page.waitForLoadState('networkidle');return page.getByRole('dialog');};
 let d=await open();let text=await d.innerText();assert.match(text,/100/);assert.match(text,/120/);assert.ok(!text.includes('987654'));assert.match(text,/08:29|8:29/);assert.match(text,/America\/Mexico_City|Ciudad de México|Mexico City/);assert.equal(await d.locator('input,textarea,select').count(),0);await d.getByRole('region',{name:lang==='es'?'Historial de la oferta':'Offer history'}).scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(output,lang+'-mobile.png'),fullPage:true});
 for(const mode of ['empty','error']){historyMode=mode;d=await open();text=await d.innerText();assert.ok(!text.includes('100 USD'),'stale history must not remain');}
 assert.deepEqual(unknown,[]);results.push({lang,readOnly:true,crossInvitationExcluded:true,states:['ok','empty','error']});await ctx.close();
 }}finally{await browser.close();}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));console.log('Offer history ES/EN mobile, exact scope and error/empty states: OK');})().catch(e=>{console.error(e);process.exitCode=1;});


