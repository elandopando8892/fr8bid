// P4 del recorrido del 26-nov: la página del evento se pinta sin esperar a Gmail.
// Valores sintéticos; todo queda dentro del transporte inyectado.
import { describe, expect, it } from "vitest";
import { MesaApi } from "../src/cliente/api";
import { manejar, type Respuesta } from "../src/servidor/proxy";
import { bloqueoIntentos } from "../src/dominio/acciones-mesa";
import { carriersPorEscribir } from "../src/dominio/seguimiento";
import type { Detalle } from "../src/dominio/tipos";

const event = { id: "evento-p4", name: "PRUEBA P4", rfx_id: "RFQ-P4", status: "open", due_date: "2026-12-20", bid_count: 0, invitation_count: 1 };
const participant = { id: "p1", vendor_id: "v1", invitation_status: "sent", invitation_token: "secreto-sintetico", vendors: { vendor_name: "Carrier sintético" } };

function fixture(gmail: Promise<Respuesta>) {
  return new MesaApi((servicio, body) => manejar(servicio, body, "Bearer synthetic", {
    permitirEscrituras: false, real: true,
    enviar: async (_s, b): Promise<Respuesta> => {
      if (b.action === "list_rfx_carrier_replies") return gmail;
      let data: unknown;
      switch (b.action) {
        case "list_rfx_detail": data = { event, lanes: [{ id: "r1", lane_number: 1, invitations: [participant] }] }; break;
        case "list_outreach_messages": data = { rows: [], total: 0, has_more: false }; break;
        case "list_rfx_segment_confirmations":
        case "list_rfx_lane_conditions":
        case "list_rfx_invitation_wave_reviews": data = { rows: [] }; break;
        default: throw new Error("Operation not allowed in this fixture");
      }
      return { status: 200, body: data, headers: {} };
    }
  }), () => "2026-11-27");
}

const respuestaGmail: Respuesta = { status: 200, body: { rows: [], email_status: "checked" }, headers: {} };

describe("página del evento sin esperar a Gmail", () => {
  it("pinta primero sin respuestas y luego completa con lo de Gmail", async () => {
    let soltar!: (r: Respuesta) => void;
    const api = fixture(new Promise<Respuesta>((r) => { soltar = r; }));
    const previas: Detalle[] = [];
    const completa = api.detalle(event.id, null, (d) => { previas.push(d); soltar(respuestaGmail); });
    const d = await completa;
    expect(previas).toHaveLength(1);
    expect(previas[0].leyendoGmail).toBe(true);
    expect(previas[0].respuestas).toBeNull();
    expect(previas[0].rutas).toHaveLength(1);
    // Mientras se revisa Gmail no se preparan intentos y se dice por qué.
    expect(bloqueoIntentos(previas[0])).toBe("Revisando en Gmail quién ya respondió…");
    expect(d.leyendoGmail).toBeUndefined();
    expect(d.respuestas).toEqual({});
    expect(bloqueoIntentos(d)).toBeNull();
  });

  it("sin la función de primera pintura, espera la lectura completa como antes", async () => {
    const api = fixture(Promise.resolve(respuestaGmail));
    const d = await api.detalle(event.id);
    expect(d.leyendoGmail).toBeUndefined();
    expect(d.respuestas).toEqual({});
  });

  it("si Gmail falla después de la primera pintura, queda el aviso de siempre", async () => {
    let soltar!: (r: Respuesta) => void;
    const api = fixture(new Promise<Respuesta>((r) => { soltar = r; }));
    const d = await api.detalle(event.id, null, () => soltar({ status: 500, body: { error: "falló" }, headers: {} }));
    expect(d.leyendoGmail).toBeUndefined();
    expect(d.respuestas).toBeNull();
    expect(bloqueoIntentos(d)).toBe("No se pudo saber quién ya respondió; intenta más tarde.");
  });

  it("con un carrier pendiente, no se le manda un intento preparado hasta saber si ya contestó", async () => {
    let soltar!: (r: Respuesta) => void;
    const api = fixture(new Promise<Respuesta>((r) => { soltar = r; }));
    let previa: Detalle | null = null;
    const completa = api.detalle(event.id, null, (d) => { previa = d; soltar(respuestaGmail); });
    const d = await completa;
    expect(previa).not.toBeNull();
    // Primera pintura: Gmail no ha contestado, nadie queda como «por escribir».
    expect(carriersPorEscribir(previa!, "2026-11-27", new Date("2026-11-27T12:00:00Z")).size).toBe(0);
    // Con la revisión de Gmail completa, el carrier que no ha respondido sí recibe su intento.
    expect([...carriersPorEscribir(d, "2026-11-27", new Date("2026-11-27T12:00:00Z"))]).toEqual(["v1"]);
  });
});
