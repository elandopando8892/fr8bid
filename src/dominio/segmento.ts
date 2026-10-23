// Sugerencia por historial del segmento (idea 7 de la sesión Codex, con el
// criterio de Jose del 23-oct). Cuenta solo tarifas aprobadas en Rateware que
// cumplan las tres condiciones del segmento de la ruta:
// - la misma familia de caja (flatbed incluye stepdeck, open deck y hazmat);
// - la misma operación puerta a puerta (D2D Export o D2D Import);
// - origen y destino en países distintos, sin ciudad de frontera en ninguno.
// Los tramos a frontera (MX Northbound/Southbound) y lo Intra-Mex no cuentan.
// No confirma el equipo: es la evidencia «solo tarifa», que Jose valida.
// Solo lectura (list_rateware).

import { notaDe, type TipoNota } from "./notasCarrier.js";
import { estadoRevision } from "./revision.js";
import type { Detalle, Ruta } from "./tipos.js";

export type FamiliaCaja = "flatbed" | "dry_van" | "reefer";

// Etiquetas de caja que usa rate_staging para cada familia (filtro exacto de
// list_rateware). La regla real es familiaCaja(); esto solo acota la consulta.
export const CAJAS_FAMILIA: Record<FamiliaCaja, string[]> = {
  flatbed: ["Flatbed", "Flatbed - Hazmat", "Flatbed 53'", "Flatbed 48'", "Stepdeck", "Step Deck", "Open Deck", "Conestoga"],
  dry_van: ["Dry Van", "Dry Van - Hazmat", "Dry Van 53'"],
  reefer: ["Reefer", "Reefer - Hazmat"]
};

export const OPERACIONES_D2D = ["D2D Export", "D2D Import"];
export const POR_PAGINA = 1000;
export const MAX_PAGINAS = 3;

const FRONTERA = /laredo|reynosa|pharr|mcallen|eagle pass|piedras negras|el paso|ju[aá]rez|brownsville|matamoros|nogales|colombia|hidalgo|del rio|acu[ñn]a|otay|tijuana|calexico|mexicali|santa teresa/i;

export function familiaCaja(caja: unknown): FamiliaCaja | null {
  const t = String(caja || "").toLowerCase();
  if (/flat|step|open ?deck|plataforma|plana|conestoga/.test(t)) return "flatbed";
  if (/reefer|refri|termo/.test(t)) return "reefer";
  if (/dry|seca|\bvan\b/.test(t)) return "dry_van";
  return null;
}

export interface Segmento {
  familia: FamiliaCaja;
  operacion: string;
  estadoOrigen: string | null;
  estadoDestino: string | null;
}

// Segmento de una ruta del evento; null si no es D2D crossborder con una caja
// conocida (entonces no hay sugerencia, en lugar de una equivocada).
export function segmentoDeRuta(r: Ruta): Segmento | null {
  const s = r.segmento;
  if (!s) return null;
  const familia = familiaCaja(s.caja);
  if (!familia || !OPERACIONES_D2D.includes(s.operacion)) return null;
  if (!s.paisOrigen || !s.paisDestino || s.paisOrigen === s.paisDestino) return null;
  return { familia, operacion: s.operacion, estadoOrigen: s.estadoOrigen, estadoDestino: s.estadoDestino };
}

export const claveSegmento = (s: Segmento) => `${s.familia}|${s.operacion}`;

export function consultaSegmento(s: Segmento, pagina = 0) {
  return {
    action: "list_rateware",
    column_filters: { trailer: CAJAS_FAMILIA[s.familia], operation: [s.operacion] },
    limit: POR_PAGINA,
    offset: pagina * POR_PAGINA
  };
}

const txt = (x: unknown) => (x === null || x === undefined ? "" : String(x).trim());

export function cuentaParaSegmento(fila: Record<string, any>, s: Segmento): boolean {
  if (familiaCaja(fila.trailer) !== s.familia) return false;
  if (txt(fila.operation) !== s.operacion) return false;
  const po = txt(fila.origin_country).toUpperCase();
  const pd = txt(fila.destination_country).toUpperCase();
  if (!po || !pd || po === pd) return false;
  const lugares = [fila.origin, fila.destination, fila.origin_city, fila.destination_city, fila.normalized_origin, fila.normalized_destination].map(txt).join(" | ");
  return !FRONTERA.test(lugares);
}

