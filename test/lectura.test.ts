// Lectura con IA de respuestas de carriers por correo o WhatsApp (pedido de
// Jose del 12-nov-2026). La IA propone; aquí se prueba lo que Fr8Bid acepta.

import { describe, expect, it } from "vitest";
import { MesaApi, type LectorRespuestas } from "../src/cliente/api";
import { aceptarLectura, MAX_BYTES_ADJUNTOS, MAX_TEXTO_LECTURA, quitarCitado, tarifaEnTexto, type RutaLectura } from "../src/dominio/lectura";
import { leerRespuesta, type ConsultaLectura, type Leer } from "../src/servidor/lectura";

const rutas: RutaLectura[] = [
  { id: "r1", numero: 1, origen: "Monterrey, NL", destino: "Laredo, TX", equipo: "Dry Van 53" },
  { id: "r2", numero: 2, origen: "Monterrey, NL", destino: "Dallas, TX", equipo: "Dry Van 53" }
];
const correo = "Buen día, cotizamos MTY-Laredo en $1,250 USD y MTY-Dallas en 2,100.50 dlls, vigencia al 30 de noviembre. Cruce incluido.";
const oferta = (extra: Record<string, unknown>) => ({ ruta_id: "r1", tarifa: 1250, moneda: "USD", vigencia: "2026-11-30", capacidad_semanal: null, dias_transito: null, notas: "Cruce incluido", cita: "MTY-Laredo en $1,250 USD", dudas: [], ...extra });

describe("la tarifa tiene que estar en el texto", () => {
  it("reconoce el mismo número con separadores distintos", () => {
    expect(tarifaEnTexto(1250, "en $1,250 USD")).toBe(true);
    expect(tarifaEnTexto(1250, "1.250 dólares")).toBe(true);
    expect(tarifaEnTexto(1250, "1 250 usd")).toBe(true);
    expect(tarifaEnTexto(2100.5, "2,100.50 dlls")).toBe(true);
    expect(tarifaEnTexto(1250, "1250")).toBe(true);
  });

  it("no acepta un número que no está o que es parte de otro", () => {
    expect(tarifaEnTexto(1250, "en $1,350 USD")).toBe(false);
    expect(tarifaEnTexto(125, "en $1,250 USD")).toBe(false);
    expect(tarifaEnTexto(1250, "folio 26-2263, sin unidades")).toBe(false);
  });
});

describe("aceptarLectura", () => {
  it("deja pasar una oferta que el texto sostiene", () => {
    const l = aceptarLectura(correo, rutas, { tipo: "oferta", resumen: "Cotizó dos rutas", ofertas: [oferta({}), oferta({ ruta_id: "r2", tarifa: 2100.5 })], dudas: [] });
    expect(l.tipo).toBe("oferta");
    expect(l.ofertas.map((o) => [o.rutaId, o.tarifa, o.moneda, o.vigencia])).toEqual([["r1", 1250, "USD", "2026-11-30"], ["r2", 2100.5, "USD", "2026-11-30"]]);
    expect(l.dudas).toEqual([]);
  });

  it("quita la tarifa inventada y lo avisa", () => {
    const l = aceptarLectura(correo, rutas, { tipo: "oferta", resumen: "", ofertas: [oferta({ tarifa: 1300 })], dudas: [] });
    expect(l.ofertas[0].tarifa).toBeNull();
    expect(l.ofertas[0].dudas.join(" ")).toContain("no aparece en el texto");
    expect(l.dudas.join(" ")).toContain("No se encontró una tarifa clara");
  });

  it("descarta rutas que no son del evento y tarifas repetidas por ruta", () => {
    const l = aceptarLectura(correo, rutas, { tipo: "oferta", resumen: "", ofertas: [oferta({ ruta_id: "otra" }), oferta({}), oferta({ tarifa: 2100.5 })], dudas: [] });
    expect(l.ofertas).toHaveLength(1);
    expect(l.dudas).toHaveLength(2);
  });

  it("no supone moneda ni fecha", () => {
    const l = aceptarLectura(correo, rutas, { tipo: "oferta", resumen: "", ofertas: [oferta({ moneda: "EUR", vigencia: "30 de noviembre", capacidad_semanal: -3, dias_transito: "dos" })], dudas: [] });
    expect(l.ofertas[0]).toMatchObject({ tarifa: 1250, moneda: null, vigencia: null, capacidadSemanal: null, diasTransito: null });
    expect(l.ofertas[0].dudas).toEqual(["El texto no dice la moneda.", "La vigencia no se pudo leer como fecha."]);
    expect(aceptarLectura(correo, rutas, { tipo: "oferta", ofertas: [oferta({ vigencia: "2026-02-31" })] }).ofertas[0].vigencia).toBeNull();
  });

  it("una «oferta» sin ofertas no es oferta; lo desconocido es «otro»", () => {
    expect(aceptarLectura("Gracias, lo reviso", rutas, { tipo: "oferta", resumen: "", ofertas: [], dudas: [] }).tipo).toBe("otro");
    expect(aceptarLectura("x", rutas, { tipo: "adjudicar", ofertas: null }).tipo).toBe("otro");
    expect(aceptarLectura("Sin unidades", rutas, { tipo: "rechazo", resumen: "No tiene unidades", ofertas: [], dudas: [] })).toMatchObject({ tipo: "rechazo", resumen: "No tiene unidades", ofertas: [] });
  });
});

