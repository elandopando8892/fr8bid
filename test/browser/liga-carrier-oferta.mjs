// Real LigaCarrier and CSS, isolated synthetic session/API. No live tokens or writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(resolve(root, 'package.json'));
const viteRequire = createRequire(require.resolve('vite/package.json'));
const { build } = viteRequire('esbuild');
const { chromium } = require(process.env.FR8_PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.env.FR8_OFFER_OUTPUT || 'output/liga-carrier-oferta');
const baseline = process.env.FR8_OFFER_BASELINE;
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: { contents: `import React,{StrictMode} from 'react';
    import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
    import {LigaCarrier} from './src/ui/LigaCarrier.tsx';
    import {ErrorApi} from './src/cliente/api.ts';
    const data=()=>({
      invitation:{bid_rate:null,currency:'USD',commercial_model:'fee_plus',invitation_status:'invited',valid_through:null},
      event:{name:'Evento sintético',rfx_id:'RFQ-SINTETICO',due_date:'2030-12-31'},
      lane:{origin_city:'Monterrey',destination_city:'Laredo',equipment:'Caja seca',weekly_volume:2,rfx_segment_key:'general'},
      segment_confirmations:[],bid_window_closed:false
    });
    window.qa={calls:[],pending:[],reads:0,readPending:[],deferRead:false,mode:'deferred',data:data()};
    const action=(kind,token,body)=>{
      qa.calls.push({kind,token,body:structuredClone(body)});
      if(qa.mode==='throw') throw new Error('Fallo sintético inmediato');
      if(qa.mode==='resolved') return Promise.resolve({ok:true});
      return new Promise((done,reject)=>qa.pending.push({done,reject,kind,body}));
    };
    qa.api={
      invitacion:()=>{qa.reads++;return qa.deferRead?new Promise(done=>qa.readPending.push(done)):Promise.resolve(structuredClone(qa.data));},
      enviarOferta:(token,body)=>action('submit_bid',token,body),
      declinar:token=>action('decline_invitation',token,{}),
      responderRubros:(token,body)=>action('save_segment_confirmations',token,body)
    };
    window.qaSet=patch=>Object.assign(qa,patch);
    window.qaSettle=(index=0,failure=null,patch={})=>{
      Object.assign(qa.data,patch);
      const p=qa.pending[index];
      if(failure){p.reject(failure.plain?new Error(failure.message):new ErrorApi(failure.status||400,failure.code||'SYNTHETIC',failure.message,!!failure.incierta));return;}
      if(p.kind==='submit_bid')qa.data.invitation={...qa.data.invitation,...p.body};
      if(p.kind==='decline_invitation')qa.data.invitation.invitation_status='declined';
      if(p.kind==='save_segment_confirmations')qa.data.segment_confirmations=p.body;
      p.done({ok:true});
    };
    window.qaRead=()=>{qa.deferRead=false;for(const done of qa.readPending.splice(0))done(structuredClone(qa.data));};
    const app=createRoot(document.getElementById('app'));
    window.qaRender=(second=false)=>flushSync(()=>app.render(<StrictMode>
      <main className="contenido solo"><section aria-label="Invitación A"><LigaCarrier key="A" token="synthetic-A"/></section>
      {second&&<section aria-label="Invitación B"><LigaCarrier key="B" token="synthetic-B"/></section>}</main>
    </StrictMode>));
    window.qaUnmount=()=>flushSync(()=>app.render(null));
    qaRender();`, resolveDir: root, sourcefile: 'liga-carrier-fixture.tsx', loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'synthetic-only-boundary', setup(b) {
    b.onLoad({filter:/[/\\]ui[/\\]sesion\.tsx$/},()=>({loader:'ts',contents:`
      export const NOMBRE_ROL={},USUARIOS_SIMULADOS=[];
      export function useSesion(){return {api:window.qa.api,listo:true}}` }));
    b.onLoad({filter:/[/\\]cliente[/\\]api\.ts$/},()=>({loader:'ts',contents:`
      export class ErrorApi extends Error {
        constructor(status,code,message,incierta=false){super(message);this.status=status;this.code=code;this.incierta=incierta;}
      }` }));
    if(baseline)b.onLoad({filter:/[/\\]ui[/\\]LigaCarrier\.tsx$/},async args=>({
      loader:'tsx',contents:await readFile(baseline,'utf8'),resolveDir:dirname(args.path)
    }));
  }}],
});
const assets={'/tokens.css':'src/estilos/marksman-brand-tokens.css','/styles.css':'src/estilos/app.css'};
const external=[],networkWrites=[],errors=[],results=[];
let assertions=0;
const verify=(ok,message)=>{assertions++;assert.ok(ok,message);};
const server=createServer(async(req,res)=>{
  if(req.method!=='GET'){networkWrites.push(req.method);res.writeHead(405).end();return;}
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  res.setHeader('Cache-Control','no-store');
  if(path==='/'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/styles.css"><div id="app"></div><script type="module" src="/fixture.js"></script></html>');
  }else if(path==='/fixture.js'){
    res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(bundle.outputFiles[0].contents);
  }else if(assets[path]){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(await readFile(resolve(root,assets[path])));}
  else res.writeHead(404).end();
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser,page;
const region=()=>page.getByRole('region',{name:'Invitación A',exact:true});
const button=name=>region().getByRole('button',{name,exact:true});
const submit=()=>region().locator('button[type="submit"]');
const input=name=>region().getByLabel(name,{exact:true});
const frames=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
const calls=()=>page.evaluate(()=>qa.calls);
async function fresh(width=1280){
  await page.setViewportSize({width,height:1050});await page.goto(origin);
  await submit().waitFor();await input('Tarifa all-in').fill('1200');
  await input('Capacidad semanal').fill('3');await input('Tránsito (días)').fill('2');
  await input('Vigente hasta').fill('2030-12-30');await input('Nota (sin valor comercial)').fill('Captura sintética conservada');
}
async function settle(index=0,failure=null,patch={}){
  await page.evaluate(({index,failure,patch})=>qaSettle(index,failure,patch),{index,failure,patch});await frames();
}
async function pending(kind='submit_bid'){
  const cs=await calls();verify(cs.length===1&&cs[0].kind===kind,'Only the expected action runs');
  verify(await submit().isDisabled(),'Offer disabled while pending');
  const decline = region().getByRole('button',{name:/^(Declinar invitación|Sí, confirmar|Enviando…)$/});
  verify(await decline.isDisabled(),'Decline disabled while pending');
  verify(await button('Guardar rubros').isDisabled(),'Rubrics disabled while pending');
  verify(await region().locator('.liga').getAttribute('aria-busy')==='true','Pending state exposed');
}
async function preserved(){
  verify(await input('Tarifa all-in').inputValue()==='1200','Rate retained');
  verify(await input('Capacidad semanal').inputValue()==='3','Capacity retained');
  verify(await input('Tránsito (días)').inputValue()==='2','Transit retained');
  verify(await input('Vigente hasta').inputValue()==='2030-12-30','Validity retained');
  verify(await input('Nota (sin valor comercial)').inputValue()==='Captura sintética conservada','Note retained');
}
async function check(name,fn,reproduce=false){
  if(baseline&&!reproduce)return;
  const start=assertions;
  try{await fn();results.push({name,passed:true,assertions:assertions-start});}
  catch(e){results.push({name,passed:false,assertions:assertions-start,error:e.message});}
}
try{
  browser=await chromium.launch({headless:true,...(process.env.FR8_CHROME_PATH?{executablePath:process.env.FR8_CHROME_PATH}:{channel:'chrome'})});
  const context=await browser.newContext();
  await context.route('**/*',route=>{
    const req=route.request();if(new URL(req.url()).origin!==origin){external.push(req.url());return route.abort();}
    if(req.method()!=='GET'){networkWrites.push(req.method());return route.abort();}return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(2500);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await check('01 Double click submits once',async()=>{
    await fresh();await submit().dblclick();await frames();await pending();await settle();
    verify((await calls()).length===1,'No implicit resubmission');
  },true);
  await check('02 Same-turn form submissions are serialized before render',async()=>{
    await fresh();await region().locator('form').evaluate(f=>{f.requestSubmit();f.requestSubmit();});await frames();
    await pending();await settle();
  },true);
  await check('03 Enter followed by click submits once',async()=>{
    await fresh();await input('Tarifa all-in').press('Enter');await submit().evaluate(el=>el.click());await frames();
    await pending();await settle();
  },true);
  await check('04 Offer and other actions cannot overlap in the same turn',async()=>{
    await fresh();await region().evaluate(el=>{el.querySelector('form').requestSubmit();for(const b of el.querySelectorAll('button'))if(b.textContent==='Declinar invitación'||b.textContent.trim()==='Guardar rubros')b.click();});
    await frames();await pending();await settle();
  },true);
  await check('05 Guard stays held until the refresh finishes',async()=>{
    await fresh();await submit().click();await page.evaluate(()=>qaSet({deferRead:true}));await settle();
    await page.waitForFunction(()=>qa.readPending.length===1);await pending();
    await region().locator('form').evaluate(f=>f.requestSubmit());verify((await calls()).length===1,'No new write during readback');
    await page.evaluate(()=>qaRead());await frames();verify(await submit().isEnabled(),'Refresh completion releases guard');
  },true);
  await check('06 Known rejection preserves input and allows explicit retry',async()=>{
    await fresh();await submit().click();await settle(0,{status:400,message:'Revisa la tarifa sintética'});
    verify(await region().getByRole('alert').innerText()==='Revisa la tarifa sintética','Accessible error shown');
    await preserved();verify(await submit().isEnabled(),'Recovered after error');verify((await calls()).length===1,'No automatic retry');
    await submit().click();verify((await calls()).length===2,'Explicit retry makes one new request');await settle(1);
    verify(await region().getByRole('status').count()===1,'Explicit retry succeeds');
  });
  await check('07 Uncertain transport error never resubmits automatically',async()=>{
    await fresh();await submit().click();await settle(0,{status:504,message:'No se pudo confirmar el resultado sintético',incierta:true});
    verify((await calls()).length===1,'Unknown result is not retried');await preserved();
    verify((await region().getByRole('alert').innerText()).includes('confirmar'),'Uncertainty remains visible');
  });
  await check('08 Synchronous failure releases the guard',async()=>{
    await fresh();await page.evaluate(()=>qaSet({mode:'throw'}));await submit().click();await frames();
    verify(await submit().isEnabled(),'Immediate failure does not leave sending');
    verify((await region().getByRole('alert').innerText()).includes('Fallo sintético'),'Immediate error visible');await preserved();
    await page.evaluate(()=>qaSet({mode:'deferred'}));await submit().click();await settle();
    verify((await calls()).length===2,'A later explicit attempt works');
  });
  await check('09 Expired-window rejection remains authoritative',async()=>{
    await fresh();await submit().click();await settle(0,{status:409,code:'BID_WINDOW_CLOSED',message:'El plazo sintético terminó'},{bid_window_closed:true});
    verify(await submit().count()===0,'Closed window removes the form');
    verify(await button('Guardar rubros').count()===0,'Closed window blocks rubrics');
    verify((await region().innerText()).includes('Esta puja ya cerró'),'Closing remains visible');
    verify((await calls()).length===1,'No retry after expiry');
  });
  await check('10 Success preserves the submitted payload and message',async()=>{
    await fresh();await submit().click();await settle();const cs=await calls();
    verify(cs.length===1&&cs[0].token==='synthetic-A','Correct synthetic invitation');
    assert.deepEqual(cs[0].body,{bid_rate:1200,currency:'USD',commercial_model:'fee_plus',weekly_capacity:3,transit_days:2,valid_through:'2030-12-30',notes:'Captura sintética conservada',language:'es'});assertions++;
    verify((await region().getByRole('status').innerText()).includes('Oferta recibida'),'Success announced');
    verify((await region().innerText()).includes('Tu oferta vigente'),'Updated offer shown');verify(await submit().isEnabled(),'Ready for an intentional correction');
  });
  await check('11 Deliberate later correction remains possible',async()=>{
    await fresh();await submit().click();await settle();await input('Tarifa all-in').fill('1350');await submit().click();await settle(1);
    const cs=await calls();verify(cs.length===2&&cs[1].body.bid_rate===1350,'Second intentional offer keeps new price');
  });
  await check('12 Immediately resolved API still ignores same-turn duplicates',async()=>{
    await fresh();await page.evaluate(()=>qaSet({mode:'resolved'}));await region().locator('form').evaluate(f=>{f.requestSubmit();f.requestSubmit();});await frames();
    verify((await calls()).length===1,'Immediate response does not defeat synchronous guard');verify(await submit().isEnabled(),'Immediate response releases afterward');
  },true);
  await check('13 Decline blocks an overlapping offer',async()=>{
    await fresh();await button('Declinar invitación').click();await region().evaluate(el=>{[...el.querySelectorAll('button')].find(b=>b.textContent==='Sí, confirmar').click();el.querySelector('form').requestSubmit();});await frames();
    await pending('decline_invitation');await settle();verify(await submit().count()===0,'Declined invitation removes action form');
  },true);
  await check('14 Saving rubrics blocks an overlapping offer',async()=>{
    await fresh();await region().evaluate(el=>{[...el.querySelectorAll('button')].find(b=>b.textContent.trim()==='Guardar rubros').click();el.querySelector('form').requestSubmit();});await frames();
    await pending('save_segment_confirmations');await settle();verify(await submit().isEnabled(),'Rubric completion releases actions');
  },true);
  await check('15 Required rate validation still prevents an empty offer',async()=>{
    await fresh();await input('Tarifa all-in').fill('');await submit().click();
    verify((await calls()).length===0,'Native required validation prevents submit');verify(await submit().isEnabled(),'Validation does not acquire pending state');
  });
  await check('16 Keyboard navigation remains usable after rejection',async()=>{
    await fresh();await input('Nota (sin valor comercial)').focus();await page.keyboard.press('Tab');
    verify(await submit().evaluate(el=>el===document.activeElement),'Tab reaches submit');await page.keyboard.press('Space');await settle(0,{status:400,message:'Error sintético corregible'});
    await input('Nota (sin valor comercial)').focus();await page.keyboard.press('Tab');
    verify(await submit().evaluate(el=>el===document.activeElement),'Submit remains keyboard reachable');
    await page.keyboard.press('Tab');verify(await button('Declinar invitación').evaluate(el=>el===document.activeElement),'Decline remains reachable');
    await submit().focus();await page.keyboard.press('Enter');await settle(1);verify((await calls()).length===2,'Keyboard explicit retry works');
  });
  await check('17 Separate invitations keep independent guards',async()=>{
    await fresh();await page.evaluate(()=>qaRender(true));const second=page.getByRole('region',{name:'Invitación B'});
    await second.getByLabel('Tarifa all-in',{exact:true}).fill('1400');await submit().click();await second.locator('button[type="submit"]').click();
    const cs=await calls();verify(cs.length===2&&new Set(cs.map(c=>c.token)).size===2,'Only different invitations can run independently');await settle(0);await settle(1);
  });
  await check('18 Reload does not resubmit an offer',async()=>{
    await fresh();await submit().click();await settle();await page.reload();await submit().waitFor();
    verify((await calls()).length===0,'Reload has no automatic write');
  });
  await check('19 Initial closed or declined invitation exposes no actions',async()=>{
    for(const patch of [{bid_window_closed:true},{invitation:{bid_rate:null,invitation_status:'declined'}}]){
      await fresh();await page.evaluate(patch=>{Object.assign(qa.data,patch);qaRender(true);},patch);
      const second=page.getByRole('region',{name:'Invitación B'});await frames();
      verify(await second.locator('form').count()===0,'Unavailable invitation has no offer form');
      verify((await calls()).length===0,'No writes caused by rendering unavailable invitation');
    }
  });
  for(const width of [1280,390])await check(`20 Layout and pending controls at ${width}px`,async()=>{
    await fresh(width);await submit().click();await pending();
    verify(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
    await page.screenshot({path:resolve(output,`pending-${width}.png`),fullPage:true});await settle(0,{status:400,message:'Conserva y revisa los datos sintéticos'});
    await page.screenshot({path:resolve(output,`error-${width}.png`),fullPage:true});await preserved();
  });
  await check('21 Route conditions share the write guard and retain the R1 payload',async()=>{
    await fresh();await page.evaluate(()=>{qa.data.lane_conditions=[{rubric_key:'condicion_sintetica',label_es:'Condición sintética',kind:'boolean',revision:1,importance:'required'}];qaUnmount();qaRender();});
    await button('Guardar condiciones').waitFor();await input('Tarifa all-in').fill('1200');
    await region().getByRole('combobox',{name:'Respuesta',exact:true}).selectOption('agree');
    await region().getByRole('combobox',{name:'Dato',exact:true}).selectOption('si');
    await region().evaluate(el=>{[...el.querySelectorAll('button')].find(b=>b.textContent.trim()==='Guardar condiciones').click();el.querySelector('form').requestSubmit();});await frames();
    const cs=await calls();verify(cs.length===1&&cs[0].kind==='save_segment_confirmations','Conditions prevent an overlapping offer');
    assert.deepEqual(cs[0].body,[{segment_key:'lane',rubric_key:'condicion_sintetica',answer:'agree',value:'si',comment:null}]);assertions++;
    verify(await button('Guardar condiciones').isDisabled(),'Conditions disabled while pending');
    verify(await submit().isDisabled(),'Offer disabled while conditions save');
    await settle();verify(await button('Guardar condiciones').isEnabled(),'Conditions recover after readback');
  });
  await check('22 No external requests, network writes or browser errors',async()=>{
    verify(external.length===0,'No external requests');verify(networkWrites.length===0,'No network writes');verify(errors.length===0,'No browser errors');
  },true);
}finally{await browser?.close();await new Promise(done=>server.close(done));}
const report={utc:new Date().toISOString(),baseline:baseline||null,passed:results.filter(r=>r.passed).length,total:results.length,assertions,external,networkWrites,errors,results,scope:'Real LigaCarrier, shared presentation components and CSS; synthetic session, invocation and readback only; no live backend/token or idempotency certification'};
await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.passed))process.exitCode=1;
