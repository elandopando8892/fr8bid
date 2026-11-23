import { describe, expect, it } from "vitest";
import type { ResumenEvento } from "../src/dominio/tipos";
import { folioCorto, grupoDe, nombreEvento, pareceDePrueba, porUrgencia, resumenRutas, shipperAparte } from "../src/ui/eventosVista";
import { dinero } from "../src/ui/comun";

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

describe("un mismo nombre y folio legible (recorrido 22-nov)", () => {
  it("acorta el folio con UUID de los eventos creados desde el chat", () => {
    expect(folioCorto("FR8-ec3eecfc-8424-4b39-a859-79a8190f4781")).toBe("FR8-EC3EECFC");
    expect(folioCorto("RFx09302601")).toBe("RFx09302601");
  });
  it("el shipper va aparte solo si existe y el nombre no lo dice", () => {
    const base = { folio: "RFx1", nombre: "S3 | FTL D2D Crossborder Exports", shipper: "Owen Illinois" };
    expect(nombreEvento(base)).toBe("S3 | FTL D2D Crossborder Exports");
    expect(shipperAparte(base)).toBe("Owen Illinois");
    expect(shipperAparte({ ...base, shipper: "—" })).toBeNull();
    expect(shipperAparte({ ...base, nombre: "PRIMA Manufacturing | Flatbed", shipper: "prima manufacturing" })).toBeNull();
  });
  it("reconoce filas de ensayo", () => {
    expect(pareceDePrueba("PILOTO BIDWARE GMAIL — SIN VALIDEZ COMERCIAL")).toBe(true);
    expect(pareceDePrueba("Tradeco", null)).toBe(false);
  });
});

describe("dinero", () => {
  it("dos decimales cuando hay centavos, ninguno si es entero", () => {
    expect(dinero(4501.7)).toBe("4,501.70 USD");
    expect(dinero(4000)).toBe("4,000 USD");
    expect(dinero(null)).toBe("—");
  });
});
