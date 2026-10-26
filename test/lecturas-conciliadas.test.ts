import { describe, expect, it } from "vitest";
import { MesaApi } from "../src/cliente/api";
import { aviso, detalle, resumenes } from "../src/cliente/mapear";
import { avisoDe, candadosAviso } from "../src/dominio/recorrido";
import { manejar, modoEscrituras } from "../src/servidor/proxy";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";

const event = { id: "evento-test", status: "draft", name: "PRUEBA CONTROLADA" };
const raw = { event, lanes: [] };
const message = { id: "aviso-test", rfx_lane_vendor_id: "p1", recipient_email: "prueba@example.test", text_body: "Texto sintético", updated_at: "2026-10-26T12:00:00.123456Z", status: "drafted", metadata: { notice_type: "rfx_award_closeout", rfx_lane_vendor_ids: ["p1", "p2"], award_summary: { awarded: 2 } } };
const ctx = { rol: "admin" as const, hoy: "2026-10-26", entrega: { estado: "sin_preparar" as const, operationId: null, error: null } };

describe("lecturas conciliadas sin cambiar contratos de envío", () => {
  it.each(["rows", "events"])("listado %s mantiene compatibilidad", key => {
    expect(resumenes({ [key]: [event] }).map(e=>e.id)).toEqual([event.id]);
  });
  it("rows vacío tiene prioridad", () => expect(resumenes({ rows: [], events: [event] })).toEqual([]));
  it.each([null, false, {}, ""])("rows inválido %s no parece un listado vacío", rows => {
    expect(() => resumenes({ rows, events: [event] })).toThrow();
  });
  it("aviso conserva versión exacta de microsegundos y asociaciones del publicado", () => {
    const a = aviso(message);
    expect(a.version).toBe(message.updated_at);
    expect(a).toMatchObject({ destinatario: message.recipient_email, cuerpo: message.text_body, resultado: "adjudicado" });
    expect(avisoDe(detalle(raw, [message]), "p2", "adjudicacion")?.id).toBe(message.id);
  });
  it("marca aprobación sin evidencia como por verificar, sin habilitar envío", () => {
    const d = detalle(raw, [{ ...message, status: "approved" }]);
    expect(d.avisos[0].estado).toBe("por_verificar");
    expect(candadosAviso(d, d.avisos[0], ctx).some(c=>!c.ok)).toBe(true);
    expect(d.avisos[0].version).toBe(message.updated_at);
  });
  it("excluye WhatsApp del panel Gmail y conserva avisos heredados sin canal", () => {
    const d=detalle(raw,[message,{...message,id:"email",channel:"email"},{...message,id:"wa",channel:"whatsapp"}]);
    expect(d.avisos.map(a=>a.id)).toEqual([message.id,"email"]);
  });
  it.each([false,true])("detalle conserva las consultas R1/R2 y rechaza página incompleta %s", async incomplete => {
    const calls: Record<string,unknown>[]=[];
    const api=new MesaApi(async(_s,b)=>{
      calls.push(b);
      return {status:200,headers:{},body:b.action==="list_rfx_detail"?raw:b.action==="list_outreach_messages"?{rows:[message],has_more:incomplete}:{rows:[],email_status:"checked"}};
    });
    if(incomplete) await expect(api.detalle(event.id)).rejects.toMatchObject({code:"LECTURA_INCOMPLETA"});
    else expect((await api.detalle(event.id)).avisos).toHaveLength(1);
    expect(calls.find(c=>c.action==="list_outreach_messages")).toMatchObject({rfx_event_id:event.id,channel:"email"});
    for(const action of ["list_rfx_lane_conditions","list_rfx_invitation_wave_reviews","list_rfx_carrier_replies"]) expect(calls.some(c=>c.action===action)).toBe(true);
    expect(calls.every(c=>String(c.action).startsWith("list_"))).toBe(true);
  });
  it("protege simultáneamente rows/events y rfx_event_id sin tocar el origen", async()=>{
    const [protectedId]=EVENTOS_PROTEGIDOS;
    const data={rows:[event,{id:"otra",rfx_event_id:protectedId}],events:[event,{id:protectedId}]};
    const original=JSON.stringify(data);
    const r=await manejar("rateware-api",{action:"list_rfx_events"},"Bearer synthetic",{permitirEscrituras:false,real:true,enviar:async()=>({status:200,headers:{},body:data})});
    expect(r.body.rows).toEqual([event]);expect(r.body.events).toEqual([event]);
    expect(JSON.stringify(data)).toBe(original);
  });
  it("preserva el modo borradores y el bloqueo de escrituras", async()=>{
    expect(modoEscrituras("borradores")).toBe("borradores");
    const actions:string[]=[];
    const r=await manejar("rateware-api",{action:"closeout_awarded_rfx_to_rateware",event_id:event.id},"Bearer synthetic",{permitirEscrituras:false,real:true,enviar:async(_s,b)=>{actions.push(String(b.action));return {status:200,body:{},headers:{}};}});
    expect(r.status).toBe(423);expect(actions).toEqual([]);
  });
});