export interface SugerenciaSegmento {
  clave: string; // vendor_id, o el dominio si la tarifa no tiene carrier ligado
  vendorId: string | null;
  nombre: string;
  tarifas: number;
  mismoOrigen: number;
  mismoDestino: number;
  ejemplos: string[];
  ultima: string | null;
  inactivo: boolean;
  yaEnEvento: boolean;
  revisado: boolean;
  // Nota de Jose (notasCarrier.ts): manda sobre la tarifa.
  nota: { tipo: TipoNota; texto: string } | null;
}

export interface HistorialSegmento {
  segmento: Segmento;
  rutas: number[];
  sugerencias: SugerenciaSegmento[];
  // Con historial, pero Jose los descartó para esta caja; no se sugieren.
  descartados: SugerenciaSegmento[];
  filasLeidas: number;
  truncado: boolean;
}

const lugarCorto = (ciudad: unknown, estado: unknown, libre: unknown) =>
  [txt(ciudad), txt(estado)].filter(Boolean).join(", ") || txt(libre) || "—";

export function leerHistorialSegmento(d: Detalle, s: Segmento, filas: Record<string, any>[], truncado = false): HistorialSegmento {
  const enEvento = new Set(d.rutas.flatMap((r) => r.participaciones.map((p) => p.carrierId)));
  const porClave = new Map<string, SugerenciaSegmento & { rutasVistas: Map<string, number> }>();
  for (const f of filas) {
    if (!cuentaParaSegmento(f, s)) continue;
    const vendorId = txt(f.vendor_id) || null;
    const dominio = txt(f.vendor_domain).toLowerCase();
    const clave = vendorId || dominio;
    if (!clave) continue;
    const v = f.vendors && typeof f.vendors === "object" ? f.vendors : {};
    let x = porClave.get(clave);
    if (!x) {
      x = {
        clave,
        vendorId,
        nombre: txt(v.vendor_name) || dominio || "Carrier sin nombre",
        tarifas: 0,
        mismoOrigen: 0,
        mismoDestino: 0,
        ejemplos: [],
        ultima: null,
        inactivo: txt(v.status) === "inactive",
        yaEnEvento: !!vendorId && enEvento.has(vendorId),
        revisado: !!vendorId && estadoRevision(d, vendorId) === "revisado",
        nota: null,
        rutasVistas: new Map()
      };
      porClave.set(clave, x);
    }
    x.tarifas += 1;
    if (s.estadoOrigen && txt(f.origin_state).toUpperCase() === s.estadoOrigen.toUpperCase()) x.mismoOrigen += 1;
    if (s.estadoDestino && txt(f.destination_state).toUpperCase() === s.estadoDestino.toUpperCase()) x.mismoDestino += 1;
    const ruta = `${lugarCorto(f.origin_city, f.origin_state, f.origin)} → ${lugarCorto(f.destination_city, f.destination_state, f.destination)}`;
    x.rutasVistas.set(ruta, (x.rutasVistas.get(ruta) || 0) + 1);
    const fecha = txt(f.created_at).slice(0, 10) || null;
    if (fecha && (!x.ultima || fecha > x.ultima)) x.ultima = fecha;
  }
  const dominios = new Map<string, string>();
  for (const f of filas) if (f.vendor_id && f.vendor_domain) dominios.set(String(f.vendor_id), String(f.vendor_domain));
  const todas = [...porClave.values()]
    .map(({ rutasVistas, ...x }) => {
      const n = notaDe(s.familia, x.nombre, x.vendorId ? dominios.get(x.vendorId) || "" : x.clave);
      return {
        ...x,
        nota: n ? { tipo: n.tipo, texto: n.nota } : null,
        ejemplos: [...rutasVistas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r)
      };
    })
    .sort((a, b) => b.mismoDestino - a.mismoDestino || b.mismoOrigen - a.mismoOrigen || b.tarifas - a.tarifas || a.nombre.localeCompare(b.nombre));
  const rutas = d.rutas.filter((r) => {
    const sr = segmentoDeRuta(r);
    return sr && claveSegmento(sr) === claveSegmento(s);
  }).map((r) => r.numero);
  const sugerencias = todas.filter((x) => x.nota?.tipo !== "descartado");
  const descartados = todas.filter((x) => x.nota?.tipo === "descartado");
  return { segmento: s, rutas, sugerencias, descartados, filasLeidas: filas.length, truncado };
}

export const NOMBRE_FAMILIA: Record<FamiliaCaja, string> = { flatbed: "Flatbed / stepdeck", dry_van: "Caja seca", reefer: "Refrigerada" };
