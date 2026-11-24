// Opt-in cross-repository integration. The Rateware runner supplies a verified,
// network-isolated disposable PostgreSQL container. No production endpoints.
import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { crearServidor } from '../src/mcp/servidor';
import { manejar, ESCRITURAS, type Respuesta } from '../src/servidor/proxy';
import { postgresReapertura } from './soporte/postgres-reapertura';
import { MesaApi } from '../src/cliente/api';
import { bloqueoBorradoresInvitacion, bloqueoCaptura } from '../src/dominio/acciones-mesa';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
const container=process.env.RFX_TEST_CONTAINER, root=process.env.RFX_TEST_RATEWARE;
const reopen = process.env.RFX_TEST_MODE === 'reopen';
function localMcp(role: 'admin' | 'operator', escribirReapertura?: (body: Record<string, unknown>) => Promise<Respuesta>) {
  expect(container).toMatch(/^[a-f0-9]{64}$/);
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|DENO_DIR|LOCALAPPDATA|APPDATA)$/i.test(key))) as Record<string,string>;
  const actions:string[]=[];
  const docker=process.platform==='win32'?resolve(process.env.ProgramFiles || 'C:/Program Files','Docker/Docker/resources/bin/docker.exe'):'docker';
  const send=async(_s:any,body:Record<string,unknown>,authorization:string|null)=>{
    expect(authorization).toBe('Bearer synthetic-user');actions.push(String(body.action));
    if (escribirReapertura && body.action === 'reopen_rfx_event_if_unchanged') return escribirReapertura(body);
    const output=execFileSync('deno',['run','--cached-only','--no-check','--allow-env','--allow-read',`--allow-run=${docker}`,'--node-modules-dir=none','--no-lock',resolve(root!,'tools/rfx-event-draft-local-handler.ts'),container!,docker,reopen?'reopen':'draft'],{input:JSON.stringify(body),encoding:'utf8',env,timeout:45000,maxBuffer:2**20});
    const line=output.split(/\r?\n/).find(x=>x.startsWith('__RFX_RESULT__'));expect(line,output).toBeTruthy();return JSON.parse(line!.slice('__RFX_RESULT__'.length));
  };
  let enabled=false;
  const t=async(service:any,body:Record<string,unknown>)=>manejar(service,body,'Bearer synthetic-user',{enviar:send,permitirEscrituras:enabled,real:true,timeoutMs:45000});
  const newServer=()=>crearServidor(t,role,()=>reopen?new Date():new Date('2026-11-17T12:00:00Z'),{
    t,userId:'00000000-0000-4000-8000-000000000001',clientId:'synthetic-chat',email:'sales@heymarksman.com',
    secreto:new TextEncoder().encode('synthetic-secret-never-production-0123456789'),
    organizacionId:'synthetic-mcp',secretoReapertura:'synthetic-reopen-signing-key-for-tests-only',
  });
  const rpc=async(method:string,params?:object)=>{
    const server=newServer();
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);
    try {
      const response=await transport.handleRequest(new Request('http://localhost/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
    const body=await response.json();return body.result;
    } finally {await server.close();}
  };
  return { t, actions, rpc, enable: () => { enabled = true; },
    call: (name: string, args: object) => rpc('tools/call', { name, arguments: args }) };
}

