// Propuesta al shipper (decisión de Jose, 25-nov-2026: «Publicar tras adjudicar»).
// Al adjudicar, la página del evento publica en la liga del shipper la tarifa de
// venta por ruta: la de la versión adjudicada al primario, con su modelo
// comercial. El shipper nunca ve el carrier ni su costo; solo ruta y venta.
//
// La calcula el servidor de Fr8Bid con una lectura fresca (proxy.ts), no la
// pantalla: lo que llega a Rateware sale siempre de aquí.

import { tarifaVenta } from "./modelo.js";
import { primario } from "./recorrido.js";
import type { Detalle } from "./tipos.js";

export interface LineaPropuesta {
  rutaId: string;
  numero: number;
  origen: string;
  destino: string;
  equipo: string;
  volumenSemanal: number | null;
  venta: number;
  moneda: string;
}

export interface FaltaPropuesta {
  numero: number;
  motivo: string;
}

export interface Propuesta {
  lineas: LineaPropuesta[];
  faltan: FaltaPropuesta[];
  moneda: string | null;
  /** Rutas declaradas desiertas: no van en la propuesta. */
  desiertas: number;
}

export function propuestaDelEvento(d: Detalle): Propuesta {
  const lineas: LineaPropuesta[] = [];
  const faltan: FaltaPropuesta[] = [];
  let desiertas = 0;
  for (const ruta of d.rutas) {
    if (ruta.desiertaMotivo) {
      desiertas += 1;
      continue;
    }
    const p = primario(ruta);
    if (!p) {
      faltan.push({ numero: ruta.numero, motivo: "sin primario" });
      continue;
    }
    const v = p.adjudicada ? p.versiones.find((x) => x.numero === p.adjudicada!.numero) : undefined;
    if (!v) {
      faltan.push({ numero: ruta.numero, motivo: "la versión adjudicada no se identifica" });
      continue;
    }
    const venta = tarifaVenta(v);
    if (!venta || !(venta.venta > 0)) {
      faltan.push({ numero: ruta.numero, motivo: "la oferta adjudicada no tiene modelo comercial" });
      continue;
    }
    lineas.push({
      rutaId: ruta.id,
      numero: ruta.numero,
      origen: ruta.origen,
      destino: ruta.destino,
      equipo: ruta.equipo,
      volumenSemanal: ruta.volumenSemanal,
      venta: venta.venta,
      moneda: (v.moneda || ruta.moneda || "USD").toUpperCase()
    });
  }
  const monedas = new Set(lineas.map((l) => l.moneda));
  if (monedas.size > 1) faltan.push({ numero: 0, motivo: `las rutas mezclan monedas (${[...monedas].join(" y ")})` });
  return { lineas, faltan, moneda: monedas.size === 1 ? [...monedas][0] : null, desiertas };
}

// Lo que Rateware recibe: id de la ruta y venta. Rateware toma origen, destino,
// equipo y volumen de su propia ruta y guarda solo eso.
export function lanesParaRateware(p: Propuesta) {
  return p.lineas.map((l) => ({ rfx_lane_id: l.rutaId, sell_rate: l.venta }));
}

export function textoFaltan(faltan: FaltaPropuesta[]): string {
  return faltan.map((f) => (f.numero ? `Ruta ${f.numero}: ${f.motivo}` : f.motivo)).join(" · ");
}

// Lo que el equipo ve de la propuesta publicada (get_rfx_shipper_proposal).
export interface PropuestaPublicada {
  id: string;
  version: number;
  moneda: string;
  vigenteHasta: string | null;
  publicadaEn: string | null;
  lineas: { rutaId: string; numero: number | null; origen: string; destino: string; venta: number }[];
  aceptadas: { rutaId: string; en: string; por: string | null }[];
}

export function leerPropuestaPublicada(crudo: any): { conSolicitud: boolean; propuesta: PropuestaPublicada | null } {
  const p = crudo?.proposal;
  return {
    conSolicitud: Boolean(crudo?.has_shipper_request),
    propuesta: p
      ? {
          id: String(p.id),
          version: Number(p.version) || 1,
          moneda: String(p.currency || "USD"),
          vigenteHasta: p.valid_through ?? null,
          publicadaEn: p.published_at ?? null,
          lineas: (Array.isArray(p.lanes) ? p.lanes : []).map((l: any) => ({
            rutaId: String(l.rfx_lane_id),
            numero: l.lane_number == null ? null : Number(l.lane_number),
            origen: String(l.origin ?? ""),
            destino: String(l.destination ?? ""),
            venta: Number(l.sell_rate)
          })),
          aceptadas: (Array.isArray(p.accepted) ? p.accepted : []).map((a: any) => ({
            rutaId: String(a.rfx_lane_id),
            en: String(a.accepted_at ?? ""),
            por: a.accepted_by_name ?? null
          }))
        }
      : null
  };
}
