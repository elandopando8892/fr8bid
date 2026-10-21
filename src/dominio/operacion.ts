// operation_id de la entrega a Rateware. Se deriva del evento y de las
// decisiones exactas (participación, rol, huella de la versión adjudicada), así
// que cada reintento, aun tras recargar la página, usa el mismo id sin guardar
// nada fuera de Rateware. Si cambia una decisión, cambia el id.
//
// Formato: rateware-api (b11991f8) solo respeta un operation_id que cumpla
// UUID_PATTERN con versión 1–5 y variante 8–b; cualquier otro lo reemplaza por
// uno aleatorio y se pierde la idempotencia. Por eso se marca como versión 5.

import { sha256 } from "./huella.js";
import type { Detalle } from "./tipos.js";

export const UUID_RATEWARE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuidDesde(texto: string): string {
  const h = sha256(texto).slice(0, 32).split("");
  h[12] = "5";
  h[16] = "89ab"[parseInt(h[16], 16) & 3];
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export function decisionesDelEvento(detalle: Detalle): string[] {
  const filas: string[] = [];
  for (const ruta of detalle.rutas) {
    if (ruta.desiertaMotivo) filas.push(`${ruta.id}:desierta`);
    for (const p of ruta.participaciones) {
      if (!p.rol) continue;
      filas.push(`${ruta.id}:${p.id}:${p.rol}:${p.adjudicada?.huella ?? "sin-version"}`);
    }
  }
  return filas.sort();
}

export function operacionEntrega(detalle: Detalle): string {
  return uuidDesde(["fr8bid.entrega.v1", detalle.evento.id, ...decisionesDelEvento(detalle)].join("\n"));
}

// Idempotencia de la decisión (patrón rfx_award_operations): un doble clic o un
// reintento de la misma decisión sobre la misma versión no crea otra.
export function operacionAdjudicacion(eventId: string, participacionId: string, rol: string, huellaVersion: string): string {
  return uuidDesde(["fr8bid.adjudicacion.v1", eventId, participacionId, rol, huellaVersion].join("\n"));
}
