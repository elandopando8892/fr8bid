import { describe, expect, it } from "vitest";
import type { ResumenEvento } from "../src/dominio/tipos";
import { botonFila, quePasa } from "../src/ui/eventosVista";
import { buscar, entradasDeEventos, entradasDeNavegacion, etapaDe, MENU, moduloDe, seccionActiva } from "../src/ui/navegacion";

// Rediseño 25-nov-2026 («Nombres y cascarón», elegido por Jose): cinco
// entradas en español, búsqueda global y filas de Eventos con etapa y un botón.
const ev = (x: Partial<ResumenEvento>): ResumenEvento => ({ id: "e", folio: "RFx-1", nombre: "Evento", shipper: "Owens Illinois", estado: "abierto", plazo: "2026-11-20", prueba: false, rutas: [], ofertas: 0, participaciones: 0, ...x });
const f = (iso: string | null) => iso ?? "—";

describe("cascarón de cinco entradas", () => {
  it("cinco entradas en español y el resto en «Más»", () => {
    expect(MENU[0].modulos.map((m) => m.etiqueta)).toEqual(["Hoy", "Eventos", "Cotizaciones", "Carriers", "Shippers y tarifas"]);
    expect(MENU[1]).toMatchObject({ grupo: "Más", plegado: true });
    const todas = MENU.flatMap((g) => g.modulos.flatMap((m) => [m.etiqueta, ...(m.secciones ?? []).map((s) => s.etiqueta)]));
    for (const viejo of ["Eventos RFx", "QuoteDesk", "Shipper intake", "Carrier CRM", "Carrier fit"]) expect(todas).not.toContain(viejo);
  });

  it("cada pantalla vieja cae en su entrada y su pestaña", () => {
    const casos: [string, string, string | undefined][] = [
      ["/", "Hoy", undefined],
      ["/eventos/abc", "Eventos", "Eventos"],
      ["/rfx/new", "Eventos", "Eventos"],
      ["/respuestas", "Eventos", "Respuestas"],
      ["/quotedesk/9", "Cotizaciones", "Cotizaciones"],
      ["/intake", "Cotizaciones", "Solicitudes de shippers"],
      ["/crm/rebotes", "Carriers", "Directorio"],
      ["/templates/new", "Carriers", "Listas"],
      ["/carrier-fit", "Carriers", "A quién invitar"],
      ["/plantillas/3", "Carriers", "Plantillas de correo"],
      ["/shippers/7", "Shippers y tarifas", "Shippers"],
      ["/tarifario", "Shippers y tarifas", "Tarifas"],
      ["/integraciones", "Integraciones", undefined]
    ];
    for (const [ruta, entrada, seccion] of casos) {
      const m = moduloDe(ruta);
      expect(m?.etiqueta, ruta).toBe(entrada);
      expect(m && seccionActiva(m, ruta)?.etiqueta, ruta).toBe(seccion);
    }
  });
});

describe("búsqueda global", () => {
  const entradas = [
    ...entradasDeEventos([ev({ id: "oi", folio: "RFx09302601", nombre: "O-I · Tultitlán y Monterrey", rutas: ["Tultitlán, MX → Houston, TX"], estado: "cerrado" })]),
    ...entradasDeNavegacion()
  ];
  it("encuentra un evento por folio, shipper o ciudad sin acentos", () => {
    for (const q of ["RFx0930", "owens", "tultitlan houston"]) expect(buscar(q, entradas)[0]?.a, q).toBe("/eventos/oi");
  });
  it("encuentra secciones por su nombre nuevo y por el viejo", () => {
    expect(buscar("cotizacion", entradas)[0]?.a).toBe("/quotedesk");
    expect(buscar("carrier fit", entradas).map((r) => r.a)).toContain("/carrier-fit");
    expect(buscar("rebotados", entradas)[0]?.a).toBe("/crm/rebotes");
  });
  it("sin texto no busca y sin coincidencias no inventa", () => {
    expect(buscar("  ", entradas)).toEqual([]);
    expect(buscar("zzzz", entradas)).toEqual([]);
  });
});

describe("fila de Eventos: etapa, qué pasa y un botón", () => {
  it("la etapa sigue las cinco de la página del evento", () => {
    expect(etapaDe(ev({ estado: "borrador" }))).toEqual({ n: 2, texto: "Invitar" });
    expect(etapaDe(ev({ estado: "abierto" }))).toEqual({ n: 3, texto: "Ofertas" });
    expect(etapaDe(ev({ estado: "cerrado" }))).toEqual({ n: 3, texto: "Adjudicar" });
    expect(etapaDe(ev({ estado: "adjudicado" }))).toEqual({ n: 4, texto: "Entrega y avisos" });
    expect(etapaDe(ev({ estado: "archivado" }))).toBeNull();
  });
  it("dice qué pasa en una frase y da un solo botón", () => {
    expect(quePasa(ev({ ofertas: 3, participaciones: 8 }), f)).toBe("3 ofertas de 8 invitaciones · cierra 2026-11-20.");
    expect(quePasa(ev({ ofertas: 0, participaciones: 0 }), f)).toBe("Sin invitaciones todavía · cierra 2026-11-20.");
    expect(botonFila(ev({ ofertas: 3, participaciones: 8 }))).toBe("Ver ofertas");
    expect(quePasa(ev({ ofertas: 8, participaciones: 8 }), f)).toBe("8 ofertas de 8 invitaciones · puedes cerrar.");
    expect(botonFila(ev({ ofertas: 8, participaciones: 8 }))).toBe("Cerrar a ofertas");
    expect(quePasa(ev({ estado: "cerrado", ofertas: 1 }), f)).toBe("1 oferta · plazo 2026-11-20. Elige primario y respaldo.");
    expect(quePasa(ev({ estado: "cerrado" }), f)).toBe("Cerrado sin ofertas · plazo 2026-11-20.");
    expect(quePasa(ev({ estado: "adjudicado" }), f)).toBe("Adjudicado. Confirma la entrega a Rateware y los avisos.");
    expect(botonFila(ev({ estado: "cerrado" }))).toBe("Adjudicar");
    expect(botonFila(ev({ estado: "borrador" }))).toBe("Invitar");
    expect(botonFila(ev({ estado: "adjudicado" }))).toBe("Revisar");
  });
});
