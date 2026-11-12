import { describe, expect, it } from "vitest";
import { crearLecturas } from "../src/mcp/lecturas";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";

const evento = "11111111-1111-4111-8111-111111111111";
const ruta = "22222222-2222-4222-8222-222222222222";
function lecturaDetalle(invitations: Record<string, unknown>[] = [], recomendaciones: unknown = { recommendations: [] }) {
  return crearLecturas(async (_s, b) => ({ status: 200, headers: {}, body: b.action === "list_rfx_detail"
    ? { event: { id: evento }, lanes: [{ id: ruta, target_rate: 100, currency: "USD", invitations }] }
    : b.action === "carrier_recommendations" ? recomendaciones : { rows: [] } }));
}
describe("fronteras adicionales del MCP de lectura", () => {
  it.each(["", null, "no numerico", Infinity, "   ", "Infinity"])("marca bid_rate %s como sin tarifa y no lo compara con target", async bid_rate => {
    const leer = lecturaDetalle([
      { id: "sin-tarifa", bid_rate },
      { id: "valida", bid_rate: "150", currency: "USD" },
      { id: "cero", bid_rate: 0, currency: "USD" }
    ]);
    const r = await leer("ofertas_evento", { event_id: evento });
    expect(r.rutas[0].ofertas[0]).toMatchObject({ tarifa: null, estado_tarifa: "sin_tarifa", vigente: null, modelo: null, diferencia_objetivo: null });
    expect(r.rutas[0].ofertas[1]).toMatchObject({ tarifa: 150, estado_tarifa: "con_tarifa", diferencia_objetivo: 50 });
    expect(r.rutas[0].ofertas[2]).toMatchObject({ tarifa: 0, estado_tarifa: "con_tarifa", diferencia_objetivo: -100 });
  });
  it.each([{}, { recommendations: {} }, { recommendations: [null] }, { recommendations: ["carrier"] }])("rechaza recomendaciones malformadas en vez de informar cero sugerencias: %j", async body => {
    await expect(lecturaDetalle([], body)("carriers_sugeridos", { event_id: evento })).rejects.toMatchObject({ code: "RESPUESTA_INVALIDA" });
  });
  it("identifica una ruta que excede el limite sin devolver su contenido", async () => {
    const leer = lecturaDetalle([{ id: "grande", bid_rate: 150, vendors: { vendor_name: "x".repeat(210000) } }]);
    const r = await leer("ofertas_evento", { event_id: evento, ruta_id: ruta, limit: 1 });
    expect(r.error).toMatchObject({ codigo: "RESPUESTA_DEMASIADO_GRANDE", ruta_id: ruta });
    expect(r.error.sugerencia).toMatch(/filtr/i);
    expect(JSON.stringify(r).length).toBeLessThan(2000);
    expect(r.rutas).toBeUndefined();
  });
  it.each(["eventos", "carrier", "historial_carrier"])("no convierte una respuesta malformada en cero resultados: %s", async nombre => {
    const leer = crearLecturas(async () => ({ status: 200, headers: {}, body: {} }));
    await expect(leer(nombre, nombre === "eventos" ? {} : { carrier_id: evento })).rejects.toThrow();
  });
  it("rechaza un detalle distinto al ID pedido", async () => {
    const leer = crearLecturas(async (_s, b) => ({ status: 200, headers: {}, body: b.action === "list_rfx_detail"
      ? { event: { id: "22222222-2222-4222-8222-222222222222" }, lanes: [] }
      : { rows: [] } }));
    await expect(leer("evento", { event_id: evento })).rejects.toThrow();
  });
  it("valida todos los eventos históricos antes de cualquier consulta", async () => {
    let consultas = 0;
    const leer = crearLecturas(async () => { consultas++; return { status: 200, headers: {}, body: { rows: [] } }; });
    await expect(leer("tarifas_ruta", { origen: "Monterrey", destino: "Dallas", caja: "dry_van", operacion: "D2D Export", event_ids: [evento, [...EVENTOS_PROTEGIDOS][0]] })).rejects.toThrow();
    expect(consultas).toBe(0);
  });
  it("no propaga previews arbitrarios del listado al contexto del modelo", async () => {
    const leer = crearLecturas(async () => ({ status: 200, headers: {}, body: { rows: [{ id: evento, name: "Evento sintético", lanes_preview: [{ metadata: { privado: "no-publicar" } }] }] } }));
    const r = await leer("eventos", {});
    expect(r.eventos[0].numRutas).toBe(1);
    expect(JSON.stringify(r)).not.toContain("no-publicar");
    expect(r.eventos[0].rutas).toBeUndefined();
  });
  it("filtra registros protegidos también en listados heredados", async () => {
    const leer = crearLecturas(async () => ({ status: 200, headers: {}, body: { events: [{ id: evento, name: "Visible" }, { id: [...EVENTOS_PROTEGIDOS][0], name: "Oculto" }] } }));
    const r = await leer("eventos", {});
    expect(r.eventos.map((e: any) => e.nombre)).toEqual(["Visible"]);
  });
});
