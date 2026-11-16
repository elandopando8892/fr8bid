import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crearSimulado, sembrarDemo } from "../src/simulado/semilla";
import { transporteSimulado } from "../src/cliente/api";
import { crearLecturas, herramientas } from "../src/mcp/lecturas";
import { herramientasEscritura } from "../src/mcp/escrituras";
import { LECTURAS } from "../src/servidor/proxy";

const skill = readFileSync(".claude/skills/fr8bid-perfil-carrier/SKILL.md", "utf8");

describe("skill fr8bid-perfil-carrier (#15)", () => {
  it("solo usa herramientas de lectura que existen y dice lo que no hace", () => {
    expect(skill).toMatch(/^---\r?\nname: fr8bid-perfil-carrier\r?\n/);
    const nombres = [...skill.matchAll(/`([a-z_]+)[(`]/g)].map(m => m[1]);
    const herramientasUsadas = nombres.filter(n => Object.hasOwn(herramientas, n) || Object.hasOwn(herramientasEscritura, n) || n.startsWith("preparar_"));
    expect(herramientasUsadas).toEqual(expect.arrayContaining(["carrier", "historial_carrier"]));
    for (const n of herramientasUsadas) expect(Object.hasOwn(herramientas, n), n).toBe(true);
    expect(skill).toContain("Lo que este skill no hace");
    expect(skill).toContain("https://fr8bid.heymarksman.com/eventos/");
    expect(skill).not.toMatch(/`confirmar`|`preparar_/);
  });

  it("perfil e historial del carrier sin escribir en Rateware", async () => {
    const base = crearSimulado();
    base.sim.hoy = () => "2026-10-29";
    base.sim.ahora = () => "2026-10-29T18:00:00Z";
    const demo = await sembrarDemo(base);
    const desde = demo.sim.llamadas.length;
    const leer = crearLecturas(transporteSimulado(demo.sim, () => "operador"), () => new Date("2026-10-29T18:00:00Z"));
    const seg: any = await leer("seguimiento_evento", { event_id: demo.eventId });
    const carrierId = seg.filas[0].carrier_id;
    const perfil: any = await leer("carrier", { carrier_id: carrierId });
    const historial: any = await leer("historial_carrier", { carrier_id: carrierId });
    expect(perfil.solo_lectura).toBe(true);
    expect(historial.solo_lectura).toBe(true);
    expect(demo.sim.llamadas.slice(desde).every(l => LECTURAS[l.servicio].has(l.action))).toBe(true);
    expect(demo.sim.llamadas.length).toBeGreaterThan(desde);
  });
});
