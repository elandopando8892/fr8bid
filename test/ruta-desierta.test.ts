import { describe, expect, it } from "vitest";
import { bloqueoCerrarSinAdjudicar, bloqueoDesierta, bloqueoReabrirRuta, rutasSinDecidir } from "../src/dominio/acciones-mesa";
import { manejar } from "../src/servidor/proxy";

const p = (x: Record<string, unknown> = {}) => ({ estado: "respondio", versiones: [{ numero: 1 }], rol: null, ...x });
const r = (numero: number, ps: Record<string, unknown>[], desiertaMotivo: string | null = null) => ({ id: `r${numero}`, numero, desiertaMotivo, participaciones: ps });
const d = (estado: string, ...rutas: unknown[]) => ({ evento: { id: "ev-1", estado }, rutas }) as any;

describe("ruta desierta y «Cerrar sin adjudicar» (reglas)", () => {
  it("solo con el evento cerrado a ofertas, sin primario ni respaldo y una vez", () => {
    expect(bloqueoDesierta(d("cerrado", r(1, [p()])), r(1, [p()]) as any)).toBeNull();
    expect(bloqueoDesierta(d("abierto"), r(1, [p()]) as any)).toMatch(/cerrado a ofertas/);
    expect(bloqueoDesierta(d("adjudicado"), r(1, [p()]) as any)).toMatch(/cerrado a ofertas/);
    expect(bloqueoDesierta(d("cerrado"), r(1, [p({ rol: "respaldo" })]) as any)).toMatch(/primario o respaldo/);
    expect(bloqueoDesierta(d("cerrado"), r(1, [p()], "x") as any)).toMatch(/ya está desierta/);
    expect(bloqueoReabrirRuta(d("cerrado"), r(1, [], "x") as any)).toBeNull();
    expect(bloqueoReabrirRuta(d("cerrado"), r(1, []) as any)).toMatch(/no está desierta/);
  });

  it("cerrar sin adjudicar toma solo las rutas por decidir y pide al menos una oferta en el evento", () => {
    const ev = d("cerrado", r(1, [p({ rol: "primario" })]), r(2, [p()]), r(3, [], "x"), r(4, []));
    expect(rutasSinDecidir(ev).map((x) => x.numero)).toEqual([2, 4]);
    expect(bloqueoCerrarSinAdjudicar(ev)).toBeNull();
    expect(bloqueoCerrarSinAdjudicar(d("cerrado", r(1, [p({ versiones: [] })])))).toMatch(/archiva el evento/);
    expect(bloqueoCerrarSinAdjudicar(d("cerrado", r(1, [p({ rol: "primario" })])))).toBe("Todas las rutas ya están decididas.");
    expect(bloqueoCerrarSinAdjudicar(d("abierto", r(1, [p()])))).toMatch(/cerrado a ofertas/);
  });
});

const EV = "11111111-1111-4111-8111-111111111111";
const L1 = "22222222-2222-4222-8222-222222222222";
const L2 = "33333333-3333-4333-8333-333333333333";
const crudo = (status: string, lanes: Record<string, unknown>[]) => ({ event: { id: EV, status, due_date: "2026-01-01" }, lanes });
const lane = (id: string, x: Record<string, unknown> = {}, inv: Record<string, unknown>[] = []) => ({ id, lane_number: id === L1 ? 1 : 2, invitations: inv, ...x });

function op(det: unknown, enviados: string[]) {
  return {
    permitirEscrituras: true,
    real: true,
    hoy: () => "2026-11-23",
    enviar: async (_s: string, b: Record<string, unknown>) => {
      enviados.push(String(b.action));
      return b.action === "list_rfx_detail" ? { status: 200, body: det, headers: {} } : { status: 200, body: { ok: true }, headers: {} };
    }
  } as any;
}
const cuerpo = (x: Record<string, unknown> = {}) => ({ action: "set_rfx_lane_no_award", rfx_event_id: EV, lane_ids: [L1], no_award: true, reason: "Sin ofertas suficientes", confirmed: true, confirmation_action: "set_rfx_lane_no_award", ...x });

