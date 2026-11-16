import { describe, expect, it } from "vitest";
import { crearSimulado, sembrarDemo } from "../src/simulado/semilla";
import { transporteSimulado } from "../src/cliente/api";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";
import { crearLecturas } from "../src/mcp/lecturas";

async function preparar(usuario = "operador") {
  const base = crearSimulado();
  base.sim.hoy = () => "2026-10-29";
  base.sim.ahora = () => "2026-10-29T18:00:00Z";
  const demo = await sembrarDemo(base);
  demo.sim.events.find(e => e.id === demo.eventId)!.rfx_id = "RFx-FR8BID-PRUEBA-01";
  const llamadas: string[] = [];
  const transporte = transporteSimulado(demo.sim, () => usuario);
  const lecturas = crearLecturas(async (s, b) => {
    llamadas.push(String(b.action));
    return transporte(s, b);
  }, () => new Date("2026-10-29T18:00:00Z"));
  return { ...demo, lecturas, llamadas };
}

describe("MCP de lectura sobre el proxy y Rateware simulado", () => {
  it("consulta el evento de prueba sin exponer HDships ni tokens", async () => {
    const x = await preparar();
    const r = await x.lecturas("eventos", {});
    expect(JSON.stringify(r)).toContain("RFx-FR8BID-PRUEBA-01");
    expect(JSON.stringify(r)).not.toMatch(/HDships|invitation_token|bid_link/i);
    const antes = x.llamadas.length;
    await expect(x.lecturas("evento", { event_id: [...EVENTOS_PROTEGIDOS][0] })).rejects.toThrow();
    expect(x.llamadas).toHaveLength(antes);
  });
  it("no permite herramientas de escritura ni argumentos que cambien la acción", async () => {
    const x = await preparar();
    for (const name of ["confirmar", "preparar_intentos", "award_rfx_lane_vendor"]) {
      await expect(x.lecturas(name, {})).rejects.toThrow();
    }
    await expect(x.lecturas("eventos", { action: "send_outreach_messages" })).rejects.toThrow();
    expect(x.llamadas).toEqual([]);
  });
  it("compara all-in sin sumarle el share y conserva las versiones", async () => {
    const x = await preparar();
    const r: any = await x.lecturas("ofertas_evento", { event_id: x.eventId });
    const a = r.rutas[0].ofertas.find((p: any) => p.participacion_id === x.participaciones.A);
    expect(a.vigente.tarifaAllIn).toBe(1750);
    expect(a.diferencia_objetivo).toBe(50);
    const h: any = await x.lecturas("historial_oferta", { event_id: x.eventId, participacion_id: x.participaciones.A });
    expect(h.versiones.map((v: any) => v.tarifaAllIn)).toEqual([1800, 1750]);
    expect(h.cobertura).toContain("fuente");
  });
  it("aísla al usuario de otra organización", async () => {
    const x = await preparar("ajeno");
    const r: any = await x.lecturas("eventos", {});
    expect(r.eventos).toEqual([]);
    await expect(x.lecturas("evento", { event_id: x.eventId })).rejects.toThrow();
  });
  it("no reintenta un fallo de transporte", async () => {
    let llamadas = 0;
    const leer = crearLecturas(async () => { llamadas++; throw new Error("red"); });
    await expect(leer("eventos", {})).rejects.toThrow();
    expect(llamadas).toBe(1);
  });
  it("expone las once lecturas sin mutar el simulado, incluso al repetirlas", async () => {
    const x = await preparar();
    const ruta = x.sim.lanes.find(r => r.event_id === x.eventId || r.rfx_event_id === x.eventId)!;
    const antes = structuredClone(x.sim.bitacora);
    const consultas: [string, Record<string, unknown>][] = [
      ["eventos", {}], ["evento", { event_id: x.eventId }],
      ["seguimiento_evento", { event_id: x.eventId }], ["respuestas_evento", { event_id: x.eventId }],
      ["ofertas_evento", { event_id: x.eventId }], ["historial_oferta", { event_id: x.eventId, participacion_id: x.participaciones.A }],
      ["candados_ruta", { event_id: x.eventId, ruta_id: ruta.id }], ["carriers_sugeridos", { event_id: x.eventId }],
      ["tarifas_ruta", { origen: "Monterrey", destino: "Dallas", caja: "dry_van", operacion: "D2D Export", event_ids: [x.eventId] }],
      ["carrier", { carrier_id: x.carriers.A.id }], ["historial_carrier", { carrier_id: x.carriers.A.id }]
    ];
    for (const [nombre, args] of consultas) {
      expect(await x.lecturas(nombre, args)).toEqual(await x.lecturas(nombre, args));
    }
    expect(x.sim.bitacora).toEqual(antes);
    expect(x.llamadas.every(a => a.startsWith("list_") || a === "carrier_recommendations")).toBe(true);
  });
  it("distingue fallo de respuestas de cero respuestas y conserva candados del operador", async () => {
    const x = await preparar();
    x.sim.fallas.fallarRespuestas = true;
    const r: any = await x.lecturas("seguimiento_evento", { event_id: x.eventId });
    expect(r.respuestas_consultadas).toBe(false);
    expect(r.filas.every((f: any) => f.siguiente_intento === null)).toBe(true);
    const ofertas: any = await x.lecturas("ofertas_evento", { event_id: x.eventId });
    expect(ofertas.rutas[0].ofertas[0].candados).toContainEqual({ regla: "I3", ok: false, texto: "Solo el Administrador adjudica" });
  });
  it("pagina tarifas aunque la primera página no coincida; excluye otras organizaciones y HDships", async () => {
    const x = await preparar();
    const row = { owner_email: "sales@heymarksman.com", status: "approved", trailer: "Dry Van", operation: "D2D Export", origin_city: "Monterrey", destination_city: "Dallas", currency: "USD", all_in_rate: 1600, vendor_id: x.carriers.A.id };
    x.sim.tarifas.push(...Array.from({ length: 1000 }, (_, i) => ({ ...row, id: String(i), origin_city: "Saltillo" })), { ...row, id: "correcta" }, { ...row, id: "oculta", rfx_event_id: [...EVENTOS_PROTEGIDOS][0] }, { ...row, id: "ajena", owner_email: "otra@ejemplo.test" });
    const args = { origen: "Monterrey", destino: "Dallas", caja: "dry_van", operacion: "D2D Export" };
    const a: any = await x.lecturas("tarifas_ruta", args);
    expect(a.tarifas).toEqual([]);
    expect(a.siguiente_offset).toBe(1000);
    const b: any = await x.lecturas("tarifas_ruta", { ...args, offset: a.siguiente_offset });
    expect(b.tarifas.map((r: any) => r.id)).toEqual(["correcta"]);
    expect(b.tarifas[0].all_in).toBe(1600);
    expect(b.siguiente_offset).toBe(null);
  });
  it("conserva la fecha del historial de contacto sin exponer metadata ni eventos protegidos", async () => {
    const x = await preparar();
    x.sim.historialContacto.push(
      { owner_email: "sales@heymarksman.com", id: "visible", vendor_id: x.carriers.A.id, occurred_at: "2026-10-28T12:00:00Z", channel: "email", direction: "inbound", status: "bounced", metadata: { invitation_token: "no-exponer" } },
      { owner_email: "sales@heymarksman.com", id: "protegido", vendor_id: x.carriers.A.id, status: "sent", metadata: { rfx_event_id: [...EVENTOS_PROTEGIDOS][0] } }
    );
    const r: any = await x.lecturas("historial_carrier", { carrier_id: x.carriers.A.id });
    expect(r.filas.find((f: any) => f.id === "visible").fecha).toBe("2026-10-28T12:00:00Z");
    expect(r.filas.some((f: any) => f.id === "protegido")).toBe(false);
    expect(JSON.stringify(r)).not.toContain("no-exponer");
  });
});
