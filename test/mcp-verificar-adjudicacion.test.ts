import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MesaApi, transporteSimulado } from "../src/cliente/api";
import { operacionAdjudicacion } from "../src/dominio/operacion";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";
import { versionVigente } from "../src/dominio/recorrido";
import { crearLecturas, herramientas } from "../src/mcp/lecturas";
import { herramientasEscritura } from "../src/mcp/escrituras";
import { LECTURAS } from "../src/servidor/proxy";
import { crearSimulado, sembrarDemo } from "../src/simulado/semilla";

async function preparar() {
  const base = crearSimulado();
  let t = Date.parse("2026-10-21T15:00:00.000Z");
  base.sim.ahora = () => new Date((t += 1000)).toISOString();
  base.sim.hoy = () => "2026-10-21";
  const demo = await sembrarDemo(base);
  const admin = new MesaApi(transporteSimulado(demo.sim, () => "admin"), () => demo.sim.hoy());
  const leer = crearLecturas(transporteSimulado(demo.sim, () => "operador"), () => new Date("2026-10-22T15:00:00Z"));
  return { ...demo, admin, leer };
}

async function adjudicarB(x: Awaited<ReturnType<typeof preparar>>) {
  await x.admin.cerrarAOfertas(x.eventId);
  const d = await x.admin.detalle(x.eventId);
  const p = d.rutas.flatMap(r => r.participaciones).find(p => p.id === x.participaciones.B)!;
  await x.admin.adjudicar({ eventId: x.eventId, participacionId: p.id, rol: "primario", motivo: "mejor all-in", operationId: operacionAdjudicacion(x.eventId, p.id, "primario", versionVigente(p)!.huella), confirmaSinVigencia: false });
  return x.admin.detalle(x.eventId);
}

const escrituras = (x: { sim: { llamadas: { servicio: "rateware-api" | "rfx-bid-api"; action: string }[] } }, desde: number) =>
  x.sim.llamadas.slice(desde).filter(l => !LECTURAS[l.servicio].has(l.action));

describe("verificar_adjudicacion (#12)", () => {
  it("adjudicado y entregado: huella coincide, cierre en Rateware, avisos en borrador señalados", async () => {
    const x = await preparar();
    const d = await adjudicarB(x);
    const prep = x.admin.prepararEntrega(d);
    expect((await x.admin.confirmarEntrega(x.eventId, prep.operationId!)).entrega.estado).toBe("confirmada");
    await x.admin.generarAvisosAdjudicacion(x.eventId);
    const desde = x.sim.llamadas.length;
    const r: any = await x.leer("verificar_adjudicacion", { event_id: x.eventId });
    expect(escrituras(x, desde)).toEqual([]);
    expect(r.solo_lectura).toBe(true);
    expect(r.entrega_confirmada).toBe(true);
    const ruta = r.rutas[0];
    const prim = ruta.adjudicados.find((a: any) => a.rol === "primario");
    expect(prim).toMatchObject({ participacion_id: x.participaciones.B, huella: "coincide" });
    expect(prim.cierre_rateware_en).toBeTruthy();
    expect(prim.aviso).toMatchObject({ resultado: "adjudicado", estado: "borrador" });
    expect(ruta.problemas.join(" ")).toMatch(/Primario .*: aviso borrador/);
    expect(ruta.no_adjudicados.length).toBeGreaterThan(0);
    expect(r.no_verificable.join(" ")).toMatch(/en revisión/);
    expect(JSON.stringify(r)).not.toMatch(/invitation_token|bid_link/i);
  });

  it("adjudicado sin entregar: señala el cierre faltante y el aviso no generado", async () => {
    const x = await preparar();
    await adjudicarB(x);
    const desde = x.sim.llamadas.length;
    const r: any = await x.leer("verificar_adjudicacion", { event_id: x.eventId });
    expect(escrituras(x, desde)).toEqual([]);
    expect(r.entrega_confirmada).toBe(false);
    const prim = r.rutas[0].adjudicados[0];
    expect(prim.cierre_rateware_en).toBeNull();
    expect(r.rutas[0].problemas.join(" ")).toMatch(/sin cierre en Rateware/);
    expect(prim.aviso).toBeNull();
    expect(r.rutas[0].problemas.join(" ")).toMatch(/aviso no generado/);
    expect(r.rutas_con_problemas).toBe(1);
  });

  it("una versión posterior a la adjudicada: huella no coincide", async () => {
    const x = await preparar();
    await adjudicarB(x);
    await x.sim.llamar("rateware-api", { action: "update_rfx_bid", id: x.participaciones.B, patch: { bid_rate: 1720, currency: "USD", commercial_model: "fee_plus", weekly_capacity: 5, transit_days: 2 } }, "Bearer sim:operador");
    const r: any = await x.leer("verificar_adjudicacion", { event_id: x.eventId });
    const prim = r.rutas[0].adjudicados[0];
    expect(prim.huella).toBe("no_coincide");
    expect(prim.version_vigente).toBeGreaterThan(prim.version_adjudicada);
    expect(r.rutas[0].problemas.join(" ")).toMatch(/versión posterior/);
  });

  it("sin adjudicaciones: rutas sin primario, nada inventado", async () => {
    const x = await preparar();
    const r: any = await x.leer("verificar_adjudicacion", { event_id: x.eventId });
    expect(r.rutas[0].adjudicados).toEqual([]);
    expect(r.rutas[0].problemas).toContain("Ruta sin primario ni motivo de desierta.");
    expect(r.entrega_confirmada).toBe(false);
  });

  it("rechaza HDships/protegidos antes de consultar y es solo lectura", async () => {
    const x = await preparar();
    const desde = x.sim.llamadas.length;
    await expect(x.leer("verificar_adjudicacion", { event_id: [...EVENTOS_PROTEGIDOS][0] })).rejects.toThrow();
    expect(x.sim.llamadas.length).toBe(desde);
    expect(Object.hasOwn(herramientasEscritura, "verificar_adjudicacion")).toBe(false);
    expect(herramientas.verificar_adjudicacion.descripcion).toMatch(/No adjudica/);
  });

  it("skill fr8bid-verificar-adjudicacion: solo lecturas existentes, dice lo que no hace y da la liga", () => {
    const skill = readFileSync(".claude/skills/fr8bid-verificar-adjudicacion/SKILL.md", "utf8");
    expect(skill).toMatch(/^---\r?\nname: fr8bid-verificar-adjudicacion\r?\n/);
    const pasos = skill.split("Lo que este skill no hace")[0];
    const usadas = [...pasos.matchAll(/`([a-z_]+)[(`]/g)].map(m => m[1]).filter(n => Object.hasOwn(herramientas, n) || Object.hasOwn(herramientasEscritura, n) || n.startsWith("preparar_"));
    expect(usadas).toContain("verificar_adjudicacion");
    for (const n of usadas) expect(Object.hasOwn(herramientas, n), n).toBe(true);
    expect(skill).toContain("Lo que este skill no hace");
    expect(skill).toContain("https://fr8bid.heymarksman.com/eventos/");
  });
});