describe("POST /api/lectura", () => {
  const cuerpo = { texto: correo, canal: "email", carrier: "ACME", hoy: "2026-11-13", rutas: rutas.map((r) => ({ ...r, objetivo: 999 })) };

  it("exige sesión, texto y rutas, y no recorta el texto en silencio", async () => {
    const leer: Leer = async () => ({});
    expect((await leerRespuesta(cuerpo, false, leer)).status).toBe(401);
    expect((await leerRespuesta({ ...cuerpo, texto: " " }, true, leer)).body).toMatchObject({ code: "TEXTO_VACIO" });
    expect((await leerRespuesta({ ...cuerpo, texto: "a".repeat(MAX_TEXTO_LECTURA + 1) }, true, leer)).body).toMatchObject({ code: "TEXTO_LARGO" });
    expect((await leerRespuesta({ ...cuerpo, rutas: [] }, true, leer)).body).toMatchObject({ code: "RUTAS_INVALIDAS" });
  });

  it("sin clave dice que la IA no está configurada; si la IA falla, se captura a mano", async () => {
    expect(await leerRespuesta(cuerpo, true, null)).toMatchObject({ status: 503, body: { code: "IA_NO_CONFIGURADA" } });
    expect(await leerRespuesta(cuerpo, true, async () => { throw new Error("x"); })).toMatchObject({ status: 502, body: { code: "IA_FALLO" } });
  });

  it("a la IA solo van el texto, el carrier y origen, destino y equipo de cada ruta", async () => {
    let visto: ConsultaLectura | null = null;
    const r = await leerRespuesta(cuerpo, true, async (c) => {
      visto = c;
      return { tipo: "oferta", resumen: "Cotizó", ofertas: [oferta({})], dudas: [] };
    });
    expect(visto).toEqual({ texto: correo, canal: "email", carrier: "ACME", hoy: "2026-11-13", rutas, adjuntos: [] });
    expect(JSON.stringify(visto)).not.toContain("999");
    expect(r).toMatchObject({ status: 200, body: { lectura: { tipo: "oferta", ofertas: [{ rutaId: "r1", tarifa: 1250 }] } } });
  });
});

describe("el correo citado no llega a la IA", () => {
  const invitacion = "1 Monterrey, NL 64570\nAlbany, GA 31705\nTruck Trailer / Dry Van D2D Export One Way - 4,000 USD";

  it("corta en la cita de Gmail aunque venga partida en dos renglones", () => {
    const r = quitarCitado(`Te cotizo Albany en 4,350 USD.\n\nSaludos\n\nEl lun, 9 nov 2026 a la(s) 11:57 a.m., sales via PRICING (\nPRICING@carrier.net) escribió:\n\n> ${invitacion}`);
    expect(r).toEqual({ texto: "Te cotizo Albany en 4,350 USD.\n\nSaludos", recortado: true });
  });

  it("corta en la cita de Outlook y en «On … wrote:»", () => {
    expect(quitarCitado(`Comparto cotizacion.\n\n________________________________\nFrom: sales@heymarksman.com <sales@heymarksman.com>\n${invitacion}`).texto).toBe("Comparto cotizacion.");
    expect(quitarCitado(`Attached are our rates\n\nOn Mon, Nov 9, 2026 at 11:57 AM sales@heymarksman.com wrote:\n${invitacion}`).texto).toBe("Attached are our rates");
    expect(quitarCitado(`Sin unidades\nDe: sales@heymarksman.com\nEnviado: lunes\n${invitacion}`).texto).toBe("Sin unidades");
  });

  it("no toca un mensaje sin cita", () => {
    expect(quitarCitado("El flete sale en 1,250 USD, cruce incluido.")).toEqual({ texto: "El flete sale en 1,250 USD, cruce incluido.", recortado: false });
  });

  it("el objetivo citado no se puede proponer como oferta", async () => {
    const texto = `Anexo cotización.\n\nEl lun, 9 nov 2026 sales@heymarksman.com escribió:\n> ${invitacion}`;
    let visto = "";
    const r = await leerRespuesta({ texto, canal: "email", carrier: "ACME", rutas }, true, async (c) => {
      visto = c.texto;
      return { tipo: "oferta", resumen: "", ofertas: [oferta({ tarifa: 4000, cita: "4,000 USD" })], dudas: [] };
    });
    expect(visto).toBe("Anexo cotización.");
    expect(r.body).toMatchObject({ recortado: true, lectura: { ofertas: [{ tarifa: null }] } });
  });

  it("si solo quedó lo citado, lo dice", async () => {
    const r = await leerRespuesta({ texto: `> ${invitacion}`, canal: "email", carrier: "ACME", rutas }, true, async () => ({}));
    expect(r).toMatchObject({ status: 400, body: { code: "TEXTO_VACIO", error: expect.stringContaining("correo citado") } });
  });
});

