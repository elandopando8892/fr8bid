// Propuesta al shipper (25-nov-2026): la tarifa de venta por ruta sale de la versión
// adjudicada al primario y su modelo comercial; el servidor de Fr8Bid la calcula con
// una lectura fresca y nunca toma rutas ni precios del navegador.
import { describe, expect, it } from "vitest";
import { detalle } from "../src/cliente/mapear";
import { compararPropuesta, leerPropuestaPublicada, propuestaDelEvento, type PropuestaPublicada } from "../src/dominio/propuesta";
import { manejar } from "../src/servidor/proxy";
import { MesaApi } from "../src/cliente/api";
import { mensajeDelServidor } from "../src/dominio/errores";
import { revisar } from "../src/servidor/paso";
import { explainRequestError } from "../src/bidware/features/shipper-request/request.service";

const EV = "11111111-1111-4111-8111-111111111111";
const L1 = "22222222-2222-4222-8222-222222222221";
const L2 = "22222222-2222-4222-8222-222222222222";

const inv = (x: Record<string, unknown>) => ({
  id: "lv-1",
  vendor_id: "v-1",
  invitation_status: "quoted",
  bid_rate: 1000,
  currency: "USD",
  commercial_model: "cost_plus",
  marksman_margin_pct: 10,
  responded_at: "2026-11-20T10:00:00Z",
  award_role: "primary",
  awarded_at: "2026-11-21T10:00:00Z",
  vendors: { vendor_name: "Carrier Secreto" },
  ...x
});
const lane = (id: string, n: number, invitations: unknown[], x: Record<string, unknown> = {}) => ({ id, lane_number: n, origin: `Origen ${n}`, destination: `Destino ${n}`, equipment: "Dry Van", weekly_volume: 3, currency: "USD", invitations, ...x });
const crudo = (lanes: unknown[], status = "closed") => ({ event: { id: EV, status, due_date: "2026-11-19" }, lanes });

describe("propuestaDelEvento", () => {
  it("toma la venta de la versión adjudicada al primario y deja fuera carrier y costo", () => {
    const d = detalle(crudo([lane(L1, 1, [inv({}), inv({ id: "lv-2", award_role: null, bid_rate: 800 })]), lane(L2, 2, [inv({ id: "lv-3", commercial_model: "brokerage", marksman_margin_pct: null, bid_rate: 2000 })])]) as any);
    const p = propuestaDelEvento(d);
    expect(p.faltan).toEqual([]);
    expect(p.moneda).toBe("USD");
    expect(p.lineas.map((l) => [l.numero, l.venta])).toEqual([[1, 1100], [2, 2240]]);
    expect(JSON.stringify(p)).not.toMatch(/Carrier Secreto|lv-1|1000/);
  });

  it("dice qué falta: sin primario, sin modelo comercial o monedas mezcladas; las desiertas no van", () => {
    const sinPrimario = detalle(crudo([lane(L1, 1, [inv({ award_role: null })])]) as any);
    expect(propuestaDelEvento(sinPrimario).faltan).toEqual([{ numero: 1, motivo: "sin primario" }]);
    const sinModelo = detalle(crudo([lane(L1, 1, [inv({ commercial_model: null })])]) as any);
    expect(propuestaDelEvento(sinModelo).faltan[0].motivo).toMatch(/modelo comercial/);
    const mezcla = detalle(crudo([lane(L1, 1, [inv({})]), lane(L2, 2, [inv({ id: "lv-3", currency: "MXN" })])]) as any);
    expect(propuestaDelEvento(mezcla).faltan.at(-1)?.motivo).toMatch(/mezclan monedas/);
    const desierta = detalle(crudo([lane(L1, 1, [inv({})]), lane(L2, 2, [], { no_award_reason: "Sin ofertas", no_award_at: "2026-11-21T00:00:00Z" })]) as any);
    const p = propuestaDelEvento(desierta);
    expect(p.desiertas).toBe(1);
    expect(p.faltan).toEqual([]);
    expect(p.lineas).toHaveLength(1);
  });
});

function op(det: unknown, enviados: Record<string, unknown>[]) {
  return {
    permitirEscrituras: true,
    real: true,
    hoy: () => "2026-11-25",
    enviar: async (_s: string, b: Record<string, unknown>) => {
      enviados.push(JSON.parse(JSON.stringify(b)));
      return b.action === "list_rfx_detail" ? { status: 200, body: det, headers: {} } : { status: 200, body: { proposal: null, has_shipper_request: true }, headers: {} };
    }
  } as any;
}

