import { describe, expect, it } from "vitest";
import { crearLecturas } from "../src/mcp/lecturas";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";

const evento = "11111111-1111-4111-8111-111111111111";
describe("fronteras adicionales del MCP de lectura", () => {
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
