// Propuesta al shipper de punta a punta contra Rateware simulado detrás del mismo proxy:
// publicar con lo revisado, rechazo si la adjudicación cambia entre la revisión y la
// escritura, y renovar con aceptación parcial sin perder lo aceptado.
import { beforeEach, describe, expect, it } from "vitest";
import { MesaApi, transporteSimulado } from "../src/cliente/api";
import { operacionAdjudicacion } from "../src/dominio/operacion";
import { huellaPropuesta, propuestaDelEvento } from "../src/dominio/propuesta";
import { versionVigente } from "../src/dominio/recorrido";
import type { Detalle, Participacion } from "../src/dominio/tipos";
import { manejar } from "../src/servidor/proxy";
import type { RatewareSimulado } from "../src/simulado/rateware";
import { crearSimulado } from "../src/simulado/semilla";

let sim: RatewareSimulado;
let admin: MesaApi;
let eventId: string;
let A: string;

const part = (d: Detalle, id: string) => d.rutas.flatMap((r) => r.participaciones).find((p) => p.id === id) as Participacion;

beforeEach(async () => {
  const base = crearSimulado();
  sim = base.sim;
  let t = Date.parse("2026-10-21T15:00:00.000Z");
  sim.ahora = () => new Date((t += 1000)).toISOString();
  sim.hoy = () => "2026-10-21";
  admin = new MesaApi(transporteSimulado(sim, () => "admin"), () => sim.hoy());
  const operador = new MesaApi(transporteSimulado(sim, () => "operador"), () => sim.hoy());
  const { row: event } = await operador.crearEvento({ name: "PRUEBA CONTROLADA · propuesta", customer: "Shipper de Prueba", due_date: "2026-10-31" });
  eventId = event.id;
  const { rows: lanes } = await operador.importarRutas(eventId, [{ origin_city: "Monterrey", destination_city: "Dallas", equipment: "Dry Van", weekly_volume: 3, currency: "USD" }]);
  const { rows } = await operador.preseleccionar(lanes[0].id, [base.carriers.A.id]);
  A = rows[0].id;
  await operador.fijarModelosAceptados(eventId, ["cost_plus"]);
  await operador.publicar(eventId);
  await operador.marcarInvitadas(eventId, [A]);
  await admin.enviarOferta(sim.tokenDe(A), { bid_rate: 1600, currency: "USD", weekly_capacity: 4, transit_days: 2, valid_through: "2026-11-30" });
  // Cerrado a ofertas (pasó el plazo): ya se puede adjudicar.
  sim.hoy = () => "2026-11-01";
  const d = await admin.detalle(eventId);
  await admin.adjudicar({ eventId, participacionId: A, rol: "primario", motivo: "mejor all-in", operationId: operacionAdjudicacion(eventId, A, "primario", versionVigente(part(d, A))!.huella), confirmaSinVigencia: false });
});

describe("propuesta al shipper contra el simulado", () => {
  it("publica lo revisado; Rateware guarda ruta y venta, sin carrier ni costo", async () => {
    const d = await admin.detalle(eventId);
    const p = propuestaDelEvento(d);
    expect(p.faltan).toEqual([]);
    const r = await admin.publicarPropuesta(eventId, "2026-11-20", huellaPropuesta(p));
    expect(r.conSolicitud).toBe(true);
    expect(r.propuesta?.lineas).toEqual([expect.objectContaining({ venta: p.lineas[0].venta, equipo: "Dry Van", volumenSemanal: 3 })]);
    expect(JSON.stringify(sim.propuestas)).not.toMatch(/1600|Carrier|vendor|expected/);
  });

  for (const [que, cambiar] of [
    ["la oferta adjudicada", () => { sim.laneVendors.find((x) => x.id === A)!.bid_rate = 1700; }],
    ["la caja de la ruta", () => { sim.lanes.find((l) => l.rfx_event_id === eventId)!.trailer = "48"; }],
    ["el estado de destino", () => { sim.lanes.find((l) => l.rfx_event_id === eventId)!.destination_state = "CA"; }],
    ["el servicio de la ruta", () => { sim.lanes.find((l) => l.rfx_event_id === eventId)!.service = "D2D"; }]
  ] as const) {
    it(`si cambia ${que} entre la lectura del servidor y la escritura, Rateware rechaza (STALE)`, async () => {
      const p = propuestaDelEvento(await admin.detalle(eventId));
      // El cambio llega justo después de la lectura fresca del proxy y antes de publicar.
      const r = await manejar(
        "rateware-api",
        { action: "publish_rfx_shipper_proposal", event_id: eventId, valid_through: "2026-11-20", proposal_fingerprint: huellaPropuesta(p), confirmed: true, confirmation_action: "publish_rfx_shipper_proposal" },
        "Bearer sim:admin",
        {
          permitirEscrituras: true,
          hoy: () => sim.hoy(),
          enviar: (s, b, auth) => {
            if (b.action === "publish_rfx_shipper_proposal") cambiar();
            return sim.llamar(s, b, auth);
          }
        }
      );
      expect(r.status).toBe(409);
      expect(r.body?.code).toBe("RFX_PROPOSAL_STALE");
      expect(sim.propuestas).toHaveLength(0);
    });
  }

  it("con aceptación parcial (2 rutas, el shipper acepta 1 por su contrato) se renueva la vigencia: la aceptada sigue aceptada y la otra pendiente", async () => {
    // Segunda ruta adjudicada al mismo carrier.
    const l1 = sim.lanes.find((l) => l.rfx_event_id === eventId)!;
    const l2 = { ...l1, id: "22222222-2222-4222-8222-2222222222a2", lane_number: 2, origin: "Saltillo", origin_city: "Saltillo" };
    sim.lanes.push(l2);
    const lv1 = sim.laneVendors.find((x) => x.id === A)!;
    sim.laneVendors.push({ ...lv1, id: "33333333-3333-4333-8333-3333333333a2", rfx_lane_id: l2.id });

    const p = propuestaDelEvento(await admin.detalle(eventId));
    expect(p.faltan).toEqual([]);
    expect(p.lineas).toHaveLength(2);
    const v1 = await admin.publicarPropuesta(eventId, "2026-11-02", huellaPropuesta(p));
    // El shipper acepta solo la ruta 1, por el contrato de aceptación (idempotente).
    sim.aceptarPropuesta(v1.propuesta!.id, [l1.id], "Ana");
    sim.aceptarPropuesta(v1.propuesta!.id, [l1.id], "Ana");
    expect(sim.aceptaciones).toHaveLength(1);

    // Vence; la ruta pendiente ya no se puede aceptar.
    sim.hoy = () => "2026-11-05";
    expect(() => sim.aceptarPropuesta(v1.propuesta!.id, [l2.id])).toThrow(/validity/);

    const v2 = await admin.publicarPropuesta(eventId, "2026-12-01", huellaPropuesta(p));
    expect(v2.propuesta?.version).toBe(2);
    expect(v2.propuesta?.aceptadas.map((a) => [a.rutaId, a.por])).toEqual([[l1.id, "Ana"]]);
    // La versión vieja ya no se acepta; la nueva sí, y la ruta 2 queda aceptada también.
    expect(() => sim.aceptarPropuesta(v1.propuesta!.id, [l2.id])).toThrow(/replaced/);
    const fin = sim.aceptarPropuesta(v2.propuesta!.id, [l2.id], "Ana")!;
    expect((fin.accepted as any[]).map((a) => a.rfx_lane_id).sort()).toEqual([l1.id, l2.id].sort());
  });
});
