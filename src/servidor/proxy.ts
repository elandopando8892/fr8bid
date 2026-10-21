// Núcleo de las funciones /api de Vercel. Reenvía cada llamada a rateware-api
// o rfx-bid-api con el token del usuario (el rol lo sigue aplicando Rateware) y
// agrega lo que el recorrido exige de este lado:
// - solo acciones de la rebanada (lista cerrada);
// - ninguna escritura hacia Rateware real sin FR8BID_ESCRITURAS_REALES=si;
// - operation_id válido para la entrega (si no, Rateware pone uno aleatorio);
// - HDships fuera de cualquier lectura o escritura (I12);
// - tokens de liga fuera de las respuestas;
// - sin respuesta = 504 «incierta», nunca reintento automático.

import { detalle } from "../cliente/mapear";
import { UUID_RATEWARE } from "../dominio/operacion";
import { esProtegido } from "../dominio/protegidos";
import { candadosAdjudicacion, hoyMexico, puedeAdjudicar } from "../dominio/recorrido";

export type Servicio = "rateware-api" | "rfx-bid-api";

export interface Respuesta {
  status: number;
  body: any;
  headers: Record<string, string>;
}

export type Enviar = (servicio: Servicio, body: Record<string, unknown>, autorizacion: string | null) => Promise<Respuesta>;

export const LECTURAS: Record<Servicio, Set<string>> = {
  "rateware-api": new Set(["list_rfx_events", "list_rfx_detail", "list_outreach_messages"]),
  "rfx-bid-api": new Set(["get_invitation"])
};

export const ESCRITURAS: Record<Servicio, Set<string>> = {
  "rateware-api": new Set([
    "create_rfx_event",
    "import_rfx_lanes",
    "shortlist_rfx_lane_vendors",
    "update_rfx_event",
    "update_rfx_bid",
    "award_rfx_lane_vendor",
    "clear_rfx_award",
    "closeout_awarded_rfx_to_rateware",
    "generate_outreach_drafts",
    "generate_rfx_award_notices",
    "update_outreach_message",
    "mark_outreach_messages",
    "send_outreach_messages"
  ]),
  "rfx-bid-api": new Set(["submit_bid", "save_segment_confirmations", "decline_invitation"])
};

const CLAVES_SECRETAS = /^(invitation_token|token|invitation_token_ciphertext|invitation_token_digest|token_digest)$/i;

export function sinSecretos(x: any): any {
  if (Array.isArray(x)) return x.map(sinSecretos);
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) if (!CLAVES_SECRETAS.test(k)) out[k] = sinSecretos(v);
    return out;
  }
  return x;
}

function filtrarProtegidos(body: any): any {
  if (body && Array.isArray(body.events)) return { ...body, events: body.events.filter((e: any) => !esProtegido(e?.id)) };
  if (body?.event && esProtegido(body.event.id)) return null;
  return body;
}

export interface OpcionesProxy {
  enviar: Enviar;
  permitirEscrituras: boolean;
  timeoutMs?: number;
}

const error = (status: number, code: string, mensaje: string, extra: Record<string, unknown> = {}): Respuesta => ({
  status,
  body: { error: mensaje, code, ...extra },
  headers: {}
});

