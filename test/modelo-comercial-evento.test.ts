// Decisión 4 del recorrido (Jose, 23 y 24-nov-2026): el evento dice qué modelos
// comerciales acepta; elegir uno es opcional para el carrier. Con un solo modelo
// aceptado la oferta cuenta con ese; con varios queda «sin elegir» y el equipo lo
// define antes de adjudicar. Contra Rateware simulado detrás del mismo proxy.

import { beforeEach, describe, expect, it } from "vitest";
import { MesaApi, transporteSimulado } from "../src/cliente/api";
import { hojaComparativo } from "../src/dominio/exportar";
import { describirModelo, modeloCorto, tarifaVenta, textoModelosAceptados } from "../src/dominio/modelo";
import { operacionAdjudicacion } from "../src/dominio/operacion";
import { candadosAdjudicacion, propuestaPrimarios, puedeAdjudicar, versionVigente, type Contexto } from "../src/dominio/recorrido";
import { fueraDeAceptados, modelosMixtos, sinModelo } from "../src/dominio/resumenOfertas";
import type { Detalle, ModeloComercial, Participacion } from "../src/dominio/tipos";
import { ESCRITURAS, manejar } from "../src/servidor/proxy";
import type { RatewareSimulado } from "../src/simulado/rateware";
import { crearSimulado } from "../src/simulado/semilla";

const ctx = (rol: Contexto["rol"] = "admin"): Contexto => ({ rol, hoy: "2026-10-21", entrega: { estado: "sin_preparar", operationId: null, error: null } });

let sim: RatewareSimulado;
let admin: MesaApi;
let operador: MesaApi;
let visor: MesaApi;
let eventId: string;
let A: string;
let B: string;

// Un evento abierto con una ruta y dos carriers invitados, sin ofertas todavía.
async function preparar(aceptados?: ModeloComercial[]) {
  const base = crearSimulado();
  sim = base.sim;
  let t = Date.parse("2026-10-21T15:00:00.000Z");
  sim.ahora = () => new Date((t += 1000)).toISOString();
  sim.hoy = () => "2026-10-21";
  admin = new MesaApi(transporteSimulado(sim, () => "admin"), () => sim.hoy());
  operador = new MesaApi(transporteSimulado(sim, () => "operador"), () => sim.hoy());
  visor = new MesaApi(transporteSimulado(sim, () => "consulta"), () => sim.hoy());
  const { row: event } = await operador.crearEvento({ name: "PRUEBA CONTROLADA · modelos", customer: "Shipper de Prueba", due_date: "2026-10-31" });
  eventId = event.id;
  const { rows: lanes } = await operador.importarRutas(eventId, [{ origin_city: "Monterrey", destination_city: "Dallas", equipment: "Dry Van", target_rate: 1700, currency: "USD" }]);
  const { rows } = await operador.preseleccionar(lanes[0].id, [base.carriers.A.id, base.carriers.B.id]);
  [A, B] = rows.map((r: any) => r.id);
  if (aceptados) await operador.fijarModelosAceptados(eventId, aceptados);
  await operador.publicar(eventId);
  await operador.marcarInvitadas(eventId, [A, B]);
}

const oferta = (id: string, extra: Record<string, unknown> = {}) =>
  admin.enviarOferta(sim.tokenDe(id), { bid_rate: 1600, currency: "USD", weekly_capacity: 4, transit_days: 2, valid_through: "2026-11-30", ...extra });
const part = (d: Detalle, id: string) => d.rutas.flatMap((r) => r.participaciones).find((p) => p.id === id) as Participacion;
const vigente = async (id: string) => versionVigente(part(await admin.detalle(eventId), id))!;
const adjudicar = (d: Detalle, id: string) =>
  admin.adjudicar({ eventId, participacionId: id, rol: "primario", motivo: "mejor all-in", operationId: operacionAdjudicacion(eventId, id, "primario", versionVigente(part(d, id))!.huella), confirmaSinVigencia: false });
const cruda = (id: string) => sim.laneVendors.find((x) => x.id === id)!;

