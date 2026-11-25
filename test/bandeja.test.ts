// Bandeja de respuestas con IA (prioridad 6, 25-nov-2026): una sola lista con lo que los
// carriers contestaron en todos los eventos abiertos, y la marca «lista» compartida.
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorApi, MesaApi, transporteSimulado } from "../src/cliente/api";
import { aBandeja, aRespuestaBandeja, ligaRespuesta } from "../src/dominio/bandeja";
import { combinarLecturas, type LecturaGuardada, type LecturaServidor } from "../src/dominio/lecturaAutomatica";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";
import { ESCRITURAS, LECTURAS, manejar } from "../src/servidor/proxy";
import { revisar, sinProtegidos } from "../src/servidor/paso";
import type { RatewareSimulado } from "../src/simulado/rateware";
import { crearSimulado } from "../src/simulado/semilla";
import { MODULOS, seccionActiva } from "../src/ui/navegacion";

const lectura = (tipo: string, rutas: string[] = []) => ({
  lectura: { tipo, resumen: `Resumen ${tipo}`, ofertas: rutas.map((rutaId) => ({ rutaId, tarifa: 1500 })), dudas: [] },
  recortado: false
});
const fila = (x: Record<string, unknown> = {}) => ({
  rfx_event_id: "ev-1", event_name: "O-I · 8 rutas", event_rfx_id: "RFX09302601", event_due_date: "2026-11-30",
  gmail_message_id: "msg000001", vendor_id: "v-1", vendor_name: "Grupo Omega", received_at: "2026-11-25T10:00:00Z",
  status: "proposed", reading: lectura("oferta", ["r1", "r2", "r1"]), error: null, created_at: "2026-11-25T10:15:00Z", ...x
});

describe("aBandeja", () => {
  it("convierte cada borrador en una respuesta con evento, carrier, tipo y rutas", () => {
    expect(aRespuestaBandeja(fila())).toEqual({
      eventoId: "ev-1", evento: "O-I · 8 rutas", folio: "RFX09302601", plazo: "2026-11-30", correoId: "msg000001",
      carrierId: "v-1", carrier: "Grupo Omega", en: "2026-11-25T10:00:00Z", tipo: "oferta", resumen: "Resumen oferta", rutas: 2, fallo: null
    });
  });

  it("un correo que la IA no pudo leer sale como «fallo» con su motivo", () => {
    const r = aRespuestaBandeja(fila({ status: "failed", reading: null, error: "PDF ilegible" }))!;
    expect([r.tipo, r.fallo, r.resumen]).toEqual(["fallo", "PDF ilegible", ""]);
  });

  it("deja fuera lo incompleto y lo repetido; lo más reciente primero", () => {
    const b = aBandeja({
      readings: [
        fila({ gmail_message_id: "msg000001", received_at: "2026-11-24T10:00:00Z" }),
        fila({ gmail_message_id: "msg000002", received_at: "2026-11-25T11:00:00Z", reading: lectura("rechazo") }),
        fila({ gmail_message_id: "msg000001" }),
        fila({ gmail_message_id: "../x" }),
        fila({ rfx_event_id: "" })
      ],
      has_more: true
    });
    expect(b.respuestas.map((r) => [r.correoId, r.tipo])).toEqual([["msg000002", "rechazo"], ["msg000001", "oferta"]]);
    expect(b.hayMas).toBe(true);
    // Las dos filas sin correo o evento válidos se cuentan para avisar, no se esconden.
    expect(b.incompletas).toBe(2);
  });

  it("la liga abre el evento con esa respuesta", () => {
    expect(ligaRespuesta({ eventoId: "ev-1", correoId: "msg_0001" })).toBe("/eventos/ev-1?respuesta=msg_0001");
  });
});

