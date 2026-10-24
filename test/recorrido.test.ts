// Pruebas del recorrido, §9 de docs/recorrido-rfx-v0.md, contra Rateware
// simulado detrás del mismo proxy que usan las funciones /api.

import { beforeEach, describe, expect, it } from "vitest";
import { ErrorApi, MesaApi, transporteSimulado } from "../src/cliente/api";
import { huellaOferta } from "../src/dominio/huella";
import { proyeccionLoads } from "../src/dominio/loads";
import { operacionAdjudicacion, operacionEntrega, UUID_RATEWARE } from "../src/dominio/operacion";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";
import {
  avisoDe,
  candadosAdjudicacion,
  candadosAviso,
  diaCorto,
  primario,
  puedeAdjudicar,
  recorrido,
  versionMasReciente,
  versionVigente,
  type Contexto
} from "../src/dominio/recorrido";
import type { Detalle, EntregaLocal, Participacion } from "../src/dominio/tipos";
import { hojaComparativo, nombreArchivo } from "../src/dominio/exportar";
import { cambiosComerciales, describirModelo, tarifaVenta } from "../src/dominio/modelo";
import { audienciaInvitacion } from "../src/dominio/revision";
import { candidatosRecordatorio, diasEntre, preguntaAlCarrier, recordatorio, seguimiento } from "../src/dominio/seguimiento";
import { crearXlsx } from "../src/dominio/xlsx";
import { configCarrierFit } from "../src/dominio/carrierFit";
import { operacionTanda, planearTandas } from "../src/dominio/tandas";
import { ESCRITURAS, manejar, modoEscrituras, sinSecretos, SOLO_SIMULADO } from "../src/servidor/proxy";
import { crearSimulado, ORG, sembrarDemo } from "../src/simulado/semilla";
import type { RatewareSimulado } from "../src/simulado/rateware";

const SIN_ENTREGA: EntregaLocal = { estado: "sin_preparar", operationId: null, error: null };
const ctx = (rol: Contexto["rol"] = "admin", entrega = SIN_ENTREGA): Contexto => ({ rol, hoy: "2026-10-21", entrega });

let sim: RatewareSimulado;
let eventId: string;
let ids: { A: string; B: string; C: string };
let admin: MesaApi;
let operador: MesaApi;

function relojDeTicks(s: RatewareSimulado) {
  // Arranca después de la siembra (que usa el reloj real): si no, a ciertas
  // horas las versiones sembradas quedan "después" de la adjudicación.
  let t = Date.now();
  s.ahora = () => new Date((t += 1000)).toISOString();
  s.hoy = () => "2026-10-21";
}

async function preparar() {
  const demo = await sembrarDemo();
  sim = demo.sim;
  relojDeTicks(sim);
  eventId = demo.eventId;
  ids = demo.participaciones;
  admin = new MesaApi(transporteSimulado(sim, () => "admin"), () => sim.hoy());
  operador = new MesaApi(transporteSimulado(sim, () => "operador"), () => sim.hoy());
}

const part = (d: Detalle, id: string) => d.rutas.flatMap((r) => r.participaciones).find((p) => p.id === id) as Participacion;

async function adjudicar(api: MesaApi, d: Detalle, id: string, confirmaSinVigencia = false) {
  const p = part(d, id);
  return api.adjudicar({
    eventId: d.evento.id,
    participacionId: id,
    rol: "primario",
    motivo: "mejor all-in con 6 de 6 rubros",
    operationId: operacionAdjudicacion(d.evento.id, id, "primario", versionVigente(p)!.huella),
    confirmaSinVigencia
  });
}

async function cerrarYAdjudicarB() {
  await admin.cerrarAOfertas(eventId);
  const d = await admin.detalle(eventId);
  await adjudicar(admin, d, ids.B);
  return admin.detalle(eventId);
}

