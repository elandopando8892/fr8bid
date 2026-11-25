// Propuesta al shipper (25-nov-2026): la tarifa de venta por ruta sale de la versión
// adjudicada al primario y su modelo comercial; el servidor de Fr8Bid la calcula con
// una lectura fresca y nunca toma rutas ni precios del navegador.
import { describe, expect, it } from "vitest";
import { detalle } from "../src/cliente/mapear";
import { compararPropuesta, huellaPropuesta, leerPropuestaPublicada, propuestaDelEvento, type PropuestaPublicada } from "../src/dominio/propuesta";
import { manejar } from "../src/servidor/proxy";
import { MesaApi } from "../src/cliente/api";
import { recargarAlVolver } from "../src/ui/recargaAlVolver";
import { acceptLanes, afterAccept, canAccept, pendingLanes, progressAfter, reconcile } from "../src/bidware/features/shipper-request/proposal.flow";
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
    // primarioId solo viaja a Rateware para comprobar lo revisado; lo demás no nombra carrier ni costo.
    expect(p.lineas.map((l) => l.primarioId)).toEqual(["lv-1", "lv-3"]);
    expect(JSON.stringify(p.lineas.map(({ primarioId: _p, ...resto }) => resto))).not.toMatch(/Carrier Secreto|lv-1|1000/);
  });

  it("la ruta es la que guarda Rateware (origin/destination), aunque ciudad y estado digan otra cosa", () => {
    const conCiudad = (origin: string) => propuestaDelEvento(detalle(crudo([lane(L1, 1, [inv({})], { origin, origin_city: "Monterrey", origin_state: "NL" })]) as any));
    const p = conCiudad("MTY Planta 2");
    expect(p.lineas[0].origen).toBe("MTY Planta 2");
    // Cambiar ese texto cambia la huella aunque ciudad y estado sigan iguales.
    expect(huellaPropuesta(conCiudad("MTY Planta 3"))).not.toBe(huellaPropuesta(p));
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

const huellaDe = (crudoDet: unknown) => huellaPropuesta(propuestaDelEvento(detalle(crudoDet as any)));
const HUELLA = huellaDe(crudo([lane(L1, 1, [inv({})])]));
const publicar = (x: Record<string, unknown> = {}) => ({ action: "publish_rfx_shipper_proposal", event_id: EV, valid_through: "2026-12-25", proposal_fingerprint: HUELLA, base_proposal_id: null, confirmed: true, confirmation_action: "publish_rfx_shipper_proposal", ...x });

describe("proxy: publicar la propuesta", () => {
  const det = crudo([lane(L1, 1, [inv({})])]);

  it("calcula rutas y venta en el servidor y solo manda id de ruta y venta", async () => {
    const env: Record<string, unknown>[] = [];
    const r = await manejar("rateware-api", publicar(), "Bearer x", op(det, env));
    expect(r.status).toBe(200);
    const enviado = env.find((b) => b.action === "publish_rfx_shipper_proposal")!;
    // Id de ruta, venta y lo que se usó para calcularla (Rateware lo compara bajo candado).
    expect(enviado.lanes).toEqual([{
      rfx_lane_id: L1,
      sell_rate: 1100,
      expected: {
        primary_id: "lv-1",
        primary: { bid_rate: 1000, currency: "USD", commercial_model: "cost_plus", carrier_share_pct: null, marksman_margin_pct: 10 },
        lane: { lane_number: 1, origin: "Origen 1", destination: "Destino 1", origin_city: null, origin_state: null, origin_country: null, destination_city: null, destination_state: null, destination_country: null, equipment: "Dry Van", trailer: null, service: null, weekly_volume: 3 },
        master_package: null
      }
    }]);
    expect(enviado.currency).toBe("USD");
    expect(enviado.valid_through).toBe("2026-12-25");
    expect(enviado).not.toHaveProperty("confirmed");
    expect(enviado).not.toHaveProperty("proposal_fingerprint");
    // La versión que se tenía a la vista pasa a Rateware, que publica solo si sigue vigente.
    expect(enviado).toHaveProperty("base_proposal_id", null);
    // Todas las rutas del evento y cuáles son desiertas: Rateware las compara bajo candado.
    expect(enviado.event_lanes).toEqual([{ id: L1, no_award: false }]);
    expect(JSON.stringify(enviado)).not.toMatch(/Carrier Secreto|vendor_id|vendors/);
  });

  it("no acepta rutas ni precios del navegador, ni sin confirmar, ni con vigencia pasada", async () => {
    for (const [body, code] of [
      [publicar({ lanes: [{ rfx_lane_id: L1, sell_rate: 1 }] }), "SOLO_PROPUESTA"],
      [publicar({ currency: "MXN" }), "SOLO_PROPUESTA"],
      [publicar({ confirmed: false }), "SIN_CONFIRMAR"],
      [publicar({ valid_through: "2026-11-01" }), "VIGENCIA_PASADA"],
      [publicar({ valid_through: "25/12/2026" }), "VIGENCIA_INVALIDA"],
      [publicar({ event_id: "otro" }), "FALTA_EVENTO"],
      [publicar({ base_proposal_id: undefined }), "FALTA_BASE"],
      [publicar({ base_proposal_id: "" }), "FALTA_BASE"],
      [publicar({ base_proposal_id: 7 }), "FALTA_BASE"]
    ] as const) {
      const env: Record<string, unknown>[] = [];
      const r = await manejar("rateware-api", body as any, "Bearer x", op(det, env));
      expect(r.body?.code).toBe(code);
      expect(env.some((b) => b.action === "publish_rfx_shipper_proposal")).toBe(false);
    }
  });

  it("no publica si la adjudicación cambió desde que el Administrador la revisó", async () => {
    for (const cambiado of [
      crudo([lane(L1, 1, [inv({ bid_rate: 1200 })])]),
      crudo([lane(L1, 1, [inv({})], { weekly_volume: 9 })]),
      crudo([lane(L1, 1, [inv({})], { service: "D2D" })]),
      crudo([lane(L1, 4, [inv({})])]),
      crudo([lane(L1, 1, [inv({})], { trailer: "48 ft" })]),
      crudo([lane(L1, 1, [inv({})]), lane(L2, 2, [inv({ id: "lv-3" })])])
    ]) {
      const env: Record<string, unknown>[] = [];
      const r = await manejar("rateware-api", publicar(), "Bearer x", op(cambiado, env));
      expect(r.status).toBe(409);
      expect(r.body?.code).toBe("PROPUESTA_CAMBIO");
      expect(env.map((b) => b.action)).toEqual(["list_rfx_detail"]);
    }
    const env: Record<string, unknown>[] = [];
    expect((await manejar("rateware-api", publicar({ proposal_fingerprint: undefined }), "Bearer x", op(det, env))).body?.code).toBe("PROPUESTA_CAMBIO");
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
  const linea = (rutaId: string, numero: number, venta: number, x: Record<string, unknown> = {}) => ({ rutaId, numero, origen: `Origen ${numero}`, destino: `Destino ${numero}`, equipo: "Dry Van", caja: "", servicio: "", volumenSemanal: 3, venta, ...x });
  const pub = (x: Partial<PropuestaPublicada> = {}): PropuestaPublicada => ({
    id: "p", version: 1, moneda: "USD", vigenteHasta: "2026-12-25", publicadaEn: "2026-11-25T10:00:00Z",
    lineas: [linea(L1, 1, 1100), linea(L2, 2, 1100)],
    aceptadas: [], ...x
  });
  const aceptoL1 = [{ rutaId: L1, en: "2026-11-26", por: "Ana" }];

  it("sin cambios ni vencimiento no ofrece volver a publicar", () => {
    const c = compararPropuesta(calc, pub(), "2026-11-25");
    expect(c).toMatchObject({ distinta: false, vencida: false, puedePublicar: false, cambios: [], quitadas: [] });
    expect(compararPropuesta(calc, null, "2026-11-25").puedePublicar).toBe(true);
  });

  it("con la vigencia vencida deja renovarla aunque la tarifa no cambie, también con aceptación parcial", () => {
    expect(compararPropuesta(calc, pub({ vigenteHasta: "2026-11-20" }), "2026-11-25")).toMatchObject({ distinta: false, vencida: true, puedePublicar: true });
    expect(compararPropuesta(calc, pub({ vigenteHasta: "2026-11-20", aceptadas: aceptoL1 }), "2026-11-25")).toMatchObject({ vencida: true, tocaAceptadas: false, puedePublicar: true });
  });

  it("un cambio de número, ruta, equipo, caja, servicio o volumen sin cambio de precio también cuenta", () => {
    for (const x of [{ volumenSemanal: 5 }, { equipo: "Flatbed" }, { destino: "Otro" }, { servicio: "D2D" }, { caja: "48 ft" }, { numero: 7 }]) {
      const c = compararPropuesta(calc, pub({ lineas: [linea(L1, 1, 1100, x), linea(L2, 2, 1100)] }), "2026-11-25");
      expect(c.distinta).toBe(true);
      expect(c.cambios).toEqual([expect.objectContaining({ numero: 1, antes: 1100, ahora: 1100, terminos: true })]);
      expect(c.puedePublicar).toBe(true);
    }
  });

  it("los cambios salen aparte; se puede corregir lo pendiente, no lo aceptado", () => {
    const antes = pub({ lineas: [linea(L1, 1, 1000), linea("otra", 3, 5)] });
    const c = compararPropuesta(calc, antes, "2026-11-25");
    expect(c.cambios.map((x) => [x.numero, x.antes, x.ahora])).toEqual([[1, 1000, 1100], [2, null, 1100]]);
    expect(c.quitadas).toEqual([{ numero: 3, aceptada: false }]);
    expect(c.puedePublicar).toBe(true);
    // L1 aceptada y cambió: no se vuelve a publicar.
    expect(compararPropuesta(calc, { ...antes, aceptadas: aceptoL1 }, "2026-11-25")).toMatchObject({ distinta: true, tocaAceptadas: true, puedePublicar: false });
    // L1 aceptada sin cambio; L2 pendiente cambió: se puede publicar y L1 se queda aceptada.
    const parcial = pub({ lineas: [linea(L1, 1, 1100), linea(L2, 2, 900)], aceptadas: aceptoL1 });
    expect(compararPropuesta(calc, parcial, "2026-11-25")).toMatchObject({ distinta: true, tocaAceptadas: false, puedePublicar: true });
  });

  it("un cambio de servicio en una ruta aceptada impide volver a publicar", () => {
    const c = compararPropuesta(calc, pub({ lineas: [linea(L1, 1, 1100, { servicio: "D2D" }), linea(L2, 2, 1100)], aceptadas: aceptoL1 }), "2026-11-25");
    expect(c).toMatchObject({ distinta: true, tocaAceptadas: true, puedePublicar: false });
  });

  it("la huella cambia con la venta, los términos o la moneda, y no con el orden", () => {
    const h = huellaPropuesta(calc);
    expect(huellaPropuesta({ ...calc, lineas: [{ ...calc.lineas[0], servicio: "D2D" }, calc.lineas[1]] })).not.toBe(h);
    expect(huellaPropuesta({ ...calc, lineas: [...calc.lineas].reverse() })).toBe(h);
    expect(huellaPropuesta({ ...calc, lineas: [{ ...calc.lineas[0], venta: 1101 }, calc.lineas[1]] })).not.toBe(h);
    expect(huellaPropuesta({ ...calc, lineas: [{ ...calc.lineas[0], volumenSemanal: 9 }, calc.lineas[1]] })).not.toBe(h);
    expect(huellaPropuesta({ ...calc, lineas: [{ ...calc.lineas[0], caja: "48 ft" }, calc.lineas[1]] })).not.toBe(h);
    expect(huellaPropuesta({ ...calc, lineas: [{ ...calc.lineas[0], numero: 9 }, calc.lineas[1]] })).not.toBe(h);
    expect(huellaPropuesta({ ...calc, moneda: "MXN" })).not.toBe(h);
  });
});

describe("cliente: publicar y seguir viendo la liga del shipper", () => {
  it("publica con la huella revisada y conserva que el evento tiene solicitud del shipper, sin otra lectura", async () => {
    const enviados: Record<string, unknown>[] = [];
    const api = new MesaApi(async (_s, b) => {
      enviados.push(b);
      // Como Rateware: publicar responde con la propuesta vigente y lo aceptado.
      return { status: 200, body: { proposal: { id: "p", version: 2, currency: "USD", lanes: [{ rfx_lane_id: L1, sell_rate: 1100, equipment: "Dry Van", trailer: "53 ft", weekly_volume: 3 }], accepted: [{ rfx_lane_id: L1, accepted_at: "2026-11-26", accepted_by_name: "Ana" }] } }, headers: {} };
    });
    const r = await api.publicarPropuesta(EV, "2026-12-25", "abc", "p-1");
    expect(enviados.map((b) => b.action)).toEqual(["publish_rfx_shipper_proposal"]);
    expect(enviados[0].proposal_fingerprint).toBe("abc");
    expect(enviados[0].base_proposal_id).toBe("p-1");
    expect(r.conSolicitud).toBe(true);
    expect(r.propuesta?.lineas[0]).toMatchObject({ equipo: "Dry Van", caja: "53 ft", volumenSemanal: 3, venta: 1100 });
    expect(r.propuesta?.aceptadas[0].por).toBe("Ana");
  });
});

describe("página del shipper: aceptar y recuperarse", () => {
  const prop = (accepted: string[] = [], extra: Record<string, unknown> = {}): any => ({
    id: "p", version: 1, currency: "USD", valid_through: "2026-12-25", expired: false,
    lanes: [{ rfx_lane_id: L1, lane_number: 1, sell_rate: 1100 }, { rfx_lane_id: L2, lane_number: 2, sell_rate: 900 }],
    accepted: accepted.map((id) => ({ rfx_lane_id: id, accepted_at: "2026-11-26", accepted_by_name: null })), ...extra
  });

  it("una lectura que llega antes que una aceptación en curso: repetirla no registra nada nuevo", async () => {
    // Rateware simulado del lado de la base: aceptar es idempotente por propuesta y ruta.
    const registradas = new Set<string>();
    let enCurso: Promise<void> | null = null;
    const accept = async (_p: string, ids: string[]) => {
      enCurso = new Promise((ok) => setTimeout(() => { ids.forEach((id) => registradas.add(id)); ok(); }, 5));
      throw new Error("Failed to fetch");
    };
    const leer = async () => prop([...registradas]);
    const r1 = await acceptLanes(prop(), [L1], { accept, reload: leer });
    // La lectura llegó antes: L1 se ofrece otra vez.
    expect(pendingLanes(r1.proposal!).map((l) => l.rfx_lane_id)).toEqual([L1, L2]);
    await enCurso;
    const r2 = await acceptLanes(r1.proposal!, [L1], { accept: async (_p, ids) => { ids.forEach((id) => registradas.add(id)); return { proposal: prop([...registradas]) }; }, reload: leer });
    expect([...registradas]).toEqual([L1]);
    expect(pendingLanes(r2.proposal!).map((l) => l.rfx_lane_id)).toEqual([L2]);
  });

  it("tras una respuesta incierta sin poder leer la liga, aceptar queda bloqueado hasta que una lectura funcione", async () => {
    const antes = prop();
    const r = await acceptLanes(antes, [L1], { accept: async () => { throw new Error("Failed to fetch"); }, reload: async () => { throw new Error("Failed to fetch"); } });
    expect(r.unresolved).toBe(true);
    expect(canAccept(r.proposal!, false, r.unresolved)).toBe(false);
    const fallaOtraVez = await reconcile(antes, null, { reload: async () => { throw new Error("Failed to fetch"); } });
    expect(fallaOtraVez.unresolved).toBe(true);
    const leida = await reconcile(antes, null, { reload: async () => prop([L1]) });
    expect(leida).toMatchObject({ unresolved: false, error: null });
    expect(canAccept(leida.proposal!, false, leida.unresolved)).toBe(true);
    expect(pendingLanes(leida.proposal!).map((l) => l.rfx_lane_id)).toEqual([L2]);
    expect(canAccept(prop([], { expired: true }), false, false)).toBe(false);
  });

  it("pendientes y avance: el último paso se enciende al aceptar todas", () => {
    expect(pendingLanes(prop([L1])).map((l) => l.rfx_lane_id)).toEqual([L2]);
    const progreso = { stage: "proposal" } as any;
    expect(progressAfter(progreso, prop([L1]))?.stage).toBe("proposal");
    expect(progressAfter(progreso, prop([L1, L2]))?.stage).toBe("accepted");
    // Una propuesta nueva con rutas pendientes, después de aceptarlo todo, vuelve a «propuesta».
    expect(progressAfter({ stage: "accepted" } as any, prop([L1], { id: "p2", version: 2 }))?.stage).toBe("proposal");
    expect(progressAfter({ stage: "accepted" } as any, null)?.stage).toBe("proposal");
  });

  it("aceptar parcial usa la respuesta del servidor y no vuelve a leer", async () => {
    let lecturas = 0;
    const r = await acceptLanes(prop(), [L1], { accept: async (_p, ids) => ({ proposal: prop(ids) }), reload: async () => { lecturas++; return null; } });
    expect(r.error).toBeNull();
    expect(pendingLanes(r.proposal!).map((l) => l.rfx_lane_id)).toEqual([L2]);
    expect(lecturas).toBe(0);
  });

  it("un rechazo (propuesta reemplazada) vuelve a leer la liga y muestra la vigente", async () => {
    const nueva = prop([L1], { id: "p2", version: 2 });
    const r = await acceptLanes(prop(), [L2], { accept: async () => { throw new Error("A newer proposal replaced this one (proposal was updated)."); }, reload: async () => nueva });
    expect(r.proposal?.id).toBe("p2");
    expect(explainRequestError(r.error!, "es")).toMatch(/se actualizó/);
  });

  it("una respuesta incierta vuelve a leer: si la aceptación sí entró, no se ofrece otra vez", async () => {
    const r = await acceptLanes(prop(), [L1, L2], { accept: async () => { throw new Error("Failed to fetch"); }, reload: async () => prop([L1, L2]) });
    expect(pendingLanes(r.proposal!)).toEqual([]);
    expect(explainRequestError(r.error!, "es")).toMatch(/Sin conexión/);
  });

  it("si tampoco se puede leer, se queda lo que había y el error", async () => {
    const antes = prop();
    const r = await acceptLanes(antes, [L1], { accept: async () => { throw new Error("Failed to fetch"); }, reload: async () => { throw new Error("Failed to fetch"); } });
    expect(r.proposal).toBe(antes);
    expect(r.error).toMatch(/fetch/);
    expect(r.unresolved).toBe(true);
  });
});

describe("la propuesta deja de existir o cambia mientras se ve", () => {
  const prop: any = { id: "p", version: 1, currency: "USD", lanes: [], accepted: [], expired: false };
  it("si al aceptar ya no hay propuesta, la explicación viaja con el cambio y se muestra en su lugar", () => {
    expect(afterAccept({ proposal: null, error: "RFX_PROPOSAL_REPLACED", unresolved: false }, () => "Hay una versión más nueva.", "Ya no está disponible.")).toEqual({ proposal: null, notice: "Hay una versión más nueva. Ya no está disponible." });
    expect(afterAccept({ proposal: null, error: null, unresolved: false }, (e) => e, "Ya no está disponible.")).toEqual({ proposal: null, notice: "Ya no está disponible." });
    expect(afterAccept({ proposal: prop, error: "X", unresolved: false }, (e) => e, "Ya no está disponible.")).toEqual({ proposal: prop, notice: null });
  });

  it("el panel del equipo vuelve a leer al regresar a la pestaña, una vez por regreso", () => {
    const ventana = new EventTarget();
    const documento = Object.assign(new EventTarget(), { visibilityState: "visible" });
    let t = 0;
    let lecturas = 0;
    const dejar = recargarAlVolver(() => { lecturas += 1; }, ventana, documento, () => t);
    ventana.dispatchEvent(new Event("focus"));
    documento.dispatchEvent(new Event("visibilitychange"));
    expect(lecturas).toBe(1);
    t = 5000;
    documento.visibilityState = "hidden";
    documento.dispatchEvent(new Event("visibilitychange"));
    expect(lecturas).toBe(1);
    documento.visibilityState = "visible";
    documento.dispatchEvent(new Event("visibilitychange"));
    expect(lecturas).toBe(2);
    dejar();
    t = 10000;
    ventana.dispatchEvent(new Event("focus"));
    expect(lecturas).toBe(2);
  });
});
