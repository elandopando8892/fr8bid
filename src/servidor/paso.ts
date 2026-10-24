// Paso de los módulos traídos de Bidware (/api/funcion): reenvía cada llamada a
// su Edge Function de rateware-prod desde el servidor de Fr8Bid (mismo origen,
// sin depender de la lista CORS de Rateware) con las reglas de Fr8Bid:
// - solo las funciones que usan esos módulos;
// - con FR8BID_ESCRITURAS_REALES distinto de «si», solo lecturas (y con
//   «borradores», además, los borradores de SOLO_BORRADORES);
// - HDships fuera de cualquier lectura o escritura (I12);
// - adjudicar, entregar a Rateware y avisar se hacen en la Mesa, que lleva los
//   candados; el estado «closed» nunca sale por update_rfx_event (es la entrega
//   completa sin operation_id).
// El rol lo sigue aplicando Rateware. La Mesa usa /api/rateware y /api/bid.

import { needOf } from "../bidware/lib/needs.js";
import { UUID_RATEWARE } from "../dominio/operacion.js";
import { EVENTOS_PROTEGIDOS, esProtegido } from "../dominio/protegidos.js";
import { SOLO_BORRADORES, type ModoEscrituras } from "./proxy.js";

export type Funcion =
  | "rateware-api"
  | "quotedesk-api"
  | "shipper-directory-api"
  | "interpret-upload"
  | "create-raw-upload"
  | "rfx-bid-api"
  | "carrier-profile-api"
  | "shipper-profile-api";

// «equipo»: con la sesión del equipo. «liga»: el token de la liga es la credencial.
export const FUNCIONES: Record<Funcion, "equipo" | "liga"> = {
  "rateware-api": "equipo",
  "quotedesk-api": "equipo",
  "shipper-directory-api": "equipo",
  "interpret-upload": "equipo",
  "create-raw-upload": "equipo",
  "rfx-bid-api": "liga",
  "carrier-profile-api": "liga",
  "shipper-profile-api": "liga"
};

// Lecturas de las funciones que roles.ts no clasifica.
const LECTURAS_LIGA: Partial<Record<Funcion, Set<string>>> = {
  "rfx-bid-api": new Set([
    "get_invitation",
    "list_bid_room_chat",
    "public_bid_room_board",
    "public_bid_room_find_invitations",
    "get_customer_rfi",
    "customer_rfi_search_locations"
  ]),
  "carrier-profile-api": new Set(["get_profile"]),
  "shipper-profile-api": new Set(["get_profile"])
};

export const EN_LA_MESA = new Set([
  "award_rfx_lane_vendor",
  "clear_rfx_award",
  "closeout_awarded_rfx_to_rateware",
  "generate_rfx_award_notices"
]);

const ESTADOS_DE_ENTREGA = new Set(["closed", "awarded"]);

export function esFuncion(fn: string): fn is Funcion {
  return Object.prototype.hasOwnProperty.call(FUNCIONES, fn);
}

export function esLectura(fn: Funcion, action: string, body: Record<string, unknown>): boolean {
  if (fn === "rateware-api" || fn === "quotedesk-api") return needOf(fn, action, body) === "read";
  if (fn === "shipper-directory-api") return true;
  return LECTURAS_LIGA[fn]?.has(action) ?? false;
}

export interface Llamada {
  fn: string;
  // JSON ya leído, o null cuando el cuerpo es multipart (create-raw-upload).
  json: Record<string, unknown> | null;
  autorizacion: string | null;
  modo: ModoEscrituras;
}

export interface Rechazo {
  status: number;
  body: { error: string; code: string; action?: string };
}

const rechazo = (status: number, code: string, error: string, action?: string): Rechazo => ({
  status,
  body: { error, code, ...(action ? { action } : {}) }
});

function mencionaProtegido(x: unknown): boolean {
  if (typeof x === "string") return [...EVENTOS_PROTEGIDOS].some((id) => x.toLowerCase().includes(id));
  if (Array.isArray(x)) return x.some(mencionaProtegido);
  if (x && typeof x === "object") return Object.entries(x).some(([k, v]) => esProtegido(k) || mencionaProtegido(v));
  return false;
}

// null = pasa. Lo demás se responde sin llamar a Rateware.
export function revisar(l: Llamada): Rechazo | null {
  if (!esFuncion(l.fn)) return rechazo(400, "FUNCION_NO_PERMITIDA", `Fr8Bid no usa la función «${l.fn || "vacía"}».`);
  const fn = l.fn;
  if (FUNCIONES[fn] === "equipo" && !l.autorizacion) return rechazo(401, "SIN_SESION", "Inicia sesión para continuar.");

  if (fn === "create-raw-upload") {
    // Guarda un archivo de tarifas (multipart): es escritura.
    if (l.modo !== "si") return rechazo(423, "ESCRITURA_NO_AUTORIZADA", "Escribir en Rateware real requiere la aprobación del propietario para esta acción.", "create_raw_upload");
    return null;
  }

  const body = l.json ?? {};
  const action = String(body.action || "");
  if (!action) return rechazo(400, "FALTA_ACCION", "Falta la acción.");
  if (mencionaProtegido(body)) return rechazo(404, "NOT_FOUND", "No encontrado.", action);

  const lectura = esLectura(fn, action, body);
  if (!lectura && l.modo !== "si") {
    const borrador = l.modo === "borradores" && fn === "rateware-api" && SOLO_BORRADORES["rateware-api"].has(action);
    if (!borrador)
      return rechazo(
        423,
        l.modo === "borradores" ? "SOLO_BORRADORES" : "ESCRITURA_NO_AUTORIZADA",
        l.modo === "borradores"
          ? "Fr8Bid está en modo «solo borradores»: este paso se hace en Rateware o con la aprobación del propietario."
          : "Escribir en Rateware real requiere la aprobación del propietario para esta acción.",
        action
      );
  }

  if (fn === "rateware-api" && EN_LA_MESA.has(action))
    return rechazo(409, "EN_LA_MESA", "Adjudicar, entregar a Rateware y avisar a los carriers se hacen en la Mesa del evento, con sus candados.", action);

  if (fn === "rateware-api" && action === "update_rfx_event") {
    const patch = body.patch && typeof body.patch === "object" ? (body.patch as Record<string, unknown>) : {};
    if (ESTADOS_DE_ENTREGA.has(String(patch.status ?? "").toLowerCase()))
      return rechazo(409, "CIERRE_POR_ENTREGA", "Cerrar el evento en Rateware es la entrega: hazlo desde la Mesa, que lleva su operation_id.", action);
  }

  if (body.operation_id != null && !UUID_RATEWARE.test(String(body.operation_id)))
    return rechazo(400, "OPERACION_INVALIDA", "El operation_id no es válido.", action);

  return null;
}

// HDships fuera de las respuestas: listas sin sus filas y sin claves con su id.
export function sinProtegidos(x: any): any {
  if (Array.isArray(x))
    return x
      .filter((e) => !(e && typeof e === "object" && [e.id, e.rfx_event_id, e.event_id].some(esProtegido)))
      .map(sinProtegidos);
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) if (!esProtegido(k)) out[k] = sinProtegidos(v);
    return out;
  }
  return x;
}

// Una respuesta que es el propio evento protegido no se entrega.
export function esRespuestaProtegida(x: any): boolean {
  return Boolean(x && typeof x === "object" && (esProtegido(x.event?.id) || esProtegido(x.row?.id) || esProtegido(x.row?.rfx_event_id)));
}
