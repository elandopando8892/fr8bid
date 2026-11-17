import { describe, expect, it } from "vitest";
import { transporteSimulado } from "../src/cliente/api";
import { crearEscrituras, herramientasEscritura, respuestaValida, type ContextoEscrituras } from "../src/mcp/escrituras";
import { ESCRITURAS_MCP } from "../src/mcp/transporte";
import { ESCRITURAS } from "../src/servidor/proxy";
import { crearSimulado, sembrarDemo } from "../src/simulado/semilla";

const SECRETO = new TextEncoder().encode("secreto-sintetico-de-pruebas-0123456789");
const T0 = "2026-10-29T18:00:00Z";
const horas = (h: number) => new Date(Date.parse(T0) + h * 3_600_000);
type R = { status: number; body: any; headers: Record<string, string> };

// Carrier C pasó el 3er correo sin responder: le toca el 4º intento (WhatsApp).
async function escenario({ telefono = "+528112345678", noContactar = false, permiso = "consent" as string | null, plantilla = "APPROVED" as "APPROVED" | "PENDING" | null } = {}) {
  const base = crearSimulado();
  base.sim.hoy = () => "2026-10-29";
  base.sim.ahora = () => T0;
  const demo = await sembrarDemo(base);
  const lv = demo.sim.laneVendors.find(x => x.id === demo.participaciones.C)!;
  Object.assign(lv, { bid_rate: null, invitation_status: "invited", responded_at: null, viewed_at: null });
  demo.sim.revisiones.set(lv.id, []);
  const vendor = demo.sim.vendors.find(v => v.id === lv.vendor_id)!;
  Object.assign(vendor, { whatsapp_phone: telefono, whatsapp_do_not_contact: noContactar, whatsapp_permission_basis: permiso });
  demo.sim.plantillaRecordatorio = plantilla;
  const original = demo.sim.mensajes.find(m => m.vendor_id === lv.vendor_id)!;
  for (const [i, h] of [[1, 8], [2, 20]]) demo.sim.mensajes.push({ ...structuredClone(original), id: `msg-intento-${i}`, sent_at: horas(h).toISOString(), metadata: { ...original.metadata, source: "bid_room_carrier_ask" } });
  return { ...demo, carrierC: lv.vendor_id as string, vendor };
}
type Escenario = Awaited<ReturnType<typeof escenario>>;

function mcp(x: Escenario, extra: Partial<ContextoEscrituras> = {}, alterar: (b: Record<string, any>, r: R) => R = (_b, r) => r) {
  const llamadas: Record<string, any>[] = [];
  const t = transporteSimulado(x.sim, () => "operador");
  const ej = crearEscrituras(async (s, b) => { llamadas.push(b); return alterar(b, await t(s, b)); },
    { userId: "operador", clientId: "cliente-1", email: "sales@heymarksman.com", aprobadores: ["sales@heymarksman.com"], rol: "operator", secreto: SECRETO, ahora: () => horas(33), registrar: () => {}, ...extra });
  return { ej, escritas: () => llamadas.filter(b => ESCRITURAS_MCP.has(String(b.action))) };
}
const codigo = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e: any) { return e.codigo ?? e.name ?? "ERROR"; } };
const enviadosWhatsapp = (x: Escenario) => x.sim.mensajes.filter(m => m.channel === "whatsapp" && m.status === "sent");

