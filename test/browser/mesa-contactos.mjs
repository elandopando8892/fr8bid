// Real Mesa and router, synthetic in-memory Rateware. No external requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(resolve(root,'package.json'));
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild');
const {chromium}=require(process.argv.find(a=>a.startsWith('--playwright-module='))?.slice('--playwright-module='.length)||'playwright');
const out=resolve(root,'.agentes/sprint-contactos-apollo/mesa-navigation');await mkdir(out,{recursive:true});
const bundle=await build({stdin:{resolveDir:root,sourcefile:'mesa-contactos-fixture.tsx',loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';
import {Mesa} from './src/ui/Mesa';import {MesaApi,transporteSimulado} from './src/cliente/api';import {sembrarDemoAmplia} from './src/simulado/semilla';
const {sim}=await sembrarDemoAmplia();const event=sim.events.find(e=>e.customer==='Aceros del Norte'&&e.status==='open');
if(!event)throw Error('Missing synthetic event');
for(const v of sim.vendors)v.primary_email=null;
for(const p of sim.laneVendors)p.invitation_status='shortlisted';
sim.mensajes=[];
sim.revisionesCarrier=[];
const api=new MesaApi(transporteSimulado(sim,()=> 'admin'));
window.qa={session:{api,sim,modo:'simulado',identidad:'admin',rol:'admin',rolLeido:true,correo:sim.usuarios.get('admin').email,usuarioSimulado:'admin',listo:true}};
createRoot(document.getElementById('app')).render(<BrowserRouter><main className="contenido"><Mesa id={event.id}/></main></BrowserRouter>);
`},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},plugins:[{name:'synthetic-session',setup(b){b.onLoad({filter:/[/\\]ui[/\\]sesion\.tsx$/},()=>({loader:'ts',contents:`export const NOMBRE_ROL={admin:'Administrador',operator:'Operador',viewer:'Consulta'},USUARIOS_SIMULADOS=[];export function useSesion(){return window.qa.session;}` }));}}]});
const assets={'/tokens.css':'src/estilos/marksman-brand-tokens.css','/styles.css':'src/estilos/app.css'};
const server=createServer(async(req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 if(p==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);}
 else if(assets[p]){res.setHeader('content-type','text/css');res.end(await readFile(resolve(root,assets[p])));}
 else{res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/styles.css"><div id="app"></div><script type="module" src="/fixture.js"></script></html>');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
let browser;const external=[],errors=[];let checks=0;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();
 await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin);await page.getByRole('button',{name:/Carriers e invitación/}).click();
  const panel=page.getByRole('region',{name:'Contactos de empresas',exact:true});await panel.waitFor();
  const show=page.getByRole('button',{name:'Ver y marcar «Revisado»',exact:true});if(await show.count())await show.click();
  const open=page.getByRole('button',{name:'Resolver contacto en esta Mesa',exact:true}).first();await open.focus();await page.keyboard.press('Enter');
  const name=await panel.locator('h3').innerText();const first=new URL(page.url()).searchParams.get('contacto');
  assert.ok(first,'Mesa entry stores company in navigation');checks++;
  await panel.getByRole('button',{name:'Siguiente empresa →',exact:true}).click();
  await page.waitForFunction(n=>document.querySelector('.contactos-detalle h3')?.textContent!==n,name);
  assert.notEqual(await panel.locator('h3').innerText(),name);checks++;
  await open.click();await page.waitForFunction(n=>document.querySelector('.contactos-detalle h3')?.textContent===n,name);
  assert.equal(new URL(page.url()).searchParams.get('contacto'),first);checks++;
  await page.reload();await panel.waitFor();assert.equal(await panel.locator('h3').innerText(),name);checks++;
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page fits viewport');checks++;
  await panel.screenshot({path:resolve(out,'mesa-'+width+'.png')});
 }
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 const result={passed:true,checks,external,errors};await writeFile(resolve(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
