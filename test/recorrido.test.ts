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
  primario,
  puedeAdjudicar,
  recorrido,
  versionMasReciente,
  versionVigente,
  type Contexto
} from "../src/dominio/recorrido";
import type { Detalle, EntregaLocal, Participacion } from "../src/dominio/tipos";
import { ESCRITURAS, manejar, sinSecretos, SOLO_SIMULADO } from "../src/servidor/proxy";
import { crearSimulado, sembrarDemo } from "../src/simulado/semilla";
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
    await op.prepararInvitaciones(event.id);

    let d = await adm.detalle(event.id);
    let r = recorrido(d, ctx());
    expect(r.pasos.slice(0, 3).map((p) => p.estado)).toEqual(["hecho", "hecho", "hecho"]);
    expect(r.actual?.clave).toBe("invitacion");
    expect(r.siguiente.teToca).toBe(true);

    // El Operador no aprueba; el Administrador aprueba el texto exacto y envía.
    await expect(op.aprobarAviso(d.avisos[0])).rejects.toMatchObject({ status: 403 });
    for (const a of d.avisos) await adm.aprobarAviso(a);
    d = await adm.detalle(event.id);
    await adm.enviarAvisos(d.avisos);
    d = await adm.detalle(event.id);
    r = recorrido(d, ctx());
    expect(d.evento.prueba).toBe(true);
    expect(d.avisos).toHaveLength(2);
    expect(d.avisos.every((a) => a.estado === "aceptado" && a.reciboProveedor)).toBe(true);
    expect(r.pasos[3].estado).toBe("hecho");
    expect(r.actual?.clave).toBe("ofertas");
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
    await sim.llamar("rateware-api", { action: "update_rfx_bid", rfx_lane_vendor_id: ids.A, bid_rate: 1740, currency: "USD", commercial_model: "fee_plus", valid_through: "2026-10-01" }, "Bearer sim:operador");
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
    await sim.llamar("rateware-api", { action: "update_rfx_bid", rfx_lane_vendor_id: ids.A, bid_rate: 1720, currency: "USD", commercial_model: "fee_plus", weekly_capacity: 5, transit_days: 2 }, "Bearer sim:operador");
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

  it("9 · aviso de adjudicación antes del recibo: bloqueado; editar el aprobado invalida la aprobación", async () => {
    let d = await cerrarYAdjudicarB();
    await expect(admin.generarAvisosAdjudicacion(eventId)).rejects.toMatchObject({ status: 409 });
    expect(recorrido(d, ctx()).pasos[9].estado).toBe("bloqueado");

    const prep = admin.prepararEntrega(d);
    const { entrega } = await admin.confirmarEntrega(eventId, prep.operationId!);
    await admin.generarAvisosAdjudicacion(eventId);
    d = await admin.detalle(eventId);
    let aviso = avisoDe(d, ids.B, "adjudicacion")!;
    expect(aviso.asunto).toMatch(/^\[PRUEBA CONTROLADA\]/);
    expect(candadosAviso(d, aviso, ctx("admin", entrega)).find((c) => c.regla === "I8")?.ok).toBe(true);

    await admin.aprobarAviso(aviso);
    d = await admin.detalle(eventId);
    aviso = avisoDe(d, ids.B, "adjudicacion")!;
    expect(aviso.estado).toBe("aprobado");
    expect(aviso.aprobadoHuella).toBe(aviso.huella);

    await admin.editarAviso(aviso, { cuerpo: aviso.cuerpo + " Cambio." });
    d = await admin.detalle(eventId);
    const editado = avisoDe(d, ids.B, "adjudicacion")!;
    expect(editado.estado).toBe("borrador");
    expect(editado.aprobadoHuella).toBeNull();
    expect(editado.huella).not.toBe(aviso.huella);
    await expect(admin.enviarAvisos([editado])).rejects.toMatchObject({ status: 409 });
    // Aprobar con la versión vieja tampoco sirve.
    await expect(admin.aprobarAviso(aviso)).rejects.toMatchObject({ status: 409 });
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
    await admin.aprobarAviso(avisoDe(d, ids.B, "adjudicacion")!);
    d = await admin.detalle(eventId);
    await admin.enviarAvisos([avisoDe(d, ids.B, "adjudicacion")!]);
    const filas = sim.bitacora.slice(inicio).map((f) => `${f.accion}:${f.de_estado}→${f.a_estado}`);
    expect(filas).toEqual([
      "rfx.event.due_date:2026-10-31→2026-10-20",
      "rfx.award:null→primary",
      "rate_staging.insert:null→pending_review",
      "rfx.award.closeout:open→awarded",
      "outreach.draft:null→draft",
      "outreach.approve:draft→approved",
      "outreach.send:approved→sent"
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

  it("sin respuesta de Rateware: 504 incierta, sin reintento automático", async () => {
    sim.fallas.sinResponder.add("list_rfx_events");
    const antes = sim.llamadas.length;
    await expect(admin.eventos()).rejects.toSatisfy((e: unknown) => e instanceof ErrorApi && e.status === 504);
    expect(sim.llamadas.length).toBe(antes + 1);
  });
});