it.skipIf(!container || !root || reopen)('HTTP MCP → guarded proxy → real Edge handler → PostgreSQL transaction → MCP evento',async()=>{
  const { call, actions, enable } = localMcp('operator');
  {
    const input={name:'SYNTHETIC XBF Mexicali-Yuma 6 pallets',event_type:'spot',bid_visibility_mode:'private',operation_start_date:'2026-11-18',lanes:[{origin:'Amphenol, Carretera San Felipe 270, Mexicali',destination:'Yuma Airport, Arizona, US',operation:'D2D Export',currency:'MXN',notes:'SYNTHETIC; weight/dimensions/hours pending'}]};
    const preview=await call('preparar_evento',input);expect(preview.isError,JSON.stringify(preview)).not.toBe(true);expect(actions).toEqual(['preview_rfx_event_creation']);
    const args={confirmacion_id:preview.structuredContent.confirmacion_id,frase_ok:'sí'};
    const denied=await call('confirmar_creacion_evento',args);expect(denied.isError).toBe(true);expect(actions).not.toContain('create_rfx_event_draft');
    enable(); // Local test equivalent of FR8BID_ESCRITURAS_REALES=si; no environment changes.
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

it.skipIf(!container || !root || !reopen)('reapertura por MCP → proxy → Rateware → PostgreSQL → página del evento → MCP evento', async () => {
  const { call, actions, enable, t, rpc } = localMcp('admin');
  const api = new MesaApi(t, () => '2026-11-23');
  const event_id = '11111111-1111-4111-8111-111111111111';
  const nueva_fecha = '2099-01-01';
  const listing = await rpc('tools/list');
  const tool = listing.tools.find((entry: { name: string }) => entry.name === 'preparar_reapertura_evento');
  expect(tool.annotations.readOnlyHint).toBe(true);
  expect(Object.values(tool.inputSchema.properties).map((property: any) => property.type)).toEqual(['string', 'string', 'string']);
  const antes = await api.detalle(event_id);
  expect(antes.evento.estado).toBe('cerrado');
  expect(bloqueoBorradoresInvitacion(antes)).toBeTruthy();
  const vista = await call('preparar_reapertura_evento', { event_id, nueva_fecha, motivo: 'Más participaciones' });
  expect(vista.structuredContent, JSON.stringify(vista)).toMatchObject({
    estado: 'vista_previa', escrito: false, vista_previa: { ofertas: 1, participaciones: 2, rutas: 1 },
  });
  expect(actions.filter(a => ESCRITURAS['rateware-api'].has(a))).toEqual([]);
  const confirmacion = { confirmacion_id: vista.structuredContent.confirmacion_id, frase_ok: 'Sí' };
  const cerrada = await call('confirmar', confirmacion);
  expect(cerrada.structuredContent, JSON.stringify(cerrada)).toMatchObject({ estado: 'rechazada', codigo: 'ESCRITURA_NO_AUTORIZADA' });
  enable();
  const r = await call('confirmar', confirmacion);
  expect(r.structuredContent, JSON.stringify(r)).toMatchObject({ estado: 'aplicada', lectura_verificada: true, recibo: { status: 'open', due_date: nueva_fecha } });
  const repetida = await call('confirmar', confirmacion);
  expect(repetida.structuredContent?.recibo).toEqual(r.structuredContent.recibo);
  const despues = await api.detalle(event_id);
  expect(despues.evento).toMatchObject({ estado: 'abierto', plazo: nueva_fecha });
  expect((await api.eventos()).find(e => e.id === event_id)).toMatchObject({ estado: 'abierto', plazo: nueva_fecha });
  expect(despues.rutas).toEqual(antes.rutas);
  expect(bloqueoBorradoresInvitacion(despues)).toBeNull();
  const pendiente = despues.rutas[0].participaciones.find(p => p.estado === 'invitada');
  expect(pendiente).toBeDefined();
  expect(bloqueoCaptura(despues, pendiente!)).toBeNull();
  const mcp = await call('evento', { event_id });
  expect(mcp.isError, JSON.stringify(mcp)).not.toBe(true);
  expect(JSON.stringify(mcp.structuredContent)).toContain(nueva_fecha);
  expect(actions.filter(a => ESCRITURAS['rateware-api'].has(a))).toEqual([
    'reopen_rfx_event_if_unchanged', 'reopen_rfx_event_if_unchanged',
  ]);
}, 240000);

it.skipIf(!container || !root || !reopen)('dos confirmaciones distintas compiten por la misma versión y el MCP informa la espera vencida', async () => {
  const pg = await postgresReapertura(container!, root!);
  const { call, enable, actions } = localMcp('admin', pg.send);
  enable();
  async function preparar(fecha: string) {
    const vista = await call('preparar_reapertura_evento', { event_id: pg.eventId, nueva_fecha: fecha, motivo: 'Prueba de concurrencia' });
    expect(vista.structuredContent, JSON.stringify(vista)).toMatchObject({ estado: 'vista_previa' });
    return { confirmacion_id: vista.structuredContent.confirmacion_id, frase_ok: 'Sí, confirmo' };
  }
  const agotada = await preparar('2099-01-10');
  const fechas = ['2099-01-11', '2099-01-12'];
  const opciones = [await preparar(fechas[0]), await preparar(fechas[1])];
  const { resultados } = await pg.withRowLock(async () => {
    const timeout = (await call('confirmar', agotada)).structuredContent;
    expect(timeout).toMatchObject({ estado: 'rechazada', codigo: 'EVENTO_CAMBIO', reintentar: false });
    expect(pg.failures.get(timeout.operation_id)).toBe('55P03');
    expect(await pg.state()).toEqual({ status: 'closed', due: '2000-01-01', receipts: [] });
    const resultados = Promise.all(opciones.map(args => call('confirmar', args)));
    await expect.poll(pg.waiters, { interval: 50, timeout: 4000 }).toBe(2);
    return { resultados };
  });
  const respuestas = (await resultados).map(r => r.structuredContent);
  expect(respuestas.map(r => r.estado).sort()).toEqual(['aplicada', 'rechazada']);
  const aplicada = respuestas.find(r => r.estado === 'aplicada');
  const rechazada = respuestas.find(r => r.estado === 'rechazada');
  expect(aplicada.lectura_verificada).toBe(true);
  expect(aplicada.operation_id).not.toBe(rechazada.operation_id);
  expect(rechazada).toMatchObject({ codigo: 'EVENTO_CAMBIO', reintentar: false });
  expect(pg.failures.get(rechazada.operation_id)).toBe('40001');
  expect(await pg.state()).toEqual({ status: 'open', due: fechas[respuestas.indexOf(aplicada)], receipts: [aplicada.operation_id] });
  expect(actions.filter(a => ESCRITURAS['rateware-api'].has(a))).toHaveLength(3);
}, 90000);