describe("§9 recorrido de la rebanada", () => {
  beforeEach(preparar);

  it("1 · necesidad → evento → ruta → dos carriers invitados con aviso aprobado", async () => {
    const { sim: s, carriers } = crearSimulado();
    relojDeTicks(s);
    const op = new MesaApi(transporteSimulado(s, () => "operador"), () => s.hoy());
    const adm = new MesaApi(transporteSimulado(s, () => "admin"), () => s.hoy());
    const { row: event } = await op.crearEvento({ name: "PRUEBA CONTROLADA · Monterrey → Dallas", customer: "Shipper de Prueba", due_date: "2026-10-31" });
    const { rows: lanes } = await op.importarRutas(event.id, [{ origin_city: "Monterrey", destination_city: "Dallas", equipment: "Dry Van", target_rate: 1700 }]);
    await op.preseleccionar(lanes[0].id, [carriers.A.id, carriers.B.id]);
    await op.publicar(event.id);
    s.revisar(event.id, carriers.A.id);
    s.revisar(event.id, carriers.B.id);
    await op.prepararInvitaciones(event.id, [carriers.A.id, carriers.B.id]);

    let d = await adm.detalle(event.id);
    let r = recorrido(d, ctx());
    expect(r.pasos.slice(0, 3).map((p) => p.estado)).toEqual(["hecho", "hecho", "hecho"]);
    expect(r.actual?.clave).toBe("invitacion");
    expect(r.siguiente.teToca).toBe(true);

    // El Operador no envía; el Administrador aprueba la versión exacta al enviar.
    await expect(op.enviarAvisos(event.id, d.avisos)).rejects.toMatchObject({ status: 403 });
    expect(d.avisos.every((a) => !/tok_/.test(a.cuerpo) && a.cuerpo.includes("token=[oculto]"))).toBe(true);
    await adm.enviarAvisos(event.id, d.avisos);
    d = await adm.detalle(event.id);
    r = recorrido(d, ctx());
    expect(d.evento.prueba).toBe(true);
    expect(d.avisos).toHaveLength(2);
    expect(d.avisos.every((a) => a.estado === "aceptado" && a.reciboProveedor)).toBe(true);
    expect(r.pasos[3].estado).toBe("hecho");
    expect(r.actual?.clave).toBe("ofertas");
  });

  it("captura del equipo sin `patch`: 200 sin tarifa, como rateware-api", async () => {
    const { sim: s, carriers } = crearSimulado();
    const op = new MesaApi(transporteSimulado(s, () => "operador"), () => s.hoy());
    const { row: event } = await op.crearEvento({ name: "PRUEBA CONTROLADA · captura", customer: "Shipper de Prueba", due_date: "2026-10-31" });
    const { rows: lanes } = await op.importarRutas(event.id, [{ origin_city: "Monterrey", destination_city: "Dallas", equipment: "Dry Van" }]);
    await op.preseleccionar(lanes[0].id, [carriers.A.id]);
    const lv = (await op.detalle(event.id)).rutas[0].participaciones[0];
    await s.llamar("rateware-api", { action: "update_rfx_bid", id: lv.id, row: { bid_rate: 1750, currency: "USD" } }, "Bearer sim:operador");
    expect((await op.detalle(event.id)).rutas[0].participaciones[0].versiones).toHaveLength(0);
  });

  it("sin enviar nada: publicar, marcar invitados y capturar la oferta del equipo", async () => {
    const { sim: s, carriers } = crearSimulado();
    relojDeTicks(s);
    const adm = new MesaApi(transporteSimulado(s, () => "admin"), () => s.hoy());
    const { row: event } = await adm.crearEvento({ name: "PRUEBA CONTROLADA · otro canal", customer: "Shipper de Prueba", due_date: "2026-10-31" });
    const { rows: lanes } = await adm.importarRutas(event.id, [{ origin_city: "Monterrey", destination_city: "Dallas", equipment: "Dry Van" }]);
    await adm.preseleccionar(lanes[0].id, [carriers.A.id, carriers.B.id]);
    await adm.publicar(event.id);
    let d = await adm.detalle(event.id);
    const ids = d.rutas[0].participaciones.map((p) => p.id);
    expect(recorrido(d, ctx()).actual?.clave).toBe("invitacion");

    await adm.marcarInvitadas(event.id, ids);
    d = await adm.detalle(event.id);
    expect(d.rutas[0].participaciones.every((p) => p.estado === "invitada")).toBe(true);
    expect(recorrido(d, ctx()).pasos[3].estado).toBe("hecho");

    await adm.capturarOferta({ eventId: event.id, participacionId: ids[0], tarifa: 1690, moneda: "USD", vigencia: "2026-11-30", capacidadSemanal: 1, diasTransito: 2, canal: "whatsapp", notas: "PRUEBA" });
    d = await adm.detalle(event.id);
    const v = versionVigente(part(d, ids[0]));
    expect([v?.tarifaAllIn, v?.vigenteHasta, v?.fuente]).toEqual([1690, "2026-11-30", "captura_equipo"]);
    expect(s.llamadas.some((l) => /send_outreach|generate_outreach/.test(l.action))).toBe(false);
  });

  it("captura y «marcar invitados» solo con ids del evento y con confirmación", async () => {
    const d = await admin.detalle(eventId);
    const captura = { eventId, participacionId: "rlv_ajeno", tarifa: 1, moneda: "USD", vigencia: null, capacidadSemanal: null, diasTransito: null, canal: "other" as const, notas: "" };
    await expect(admin.capturarOferta(captura)).rejects.toMatchObject({ status: 404 });
    await expect(admin.capturarOferta({ ...captura, eventId: [...EVENTOS_PROTEGIDOS][0], participacionId: ids.A })).rejects.toMatchObject({ status: 404 });
    const op = { enviar: (sv: any, b: any, a: any) => sim.llamar(sv, b, a), permitirEscrituras: true };
    expect((await manejar("rateware-api", { action: "invite_rfx_lane_vendors", event_id: eventId, ids: [ids.A] }, "Bearer sim:admin", op)).body.code).toBe("SIN_CONFIRMAR");
    expect((await manejar("rateware-api", { action: "update_rfx_bid", id: ids.A, patch: { bid_rate: 1 } }, "Bearer sim:admin", op)).body.code).toBe("FALTA_EVENTO");
    expect(versionVigente(part(await admin.detalle(eventId), ids.A))?.huella).toBe(versionVigente(part(d, ids.A))?.huella);
  });

  it("el 2º intento solo deja un borrador en la Cola, una vez por clave y solo con ids del evento", async () => {
    const op = { enviar: (sv: any, b: any, a: any) => sim.llamar(sv, b, a), permitirEscrituras: true };
    const base = { action: "draft_bid_room_carrier_message", event_id: eventId, rfx_event_id: eventId, rfx_lane_vendor_id: ids.A, body: "¿Nos comparte su oferta?", idempotency_key: `fr8bid-intento-2-${eventId}-${ids.A}` };
    expect((await manejar("rateware-api", base, "Bearer sim:admin", op)).body.code).toBe("SIN_CONFIRMAR");
    expect((await manejar("rateware-api", { ...base, body: "x".repeat(601), confirmed: true, confirmation_action: base.action }, "Bearer sim:admin", op)).body.code).toBe("TEXTO_INVALIDO");
    expect((await manejar("rateware-api", { ...base, rfx_lane_vendor_id: "rlv_ajeno", confirmed: true, confirmation_action: base.action }, "Bearer sim:admin", op)).status).toBe(404);
    const antes = (await admin.detalle(eventId)).avisos.length;
    const r1 = await admin.prepararIntento(eventId, ids.A, base.body, base.idempotency_key);
    const r2 = await admin.prepararIntento(eventId, ids.A, base.body, base.idempotency_key);
    expect(r2.outreach_message.id).toBe(r1.outreach_message.id);
    const d = await admin.detalle(eventId);
    expect(d.avisos.length).toBe(antes + 1);
    expect(d.avisos.find((a) => a.id === r1.outreach_message.id)?.estado).toBe("borrador");
  });

  it("el intento se reconoce como intento, sale como correo nuevo y se aprueba desde la Mesa con su versión", async () => {
    const r = await admin.prepararIntento(eventId, ids.A, "Seguimos buscando tarifa para la ruta.", `fr8bid-intento-2-${eventId}-${ids.A}`);
    let d = await admin.detalle(eventId);
    const intento = d.avisos.find((a) => a.id === r.outreach_message.id)!;
    expect(intento).toMatchObject({ tipo: "invitacion", intento: true, enHilo: false, estado: "borrador" });
    expect(intento.asunto).toMatch(/\| Question about /);
    // Ya no cuenta como invitación original pendiente.
    expect(d.avisos.filter((a) => a.tipo === "invitacion" && !a.intento).some((a) => a.id === intento.id)).toBe(false);
    const p = part(d, ids.A);
    await admin.marcarRevisado(eventId, p);
    d = await admin.detalle(eventId);
    const avance = await admin.enviarPorTandas(eventId, [d.avisos.find((a) => a.id === intento.id)!], { esperar: async () => {} });
    expect(avance).toMatchObject({ enviados: 1, detenido: null });
    expect((await admin.detalle(eventId)).avisos.find((a) => a.id === intento.id)?.estado).toBe("aceptado");
  });

  it("cerrar a ofertas deja el plazo original en las notas y un segundo cierre no lo pisa", async () => {
    const antes = (await admin.detalle(eventId)).evento.plazo;
    await admin.cerrarAOfertas(eventId);
    let d = await admin.detalle(eventId);
    expect(d.evento.plazo).not.toBe(antes);
    expect(d.evento.cierre).toEqual({ el: sim.hoy(), plazoOriginal: antes });
    await admin.cerrarAOfertas(eventId);
    d = await admin.detalle(eventId);
    expect(d.evento.cierre?.plazoOriginal).toBe(antes);
    expect(recorrido(d, ctx()).pasos[6].detalle).toContain(`plazo original ${diaCorto(antes!)}`);
  });

  it("modo «solo borradores»: pasa el borrador de la Cola; invitar, ofertas, adjudicar y enviar no", async () => {
    expect([modoEscrituras("si"), modoEscrituras("borradores"), modoEscrituras("no"), modoEscrituras(undefined), modoEscrituras("SI")]).toEqual(["si", "borradores", "no", "no", "no"]);
    const op = { enviar: (sv: any, b: any, a: any) => sim.llamar(sv, b, a), permitirEscrituras: false, soloBorradores: true };
    const borrador = { action: "draft_bid_room_carrier_message", event_id: eventId, rfx_event_id: eventId, rfx_lane_vendor_id: ids.A, body: "¿Nos comparte su oferta?", idempotency_key: `fr8bid-intento-3-${eventId}-${ids.A}`, confirmed: true, confirmation_action: "draft_bid_room_carrier_message" };
    expect((await manejar("rateware-api", borrador, "Bearer sim:admin", op)).status).toBe(200);
    const antes = sim.llamadas.length;
    for (const b of [
      { action: "invite_rfx_lane_vendors", event_id: eventId, ids: [ids.A], confirmed: true, confirmation_action: "invite_rfx_lane_vendors" },
      { action: "update_rfx_bid", event_id: eventId, id: ids.A, patch: { bid_rate: 1 } },
      { action: "award_rfx_lane_vendor", event_id: eventId, id: ids.A },
      { action: "send_outreach_messages", rfx_event_id: eventId, ids: ["m1"] }
    ]) expect((await manejar("rateware-api", b, "Bearer sim:admin", op)).body.code).toBe("SOLO_BORRADORES");
    expect((await manejar("rfx-bid-api", { action: "submit_bid", token: "t" }, null, op)).body.code).toBe("SOLO_BORRADORES");
    expect(sim.llamadas.length).toBe(antes);
    // Apagado del todo: ni el borrador pasa.
    expect((await manejar("rateware-api", borrador, "Bearer sim:admin", { ...op, soloBorradores: false })).body.code).toBe("ESCRITURA_NO_AUTORIZADA");
  });

  it("2 · versión 1 y luego versión 2: la 1 queda intacta y la vigente es la 2", async () => {
    const d = await admin.detalle(eventId);
    const a = part(d, ids.A);
    expect(a.versiones.map((v) => v.tarifaAllIn)).toEqual([1800, 1750]);
    expect(versionVigente(a)?.numero).toBe(2);
    const v1 = a.versiones[0];
    expect(v1.huella).toBe(huellaOferta({ ...v1 }));
    expect(v1.nota).toBeNull();
    expect(a.versiones[1].nota).toBe("ajuste por volumen");
  });

  it("3 · una versión registrada no se puede reescribir (opción a: el historial es de solo agregar)", async () => {
    const historial = sim.revisiones.get(ids.A)!;
    expect(() => {
      (historial[0] as any).bid_rate = 1;
    }).toThrow();
    expect(() => (historial as any).push({})).toThrow();
    // Fr8Bid no expone ninguna acción que edite una versión: corregir es crear otra.
    expect([...ESCRITURAS["rateware-api"], ...ESCRITURAS["rfx-bid-api"]].some((a) => /revision|history|version/.test(a))).toBe(false);
  });

  it("4 · adjudicar con evento abierto, vencida, con «no puedo» o como Operador: rechazado", async () => {
    let d = await admin.detalle(eventId);
    expect(puedeAdjudicar(candadosAdjudicacion(d, d.rutas[0], part(d, ids.B), ctx()), false)).toBe(false);
    await expect(adjudicar(admin, d, ids.B)).rejects.toMatchObject({ status: 409, code: "CANDADO" });

    // Vencida: el equipo captura una oferta con vigencia pasada.
    await sim.llamar("rateware-api", { action: "update_rfx_bid", id: ids.A, patch: { bid_rate: 1740, currency: "USD", commercial_model: "fee_plus", valid_through: "2026-10-01" } }, "Bearer sim:operador");
    await admin.cerrarAOfertas(eventId);
    d = await admin.detalle(eventId);
    expect(candadosAdjudicacion(d, d.rutas[0], part(d, ids.A), ctx()).find((c) => /Vencida/.test(c.texto))?.ok).toBe(false);
    await expect(adjudicar(admin, d, ids.A)).rejects.toMatchObject({ code: "CANDADO" });
    await expect(adjudicar(admin, d, ids.C)).rejects.toMatchObject({ code: "CANDADO" });
    await expect(adjudicar(operador, d, ids.B)).rejects.toMatchObject({ status: 403 });
    d = await admin.detalle(eventId);
    expect(d.rutas[0].participaciones.every((p) => !p.rol)).toBe(true);
  });

  it("D4 · sin vigencia se adjudica solo con confirmación explícita", async () => {
    await admin.cerrarAOfertas(eventId);
    const d = await admin.detalle(eventId);
    const c = candadosAdjudicacion(d, d.rutas[0], part(d, ids.A), ctx());
    expect(puedeAdjudicar(c, false)).toBe(false);
    expect(puedeAdjudicar(c, true)).toBe(true);
    await expect(adjudicar(admin, d, ids.A, false)).rejects.toMatchObject({ code: "CANDADO" });
    await adjudicar(admin, d, ids.A, true);
    expect(primario((await admin.detalle(eventId)).rutas[0])?.id).toBe(ids.A);
  });

  it("5 · adjudicada la v2, llega una v3: la adjudicación sigue en la v2 y se señala", async () => {
    await admin.cerrarAOfertas(eventId);
    let d = await admin.detalle(eventId);
    await adjudicar(admin, d, ids.A, true);
    // La liga ya no acepta ofertas (409); la v3 llega por captura del equipo.
    await expect(admin.enviarOferta(sim.tokenDe(ids.A), { bid_rate: 1700 })).rejects.toMatchObject({ status: 409 });
    await sim.llamar("rateware-api", { action: "update_rfx_bid", id: ids.A, patch: { bid_rate: 1720, currency: "USD", commercial_model: "fee_plus", weekly_capacity: 5, transit_days: 2 } }, "Bearer sim:operador");
    d = await admin.detalle(eventId);
    const a = part(d, ids.A);
    expect(a.adjudicada?.numero).toBe(2);
    expect(versionMasReciente(a)?.numero).toBe(3);
    const prep = admin.prepararEntrega(d);
    expect(prep.estado).toBe("sin_preparar");
    expect(prep.error).toMatch(/versión más reciente/);
  });

  it("6 · entrega con recibo en pending_review; reintento con la misma operación: mismo recibo, una tarifa", async () => {
    const d = await cerrarYAdjudicarB();
    const prep = admin.prepararEntrega(d);
    expect(prep.estado).toBe("preparada");
    expect(prep.operationId).toMatch(UUID_RATEWARE);
    expect(sim.staging.filter((s) => s.kind === "rfx_award")).toHaveLength(0);

    const r1 = await admin.confirmarEntrega(eventId, prep.operationId!);
    expect(r1.entrega.estado).toBe("confirmada");
    expect(r1.recibo).toMatchObject({ operationId: prep.operationId, insertados: 1, estadoDestino: "pending_review" });
    const r2 = await admin.confirmarEntrega(eventId, prep.operationId!);
    expect(r2.recibo).toEqual(r1.recibo);
    const tarifas = sim.staging.filter((s) => s.kind === "rfx_award");
    expect(tarifas).toHaveLength(1);
    expect(tarifas[0]).toMatchObject({ status: "pending_review", all_in_rate: 1690, rfx_bid_outcome: "awarded" });
    // Otra operación distinta para el mismo evento: 409.
    const otra = await admin.confirmarEntrega(eventId, "00000000-0000-4000-8000-000000000001");
    expect(otra.entrega.estado).toBe("rechazada");
    expect(sim.staging.filter((s) => s.kind === "rfx_award")).toHaveLength(1);
  });

  it("7 · oferta y snapshot distintos (caso 1 800 vs 1 900): rechazada sin escrituras", async () => {
    const d = await cerrarYAdjudicarB();
    sim.staging.find((s) => s.rfx_lane_vendor_id === ids.B && s.kind === "bid_snapshot")!.all_in_rate = 1790;
    const prep = admin.prepararEntrega(d);
    const r = await admin.confirmarEntrega(eventId, prep.operationId!);
    expect(r.entrega.estado).toBe("rechazada");
    expect(r.entrega.error).toMatch(/cambió/);
    expect(sim.staging.filter((s) => s.kind === "rfx_award")).toHaveLength(0);
    expect(sim.events.find((e) => e.id === eventId)!.status).toBe("open");
    expect(sim.recibos).toHaveLength(0);
  });

  it("7b · si las decisiones cambian entre preparar y confirmar, Fr8Bid no envía", async () => {
    const d = await cerrarYAdjudicarB();
    const prep = admin.prepararEntrega(d);
    await admin.quitarAdjudicacion(ids.B);
    const llamadas = sim.llamadas.filter((l) => l.action === "closeout_awarded_rfx_to_rateware").length;
    const r = await admin.confirmarEntrega(eventId, prep.operationId!);
    expect(r.entrega.estado).toBe("rechazada");
    expect(sim.llamadas.filter((l) => l.action === "closeout_awarded_rfx_to_rateware").length).toBe(llamadas);
  });

  it("8 · respuesta perdida tras el COMMIT: incierta; reintento manual con la misma operación devuelve el recibo", async () => {
    const d = await cerrarYAdjudicarB();
    const prep = admin.prepararEntrega(d);
    sim.fallas.perderRespuestaDe.add("closeout_awarded_rfx_to_rateware");
    const r1 = await admin.confirmarEntrega(eventId, prep.operationId!);
    expect(r1.entrega.estado).toBe("incierta");
    expect(sim.recibos).toHaveLength(1);
    // Recargar la página: el evento ya está adjudicado y la operación se recalcula igual.
    const tras = await admin.detalle(eventId);
    expect(tras.evento.estado).toBe("adjudicado");
    const r2 = await admin.confirmarEntrega(eventId, prep.operationId!);
    expect(r2.entrega.estado).toBe("confirmada");
    expect(r2.recibo?.operationId).toBe(prep.operationId);
    expect(sim.staging.filter((s) => s.kind === "rfx_award")).toHaveLength(1);
  });

  it("9 · aviso de adjudicación: solo tras el recibo y solo la versión que se vio", async () => {
    let d = await cerrarYAdjudicarB();
    await expect(admin.generarAvisosAdjudicacion(eventId)).rejects.toMatchObject({ status: 409, code: "RFX_NOT_CLOSED_OUT" });
    expect(recorrido(d, ctx()).pasos[9].estado).toBe("bloqueado");

    const prep = admin.prepararEntrega(d);
    const { entrega } = await admin.confirmarEntrega(eventId, prep.operationId!);
    await admin.generarAvisosAdjudicacion(eventId);
    d = await admin.detalle(eventId);
    // Como rateware-api: un borrador por carrier que participó, adjudicado o no.
    const aviso = avisoDe(d, ids.B, "adjudicacion")!;
    expect([aviso.resultado, aviso.estado]).toEqual(["adjudicado", "borrador"]);
    expect(aviso.asunto).toMatch(/^Adjudicación: /);
    expect(aviso.cuerpo).not.toMatch(/tok_/);
    expect(candadosAviso(d, aviso, ctx("admin", entrega)).every((c) => c.ok)).toBe(true);
    const noAdj = avisoDe(d, ids.A, "adjudicacion")!;
    expect(noAdj.resultado).toBe("no_adjudicado");
    // El de no adjudicación también sale desde la Mesa, con su versión exacta.
    sim.editarMensaje(noAdj.id, { text_body: noAdj.cuerpo + "\nGracias." });
    await expect(admin.enviarAvisos(eventId, [noAdj])).rejects.toMatchObject({ status: 409, code: "OUTREACH_VERSION_CONFLICT" });
    const noAdjNuevo = avisoDe(await admin.detalle(eventId), ids.A, "adjudicacion")!;
    await admin.enviarAvisos(eventId, [noAdjNuevo]);
    expect(sim.mensajes.find((m) => m.id === noAdj.id)?.status).toBe("sent");

    // Alguien edita el texto en la Cola: la versión que se vio ya no sirve.
    sim.editarMensaje(aviso.id, { text_body: aviso.cuerpo + "\nCambio." });
    await expect(admin.enviarAvisos(eventId, [aviso])).rejects.toMatchObject({ status: 409, code: "OUTREACH_VERSION_CONFLICT" });
    expect(sim.mensajes.find((m) => m.id === aviso.id)?.status).toBe("drafted");

    d = await admin.detalle(eventId);
    const nueva = avisoDe(d, ids.B, "adjudicacion")!;
    expect(nueva.version).not.toBe(aviso.version);
    await expect(operador.enviarAvisos(eventId, [nueva])).rejects.toMatchObject({ status: 403 });
    await admin.enviarAvisos(eventId, [nueva]);
    d = await admin.detalle(eventId);
    expect(avisoDe(d, ids.B, "adjudicacion")).toMatchObject({ estado: "aceptado", reciboProveedor: expect.any(String) });
    expect(recorrido(d, ctx("admin", entrega)).pasos[9].estado).toBe("hecho");

    // Volver a generar no reinicia un aviso que ya salió; reenviar tampoco pasa.
    await admin.generarAvisosAdjudicacion(eventId);
    d = await admin.detalle(eventId);
    const enviado = avisoDe(d, ids.B, "adjudicacion")!;
    expect(enviado.estado).toBe("aceptado");
    await expect(admin.enviarAvisos(eventId, [enviado])).rejects.toMatchObject({ status: 409 });
    // Un aviso de otro evento no pasa por este.
    await expect(admin.enviarAvisos("evt-ajeno", [enviado])).rejects.toMatchObject({ status: 404 });
  });

  it("10 · Loads solo tras recibo; la proyección no lleva token ni datos de otros carriers", async () => {
    let d = await cerrarYAdjudicarB();
    expect(proyeccionLoads(d, ids.B)).toBeNull();
    expect(recorrido(d, ctx()).pasos[10].estado).toBe("bloqueado");
    const prep = admin.prepararEntrega(d);
    await admin.confirmarEntrega(eventId, prep.operationId!);
    d = await admin.detalle(eventId);
    expect(recorrido(d, ctx()).pasos[10].estado).toBe("hecho");
    const p = proyeccionLoads(d, ids.B)!;
    expect(p).toMatchObject({ version_contrato: "loads.awarded-opportunity.v1", rol: "primario", tarifa_acordada: 1690 });
    const texto = JSON.stringify(p);
    expect(texto).not.toMatch(/tok_|token/i);
    expect(texto).not.toMatch(/Prueba A|Prueba C|1750|1820/);
    expect(proyeccionLoads(d, ids.A)).toBeNull();
    // Y el detalle que sale del proxy tampoco trae tokens de liga.
    const crudo = await manejar("rateware-api", { action: "list_rfx_detail", event_id: eventId }, "Bearer sim:admin", {
      enviar: (s, b, a) => sim.llamar(s, b, a),
      permitirEscrituras: false
    });
    expect(JSON.stringify(crudo.body)).not.toMatch(/tok_/);
  });

  it("11 · usuario de otra organización: 404 en cada lectura; HDships nunca aparece", async () => {
    const ajeno = new MesaApi(transporteSimulado(sim, () => "ajeno"));
    await expect(ajeno.detalle(eventId)).rejects.toMatchObject({ status: 404 });
    await expect(ajeno.cerrarAOfertas(eventId)).rejects.toMatchObject({ status: 404 });
    await expect(ajeno.confirmarEntrega(eventId, operacionEntrega(await admin.detalle(eventId)))).rejects.toMatchObject({ status: 404 });
    expect(await ajeno.eventos()).toEqual([]);

    const [hd] = EVENTOS_PROTEGIDOS;
    expect((await admin.eventos()).map((e) => e.id)).not.toContain(hd);
    expect(sim.events.some((e) => e.id === hd)).toBe(true);
    const antes = sim.llamadas.length;
    await expect(admin.detalle(hd)).rejects.toMatchObject({ status: 404 });
    await expect(admin.cerrarAOfertas(hd)).rejects.toMatchObject({ status: 404 });
    expect(sim.llamadas.length).toBe(antes); // ni siquiera llega a Rateware
  });

  it("12 · bitácora: una fila por transición del recorrido completo", async () => {
    const inicio = sim.bitacora.length;
    let d = await cerrarYAdjudicarB();
    const { entrega } = await admin.confirmarEntrega(eventId, admin.prepararEntrega(d).operationId!);
    await admin.confirmarEntrega(eventId, entrega.operationId!); // reintento: sin filas nuevas
    await admin.generarAvisosAdjudicacion(eventId);
    d = await admin.detalle(eventId);
    await admin.enviarAvisos(eventId, [avisoDe(d, ids.B, "adjudicacion")!]);
    const filas = sim.bitacora.slice(inicio).map((f) => `${f.accion}:${f.de_estado}→${f.a_estado}`);
    expect(filas).toEqual([
      "rfx.event.due_date:2026-10-31→2026-10-20",
      "rfx.award:null→primary",
      "rate_staging.insert:null→pending_review",
      "rfx.award.closeout:open→awarded",
      // un borrador por carrier que participó (A, B y C); solo sale el de B
      "outreach.draft:null→drafted",
      "outreach.draft:null→drafted",
      "outreach.draft:null→drafted",
      "outreach.send:drafted→sent"
    ]);
    // La siembra (pasos 1 a 5) también dejó una fila por transición.
    const siembra = sim.bitacora.slice(0, inicio).map((f) => f.accion);
    expect(siembra.filter((a) => a === "rfx.bid.submit")).toHaveLength(4);
    expect(siembra.filter((a) => a === "rfx.vendor.invite")).toHaveLength(3);
    expect(siembra.filter((a) => a === "outreach.send")).toHaveLength(3);
    expect(sim.bitacora.every((f) => Object.isFrozen(f))).toBe(true);
    const r = recorrido(await admin.detalle(eventId), ctx("admin", entrega));
    expect(r.pasos.map((p) => p.estado)).toEqual(Array(11).fill("hecho"));
    expect(r.siguiente.accion).toBe("Recorrido completo");
  });
});

