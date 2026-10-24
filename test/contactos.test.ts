// Contactos sugeridos cuando un carrier no tiene contacto útil (pedido de Jose
// del 24-oct-2026): conocidos en Rateware, sin rebotes recientes en Gmail.

import { beforeEach, describe, expect, it } from "vitest";
import { MesaApi, transporteSimulado } from "../src/cliente/api";
import { dominioBuscable, separarCorreos, sugerirContactos } from "../src/dominio/contactos";
import { manejar } from "../src/servidor/proxy";
import type { RatewareSimulado } from "../src/simulado/rateware";
import { ORG, sembrarDemo } from "../src/simulado/semilla";

let sim: RatewareSimulado;
let admin: MesaApi;

const HOY = "2026-10-24";
const rebote = (vendorId: string, email: string, cuando: string) => ({ owner_email: ORG, vendor_id: vendorId, direction: "inbound", status: "bounced", channel: "email", occurred_at: `${cuando}T10:00:00Z`, metadata: { email, bounce_status: "hard_bounce", source: "gmail_bounce_sync" } });
const liga = (vendorId: string, email: string, cuando: string) => ({ owner_email: ORG, vendor_id: vendorId, direction: "outbound", status: "magic_link_sent", channel: "email", occurred_at: `${cuando}T10:00:00Z`, metadata: { recipient_email: email } });

beforeEach(async () => {
  const demo = await sembrarDemo();
  sim = demo.sim;
  sim.hoy = () => HOY;
  admin = new MesaApi(transporteSimulado(sim, () => "admin"), () => HOY);
});

describe("contactos sugeridos", () => {
  it("separa correos adicionales escritos como «a; b»", () => {
    expect(separarCorreos(["Ops@x.com; ventas@x.com", "  "])).toEqual(["ops@x.com", "ventas@x.com"]);
    expect(separarCorreos(null)).toEqual([]);
  });

  it("no busca por dominios públicos", () => {
    expect(dominioBuscable({ domain: "https://www.tregalogistics.com/contacto" })).toBe("tregalogistics.com");
    expect(dominioBuscable({ domain: null, primary_email: "huizachal@gmail.com" })).toBeNull();
    expect(dominioBuscable({ domain: "", primary_email: "jenny@transportestrega.com" })).toBe("transportestrega.com");
  });

  it("deja fuera rebotes recientes y «no contactar», y avisa de rebotes viejos", () => {
    const v = { id: "v1", vendor_name: "TREGA", primary_email: "jenny@trega.com", secondary_emails: ["ops@trega.com; malo@trega.com"], whatsapp_phone: "5218112345678", whatsapp_do_not_contact: true };
    const r = sugerirContactos("v1", [v], [rebote("v1", "jenny@trega.com", "2026-10-01"), rebote("v1", "ops@trega.com", "2025-11-01")], HOY);
    expect(r.sugeridos.map((x) => x.valor)).toEqual(["ops@trega.com", "malo@trega.com"]);
    expect(r.sugeridos[0].nota).toMatch(/hace más de 180 días/);
    expect(r.descartados).toEqual([
      { tipo: "correo", valor: "jenny@trega.com", motivo: "rebotó en Gmail el 2026-10-01" },
      { tipo: "whatsapp", valor: "5218112345678", motivo: "marcado «no contactar» por WhatsApp" }
    ]);
  });

  it("pone primero el correo que ya recibió la liga y avisa de un envío fallido", () => {
    const v = { id: "v1", vendor_name: "EG", primary_email: "ventas@eg.com", secondary_emails: ["despacho@eg.com"] };
    const h = [liga("v1", "despacho@eg.com", "2026-10-20"), { vendor_id: "v1", direction: "outbound", status: "failed", occurred_at: "2026-10-22T00:00:00Z", metadata: {} }];
    const r = sugerirContactos("v1", [v], h, HOY);
    expect(r.sugeridos[0]).toMatchObject({ valor: "despacho@eg.com", ultimoUso: "2026-10-20" });
    expect(r.avisos[0]).toMatch(/falló el 2026-10-22/);
  });

  it("la Mesa junta los contactos de otros registros con el mismo dominio", async () => {
    const sin = sim.agregarVendor(ORG, "Americanlandfreights", { domain: "americanlandfreights.com", primary_email: null });
    const otro = sim.agregarVendor(ORG, "AMERICAN LAND FREIGHTS LLC", { domain: "www.americanlandfreights.com", primary_email: "dispatch@americanlandfreights.com", contact_name: "Luis" });
    sim.agregarVendor(ORG, "Otro carrier", { domain: "otro.com", primary_email: "x@otro.com" });
    sim.historialContacto.push(rebote(otro.id, "viejo@americanlandfreights.com", "2026-10-10"), liga(otro.id, "viejo@americanlandfreights.com", "2026-09-01"));
    const r = await admin.contactosConocidos(sin.id);
    expect(r.sugeridos.map((x) => x.valor)).toEqual(["dispatch@americanlandfreights.com"]);
    expect(r.sugeridos[0].origen).toMatch(/otro registro/);
    expect(r.sugeridos[0].nombre).toBe("Luis");
    expect(r.descartados.map((x) => x.valor)).toEqual(["viejo@americanlandfreights.com"]);
  });

  it("el proxy solo deja leer contactos de carriers concretos o de su dominio", async () => {
    const op = { enviar: async () => ({ status: 200, body: { rows: [] }, headers: {} }), permitirEscrituras: false, real: true };
    const id = "0b5c2f8e-1111-4222-8333-444455556666";
    const pedir = (body: Record<string, unknown>) => manejar("rateware-api", body, "Bearer x", op).then((r) => r.status);
    expect(await pedir({ action: "list_vendors", ids: [id], lightweight: true })).toBe(200);
    expect(await pedir({ action: "list_vendors", search: "trega.com", lightweight: true, limit: 50 })).toBe(200);
    expect(await pedir({ action: "list_vendors", lightweight: true, limit: 1000 })).toBe(400);
    expect(await pedir({ action: "list_vendors", search: "trucking", lightweight: true, limit: 50 })).toBe(400);
    expect(await pedir({ action: "list_vendors", ids: [id] })).toBe(400);
    expect(await pedir({ action: "list_contact_history", vendor_id: id, limit: 300 })).toBe(200);
    expect(await pedir({ action: "list_contact_history", limit: 300 })).toBe(400);
    expect(await pedir({ action: "list_contact_history", vendor_id: id, whatsapp_view: "queue" })).toBe(400);
  });
});
