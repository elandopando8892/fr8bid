import { describe, expect, it } from "vitest";
import { manejar } from "../src/servidor/proxy";

const EV = "11111111-1111-4111-8111-111111111111";
const lv = (x: Record<string, unknown>) => ({ id: "lv-1", bid_rate: 1000, award_role: null, updated_at: "2026-11-23T09:00:00.000Z", ...x });
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

const rechazo = (x: Record<string, unknown> = {}) => ({ action: "reject_rfx_bid", event_id: EV, id: "lv-1", reason: "Tarifa fuera de mercado", expected_updated_at: "2026-11-23T09:00:00.000Z", confirmed: true, confirmation_action: "reject_rfx_bid", ...x });

describe("proxy: archivar, borrar y rechazar desde la página del evento", () => {
  it("archivar y borrar exigen el evento y la confirmación", async () => {
    for (const action of ["archive_rfx_event", "delete_rfx_event"]) {
      const env: string[] = [];
      expect((await manejar("rateware-api", { action, id: EV }, "Bearer x", op(null, env))).status).toBe(400);
      expect((await manejar("rateware-api", { action, id: "no", confirmed: true, confirmation_action: action }, "Bearer x", op(null, env))).status).toBe(400);
      expect(env).toEqual([]);
      expect((await manejar("rateware-api", { action, id: [EV], confirmed: true, confirmation_action: action }, "Bearer x", op(null, env))).status).toBe(400);
      expect(env).toEqual([]);
      const det = { event: { id: EV, status: "draft" }, lanes: [] };
      expect((await manejar("rateware-api", { action, id: EV, confirmed: true, confirmation_action: action }, "Bearer x", op(det, env))).status).toBe(200);
      expect(env).toEqual(action === "archive_rfx_event" ? ["list_rfx_detail", action] : [action]);
    }
  });

  it("un evento adjudicado no se archiva", async () => {
    const env: string[] = [];
    const det = { event: { id: EV, status: "awarded" }, lanes: [] };
    const r = await manejar("rateware-api", { action: "archive_rfx_event", id: EV, confirmed: true, confirmation_action: "archive_rfx_event" }, "Bearer x", op(det, env));
    expect(r.body?.code).toBe("EVENTO_ADJUDICADO");
    expect(env).toEqual(["list_rfx_detail"]);
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

describe("proxy: rechazar solo la versión que se vio", () => {
  const pasa = async (det: unknown, body: Record<string, unknown>) => {
    const env: string[] = [];
    const r = await manejar("rateware-api", body, "Bearer x", op(det, env));
    return { status: r.status, code: r.body?.code, escribio: env.includes("reject_rfx_bid") };
  };
  const vista = "2026-11-23T10:00:00.000Z";
  it("rechaza si la versión coincide y no escribe si cambió o viene vacía", async () => {
    expect(await pasa(detalle("open", lv({ updated_at: "2026-11-23T10:00:00+00:00" })), rechazo({ expected_updated_at: vista }))).toMatchObject({ status: 200, escribio: true });
    expect(await pasa(detalle("open", lv({ updated_at: "2026-11-23T10:05:00Z" })), rechazo({ expected_updated_at: vista }))).toMatchObject({ code: "OFERTA_CAMBIO", escribio: false });
    expect(await pasa(detalle("open", lv({ updated_at: vista })), rechazo({ expected_updated_at: "" }))).toMatchObject({ code: "OFERTA_CAMBIO", escribio: false });
    expect(await pasa(detalle("open", lv({ updated_at: vista })), rechazo({ expected_updated_at: undefined }))).toMatchObject({ code: "OFERTA_CAMBIO", escribio: false });
    expect(await pasa(detalle("open", lv({ updated_at: undefined })), rechazo({ expected_updated_at: vista }))).toMatchObject({ code: "OFERTA_CAMBIO", escribio: false });
  });
});

describe("proxy: restaurar un evento archivado a borrador", () => {
  const restaurar = (x: Record<string, unknown> = {}) => ({ action: "update_rfx_event", event_id: EV, patch: { status: "draft" }, ...x });
  const pasa = async (det: unknown, body: Record<string, unknown>) => {
    const env: string[] = [];
    const r = await manejar("rateware-api", body, "Bearer x", op(det, env));
    return { status: r.status, code: r.body?.code, escribio: env.includes("update_rfx_event") };
  };
  it("solo un evento archivado y solo el estado", async () => {
    expect(await pasa({ event: { id: EV, status: "archived" }, lanes: [] }, restaurar())).toMatchObject({ status: 200, escribio: true });
    expect(await pasa({ event: { id: EV, status: "open" }, lanes: [] }, restaurar())).toMatchObject({ code: "NO_ARCHIVADO", escribio: false });
    expect(await pasa({ event: { id: EV, status: "awarded" }, lanes: [] }, restaurar())).toMatchObject({ code: "NO_ARCHIVADO", escribio: false });
    expect(await pasa({ event: { id: EV, status: "archived" }, lanes: [] }, restaurar({ patch: { status: "draft", due_date: "2026-12-01" } }))).toMatchObject({ code: "SOLO_ESTADO", escribio: false });
    expect(await pasa({ event: { id: EV, status: "archived" }, lanes: [] }, restaurar({ event_id: [EV] }))).toMatchObject({ code: "FALTA_EVENTO", escribio: false });
    expect(await pasa({ event: { id: EV, status: "archived" }, lanes: [] }, restaurar({ event_id: "no" }))).toMatchObject({ code: "FALTA_EVENTO", escribio: false });
  });
});
