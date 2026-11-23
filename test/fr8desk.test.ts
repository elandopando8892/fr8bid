// «Reportar a Fr8Desk» desde la Mesa: proxy servidor a servidor con fetch
// simulado (nunca llama a Fr8Desk real).

import { describe, expect, it } from "vitest";
import { ErrorApi, MesaApi, fr8deskSimulado, transporteSimulado } from "../src/cliente/api";
import { manejarFr8Desk, type OpcionesFr8Desk } from "../src/servidor/fr8desk";
import type { Enviar } from "../src/servidor/proxy";
import { Fr8DeskSimulado } from "../src/simulado/fr8desk";
import { sembrarDemo } from "../src/simulado/semilla";

const EVENTO = "0b6a3c1e-5d2f-4a8b-9c7d-1e2f3a4b5c6d";
const OTRO = "9f8e7d6c-5b4a-4321-8fed-cba987654321";
const SESION = "Bearer eyJ.sesion-de-modules";
const RID = "3f1c2b4a-6d5e-4f70-8a9b-0c1d2e3f4a5b";

// Rateware de prueba: la persona ve EVENTO y nada más.
const rateware: Enviar = async (_s, body, auth) => {
  if (!auth) return { status: 401, body: { error: "sin sesión" }, headers: {} };
  if (body.event_id === EVENTO) return { status: 200, body: { event: { id: EVENTO, name: "Vidrio Industrial" }, lanes: [] }, headers: {} };
  return { status: 404, body: { error: "not found" }, headers: {} };
};

function opciones(desk = new Fr8DeskSimulado(), extra: Partial<OpcionesFr8Desk> = {}): OpcionesFr8Desk {
  return { config: { token: "fd_simulado", equipo: "sistemas" }, rateware, fetch: desk.fetch, timeoutMs: 500, ...extra };
}

const caso = (extra: Record<string, unknown> = {}) => ({ rfx_event_id: EVENTO, request_id: RID, asunto: "RFX-0001 · Carrier sin póliza", descripcion: "No deja adjudicar la ruta 2.", impacto: "retrasa", ...extra });

