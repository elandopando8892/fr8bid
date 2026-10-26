// Contract source: rateware d5075892, index.ts:28589,29169,31282,11777.
// Adapted to the published Fr8Bid expected_versions contract on 2026-10-26.
// Synthetic values only; every call stays inside the injected transport.
import { describe, expect, it } from "vitest";
import { MesaApi } from "../src/cliente/api";
import * as mapear from "../src/cliente/mapear";
import { manejar, type Respuesta } from "../src/servidor/proxy";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";
import { avisoDe } from "../src/dominio/recorrido";
import { crearSimulado, sembrarDemo } from "../src/simulado/semilla";

const [protectedId] = EVENTOS_PROTEGIDOS;
const event = { id: "evento-sintetico", name: "PRUEBA CONTROLADA", rfx_id: "RFQ-SYN", status: "open", due_date: "2026-10-20", bid_count: 1, invitation_count: 1 };
const participant = { id: "p1", vendor_id: "v1", invitation_status: "quoted", award_role: "primary", awarded_at: "2026-10-21T12:01:00Z", responded_at: "2026-10-21T12:00:00Z", bid_rate: 1750, currency: "USD", invitation_token: "synthetic-secret", vendors: { vendor_name: "Carrier sintético" } };
const notice = { id: "m1", rfx_event_id: event.id, rfx_lane_vendor_id: "p1", channel: "email", recipient_email: "carrier@example.test", subject: "Adjudicación sintética", text_body: "Texto sintético", provider_message_id: "provider-synthetic", status: "sent", updated_at: "2026-10-21T12:02:00.123456Z", metadata: { notice_type: "rfx_award_closeout", rfx_lane_vendor_ids: ["p1", "p2"], bid_link: "https://example.test/private" } };
function fixture(legacy = false, rows: Record<string, unknown>[] = [notice], hasMore = false) {
  const calls: string[] = [];
  const api = new MesaApi((servicio, body) => manejar(servicio, body, "Bearer synthetic", {
    permitirEscrituras: false, real: true,
    enviar: async (_s, b): Promise<Respuesta> => {
      calls.push(String(b.action));
      let data: unknown;
      switch (b.action) {
        case "list_rfx_events": data = { [legacy ? "events" : "rows"]: [event, { ...event, id: protectedId }] }; break;
        case "list_rfx_detail": data = { event, lanes: [{ id: "r1", lane_number: 1, invitations: [participant] }] }; break;
        case "list_outreach_messages":
          expect(b.channel).toBe("email");
          data = { [legacy ? "messages" : "rows"]: rows, total: rows.length, has_more: hasMore }; break;
        case "list_rfx_segment_confirmations":
        case "list_rfx_lane_conditions":
        case "list_rfx_invitation_wave_reviews": data = { rows: [] }; break;
        case "list_rfx_carrier_replies": data = { rows: [], email_status: "checked" }; break;
        default: throw new Error("Operation not allowed in this fixture");
      }
      return { status: 200, body: data, headers: {} };
    }
  }), () => "2026-10-21");
  return { api, calls };
}

