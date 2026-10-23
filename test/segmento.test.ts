// Historial del segmento (idea 7, criterio de Jose del 23-oct-2026): solo
// tarifas aprobadas con la misma familia de caja, operación D2D y cruce.

import { beforeEach, describe, expect, it } from "vitest";
import { MesaApi, transporteSimulado } from "../src/cliente/api";
import { consultaSegmento, cuentaParaSegmento, familiaCaja, segmentoDeRuta, type Segmento } from "../src/dominio/segmento";
import { manejar } from "../src/servidor/proxy";
import type { RatewareSimulado } from "../src/simulado/rateware";
import { ORG, sembrarDemo } from "../src/simulado/semilla";

let sim: RatewareSimulado;
let eventId: string;
let admin: MesaApi;

const tarifa = (vendorId: string | null, extra: Record<string, unknown> = {}) => ({
  id: `rate-${Math.random().toString(16).slice(2)}`,
  owner_email: ORG,
  status: "approved",
  vendor_id: vendorId,
  vendor_domain: "",
  trailer: "Flatbed",
  operation: "D2D Export",
  origin_city: "Monterrey",
  origin_state: "NL",
  origin_country: "MX",
  destination_city: "Dallas",
  destination_state: "TX",
  destination_country: "US",
  created_at: "2026-06-01T00:00:00Z",
  ...extra
});

beforeEach(async () => {
  const demo = await sembrarDemo();
  sim = demo.sim;
  eventId = demo.eventId;
  admin = new MesaApi(transporteSimulado(sim, () => "admin"), () => sim.hoy());
  // La ruta del demo pasa a ser la de PRIMA: SLP → Tulsa, Flatbed 53', D2D Export.
  Object.assign(sim.lanes[0], { operation: "D2D Export", trailer: "Flatbed 53'", origin_city: "San Luis Potosí", origin_state: "SL", destination_city: "Tulsa", destination_state: "OK" });
});

describe("historial del segmento", () => {
  it("clasifica la caja por familia", () => {
    expect(familiaCaja("Flatbed 53'")).toBe("flatbed");
    expect(familiaCaja("Stepdeck")).toBe("flatbed");
    expect(familiaCaja("Open Deck")).toBe("flatbed");
    expect(familiaCaja("Dry Van")).toBe("dry_van");
    expect(familiaCaja("Lowboy")).toBeNull();
  });

  it("solo cuenta D2D con cruce, sin ciudad de frontera, Intra-Mex ni otra caja", () => {
    const s: Segmento = { familia: "flatbed", operacion: "D2D Export", estadoOrigen: "SL", estadoDestino: "OK" };
    expect(cuentaParaSegmento(tarifa("v"), s)).toBe(true);
    expect(cuentaParaSegmento(tarifa("v", { destination_city: "Laredo" }), s)).toBe(false);
    expect(cuentaParaSegmento(tarifa("v", { operation: "MX Northbound" }), s)).toBe(false);
    expect(cuentaParaSegmento(tarifa("v", { destination_country: "MX" }), s)).toBe(false);
    expect(cuentaParaSegmento(tarifa("v", { trailer: "Dry Van" }), s)).toBe(false);
  });

  it("agrupa por carrier, pone primero a quien ya llega al estado destino y marca quién ya está en el evento", async () => {
    const d0 = await admin.detalle(eventId);
    const yaInvitado = d0.rutas[0].participaciones[0].carrierId;
    const nuevo = sim.agregarVendor(ORG, "Plataformas del Norte", { status: "inactive" });
    sim.tarifas.push(
      tarifa(nuevo.id, { destination_city: "Oklahoma City", destination_state: "OK" }),
      tarifa(nuevo.id),
      tarifa(yaInvitado),
      tarifa(yaInvitado),
      tarifa(yaInvitado),
      tarifa(null, { vendor_domain: "sincarrier.mx", trailer: "Stepdeck" }),
      tarifa(yaInvitado, { operation: "Intra-Mex", destination_country: "MX" }),
      tarifa(nuevo.id, { status: "pending_review" })
    );
    const d = await admin.detalle(eventId);
    expect(segmentoDeRuta(d.rutas[0])).toMatchObject({ familia: "flatbed", operacion: "D2D Export", estadoDestino: "OK" });

    const [g] = await admin.historialSegmento(d);
    expect(g.rutas).toEqual([1]);
    expect(g.sugerencias.map((x) => [x.nombre, x.tarifas, x.mismoDestino])).toEqual([
      ["Plataformas del Norte", 2, 1],
      [d0.rutas[0].participaciones[0].carrier, 3, 0],
      ["sincarrier.mx", 1, 0]
    ]);
    expect(g.sugerencias[0]).toMatchObject({ inactivo: true, yaEnEvento: false });
    expect(g.sugerencias[1].yaEnEvento).toBe(true);
    expect(g.sugerencias[2].vendorId).toBeNull();
    expect(g.descartados).toEqual([]);
    // Lectura: el evento no cambia.
    expect((await admin.detalle(eventId)).rutas[0].participaciones).toHaveLength(d0.rutas[0].participaciones.length);
  });

  it("las notas de Jose mandan sobre la tarifa: descarta «pura caja» y avisa «solo 48'»", async () => {
    const caja = sim.agregarVendor(ORG, "PAN AMERICAN EXPRESS INC");
    const pgt = sim.agregarVendor(ORG, "PGT TRUCKING INC.");
    sim.tarifas.push(tarifa(caja.id, { destination_state: "OK" }), tarifa(pgt.id));
    const [g] = await admin.historialSegmento(await admin.detalle(eventId));
    expect(g.sugerencias.map((x) => x.nombre)).toEqual(["PGT TRUCKING INC."]);
    expect(g.sugerencias[0].nota).toEqual({ tipo: "aviso", texto: "Solo plataformas de 48', no de 53'." });
    expect(g.descartados).toMatchObject([{ nombre: "PAN AMERICAN EXPRESS INC", nota: { tipo: "descartado", texto: "Pura caja." } }]);
  });

  it("sin operación D2D o sin cruce no sugiere nada", async () => {
    Object.assign(sim.lanes[0], { operation: "Intra-Mex" });
    expect(await admin.historialSegmento(await admin.detalle(eventId))).toEqual([]);
  });

  it("el proxy solo deja pasar la consulta del segmento, también contra Rateware real", async () => {
    const llamadas: any[] = [];
    const op = {
      enviar: async (_s: any, b: any) => {
        llamadas.push(b);
        return { status: 200, body: { rows: [] }, headers: {} };
      },
      permitirEscrituras: false,
      real: true
    };
    const s: Segmento = { familia: "flatbed", operacion: "D2D Export", estadoOrigen: "SL", estadoDestino: "OK" };
    const buena = consultaSegmento(s, 1);
    const rechazos = [
      { ...buena, search: "gume" },
      { ...buena, column_filters: { ...buena.column_filters, vendor_domain: ["x.com"] } },
      { ...buena, column_filters: { trailer: ["Lowboy"], operation: ["D2D Export"] } },
      { ...buena, column_filters: { trailer: ["Flatbed"], operation: ["Intra-Mex"] } },
      { ...buena, limit: 5000 },
      { action: "list_rateware" }
    ];
    for (const b of rechazos) expect((await manejar("rateware-api", b, "Bearer x", op)).body.code).toBe("SOLO_HISTORIAL_SEGMENTO");
    expect(llamadas).toHaveLength(0);
    expect((await manejar("rateware-api", buena, "Bearer x", op)).status).toBe(200);
    expect(llamadas).toEqual([buena]);
  });
});