describe("respaldo", () => {
  beforeEach(preparar);

  it("solo con primario de otro carrier; se entrega junto con el primario", async () => {
    await admin.cerrarAOfertas(eventId);
    let d = await admin.detalle(eventId);
    const ruta = d.rutas[0];
    const respaldo = (id: string) => {
      const v = versionVigente(part(d, id))!;
      return admin.adjudicar({ eventId, participacionId: id, rol: "respaldo", motivo: "capacidad extra", operationId: operacionAdjudicacion(eventId, id, "respaldo", v.huella), confirmaSinVigencia: true });
    };
    expect(candadosAdjudicacion(d, ruta, part(d, ids.A), ctx(), "respaldo").find((c) => c.regla === "I4" && /primario/.test(c.texto))?.ok).toBe(false);
    await expect(respaldo(ids.A)).rejects.toMatchObject({ status: 409 });

    await adjudicar(admin, d, ids.B);
    d = await admin.detalle(eventId);
    expect(candadosAdjudicacion(d, d.rutas[0], part(d, ids.B), ctx(), "respaldo").some((c) => !c.ok)).toBe(true);
    await respaldo(ids.A);
    d = await admin.detalle(eventId);
    expect([part(d, ids.B).rol, part(d, ids.A).rol]).toEqual(["primario", "respaldo"]);

    const prep = admin.prepararEntrega(d);
    expect(prep.estado).toBe("preparada");
    const { entrega } = await admin.confirmarEntrega(eventId, prep.operationId!);
    expect(entrega.estado).toBe("confirmada");
    d = await admin.detalle(eventId);
    expect(part(d, ids.A).entregadaEn).not.toBeNull();
  });
});

