import { describe, expect, it } from "vitest";
import { MesaApi } from "../src/cliente/api";
import { detalle } from "../src/cliente/mapear";

const t = (s: string) => `2026-10-21T15:00:${s}.000Z`;
const revision = (n: number, creadaEn: string) => ({ revision: n, bid_rate: 1800 - n * 50, created_at: creadaEn });
function fila() {
  return {
    id: "participacion-sintetica", vendor_id: "carrier-sintetico", invitation_status: "quoted",
    award_role: "primary", awarded_at: t("30"), awarded_by: "admin@example.test",
    bid_rate: 1700, created_at: t("00"), responded_at: t("20"),
    bid_revisions: [revision(1, t("10")), revision(2, t("20"))]
  };
}
type Fila = ReturnType<typeof fila>;
function crudo(lv: Fila) {
  return { event: { id: "evento-sintetico", status: "open", due_date: "2026-10-20" },
    lanes: [{ id: "ruta-sintetica", lane_number: 1, invitations: [lv] }] };
}
function cliente(lv: Fila) {
  const acciones: string[] = [];
  const api = new MesaApi(async (_servicio, body) => {
    acciones.push(String(body.action));
    if (body.action === "list_rfx_detail") return { status: 200, body: crudo(lv), headers: {} };
    if (body.action === "list_outreach_messages") return { status: 200, body: { messages: [] }, headers: {} };
    if (body.action === "list_rfx_segment_confirmations") return { status: 200, body: { rows: [] }, headers: {} };
    if (["list_rfx_lane_conditions", "list_rfx_invitation_wave_reviews", "list_rfx_carrier_replies"].includes(String(body.action))) return { status: 200, body: { rows: [], email_status: "checked" }, headers: {} };
    throw new Error("Escritura no esperada");
  }, () => "2026-10-21");
  return { api, acciones };
}
const inciertos: [string, (v: Fila) => void][] = [
  ["todas las ofertas posteriores", v => { v.awarded_at = t("05"); }],
  ["adjudicación sin fecha", v => { v.awarded_at = ""; }],
  ["adjudicación con fecha inválida", v => { v.awarded_at = "desconocida"; }],
  ["día de calendario inexistente", v => { v.bid_revisions[0].created_at = "2026-02-30T15:00:10Z"; }],
  ["adjudicación sin zona horaria", v => { v.awarded_at = "2026-10-21T15:00:30"; }],
  ["oferta sin fecha", v => { v.bid_revisions[1].created_at = ""; }],
  ["oferta con fecha inválida", v => { v.bid_revisions[0].created_at = "invalida"; }],
  ["versiones con fechas invertidas", v => { v.bid_revisions[0].created_at = t("25"); }],
  ["versiones con el mismo instante", v => { v.bid_revisions[1].created_at = t("10"); }],
  ["número de revisión duplicado", v => { v.bid_revisions[1].revision = 1; }],
  ["número de revisión inválido", v => { v.bid_revisions[1].revision = NaN; }],
  ["fila sin historial y respuesta posterior", v => { v.bid_revisions = []; v.responded_at = t("40"); }],
  ["fila sin historial y sin fecha de respuesta", v => { v.bid_revisions = []; v.responded_at = ""; }]
];

describe("adjudicación con cronología incierta", () => {
  it.each(inciertos)("%s: pide revisión y no entrega", async (_nombre, cambiar) => {
    const lv = fila(); cambiar(lv);
    const { api, acciones } = cliente(lv);
    const d = await api.detalle("evento-sintetico");
    expect(d.rutas[0].participaciones[0].adjudicada).toBeNull();
    expect(d.rutas[0].participaciones[0].rol).toBe("primario");
    expect(api.prepararEntrega(d)).toMatchObject({ estado: "sin_preparar", operationId: null, error: expect.stringMatching(/Revisa la adjudicación/) });
    const r = await api.confirmarEntrega("evento-sintetico", "00000000-0000-4000-8000-000000000001");
    expect(r.entrega.estado).toBe("rechazada");
    expect(r.recibo).toBeNull();
    expect(acciones).not.toContain("closeout_awarded_rfx_to_rateware");
  });

  it("revalida antes de confirmar una preparación previa", async () => {
    const lv = fila(); const { api, acciones } = cliente(lv);
    const preparada = api.prepararEntrega(await api.detalle("evento-sintetico"));
    expect(preparada.estado).toBe("preparada");
    lv.awarded_at = t("05");
    const r = await api.confirmarEntrega("evento-sintetico", preparada.operationId!);
    expect(r.entrega.estado).toBe("rechazada");
    expect(r.entrega.error).toMatch(/Revisa la adjudicación/);
    expect(acciones).not.toContain("closeout_awarded_rfx_to_rateware");
  });
});

describe("adjudicación identificable", () => {
  it.each([
    ["historial normal", (v: Fila) => {}, 2],
    ["historial recibido en orden inverso", (v: Fila) => { v.bid_revisions.reverse(); }, 2],
    ["zonas horarias distintas", (v: Fila) => { v.bid_revisions[1].created_at = "2026-10-21T10:00:20-05:00"; v.awarded_at = "2026-10-21T09:00:30-06:00"; }, 2],
    ["fila real sin historial usa la respuesta", (v: Fila) => { v.bid_revisions = []; v.created_at = t("40"); }, 1],
    ["respuesta simultánea a la adjudicación", (v: Fila) => { v.awarded_at = t("20"); }, 2]
  ] as [string, (v: Fila) => void, number][])("%s", (_nombre, cambiar, numero) => {
    const lv = fila(); cambiar(lv); const previo = JSON.stringify(lv);
    const d = detalle(crudo(lv));
    expect(d.rutas[0].participaciones[0].adjudicada?.numero).toBe(numero);
    expect(cliente(lv).api.prepararEntrega(d).estado).toBe("preparada");
    expect(JSON.stringify(lv)).toBe(previo);
  });
});

describe("respaldo incluido en la entrega", () => {
  it.each([false, true])("revisa también la certeza del respaldo: %s", async (incierto) => {
    const principal = fila();
    const respaldo = { ...fila(), id: "respaldo-sintetico", award_role: "backup", awarded_at: incierto ? "" : t("30") };
    const raw = crudo(principal); raw.lanes[0].invitations.push(respaldo);
    const acciones: string[] = [];
    const api = new MesaApi(async (_s, b) => {
      acciones.push(String(b.action));
      return { status: 200, body: b.action === "list_rfx_detail" ? raw : {}, headers: {} };
    });
    const prep = api.prepararEntrega(await api.detalle("evento-sintetico"));
    expect(prep.estado).toBe(incierto ? "sin_preparar" : "preparada");
    if (incierto) {
      expect(prep.error).toMatch(/Revisa la adjudicación/);
      expect((await api.confirmarEntrega("evento-sintetico", "operacion-sintetica")).entrega.estado).toBe("rechazada");
    }
    expect(acciones).not.toContain("closeout_awarded_rfx_to_rateware");
  });
});
