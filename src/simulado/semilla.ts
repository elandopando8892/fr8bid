// Evento simulado de D5: «PRUEBA CONTROLADA», shipper de prueba, una ruta
// Monterrey → Dallas Dry Van, tres carriers de prueba cuyo buzón es
// sales@heymarksman.com. Ofertas sin valor comercial.

import { EVENTOS_PROTEGIDOS } from "../dominio/protegidos";
import { RatewareSimulado } from "./rateware";

export const ORG = "sales@heymarksman.com";
const RUBRICAS = ["logistics_model", "operation_criteria", "business_rules", "service_specifications", "carrier_requirements", "other_notes"];
export const OTRA_ORG = "otra@ejemplo.test";

export function crearSimulado() {
  const sim = new RatewareSimulado();
  sim.agregarUsuario({ clave: "admin", email: "sales@heymarksman.com", ownerEmail: ORG, roles: ["admin"] });
  sim.agregarUsuario({ clave: "operador", email: "operador@heymarksman.com", ownerEmail: ORG, roles: ["operator"] });
  sim.agregarUsuario({ clave: "consulta", email: "consulta@heymarksman.com", ownerEmail: ORG, roles: ["viewer"] });
  sim.agregarUsuario({ clave: "ajeno", email: "admin@ejemplo.test", ownerEmail: OTRA_ORG, roles: ["admin"] });
  const carriers = {
    A: sim.agregarVendor(ORG, "Carrier Prueba A"),
    B: sim.agregarVendor(ORG, "Carrier Prueba B"),
    C: sim.agregarVendor(ORG, "Carrier Prueba C")
  };
  // HDships existe en las mismas tablas; Fr8Bid no debe verlo nunca (I12).
  const [hdships] = EVENTOS_PROTEGIDOS;
  sim.events.push({ id: hdships, owner_email: ORG, rfx_id: "RFX-HDSHIPS", name: "HDships", customer: "HDships", status: "open", due_date: null });
  return { sim, carriers };
}

// Lleva el evento simulado hasta «ofertas recibidas» usando solo acciones del
// contrato, como lo haría el equipo. Sirve para la vista local.
export async function sembrarDemo() {
  const { sim, carriers } = crearSimulado();
  const como = (clave: string) => (body: Record<string, unknown>) => sim.llamar("rateware-api", body, `Bearer sim:${clave}`).then((r) => r.body);
  const op = como("operador");
  const admin = como("admin");
  const { row: event } = await op({ action: "create_rfx_event", name: "PRUEBA CONTROLADA · Monterrey → Dallas", customer: "Shipper de Prueba", due_date: "2026-10-31", rfx_id: "RFX-0001-PRBA" });
  const { rows: lanes } = await op({
    action: "import_rfx_lanes",
    event_id: event.id,
    rows: [{ origin_city: "Monterrey", origin_state: "NL", origin_country: "MX", destination_city: "Dallas", destination_state: "TX", destination_country: "US", equipment: "Dry Van", weekly_volume: 4, target_rate: 1700, currency: "USD" }]
  });
  const { rows } = await op({ action: "shortlist_rfx_lane_vendors", lane_id: lanes[0].id, vendor_ids: [carriers.A.id, carriers.B.id, carriers.C.id] });
  await op({ action: "update_rfx_event", event_id: event.id, patch: { status: "open" } });
  const { rows: messages } = await op({ action: "generate_outreach_drafts", event_id: event.id });
  await admin({
    action: "send_outreach_messages",
    ids: messages.map((m: any) => m.id),
    expected_versions: messages.map((m: any) => ({ id: m.id, updated_at: m.updated_at })),
    confirmed: true,
    confirmation_action: "send_outreach_messages"
  });

  const liga = (id: string) => (body: Record<string, unknown>) => sim.llamar("rfx-bid-api", { ...body, token: sim.tokenDe(id) }, null);
  const [a, b, c] = rows.map((r: any) => r.id);
  await liga(a)({ action: "get_invitation" });
  await liga(a)({ action: "submit_bid", bid_rate: 1800, currency: "USD", commercial_model: "fee_plus", weekly_capacity: 5, transit_days: 2 });
  await liga(a)({ action: "submit_bid", bid_rate: 1750, currency: "USD", commercial_model: "fee_plus", weekly_capacity: 5, transit_days: 2, notes: "ajuste por volumen" });
  await liga(a)({ action: "save_segment_confirmations", confirmations: RUBRICAS.slice(0, 5).map((k) => ({ segment_key: "general", rubric_key: k, answer: "agree" })) });
  await liga(b)({ action: "get_invitation" });
  await liga(b)({ action: "submit_bid", bid_rate: 1690, currency: "USD", commercial_model: "fee_plus", weekly_capacity: 4, transit_days: 2, valid_through: "2026-11-30" });
  await liga(b)({ action: "save_segment_confirmations", confirmations: RUBRICAS.map((k) => ({ segment_key: "general", rubric_key: k, answer: "agree" })) });
  await liga(c)({ action: "get_invitation" });
  await liga(c)({ action: "submit_bid", bid_rate: 1820, currency: "USD", commercial_model: "cost_plus", weekly_capacity: 3, transit_days: 3, valid_through: "2026-11-15" });
  await liga(c)({ action: "save_segment_confirmations", confirmations: [{ segment_key: "general", rubric_key: "carrier_requirements", answer: "disagree" }] });
  return { sim, carriers, eventId: event.id as string, participaciones: { A: a, B: b, C: c } };
}