describe("lecturas compatibles con Rateware", () => {
  it("el simulador expone las mismas envolturas y campos de lectura", async () => {
    const base = crearSimulado();
    base.sim.hoy = () => "2026-10-21";
    let tick = Date.parse("2026-10-21T12:00:00Z");
    base.sim.ahora = () => new Date(tick += 1000).toISOString();
    const { sim, eventId } = await sembrarDemo(base);
    const events = await sim.llamar("rateware-api", { action: "list_rfx_events" }, "Bearer sim:admin");
    const messages = await sim.llamar("rateware-api", { action: "list_outreach_messages", rfx_event_id: eventId }, "Bearer sim:admin");
    expect(Array.isArray(events.body.rows)).toBe(true);
    expect(events.body.events).toBeUndefined();
    expect(messages.body.messages).toBeUndefined();
    expect(messages.body.rows[0]).toMatchObject({ channel: "email", recipient_email: expect.any(String), text_body: expect.any(String) });
    expect(messages.body.has_more).toBe(false);
    expect(messages.body.total).toBe(messages.body.rows.length);
  });
  it.each([false, true])("listado → detalle → preparación; formato heredado %s", async legacy => {
    const { api, calls } = fixture(legacy);
    const events = await api.eventos();
    expect(events).toHaveLength(1); expect(events[0].id).toBe(event.id);
    const d = await api.detalle(events[0].id);
    expect(d.avisos).toHaveLength(1);
    expect(d.avisos[0]).toMatchObject({ tipo: "adjudicacion", destinatario: notice.recipient_email, cuerpo: notice.text_body, reciboProveedor: notice.provider_message_id, version: notice.updated_at });
    expect(avisoDe(d, "p2", "adjudicacion")?.id).toBe("m1");
    expect(avisoDe(d, "ajena", "adjudicacion")).toBeNull();
    expect(api.prepararEntrega(d).estado).toBe("preparada");
    expect(calls).toEqual(["list_rfx_events", "list_rfx_detail", "list_outreach_messages", "list_rfx_segment_confirmations", "list_rfx_lane_conditions", "list_rfx_invitation_wave_reviews", "list_rfx_carrier_replies"]);
    const reloaded = await api.detalle(event.id);
    expect(reloaded.avisos).toEqual(d.avisos);
    expect(JSON.stringify(reloaded)).not.toContain("synthetic-secret");
    expect(JSON.stringify(reloaded)).not.toContain("/private");
  });

  it("no muestra WhatsApp como Gmail", async () => {
    const { api } = fixture(false, [{ ...notice, channel: "whatsapp" }]);
    expect((await api.detalle(event.id)).avisos).toEqual([]);
  });

  it("no presenta una página parcial como lectura completa", async () => {
    const { api, calls } = fixture(false, [notice], true);
    await expect(api.detalle(event.id)).rejects.toMatchObject({ code: "LECTURA_INCOMPLETA" });
    expect(calls.every(a => a.startsWith("list_"))).toBe(true);
  });

  it("la forma rows vacía tiene prioridad sobre eventos heredados", () => {
    expect(mapear.resumenes({ rows: [], events: [event] })).toEqual([]);
  });

  it("rechaza rows inválido en vez de aparentar lista vacía", () => {
    expect(() => mapear.resumenes({ rows: {}, events: [] })).toThrow();
  });

  it("el proxy filtra los eventos protegidos de ambas formas, sin mutar la respuesta", async () => {
    const raw = { rows: [event, { ...event, id: protectedId }], events: [{ ...event, id: protectedId }] };
    const snapshot = JSON.stringify(raw);
    const r = await manejar("rateware-api", { action: "list_rfx_events" }, "Bearer synthetic", { permitirEscrituras: false, real: true, enviar: async () => ({ status: 200, body: raw, headers: {} }) });
    expect(r.body.rows).toEqual([event]); expect(r.body.events).toEqual([]);
    expect(JSON.stringify(raw)).toBe(snapshot);
  });

  it("conserva rubros normales y mantiene la exclusión de referencias protegidas", async () => {
    const safe = { id: "rubro-sintetico", rubric_key: "logistics_model", rfx_event_id: event.id };
    const raw = { rows: [safe, { id: protectedId, rubric_key: "logistics_model" }, { id: "otro-rubro", rfx_event_id: protectedId }] };
    const original = JSON.stringify(raw);
    const r = await manejar("rateware-api", { action: "list_rfx_segment_confirmations", event_id: event.id }, "Bearer synthetic", { permitirEscrituras: false, enviar: async () => ({ status: 200, body: raw, headers: {} }) });
    expect(r.body).toEqual({ rows: [safe] });
    expect(JSON.stringify(raw)).toBe(original);
  });
});

describe("aprobación sin inferencias", () => {
  it.each([
    {}, { content_version: null, approved_version: null },
    { content_version: 1 }, { approved_version: 1 },
    { content_version: 0, approved_version: 0 },
    { content_version: "1", approved_version: "1" },
    { content_version: 2, approved_version: 1 },
    { content_version: NaN, approved_version: NaN }
  ])("no inventa aprobación con %j", fields => {
    const a = mapear.aviso({ ...notice, status: "approved", ...fields });
    expect(a).not.toHaveProperty("aprobadoHuella"); expect(a.estado).toBe("por_verificar");
  });

  it("una aprobación numérica heredada no autoriza el contrato vigente", () => {
    const a = mapear.aviso({ id: "legacy", kind: "rfx_award", to_email: "legacy@example.test", body: "Legacy", status: "approved", content_version: 2, approved_version: 2, approved_by: "admin", gmail_message_id: "old-provider" });
    expect(a).not.toHaveProperty("aprobadoHuella"); expect(a.estado).toBe("por_verificar");
    expect(a.version).toBe(""); expect(a.reciboProveedor).toBeNull();
  });

  it("prefiere campos actuales y conserva huella desconocida en una fila real", () => {
    const a = mapear.aviso({ ...notice, to_email: "old@example.test", body: "old", gmail_message_id: "old", approved_by: "admin" });
    expect(a).toMatchObject({ destinatario: notice.recipient_email, cuerpo: notice.text_body, reciboProveedor: notice.provider_message_id, version: notice.updated_at });
  });
});