describe("condiciones de ruta (parche R1)", () => {
  beforeEach(preparar);

  it("el equipo las fija, el carrier contesta con dato y una obligatoria sin cumplir bloquea adjudicar", async () => {
    let d = await admin.detalle(eventId);
    const lane = d.rutas[0];
    expect(lane.condiciones).toEqual([]);
    expect((await admin.catalogoCondiciones()).length).toBe(29);
    await expect(admin.guardarCondiciones(eventId, lane.id, [{ condition_key: "inventada", importance: "required" }])).rejects.toMatchObject({ status: 400 });
    await operador.guardarCondiciones(eventId, lane.id, [
      { condition_key: "cargo_insurance_usd", importance: "required", target: "100,000" },
      { condition_key: "ctpat_oea", importance: "preferred", target: "si" }
    ]);
    d = await admin.detalle(eventId);
    expect(d.rutas[0].condiciones.map((c) => [c.clave, c.obligatoria, c.objetivo, c.revision])).toEqual([
      ["cargo_insurance_usd", true, 100000, 1],
      ["ctpat_oea", false, true, 1]
    ]);

    const liga = (id: string) => sim.tokenDe(id);
    const inv = await admin.invitacion(liga(ids.B));
    expect(inv.lane_conditions.map((c: { rubric_key: string }) => c.rubric_key)).toEqual(["cond.cargo_insurance_usd", "cond.ctpat_oea"]);
    const cond = (rubric_key: string, answer: string, value: unknown, comment: string | null = null) => ({ segment_key: "lane", rubric_key, answer, value, comment });
    // «Cumple» con un dato que no alcanza, o excepción sin explicar: Rateware lo rechaza.
    await expect(admin.responderRubros(liga(ids.A), [cond("cond.cargo_insurance_usd", "agree", 50000)])).rejects.toMatchObject({ status: 400 });
    await expect(admin.responderRubros(liga(ids.A), [cond("cond.cargo_insurance_usd", "exception", 50000)])).rejects.toMatchObject({ status: 400 });
    await admin.responderRubros(liga(ids.A), [cond("cond.cargo_insurance_usd", "disagree", 50000)]);
    await admin.responderRubros(liga(ids.B), [cond("cond.cargo_insurance_usd", "agree", "250,000"), cond("cond.ctpat_oea", "agree", "si")]);

    // El equipo sube el objetivo: la respuesta de B queda vieja y bloquea.
    await operador.guardarCondiciones(eventId, lane.id, [
      { condition_key: "cargo_insurance_usd", importance: "required", target: 300000 },
      { condition_key: "ctpat_oea", importance: "preferred", target: "si" }
    ]);
    await admin.cerrarAOfertas(eventId);
    d = await admin.detalle(eventId);
    const ruta = d.rutas[0];
    expect(ruta.condiciones.map((c) => c.revision)).toEqual([2, 1]);
    const bloqueaB = candadosAdjudicacion(d, ruta, part(d, ids.B), ctx()).find((c) => /Condición obligatoria/.test(c.texto));
    expect(bloqueaB?.ok).toBe(false);
    expect(candadosAdjudicacion(d, ruta, part(d, ids.A), ctx()).some((c) => !c.ok && /Póliza de carga/.test(c.texto))).toBe(true);
    // El proxy aplica el mismo candado con una lectura fresca.
    await expect(adjudicar(admin, d, ids.B)).rejects.toMatchObject({ status: 409, code: "CANDADO" });
    // Con el evento cerrado ya no cambian las condiciones ni sus respuestas.
    await expect(operador.guardarCondiciones(eventId, lane.id, [])).rejects.toMatchObject({ status: 409, code: "EVENTO_CERRADO" });
    await expect(admin.responderRubros(liga(ids.B), [cond("cond.cargo_insurance_usd", "exception", 250000, "300k desde noviembre")])).rejects.toMatchObject({ status: 409 });
  });

  it("una excepción explicada en la revisión vigente no bloquea; contra Rateware real la Mesa ya lee las condiciones (R1 en prod)", async () => {
    let d = await admin.detalle(eventId);
    await operador.guardarCondiciones(eventId, d.rutas[0].id, [{ condition_key: "cargo_insurance_usd", importance: "required", target: 300000 }]);
    await admin.responderRubros(sim.tokenDe(ids.B), [{ segment_key: "lane", rubric_key: "cond.cargo_insurance_usd", answer: "exception", value: 250000, comment: "300k desde noviembre" }]);
    await admin.cerrarAOfertas(eventId);
    d = await admin.detalle(eventId);
    const p = part(d, ids.B);
    expect(p.condiciones.cargo_insurance_usd).toMatchObject({ estado: "excepcion", valor: 250000, comentario: "300k desde noviembre", revision: 1 });
    expect(candadosAdjudicacion(d, d.rutas[0], p, ctx()).every((c) => c.ok || c.confirmable)).toBe(true);
    await adjudicar(admin, d, ids.B);

    const llamadas: string[] = [];
    const op = {
      enviar: async (_s: string, b: Record<string, unknown>) => {
        llamadas.push(String(b.action));
        return { status: 200, body: { event: { id: "e1", status: "open" }, lanes: [], rows: [] }, headers: {} };
      },
      permitirEscrituras: false,
      real: true
    };
    const api = new MesaApi(async (servicio, body) => manejar(servicio, body, "Bearer x", op), () => "2026-10-21");
    expect((await api.detalle("e1")).rutas).toEqual([]);
    expect(llamadas).toContain("list_rfx_lane_conditions");
  });
});