export async function manejar(
  servicio: Servicio,
  body: Record<string, unknown> | null,
  autorizacion: string | null,
  op: OpcionesProxy
): Promise<Respuesta> {
  const action = String(body?.action || "");
  const esLectura = LECTURAS[servicio].has(action);
  const esEscritura = ESCRITURAS[servicio].has(action);
  if (!esLectura && !esEscritura) return error(400, "ACCION_NO_PERMITIDA", `Fr8Bid no usa la acción «${action || "vacía"}».`);
  if (servicio === "rateware-api" && !autorizacion) return error(401, "SIN_SESION", "Inicia sesión para continuar.");
  if (servicio === "rfx-bid-api" && !body?.token) return error(404, "NOT_FOUND", "La liga no es válida.");

  for (const clave of ["event_id", "rfx_event_id", "id"]) {
    if (esProtegido(body?.[clave])) return error(404, "NOT_FOUND", "No encontrado.");
  }

  if (esEscritura && !op.permitirEscrituras) {
    return error(423, "ESCRITURA_NO_AUTORIZADA", "Escribir en Rateware real requiere la aprobación del propietario para esta acción.", { action });
  }

  if (action === "closeout_awarded_rfx_to_rateware" && !UUID_RATEWARE.test(String(body?.operation_id || ""))) {
    return error(400, "OPERACION_INVALIDA", "La entrega necesita un operation_id generado antes del primer intento.");
  }

  if (action === "award_rfx_lane_vendor") {
    const bloqueo = await guardaAdjudicacion(body!, autorizacion, op);
    if (bloqueo) return bloqueo;
  }

  let respuesta: Respuesta;
  try {
    respuesta = await conLimite(op.enviar(servicio, body!, autorizacion), op.timeoutMs ?? 25000);
  } catch {
    return error(504, "SIN_RESPUESTA", "Rateware no respondió. El resultado es incierto: no se reintenta solo.", {
      incierta: esEscritura,
      operation_id: body?.operation_id ?? null
    });
  }
  const filtrado = filtrarProtegidos(respuesta.body);
  if (filtrado === null) return error(404, "NOT_FOUND", "No encontrado.");
  return { status: respuesta.status, body: sinSecretos(filtrado), headers: respuesta.headers };
}

// I3/I4/D4 del lado del servidor: la interfaz muestra los candados, pero aquí
// se vuelven a comprobar con una lectura fresca antes de adjudicar. El rol lo
// comprueba Rateware (403), por eso aquí no cuenta.
async function guardaAdjudicacion(body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  if (!body.event_id) return error(400, "FALTA_EVENTO", "Adjudicar necesita event_id para comprobar los candados.");
  if (!String(body.award_reason || "").trim()) return error(400, "MOTIVO", "El motivo es obligatorio.");
  let lectura: Respuesta;
  try {
    lectura = await conLimite(op.enviar("rateware-api", { action: "list_rfx_detail", event_id: body.event_id }, autorizacion), op.timeoutMs ?? 25000);
  } catch {
    return error(504, "SIN_RESPUESTA", "No se pudieron comprobar los candados. No se adjudicó nada.");
  }
  if (lectura.status !== 200) return { ...lectura, body: sinSecretos(lectura.body) };
  const d = detalle(lectura.body);
  for (const ruta of d.rutas) {
    const p = ruta.participaciones.find((x) => x.id === body.rfx_lane_vendor_id);
    if (!p) continue;
    const rol = body.award_role === "backup" ? "respaldo" : "primario";
    const candados = candadosAdjudicacion(d, ruta, p, { rol: "admin", hoy: hoyMexico(), entrega: { estado: "sin_preparar", operationId: null, error: null } }, rol);
    if (puedeAdjudicar(candados, body.confirma_sin_vigencia === true)) return null;
    return error(409, "CANDADO", "La adjudicación no cumple los candados.", { candados: candados.filter((c) => !c.ok) });
  }
  return error(404, "NOT_FOUND", "La participación no pertenece a este evento.");
}

function conLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// Envío real: Edge Functions de rateware-prod, servidor a servidor.
export function enviarAEdgeFunctions(baseUrl: string, anonKey: string): Enviar {
  return async (servicio, body, autorizacion) => {
    const headers: Record<string, string> = { "content-type": "application/json", apikey: anonKey };
    if (autorizacion) headers.authorization = autorizacion;
    if (body.operation_id) headers["x-operation-id"] = String(body.operation_id);
    const r = await fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/${servicio}`, { method: "POST", headers, body: JSON.stringify(body) });
    const texto = await r.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = { error: "Respuesta no JSON de Rateware", code: "RESPUESTA_INVALIDA" };
    }
    const salida: Record<string, string> = {};
    for (const h of ["x-request-id", "x-operation-id"]) {
      const v = r.headers.get(h);
      if (v) salida[h] = v;
    }
    return { status: r.status, body: json, headers: salida };
  };
}
