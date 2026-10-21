// Proyección de la oportunidad adjudicada hacia Loads (loads.awarded-opportunity.v1,
// contrato C4 pendiente). Hoy Loads lee las mismas filas de Rateware; esta
// proyección fija qué es seguro mostrar al carrier: nada de tokens ni de otros
// carriers, y solo con recibo (I8, L1).

import { primario, versionVigente } from "./recorrido";
import type { Detalle } from "./tipos";

export interface ProyeccionLoads {
  version_contrato: "loads.awarded-opportunity.v1";
  folio: string;
  ruta: string;
  equipo: string;
  rol: "primario" | "respaldo";
  tarifa_acordada: number;
  moneda: string;
  carrier_id: string;
  entregada_en: string;
}

export function proyeccionLoads(d: Detalle, participacionId: string): ProyeccionLoads | null {
  for (const ruta of d.rutas) {
    const p = ruta.participaciones.find((x) => x.id === participacionId);
    if (!p || !p.rol || !p.entregadaEn) continue;
    if (p.rol === "primario" && primario(ruta)?.id !== p.id) continue;
    const v = p.versiones.find((x) => x.numero === p.adjudicada?.numero) ?? versionVigente(p);
    if (!v) return null;
    return {
      version_contrato: "loads.awarded-opportunity.v1",
      folio: d.evento.folio,
      ruta: `${ruta.origen} → ${ruta.destino}`,
      equipo: ruta.equipo,
      rol: p.rol,
      tarifa_acordada: v.tarifaAllIn,
      moneda: v.moneda,
      carrier_id: p.carrierId,
      entregada_en: p.entregadaEn
    };
  }
  return null;
}