describe("ya respondió por otro canal", () => {
  it("marca respondió o rechazó sin tarifa, y nunca borra una oferta", async () => {
    const { s, carriers, op, adm, eventId: id } = await eventoConTres();
    const d0 = await adm.detalle(id);
    const ruta = d0.rutas[0];
    const pa = ruta.participaciones.find((p) => p.carrierId === carriers.A.id)!;
    const pb = ruta.participaciones.find((p) => p.carrierId === carriers.B.id)!;
    await op.marcarRespondio({ eventId: id, participacionId: pa.id, rechazo: false, canal: "whatsapp", nota: "preguntó por el amarre" });
    await op.marcarRespondio({ eventId: id, participacionId: pb.id, rechazo: true, canal: "email", nota: "sin unidades" });
    const d = await adm.detalle(id);
    expect(d.rutas[0].participaciones.find((p) => p.id === pa.id)?.estado).toBe("respondio");
    expect(d.rutas[0].participaciones.find((p) => p.id === pb.id)?.estado).toBe("declino");

    const llamadas: any[] = [];
    const opReal = {
      enviar: async (_s: string, b: Record<string, unknown>) => {
        llamadas.push(b);
        return { status: 200, body: { lanes: [{ invitations: [{ id: "lv1", bid_rate: 6000 }, { id: "lv2", bid_rate: null }] }] }, headers: {} };
      },
      permitirEscrituras: true,
      real: true
    };
    const con = (patch: Record<string, unknown>, lv = "lv2") => manejar("rateware-api", { action: "update_rfx_bid", event_id: "e1", id: lv, patch }, "Bearer x", opReal);
    expect((await con({ invitation_status: "responded" }, "lv1")).body.code).toBe("YA_OFERTO");
    expect((await con({ invitation_status: "invited" })).body.code).toBe("SIN_TARIFA");
    expect((await con({ notes: "x" })).body.code).toBe("SIN_TARIFA");
    expect((await con({ invitation_status: "declined", notes: "Correo: sin unidades" })).status).toBe(200);
    expect(llamadas.filter((b) => b.action === "update_rfx_bid")).toHaveLength(1);
    void s;
  });

  it("con R2 la Mesa ve sola las respuestas por correo y chat; si la revisión falla, no hay intentos", async () => {
    const { s, carriers, adm, eventId: id } = await eventoConTres();
    const d0 = await adm.detalle(id);
    expect(d0.respuestas).toEqual({});
    const pa = d0.rutas[0].participaciones.find((p) => p.carrierId === carriers.A.id)!;
    s.respuestasCarrier.push({ rfx_lane_vendor_id: pa.id, vendor_id: carriers.A.id, channels: ["email", "bid_room_chat"], count: 2, first_reply_at: "2026-10-23T09:00:00.000Z", last_reply_at: "2026-10-23T12:00:00.000Z" });
    const d = await adm.detalle(id);
    expect(d.respuestas?.[pa.id]?.canales).toEqual(["correo", "chat"]);
    s.fallas.fallarRespuestas = true;
    expect((await adm.detalle(id)).respuestas).toBeNull();

    // R2 está en rateware-prod (v716): la lectura pasa también contra Rateware real.
    const real = await manejar("rateware-api", { action: "list_rfx_carrier_replies", event_id: "e1" }, "Bearer x", { enviar: async () => ({ status: 200, body: { email_status: "checked", rows: [] }, headers: {} }), permitirEscrituras: false, real: true });
    expect(real.status).toBe(200);
  });
});

// Regla de PRIMA (22-oct): solo se invita a carriers con «Revisado» vigente.
async function eventoConTres() {
  const { sim: s, carriers } = crearSimulado();
  relojDeTicks(s);
  const op = new MesaApi(transporteSimulado(s, () => "operador"), () => s.hoy());
  const adm = new MesaApi(transporteSimulado(s, () => "admin"), () => s.hoy());
  const { row: event } = await op.crearEvento({ name: "PRUEBA CONTROLADA · revisados", customer: "Shipper de Prueba", due_date: "2026-10-31" });
  const { rows: lanes } = await op.importarRutas(event.id, [{ origin_city: "Monterrey", destination_city: "Dallas", equipment: "Dry Van" }]);
  await op.preseleccionar(lanes[0].id, [carriers.A.id, carriers.B.id, carriers.C.id]);
  await op.publicar(event.id);
  return { s, carriers, op, adm, eventId: event.id as string };
}

describe("solo carriers revisados", () => {
  it("prepara solo para revisados, dice a quién omite y por qué", async () => {
    const { s, carriers, op, adm, eventId: id } = await eventoConTres();
    s.revisar(id, carriers.A.id);
    s.revisar(id, carriers.B.id);
    s.revisar(id, carriers.B.id, false); // revocada después
    let d = await adm.detalle(id);
    const a = audienciaInvitacion(d);
    expect(a.aptas.map((p) => p.carrier)).toEqual(["Carrier Prueba A"]);
    expect(a.omitidas.map((o) => [o.p.carrier, o.motivo])).toEqual([
      ["Carrier Prueba B", "revisión revocada"],
      ["Carrier Prueba C", "sin revisión"]
    ]);

    // Sin lista de revisados, o con un carrier sin revisar, no se prepara nada.
    await expect(op.prepararInvitaciones(id, [])).rejects.toMatchObject({ status: 409, code: "REVISADOS_REQUERIDOS" });
    await expect(op.prepararInvitaciones(id, [carriers.A.id, carriers.C.id])).rejects.toMatchObject({ status: 409, code: "CARRIER_SIN_REVISION" });
    expect(s.mensajes).toHaveLength(0);

    const r = await op.prepararInvitaciones(id, [carriers.A.id]);
    expect(r.generated).toBe(1);
    expect(r.skipped_rows.map((x: any) => x.reason)).toEqual(["not_reviewed", "not_reviewed"]);
    d = await adm.detalle(id);
    expect(d.avisos).toHaveLength(1);
    await adm.enviarAvisos(id, d.avisos);
    d = await adm.detalle(id);
    // Los omitidos no detienen el recorrido, pero se ven.
    const paso4 = recorrido(d, ctx()).pasos[3];
    expect(paso4.estado).toBe("hecho");
    expect(paso4.detalle).toContain("2 sin revisión");
  });

  it("si la revisión se revoca o no se puede leer, no se envía", async () => {
    const { s, carriers, op, adm, eventId: id } = await eventoConTres();
    s.revisar(id, carriers.A.id);
    await op.prepararInvitaciones(id, [carriers.A.id]);
    s.revisar(id, carriers.A.id, false);
    let d = await adm.detalle(id);
    await expect(adm.enviarAvisos(id, d.avisos)).rejects.toMatchObject({ status: 409, code: "CARRIER_SIN_REVISION" });

    s.revisar(id, carriers.A.id);
    s.fallas.fallarRevisiones = true;
    d = await adm.detalle(id);
    expect(d.revisiones).toBeNull();
    expect(audienciaInvitacion(d).omitidas.every((o) => o.estado === "sin_consulta")).toBe(true);
    await expect(adm.enviarAvisos(id, d.avisos)).rejects.toMatchObject({ status: 503, code: "REVISION_NO_DISPONIBLE" });
    expect(s.mensajes.every((m) => m.status === "drafted")).toBe(true);
  });
});

