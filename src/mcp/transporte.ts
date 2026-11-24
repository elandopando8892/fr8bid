import type { Transporte } from "../cliente/api.js";
import { LECTURAS } from "../servidor/proxy.js";

/** Solo el /api de ESTE recurso configurado; jamás usa Host/X-Forwarded-Host del cliente. */
export function transporteApi(resource: string, token: string, request: typeof fetch = fetch): Transporte {
  const endpoint = new URL("/api/rateware", resource);
  return async (servicio, body) => {
    if (servicio !== "rateware-api" || !LECTURAS[servicio].has(String(body.action))) throw new Error("Solo lectura");
    const response = await request(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(28000) });
    return { status: response.status, body: await response.json(), headers: {} };
  };
}

// Lista cerrada de escrituras del MCP (Entrega 2): subconjunto de ESCRITURAS del
// proxy. Fuera a propósito: adjudicar, limpiar adjudicación, entregar a Rateware y
// avisos de adjudicación (se hacen en la Mesa), además del alta genérica de eventos, importar
// rutas, preseleccionar, condiciones y marcar invitadas por otro canal. update_rfx_bid y
// update_rfx_event NO están: capturar, «ya respondió» y extender plazo van por las
// escrituras condicionales atómicas de Rateware (bid_rate IS NULL / due_date = el leído),
// para que dos confirmaciones concurrentes nunca pisen una oferta ni acorten un plazo.
export const ESCRITURAS_MCP = new Set([
  "create_rfx_event_draft",
  "draft_bid_room_carrier_message",
  "record_rfx_invitation_wave_review",
  "create_outreach_campaign",
  "generate_outreach_drafts",
  "send_outreach_messages",
  "capture_rfx_bid_if_empty",
  "mark_rfx_replied_if_empty",
  "extend_rfx_due_date_if_unchanged",
  "reopen_rfx_event_if_unchanged",
  // Intento/recordatorio por WhatsApp con la plantilla de Meta (rateware PR #215): borrador +
  // aprobación de 15 min y luego el envío con sus candados. Solo el propietario lo confirma.
  "prepare_whatsapp_rfx_reminder",
  "send_whatsapp_outreach_messages"
]);

/**
 * Transporte de escritura: el mismo /api/rateware (proxy con FR8BID_ESCRITURAS_REALES,
 * HDships fuera, sin reintentos), solo con lecturas y ESCRITURAS_MCP. Un fallo de red
 * no se reintenta: vuelve como 504 «incierta».
 */
export function transporteEscritura(resource: string, token: string, request: typeof fetch = fetch): Transporte {
  const endpoint = new URL("/api/rateware", resource);
  return async (servicio, body) => {
    const action = String(body.action);
    if (servicio !== "rateware-api" || !(LECTURAS[servicio].has(action) || ESCRITURAS_MCP.has(action))) throw new Error("Acción fuera del MCP");
    let response: Response;
    try {
      response = await request(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(28000) });
    } catch {
      return { status: 504, body: { code: "SIN_RESPUESTA", incierta: ESCRITURAS_MCP.has(action) }, headers: {} };
    }
    return { status: response.status, body: await response.json().catch(() => ({ code: "RESPUESTA_INVALIDA", incierta: ESCRITURAS_MCP.has(action) })), headers: {} };
  };
}