const publicar = (x: Record<string, unknown> = {}) => ({ action: "publish_rfx_shipper_proposal", event_id: EV, valid_through: "2026-12-25", confirmed: true, confirmation_action: "publish_rfx_shipper_proposal", ...x });

describe("proxy: publicar la propuesta", () => {
  const det = crudo([lane(L1, 1, [inv({})])]);

  it("calcula rutas y venta en el servidor y solo manda id de ruta y venta", async () => {
    const env: Record<string, unknown>[] = [];
    const r = await manejar("rateware-api", publicar(), "Bearer x", op(det, env));
    expect(r.status).toBe(200);
    const enviado = env.find((b) => b.action === "publish_rfx_shipper_proposal")!;
    expect(enviado.lanes).toEqual([{ rfx_lane_id: L1, sell_rate: 1100 }]);
    expect(enviado.currency).toBe("USD");
    expect(enviado.valid_through).toBe("2026-12-25");
    expect(enviado).not.toHaveProperty("confirmed");
    expect(JSON.stringify(enviado)).not.toMatch(/Carrier Secreto|bid_rate/);
  });

  it("no acepta rutas ni precios del navegador, ni sin confirmar, ni con vigencia pasada", async () => {
    for (const [body, code] of [
      [publicar({ lanes: [{ rfx_lane_id: L1, sell_rate: 1 }] }), "SOLO_PROPUESTA"],
      [publicar({ currency: "MXN" }), "SOLO_PROPUESTA"],
      [publicar({ confirmed: false }), "SIN_CONFIRMAR"],
      [publicar({ valid_through: "2026-11-01" }), "VIGENCIA_PASADA"],
      [publicar({ valid_through: "25/12/2026" }), "VIGENCIA_INVALIDA"],
      [publicar({ event_id: "otro" }), "FALTA_EVENTO"]
    ] as const) {
      const env: Record<string, unknown>[] = [];
      const r = await manejar("rateware-api", body as any, "Bearer x", op(det, env));
      expect(r.body?.code).toBe(code);
      expect(env.some((b) => b.action === "publish_rfx_shipper_proposal")).toBe(false);
    }
  });

  it("no publica si falta adjudicar o definir el modelo", async () => {
    const env: Record<string, unknown>[] = [];
    const r = await manejar("rateware-api", publicar(), "Bearer x", op(crudo([lane(L1, 1, [inv({ award_role: null })])]), env));
    expect(r.status).toBe(409);
    expect(r.body?.code).toBe("PROPUESTA_INCOMPLETA");
    expect(String(r.body?.error)).toMatch(/Ruta 1: sin primario/);
    expect(env.map((b) => b.action)).toEqual(["list_rfx_detail"]);
  });

  it("leer la propuesta es una lectura permitida", async () => {
    const env: Record<string, unknown>[] = [];
    const r = await manejar("rateware-api", { action: "get_rfx_shipper_proposal", event_id: EV }, "Bearer x", op(det, env));
    expect(r.status).toBe(200);
  });
});

describe("lectura y rechazos", () => {
  it("lee la propuesta publicada y lo aceptado", () => {
    const r = leerPropuestaPublicada({ has_shipper_request: true, proposal: { id: "p", version: 2, currency: "USD", valid_through: "2026-12-25", published_at: "2026-11-25T10:00:00Z", lanes: [{ rfx_lane_id: L1, lane_number: 1, origin: "A", destination: "B", sell_rate: 1100 }], accepted: [{ rfx_lane_id: L1, accepted_at: "2026-11-26T10:00:00Z", accepted_by_name: "Ana" }] } });
    expect(r.conSolicitud).toBe(true);
    expect(r.propuesta?.lineas[0].venta).toBe(1100);
    expect(r.propuesta?.aceptadas[0].por).toBe("Ana");
    expect(leerPropuestaPublicada({ has_shipper_request: false, proposal: null })).toEqual({ conSolicitud: false, propuesta: null });
  });

  it("los rechazos de Rateware salen en español", () => {
    expect(mensajeDelServidor("RFX_PROPOSAL_HAS_ACCEPTANCE", "x")).toMatch(/ya aceptó/);
    expect(mensajeDelServidor("RFX_PROPOSAL_NO_SHIPPER_REQUEST", "x")).toMatch(/solicitud del shipper/);
  });
});

