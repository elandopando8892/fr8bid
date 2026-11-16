import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { transporteSimulado } from "../src/cliente/api";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";
import { crearLecturas, herramientas } from "../src/mcp/lecturas";
import { herramientasEscritura } from "../src/mcp/escrituras";
import { LECTURAS } from "../src/servidor/proxy";
import { crearSimulado, sembrarDemo } from "../src/simulado/semilla";

const T0 = "2026-10-29T18:00:00Z";
const horas = (h: number) => new Date(Date.parse(T0) + h * 3_600_000);

// Carrier C sin oferta y con tres correos aceptados por Gmail (original + 2 intentos).
async function preparar({ whatsapp = "8112345678" as string | null, noContactar = false, ahora = horas(33) } = {}) {
  const base = crearSimulado();
  base.sim.hoy = () => "2026-10-29";
  base.sim.ahora = () => T0;
  const demo = await sembrarDemo(base);
  const lv = demo.sim.laneVendors.find(x => x.id === demo.participaciones.C)!;
  Object.assign(lv, { bid_rate: null, invitation_status: "invited", responded_at: null, viewed_at: null });
  demo.sim.revisiones.set(lv.id, []);
  const vendor = demo.sim.vendors.find(v => v.id === lv.vendor_id)!;
  Object.assign(vendor, { whatsapp_phone: whatsapp, whatsapp_do_not_contact: noContactar });
  const original = demo.sim.mensajes.find(m => m.vendor_id === lv.vendor_id)!;
  for (const [i, h] of [[1, 8], [2, 20]]) demo.sim.mensajes.push({ ...structuredClone(original), id: `msg-intento-${i}`, sent_at: horas(h).toISOString(), metadata: { ...original.metadata, source: "bid_room_carrier_ask" } });
  const desde = demo.sim.llamadas.length;
  const leer = crearLecturas(transporteSimulado(demo.sim, () => "operador"), () => ahora);
  const escrituras = () => demo.sim.llamadas.slice(desde).filter(l => !LECTURAS[l.servicio].has(l.action));
  return { ...demo, leer, escrituras, carrierC: lv.vendor_id };
}

describe("whatsapp_pendientes (#4)", () => {
  it("lista a quien pasó el 3er intento sin responder, con número revisado, texto y liga wa.me; no escribe", async () => {
    const x = await preparar();
    const r: any = await x.leer("whatsapp_pendientes", { event_id: x.eventId });
    expect(x.escrituras()).toEqual([]);
    expect(r.solo_lectura).toBe(true);
    expect(r.filas).toHaveLength(1);
    const f = r.filas[0];
    expect(f).toMatchObject({ carrier_id: x.carrierC, intentos_correo: 3, telefono: "+528112345678", pais: "MX", sin_liga_porque: null });
    expect(f.liga_whatsapp).toBe(`https://wa.me/528112345678?text=${encodeURIComponent(f.texto)}`);
    expect(f.texto).toMatch(/Le escribe Marksman/);
    expect(f.rutas_pendientes.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(/invitation_token|bid_link|token=/i);
  });

  it("antes de las 12 h del 3er intento no aparece; tampoco quienes ya ofertaron", async () => {
    const x = await preparar({ ahora: horas(31) });
    const r: any = await x.leer("whatsapp_pendientes", { event_id: x.eventId });
    expect(r.filas).toEqual([]);
    expect(r.total_recibido).toBe(0);
  });

  it("sin número o con «no contactar»: aparece sin liga y con el motivo", async () => {
    const x = await preparar({ whatsapp: null });
    const r: any = await x.leer("whatsapp_pendientes", { event_id: x.eventId });
    expect(r.filas[0]).toMatchObject({ telefono: null, liga_whatsapp: null, sin_liga_porque: "sin número de WhatsApp en Rateware" });
    const y = await preparar({ noContactar: true });
    const s: any = await y.leer("whatsapp_pendientes", { event_id: y.eventId });
    expect(s.filas[0].liga_whatsapp).toBeNull();
    expect(s.filas[0].sin_liga_porque).toMatch(/no contactar/);
  });

  it("rechaza HDships/protegidos antes de consultar y no es escritura", async () => {
    const x = await preparar();
    const antes = x.sim.llamadas.length;
    await expect(x.leer("whatsapp_pendientes", { event_id: [...EVENTOS_PROTEGIDOS][0] })).rejects.toThrow();
    expect(x.sim.llamadas.length).toBe(antes);
    expect(Object.hasOwn(herramientasEscritura, "whatsapp_pendientes")).toBe(false);
    expect(herramientas.whatsapp_pendientes.descripcion).toMatch(/No envía/);
  });

  it("skill fr8bid-whatsapp-pendientes: solo lecturas existentes, dice lo que no hace y da la liga", () => {
    const skill = readFileSync(".claude/skills/fr8bid-whatsapp-pendientes/SKILL.md", "utf8");
    expect(skill).toMatch(/^---\r?\nname: fr8bid-whatsapp-pendientes\r?\n/);
    const pasos = skill.split("Lo que este skill no hace")[0];
    const usadas = [...pasos.matchAll(/`([a-z_]+)[(`]/g)].map(m => m[1]).filter(n => Object.hasOwn(herramientas, n) || Object.hasOwn(herramientasEscritura, n) || n.startsWith("preparar_"));
    expect(usadas).toContain("whatsapp_pendientes");
    for (const n of usadas) expect(Object.hasOwn(herramientas, n), n).toBe(true);
    expect(skill).toContain("Lo que este skill no hace");
    expect(skill).toContain("https://fr8bid.heymarksman.com/eventos/");
  });
});
