// Cadencia de seguimiento por falta de profundidad (regla de Jose, 23-oct-2026).

import { describe, expect, it } from "vitest";
import { claveIntento, intentosPorPreparar, intentosWhatsapp, numeroWhatsapp, LIMITE_TEXTO_INTENTO, rutasSinProfundidad, seguimiento, siguienteIntento, textoIntento } from "../src/dominio/seguimiento";
import { aviso } from "../src/cliente/mapear";
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
    evento: { id: "e", folio: "RFx-1021-PRIMAPro", nombre: "Prima", shipper: "PRIMA", estado: "abierto", plazo: "2026-12-31", prueba: false },
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

  it("quien respondió por correo o WhatsApp sin ofertar no recibe más intentos", () => {
    const sunline = { ...part("sun"), estado: "respondio" as const };
    const d = detalle([...parts, sunline], [...avisos, invitacion("sun", ENVIO)]);
    expect(seguimiento(d, "2026-10-23").find((x) => x.carrierId === "c-sun")?.estado).toBe("respondio");
    expect(de(d, "sun", horas(8))).toBeNull();
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
    const texto = textoIntento(d, d.rutas[0], { intento: 2 });
    expect(texto.length).toBeLessThanOrEqual(LIMITE_TEXTO_INTENTO);
    expect(texto).toContain("San Luis Potosí → Tulsa");
    expect(texto).not.toMatch(/token=/);
    expect(claveIntento("e", "a", 2)).toBe(claveIntento("e", "a", 2));
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
    // Quien ya respondió (R2) no aparece; quien ofertó tampoco.
    expect(w.map((x) => x.s.carrierId)).toEqual(["c-a", "c-b", "c-c"]);
    const [a, b, c] = w;
    expect(a.numero).toBe("528112345678");
    expect(a.liga).toMatch(/^https:\/\/wa\.me\/528112345678\?text=/);
    expect(a.texto).toContain("RFx-1021-PRIMAPro");
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
});
