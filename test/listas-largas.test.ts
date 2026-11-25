import { describe, expect, it } from "vitest";
import { paginar } from "../src/bidware/lib/paginar";
import { agruparPorFamilia, esBitacora, OTRAS, partesNombre } from "../src/bidware/features/carrier-templates/familias";
import { coincide, enOtrasEtapas } from "../src/bidware/features/carrier-crm/busqueda";

// Prioridad 7 del rediseño (25-nov-2026): listas largas con búsqueda, páginas y familias.
describe("paginar", () => {
  const filas = Array.from({ length: 61 }, (_, i) => i + 1);
  it("25 por página y dice qué rango se ve", () => {
    expect(paginar(filas, 1)).toMatchObject({ pagina: 1, paginas: 3, desde: 1, hasta: 25, total: 61 });
    expect(paginar(filas, 3).filas).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61]);
  });
  it("una página fuera de rango se acomoda y nunca queda vacía", () => {
    expect(paginar(filas, 9).pagina).toBe(3);
    expect(paginar(filas, 0).pagina).toBe(1);
    expect(paginar([], 4)).toMatchObject({ filas: [], pagina: 1, paginas: 1, desde: 0, hasta: 0 });
  });
});

describe("listas por familia", () => {
  it("separa familia, equipo y la marca Ampliada", () => {
    expect(partesNombre("D2D Crossborder - Dry Van · Ampliada")).toEqual({ familia: "D2D Crossborder", equipo: "Dry Van", ampliada: true });
    expect(partesNombre("MX Northbound & Southbound - Power Only")).toEqual({ familia: "MX Northbound & Southbound", equipo: "Power Only", ampliada: false });
    expect(partesNombre("O-I · 49 carriers · preparación de convocatoria")).toMatchObject({ familia: OTRAS, ampliada: false });
  });
  it("agrupa en orden, con la base antes que la ampliada y Otras al final", () => {
    const nombres = [
      "O-I · 49 carriers",
      "Intramex - Reefer · Ampliada",
      "D2D Crossborder - Dry Van · Ampliada",
      "Intramex - Reefer",
      "D2D Crossborder - Dry Van",
      "D2D Crossborder - Flatbed",
    ];
    const g = agruparPorFamilia(nombres, (n) => n);
    expect(g.map((f) => f.nombre)).toEqual(["D2D Crossborder", "Intramex", OTRAS]);
    expect(g[0].listas).toEqual(["D2D Crossborder - Dry Van", "D2D Crossborder - Dry Van · Ampliada", "D2D Crossborder - Flatbed"]);
    expect(g[0].equipos).toEqual(["Dry Van", "Flatbed"]);
    expect(g[1].listas).toEqual(["Intramex - Reefer", "Intramex - Reefer · Ampliada"]);
  });
  it("las notas de bitácora repetidas no se muestran como descripción", () => {
    for (const t of [
      "LISTA AMPLIADA creada el 25/10/2026 con OK de Jose.",
      "Creada el 25/10/2026 con OK de Jose.",
      "Selección verificada por cotización histórica atribuible al 22/10/2026: 3 carriers.",
      "PRESELECCIÓN HISTÓRICA APROBADA 22/10/2026",
      "Actualización04-nov-2026: se añaden cuatro fichas",
    ])
      expect(esBitacora(t), t).toBe(true);
    expect(esBitacora("Carriers dry van MX-US revisados.")).toBe(false);
    expect(esBitacora(null)).toBe(false);
  });
});

describe("búsqueda del Directorio", () => {
  const v = (vendor_name: string, extra: Record<string, unknown> = {}) => ({ id: vendor_name, vendor_name, ...extra });
  it("busca sin acentos en nombre, dominio, correo y teléfono", () => {
    expect(coincide(v("Transportes Peña"), "pena")).toBe(true);
    expect(coincide(v("X", { domain: "omega.mx" }), "OMEGA")).toBe(true);
    expect(coincide(v("X", { whatsapp_phone: "+52 81 1234" }), "81 12")).toBe(true);
    expect(coincide(v("X"), "  ")).toBe(true);
    expect(coincide(v("X"), "zz")).toBe(false);
  });
  it("dice en qué otras etapas hay coincidencias, sin la actual ni las vacías", () => {
    const porEtapa: [string, ReturnType<typeof v>[]][] = [
      ["sourcing", [v("Omega Norte"), v("Beta")]],
      ["targeted", [v("Omega Sur")]],
      ["invited", [v("Gamma")]],
      ["archived", [v("Omega Viejo"), v("Omega Otro")]],
    ];
    expect(enOtrasEtapas(porEtapa, "targeted", "omega")).toEqual([["sourcing", 1], ["archived", 2]]);
    expect(enOtrasEtapas(porEtapa, "targeted", "")).toEqual([]);
  });
});
