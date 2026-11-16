// Lectura automática de correos de carriers (16-nov-2026): qué se lee y qué se recuerda.
import { describe, expect, it } from "vitest";
import { cargarLecturas, combinarLecturas, correosPendientes, guardarLecturas, lecturasPorRevisar, MAX_LECTURAS_POR_APERTURA, REINTENTO_MS, type LecturaGuardada, type LecturaServidor } from "../src/dominio/lecturaAutomatica";
import type { Detalle } from "../src/dominio/tipos";

const correo = (id: string, en: string) => ({ id, en, de: null });
const detalle = (respuestas: Record<string, { correos: ReturnType<typeof correo>[] }>) =>
  ({
    rutas: [
      { id: "r1", participaciones: [{ id: "p1", carrierId: "c1", carrier: "JPI" }, { id: "p2", carrierId: "c2", carrier: "M&J" }] },
      { id: "r2", participaciones: [{ id: "p3", carrierId: "c1", carrier: "JPI" }, { id: "p4", carrierId: "c3", carrier: "Ya adjudicado" }] }
    ],
    respuestas
  }) as unknown as Detalle;
const capturables = new Map([["c1", "JPI"], ["c2", "M&J"]]);
const guardada = (correoId: string, extra: Partial<LecturaGuardada> = {}): LecturaGuardada => ({
  correoId, carrierId: "c1", carrier: "JPI", en: "2026-11-12T15:05:00Z", leidoEn: "2026-11-16T19:00:00Z",
  lectura: { tipo: "oferta", resumen: "", ofertas: [], dudas: [], recortado: false }, fallo: null, revisado: false, ...extra
});

describe("correosPendientes", () => {
  it("lee cada correo una sola vez, el más reciente primero, solo de carriers capturables", () => {
    const d = detalle({
      p1: { correos: [correo("a", "2026-11-12T15:05:00Z")] },
      p3: { correos: [correo("a", "2026-11-12T15:05:00Z")] }, // mismo correo en otra ruta
      p2: { correos: [correo("b", "2026-11-11T17:02:00Z")] },
      p4: { correos: [correo("z", "2026-11-13T00:00:00Z")] } // carrier no capturable
    });
    expect(correosPendientes(d, capturables, {}).map((x) => [x.correo.id, x.carrier])).toEqual([["a", "JPI"], ["b", "M&J"]]);
  });

  it("no vuelve a leer lo ya leído y reintenta un fallo después de un día", () => {
    const d = detalle({ p1: { correos: [correo("a", "2026-11-12T15:05:00Z"), correo("f", "2026-11-12T16:00:00Z")] } });
    const ahora = Date.parse("2026-11-16T19:00:00Z");
    const leidas = { a: guardada("a"), f: guardada("f", { lectura: null, fallo: "x", leidoEn: "2026-11-16T18:00:00Z" }) };
    expect(correosPendientes(d, capturables, leidas, ahora)).toEqual([]);
    expect(correosPendientes(d, capturables, leidas, ahora + REINTENTO_MS).map((x) => x.correo.id)).toEqual(["f"]);
  });

  it("limita las lecturas por apertura", () => {
    const muchos = Array.from({ length: 9 }, (_, i) => correo(`m${i}`, `2026-11-1${i}T00:00:00Z`));
    expect(correosPendientes(detalle({ p1: { correos: muchos } }), capturables, {})).toHaveLength(MAX_LECTURAS_POR_APERTURA);
  });
});

describe("lecturasPorRevisar y almacenamiento", () => {
  it("muestra solo propuestas sin revisar de carriers capturables", () => {
    const leidas = { a: guardada("a"), r: guardada("r", { revisado: true }), f: guardada("f", { lectura: null, fallo: "x" }), o: guardada("o", { carrierId: "c3" }) };
    expect(lecturasPorRevisar(leidas, capturables).map((l) => l.correoId)).toEqual(["a"]);
  });

  it("guarda por evento y tolera almacenamiento roto", () => {
    const mapa = new Map<string, string>();
    const almacen = { getItem: (k: string) => mapa.get(k) ?? null, setItem: (k: string, v: string) => void mapa.set(k, v) };
    guardarLecturas("ev1", { a: guardada("a") }, almacen);
    expect(Object.keys(cargarLecturas("ev1", almacen))).toEqual(["a"]);
    expect(cargarLecturas("ev2", almacen)).toEqual({});
    mapa.set("fr8bid-lecturas-ia-ev3", "{roto");
    expect(cargarLecturas("ev3", almacen)).toEqual({});
    expect(() => guardarLecturas("ev1", {}, { setItem: () => { throw new Error("lleno"); } })).not.toThrow();
  });
});

describe("combinarLecturas (revisión programada de Rateware)", () => {
  const fila = (id: string, extra: Partial<LecturaServidor> = {}): LecturaServidor => ({
    gmail_message_id: id, vendor_id: "c1", received_at: "2026-11-16T20:00:00Z", status: "proposed",
    reading: { lectura: { tipo: "oferta", resumen: "", ofertas: [], dudas: [] } as any, recortado: true }, error: null, created_at: "2026-11-16T20:15:00Z", ...extra
  });
  it("suma los borradores del servidor con el nombre del carrier y evita volver a leerlos", () => {
    const todas = combinarLecturas({}, [fila("a")], capturables);
    expect(todas.a).toMatchObject({ carrier: "JPI", en: "2026-11-16T20:00:00Z", fallo: null, revisado: false, lectura: { recortado: true } });
    const d = detalle({ p1: { correos: [correo("a", "2026-11-16T20:00:00Z")] } });
    expect(correosPendientes(d, capturables, todas)).toEqual([]);
    expect(lecturasPorRevisar(todas, capturables).map((l) => l.correoId)).toEqual(["a"]);
  });
  it("lo de este navegador gana: un correo ya revisado no regresa", () => {
    const todas = combinarLecturas({ a: guardada("a", { revisado: true }) }, [fila("a")], capturables);
    expect(todas.a.revisado).toBe(true);
  });
  it("un fallo del servidor queda como fallo (se reintenta aquí al día siguiente)", () => {
    const todas = combinarLecturas({}, [fila("f", { status: "failed", reading: null, error: "IA_FALLO" })], capturables);
    expect(todas.f).toMatchObject({ lectura: null, fallo: "IA_FALLO" });
    expect(lecturasPorRevisar(todas, capturables)).toEqual([]);
  });
});
