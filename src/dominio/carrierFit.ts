// «Carrier fit» de Rateware: carriers sugeridos para las rutas del evento según
// su historial (cotizaciones en Rateware y ofertas en RFx anteriores). Fr8Bid
// no calcula nada: arma la misma consulta que el Bid Room
// (rfxCarrierRecommendationConfig en src/rfx-events.js) y muestra lo que
// rateware-api `carrier_recommendations` responde. Solo lectura.

import { estadoRevision } from "./revision.js";
import type { Detalle } from "./tipos.js";

export const LIMITE_SUGERENCIAS = 25;

export interface SugerenciaCarrier {
  vendorId: string;
  nombre: string;
  puntaje: number;
  porque: string;
  evidencia: string[];
  huecos: string[];
  cotizaciones: number;
  enProcurement: boolean;
  yaEnEvento: boolean;
  revisado: boolean;
}

export interface CarrierFit {
  sugerencias: SugerenciaCarrier[];
  avisos: string[];
}

export function configCarrierFit(d: Detalle) {
  const rutas = d.rutas;
  const texto = rutas.map((r) => [r.origen, r.destino, r.equipo].join(" ")).join(" ").toLowerCase();
  const lista = (xs: string[], max = 4) => [...new Set(xs.filter((x) => x && x !== "—"))].slice(0, max).join(" | ");
  return {
    limit: LIMITE_SUGERENCIAS,
    ranking_mode: "fit",
    rfx_carrier_fit: true,
    rfx_event_id: d.evento.id,
    evidence_timeout_ms: 3500,
    filters: {
      crossborder: /crossborder|border|d2d/.test(texto),
      d2d: false,
      equipment: lista(rutas.map((r) => r.equipo), 10),
      operation: "",
      service: "",
      origin: lista(rutas.map((r) => r.origen)),
      destination: lista(rutas.map((r) => r.destino))
    }
  };
}

const texto = (x: unknown) => (x === null || x === undefined ? "" : String(x));
const textos = (x: unknown) => (Array.isArray(x) ? x.map(texto).filter(Boolean) : []);

export function leerCarrierFit(d: Detalle, respuesta: Record<string, any>): CarrierFit {
  const enEvento = new Set(d.rutas.flatMap((r) => r.participaciones.map((p) => p.carrierId)));
  const sugerencias = (Array.isArray(respuesta?.recommendations) ? respuesta.recommendations : [])
    .map((r: Record<string, any>): SugerenciaCarrier => {
      const vendorId = texto(r.vendor_id);
      return {
        vendorId,
        nombre: texto(r.vendor_name) || "Carrier sin nombre",
        puntaje: Number(r.fit_score) || 0,
        porque: texto(r.why),
        evidencia: textos(r.evidence),
        huecos: textos(r.gaps),
        cotizaciones: Number(r.metrics?.linked_rates) || 0,
        enProcurement: r.base_stage === "procurement",
        yaEnEvento: enEvento.has(vendorId) || textos(r.duplicate_vendor_ids).some((id) => enEvento.has(id)),
        revisado: estadoRevision(d, vendorId) === "revisado"
      };
    })
    .filter((s: SugerenciaCarrier) => s.vendorId);
  return { sugerencias, avisos: textos(respuesta?.warnings) };
}
