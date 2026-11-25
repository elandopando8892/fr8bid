import { describe, expect, it, vi } from "vitest";
import { MesaApi } from "../src/cliente/api";

// Recorrido como Administrador 24-nov-2026: varias recargas seguidas de la
// página del evento agotan la cuota por minuto de Gmail y el seguimiento
// contaba de menos sin decir por qué.
const CUOTA = { status: 500, body: { error: "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user' of service 'gmail.googleapis.com'" }, headers: {} };
function cliente(respuestas: (n: number) => { status: number; body: any; headers: Record<string, string> }) {
  let n = 0;
  const api = new MesaApi(async (_s, body) => {
    if (body.action === "list_rfx_detail") return { status: 200, body: { event: { id: "e", status: "open", due_date: "2026-12-31" }, lanes: [] }, headers: {} };
    if (body.action === "list_outreach_messages") return { status: 200, body: { messages: [] }, headers: {} };
    if (body.action === "list_rfx_carrier_replies") return respuestas(n++);
    return { status: 200, body: { rows: [] }, headers: {} };
  }, () => "2026-11-24");
  return { api, llamadas: () => n };
}
const espera = async <T,>(p: Promise<T>) => { await vi.advanceTimersByTimeAsync(2500); return p; };

describe("Gmail saturado al leer respuestas", () => {
  it("reintenta una vez y, si responde, cuenta normal", async () => {
    vi.useFakeTimers();
    const { api, llamadas } = cliente((n) => (n === 0 ? CUOTA : { status: 200, body: { rows: [], email_status: "checked" }, headers: {} }));
    const d = await espera(api.detalle("e"));
    expect(llamadas()).toBe(2);
    expect(d.respuestas).toEqual({});
    expect(d.gmailOcupado).toBeUndefined();
    vi.useRealTimers();
  });
  it("si sigue saturado, no prepara intentos y dice el motivo", async () => {
    vi.useFakeTimers();
    const { api, llamadas } = cliente(() => CUOTA);
    const d = await espera(api.detalle("e"));
    expect(llamadas()).toBe(2);
    expect(d.respuestas).toBeNull();
    expect(d.gmailOcupado).toBe(true);
    vi.useRealTimers();
  });
  it("otro error no se reintenta ni se presenta como Gmail ocupado", async () => {
    const { api, llamadas } = cliente(() => ({ status: 500, body: { error: "boom" }, headers: {} }));
    const d = await api.detalle("e");
    expect(llamadas()).toBe(1);
    expect(d.respuestas).toBeNull();
    expect(d.gmailOcupado).toBeUndefined();
  });
});