describe("proxy: set_rfx_lane_no_award", () => {
  const pasa = async (det: unknown, body = cuerpo()) => {
    const env: string[] = [];
    const res = await manejar("rateware-api", body, "Bearer x", op(det, env));
    return { status: res.status, code: res.body?.code, escribio: env.includes("set_rfx_lane_no_award") };
  };

  it("declara desierta una ruta sin decidir de un evento cerrado a ofertas", async () => {
    const conOferta = lane(L2, {}, [{ id: "lv2", vendor_id: "v", bid_rate: 1000, invitation_status: "bid_submitted" }]);
    expect(await pasa(crudo("open", [lane(L1), conOferta]))).toMatchObject({ status: 200, escribio: true });
    expect(await pasa(crudo("open", [lane(L1), conOferta]), cuerpo({ lane_ids: [L1, L2] }))).toMatchObject({ status: 200, escribio: true });
  });

  it("no declara desiertas las rutas de un evento sin ninguna oferta (se archiva)", async () => {
    expect(await pasa(crudo("open", [lane(L1), lane(L2)]))).toMatchObject({ code: "NO_PERMITIDO", escribio: false });
  });

  it("no escribe sin confirmación, sin motivo, con rutas ajenas o inválidas", async () => {
    const det = crudo("open", [lane(L1)]);
    expect(await pasa(det, cuerpo({ confirmed: false }))).toMatchObject({ code: "SIN_CONFIRMAR", escribio: false });
    expect(await pasa(det, cuerpo({ reason: " " }))).toMatchObject({ code: "FALTA_MOTIVO", escribio: false });
    expect(await pasa(det, cuerpo({ lane_ids: [] }))).toMatchObject({ code: "FALTA_RUTA", escribio: false });
    expect(await pasa(det, cuerpo({ lane_ids: [L1, L1] }))).toMatchObject({ code: "FALTA_RUTA", escribio: false });
    expect(await pasa(det, cuerpo({ lane_ids: [L2] }))).toMatchObject({ status: 404, escribio: false });
    expect(await pasa(det, cuerpo({ rfx_event_id: "no" }))).toMatchObject({ code: "FALTA_EVENTO", escribio: false });
  });

  it("respeta el evento y la ruta: abierto a ofertas, adjudicado, con primario o ya desierta", async () => {
    expect(await pasa({ ...crudo("open", [lane(L1)]), event: { id: EV, status: "open", due_date: "2026-12-31" } })).toMatchObject({ code: "NO_PERMITIDO", escribio: false });
    expect(await pasa(crudo("awarded", [lane(L1)]))).toMatchObject({ code: "EVENTO_NO_PERMITE", escribio: false });
    expect(await pasa(crudo("open", [lane(L1, {}, [{ id: "lv", vendor_id: "v", bid_rate: 1000, award_role: "primary", invitation_status: "awarded" }])]))).toMatchObject({ code: "NO_PERMITIDO", escribio: false });
    expect(await pasa(crudo("open", [lane(L1, { no_award_at: "2026-11-20T00:00:00Z" })]))).toMatchObject({ code: "NO_PERMITIDO", escribio: false });
  });

  it("reabre solo una ruta desierta y sin pedir motivo", async () => {
    const desierta = crudo("open", [lane(L1, { no_award_at: "2026-11-20T00:00:00Z", no_award_reason: "x" })]);
    expect(await pasa(desierta, cuerpo({ no_award: false, reason: undefined }))).toMatchObject({ status: 200, escribio: true });
    expect(await pasa(crudo("open", [lane(L1)]), cuerpo({ no_award: false, reason: undefined }))).toMatchObject({ code: "NO_PERMITIDO", escribio: false });
  });
});

describe("entrega con todas las rutas desiertas", () => {
  it("tras recargar, el evento adjudicado con todas las rutas desiertas cuenta como entregado", async () => {
    const { entregaConfirmada } = await import("../src/dominio/recorrido");
    const sin = { estado: "sin_preparar", operationId: null, error: null } as any;
    const ev = (estado: string, ...rutas: unknown[]) => ({ evento: { id: "e", estado }, rutas, recibo: null }) as any;
    expect(entregaConfirmada(ev("adjudicado", r(1, [], "x"), r(2, [], "y")), sin)).toBe(true);
    expect(entregaConfirmada(ev("cerrado", r(1, [], "x")), sin)).toBe(false);
    expect(entregaConfirmada(ev("adjudicado", r(1, [], "x"), r(2, [p()])), sin)).toBe(false);
    expect(entregaConfirmada(ev("adjudicado", r(1, [p({ rol: "primario", entregadaEn: "2026-11-23" })])), sin)).toBe(true);
    expect(entregaConfirmada(ev("adjudicado", r(1, [p({ rol: "primario", entregadaEn: null })])), sin)).toBe(false);
  });
});

describe("todas las rutas desiertas tras la entrega", () => {
  it("no se declara desierta una ruta de un evento sin ninguna oferta", () => {
    const sinOfertas = d("cerrado", r(1, [p({ versiones: [] })]), r(2, []));
    expect(bloqueoDesierta(sinOfertas, sinOfertas.rutas[0])).toMatch(/archiva el evento/);
    const conUna = d("cerrado", r(1, [p({ versiones: [] })]), r(2, [p()]));
    expect(bloqueoDesierta(conUna, conUna.rutas[0])).toBeNull();
  });

  it("el aviso pide avisar a quienes ofertaron y Loads no queda esperando", async () => {
    const { recorrido } = await import("../src/dominio/recorrido");
    const ctx = { rol: "admin", hoy: "2026-11-23", entrega: { estado: "sin_preparar", operationId: null, error: null } } as any;
    const ev = (avisos: unknown[]) =>
      ({ evento: { id: "e", estado: "adjudicado", shipper: "S", plazo: null, cierre: null }, rutas: [r(1, [p({ carrierId: "c1", rubros: {} })], "x")], recibo: null, avisos }) as any;
    const paso = (x: any, clave: string) => recorrido(x, ctx).pasos.find((s) => s.clave === clave)!;
    expect(paso(ev([]), "aviso")).toMatchObject({ estado: "actual" });
    expect(paso(ev([]), "aviso").detalle).toMatch(/Sin ganadores/);
    expect(paso(ev([]), "loads")).toMatchObject({ estado: "hecho" });
    expect(paso(ev([{ tipo: "adjudicacion", estado: "aceptado" }]), "aviso")).toMatchObject({ estado: "hecho" });
    expect(paso(ev([{ tipo: "adjudicacion", estado: "borrador" }]), "aviso")).toMatchObject({ estado: "actual" });
  });
});