describe("Reportar a Fr8Desk (POST)", () => {
  it("abre el caso en nombre de la persona y devuelve folio y liga", async () => {
    const desk = new Fr8DeskSimulado();
    const r = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(desk));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ folio: "FD-0001", url: "https://fr8desk-sandy.vercel.app/#/t/FD-0001", repetido: false });

    const [llamada] = desk.llamadas;
    expect(llamada.metodo).toBe("POST");
    expect(llamada.url).toBe("https://fr8desk-sandy.vercel.app/v1/casos");
    expect(llamada.cabeceras.authorization).toBe("Bearer fd_simulado");
    expect(llamada.cabeceras["x-fr8desk-actor"]).toBe("eyJ.sesion-de-modules");
    // Solo lo que escribe la persona y la referencia: nada del detalle del RFx.
    expect(llamada.body).toEqual({
      request_id: RID,
      asunto: "RFX-0001 · Carrier sin póliza",
      descripcion: "No deja adjudicar la ruta 2.",
      equipo: "sistemas",
      impacto: "retrasa",
      objeto: { tipo: "rfx_evento", ref: EVENTO }
    });
  });

  it("el reintento con el mismo request_id no duplica el caso", async () => {
    const desk = new Fr8DeskSimulado();
    const a = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(desk));
    const b = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(desk));
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ folio: a.body.folio, repetido: true });
    expect(desk.casos).toHaveLength(1);
    expect(desk.llamadas.map((l) => l.body.request_id)).toEqual([RID, RID]);
  });

  it("usa FR8DESK_URL cuando está definida", async () => {
    const desk = new Fr8DeskSimulado();
    const r = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(desk, { config: { url: "https://desk.example.test/", token: "fd_simulado", equipo: "sistemas" } }));
    expect(desk.llamadas[0].url).toBe("https://desk.example.test/v1/casos");
    expect(r.body.url).toBe("https://desk.example.test/#/t/FD-0001");
  });

  it("sin FR8DESK_TOKEN o FR8DESK_EQUIPO responde un error claro y no llama a nadie", async () => {
    const desk = new Fr8DeskSimulado();
    for (const config of [{ equipo: "sistemas" }, { token: "fd_simulado" }, {}]) {
      const r = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(desk, { config }));
      expect(r.status).toBe(503);
      expect(r.body).toMatchObject({ code: "FR8DESK_NO_CONFIGURADO", error: "Integración con Fr8Desk no configurada." });
      const g = await manejarFr8Desk("GET", { rfx_event_id: EVENTO }, null, SESION, opciones(desk, { config }));
      expect(g.status).toBe(503);
    }
    expect(desk.llamadas).toHaveLength(0);
  });

  it("propaga los 4xx de Fr8Desk con mensaje legible", async () => {
    const con = (status: number, body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status });
    const r400 = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(undefined, { fetch: con(400, { codigo: "dato_invalido", mensaje: "Ese equipo no existe." }) }));
    expect(r400.status).toBe(400);
    expect(r400.body).toMatchObject({ code: "FR8DESK_DATO_INVALIDO", error: "Fr8Desk: Ese equipo no existe." });

    const r403 = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(undefined, { fetch: con(403, { codigo: "actor_invalido", mensaje: "x" }) }));
    expect(r403.status).toBe(403);
    expect(r403.body.error).toMatch(/no tiene acceso a Fr8Desk/);

    const r409 = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(undefined, { fetch: con(409, { codigo: "conflicto", mensaje: "x" }) }));
    expect(r409.status).toBe(409);

    // 401 es la credencial de Fr8Bid, no la sesión de la persona.
    const r401 = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(undefined, { fetch: con(401, { codigo: "sin_credencial", mensaje: "x" }) }));
    expect(r401.status).toBe(502);
    expect(r401.body.code).toBe("FR8DESK_CREDENCIAL");

    const r500 = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(undefined, { fetch: con(500, { codigo: "error_interno" }) }));
    expect(r500.status).toBe(502);
  });

  it("mismo request_id con otro contenido: 409 de Fr8Desk", async () => {
    const desk = new Fr8DeskSimulado();
    await manejarFr8Desk("POST", {}, caso(), SESION, opciones(desk));
    const r = await manejarFr8Desk("POST", {}, caso({ descripcion: "Otra cosa" }), SESION, opciones(desk));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("FR8DESK_CONFLICTO");
  });

  it("sin respuesta de Fr8Desk: 504 incierta, se puede reintentar", async () => {
    const colgado: typeof fetch = (_u, init) =>
      new Promise((_ok, falla) => init?.signal?.addEventListener("abort", () => falla(new Error("abort"))));
    const r = await manejarFr8Desk("POST", {}, caso(), SESION, opciones(undefined, { fetch: colgado, timeoutMs: 20 }));
    expect(r.status).toBe(504);
    expect(r.body).toMatchObject({ code: "FR8DESK_SIN_RESPUESTA", incierta: true });
  });

  it("usuario sin acceso al evento: 404 y Fr8Desk no recibe nada", async () => {
    const desk = new Fr8DeskSimulado();
    const r = await manejarFr8Desk("POST", {}, caso({ rfx_event_id: OTRO }), SESION, opciones(desk));
    expect(r.status).toBe(404);
    const g = await manejarFr8Desk("GET", { rfx_event_id: OTRO }, null, SESION, opciones(desk));
    expect(g.status).toBe(404);
    const sinSesion = await manejarFr8Desk("POST", {}, caso(), null, opciones(desk));
    expect(sinSesion.status).toBe(401);
    expect(desk.llamadas).toHaveLength(0);
  });

  it("valida asunto, descripción, impacto y request_id antes de salir", async () => {
    const desk = new Fr8DeskSimulado();
    for (const malo of [{ request_id: "" }, { request_id: "no-uuid" }, { asunto: " " }, { asunto: "x".repeat(141) }, { descripcion: "" }, { impacto: "urgente" }]) {
      const r = await manejarFr8Desk("POST", {}, caso(malo), SESION, opciones(desk));
      expect(r.status).toBe(400);
    }
    expect(desk.llamadas).toHaveLength(0);
  });
});

describe("Casos del evento (GET)", () => {
  it("lista los casos ligados al evento con folio, asunto, estado y liga", async () => {
    const desk = new Fr8DeskSimulado();
    await manejarFr8Desk("POST", {}, caso(), SESION, opciones(desk));
    const r = await manejarFr8Desk("GET", { rfx_event_id: EVENTO }, null, SESION, opciones(desk));
    expect(r.status).toBe(200);
    expect(r.body.casos).toEqual([{ folio: "FD-0001", asunto: "RFX-0001 · Carrier sin póliza", estado: "nuevo", url: "https://fr8desk-sandy.vercel.app/#/t/FD-0001" }]);
    expect(desk.llamadas[1].url).toBe(`https://fr8desk-sandy.vercel.app/v1/casos?tipo=rfx_evento&ref=${EVENTO}`);
  });
});

describe("Mesa con el simulado", () => {
  it("la Mesa reporta y lista; otra organización no ve el evento", async () => {
    const { sim, eventId } = await sembrarDemo();
    const desk = new Fr8DeskSimulado();
    let usuario = "admin";
    const api = new MesaApi(transporteSimulado(sim, () => usuario), undefined, undefined, undefined, fr8deskSimulado(sim, () => usuario, desk));
    const hecho = await api.reportarFr8Desk(eventId, { requestId: RID, asunto: "Duda con el evento", descripcion: "¿Se puede mover el plazo?", impacto: "consulta" });
    expect(hecho.folio).toBe("FD-0001");
    expect(await api.casosFr8Desk(eventId)).toHaveLength(1);

    usuario = "ajeno";
    await expect(api.casosFr8Desk(eventId)).rejects.toMatchObject({ status: 404 });
    await expect(api.reportarFr8Desk(eventId, { requestId: nuevo(), asunto: "x", descripcion: "y", impacto: "consulta" })).rejects.toBeInstanceOf(ErrorApi);
    expect(desk.casos).toHaveLength(1);
  });
});

function nuevo() {
  return "7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d";
}
