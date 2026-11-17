// Cadencia de seguimiento por falta de profundidad (regla de Jose, 23-oct-2026).

import { describe, expect, it } from "vitest";
import { candidatosRecordatorio, claveIntento, etiquetaSeguimiento, intentosPorPreparar, intentosWhatsapp, numeroWhatsapp, LIMITE_TEXTO_INTENTO, rutasSinProfundidad, seguimiento, siguienteIntento, textoIntento } from "../src/dominio/seguimiento";
import { aviso } from "../src/cliente/mapear";
import { bloqueoIntentos } from "../src/dominio/acciones-mesa";
import { MOTIVO_SIN_AVISOS, eventoSinAvisos } from "../src/dominio/protegidos";
import type { Aviso, Detalle, Participacion } from "../src/dominio/tipos";

const ENVIO = "2026-10-22T15:13:00.000Z";
const horas = (h: number) => new Date(Date.parse(ENVIO) + h * 3_600_000);

function part(id: string, conOferta = false): Participacion {
  return {
    id, carrierId: `c-${id}`, carrier: `Carrier ${id}`, correo: `${id}@x.mx`, carrierBloqueado: false,
    estado: conOferta ? "respondio" : "invitada", rubros: {}, condiciones: {},
    versiones: conOferta
      ? [{ numero: 1, tarifaAllIn: 6000, moneda: "USD", modeloComercial: "brokerage", carrierSharePct: null, margenPct: null, capacidadSemanal: null, transitoDias: null, vigenteHasta: "2026-12-31", esFinal: false, fuente: "portal_carrier", actor: id, nota: null, creadaEn: ENVIO, huella: "h" }]
      : [],
    rol: null, motivo: null, adjudicada: null, entregadaEn: null, vistaEn: null, respondioEn: null
  };
}

function invitacion(p: string, enviadoEn: string, n = 1): Aviso {
  return {
    id: `m-${p}-${n}`, tipo: "invitacion", participacionId: p, participaciones: [p], resultado: null, canal: "gmail",
    destinatario: `${p}@x.mx`, asunto: "RFx", cuerpo: "", huella: "h", version: enviadoEn, estado: "aceptado",
    reciboProveedor: "gm", motivo: null, enviadoEn
  };
}

function detalle(parts: Participacion[], avisos: Aviso[]): Detalle {
  return {
    evento: { id: "e", folio: "RFx-1030-Flatbed", nombre: "Prima", shipper: "PRIMA", estado: "abierto", plazo: "2026-12-31", prueba: false },
    rutas: [{ id: "r1", numero: 1, origen: "San Luis Potosí", destino: "Tulsa", equipo: "Flatbed 53'", volumenSemanal: 2, objetivo: 5000, moneda: "USD", desiertaMotivo: null, condiciones: [], participaciones: parts }],
    avisos,
    recibo: null
  } as Detalle;
}

const de = (d: Detalle, id: string, ahora: Date) => siguienteIntento(d, seguimiento(d, "2026-10-23").find((x) => x.carrierId === `c-${id}`)!, ahora);