describe("envío por tandas y cuota de Gmail", () => {
  it("tandas con operation_id fijo; la cuota detiene, deja «en cola» y no duplica", async () => {
    const { sim: s, carriers } = crearSimulado();
    relojDeTicks(s);
    const op = new MesaApi(transporteSimulado(s, () => "operador"), () => s.hoy());
    const adm = new MesaApi(transporteSimulado(s, () => "admin"), () => s.hoy());
    const extra = Array.from({ length: 4 }, (_, i) => s.agregarVendor(ORG, `Carrier Extra ${i + 1}`));
    const vendors = [carriers.A, carriers.B, carriers.C, ...extra];
    const { row: event } = await op.crearEvento({ name: "PRUEBA CONTROLADA · tandas", customer: "Shipper de Prueba", due_date: "2026-10-31" });
    const { rows: lanes } = await op.importarRutas(event.id, [{ origin_city: "Monterrey", destination_city: "Dallas", equipment: "Dry Van" }]);
    await op.preseleccionar(lanes[0].id, vendors.map((v) => v.id));
    await op.publicar(event.id);
    for (const v of vendors) s.revisar(event.id, v.id);
    await op.prepararInvitaciones(event.id, vendors.map((v) => v.id));
    let d = await adm.detalle(event.id);
    expect(planearTandas(d.avisos, 3).map((t) => t.length)).toEqual([3, 3, 1]);
    expect(operacionTanda(event.id, d.avisos)).toBe(operacionTanda(event.id, [...d.avisos].reverse()));

    const inicial = d.avisos;
    s.fallas.cuotaGmail = 4;
    const esperas: number[] = [];
    const r = await adm.enviarPorTandas(event.id, d.avisos, { tamano: 3, esperaMs: 60000, esperar: async (ms) => void esperas.push(ms) });
    expect(r).toMatchObject({ tandas: 3, hechas: 2, enviados: 4, enCola: 2, detenido: expect.stringContaining("cuota") });
    expect(esperas).toEqual([60000]); // la tercera tanda ni se intenta
    d = await adm.detalle(event.id);
    const estados = d.avisos.map((a) => a.estado).sort();
    expect(estados).toEqual(["aceptado", "aceptado", "aceptado", "aceptado", "borrador", "en_cola", "en_cola"]);
    expect(d.avisos.filter((a) => a.estado === "en_cola").every((a) => a.motivo === "dailyLimitExceeded")).toBe(true);
    expect(recorrido(d, ctx()).pasos[3].estado).toBe("actual");

    // Repetir la misma tanda (mismo operation_id, p. ej. tras perder la
    // respuesta) devuelve el resultado guardado y no reenvía nada.
    const antes = s.bitacora.filter((b) => b.accion === "outreach.send").length;
    expect(s.operacionesEnvio.size).toBe(2);
    const otraVez = await adm.enviarAvisos(event.id, planearTandas(inicial, 3)[0]);
    expect(otraVez.sent).toBe(3);
    expect(s.bitacora.filter((b) => b.accion === "outreach.send").length).toBe(antes);

    // Gmail renueva la cuota: se aprueban otra vez las pendientes, con su versión nueva.
    s.fallas.cuotaGmail = null;
    const pendientes = d.avisos.filter((a) => a.estado === "en_cola" || a.estado === "borrador");
    const fin = await adm.enviarPorTandas(event.id, pendientes, { tamano: 3, esperar: async () => {} });
    expect(fin).toMatchObject({ enviados: 3, detenido: null });
    d = await adm.detalle(event.id);
    expect(d.avisos.every((a) => a.estado === "aceptado")).toBe(true);
    expect(recorrido(d, ctx()).pasos[3].estado).toBe("hecho");
  });

  it("el proxy rechaza más de 100 avisos por llamada", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `m${i}`);
    const r = await manejar(
      "rateware-api",
      { action: "send_outreach_messages", rfx_event_id: "e1", ids, expected_versions: ids.map((id) => ({ id, updated_at: "v" })), provider: "gmail", channel: "email", confirmed: true, confirmation_action: "send_outreach_messages" },
      "Bearer x",
      { enviar: async () => { throw new Error("no debe llamar"); }, permitirEscrituras: true }
    );
    expect(r.body.code).toBe("TANDA_GRANDE");
  });
});

// Fricciones 2 y 5 (24-oct-2026): sumar un carrier sugerido, marcarlo
// «Revisado» e invitarlo sin salir de la Mesa, siempre con la plantilla en español.
describe("invitar desde la Mesa", () => {
  it("suma, marca «Revisado», prepara con la campaña de Fr8Bid en español y envía", async () => {
    const { s, carriers, op, adm, eventId: id } = await eventoConTres();
    const gena = s.agregarVendor(ORG, "Express Gena", { primary_email: "gena@ejemplo.test" });
    let d = await adm.detalle(id);
    await op.sumarAlEvento(d, gena.id);
    await op.sumarAlEvento(d, gena.id); // repetir no duplica (upsert de Rateware)
    expect(s.laneVendors.filter((lv) => lv.vendor_id === gena.id)).toHaveLength(1);

    // El Administrador lo marca «Revisado» con el contacto a la vista.
    d = await adm.detalle(id);
    const p = d.rutas[0].participaciones.find((x) => x.carrierId === gena.id)!;
    expect(audienciaInvitacion(d).omitidas.some((o) => o.p.carrierId === gena.id && o.estado === "sin_revision")).toBe(true);
    await adm.marcarRevisado(id, p);
    expect(s.revisionesCarrier.at(-1)).toMatchObject({ vendor_id: gena.id, reviewed: true, contact_snapshot: { email: "gena@ejemplo.test" } });

    const r = await op.prepararInvitaciones(id, [gena.id], "RFX-PRBA");
    expect(r.generated).toBe(1);
    expect(s.campanas).toHaveLength(1);
    expect(s.campanas[0]).toMatchObject({ rfx_event_id: id, idempotency_key: `fr8bid-invitacion-${id}`, template_id: "tpl00000-0000-4000-8000-000000000002", audience_policy: { mode: "all_eligible" } });
    // La segunda vez reutiliza la campaña.
    s.revisar(id, carriers.A.id);
    await op.prepararInvitaciones(id, [carriers.A.id]);
    expect(s.campanas).toHaveLength(1);

    d = await adm.detalle(id);
    const r2 = await adm.enviarAvisos(id, d.avisos);
    expect(r2.sent).toBe(2);
  });

  it("contra Rateware real: sin campaña de Fr8Bid, con otra plantilla o con evento cerrado no se escribe", async () => {
    const enviados: Record<string, unknown>[] = [];
    const lanes = [{ id: "l1", invitations: [{ id: "lv1", vendor_id: "v1", invitation_status: "drafted", vendors: { vendor_name: "Gena" } }] }];
    let estado = "open";
    const enviar = async (_s: string, b: Record<string, unknown>) => {
      enviados.push(b);
      if (b.action === "list_rfx_detail") return { status: 200, body: { event: { id: "e1", status: estado, due_date: "2099-01-01" }, lanes }, headers: {} };
      if (b.action === "list_outreach_templates")
        return { status: 200, body: { rows: [{ id: "t-prueba", name: "SPRINT 15 · RFx carrier invitation (PRUEBA)", channel: "email" }, { id: "t-es", name: "RFx carrier invitation - Spanish", channel: "email" }] }, headers: {} };
      if (b.action === "list_outreach_campaigns")
        return { status: 200, body: { rows: [{ id: "c-fr8", rfx_event_id: "e1", idempotency_key: "fr8bid-invitacion-e1" }, { id: "c-launch", rfx_event_id: "e1", idempotency_key: null }] }, headers: {} };
      if (b.action === "list_rfx_invitation_wave_reviews") return { status: 200, body: { rows: [{ vendor_id: "v1", reviewed: true, reviewed_at: "2026-10-24T00:00:00Z" }] }, headers: {} };
      return { status: 200, body: { ok: true }, headers: {} };
    };
    const op = { enviar, permitirEscrituras: true, real: true, hoy: () => "2026-10-24" };
    const preparar = (extra: Record<string, unknown>) =>
      manejar("rateware-api", { action: "generate_outreach_drafts", event_id: "e1", channel: "email", reviewed_vendor_ids: ["v1"], ...extra }, "Bearer x", op);
    expect((await preparar({ template_id: "t-es" })).body.code).toBe("FALTA_CAMPANA");
    expect((await preparar({ campaign_id: "c-launch", template_id: "t-es" })).body.code).toBe("CAMPANA_FR8BID");
    expect((await preparar({ campaign_id: "c-fr8", template_id: "t-prueba" })).body.code).toBe("PLANTILLA");
    expect(enviados.some((b) => b.action === "generate_outreach_drafts")).toBe(false);
    expect((await preparar({ campaign_id: "c-fr8", template_id: "t-es" })).status).toBe(200);

    const campana = (template_id: string, extra: Record<string, unknown> = {}) =>
      manejar("rateware-api", { action: "create_outreach_campaign", event_id: "e1", campaign: { rfx_event_id: "e1", template_id, name: "x", channel: "email", idempotency_key: "fr8bid-invitacion-e1", audience_policy: { mode: "all_eligible" }, ...extra } }, "Bearer x", op);
    expect((await campana("t-prueba")).body.code).toBe("PLANTILLA");
    expect((await campana("t-es", { idempotency_key: "otra" })).body.code).toBe("CAMPANA_FR8BID");
    expect((await campana("t-es", { audience_policy: { mode: "explicit", vendor_ids: ["v9"] } })).body.code).toBe("CAMPANA_FR8BID");
    expect((await campana("t-es")).status).toBe(200);

    const revisar = (extra: Record<string, unknown> = {}) =>
      manejar("rateware-api", { action: "record_rfx_invitation_wave_review", event_id: "e1", vendor_id: "v1", reviewed: true, confirmed: true, confirmation_action: "record_rfx_invitation_wave_review", ...extra }, "Bearer x", op);
    expect((await revisar({ reviewed: false })).body.code).toBe("SOLO_REVISADO");
    expect((await revisar({ confirmed: false })).body.code).toBe("SIN_CONFIRMAR");
    expect((await revisar({ vendor_id: "v-ajeno" })).status).toBe(404);
    expect((await revisar()).status).toBe(200);

    const sumar = (extra: Record<string, unknown> = {}) => manejar("rateware-api", { action: "shortlist_rfx_lane_vendors", event_id: "e1", lane_id: "l1", vendor_ids: ["v2"], ...extra }, "Bearer x", op);
    expect((await sumar({ event_id: undefined })).body.code).toBe("FALTA_EVENTO");
    expect((await sumar({ lane_id: "l-ajena" })).status).toBe(404);
    expect((await sumar()).status).toBe(200);
    estado = "awarded";
    expect((await sumar()).body.code).toBe("EVENTO_CERRADO");
    expect((await revisar()).body.code).toBe("EVENTO_CERRADO");

    // Con escrituras apagadas, ninguna de estas pasa.
    const apagado = { ...op, permitirEscrituras: false };
    expect((await manejar("rateware-api", { action: "shortlist_rfx_lane_vendors", event_id: "e1", lane_id: "l1", vendor_ids: ["v2"] }, "Bearer x", apagado)).status).toBe(423);
  });
});

