// Envío por tandas (Bidware PACED_BATCH_SIZE): Gmail tiene cuota diaria y
// rateware-api acepta hasta 100 ids por llamada. Cada tanda lleva un
// operation_id derivado de sus avisos y versiones, así que reintentarla no
// duplica nada. Una tanda que no sale completa detiene las siguientes.

import { uuidDesde } from "./operacion.js";
import type { Aviso } from "./tipos.js";

export const TAMANO_TANDA = 50;
export const MAXIMO_POR_LLAMADA = 100;
export const ESPERA_ENTRE_TANDAS_MS = 60_000;

export function planearTandas(avisos: Aviso[], tamano = TAMANO_TANDA): Aviso[][] {
  const n = Math.max(1, Math.min(tamano, MAXIMO_POR_LLAMADA));
  const tandas: Aviso[][] = [];
  for (let i = 0; i < avisos.length; i += n) tandas.push(avisos.slice(i, i + n));
  return tandas;
}

export function operacionTanda(eventId: string, avisos: Pick<Aviso, "id" | "version">[]): string {
  return uuidDesde(["fr8bid.envio.v1", eventId, ...avisos.map((a) => `${a.id}:${a.version}`).sort()].join("\n"));
}

// Forma de send_outreach_messages (SendResult de Bidware).
export interface ResultadoEnvio {
  sent: number;
  failed: number;
  skipped: number;
  delivery_unknown: number;
  failures: { id: string; reason: string }[];
  skipped_rows: { id: string; reason: string }[];
}

export function leerResultado(body: any, ids: string[]): ResultadoEnvio {
  const lista = (x: unknown) => (Array.isArray(x) ? x.map((f: any) => ({ id: String(f?.id), reason: String(f?.reason || f?.error || "") })) : []);
  return {
    sent: Number(body?.sent ?? (Array.isArray(body?.rows) ? body.rows.filter((r: any) => r.status === "sent").length : ids.length)),
    failed: Number(body?.failed || 0),
    skipped: Number(body?.skipped || 0),
    delivery_unknown: Number(body?.delivery_unknown || 0),
    failures: lista(body?.failures),
    skipped_rows: lista(body?.skipped_rows)
  };
}

// Algo no salió como se pidió: se detiene y se revisa antes de seguir.
export function requiereAtencion(r: ResultadoEnvio, ids: string[]): boolean {
  return r.sent !== ids.length || r.failed > 0 || r.skipped > 0 || r.delivery_unknown > 0 || r.failures.length > 0 || r.skipped_rows.length > 0;
}

export function esCuota(motivo: string): boolean {
  return /daily_?cap|dailyLimitExceeded|rate_?limit|quota|429/i.test(motivo);
}
