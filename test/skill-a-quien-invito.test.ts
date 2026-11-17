import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crearSimulado, sembrarDemo } from "../src/simulado/semilla";
import { transporteSimulado } from "../src/cliente/api";
import { crearLecturas, herramientas } from "../src/mcp/lecturas";
import { herramientasEscritura } from "../src/mcp/escrituras";
import { LECTURAS } from "../src/servidor/proxy";

const skill = readFileSync(".claude/skills/fr8bid-a-quien-invito/SKILL.md", "utf8");

describe("skill fr8bid-a-quien-invito (#8)", () => {
  it("las consultas solo usan lecturas existentes; marcar e invitar quedan como siguiente paso con «sí»", () => {
    expect(skill).toMatch(/^---\r?\nname: fr8bid-a-quien-invito\r?\n/);
    const consultas = skill.split(/\r?\n6\. /)[0];
    const usadas = [...consultas.matchAll(/`([a-z_]+)[(`]/g)].map(m => m[1])
      .filter(n => Object.hasOwn(herramientas, n) || Object.hasOwn(herramientasEscritura, n) || n.startsWith("preparar_"));
    expect(usadas).toContain("carriers_sugeridos");
    for (const n of usadas) expect(Object.hasOwn(herramientas, n), n).toBe(true);
    expect(skill).toMatch(/sin ejecutarlo/);
    expect(skill).toContain("Lo que este skill no hace");
    expect(skill).toContain("https://fr8bid.heymarksman.com/eventos/");
  });

  it("Carrier fit del evento sin escribir en Rateware", async () => {
    const base = crearSimulado();
    base.sim.hoy = () => "2026-10-29";
    base.sim.ahora = () => "2026-10-29T18:00:00Z";
    const demo = await sembrarDemo(base);
    const desde = demo.sim.llamadas.length;
    const leer = crearLecturas(transporteSimulado(demo.sim, () => "operador"), () => new Date("2026-10-29T18:00:00Z"));
    const ev: any = await leer("evento", { event_id: demo.eventId });
    const fit: any = await leer("carriers_sugeridos", { event_id: demo.eventId });
    expect(ev.solo_lectura && fit.solo_lectura).toBe(true);
    expect(Array.isArray(fit.sugerencias.sugerencias)).toBe(true);
    expect(demo.sim.llamadas.length).toBeGreaterThan(desde);
    expect(demo.sim.llamadas.slice(desde).filter(l => !LECTURAS[l.servicio].has(l.action))).toEqual([]);
  });
});
