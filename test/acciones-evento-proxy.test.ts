import { describe, expect, it } from "vitest";
import { manejar } from "../src/servidor/proxy";

const EV = "11111111-1111-4111-8111-111111111111";
const lv = (x: Record<string, unknown>) => ({ id: "lv-1", bid_rate: 1000, award_role: null, ...x });
const detalle = (status: string, inv: Record<string, unknown>) => ({ event: { id: EV, status }, lanes: [{ id: "l1", invitations: [inv] }] });

function op(det: unknown, enviados: string[]) {
  return {
    permitirEscrituras: true,
    real: true,
    enviar: async (_s: string, b: Record<string, unknown>) => {
      enviados.push(String(b.action));
      return b.action === "list_rfx_detail" ? { status: 200, body: det, headers: {} } : { status: 200, body: { ok: true }, headers: {} };
    }
  } as any;
}

const rechazo = (x: Record<string, unknown> = {}) => ({ action: "reject_rfx_bid", event_id: EV, id: "lv-1", reason: "Tarifa fuera de mercado", confirmed: true, confirmation_action: "reject_rfx_bid", ...x });

describe("proxy: archivar, borrar y rechazar desde la página del evento", () => {
  it("archivar y borrar exigen el evento y la confirmación", async () => {
    for (const action of ["archive_rfx_event", "delete_rfx_event"]) {
      const env: string[] = [];
      expect((await manejar("rateware-api", { action, id: EV }, "Bearer x", op(null, env))).status).toBe(400);
      expect((await manejar("rateware-api", { action, id: "no", confirmed: true, confirmation_action: action }, "Bearer x", op(null, env))).status).toBe(400);
      expect(env).toEqual([]);
      expect((await manejar("rateware-api", { action, id: EV, confirmed: true, confirmation_action: action }, "Bearer x", op(null, env))).status).toBe(200);
      expect(env).toEqual([action]);
    }
  });

  it("rechazar solo una oferta de este evento, con motivo, sin adjudicar y con el evento abierto o cerrado", async () => {
    const pasa = async (det: unknown, body = rechazo()) => {
      const env: string[] = [];
      const r = await manejar("rateware-api", body, "Bearer x", op(det, env));
      return { status: r.status, code: r.body?.code, escribio: env.includes("reject_rfx_bid") };
    };
    expect(await pasa(detalle("open", lv({})))).toMatchObject({ status: 200, escribio: true });
    expect(await pasa(detalle("closed", lv({})))).toMatchObject({ status: 409, escribio: false });
    expect(await pasa(detalle("awarded", lv({})))).toMatchObject({ status: 409, escribio: false });
    expect(await pasa(detalle("open", lv({ award_role: "primary" })))).toMatchObject({ code: "ADJUDICADA", escribio: false });
    expect(await pasa(detalle("open", lv({ bid_rate: null })))).toMatchObject({ code: "SIN_OFERTA", escribio: false });
    expect(await pasa(detalle("open", lv({ id: "otra" })))).toMatchObject({ status: 404, escribio: false });
    expect(await pasa(detalle("open", lv({})), rechazo({ reason: " " }))).toMatchObject({ code: "FALTA_MOTIVO", escribio: false });
    expect(await pasa(detalle("open", lv({})), rechazo({ confirmed: false }))).toMatchObject({ code: "SIN_CONFIRMAR", escribio: false });
  });
});

describe("oferta rechazada", () => {
  it("sin tarifa vigente no quedan versiones aunque el simulado guarde el historial", async () => {
    const { detalle } = await import("../src/cliente/mapear");
    const d = detalle({ event: { id: EV, status: "open", due_date: "2099-01-01" }, lanes: [{ id: "l1", lane_number: 1, invitations: [{ id: "lv-1", vendor_id: "v", invitation_status: "declined", bid_rate: null, bid_revisions: [{ revision: 1, bid_rate: 900, currency: "USD", created_at: "2026-11-01T00:00:00Z" }], vendors: { vendor_name: "X" } }] }] } as any);
    expect(d.rutas[0].participaciones[0].versiones).toEqual([]);
  });
});