describe("combinarLecturas con la marca del equipo", () => {
  const servidor = (x: Partial<LecturaServidor> = {}): LecturaServidor => ({
    gmail_message_id: "msg000001", vendor_id: "c1", received_at: "2026-11-25T10:00:00Z", status: "proposed",
    reading: lectura("oferta") as unknown as LecturaServidor["reading"], error: null, created_at: "2026-11-25T10:15:00Z", ...x
  });
  const carriers = new Map([["c1", "JPI"]]);

  it("lo que alguien dejó listo en el servidor ya no sale como pendiente", () => {
    expect(combinarLecturas({}, [servidor({ reviewed_at: "2026-11-25T12:00:00Z", review_outcome: "captured" })], carriers).msg000001.revisado).toBe(true);
    expect(combinarLecturas({}, [servidor()], carriers).msg000001.revisado).toBe(false);
  });

  it("la propuesta del servidor gana a un fallo leído en este navegador, sin perder lo local", () => {
    const local = { msg000001: { correoId: "msg000001", carrierId: "c1", carrier: "JPI", en: "x", leidoEn: "x", lectura: null, fallo: "sin texto", revisado: false, rutasGuardadas: ["r1"] } as LecturaGuardada };
    const r = combinarLecturas(local, [servidor()], carriers).msg000001;
    expect([r.lectura?.tipo, r.fallo, r.rutasGuardadas]).toEqual(["oferta", null, ["r1"]]);
  });

  it("también cuando este navegador lo tenía pendiente", () => {
    const local = { msg000001: { ...combinarLecturas({}, [servidor()], carriers).msg000001 } as LecturaGuardada };
    expect(combinarLecturas(local, [servidor({ reviewed_at: "2026-11-25T12:00:00Z", review_outcome: "dismissed" })], carriers).msg000001.revisado).toBe(true);
  });
});

describe("proxy", () => {
  it("la bandeja es lectura y la marca es escritura que pide permiso de escrituras", () => {
    expect(LECTURAS["rateware-api"].has("list_rfx_reply_inbox")).toBe(true);
    expect(ESCRITURAS["rateware-api"].has("mark_rfx_reply_reading")).toBe(true);
    expect(revisar({ fn: "rateware-api", json: { action: "list_rfx_reply_inbox" }, autorizacion: "Bearer x", modo: "no" })).toBeNull();
    expect(revisar({ fn: "rateware-api", json: { action: "mark_rfx_reply_reading", event_id: "e", gmail_message_id: "msg000001", outcome: "dismissed" }, autorizacion: "Bearer x", modo: "no" })?.status).toBe(423);
  });

  it("HDships no aparece en la bandeja ni se puede marcar", async () => {
    const hd = [...EVENTOS_PROTEGIDOS][0];
    expect(sinProtegidos({ readings: [fila(), fila({ rfx_event_id: hd })] }).readings.map((r: any) => r.rfx_event_id)).toEqual(["ev-1"]);
    // La ruta que usa la app (/api/rateware) también lo quita de la respuesta completa.
    const r = await manejar("rateware-api", { action: "list_rfx_reply_inbox" }, "Bearer x", {
      permitirEscrituras: false,
      real: true,
      enviar: async () => ({ status: 200, body: { readings: [fila(), fila({ rfx_event_id: hd })], has_more: false }, headers: {} })
    } as any);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain(hd);
    expect((r.body as any).readings).toHaveLength(1);
    expect(revisar({ fn: "rateware-api", json: { action: "mark_rfx_reply_reading", event_id: hd, gmail_message_id: "msg000001", outcome: "dismissed" }, autorizacion: "Bearer x", modo: "si" })?.status).toBe(404);
  });
});

describe("navegación", () => {
  it("Respuestas es una pestaña de Eventos, que no se repite en la página de un evento", () => {
    const eventos = MODULOS.find((m) => m.etiqueta === "Eventos")!;
    expect(eventos.secciones?.map((s) => s.a)).toEqual(["/eventos", "/respuestas"]);
    expect(seccionActiva(eventos, "/respuestas")?.etiqueta).toBe("Respuestas");
    expect(seccionActiva(eventos, "/rfx/abc")?.etiqueta).toBe("Eventos");
    expect(eventos.pestanasEn?.("/eventos")).toBe(true);
    expect(eventos.pestanasEn?.("/respuestas")).toBe(true);
    expect(eventos.pestanasEn?.("/eventos/abc")).toBe(false);
  });
});

