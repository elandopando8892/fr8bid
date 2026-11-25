// Bandeja de respuestas (prioridad 6, 25-nov-2026): el borrador que se abre desde la bandeja, con
// los fallos que la revisión de Codex pidió cubrir (captura a medias, recarga, servidor caído y Gmail caído).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cargarLecturas } from "../src/dominio/lecturaAutomatica";

const { sesion } = vi.hoisted(() => ({ sesion: { rol: "operator", api: {} as Record<string, any> } }));
vi.mock("../src/ui/sesion", () => ({ useSesion: () => sesion }));
import { LecturaIA } from "../src/ui/LecturaIA";

const EV = "ev-bandeja";
const part = (id: string, carrierId: string, carrier: string) => ({ id, carrierId, carrier, estado: "vista", rol: null, versiones: [] });
const ruta = (n: number, parts: unknown[]) => ({ id: `r${n}`, numero: n, origen: `Origen ${n}`, destino: `Destino ${n}`, equipo: "Dry Van", objetivo: 1000, participaciones: parts });
const detalle: any = {
  evento: { id: EV, estado: "abierto" },
  rutas: [ruta(1, [part("p1", "c1", "Grupo Omega")]), ruta(2, [part("p2", "c1", "Grupo Omega")])],
  respuestas: { p1: { correos: [{ id: "msgotro01", en: "2026-11-25T12:00:00Z", de: "omega" }] } }
};
const oferta = (rutaId: string, tarifa: number) => ({ rutaId, tarifa, moneda: "USD", vigencia: "", capacidadSemanal: null, diasTransito: null, notas: "", cita: "", dudas: [] });
const servidor = (x: Record<string, unknown> = {}) => ({
  gmail_message_id: "msgoferta1", vendor_id: "c1", received_at: "2026-11-25T10:00:00Z", status: "proposed",
  reading: { lectura: { tipo: "oferta", resumen: "Cotiza dos rutas", ofertas: [oferta("r1", 1100), oferta("r2", 1200)], dudas: [] }, recortado: false },
  error: null, created_at: "2026-11-25T10:05:00Z", reviewed_at: null, review_outcome: null, ...x
});