describe("archivos del carrier", () => {
  const pdf = { nombre: "cotizacion.pdf", tipo: "application/pdf", base64: "JVBERi0xLjQ=" };
  const base = { texto: "Anexo la cotización", canal: "email", carrier: "ACME", rutas };

  it("los manda a la IA y propone la tarifa pidiendo compararla con el archivo", async () => {
    let enviados: unknown[] = [];
    const r = await leerRespuesta({ ...base, adjuntos: [pdf] }, true, async (c) => {
      enviados = c.adjuntos;
      return { tipo: "oferta", resumen: "Cotizó en el PDF", ofertas: [oferta({ tarifa: 4350, cita: "cotizacion.pdf: MTY-ALBANY 4,350" })], dudas: [] };
    });
    expect(enviados).toEqual([pdf]);
    expect(r.body).toMatchObject({ lectura: { tipo: "oferta", ofertas: [{ tarifa: 4350, dudas: ["La tarifa sale del archivo adjunto: compárala con el archivo antes de guardar."] }] } });
  });

  it("basta el archivo, sin texto", async () => {
    const r = await leerRespuesta({ ...base, texto: "", adjuntos: [pdf] }, true, async () => ({ tipo: "otro", resumen: "", ofertas: [], dudas: [] }));
    expect(r.status).toBe(200);
  });

  it("rechaza otros formatos, base64 inválido, más de cuatro y más de 3 MB", async () => {
    const leer: Leer = async () => ({});
    const mal = async (adjuntos: unknown[]) => (await leerRespuesta({ ...base, adjuntos }, true, leer)).body;
    expect(await mal([{ ...pdf, tipo: "application/vnd.ms-excel" }])).toMatchObject({ code: "ADJUNTOS_INVALIDOS" });
    expect(await mal([{ ...pdf, base64: "no es base64!" }])).toMatchObject({ code: "ADJUNTOS_INVALIDOS" });
    expect(await mal(Array(5).fill(pdf))).toMatchObject({ code: "ADJUNTOS_INVALIDOS" });
    expect(await mal([{ ...pdf, base64: "A".repeat(Math.ceil((MAX_BYTES_ADJUNTOS * 4) / 3) + 8) }])).toMatchObject({ code: "ADJUNTOS_GRANDES" });
  });
});

describe("cliente", () => {
  const nada = async () => ({ status: 200, body: {}, headers: {} });

  it("leerRespuesta manda la fecha de hoy y devuelve el borrador", async () => {
    let enviado: Record<string, unknown> = {};
    const lector: LectorRespuestas = async (body) => {
      enviado = body;
      return leerRespuesta(body, true, async () => ({ tipo: "rechazo", resumen: "Sin unidades", ofertas: [], dudas: [] }));
    };
    const api = new MesaApi(nada, () => "2026-11-13", undefined, undefined, lector);
    await expect(api.leerRespuesta({ texto: "No tenemos unidades", canal: "whatsapp", carrier: "ACME", rutas })).resolves.toMatchObject({ tipo: "rechazo" });
    expect(enviado).toMatchObject({ hoy: "2026-11-13", canal: "whatsapp" });
  });

  it("en el simulado no hay IA: avisa y no inventa", async () => {
    const api = new MesaApi(nada);
    await expect(api.leerRespuesta({ texto: correo, canal: "email", carrier: "ACME", rutas })).rejects.toMatchObject({ code: "IA_NO_CONFIGURADA" });
  });

  it("la captura confirmada deja dicho que la leyó la IA", async () => {
    const llamadas: any[] = [];
    const api = new MesaApi(async (_f: any, body: any) => {
      llamadas.push(body);
      return { status: 200, body: {}, headers: {} };
    });
    await api.capturarOferta({ eventId: "e", participacionId: "p", tarifa: 1250, moneda: "USD", vigencia: null, capacidadSemanal: null, diasTransito: null, canal: "email", notas: "Cruce incluido", leidaConIA: true });
    expect(llamadas[0].patch).toMatchObject({ bid_rate: 1250, capture_source: "manual_operator", manual_source_channel: "email", source_note: "Captured from Email (read by AI, confirmed by operator): Cruce incluido" });
  });
});
