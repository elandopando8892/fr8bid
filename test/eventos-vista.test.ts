import { describe, expect, it } from "vitest";
import type { ResumenEvento } from "../src/dominio/tipos";
import { grupoDe, nombreEvento, porUrgencia, resumenRutas } from "../src/ui/eventosVista";

const ev = (x: Partial<ResumenEvento>): ResumenEvento => ({ id: "e", folio: "RFx-1", nombre: "Evento", shipper: "Owens Illinois", estado: "abierto", plazo: "2026-11-10", prueba: false, rutas: [], ofertas: 0, participaciones: 0, ...x });

describe("presentación de eventos en Hoy y Eventos", () => {
  it("resume varias rutas sin repetirlas", () => {
    expect(resumenRutas(["Monterrey, NL → Dallas, TX · Dry Van"])).toBe("Monterrey, NL → Dallas, TX");
    expect(resumenRutas(["Monterrey, NL → Albany, GA", "Tultitlán, MX → Houston, TX", "Tultitlán, MX → Trenton, OH", "Tultitlán, MX → Windsor, CO"])).toBe("Monterrey, Tultitlán → Albany, Houston +2");
  });
  it("nombra los spots que Rateware dejó sin ruta", () => {
    expect(nombreEvento(ev({ nombre: "Spot — → — · 2026-10-28", shipper: "David Luna" }))).toBe("David Luna · spot sin ruta");
    expect(nombreEvento(ev({ nombre: "Tradeco · Q-1011" }))).toBe("Tradeco · Q-1011");
  });
  it("separa pruebas y borradores vencidos de lo que te toca", () => {
    const hoy = "2026-11-04";
    expect(grupoDe(ev({ estado: "borrador", plazo: "2026-10-01" }), hoy, true)).toBe("borradores_viejos");
    expect(grupoDe(ev({ estado: "borrador", plazo: "2026-11-10" }), hoy, true)).toBe("te_toca");
    expect(grupoDe(ev({ estado: "cerrado", prueba: true }), hoy, true)).toBe("pruebas");
    expect(grupoDe(ev({ estado: "abierto", ofertas: 1, participaciones: 4 }), hoy, true)).toBe("carriers");
    expect(grupoDe(ev({ estado: "adjudicado" }), hoy, true)).toBe("entregados");
    expect(grupoDe(ev({ estado: "cerrado" }), hoy, false)).toBeNull();
  });
  it("lo urgente primero: adjudicar antes que publicar", () => {
    const xs = [ev({ id: "b", estado: "borrador" }), ev({ id: "c", estado: "cerrado", plazo: "2026-12-01" })].sort(porUrgencia);
    expect(xs.map((x) => x.id)).toEqual(["c", "b"]);
  });
});