let root: Root;
let container: HTMLElement;
const almacen = new Map<string, string>();
const alAbrir = vi.fn();
const accion = async <T,>(f: () => Promise<T>) => {
  try {
    await f();
  } catch {
    // La página del evento muestra el error; aquí basta con no romper.
  }
};
const render = async (abrir: string | null) => {
  await act(async () => root.render(createElement(LecturaIA, { d: detalle, accion: accion as any, advertenciaReal: "", abrir, alAbrir })));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const boton = (texto: string | RegExp) =>
  [...container.querySelectorAll("button")].find((b) => (typeof texto === "string" ? b.textContent?.trim() === texto : texto.test(b.textContent ?? "")));
const clic = async (texto: string | RegExp) => {
  const b = boton(texto);
  if (!b) throw new Error(`No hay botón «${texto}» en: ${container.textContent}`);
  await act(async () => { b.click(); await new Promise((r) => setTimeout(r, 0)); });
};

beforeEach(() => {
  const dom = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (f: () => void) => setTimeout(f, 0));
  almacen.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => void almacen.set(k, v), removeItem: (k: string) => void almacen.delete(k) });
  container = document.getElementById("root")!;
  root = createRoot(container);
  alAbrir.mockReset();
  sesion.rol = "operator";
  sesion.api = {
    lecturasServidor: vi.fn(async () => [servidor()]),
    marcarLectura: vi.fn(async () => true),
    capturarOferta: vi.fn(async () => ({})),
    traerCorreo: vi.fn(async () => { throw new Error("Gmail no responde"); }),
    leerRespuesta: vi.fn(async () => { throw new Error("sin IA en la prueba"); }),
    marcarRespondio: vi.fn(async () => ({}))
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("borrador abierto desde la bandeja", () => {
  it("si una captura falla a la mitad, ni el reintento ni la recarga repiten la ruta ya guardada", async () => {
    let n = 0;
    sesion.api.capturarOferta = vi.fn(async () => { if (++n === 2) throw new Error("red"); return {}; });
    await render("msgoferta1");
    expect(alAbrir).toHaveBeenCalledTimes(1);
    await clic(/Guardar 2 ofertas/);
    await clic("Sí, confirmar");
    expect(sesion.api.capturarOferta.mock.calls.map((c: any[]) => c[0].participacionId)).toEqual(["p1", "p2"]);
    expect(container.textContent).toContain("Ya guardada como nueva versión");
    expect(cargarLecturas(EV).msgoferta1.rutasGuardadas).toEqual(["r1"]);
    expect(sesion.api.marcarLectura).not.toHaveBeenCalled();

    // Recarga: el borrador vuelve a abrirse desde la bandeja y solo ofrece la ruta pendiente.
    await act(async () => root.unmount());
    root = createRoot(container);
    await render("msgoferta1");
    await clic(/Guardar 1 oferta/);
    await clic("Sí, confirmar");
    expect(sesion.api.capturarOferta.mock.calls.map((c: any[]) => c[0].participacionId)).toEqual(["p1", "p2", "p2"]);
    expect(sesion.api.marcarLectura).toHaveBeenCalledWith(EV, "msgoferta1", "captured");
  });

  it("si Rateware no da los borradores, la liga se conserva, no se lee nada nuevo y se puede reintentar", async () => {
    sesion.api.lecturasServidor = vi.fn(async () => { throw new Error("503"); });
    await render("msgoferta1");
    expect(alAbrir).not.toHaveBeenCalled();
    expect(sesion.api.traerCorreo).not.toHaveBeenCalled();
    expect(container.textContent).toContain("No se pudieron consultar las respuestas");
    sesion.api.lecturasServidor = vi.fn(async () => [servidor()]);
    await clic("Reintentar");
    expect(alAbrir).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Borrador de la IA");
  });

  it("si la marca al equipo falla queda pendiente y se reintenta al volver a abrir el evento", async () => {
    sesion.api.marcarLectura = vi.fn(async () => { throw new Error("404 de ruta"); });
    await render("msgoferta1");
    await clic("Descartar");
    expect(cargarLecturas(EV).msgoferta1).toMatchObject({ revisado: true, marcaPendiente: "dismissed" });
    expect(container.textContent).toContain("no se pudo avisar al equipo");

    await act(async () => root.unmount());
    root = createRoot(container);
    sesion.api.marcarLectura = vi.fn(async () => true);
    await render(null);
    expect(sesion.api.marcarLectura).toHaveBeenCalledWith(EV, "msgoferta1", "dismissed");
    expect(cargarLecturas(EV).msgoferta1.marcaPendiente).toBeUndefined();
  });

  it("un correo que la IA no pudo leer se descarta, aunque Gmail falle al traer otro", async () => {
    sesion.api.lecturasServidor = vi.fn(async () => [servidor({ gmail_message_id: "msgexcel01", status: "failed", reading: null, error: "Es un Excel" })]);
    await render("msgexcel01");
    expect(container.textContent).toContain("Es un Excel");
    await clic("Traer este correo");
    expect(sesion.api.traerCorreo).toHaveBeenCalledWith(EV, "msgotro01");
    await clic("Descartar este correo");
    expect(sesion.api.marcarLectura).toHaveBeenCalledWith(EV, "msgexcel01", "dismissed");
  });

  it("sin carriers capturables o con Consulta, la liga explica por qué y no se queda en silencio", async () => {
    sesion.rol = "viewer";
    await render("msgoferta1");
    expect(container.textContent).toContain("Con el rol Consulta");
    expect(alAbrir).toHaveBeenCalledTimes(1);
  });
});