describe("cadencia por falta de profundidad", () => {
  const parts = [part("ms", true), part("a"), part("b")];
  const avisos = [invitacion("ms", ENVIO), invitacion("a", ENVIO), invitacion("b", ENVIO)];

  it("con 1 oferta falta profundidad; el 2º intento toca a las 8 h y no a quien ya ofertó", () => {
    const d = detalle(parts, avisos);
    expect(rutasSinProfundidad(d).map((x) => x.ofertas)).toEqual([1]);
    expect(de(d, "a", horas(7))).toMatchObject({ intento: 2, canal: "correo", tocaEn: horas(8).toISOString(), vencido: false });
    expect(de(d, "a", horas(8))?.vencido).toBe(true);
    expect(de(d, "ms", horas(8))).toBeNull();
  });

  it("el 3º cuenta 12 h desde el 2º envío y después va WhatsApp; luego se agota", () => {
    const dos = detalle(parts, [...avisos, invitacion("a", horas(10).toISOString(), 2)]);
    expect(de(dos, "a", horas(21))).toMatchObject({ intento: 3, tocaEn: horas(22).toISOString(), vencido: false });
    const tres = detalle(parts, [...dos.avisos, invitacion("a", horas(22).toISOString(), 3)]);
    expect(de(tres, "a", horas(40))).toMatchObject({ intento: 4, canal: "whatsapp", vencido: true });
    const cuatro = detalle(parts, [...tres.avisos, invitacion("a", horas(41).toISOString(), 4)]);
    expect(de(cuatro, "a", horas(60))).toBeNull();
  });

  it("con profundidad suficiente o evento cerrado no hay siguiente intento", () => {
    const llena = detalle([part("x", true), part("y", true), part("z", true), part("a")], [invitacion("a", ENVIO)]);
    expect(rutasSinProfundidad(llena)).toEqual([]);
    expect(de(llena, "a", horas(30))).toBeNull();
    const cerrado = detalle(parts, avisos);
    cerrado.evento.estado = "cerrado";
    expect(de(cerrado, "a", horas(30))).toBeNull();
  });

  it("quien respondió sin tarifa no entra a la cadencia de 8/12 h", () => {
    const sunline = { ...part("sun"), estado: "respondio" as const };
    const d = detalle([...parts, sunline], [...avisos, invitacion("sun", ENVIO)]);
    expect(seguimiento(d, "2026-10-23").find((x) => x.carrierId === "c-sun")?.estado).toBe("respondio");
    // El plazo (31-dic) está lejos: aún no toca su recordatorio antes del cierre.
    expect(de(d, "sun", horas(8))).toMatchObject({ antesDelCierre: 48, vencido: false });
    expect(intentosPorPreparar(d, horas(8), "2026-10-23").map((x) => x.participacion.id).sort()).toEqual(["a", "b"]);
  });

  it("la respuesta por correo o chat del Bid Room que ve Rateware (R2) corta los intentos sola", () => {
    const base = detalle(parts, avisos);
    const d: Detalle = { ...base, respuestas: { a: { participacionId: "a", canales: ["correo"], primeraEn: "2026-10-22T20:00:00.000Z", ultimaEn: "2026-10-22T20:00:00.000Z" } } };
    const a = seguimiento(d, "2026-10-23").find((x) => x.carrierId === "c-a");
    expect(a?.estado).toBe("respondio");
    expect(a?.respondioPor).toEqual(["correo"]);
    expect(intentosPorPreparar(d, horas(8), "2026-10-23").map((x) => x.participacion.id)).toEqual(["b"]);
    // Si no se pudo revisar, no se prepara nada.
    expect(intentosPorPreparar({ ...base, respuestas: null }, horas(8), "2026-10-23")).toEqual([]);
  });

  it("prepara el intento solo a quien ya le toca y no tiene borrador en la Cola", () => {
    const d = detalle(parts, avisos);
    expect(intentosPorPreparar(d, horas(7), "2026-10-23")).toEqual([]);
    expect(intentosPorPreparar(d, horas(8), "2026-10-23").map((x) => x.participacion.id).sort()).toEqual(["a", "b"]);
    const borrador = { ...invitacion("a", ENVIO, 2), estado: "borrador" as const, enviadoEn: null };
    const conCola = detalle(parts, [...avisos, borrador]);
    expect(intentosPorPreparar(conCola, horas(8), "2026-10-23").map((x) => x.participacion.id)).toEqual(["b"]);
    expect(de(conCola, "a", horas(8))?.enCola).toBe(true);
    const texto = textoIntento(d, { intento: 2 });
    expect(texto.length).toBeLessThanOrEqual(LIMITE_TEXTO_INTENTO);
    // Es del bid completo: cuenta las rutas del evento y no nombra una sola.
    expect(texto).toContain(d.rutas.length === 1 ? "la ruta" : `las ${d.rutas.length} rutas`);
    expect(textoIntento({ ...d, rutas: [d.rutas[0], d.rutas[0], d.rutas[0]] }, { intento: 2 })).toContain("las 3 rutas");
    expect(texto).not.toContain("→");
    expect(textoIntento(d, { intento: 3 })).toMatch(/^Último aviso/);
    expect(texto).not.toMatch(/token=/);
    expect(claveIntento("e", "a", 2)).toBe(claveIntento("e", "a", 2));
    // No choca con las claves del seguimiento por ruta (sin sufijo), ya archivadas.
    expect(claveIntento("e", "a", 2)).toBe("fr8bid-intento-2-e-a-bid");
    expect(claveIntento("e", "a", 2).startsWith("fr8bid-intento-")).toBe(true);
  });

  it("el 4º intento abre WhatsApp con número y texto; sin número o «no contactar» no hay liga", () => {
    const tres = (id: string, extra: Partial<Aviso> = {}) => [
      { ...invitacion(id, ENVIO), ...extra },
      invitacion(id, horas(10).toISOString(), 2),
      invitacion(id, horas(22).toISOString(), 3)
    ];
    const d = detalle(
      [part("ms", true), part("a"), part("b"), part("c"), part("sun")],
      [
        invitacion("ms", ENVIO),
        ...tres("a", { whatsapp: "(81) 1234-5678" }),
        ...tres("b"),
        ...tres("c", { whatsapp: "+1 918 555 0101", whatsappNoContactar: true }),
        ...tres("sun", { whatsapp: "8112345679" })
      ]
    );
    d.respuestas = { sun: { participacionId: "sun", canales: ["correo"], primeraEn: ENVIO, ultimaEn: ENVIO } };
    expect(intentosWhatsapp(d, horas(33), "2026-10-23")).toEqual([]);
    const w = intentosWhatsapp(d, horas(34), "2026-10-23");
    // Quien respondió sin tarifa (R2) no recibe WhatsApp; quien ofertó tampoco.
    expect(w.map((x) => x.s.carrierId)).toEqual(["c-a", "c-b", "c-c"]);
    const [a, b, c] = w;
    expect(a.numero).toBe("528112345678");
    expect(a.liga).toMatch(/^https:\/\/wa\.me\/528112345678\?text=/);
    expect(a.texto).toContain("RFx-1030-Flatbed");
    expect(a.texto).toContain("San Luis Potosí → Tulsa");
    expect(a.texto).not.toMatch(/token=|https?:/);
    expect(b).toMatchObject({ liga: null, motivo: "sin número de WhatsApp en Rateware" });
    expect(c).toMatchObject({ liga: null, numero: null, motivo: "marcado «no contactar por WhatsApp» en Rateware" });
    // Sin la revisión de respuestas no se ofrece nada.
    expect(intentosWhatsapp({ ...d, respuestas: null }, horas(34), "2026-10-23")).toEqual([]);
  });

  it("normaliza el número como rateware-api", () => {
    expect(numeroWhatsapp("81 1234 5678")).toBe("528112345678");
    expect(numeroWhatsapp("+1 (918) 555-0101")).toBe("19185550101");
    expect(numeroWhatsapp("+52 1 81 1234 5678")).toBe("5218112345678");
    expect(numeroWhatsapp("12345")).toBeNull();
    expect(numeroWhatsapp(null)).toBeNull();
  });

  it("toma el WhatsApp del vendor que list_outreach_messages trae con cada mensaje", () => {
    const m = { id: "m1", rfx_lane_vendor_id: "a", status: "sent", metadata: { notice_type: "rfx_invitation" }, vendors: { vendor_name: "A", whatsapp_phone: "8112345678", whatsapp_do_not_contact: false } };
    expect(aviso(m)).toMatchObject({ whatsapp: "8112345678", whatsappNoContactar: false });
    expect(aviso({ ...m, vendors: null })).toMatchObject({ whatsapp: null, whatsappNoContactar: false });
  });

  // Regla de Jose (16-nov-2026): quien respondió sin tarifa sigue en la cadencia,
  // con un recordatorio 48 h y 24 h antes del cierre (23:59 de México del plazo).
  describe("respondió sin tarifa: recordatorio antes del cierre", () => {
    const CIERRE = Date.parse("2026-12-31T23:59:00-06:00");
    const antes = (h: number) => new Date(CIERRE - h * 3_600_000);
    const conRespuesta = (extra: Aviso[] = []) => {
      const d = detalle(parts, [...avisos, ...extra]);
      // «a» contestó por correo preguntando volumen: sin bid_rate.
      d.respuestas = { a: { participacionId: "a", canales: ["correo"], primeraEn: ENVIO, ultimaEn: ENVIO } };
      return d;
    };
    const ids = (d: Detalle, ahora: Date) => intentosPorPreparar(d, ahora, "2026-12-29").map((x) => x.participacion.id).sort();

    it("sigue mostrándose como «respondió sin tarifa»", () => {
      const s = seguimiento(conRespuesta(), "2026-12-29").find((x) => x.carrierId === "c-a")!;
      expect(s.estado).toBe("respondio");
      expect(etiquetaSeguimiento(s)).toBe("respondió sin tarifa por correo");
      expect(etiquetaSeguimiento({ ...s, respondioPor: [] })).toBe("respondió sin tarifa");
    });

    it("aparece 48 h antes del cierre con el texto de recordatorio y no fuera de esa ventana", () => {
      const d = conRespuesta();
      expect(de(d, "a", antes(49))).toMatchObject({ antesDelCierre: 48, vencido: false, tocaEn: antes(48).toISOString() });
      expect(ids(d, antes(49))).not.toContain("a");
      const [x] = intentosPorPreparar(d, antes(47), "2026-12-29").filter((y) => y.participacion.id === "a");
      expect(x.paso).toMatchObject({ antesDelCierre: 48, canal: "correo", vencido: true });
      const texto = textoIntento(d, x.paso);
      expect(texto).toMatch(/^Gracias por su respuesta\./);
      expect(texto).toContain("vence el 31 de diciembre de 2026 a las 23:59");
      expect(texto).toContain("RFx-1030-Flatbed");
      expect(texto).toContain("«Abrir Private Bid Room»");
      expect(texto.length).toBeLessThanOrEqual(LIMITE_TEXTO_INTENTO);
      expect(claveIntento("e", "a", x.paso.intento, x.paso.antesDelCierre)).toBe("fr8bid-intento-cierre-48h-e-a-bid");
    });

    it("ya enviado el de 48 h, vuelve a aparecer 24 h antes con «Último recordatorio»", () => {
      const d = conRespuesta([invitacion("a", antes(46).toISOString(), 2)]);
      expect(ids(d, antes(30))).not.toContain("a");
      expect(de(d, "a", antes(30))).toMatchObject({ antesDelCierre: 24, vencido: false });
      const [x] = intentosPorPreparar(d, antes(20), "2026-12-30").filter((y) => y.participacion.id === "a");
      expect(x.paso).toMatchObject({ antesDelCierre: 24, vencido: true, intento: 3 });
      expect(textoIntento(d, x.paso)).toMatch(/^Último recordatorio: el plazo para cotizar RFx-1030-Flatbed vence el 31 de diciembre de 2026/);
      // Claves distintas entre sí y de los intentos 2 y 3 de la cadencia.
      const claves = [claveIntento("e", "a", 3, 24), claveIntento("e", "a", 2, 48), claveIntento("e", "a", 2), claveIntento("e", "a", 3)];
      expect(new Set(claves).size).toBe(4);
      expect(claves.every((c) => c.startsWith("fr8bid-intento-"))).toBe(true);
      // Ya enviado el de 24 h: se acaba.
      const fin = conRespuesta([invitacion("a", antes(46).toISOString(), 2), invitacion("a", antes(20).toISOString(), 3)]);
      expect(de(fin, "a", antes(10))).toBeNull();
      expect(ids(fin, antes(10))).not.toContain("a");
    });

    it("si nadie mandó el de 48 h, dentro de las últimas 24 h solo toca el de 24 h", () => {
      expect(de(conRespuesta(), "a", antes(5))).toMatchObject({ antesDelCierre: 24, vencido: true });
    });

    it("con el plazo vencido o sin plazo no hay nada", () => {
      const d = conRespuesta();
      expect(de(d, "a", new Date(CIERRE))).toBeNull();
      expect(de(d, "a", new Date(CIERRE + 3_600_000))).toBeNull();
      expect(ids(d, new Date(CIERRE + 3_600_000))).not.toContain("a");
      const sinPlazo = conRespuesta();
      sinPlazo.evento.plazo = null;
      expect(de(sinPlazo, "a", antes(30))).toBeNull();
    });

    it("con oferta o declinado sale de la cadencia", () => {
      const oferta = detalle([part("ms", true), part("a", true), part("b")], avisos);
      oferta.respuestas = { a: { participacionId: "a", canales: ["correo"], primeraEn: ENVIO, ultimaEn: ENVIO } };
      expect(seguimiento(oferta, "2026-12-30").find((x) => x.carrierId === "c-a")?.estado).toBe("oferto");
      expect(de(oferta, "a", antes(20))).toBeNull();
      const declino = detalle([part("ms", true), { ...part("a"), estado: "declino" as const }, part("b")], avisos);
      expect(de(declino, "a", antes(20))).toBeNull();
      expect(intentosPorPreparar(declino, antes(20), "2026-12-30").map((x) => x.participacion.id)).not.toContain("a");
    });

    it("la cadencia normal de quien no ha respondido no cambia", () => {
      const d = conRespuesta();
      expect(de(d, "b", horas(8))).toMatchObject({ intento: 2, canal: "correo", antesDelCierre: null, horasDesdeAnterior: 8, vencido: true });
      expect(ids(d, horas(8))).toEqual(["b"]);
      expect(textoIntento(d, { intento: 2, antesDelCierre: null })).toMatch(/^Seguimos buscando/);
      expect(claveIntento("e", "b", 2, null)).toBe("fr8bid-intento-2-e-b-bid");
    });
  });

  // Decisión del propietario (17-nov-2026): PRIMA no recibe ningún recordatorio ni aviso.
  describe("PRIMA (RFx-1021-PRIMAPro): sin avisos", () => {
    const prima = (respondio = false) => {
      const d = detalle(parts, avisos);
      d.evento.folio = "RFx-1021-PRIMAPro";
      d.respuestas = respondio ? { a: { participacionId: "a", canales: ["correo"], primeraEn: ENVIO, ultimaEn: ENVIO } } : {};
      return d;
    };
    const CIERRE = Date.parse("2026-12-31T23:59:00-06:00");

    it("se identifica por folio sin importar mayúsculas", () => {
      expect(eventoSinAvisos({ folio: " rfx-1021-primapro " })).toBe(true);
      expect(eventoSinAvisos({ folio: "RFx-1030-Flatbed" })).toBe(false);
      expect(eventoSinAvisos(null)).toBe(false);
    });

    it("ni 2º/3º intento ni WhatsApp", () => {
      const d = prima();
      for (const h of [8, 22, 40]) expect(de(d, "a", horas(h))).toBeNull();
      expect(intentosPorPreparar(d, horas(40), "2026-10-24")).toEqual([]);
      expect(intentosWhatsapp(d, horas(40), "2026-10-24")).toEqual([]);
      expect(candidatosRecordatorio(d, "2026-10-24")).toEqual([]);
      expect(bloqueoIntentos(d)).toBe(`${MOTIVO_SIN_AVISOS}.`);
    });

    it("ni recordatorio 48 h ni 24 h a quien respondió sin tarifa", () => {
      const d = prima(true);
      for (const h of [47, 20]) {
        const ahora = new Date(CIERRE - h * 3_600_000);
        expect(de(d, "a", ahora)).toBeNull();
        expect(intentosPorPreparar(d, ahora, "2026-12-30")).toEqual([]);
      }
    });
  });
});
