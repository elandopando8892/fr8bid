import { describe, expect, it } from "vitest";
import { crearEscrituras, herramientasEscritura, type ContextoEscrituras } from "../src/mcp/escrituras";
import { firmar, huella } from "../src/mcp/confirmacion";
import { crearServidor } from "../src/mcp/servidor";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { transporteEscritura } from "../src/mcp/transporte";

const id = (n:number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const payload = {name:'XBF | Mexicali–Yuma | Amphenol Pickup | 6 Pallets',event_type:'spot',bid_visibility_mode:'private',operation_start_date:'2026-11-18',lanes:[{
  origin:'Amphenol Corporation, Carretera San Felipe 270, Colonia El Dorado, Mexicali, Baja California, México, CP 21383',
  destination:'Yuma Airport, Arizona, Estados Unidos',operation:'D2D Export',notes:'6 pallets; peso, dimensiones y horarios pendientes',carrier_requirements:'CTPAT preferente'
}]};
const complete=()=>({...payload,lanes:payload.lanes.map(l=>({...l,currency:'USD'}))}); // Explicit synthetic currency, not inferred.
function scenario(extra:Partial<ContextoEscrituras>={}) {
  const calls:Record<string,any>[]=[], logs:Record<string,unknown>[]=[];
  let clock=new Date('2026-11-17T12:00:00Z'), org='org-a', badReceipt=false, failRead=false, failWrite=0, throwWrite=false;
  const receipts=new Map<string,any>();
  const ctx:ContextoEscrituras={userId:id(1),clientId:'chat-1',rol:'operator',email:'sales@heymarksman.com',secreto:new TextEncoder().encode('synthetic-secret-only-01234567890123456789'),ahora:()=>clock,registrar:x=>logs.push(x),...extra};
  const t=async(_s:string,b:Record<string,any>)=>{
    calls.push(b);
    if(b.action==='preview_rfx_event_creation') return {status:200,headers:{},body:{contract_version:'rfx-draft-v1',actor_id:id(1),organization_id:org,payload:b.payload,can_create:!!b.payload.lanes[0].currency,missing:['customer_id','equipment','target_rate','due_date'],warnings:['Peso, dimensiones y horarios pendientes']}};
    if(b.action==='create_rfx_event_draft') {
      if(throwWrite) throw Error('timeout');
      if(failWrite) return {status:failWrite,body:{},headers:{}};
      if(!receipts.has(b.operation_id)) receipts.set(b.operation_id,{event_id:id(2),folio:'RFx-persisted',estado:'draft',actor_id:id(1),organization_id:org,created_at:'2026-11-17T12:00:00Z',persistencia:'completa',rutas:[{id:id(3),rfx_event_id:id(2),lane_number:1}]});
      return {status:200,headers:{},body:badReceipt?{...receipts.get(b.operation_id),organization_id:'wrong-org'}:receipts.get(b.operation_id)};
    }
    if(b.action==='list_rfx_detail') return {status:failRead?503:200,headers:{},body:{event:{id:id(2),status:'draft',organization_id:org},lanes:[{id:id(3),rfx_event_id:id(2)}]}};
    throw Error(`Unexpected action ${b.action}`);
  };
  const run=crearEscrituras(t,ctx);
  const prepare=()=>run('preparar_evento',complete());
  const confirm=(token:string,frase_ok='sí')=>run('confirmar_creacion_evento',{confirmacion_id:token,frase_ok});
  return {ctx,t,run,prepare,confirm,calls,logs,receipts,writeCalls:()=>calls.filter(c=>c.action==='create_rfx_event_draft'),
    expire:()=>{clock=new Date('2026-11-17T12:16:00Z')},changeOrg:()=>{org='org-b'},badReceipt:()=>{badReceipt=true},failRead:()=>{failRead=true},failWrite:(n:number)=>{failWrite=n},throwWrite:()=>{throwWrite=true}};
}

describe('RFx draft preparation and human confirmation',()=>{
  it('acceptance scenario stays incomplete without inventing required currency or shipment data',async()=>{
    const s=scenario(), p=await s.run('preparar_evento',payload);
    expect(p.estado).toBe('incompleta'); expect(p.confirmacion_id).toBeNull(); expect(p.escrito).toBe(false);
    expect(s.writeCalls()).toHaveLength(0); expect(p.vista_previa.payload).toEqual(payload);
  });
  it('preview writes nothing; explicit approval creates draft with persisted IDs and verifies read',async()=>{
    const s=scenario(), p=await s.prepare(); expect(s.writeCalls()).toHaveLength(0);
    const r=await s.confirm(p.confirmacion_id); expect(r).toMatchObject({estado:'aplicada',event_id:id(2),folio:'RFx-persisted',estado_evento:'draft',persistencia:'completa',lectura_verificada:true,reintentar:false});
    expect(r.mesa_url).toBe(`https://fr8bid.heymarksman.com/eventos/${id(2)}`);
    expect(s.calls.map(c=>c.action)).toEqual(['preview_rfx_event_creation','preview_rfx_event_creation','create_rfx_event_draft','list_rfx_detail']);
    expect(s.writeCalls()[0].expected_preview_hash).toBe(huella(p.vista_previa));
  });
  it('same confirmation retains the operation key and backend returns one event',async()=>{
    const s=scenario(),p=await s.prepare(); const a=await s.confirm(p.confirmacion_id),b=await s.confirm(p.confirmacion_id);
    expect(a.event_id).toBe(b.event_id);expect(s.receipts.size).toBe(1);expect(s.writeCalls()[0].operation_id).toBe(s.writeCalls()[1].operation_id);
  });
  it.each([{status:'open'},{organization_id:'other'},{due_date:'2026-02-30'},{lanes:[]},{lanes:[{...complete().lanes[0],target_rate:-1}]}])('rejects invalid/injected input %j',async patch=>{
    const s=scenario();await expect(s.run('preparar_evento',{...complete(),...patch})).rejects.toThrow();expect(s.calls).toHaveLength(0);
  });
  it('rejects viewers, nonowner confirmation and removed role',async()=>{
    const s=scenario(),p=await s.prepare();
    await expect(scenario({rol:'viewer'}).prepare()).rejects.toMatchObject({codigo:'SIN_PERMISO'});
    await expect(scenario({email:'other@test.invalid'}).confirm(p.confirmacion_id)).rejects.toMatchObject({codigo:'SOLO_PROPIETARIO'});
    await expect(scenario({rol:'viewer'}).confirm(p.confirmacion_id)).rejects.toMatchObject({codigo:'SIN_PERMISO'});
  });
  it.each(['no','sí pero espera','quizá',''])('requires affirmative literal %j',async phrase=>{
    const s=scenario(),p=await s.prepare();await expect(s.confirm(p.confirmacion_id,phrase)).rejects.toThrow();expect(s.writeCalls()).toHaveLength(0);
  });
  it('rejects expiry, changed session and organization before writing',async()=>{
    const s=scenario(),p=await s.prepare();s.expire();await expect(s.confirm(p.confirmacion_id)).rejects.toMatchObject({codigo:'CONFIRMACION_INVALIDA'});
    await expect(scenario({clientId:'other-chat'}).confirm(p.confirmacion_id)).rejects.toMatchObject({codigo:'CONFIRMACION_INVALIDA'});
    const other=scenario();other.changeOrg();await expect(other.confirm(p.confirmacion_id)).rejects.toMatchObject({codigo:'VISTA_CAMBIO'});expect(other.writeCalls()).toHaveLength(0);
  });
  it('rejects token tampering, even a signed mismatched body, and generic confirmar cannot execute it',async()=>{
    const s=scenario(),p=await s.prepare();const parts=p.confirmacion_id.split('.');parts[1]=parts[1].slice(0,-2)+'xx';
    await expect(s.confirm(parts.join('.'))).rejects.toThrow();
    const f=await firmar({sub:s.ctx.userId,client_id:s.ctx.clientId,act:'crear_evento',ev:'nuevo',arg:complete(),cuerpos:[{action:'send_outreach_messages',payload:complete(),operation_id:id(9)}],pre:huella(p.vista_previa)},s.ctx.secreto!,new Date('2026-11-17T12:00:00Z'));
    await expect(s.confirm(f.token)).rejects.toThrow();
    await expect(s.run('confirmar',{confirmacion_id:p.confirmacion_id,frase_ok:'sí'})).rejects.toThrow();expect(s.writeCalls()).toHaveLength(0);
  });
  it.each([500,504])('uncertain HTTP %d never retries',async status=>{
    const s=scenario(),p=await s.prepare();s.failWrite(status);expect(await s.confirm(p.confirmacion_id)).toMatchObject({estado:'incierta',reintentar:false});expect(s.writeCalls()).toHaveLength(1);
  });
  it('network uncertainty and malformed receipt never claim success',async()=>{
    for(const behavior of ['throwWrite','badReceipt'] as const){const s=scenario(),p=await s.prepare();s[behavior]();expect(await s.confirm(p.confirmacion_id)).toMatchObject({estado:'incierta',reintentar:false});expect(s.writeCalls()).toHaveLength(1);}
  });
  it('failed post-read retains persisted receipt with pending verification',async()=>{
    const s=scenario(),p=await s.prepare();s.failRead();expect(await s.confirm(p.confirmacion_id)).toMatchObject({estado:'parcial',event_id:id(2),persistencia:'completa',lectura_verificada:false});expect(s.writeCalls()).toHaveLength(1);
  });
  it('HTTP MCP discovery declares read and write accurately and excludes viewer',async()=>{
    for(const role of ['operator','viewer'] as const){const s=scenario(),server=crearServidor(s.t,role,s.ctx.ahora,{...s.ctx,t:s.t});const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined});await server.connect(transport);
      const response=await transport.handleRequest(new Request('http://localhost/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})}));
      const raw=await response.text();expect(raw.includes('preparar_evento')).toBe(role==='operator');expect(raw.includes('confirmar_creacion_evento')).toBe(role==='operator');await server.close();
    }
  });
  it('write transport forwards user token once, with no service credential',async()=>{
    const calls:any[]=[];const t=transporteEscritura('https://fr8bid.test/api/mcp','synthetic-user',async(url,init)=>{calls.push({url,init});return new Response('{}',{status:403})});
    const r=await t('rateware-api',{action:'create_rfx_event_draft'});expect(r.status).toBe(403);expect(calls).toHaveLength(1);expect(calls[0].init.headers.authorization).toBe('Bearer synthetic-user');
  });
});

describe("creación RFx desde MCP", () => {
  it("publica preparación y confirmación separadas de invitaciones", () => {
    expect(herramientasEscritura).toHaveProperty("preparar_evento");
    expect(herramientasEscritura).toHaveProperty("confirmar_creacion_evento");
  });
});
