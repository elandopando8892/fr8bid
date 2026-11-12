// Real UI -> HTTP client -> Fr8Bid gateway -> Rateware core -> isolated PostgreSQL.
// Authentication and Apollo responses are synthetic; no provider/network spend.
// Uses an existing Playwright install and the matching Rateware checkout.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const rateware=option('rateware-root');
if(!rateware)throw Error('Pass --rateware-root=<matching local Rateware checkout>');
const require=createRequire(resolve(root,'package.json'));
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild');
const {chromium}=require(option('playwright-module')||'playwright');
const {withContactDatabase}=await import(pathToFileURL(resolve(rateware,'tools/test-carrier-contacts-postgres.mjs')).href);
const {executeContactAction}=await import(pathToFileURL(resolve(rateware,'supabase/functions/carrier-contacts-api/core.mjs')).href);
const output=resolve(root,'.agentes/sprint-contactos-apollo/browser');await mkdir(output,{recursive:true});
const gateway=await build({entryPoints:[resolve(root,'src/servidor/contactosEmpresa.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {reenviarContactos}=await import('data:text/javascript;base64,'+Buffer.from(gateway.outputFiles[0].contents).toString('base64'));
const bundle=await build({stdin:{resolveDir:root,sourcefile:'contactos-fixture.tsx',loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {ContactosEmpresa} from './src/ui/ContactosEmpresa';import {contactosHttp} from './src/cliente/contactosEmpresa';
const empresas=[['001','Alpha Transport'],['002','Beta Transport'],['003','Gamma Transport']].map(([n,nombre])=>({id:'10000000-0000-4000-8000-'+n.padStart(12,'0'),nombre}));
const cliente=contactosHttp(async()=>'synthetic-user');
createRoot(document.getElementById('app')).render(<main className="contenido"><p className="pill prueba">Prueba local · datos sintéticos</p><h1>Mesa del evento · contactos</h1>
<ContactosEmpresa empresas={empresas} contexto="synthetic-org-alpha" cliente={cliente} seleccionInicial={new URLSearchParams(location.search).get('empresa')}
 onSeleccion={id=>{const u=new URL(location.href);u.searchParams.set('empresa',id);history.replaceState(null,'',u);}} /></main>);
`},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const assets={'/tokens.css':'src/estilos/marksman-brand-tokens.css','/styles.css':'src/estilos/app.css'};
const errors=[],external=[],calls=[];let paid=0,assertions=0;
const check=(ok,message)=>{assertions++;assert.ok(ok,message);};
const literal=value=>value===null?'null':"'"+String(value).replaceAll("'","''")+"'";
const result=await withContactDatabase(async({query})=>{
 const command=async(action,input)=>JSON.parse(query(`set role service_role;select public.carrier_contact_action(${literal(action)},${literal(input.owner)},${literal(input.actor)},${literal(input.vendor)},${literal(input.operation)},${literal(JSON.stringify(input.payload))});`));
 const provider=async(path,body)=>{
  calls.push(path);
  if(path==='mixed_people/api_search')return {status:200,body:{people:[{id:'aaaaaaaaaaaaaaaaaaaaaaaa',first_name:'María',last_name_obfuscated:'Ga***a',title:'Operaciones',has_email:true,organization:{name:'Gamma Transport'}}]}};
  assert.equal(path,'people/match');paid++;
  assert.equal(body.reveal_phone_number,false);assert.equal(body.run_waterfall_email,false);
  return {status:200,body:{person:{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'Persona sintética Gamma',email_status:'verified',email:'ops@gamma.example',organization:{primary_domain:'gamma.example'}}}};
 };
 const deps={writes:true,providerReady:true,policy:{id:'synthetic-plan',max_credits:2,expires_at:'2099-01-01'},command,provider};
 const server=createServer(async(req,res)=>{
  try {
   const path=new URL(req.url,'http://localhost').pathname;
   if(req.method==='POST'&&path==='/api/contactos-empresa'){
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error('Too large');}
    const r=await reenviarContactos(JSON.parse(raw),req.headers.authorization||null,true,async body=>executeContactAction(body,{owner:'org:alpha',actor:'user-a',role:'admin'},deps));
    res.writeHead(r.status,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(r.body));return;
   }
   if(req.method!=='GET'){res.writeHead(405).end();return;}
   if(path==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);}
   else if(assets[path]){res.setHeader('content-type','text/css');res.end(await readFile(resolve(root,assets[path])));}
   else{res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/styles.css"><div id="app"></div><script type="module" src="/fixture.js"></script></html>');}
  }catch(e){errors.push(String(e));res.writeHead(500).end('Synthetic test failed');}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;let browser;
 try {
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(20000);await page.setViewportSize({width:1366,height:1000});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin);await page.getByText('ops@alpha.example',{exact:true}).waitFor();
  check(paid===0,'Known contact linked without paid call');
  check(query("select count(*) from contact_history where status='contact_associated'")==='1','One durable known association');
  await page.getByRole('button',{name:'Siguiente empresa →',exact:true}).click();await page.getByText('b@beta.example',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Usar este contacto',exact:true}).nth(1).click();
  await page.getByText('Contacto guardado',{exact:true}).waitFor();
  check(query("select primary_email from vendors where vendor_name='Beta Transport'")==='b@beta.example','Ambiguity resolved in the same panel');
  await page.getByRole('button',{name:'Siguiente empresa →',exact:true}).click();
  await page.getByRole('heading',{name:'Gamma Transport',exact:true}).waitFor();
  await page.getByRole('button',{name:'Buscar en Apollo',exact:true}).click();await page.getByRole('button',{name:'Ver correo',exact:true}).click();
  await page.getByRole('region',{name:'Confirmar créditos',exact:true}).waitFor();
  check(paid===0,'Search and selection do not enrich');
  check(await page.locator('h4:focus').count()===1,'Keyboard focus follows confirmation');
  await page.keyboard.press('Tab');check(await page.getByRole('button',{name:'Confirmar y guardar'}).evaluate(e=>e===document.activeElement),'Confirmation reachable by keyboard');
  await page.screenshot({path:resolve(output,'confirmacion-1366.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(output,'confirmacion-390.png'),fullPage:true});
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,clase:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).filter(e=>e.right>innerWidth+1)}));
  await writeFile(resolve(output,'mobile-layout.json'),JSON.stringify(layout,null,2));
  check(layout.scroll<=layout.width,'No horizontal page overflow on mobile');
  await page.getByRole('button',{name:'Confirmar y guardar'}).evaluate(e=>{e.click();e.click();});
  await page.getByText('ops@gamma.example',{exact:true}).waitFor();check(paid===1,'One paid provider invocation');
  check(query("select state from carrier_contact_operations where person_id='aaaaaaaaaaaaaaaaaaaaaaaa'")==='completed','Result and link persisted in PostgreSQL');
  await page.reload();await page.getByText('ops@gamma.example',{exact:true}).waitFor();check(paid===1,'Reload recovers without another provider call');
  await page.screenshot({path:resolve(output,'guardado-390.png'),fullPage:true});
  await page.setViewportSize({width:1366,height:1000});await page.screenshot({path:resolve(output,'guardado-1366.png'),fullPage:true});
  check(errors.length===0,'No browser/server errors');check(external.length===0,'No external requests');
 } finally {await browser?.close();await new Promise(done=>server.close(done));}
});
const report={...result,assertions,paidProviderCalls:paid,actualCreditsSpent:0,provider:'synthetic',authentication:'synthetic',errors,external,calls};
await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
