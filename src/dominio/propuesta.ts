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

// Huella de lo que el Administrador revisó: rutas, términos, venta y moneda. Al publicar,
// el servidor la recalcula con una lectura fresca y rechaza si no coincide.
export function huellaPropuesta(p: Propuesta): string {
  const texto = JSON.stringify([
    p.moneda,
    [...p.lineas].sort((a, b) => a.rutaId.localeCompare(b.rutaId)).map((l) => [l.rutaId, l.venta, l.origen, l.destino, l.equipo, l.volumenSemanal])
  ]);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
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
  lineas: { rutaId: string; numero: number | null; origen: string; destino: string; equipo: string; volumenSemanal: number | null; venta: number }[];
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
            equipo: String(l.equipment ?? ""),
            volumenSemanal: l.weekly_volume == null ? null : Number(l.weekly_volume),
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

// Lo publicado frente a la adjudicación de hoy. La tabla del equipo siempre muestra
// lo publicado con lo aceptado; lo que cambió se muestra aparte. Cuenta como cambio
// cualquier dato que el shipper ve: ruta, equipo, volumen, venta o moneda.
export interface Comparacion {
  /** Rutas cuya venta o términos de hoy no son los publicados (o que no estaban publicadas). */
  cambios: { rutaId: string; numero: number; origen: string; destino: string; antes: number | null; ahora: number; moneda: string; terminos: boolean; aceptada: boolean }[];
  /** Rutas publicadas que hoy ya no van (desiertas o sin primario). */
  quitadas: { numero: number; aceptada: boolean }[];
  distinta: boolean;
  vencida: boolean;
  /** Una ruta que el shipper ya aceptó cambiaría: no se vuelve a publicar sin hablar con él. */
  tocaAceptadas: boolean;
  /** Publicar por primera vez, o volver a publicar para corregir rutas pendientes o renovar la vigencia. */
  puedePublicar: boolean;
}

export function compararPropuesta(calculada: Propuesta, publicada: PropuestaPublicada | null, hoy: string): Comparacion {
  const antes = new Map((publicada?.lineas ?? []).map((l) => [l.rutaId, l]));
  const aceptadas = new Set((publicada?.aceptadas ?? []).map((a) => a.rutaId));
  const hoyIds = new Set(calculada.lineas.map((l) => l.rutaId));
  const cambios = publicada
    ? calculada.lineas.flatMap((l) => {
        const a = antes.get(l.rutaId);
        const terminos = Boolean(a) && (a!.origen !== l.origen || a!.destino !== l.destino || (a!.equipo || "") !== (l.equipo || "") || (a!.volumenSemanal ?? null) !== (l.volumenSemanal ?? null));
        if (a && a.venta === l.venta && !terminos) return [];
        return [{ rutaId: l.rutaId, numero: l.numero, origen: l.origen, destino: l.destino, antes: a ? a.venta : null, ahora: l.venta, moneda: l.moneda, terminos, aceptada: aceptadas.has(l.rutaId) }];
      })
    : [];
  const quitadas = publicada ? publicada.lineas.filter((l) => !hoyIds.has(l.rutaId)).map((l) => ({ numero: l.numero ?? 0, aceptada: aceptadas.has(l.rutaId) })) : [];
  const otraMoneda = Boolean(publicada) && calculada.moneda !== null && calculada.moneda !== publicada!.moneda;
  const distinta = cambios.length > 0 || quitadas.length > 0 || otraMoneda;
  const vencida = Boolean(publicada?.vigenteHasta) && publicada!.vigenteHasta! < hoy;
  const tocaAceptadas = cambios.some((c) => c.aceptada) || quitadas.some((q) => q.aceptada) || (otraMoneda && aceptadas.size > 0);
  const lista = calculada.faltan.length === 0 && calculada.lineas.length > 0;
  return { cambios, quitadas, distinta, vencida, tocaAceptadas, puedePublicar: lista && !tocaAceptadas && (!publicada || distinta || vencida) };
}
