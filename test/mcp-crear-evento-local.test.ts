// Opt-in cross-repository integration. The Rateware runner supplies a verified,
// network-isolated disposable PostgreSQL container. No production endpoints.
import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { crearServidor } from '../src/mcp/servidor';
import { manejar, ESCRITURAS } from '../src/servidor/proxy';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
const container=process.env.RFX_TEST_CONTAINER, root=process.env.RFX_TEST_RATEWARE;
it.skipIf(!container || !root)('HTTP MCP → guarded proxy → real Edge handler → PostgreSQL transaction → MCP evento',async()=>{
  expect(container).toMatch(/^[a-f0-9]{64}$/);
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|DENO_DIR|LOCALAPPDATA|APPDATA)$/i.test(key))) as Record<string,string>;
  const actions:string[]=[];
  const docker=process.platform==='win32'?resolve(process.env.ProgramFiles || 'C:/Program Files','Docker/Docker/resources/bin/docker.exe'):'docker';
  const send=async(_s:any,body:Record<string,unknown>,authorization:string|null)=>{
    expect(authorization).toBe('Bearer synthetic-user');actions.push(String(body.action));
    const output=execFileSync('deno',['run','--cached-only','--no-check','--allow-env','--allow-read',`--allow-run=${docker}`,'--node-modules-dir=none','--no-lock',resolve(root!,'tools/rfx-event-draft-local-handler.ts'),container!,docker],{input:JSON.stringify(body),encoding:'utf8',env,timeout:45000,maxBuffer:2**20});
    const line=output.split(/\r?\n/).find(x=>x.startsWith('__RFX_RESULT__'));expect(line,output).toBeTruthy();return JSON.parse(line!.slice('__RFX_RESULT__'.length));
  };
  let enabled=false;
  const t=async(service:any,body:Record<string,unknown>)=>manejar(service,body,'Bearer synthetic-user',{enviar:send,permitirEscrituras:enabled,real:true,timeoutMs:45000});
  const newServer=()=>crearServidor(t,'operator',()=>new Date('2026-11-17T12:00:00Z'),{t,userId:'00000000-0000-4000-8000-000000000001',clientId:'synthetic-chat',email:'sales@heymarksman.com',secreto:new TextEncoder().encode('synthetic-secret-never-production-0123456789')});
  const call=async(name:string,args:object)=>{
    const server=newServer();
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);
    try {
    const response=await transport.handleRequest(new Request('http://localhost/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));
    const body=await response.json();return body.result;
    } finally {await server.close();}
  };
  {
    const input={name:'SYNTHETIC XBF Mexicali-Yuma 6 pallets',event_type:'spot',bid_visibility_mode:'private',operation_start_date:'2026-11-18',lanes:[{origin:'Amphenol, Carretera San Felipe 270, Mexicali',destination:'Yuma Airport, Arizona, US',operation:'D2D Export',currency:'MXN',notes:'SYNTHETIC; weight/dimensions/hours pending'}]};
    const preview=await call('preparar_evento',input);expect(preview.isError,JSON.stringify(preview)).not.toBe(true);expect(actions).toEqual(['preview_rfx_event_creation']);
    const args={confirmacion_id:preview.structuredContent.confirmacion_id,frase_ok:'sí'};
    const denied=await call('confirmar_creacion_evento',args);expect(denied.isError).toBe(true);expect(actions).not.toContain('create_rfx_event_draft');
    enabled=true; // Local test equivalent of FR8BID_ESCRITURAS_REALES=si; no environment changes.
    const created=await call('confirmar_creacion_evento',args);expect(created.isError,JSON.stringify(created)).not.toBe(true);
    const receipt=created.structuredContent;expect(receipt.estado).toBe('aplicada');expect(receipt.lectura_verificada).toBe(true);
    const replay=await call('confirmar_creacion_evento',args);expect(replay.structuredContent.event_id).toBe(receipt.event_id);
    const read=await call('evento',{event_id:receipt.event_id});expect(read.isError,JSON.stringify(read)).not.toBe(true);expect(JSON.stringify(read)).toContain(receipt.event_id);
    for(const name of ['ofertas_evento','seguimiento_evento']) {
      const result=await call(name,{event_id:receipt.event_id});expect(result.isError,JSON.stringify(result)).not.toBe(true);
    }
    const invitation=await call('preparar_invitacion',{event_id:receipt.event_id,fase:'borradores'});
    expect(invitation.isError).toBe(true); // No selected/reviewed carriers; creation never authorizes invitations.
    expect(actions.filter(a=>ESCRITURAS['rateware-api'].has(a))).toEqual(['create_rfx_event_draft','create_rfx_event_draft']);
  }
},240000);