describe("contra el simulado", () => {
  let sim: RatewareSimulado;
  let api: (u: string) => MesaApi;
  let abierto: string;
  let cerrado: string;
  let carrier: string;

  beforeEach(async () => {
    const base = crearSimulado();
    sim = base.sim;
    sim.hoy = () => "2026-10-21";
    api = (u) => new MesaApi(transporteSimulado(sim, () => u), () => sim.hoy());
    const op = api("operador");
    abierto = (await op.crearEvento({ name: "PRUEBA · bandeja abierta", customer: "Shipper", due_date: "2026-10-31" })).row.id;
    cerrado = (await op.crearEvento({ name: "PRUEBA · bandeja archivada", customer: "Shipper", due_date: "2026-10-31" })).row.id;
    await op.publicar(abierto);
    sim.events.find((e) => e.id === cerrado)!.status = "archived";
    carrier = base.carriers.A.id;
    const lect = (ev: string, id: string, en: string, extra: Record<string, unknown> = {}) =>
      sim.lecturasIA.push({ rfx_event_id: ev, gmail_message_id: id, vendor_id: carrier, received_at: en, status: "proposed", reading: lectura("oferta", ["r1"]), error: null, created_at: en, ...extra });
    lect(abierto, "msg000001", "2026-10-20T10:00:00Z");
    lect(abierto, "msg000002", "2026-10-21T10:00:00Z", { status: "failed", reading: null, error: "sin texto" });
    lect(abierto, "msg000003", "2026-10-21T11:00:00Z", { reviewed_at: "2026-10-21T12:00:00Z", reviewed_by: "x", review_outcome: "captured" });
    lect(cerrado, "msg000004", "2026-10-21T12:00:00Z");
  });

  it("lista lo pendiente de los eventos abiertos, con el nombre del carrier", async () => {
    const b = await api("consulta").bandejaRespuestas();
    expect(b.respuestas.map((r) => [r.correoId, r.tipo])).toEqual([["msg000002", "fallo"], ["msg000001", "oferta"]]);
    expect(b.respuestas[1]).toEqual(expect.objectContaining({ eventoId: abierto, evento: "PRUEBA · bandeja abierta", carrier: sim.vendors.find((v) => v.id === carrier)!.vendor_name }));
  });

  it("marcar la deja lista para todos, una sola vez", async () => {
    expect(await api("operador").marcarLectura(abierto, "msg000001", "captured")).toBe(true);
    expect(await api("admin").marcarLectura(abierto, "msg000001", "dismissed")).toBe(true);
    expect(sim.lecturasIA.find((l) => l.gmail_message_id === "msg000001")).toEqual(expect.objectContaining({ review_outcome: "captured", reviewed_by: expect.any(String) }));
    expect((await api("admin").bandejaRespuestas()).respuestas.map((r) => r.correoId)).toEqual(["msg000002"]);
    const leidas = await api("admin").lecturasServidor(abierto);
    expect(leidas.find((l) => l.gmail_message_id === "msg000001")?.review_outcome).toBe("captured");
  });

  it("un correo que solo leyó el navegador no está en el servidor: no hay nada que marcar", async () => {
    expect(await api("operador").marcarLectura(abierto, "msg999999", "dismissed")).toBe(false);
  });

  it("Consulta no marca", async () => {
    await expect(api("consulta").marcarLectura(abierto, "msg000001", "dismissed")).rejects.toBeInstanceOf(ErrorApi);
    expect(sim.lecturasIA.find((l) => l.gmail_message_id === "msg000001")?.reviewed_at).toBeUndefined();
  });

  it("una respuesta sin la lista no se toma como «nada pendiente» ni como «nada leído»", async () => {
    for (const cuerpo of [null, {}, { readings: "x" }]) {
      const m = new MesaApi(async () => ({ status: 200, body: cuerpo, headers: {} }) as any, () => "2026-10-21");
      await expect(m.bandejaRespuestas()).rejects.toMatchObject({ code: "RESPUESTA_INCOMPLETA" });
      await expect(m.lecturasServidor(abierto)).rejects.toMatchObject({ code: "RESPUESTA_INCOMPLETA" });
    }
    expect(() => aBandeja({})).toThrow();
  });

  it("sin la acción desplegada, avisa que la bandeja aún no está", async () => {
    sim.sinDesplegar.add("list_rfx_reply_inbox");
    await expect(api("admin").bandejaRespuestas()).rejects.toMatchObject({ code: "BANDEJA_NO_DISPONIBLE" });
  });
});