describe("seguimiento por carrier y recordatorio", () => {
  it("distingue abrió, no abrió, ofertó y declinó; recuerda solo a quien falta", async () => {
    const { s, carriers, op, adm, eventId: id } = await eventoConTres();
    const extra = s.agregarVendor(ORG, "Carrier Prueba D");
    const lane = s.lanes.find((l) => l.rfx_event_id === id)!;
    await op.preseleccionar(lane.id, [extra.id]);
    for (const c of [carriers.A, carriers.B, carriers.C, extra]) s.revisar(id, c.id);
    await op.prepararInvitaciones(id, [carriers.A.id, carriers.B.id, carriers.C.id, extra.id]);
    let d = await adm.detalle(id);
    await adm.enviarAvisos(id, d.avisos);
    const lvDe = (vendorId: string) => s.laneVendors.find((x) => x.rfx_event_id === id && x.vendor_id === vendorId)!.id;
    const liga = (vendorId: string) => (body: Record<string, unknown>) => s.llamar("rfx-bid-api", { ...body, token: s.tokenDe(lvDe(vendorId)) }, null);
    await liga(carriers.A.id)({ action: "get_invitation" });
    await liga(carriers.A.id)({ action: "submit_bid", bid_rate: 1700, currency: "USD", commercial_model: "fee_plus" });
    await liga(carriers.B.id)({ action: "get_invitation" });
    await liga(extra.id)({ action: "get_invitation" });
    await liga(extra.id)({ action: "decline_invitation" });

    d = await adm.detalle(id);
    const filas = seguimiento(d, "2026-10-25");
    const estado = Object.fromEntries(filas.map((x) => [x.carrier, x.estado]));
    expect(estado).toEqual({ "Carrier Prueba A": "oferto", "Carrier Prueba B": "abrio", "Carrier Prueba C": "sin_abrir", "Carrier Prueba D": "declino" });
    const b = filas.find((x) => x.carrier === "Carrier Prueba B")!;
    expect(b.vistaEn).toBeTruthy();
    expect(b.invitadaEn).toBeTruthy();
    expect(b.diasSinRespuesta).toBe(diasEntre(b.invitadaEn!, "2026-10-25"));

    const candidatos = candidatosRecordatorio(d, "2026-10-25");
    expect(candidatos.map((x) => x.carrier)).toEqual(["Carrier Prueba B", "Carrier Prueba C"]);
    const r = recordatorio(d, candidatos[0]);
    expect(r.para).toBe("sales@heymarksman.com");
    expect(r.asunto).toMatch(/^Re: \[PRUEBA CONTROLADA\] Invitación /);
    expect(r.cuerpo).toContain("ya abrió la liga");
    expect(r.cuerpo).toContain("Monterrey → Dallas · Dry Van");
    expect(r.cuerpo).not.toMatch(/tok_|token=/);
    expect(r.gmail).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?view=cm/);
    expect(recordatorio(d, candidatos[1]).cuerpo).not.toContain("ya abrió");
    // Generarlo no escribe ni envía nada.
    expect(s.mensajes.filter((m) => m.status === "sent")).toHaveLength(4);

    // Cerrado a ofertas: ya no hay a quién recordar.
    await adm.cerrarAOfertas(id);
    d = await adm.detalle(id);
    expect(candidatosRecordatorio(d, s.hoy())).toEqual([]);
  });

  it("cuenta días completos entre la invitación y hoy", () => {
    expect(diasEntre("2026-10-20T23:50:00Z", "2026-10-22")).toBe(2);
    expect(diasEntre("2026-10-22T10:00:00Z", "2026-10-21")).toBe(0);
  });
});

describe("modelo comercial visible", () => {
  beforeEach(preparar);

  it("muestra el modelo con su % junto al all-in y explica qué cambió entre versiones", async () => {
    const d = await admin.detalle(eventId);
    const a = part(d, ids.A);
    const [v1, v2] = a.versiones;
    expect(describirModelo(v1)).toBe("Managed Transportation · Fee plus · margen Marksman sin indicar");
    expect(describirModelo(v2)).toBe("Managed Transportation · Sell share · share del carrier 3 %");
    expect(cambiosComerciales(v1, v2)).toEqual(["all-in 1,800 USD → 1,750 USD", "modelo Fee plus → Sell share", "share del carrier sin indicar → 3 %"]);
    // El % no altera el all-in que se compara y se adjudica.
    expect(versionVigente(a)!.tarifaAllIn).toBe(1750);
    expect(describirModelo(versionVigente(part(d, ids.B))!)).toBe("Managed Transportation · Fee plus · margen Marksman 3 %");
    expect(describirModelo({ modeloComercial: "brokerage", carrierSharePct: null, margenPct: 8 })).toBe("Brokerage (compra-venta) · markup 8 %");
    // Venta al shipper como el Board de Rateware: brokerage suma el markup (12 % por defecto).
    expect(tarifaVenta({ modeloComercial: "brokerage", carrierSharePct: null, margenPct: null, tarifaAllIn: 1000 })).toEqual({ venta: 1120, ingreso: 120, pct: 12, porDefecto: true });
    expect(tarifaVenta({ modeloComercial: "brokerage", carrierSharePct: null, margenPct: 8, tarifaAllIn: 1000 }).venta).toBe(1080);
  });
});

describe("Excel del comparativo y pregunta al carrier", () => {
  beforeEach(preparar);

  it("el Excel interno lleva carriers, costo y venta; el del shipper solo venta y modelo, sin nombres ni porcentajes", async () => {
    const d = await admin.detalle(eventId);
    const interno = hojaComparativo(d, false);
    expect(interno.filas[0]).toContain("Carrier");
    expect(interno.filas.slice(1).map((f) => [f[7], f[8], f[10], f[11]])).toEqual([
      ["Carrier Prueba B", 1690, "Managed Transportation · Fee plus", 3],
      ["Carrier Prueba A", 1750, "Managed Transportation · Sell share", 3],
      ["Carrier Prueba C", 1820, "Managed Transportation · Cost plus", "3 (por defecto)"]
    ]);
    // Interno: tarifa de venta e ingreso por modelo; C sin % usa el 3 % por defecto.
    expect(interno.filas.slice(1).map((f) => [f[11], f[12], f[13]])).toEqual([
      [3, 1740.7, 50.7],
      [3, 1750, 52.5],
      ["3 (por defecto)", 1874.6, 54.6]
    ]);
    const shipper = hojaComparativo(d, true);
    const texto = JSON.stringify(shipper);
    expect(texto).not.toMatch(/Carrier Prueba|All-in|% del modelo|Ingreso|1690|1820/);
    expect(shipper.filas[0]).toContain("Tarifa de venta");
    expect(shipper.filas.slice(1).map((f) => [f[5], f[6], f[8]])).toEqual([
      ["Opción A", 1740.7, "Managed Transportation · Fee plus"],
      ["Opción B", 1750, "Managed Transportation · Sell share"],
      ["Opción C", 1874.6, "Managed Transportation · Cost plus"]
    ]);
    expect(nombreArchivo(d, true)).toBe("RFX-0001-PRBA-comparativo-shipper.xlsx");

    // Es un ZIP válido (PK…) con la hoja y el texto escapado.
    const xlsx = crearXlsx([{ nombre: "Prueba <1>", filas: [["a & b", 2]] }]);
    expect(String.fromCharCode(xlsx[0], xlsx[1])).toBe("PK");
    const crudo = new TextDecoder().decode(xlsx);
    expect(crudo).toContain("xl/worksheets/sheet1.xml");
    expect(crudo).toContain("a &amp; b");
    expect(crudo).toContain('name="Prueba &lt;1&gt;"');
  });

  it("la pregunta va en el hilo de la invitación, con la versión, sin liga y sin enviar", async () => {
    const d = await admin.detalle(eventId);
    const ruta = d.rutas[0];
    const p = part(d, ids.A);
    const enviados = sim.mensajes.filter((m) => m.status === "sent").length;
    const r = preguntaAlCarrier(d, ruta, p, "¿El all-in incluye el cruce?");
    expect(r.asunto).toMatch(/^Re: \[PRUEBA CONTROLADA\] Invitación /);
    expect(r.cuerpo).toContain("versión 2 de 1,750 USD all-in");
    expect(r.cuerpo).toContain("¿El all-in incluye el cruce?");
    expect(r.cuerpo).not.toMatch(/tok_|token=/);
    expect(decodeURIComponent(r.gmail)).toContain("¿El all-in incluye el cruce?");
    expect(sim.mensajes.filter((m) => m.status === "sent")).toHaveLength(enviados);
  });
});

describe("Carrier fit de Rateware en la Mesa", () => {
  beforeEach(preparar);

  it("pide la consulta acotada del evento y marca quién ya está invitado o revisado", async () => {
    const d = await admin.detalle(eventId);
    const cfg = configCarrierFit(d);
    expect(cfg).toMatchObject({ ranking_mode: "fit", rfx_carrier_fit: true, rfx_event_id: eventId, limit: 25 });
    expect(cfg.filters).toMatchObject({ origin: "Monterrey, NL", destination: "Dallas, TX", equipment: "Dry Van" });

    const fit = await admin.carrierFit(d);
    const [primero, segundo] = fit.sugerencias;
    expect(primero).toMatchObject({ nombre: "Carrier Prueba D", puntaje: 82, cotizaciones: 6, yaEnEvento: false, revisado: false });
    expect(primero.porque).toContain("Monterrey → Dallas");
    expect(segundo).toMatchObject({ nombre: "Carrier Prueba B", yaEnEvento: true, huecos: ["Sin tarifa aprobada reciente"] });
    // Es lectura: nada cambia en el evento.
    expect((await admin.detalle(eventId)).rutas[0].participaciones).toHaveLength(3);
  });

  it("el proxy solo deja pasar el Carrier fit de un evento, nunca el de HDships, y también contra Rateware real", async () => {
    const llamadas: any[] = [];
    const op = {
      enviar: async (_s: any, b: any) => {
        llamadas.push(b);
        return { status: 200, body: { recommendations: [] }, headers: {} };
      },
      permitirEscrituras: false,
      real: true
    };
    const [hd] = EVENTOS_PROTEGIDOS;
    expect((await manejar("rateware-api", { action: "carrier_recommendations", config: { ranking_mode: "fit" } }, "Bearer x", op)).body.code).toBe("SOLO_CARRIER_FIT");
    expect((await manejar("rateware-api", { action: "carrier_recommendations", config: { rfx_carrier_fit: true, rfx_event_id: hd } }, "Bearer x", op)).status).toBe(404);
    expect(llamadas).toHaveLength(0);
    const ok = await manejar("rateware-api", { action: "carrier_recommendations", config: { rfx_carrier_fit: true, rfx_event_id: eventId } }, "Bearer x", op);
    expect(ok.status).toBe(200);
    expect(llamadas).toHaveLength(1);
  });
});

