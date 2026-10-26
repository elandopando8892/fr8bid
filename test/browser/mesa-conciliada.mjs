import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(resolve(root,'package.json'));
const vr=createRequire(require.resolve('vite/package.json'));
const {build}=vr('esbuild');
const {chromium}=require(process.env.FR8_PLAYWRIGHT_MODULE||'playwright');
const out=resolve(process.env.FR8_MESA_OUTPUT||'../mesa-browser');await mkdir(out,{recursive:true});
const bundle=await build({stdin:{resolveDir:root,sourcefile:'mesa-fixture.tsx',loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {Eventos} from './src/ui/Eventos';import {Mesa} from './src/ui/Mesa';import {NavegadorGlobal} from './src/ui/comun';
import {MesaApi} from './src/cliente/api';import {manejar} from './src/servidor/proxy';
const params=new URLSearchParams(location.search);const uncertain=params.has('uncertain'),incomplete=params.has('incomplete');
const e={id:'evento-test',rfx_id:'RFQ-SYNTHETIC',name:'PRUEBA CONTROLADA · integración',customer:'Cliente sintético',status:'open',due_date:'2026-10-20'};
const participant=i=>({id:'p'+i,vendor_id:'v1',vendors:{vendor_name:'Carrier sintético',primary_email:'prueba@example.test'},invitation_status:'quoted',bid_rate:1700,currency:'USD',responded_at:'2026-10-21T12:00:00Z',created_at:'2026-10-20T12:00:00Z',award_role:'primary',award_reason:'Motivo sintético',awarded_at:uncertain?'':'2026-10-21T13:00:00Z',valid_through:'2030-12-31'});
const raw={event:e,lanes:[1,2].map(i=>({id:'r'+i,lane_number:i,origin_city:'Monterrey',destination_city:'Laredo',equipment:'Caja seca',currency:'USD',invitations:[participant(i)]}))};
const message={id:'m1',rfx_lane_vendor_id:'p1',recipient_email:'prueba@example.test',subject:'Aviso sintético agrupado',text_body:'Una sola notificación para ambas rutas.',channel:'email',updated_at:'2026-10-26T12:00:00.123456Z',status:'approved',provider_message_id:'synthetic-reference',metadata:{notice_type:'rfx_award_closeout',rfx_lane_vendor_ids:['p1','p2'],award_summary:{awarded:2}}};
window.qa={calls:[],writes:[],last:null,preparada:null};
const enviar=async(_s,b)=>{
 qa.calls.push(b);let body;
 switch(b.action){
 case 'list_rfx_events':body={rows:[e,{id:'5894a5f1-f523-40b1-963e-445ab780b5f9',name:'PROTEGIDO'}]};break;
 case 'list_rfx_detail':body=raw;break;
 case 'list_outreach_messages':body={rows:[message,{...message,id:'m-wa',channel:'whatsapp',subject:'WHATSAPP NO GMAIL'}],has_more:incomplete};break;
 case 'list_rfx_lane_conditions':case 'list_rfx_segment_confirmations':case 'list_rfx_invitation_wave_reviews':body={rows:[]};break;
 case 'list_rfx_carrier_replies':body={rows:[],email_status:'checked'};break;
 default:qa.writes.push(b);throw Error('Unexpected action '+b.action);
 }return {status:200,body,headers:{}};
};
const api=new MesaApi((s,b)=>manejar(s,b,'Bearer synthetic',{enviar,real:true,permitirEscrituras:false}),()=> '2026-10-26');
const original=api.detalle.bind(api);api.detalle=async(...args)=>{qa.last=await original(...args);return qa.last;};qa.api=api;
qa.session={api,listo:true,modo:'rateware',rol:'admin'};
createRoot(document.getElementById('app')).render(<BrowserRouter><NavegadorGlobal/><main className="contenido"><Routes><Route path="/" element={<Eventos/>}/><Route path="/eventos" element={<Eventos/>}/><Route path="/eventos/evento-test" element={<Mesa id="evento-test"/>}/></Routes></main></BrowserRouter>);
`},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'synthetic-session',setup(b){b.onLoad({filter:/[/\\]ui[/\\]sesion\.tsx$/},()=>({loader:'ts',contents:'export const NOMBRE_ROL={},USUARIOS_SIMULADOS=[];export function useSesion(){return window.qa.session}'}));}}]});
const assets={'/tokens.css':'src/estilos/marksman-brand-tokens.css','/styles.css':'src/estilos/app.css'};
const errors=[],external=[],networkWrites=[],results=[];let assertions=0;
const check=(ok,msg)=>{assertions++;assert.ok(ok,msg)};
const server=createServer(async(req,res)=>{if(req.method!=='GET'){networkWrites.push(req.method);res.writeHead(405).end();return;}const path=new URL(req.url,'http://localhost').pathname;if(path==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);}else if(assets[path]){res.setHeader('content-type','text/css');res.end(await readFile(resolve(root,assets[path])));}else{res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/styles.css"><div id="app"></div><script type="module" src="/fixture.js"></script>');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();
 await context.route('**/*',route=>{const r=route.request();if(new URL(r.url()).origin!==origin){external.push(r.url());return route.abort();}if(r.method()!=='GET'){networkWrites.push(r.method());return route.abort();}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 for(const width of [1280,390]){
  const before=assertions;await page.setViewportSize({width,height:1050});await page.goto(origin);
  const link=page.getByRole('link',{name:'PRUEBA CONTROLADA · integración',exact:true});await link.waitFor();
  check(!(await page.locator('body').innerText()).includes('PROTEGIDO'),'Protected event absent');
  await link.focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Entrega a Rateware',exact:true}).waitFor();
  check((await page.evaluate(()=>qa.calls)).some(c=>c.action==='list_rfx_lane_conditions'),'R1 still read');
  check((await page.evaluate(()=>qa.calls)).some(c=>c.action==='list_rfx_carrier_replies'),'R2 still read');
  const prep=await page.evaluate(()=>qa.preparada=qa.api.prepararEntrega(qa.last));check(prep.estado==='preparada','Pure preparation works');
  check((await page.evaluate(()=>qa.writes)).length===0,'Preparation no business write');
  await page.getByRole('button',{name:'Entregar a Rateware',exact:true}).click();await page.getByRole('button',{name:'Sí, confirmar',exact:true}).waitFor();
  check((await page.evaluate(()=>qa.writes)).length===0,'First UI step does not write');await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:/Aviso al carrier/}).click();
  check(await page.locator('.aviso-caja').count()===1,'Grouped notice appears once');
  check((await page.locator('.aviso-caja').innerText()).includes('aprobación no verificada'),'Unknown approval visible');
  check((await page.locator('.aviso-caja').innerText()).includes('Referencia del proveedor'),'Provider reference not acceptance');
  check(await page.getByRole('button',{name:'Aprobar este texto y enviar',exact:true}).count()===0,'Unknown approval not sendable');
  check(!(await page.locator('body').innerText()).includes('WHATSAPP NO GMAIL'),'WhatsApp not presented as Gmail');
  await page.screenshot({path:resolve(out,'avisos-'+width+'.png'),fullPage:true});
  await page.reload();await page.getByRole('heading',{name:'Entrega a Rateware',exact:true}).waitFor();
  check(await page.getByRole('button',{name:'Sí, confirmar',exact:true}).count()===0,'Reload resets confirmation');
  check((await page.evaluate(()=>qa.writes)).length===0,'Reload no write');results.push({name:'list-detail-preparation-notices-reload-'+width,assertions:assertions-before,passed:true});
 }
 await page.goto(origin+'/eventos/evento-test?uncertain=1');await page.getByRole('heading',{name:'Entrega a Rateware',exact:true}).waitFor();
 check((await page.locator('body').innerText()).includes('Versión adjudicada por revisar'),'Unknown version visible');
 const p=await page.evaluate(()=>qa.api.prepararEntrega(qa.last));check(p.estado==='sin_preparar'&&p.operationId===null,'Unknown version blocks preparation');
 check((await page.evaluate(()=>qa.writes)).length===0,'Unknown version no writes');results.push({name:'uncertain-award',assertions:3,passed:true});
 await page.goto(origin+'/eventos/evento-test?incomplete=1');await page.getByText('Hay más avisos de los que devuelve esta lectura.',{exact:false}).waitFor();
 check(await page.getByRole('button',{name:'Entregar a Rateware',exact:true}).count()===0,'Incomplete notice page prevents incomplete preparation');
 check((await page.evaluate(()=>qa.writes)).length===0,'Incomplete page no writes');results.push({name:'incomplete-page',assertions:2,passed:true});
 check(errors.length===0,'No browser errors');check(external.length===0,'No external requests');check(networkWrites.length===0,'No network writes');
}catch(e){results.push({name:'browser_failure',passed:false,error:e.stack});}
finally{await browser?.close();await new Promise(done=>server.close(done));}
const report={passed:results.filter(x=>x.passed).length,total:results.length,assertions,results,errors,external,networkWrites};await writeFile(resolve(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(results.some(x=>!x.passed))process.exitCode=1;
