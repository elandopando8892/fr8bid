// Cadencia de seguimiento por falta de profundidad (regla de Jose, 23-oct-2026).

import { describe, expect, it } from "vitest";
import { rutasSinProfundidad, seguimiento, siguienteIntento } from "../src/dominio/seguimiento";
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
});