describe("proxy de /api", () => {
  beforeEach(preparar);

  it("bloquea toda escritura hacia Rateware real sin autorización y no llama a Rateware", async () => {
    let llamado = false;
    const r = await manejar("rateware-api", { action: "closeout_awarded_rfx_to_rateware", event_id: eventId, operation_id: "00000000-0000-4000-8000-000000000001" }, "Bearer x", {
      enviar: async () => {
        llamado = true;
        return { status: 200, body: {}, headers: {} };
      },
      permitirEscrituras: false
    });
    expect(r.status).toBe(423);
    expect(llamado).toBe(false);
  });

  it("exige un operation_id válido para Rateware (versión 1–5) y rechaza acciones fuera de la rebanada", async () => {
    const op = { enviar: (s: any, b: any, a: any) => sim.llamar(s, b, a), permitirEscrituras: true };
    expect((await manejar("rateware-api", { action: "closeout_awarded_rfx_to_rateware", event_id: eventId, operation_id: "abc" }, "Bearer sim:admin", op)).status).toBe(400);
    expect((await manejar("rateware-api", { action: "closeout_awarded_rfx_to_rateware", event_id: eventId, operation_id: "00000000-0000-8000-8000-000000000001" }, "Bearer sim:admin", op)).status).toBe(400);
    expect((await manejar("rateware-api", { action: "bulk_update_staging", status: "approved" }, "Bearer sim:admin", op)).body.code).toBe("ACCION_NO_PERMITIDA");
  });

  it("quita ligas privadas y sus variantes cifradas de cualquier respuesta", () => {
    const limpio = sinSecretos({
      invitations: [{ id: "lv1", invitation_token: "t", invitation_token_encrypted: "c", invitation_token_hash: "h", bid_rate: 1800 }],
      messages: [{ id: "m1", metadata: { bid_link: "https://bid/t", channel: "email" } }]
    });
    expect(JSON.stringify(limpio)).not.toMatch(/invitation_token|bid_link/);
    expect(limpio.invitations[0].bid_rate).toBe(1800);
    expect(limpio.messages[0].metadata.channel).toBe("email");
  });

  it("cerrar a ofertas mueve el plazo: la liga responde 409 y Rateware sigue «open» hasta la entrega", async () => {
    await admin.cerrarAOfertas(eventId);
    expect(sim.events.find((e) => e.id === eventId)!.status).toBe("open");
    expect((await admin.detalle(eventId)).evento.estado).toBe("cerrado");
    const r = await manejar("rfx-bid-api", { action: "submit_bid", token: sim.tokenDe(ids.A), bid_rate: 1500, currency: "USD" }, null, {
      enviar: (s, b, a) => sim.llamar(s, b, a),
      permitirEscrituras: true
    });
    expect(r.status).toBe(409);
  });

  it("nunca manda status «closed»: en Rateware eso es la entrega sin operation_id", async () => {
    let llamado = false;
    const op = {
      enviar: async () => {
        llamado = true;
        return { status: 200, body: {}, headers: {} };
      },
      permitirEscrituras: true
    };
    for (const status of ["closed", "awarded", "archived"]) {
      const r = await manejar("rateware-api", { action: "update_rfx_event", event_id: eventId, patch: { status } }, "Bearer sim:admin", op);
      expect(r.body.code).toBe("CIERRE_POR_ENTREGA");
    }
    expect((await manejar("rateware-api", { action: "update_rfx_event", event_id: eventId, status: "open" }, "Bearer sim:admin", op)).body.code).toBe("FALTA_PATCH");
    expect(llamado).toBe(false);
  });

  it("contra Rateware real, los pasos aún no alineados se rechazan sin llamar", async () => {
    let llamadas = 0;
    const op = {
      enviar: async () => {
        llamadas++;
        return { status: 200, body: { events: [] }, headers: {} };
      },
      permitirEscrituras: true,
      real: true
    };
    for (const action of SOLO_SIMULADO["rateware-api"]) expect((await manejar("rateware-api", { action }, "Bearer x", op)).status).toBe(501);
    for (const action of SOLO_SIMULADO["rfx-bid-api"]) expect((await manejar("rfx-bid-api", { action, token: "t" }, null, op)).status).toBe(501);
    expect(llamadas).toBe(0);
    expect((await manejar("rateware-api", { action: "list_rfx_events" }, "Bearer x", op)).status).toBe(200);
  });

  it("contra Rateware real, la lista llega en `rows` y HDships no pasa del proxy", async () => {
    const [hd] = EVENTOS_PROTEGIDOS;
    const op = {
      enviar: async () => ({ status: 200, body: { rows: [{ id: hd, name: "HDships" }, { id: "e1", rfx_id: "RFx-1", name: "PRUEBA CONTROLADA X", lane_count: 1 }] }, headers: {} }),
      permitirEscrituras: false,
      real: true
    };
    const r = await manejar("rateware-api", { action: "list_rfx_events" }, "Bearer x", op);
    expect(r.body.rows.map((e: { id: string }) => e.id)).toEqual(["e1"]);
    const api = new MesaApi(async (servicio, body) => manejar(servicio, body, "Bearer x", op), () => "2026-10-21");
    expect((await api.eventos()).map((e) => [e.id, e.prueba])).toEqual([["e1", true]]);
  });

  it("contra Rateware real, el aviso sale con la versión exacta y la invitación solo a revisados", async () => {
    const enviados: Record<string, unknown>[] = [];
    const mensajes = [
      { id: "m-inv", rfx_event_id: "e1", rfx_lane_vendor_id: "lv1", status: "drafted", updated_at: "v1", metadata: {} },
      { id: "m-adj", rfx_event_id: "e1", rfx_lane_vendor_id: "lv1", status: "drafted", updated_at: "v2", text_body: "Bid Room: https://x/rfx-bid.html?token=abc123", metadata: { notice_type: "rfx_award_closeout", award_summary: { awarded: 1 } } }
    ];
    const enviar = async (_s: string, b: Record<string, unknown>) => {
      enviados.push(b);
      if (b.action === "list_rfx_detail") return { status: 200, body: { event: { id: "e1", status: "awarded" }, lanes: [] }, headers: {} };
      if (b.action === "list_outreach_messages") return { status: 200, body: { rows: mensajes }, headers: {} };
      return { status: 200, body: { sent: 1 }, headers: {} };
    };
    const enviarAviso = (id: string, version: string, extra: Record<string, unknown> = {}) => ({
      action: "send_outreach_messages", rfx_event_id: "e1", ids: [id], expected_versions: [{ id, updated_at: version }],
      provider: "gmail", channel: "email", confirmed: true, confirmation_action: "send_outreach_messages", ...extra
    });
    const apagado = { enviar, permitirEscrituras: false, real: true };
    expect((await manejar("rateware-api", enviarAviso("m-adj", "v2"), "Bearer x", apagado)).status).toBe(423);
    expect(enviados).toHaveLength(0);

    const op = { enviar, permitirEscrituras: true, real: true };
    expect((await manejar("rateware-api", enviarAviso("m-adj", "v2", { confirmed: false }), "Bearer x", op)).body.code).toBe("SIN_CONFIRMAR");
    // Desde el 24-oct-2026 las invitaciones también salen desde la Mesa, pero
    // solo a carriers con «Revisado» vigente.
    expect((await manejar("rateware-api", enviarAviso("m-inv", "v1"), "Bearer x", op)).body.code).toBe("CARRIER_SIN_REVISION");
    expect((await manejar("rateware-api", enviarAviso("m-adj", "v1"), "Bearer x", op)).body.code).toBe("OUTREACH_VERSION_CONFLICT");
    expect(enviados.some((b) => b.action === "send_outreach_messages")).toBe(false);
    expect((await manejar("rateware-api", enviarAviso("m-adj", "v2"), "Bearer x", op)).status).toBe(200);
    expect(enviados.filter((b) => b.action === "send_outreach_messages")).toEqual([enviarAviso("m-adj", "v2")]);
    // Y la liga con token del texto del aviso no sale del proxy.
    const lista = await manejar("rateware-api", { action: "list_outreach_messages", rfx_event_id: "e1" }, "Bearer x", op);
    expect(JSON.stringify(lista.body)).not.toMatch(/abc123/);
  });

  it("sin respuesta de Rateware: 504 incierta, sin reintento automático", async () => {
    sim.fallas.sinResponder.add("list_rfx_events");
    const antes = sim.llamadas.length;
    await expect(admin.eventos()).rejects.toSatisfy((e: unknown) => e instanceof ErrorApi && e.status === 504);
    expect(sim.llamadas.length).toBe(antes + 1);
  });
});