describe("el evento define qué modelos comerciales acepta", () => {
  it("un evento sin ajuste acepta todos; el ajuste se guarda en el paquete del evento y se lee en el detalle", async () => {
    await preparar();
    let d = await admin.detalle(eventId);
    expect(d.modelosAceptados).toBeNull();
    expect(d.modelosBloqueados).toBe(false);
    expect(textoModelosAceptados(d.modelosAceptados)).toBe("todos");

    await operador.fijarModelosAceptados(eventId, ["cost_plus", "brokerage"]);
    d = await admin.detalle(eventId);
    expect(d.modelosAceptados).toEqual(["brokerage", "cost_plus"]);
    expect(textoModelosAceptados(d.modelosAceptados)).toBe("Brokerage (buy/sell) y Cost plus");
    expect(sim.events.find((e) => e.id === eventId)!.rfx_master_package).toEqual({ carrier_commercial_policy: { accepted_models: ["brokerage", "cost_plus"] } });

    // Los cuatro o null es «todos»: no queda rastro en el paquete.
    await operador.fijarModelosAceptados(eventId, null);
    expect((await admin.detalle(eventId)).modelosAceptados).toBeNull();
    expect(sim.events.find((e) => e.id === eventId)!.rfx_master_package).toEqual({});
  });

  it("el proxy solo deja pasar la lista de claves, y el Visor no la cambia", async () => {
    await preparar();
    for (const malo of ["brokerage", ["direct_cost_plus"], ["brokerage", "premium"], [3]]) {
      await expect(admin.fijarModelosAceptados(eventId, malo as never)).rejects.toMatchObject({ status: 400, code: "MODELOS_INVALIDOS" });
    }
    await expect(visor.fijarModelosAceptados(eventId, ["brokerage"])).rejects.toMatchObject({ status: 403 });
    expect((await admin.detalle(eventId)).modelosAceptados).toBeNull();
  });

  it("con una adjudicación la lista ya no cambia; la política bloqueada tampoco se edita", async () => {
    await preparar(["brokerage", "cost_plus"]);
    await oferta(A, { commercial_model: "cost_plus" });
    await admin.cerrarAOfertas(eventId);
    await adjudicar(await admin.detalle(eventId), A);
    await expect(admin.fijarModelosAceptados(eventId, ["brokerage"])).rejects.toMatchObject({ status: 409, code: "RFX_EVENT_HAS_AWARDS" });

    await preparar();
    sim.events.find((e) => e.id === eventId)!.rfx_master_package = { carrier_commercial_policy: { locked: true, model: "brokerage" } };
    const d = await admin.detalle(eventId);
    expect(d.modelosBloqueados).toBe(true);
    expect(d.modelosAceptados).toEqual(["brokerage"]);
    await expect(admin.fijarModelosAceptados(eventId, ["cost_plus"])).rejects.toMatchObject({ status: 409, code: "COMMERCIAL_MODEL_LOCKED" });
  });
});