describe("preparar_whatsapp_intento: 4º intento por la plantilla de Meta (rateware PR #215)", () => {
  it("vista previa sin escribir: destinatario enmascarado, plantilla y variables; la liga privada no pasa por Fr8Bid", async () => {
    const x = await escenario();
    const m = mcp(x);
    const v: any = await m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC });
    expect(v).toMatchObject({ estado: "vista_previa", escrito: false, accion: "whatsapp_intento" });
    expect(m.escritas()).toEqual([]);
    expect(v.vista_previa.para).toBe("+52 •••• ••5678");
    expect(v.vista_previa.canal).toMatch(/rateware_rfx_reminder_es/);
    expect(v.vista_previa.texto).toMatch(/cierra el \d{2}\/\d{2}\/\d{4} a las 23:59 \(hora CDMX\)/);
    expect(JSON.stringify(v)).not.toMatch(/\+528112345678|token=|invitation_token/);
  });

  it("nada se envía sin «sí»: sin frase, con duda o de alguien que no es el propietario", async () => {
    const x = await escenario();
    const m = mcp(x);
    const v: any = await m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC });
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id }))).toBe("SIN_SI");
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí pero espera" }))).toBe("NO_CONFIRMADO");
    const otro = mcp(x, { email: "operador@heymarksman.com" });
    const w: any = await otro.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC });
    expect(await codigo(otro.ej("confirmar", { confirmacion_id: w.confirmacion_id, frase_ok: "sí" }))).toBe("SOLO_PROPIETARIO");
    expect([...m.escritas(), ...otro.escritas()]).toEqual([]);
    expect(enviadosWhatsapp(x)).toEqual([]);
  });

  it("con «sí» del propietario: prepara en Rateware, revisa el texto y envía 1 WhatsApp; repetirlo no se permite", async () => {
    const x = await escenario();
    const m = mcp(x);
    const v: any = await m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC });
    const r: any = await m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" });
    expect(r.estado).toBe("aplicada");
    expect(r.envio).toMatchObject({ enviados: 1, fallidos: 0 });
    expect(m.escritas().map(b => b.action)).toEqual(["prepare_whatsapp_rfx_reminder", "send_whatsapp_outreach_messages"]);
    expect(m.escritas()[0]).toMatchObject({ purpose: "rfx_reminder", vendor_id: x.carrierC, reminder_window: "attempt_4" });
    expect(m.escritas()[1].expected_versions[0].whatsapp_approval).toBeTruthy();
    expect(enviadosWhatsapp(x)).toHaveLength(1);
    expect(await codigo(m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC }))).toBe("YA_ENVIADO");
  });

  it("plantilla no aprobada en Meta: no prepara; si Rateware la rechaza al confirmar, mensaje claro y nada enviado", async () => {
    const x = await escenario({ plantilla: "PENDING" });
    const m = mcp(x);
    const e = await m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC }).catch(err => err);
    expect(e.codigo).toBe("PLANTILLA_NO_APROBADA");
    expect(e.message).toMatch(/pendiente de aprobación en Meta/);
    expect(m.escritas()).toEqual([]);

    const y = await escenario();
    const n = mcp(y, {}, (b, r) => b.action === "prepare_whatsapp_rfx_reminder"
      ? { status: 409, body: { error: "Plantilla de recordatorio pendiente de aprobación en Meta (rateware_rfx_reminder_es).", code: "PLANTILLA_RECORDATORIO_PENDIENTE" }, headers: {} } : r);
    const v: any = await n.ej("preparar_whatsapp_intento", { event_id: y.eventId, carrier_id: y.carrierC });
    const r: any = await n.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" });
    expect(r.estado).toBe("rechazada");
    expect(r.instruccion).toMatch(/pendiente de aprobación en Meta/);
    expect(n.escritas().map(b => b.action)).toEqual(["prepare_whatsapp_rfx_reminder"]);
    expect(enviadosWhatsapp(y)).toEqual([]);
  });

  it("no contactar, sin permiso o número sin lada: no prepara nada y remite al respaldo manual", async () => {
    for (const [o, motivo] of [[{ noContactar: true }, /no contactar/], [{ permiso: null }, /base de permiso/], [{ telefono: "8112345678" }, /lada internacional/]] as const) {
      const x = await escenario(o as any);
      const m = mcp(x);
      const e = await m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC }).catch(err => err);
      expect(e.codigo).toBe("NO_LISTO_PARA_META");
      expect(e.message).toMatch(motivo);
      expect(e.message).toMatch(/respaldo manual/);
      expect(m.escritas()).toEqual([]);
    }
  });

  it("«no contactar» marcado entre la vista previa y el «sí»: la relectura lo frena y no escribe", async () => {
    const x = await escenario();
    const m = mcp(x);
    const v: any = await m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC });
    x.vendor.whatsapp_do_not_contact = true;
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" }))).toBe("YA_APLICADO_O_CAMBIO");
    expect(m.escritas()).toEqual([]);
  });

  it("Rateware sin la acción desplegada: ACCION_NO_DESPLEGADA y nada enviado", async () => {
    const x = await escenario();
    x.sim.sinDesplegar.add("prepare_whatsapp_rfx_reminder");
    const m = mcp(x);
    const v: any = await m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC });
    const r: any = await m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" });
    expect(r.estado).toBe("rechazada");
    expect(r.pasos[0].codigo).toBe("ACCION_NO_DESPLEGADA");
    expect(r.instruccion).toMatch(/rateware PR #215/);
    expect(enviadosWhatsapp(x)).toEqual([]);
  });

  it("si Rateware arma variables distintas a la vista previa, no envía", async () => {
    const x = await escenario();
    const m = mcp(x, {}, (b, r) => {
      if (b.action !== "prepare_whatsapp_rfx_reminder" || r.status !== 200) return r;
      const body = structuredClone(r.body);
      body.preview.parameters[0].value = "Otro carrier";
      return { ...r, body };
    });
    const v: any = await m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC });
    const r: any = await m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" });
    expect(r.estado).toBe("rechazada");
    expect(r.pasos[0].codigo).toBe("TEXTO_DISTINTO");
    expect(m.escritas().map(b => b.action)).toEqual(["prepare_whatsapp_rfx_reminder"]);
    expect(enviadosWhatsapp(x)).toEqual([]);
  });

  it("entrega desconocida = incierta, nunca «aplicada»", async () => {
    const x = await escenario();
    const m = mcp(x, {}, (b, r) => b.action === "send_whatsapp_outreach_messages" ? { ...r, body: { ...r.body, sent: 0, failed: 1, delivery_unknown: 1 } } : r);
    const v: any = await m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC });
    const r: any = await m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" });
    expect(r.estado).toBe("incierta");
  });

  it("48h/24h quedan listos para fr8bid#72; a quien no le toca, NO_TOCA; viewer no prepara", async () => {
    const x = await escenario();
    const m = mcp(x);
    expect(await codigo(m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC, ventana: "48h" }))).toBe("VENTANA_NO_DISPONIBLE");
    const otro = x.sim.laneVendors.find(lv => lv.id === x.participaciones.A)!.vendor_id;
    expect(await codigo(m.ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: otro }))).toBe("NO_TOCA");
    expect(await codigo(mcp(x, { rol: "viewer" }).ej("preparar_whatsapp_intento", { event_id: x.eventId, carrier_id: x.carrierC }))).toBe("SIN_PERMISO");
    expect(m.escritas()).toEqual([]);
  });

  it("proxy: el envío por WhatsApp exige un mensaje recordatorio de ese evento, con versión, aprobación y confirmación", async () => {
    const x = await escenario();
    const t = transporteSimulado(x.sim, () => "operador");
    const correo = x.sim.mensajes.find(m => m.rfx_event_id === x.eventId && (m.channel ?? "email") === "email")!;
    const envio = (extra: Record<string, unknown>) => t("rateware-api", { action: "send_whatsapp_outreach_messages", rfx_event_id: x.eventId, ids: [correo.id],
      expected_versions: [{ id: correo.id, updated_at: correo.updated_at, whatsapp_approval: { signature: "x" } }], confirmed: true, confirmation_action: "send_whatsapp_outreach_messages", ...extra });
    expect((await envio({ expected_versions: [{ id: correo.id, updated_at: correo.updated_at }] })).body.code).toBe("UN_WHATSAPP");
    expect((await envio({ confirmed: false })).body.code).toBe("SIN_CONFIRMAR");
    expect((await envio({})).body.code).toBe("MENSAJE_AJENO");
    expect((await t("rateware-api", { action: "prepare_whatsapp_rfx_reminder", rfx_event_id: x.eventId, vendor_id: x.carrierC, reminder_window: "attempt_4", purpose: "otro" })).body.code).toBe("SOLO_RECORDATORIO");
    expect(x.sim.llamadas.filter(l => l.action === "send_whatsapp_outreach_messages" || l.action === "prepare_whatsapp_rfx_reminder")).toEqual([]);
  });

  it("listas cerradas: el proxy y el MCP solo agregan las dos acciones de WhatsApp; el MCP exige un mensaje con su aprobación", () => {
    for (const a of ["prepare_whatsapp_rfx_reminder", "send_whatsapp_outreach_messages"]) {
      expect(ESCRITURAS_MCP.has(a)).toBe(true);
      expect(ESCRITURAS["rateware-api"].has(a)).toBe(true);
    }
    expect(herramientasEscritura.preparar_whatsapp_intento.rol).toBe("operator");
    expect(respuestaValida("prepare_whatsapp_rfx_reminder", { row: { id: "x" } }, 0)).toBe(false);
  });
});
