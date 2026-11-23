import { describe, expect, it } from "vitest";
import { dentroDeObjetivo, modelosMixtos, rangoRutas, resumenPorRuta } from "../src/dominio/resumenOfertas";
import type { Detalle, OfertaVersion, Participacion, Ruta } from "../src/dominio/tipos";

const version = (allIn: number, modelo = "cost_plus", vigencia: string | null = "2026-12-11"): OfertaVersion => ({
  numero: 1, tarifaAllIn: allIn, moneda: "USD", modeloComercial: modelo, carrierSharePct: null, margenPct: null,
  capacidadSemanal: null, transitoDias: null, vigenteHasta: vigencia, esFinal: true, fuente: "captura_equipo",
  actor: "equipo", nota: null, creadaEn: "2026-11-13T00:00:00Z", huella: `h${allIn}`
});
const oferta = (carrierId: string, v: OfertaVersion): Participacion => ({
  id: `${carrierId}-${v.tarifaAllIn}`, carrierId, carrier: carrierId.toUpperCase(), correo: null, carrierBloqueado: false,
  estado: "oferto" as Participacion["estado"], rubros: {}, condiciones: {}, versiones: [v], rol: null, motivo: null,
  adjudicada: null, entregadaEn: null, vistaEn: null, respondioEn: null
});
const ruta = (numero: number, objetivo: number | null, ps: Participacion[]): Ruta => ({
  id: `r${numero}`, numero, origen: "Tultitlán, MX", destino: "Albany, GA", equipo: "Dry Van", volumenSemanal: null,
  objetivo, moneda: "USD", desiertaMotivo: null, condiciones: [], participaciones: ps
});
const detalle = (rutas: Ruta[]): Detalle => ({
  evento: { id: "e", folio: "RFx1", nombre: "S3", shipper: "Owen Illinois", estado: "cerrado", plazo: "2026-11-20", prueba: false },
  rutas, avisos: [], recibo: null
});

describe("resumen de ofertas arriba de las rutas", () => {
  it("una fila por ruta con la más baja, contra objetivo y vigencia", () => {
    const d = detalle([
      ruta(1, 4000, [oferta("mj", version(4365.36)), oferta("omega", version(4505, "cost_plus", null))]),
      ruta(2, 2100, [oferta("jpi", version(2370, "cost_plus", null))]),
      ruta(3, 3000, [])
    ]);
    const r = resumenPorRuta(d);
    expect(r.map((x) => [x.ruta.numero, x.ofertas, x.masBaja?.p.carrier ?? null, x.contraObjetivo, x.masBaja?.sinVigencia ?? null])).toEqual([
      [1, 2, "MJ", 9, false],
      [2, 1, "JPI", 13, true],
      [3, 0, null, null, null]
    ]);
  });

  it("avisa cuando un carrier cotiza con modelos distintos", () => {
    const d = detalle([1, 2, 3, 4, 5, 6, 7, 8].map((n) => ruta(n, 5000, [oferta("select", version(5000 + n, n <= 6 ? "brokerage" : "cost_plus")), oferta("mj", version(4000 + n))])));
    const m = modelosMixtos(d);
    expect(m).toHaveLength(1);
    expect(m[0].carrier).toBe("SELECT");
    expect(m[0].modelos.map((x) => rangoRutas(x.rutas))).toEqual(["1–6", "7, 8"]);
  });

  it("«mejor» solo en el objetivo o por debajo", () => {
    expect(dentroDeObjetivo(3900, 4000)).toBe(true);
    expect(dentroDeObjetivo(4000, 4000)).toBe(true);
    expect(dentroDeObjetivo(4365, 4000)).toBe(false);
    expect(dentroDeObjetivo(4365, null)).toBe(true);
  });
});