describe("el modelo es opcional para el carrier", () => {
  it("varios modelos aceptados y el carrier no elige: la oferta entra «sin elegir», sin tarifa de venta ni modelo por defecto", async () => {
    await preparar();
    await oferta(A);
    expect(cruda(A).commercial_model).toBeNull();
    const v = await vigente(A);
    expect(v.modeloComercial).toBeNull();
    expect(v.modeloDelEvento).toBeUndefined();
    expect(describirModelo(v)).toBe("Modelo comercial sin elegir");
    expect(modeloCorto(v)).toBe("Sin elegir");
    expect(tarifaVenta(v)).toBeNull();

    const d = await admin.detalle(eventId);
    expect(sinModelo(d).map((x) => x.p.id)).toEqual([A]);
    expect(modelosMixtos(d)).toEqual([]);
    // El shipper nunca ve el costo del carrier: sin modelo no hay venta que mostrar.
    const [, anonima] = hojaComparativo(d, true).filas;
    expect(anonima).toContain("Por definir (falta el modelo comercial)");
    expect(anonima).not.toContain(1600);
    const [, interna] = hojaComparativo(d, false).filas;
    expect(interna.slice(8, 14)).toEqual([1600, "USD", "Sin elegir", null, "Por definir (falta el modelo comercial)", null]);
  });

  it("un solo modelo aceptado: la oferta cuenta con ese sin que el carrier elija", async () => {
    await preparar(["sell_share"]);
    await oferta(A);
    expect(cruda(A).commercial_model).toBe("sell_share");
    const v = await vigente(A);
    expect(v.modeloComercial).toBe("sell_share");
    expect(tarifaVenta(v)).toEqual({ venta: 1600, ingreso: 48, pct: 3, porDefecto: true });
    expect(sinModelo(await admin.detalle(eventId))).toEqual([]);
  });

  it("un modelo que el evento no acepta se rechaza, y uno aceptado se guarda como lo eligió", async () => {
    await preparar(["brokerage", "cost_plus"]);
    await expect(oferta(A, { commercial_model: "sell_share", language: "es" })).rejects.toMatchObject({ status: 409, code: "COMMERCIAL_MODEL_NOT_ACCEPTED", message: "Este evento no acepta ese modelo comercial. Acepta: XBF compra-venta, Costo + margen." });
    await expect(oferta(A, { commercial_model: "premium" })).rejects.toMatchObject({ status: 400, code: "COMMERCIAL_MODEL_INVALID" });
    expect(cruda(A).bid_rate ?? null).toBeNull();
    await oferta(A, { commercial_model: "xbf_buy_sell", marksman_margin_pct: 10 });
    expect(await vigente(A)).toMatchObject({ modeloComercial: "brokerage", margenPct: 10 });
    // Reenviar sin elegir conserva el modelo que ya tenía.
    await oferta(A, { bid_rate: 1550 });
    expect(await vigente(A)).toMatchObject({ tarifaAllIn: 1550, modeloComercial: "brokerage" });
  });

  it("una oferta sin modelo propio toma el del evento cuando el evento queda con uno solo, y lo dice", async () => {
    await preparar();
    await oferta(A);
    const antes = await vigente(A);
    await admin.fijarModelosAceptados(eventId, ["brokerage"]);
    const v = await vigente(A);
    expect(cruda(A).commercial_model).toBeNull();
    expect(v).toMatchObject({ modeloComercial: "brokerage", modeloDelEvento: true });
    expect(describirModelo(v)).toBe("Brokerage (compra-venta) · markup sin indicar · modelo del evento");
    expect(tarifaVenta(v)).toMatchObject({ venta: 1792, pct: 12, porDefecto: true });
    // La huella lleva el modelo con el que cuenta la oferta, no un cost plus inventado.
    expect(v.huella).not.toBe(antes.huella);
    const interna = hojaComparativo(await admin.detalle(eventId), false).filas[1];
    expect(interna[10]).toBe("Brokerage (compra-venta) (modelo del evento)");
  });

  it("una oferta con un modelo que el evento dejó de aceptar se conserva y se avisa", async () => {
    await preparar();
    await oferta(A, { commercial_model: "sell_share" });
    await oferta(B, { commercial_model: "cost_plus" });
    await admin.fijarModelosAceptados(eventId, ["brokerage", "cost_plus"]);
    const d = await admin.detalle(eventId);
    expect(fueraDeAceptados(d).map((x) => x.p.id)).toEqual([A]);
    expect(versionVigente(part(d, A))!.modeloComercial).toBe("sell_share");
    // No bloquea la adjudicación: su modelo propio se respeta.
    await admin.cerrarAOfertas(eventId);
    const cerrado = await admin.detalle(eventId);
    expect(puedeAdjudicar(candadosAdjudicacion(cerrado, cerrado.rutas[0], part(cerrado, A), ctx(), "primario"), false)).toBe(true);
  });
});

