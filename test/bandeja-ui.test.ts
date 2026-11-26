// Bandeja de respuestas (prioridad 6, 25-nov-2026): el borrador que se abre desde la bandeja, con
// los fallos que la revisión de Codex pidió cubrir (captura a medias, recarga, servidor caído y Gmail caído).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cargarLecturas } from "../src/dominio/lecturaAutomatica";

const { sesion } = vi.hoisted(() => ({ sesion: { rol: "operator", correo: "operador@equipo.mx" as string | null, api: {} as Record<string, any> } }));
vi.mock("../src/ui/sesion", () => ({ useSesion: () => sesion }));
import { LecturaIA } from "../src/ui/LecturaIA";

const EV = "ev-bandeja";
const part = (id: string, carrierId: string, carrier: string) => ({ id, carrierId, carrier, estado: "vista", rol: null, versiones: [] });
const ruta = (n: number, parts: unknown[]) => ({ id: `r${n}`, numero: n, origen: `Origen ${n}`, destino: `Destino ${n}`, equipo: "Dry Van", objetivo: 1000, participaciones: parts });
const detalleBase = (versiones: Record<string, unknown[]> = {}): any => ({
  evento: { id: EV, estado: "abierto" },
  rutas: [
    ruta(1, [{ ...part("p1", "c1", "Grupo Omega"), versiones: versiones.p1 ?? [] }]),
    ruta(2, [{ ...part("p2", "c1", "Grupo Omega"), versiones: versiones.p2 ?? [] }])
  ],
  respuestas: { p1: { correos: [{ id: "msgotro01", en: "2026-11-25T12:00:00Z", de: "omega" }] } }
});
// Versión que el equipo capturó desde el correo (llegó 10:00): la que Rateware devuelve al releer el evento.
const capturada = (tarifaAllIn: number, creadaEn = "2026-11-25T11:00:00Z") => ({ numero: 1, tarifaAllIn, moneda: "USD", fuente: "captura_equipo", creadaEn });
let detalle: any = detalleBase();
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
  detalle = detalleBase();
  sesion.correo = "operador@equipo.mx";
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

  it("una captura cuya respuesta se perdió pero sí entró sale como posible duplicado y no se vuelve a marcar sola", async () => {
    sesion.api.capturarOferta = vi.fn(async (o: any) => { if (o.participacionId === "p2") throw new Error("504"); return {}; });
    await render("msgoferta1");
    await clic(/Guardar 2 ofertas/);
    await clic("Sí, confirmar");
    // La página relee el evento tras el intento: Rateware sí tiene la de la ruta 2.
    detalle = detalleBase({ p1: [capturada(1100)], p2: [capturada(1200)] });
    await render(null);
    expect(container.textContent).toContain("Ya guardada como nueva versión");
    expect(container.textContent).toContain("Puede ser esta misma");
    expect(boton(/Guardar \d+ oferta/)?.disabled).toBe(true);
  });

  it("si se editó la tarifa y la respuesta se perdió, al reabrir se reconoce por el importe enviado", async () => {
    sesion.api.capturarOferta = vi.fn(async () => { throw new Error("504"); });
    await render("msgoferta1");
    await clic(/Guardar 2 ofertas/);
    await clic("Sí, confirmar");
    // Antes de enviar se anotó el importe de cada ruta.
    expect(cargarLecturas(EV).msgoferta1.intentos?.r1).toEqual({ tarifa: 1100, moneda: "USD" });

    // Otro intento anterior mandó la ruta 1 corregida a 1150 y Rateware sí la guardó.
    const previa = cargarLecturas(EV).msgoferta1;
    almacen.set(`fr8bid-lecturas-ia-${EV}`, JSON.stringify({ msgoferta1: { ...previa, intentos: { r1: { tarifa: 1150, moneda: "USD" } } } }));
    await act(async () => root.unmount());
    root = createRoot(container);
    detalle = detalleBase({ p1: [capturada(1150)] });
    await render("msgoferta1");
    expect(container.textContent).toContain("Rateware ya tiene una oferta de");
    expect(boton(/Guardar 1 oferta/)).toBeTruthy();
  });

  it("otra oferta del mismo importe no se da por guardada: queda a decisión de quien revisa", async () => {
    detalle = detalleBase({ p1: [capturada(1100)], p2: [capturada(1200, "2026-11-24T09:00:00Z")] });
    await render("msgoferta1");
    // Ruta 1: indicio de duplicado, sin marcar. Ruta 2: versión de antes del correo, no cuenta.
    expect(container.textContent).toContain("Puede ser esta misma");
    expect(container.textContent).not.toContain("Ya guardada como nueva versión");
    // Quien revisa puede incluirla de todos modos.
    expect((container.querySelectorAll("input[type=checkbox]")[0] as HTMLInputElement).disabled).toBe(false);
    await clic(/Guardar 1 oferta/);
    await clic("Sí, confirmar");
    expect(sesion.api.capturarOferta.mock.calls.map((c: any[]) => c[0].participacionId)).toEqual(["p2"]);
  });

  it("guardar solo parte de las rutas no deja la respuesta lista: hay que cerrarla a propósito", async () => {
    // La ruta 2 sale sin marcar (posible duplicado); se guarda solo la 1.
    detalle = detalleBase({ p2: [capturada(1200)] });
    await render("msgoferta1");
    await clic(/Guardar 1 oferta/);
    await clic("Sí, confirmar");
    expect(sesion.api.marcarLectura).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Borrador de la IA");
    await clic("Terminar sin guardar las demás");
    expect(sesion.api.marcarLectura).toHaveBeenCalledWith(EV, "msgoferta1", "captured");
  });

  it("si Rateware aún no tiene el borrador, la marca queda pendiente sin aviso y llega cuando aparece", async () => {
    sesion.api.marcarLectura = vi.fn(async () => false);
    await render("msgoferta1");
    await clic("Descartar");
    expect(cargarLecturas(EV).msgoferta1).toMatchObject({ revisado: true, marcaPendiente: "dismissed" });
    expect(container.textContent).not.toContain("no se pudo avisar al equipo");
    await act(async () => root.unmount());
    root = createRoot(container);
    sesion.api.marcarLectura = vi.fn(async () => true);
    await render(null);
    expect(sesion.api.marcarLectura).toHaveBeenCalledWith(EV, "msgoferta1", "dismissed");
    expect(cargarLecturas(EV).msgoferta1.marcaPendiente).toBeUndefined();
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

  it("la marca pendiente no se reescribe si Rateware ya la tiene, ni la repite otra cuenta", async () => {
    sesion.api.marcarLectura = vi.fn(async () => { throw new Error("504"); });
    await render("msgoferta1");
    await clic("Descartar");
    expect(cargarLecturas(EV).msgoferta1).toMatchObject({ marcaPendiente: "dismissed", marcaDe: "operador@equipo.mx" });

    // Otra cuenta en el mismo navegador: no escribe por la primera.
    await act(async () => root.unmount());
    root = createRoot(container);
    sesion.correo = "otra@equipo.mx";
    sesion.api.marcarLectura = vi.fn(async () => true);
    await render(null);
    expect(sesion.api.marcarLectura).not.toHaveBeenCalled();
    // Para esa otra cuenta sigue por atender (Rateware no la tiene marcada): no se queda bloqueada.
    expect(cargarLecturas(EV).msgoferta1).toMatchObject({ revisado: false });
    expect(container.textContent).toContain("Respuestas por correo leídas por la IA");

    // La marca sí había entrado (la respuesta se perdió): se limpia sin escribir.
    await act(async () => root.unmount());
    root = createRoot(container);
    // El pendiente de la primera cuenta se conserva.
    expect(cargarLecturas(EV).msgoferta1).toMatchObject({ marcaPendiente: "dismissed", marcaDe: "operador@equipo.mx" });

    // La primera cuenta vuelve; la marca sí había entrado (la respuesta se perdió): se limpia sin escribir.
    sesion.correo = "operador@equipo.mx";
    sesion.api.lecturasServidor = vi.fn(async () => [servidor({ reviewed_at: "2026-11-25T12:00:00Z", review_outcome: "dismissed" })]);
    await render(null);
    expect(sesion.api.marcarLectura).not.toHaveBeenCalled();
    expect(cargarLecturas(EV).msgoferta1).toMatchObject({ revisado: true });
    expect(cargarLecturas(EV).msgoferta1.marcaPendiente).toBeUndefined();
  });

  it("si la otra cuenta reabrió la respuesta, la primera igual reintenta su marca al volver", async () => {
    almacen.set(`fr8bid-lecturas-ia-${EV}`, JSON.stringify({ msgoferta1: { correoId: "msgoferta1", carrierId: "c1", carrier: "Grupo Omega", en: "2026-11-25T10:00:00Z", leidoEn: "2026-11-25T10:05:00Z", lectura: null, fallo: null, revisado: false, marcaPendiente: "captured", marcaDe: "operador@equipo.mx" } }));
    await render(null);
    expect(sesion.api.marcarLectura).toHaveBeenCalledWith(EV, "msgoferta1", "captured");
    expect(cargarLecturas(EV).msgoferta1).toMatchObject({ revisado: true });
    expect(cargarLecturas(EV).msgoferta1.marcaPendiente).toBeUndefined();
  });

  it("un correo que la IA no pudo leer se descarta, aunque Gmail falle al traer otro", async () => {
    sesion.api.lecturasServidor = vi.fn(async () => [servidor({ gmail_message_id: "msgexcel01", status: "failed", reading: null, error: "Es un Excel" })]);
    await render("msgexcel01");
    // Desde la bandeja se intenta leer otra vez en el momento; si tampoco se puede, se dice qué hacer.
    expect(sesion.api.traerCorreo).toHaveBeenCalledWith(EV, "msgexcel01");
    expect(container.textContent).toContain("Tráelo de nuevo, pega el texto o descártalo");
    await clic("Traer este correo");
    expect(sesion.api.traerCorreo).toHaveBeenCalledWith(EV, "msgotro01");
    await clic("Descartar este correo");
    expect(sesion.api.marcarLectura).toHaveBeenCalledWith(EV, "msgexcel01", "dismissed");
  });

  it("un correo que Gmail no dejó leer se lee ahora al abrirlo desde la bandeja y queda como borrador", async () => {
    sesion.api.lecturasServidor = vi.fn(async () => [servidor({ gmail_message_id: "msgcuota01", status: "failed", reading: null, error: "Quota exceeded" })]);
    sesion.api.traerCorreo = vi.fn(async () => ({ texto: "Tarifa 1300 USD ruta 1", adjuntos: [], anexos: [] }));
    sesion.api.leerRespuesta = vi.fn(async () => ({ tipo: "oferta", resumen: "Cotiza la ruta 1", ofertas: [oferta("r1", 1300)], dudas: [], recortado: false }));
    await render("msgcuota01");
    expect(sesion.api.traerCorreo).toHaveBeenCalledWith(EV, "msgcuota01");
    expect(cargarLecturas(EV).msgcuota01.lectura?.tipo).toBe("oferta");
    expect(cargarLecturas(EV).msgcuota01.fallo).toBeNull();
    expect(boton(/Guardar 1 oferta/)).toBeTruthy();
  });

  it("sin carriers capturables o con Consulta, la liga explica por qué y no se queda en silencio", async () => {
    sesion.rol = "viewer";
    await render("msgoferta1");
    expect(container.textContent).toContain("Con el rol Consulta");
    expect(alAbrir).toHaveBeenCalledTimes(1);
  });
});