describe("paso de los módulos (/api/funcion)", () => {
  const paso = (fn: string, json: Record<string, unknown>, modo: "no" | "borradores" | "si") => revisar({ fn, json, autorizacion: "Bearer x", modo });

  it("publicar la propuesta solo pasa por la página del evento, en cualquier modo", () => {
    const body = { action: "publish_rfx_shipper_proposal", event_id: EV, lanes: [{ rfx_lane_id: L1, sell_rate: 1 }], currency: "USD" };
    expect(paso("rateware-api", body, "si")?.body.code).toBe("EN_LA_MESA");
    for (const modo of ["no", "borradores"] as const) expect(paso("rateware-api", body, modo)?.status).toBe(423);
    expect(paso("rateware-api", { action: "get_rfx_shipper_proposal", event_id: EV }, "no")).toBeNull();
  });

  it("la aceptación del shipper es escritura: pasa con «si» y con el candado se le explica qué hacer", () => {
    const body = { action: "accept_customer_rfi_proposal", token: "t", proposal_id: "p", lane_ids: [L1] };
    expect(paso("rfx-bid-api", body, "si")).toBeNull();
    for (const modo of ["no", "borradores"] as const) {
      const r = paso("rfx-bid-api", body, modo);
      expect(r?.status).toBe(423);
      expect(explainRequestError(r!.body.error, "es")).toMatch(/no podemos registrar tu aceptación/);
      expect(explainRequestError(r!.body.error, "en")).toMatch(/can't record your acceptance/);
    }
    expect(paso("rfx-bid-api", { action: "get_customer_rfi", token: "t" }, "no")).toBeNull();
  });
});

describe("lo publicado frente a la adjudicación de hoy", () => {
  const calc = propuestaDelEvento(detalle(crudo([lane(L1, 1, [inv({})]), lane(L2, 2, [inv({ id: "lv-3" })])]) as any));
  const pub = (x: Partial<PropuestaPublicada> = {}): PropuestaPublicada => ({
    id: "p", version: 1, moneda: "USD", vigenteHasta: "2026-12-25", publicadaEn: "2026-11-25T10:00:00Z",
    lineas: [{ rutaId: L1, numero: 1, origen: "Origen 1", destino: "Destino 1", venta: 1100 }, { rutaId: L2, numero: 2, origen: "Origen 2", destino: "Destino 2", venta: 1100 }],
    aceptadas: [], ...x
  });

  it("sin cambios ni vencimiento no ofrece volver a publicar", () => {
    const c = compararPropuesta(calc, pub(), "2026-11-25");
    expect(c).toMatchObject({ distinta: false, vencida: false, puedePublicar: false, cambios: [], quitadas: [] });
    expect(compararPropuesta(calc, null, "2026-11-25").puedePublicar).toBe(true);
  });

  it("con la vigencia vencida deja renovarla aunque la tarifa no cambie", () => {
    const c = compararPropuesta(calc, pub({ vigenteHasta: "2026-11-20" }), "2026-11-25");
    expect(c).toMatchObject({ distinta: false, vencida: true, puedePublicar: true });
  });

  it("los cambios salen aparte, con lo publicado y lo de hoy; con algo aceptado no se vuelve a publicar", () => {
    const antes = pub({ lineas: [{ rutaId: L1, numero: 1, origen: "Origen 1", destino: "Destino 1", venta: 1000 }, { rutaId: "otra", numero: 3, origen: "X", destino: "Y", venta: 5 }] });
    const c = compararPropuesta(calc, antes, "2026-11-25");
    expect(c.distinta).toBe(true);
    expect(c.cambios.map((x) => [x.numero, x.antes, x.ahora])).toEqual([[1, 1000, 1100], [2, null, 1100]]);
    expect(c.quitadas).toEqual([3]);
    expect(c.puedePublicar).toBe(true);
    const aceptada = compararPropuesta(calc, { ...antes, aceptadas: [{ rutaId: L1, en: "2026-11-26", por: "Ana" }] }, "2026-11-25");
    expect(aceptada).toMatchObject({ distinta: true, puedePublicar: false });
  });
});

describe("cliente: publicar y seguir viendo la liga del shipper", () => {
  it("después de publicar vuelve a leer, así conserva que el evento tiene solicitud del shipper", async () => {
    const acciones: string[] = [];
    const api = new MesaApi(async (_s, b) => {
      acciones.push(String(b.action));
      // Como Rateware: publicar responde solo con la propuesta.
      return b.action === "publish_rfx_shipper_proposal"
        ? { status: 200, body: { proposal: { id: "p", version: 1, currency: "USD", lanes: [] } }, headers: {} }
        : { status: 200, body: { has_shipper_request: true, proposal: { id: "p", version: 1, currency: "USD", lanes: [], accepted: [] } }, headers: {} };
    });
    const r = await api.publicarPropuesta(EV, "2026-12-25");
    expect(acciones).toEqual(["publish_rfx_shipper_proposal", "get_rfx_shipper_proposal"]);
    expect(r.conSolicitud).toBe(true);
    expect(r.propuesta?.id).toBe("p");
  });
});