describe("antes de adjudicar, el equipo define el modelo de una oferta «sin elegir»", () => {
  beforeEach(async () => {
    await preparar();
    await oferta(A);
    await oferta(B, { bid_rate: 1650, commercial_model: "cost_plus", marksman_margin_pct: 3 });
    await admin.cerrarAOfertas(eventId);
  });

  it("el candado detiene la adjudicación en la página y en el servidor; el lote no salta a una más cara", async () => {
    const d = await admin.detalle(eventId);
    const candados = candadosAdjudicacion(d, d.rutas[0], part(d, A), ctx(), "primario");
    expect(candados.find((c) => /modelo comercial/i.test(c.texto))).toMatchObject({ ok: false, texto: "Sin modelo comercial: defínelo antes de adjudicar" });
    expect(puedeAdjudicar(candados, true)).toBe(false);
    expect(candadosAdjudicacion(d, d.rutas[0], part(d, B), ctx(), "primario").find((c) => /modelo comercial/i.test(c.texto))).toMatchObject({ ok: true, texto: "Modelo comercial: Cost plus" });
    expect(propuestaPrimarios(d, ctx())).toMatchObject([{ p: null, motivo: expect.stringContaining("necesita revisión a mano") }]);
    await expect(adjudicar(d, A)).rejects.toMatchObject({ status: 409, code: "CANDADO" });
    // Sin pasar por el proxy, Rateware también lo niega.
    const directo = await sim.llamar("rateware-api", { action: "award_rfx_lane_vendor", rfx_lane_vendor_id: A, award_role: "primary", award_reason: "x", operation_id: operacionAdjudicacion(eventId, A, "primario", "x") }, "Bearer sim:admin");
    expect(directo).toMatchObject({ status: 409, body: { code: "RFX_AWARD_LOCKED" } });
    expect(cruda(A).award_role ?? null).toBeNull();
  });

  it("definir el modelo solo cambia el modelo y su porcentaje; después se adjudica", async () => {
    let d = await admin.detalle(eventId);
    const p = part(d, A);
    const antes = { ...cruda(A) };
    await operador.definirModelo({ eventId, participacionId: A, modelo: "brokerage", pct: 10, version: p.actualizadaEn! });
    const fila = cruda(A);
    expect(fila).toMatchObject({ commercial_model: "brokerage", marksman_margin_pct: 10, carrier_share_pct: null });
    for (const campo of ["bid_rate", "currency", "valid_through", "weekly_capacity", "transit_days", "response_source", "responded_at", "invitation_status", "notes"]) {
      expect(fila[campo], campo).toEqual(antes[campo]);
    }
    expect(fila.updated_at).not.toBe(antes.updated_at);
    expect(sim.bitacora.at(-1)).toMatchObject({ accion: "rfx.bid.commercial_model", entidad_id: A, de_estado: null, a_estado: "brokerage" });

    d = await admin.detalle(eventId);
    const v = versionVigente(part(d, A))!;
    expect(v).toMatchObject({ modeloComercial: "brokerage", margenPct: 10, tarifaAllIn: 1600 });
    expect(v.modeloDelEvento).toBeUndefined();
    expect(tarifaVenta(v)).toEqual({ venta: 1760, ingreso: 160, pct: 10, porDefecto: false });
    expect(sinModelo(d)).toEqual([]);
    await adjudicar(d, A);
    expect(cruda(A).award_role).toBe("primary");
  });

  it("sell share guarda solo el share del carrier, y un porcentaje vacío queda sin indicar", async () => {
    const p = part(await admin.detalle(eventId), A);
    await admin.definirModelo({ eventId, participacionId: A, modelo: "sell_share", pct: 4, version: p.actualizadaEn! });
    expect(cruda(A)).toMatchObject({ commercial_model: "sell_share", marksman_margin_pct: null, carrier_share_pct: 4 });
    const otra = part(await admin.detalle(eventId), A);
    await admin.definirModelo({ eventId, participacionId: A, modelo: "fee_plus", pct: null, version: otra.actualizadaEn! });
    expect(cruda(A)).toMatchObject({ commercial_model: "fee_plus", marksman_margin_pct: null, carrier_share_pct: null });
  });

  it("solo sobre la versión que se mostró: si el carrier cambió su oferta no se escribe nada", async () => {
    const p = part(await admin.detalle(eventId), A);
    // El plazo se reabre y el carrier manda otra tarifa mientras el equipo decide.
    await admin.fijarModelosAceptados(eventId, null);
    sim.events.find((e) => e.id === eventId)!.due_date = "2026-10-31";
    await oferta(A, { bid_rate: 1500 });
    await expect(admin.definirModelo({ eventId, participacionId: A, modelo: "brokerage", pct: null, version: p.actualizadaEn! })).rejects.toMatchObject({ status: 409, code: "OFERTA_CAMBIO" });
    expect(cruda(A)).toMatchObject({ bid_rate: 1500, commercial_model: null });
    // Rateware lo vuelve a comprobar aunque el proxy no estuviera.
    const directo = await sim.llamar("rateware-api", { action: "set_rfx_bid_commercial_model", id: A, commercial_model: "brokerage", expected_updated_at: p.actualizadaEn }, "Bearer sim:admin");
    expect(directo).toMatchObject({ status: 409, body: { code: "RFX_BID_VERSION_CONFLICT" } });
  });

  it("el servidor de Fr8Bid niega lo que no es definir el modelo de una oferta sin adjudicar de este evento", async () => {
    const d = await admin.detalle(eventId);
    const p = part(d, A);
    const pedir = (cambio: Record<string, unknown>) =>
      manejar(
        "rateware-api",
        { action: "set_rfx_bid_commercial_model", event_id: eventId, id: A, commercial_model: "brokerage", expected_updated_at: p.actualizadaEn, confirmed: true, confirmation_action: "set_rfx_bid_commercial_model", ...cambio },
        "Bearer sim:admin",
        { enviar: (servicio, body, autorizacion) => sim.llamar(servicio, body, autorizacion), permitirEscrituras: true, real: false }
      );
    expect(ESCRITURAS["rateware-api"].has("set_rfx_bid_commercial_model")).toBe(true);
    expect(await pedir({ event_id: undefined })).toMatchObject({ status: 400, body: { code: "FALTA_EVENTO" } });
    expect(await pedir({ id: undefined })).toMatchObject({ status: 400, body: { code: "FALTA_PARTICIPACION" } });
    expect(await pedir({ confirmed: false })).toMatchObject({ status: 400, body: { code: "SIN_CONFIRMAR" } });
    // Nada más viaja por aquí: ni tarifa, ni vigencia, ni estado.
    expect(await pedir({ bid_rate: 1 })).toMatchObject({ status: 400, body: { code: "SOLO_MODELO" } });
    expect(await pedir({ patch: { bid_rate: 1 } })).toMatchObject({ status: 400, body: { code: "SOLO_MODELO" } });
    expect(await pedir({ marksman_margin_pct: 120 })).toMatchObject({ status: 400, body: { code: "PORCENTAJE_INVALIDO" } });
    expect(await pedir({ carrier_share_pct: "3" })).toMatchObject({ status: 400, body: { code: "PORCENTAJE_INVALIDO" } });
    expect(await pedir({ commercial_model: "direct_cost_plus" })).toMatchObject({ status: 400, body: { code: "MODELO_INVALIDO" } });
    expect(await pedir({ expected_updated_at: undefined })).toMatchObject({ status: 409, body: { code: "OFERTA_CAMBIO" } });
    expect(await pedir({ id: "no-es-de-este-evento" })).toMatchObject({ status: 404 });
    expect(cruda(A).commercial_model).toBeNull();

    // Un modelo que el evento no acepta.
    sim.events.find((e) => e.id === eventId)!.rfx_master_package = { carrier_commercial_policy: { accepted_models: ["cost_plus", "fee_plus"] } };
    expect(await pedir({})).toMatchObject({ status: 409, body: { code: "MODELO_NO_ACEPTADO", error: "Este evento no acepta ese modelo comercial. Acepta: Cost plus y Fee plus." } });
    expect(cruda(A).commercial_model).toBeNull();

    // Una oferta adjudicada ya no cambia de modelo.
    await adjudicar(d, B);
    const b = part(await admin.detalle(eventId), B);
    expect(await pedir({ id: B, commercial_model: "fee_plus", expected_updated_at: b.actualizadaEn })).toMatchObject({ status: 409, body: { code: "ADJUDICADA" } });
    expect(cruda(B).commercial_model).toBe("cost_plus");
  });

  it("el Visor no define modelos y una participación sin oferta no tiene qué definir", async () => {
    const p = part(await admin.detalle(eventId), A);
    await expect(visor.definirModelo({ eventId, participacionId: A, modelo: "brokerage", pct: null, version: p.actualizadaEn! })).rejects.toMatchObject({ status: 403 });
    await admin.rechazarOferta(eventId, B, "prueba", part(await admin.detalle(eventId), B).actualizadaEn);
    const b = part(await admin.detalle(eventId), B);
    await expect(admin.definirModelo({ eventId, participacionId: B, modelo: "brokerage", pct: null, version: b.actualizadaEn ?? "2026-10-21T15:00:00.000Z" })).rejects.toMatchObject({ status: 409, code: "SIN_OFERTA" });
  });
});

describe("captura del equipo", () => {
  it("con modelo indicado se guarda ese; sin indicar toma el único del evento o queda «sin elegir»", async () => {
    await preparar();
    const captura = (id: string, extra: Record<string, unknown> = {}) =>
      operador.capturarOferta({ eventId, participacionId: id, tarifa: 1700, moneda: "USD", vigencia: "2026-11-30", capacidadSemanal: null, diasTransito: null, canal: "email", notas: "", ...extra });
    await captura(A);
    expect(cruda(A).commercial_model).toBeNull();
    await captura(A, { modelo: "sell_share", pct: 4 });
    expect(cruda(A)).toMatchObject({ commercial_model: "sell_share", carrier_share_pct: 4, marksman_margin_pct: null });
    await captura(B, { modelo: "brokerage" });
    expect(cruda(B)).toMatchObject({ commercial_model: "brokerage", marksman_margin_pct: null });

    await preparar(["fee_plus"]);
    await captura(A);
    expect(cruda(A).commercial_model).toBe("fee_plus");
  });
});
