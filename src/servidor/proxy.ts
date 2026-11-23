// Núcleo de las funciones /api de Vercel. Reenvía cada llamada a rateware-api
// o rfx-bid-api con el token del usuario (el rol lo sigue aplicando Rateware) y
// agrega lo que el recorrido exige de este lado:
// - solo acciones de la rebanada (lista cerrada);
// - ninguna escritura hacia Rateware real sin FR8BID_ESCRITURAS_REALES=si;
//   con «borradores» solo pasan las que dejan un borrador sin enviar;
// - operation_id válido para la entrega (si no, Rateware pone uno aleatorio);
// - HDships fuera de cualquier lectura o escritura (I12);
// - tokens de liga fuera de las respuestas;
// - sin respuesta = 504 «incierta», nunca reintento automático.

import { detalle } from "../cliente/mapear.js";
import { UUID_RATEWARE } from "../dominio/operacion.js";
import { paginaTarifario } from "../mcp/tarifario.js";
import { claveCampana, esPlantillaInvitacion } from "../dominio/invitacion.js";
import { esProtegido } from "../dominio/protegidos.js";
import { bloqueoDesierta, bloqueoReabrirRuta } from "../dominio/acciones-mesa.js";
import { candadosAdjudicacion, hoyMexico, puedeAdjudicar } from "../dominio/recorrido.js";
import { revisionesVigentes } from "../dominio/revision.js";
import { MAX_REGISTROS } from "../dominio/contactos.js";
import { CAJAS_FAMILIA, POR_PAGINA } from "../dominio/segmento.js";
import { MAXIMO_POR_LLAMADA } from "../dominio/tandas.js";

const CAJAS_SEGMENTO = new Set(Object.values(CAJAS_FAMILIA).flat());

function esConsultaSegmento(body: Record<string, unknown>) {
  const permitidas = new Set(["action", "column_filters", "limit", "offset"]);
  if (Object.keys(body).some((k) => !permitidas.has(k))) return false;
  const f = body.column_filters && typeof body.column_filters === "object" ? (body.column_filters as Record<string, unknown>) : null;
  if (!f || Object.keys(f).sort().join(",") !== "operation,trailer") return false;
  const cajas = f.trailer, ops = f.operation;
  if (!Array.isArray(cajas) || !cajas.length || !cajas.every((c) => CAJAS_SEGMENTO.has(String(c)))) return false;
  if (!Array.isArray(ops) || ops.length !== 1 || !["D2D Export", "D2D Import"].includes(String(ops[0]))) return false;
  const limit = Number(body.limit), offset = Number(body.offset ?? 0);
  return Number.isInteger(limit) && limit > 0 && limit <= POR_PAGINA && Number.isInteger(offset) && offset >= 0;
}

// Forma de uuid (el simulado usa prefijos legibles como «ven00000-…»).
const UUID = /^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/i;
const DOMINIO = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

function esConsultaContactos(body: Record<string, unknown>) {
  const permitidas = new Set(["action", "ids", "search", "lightweight", "limit"]);
  if (Object.keys(body).some((k) => !permitidas.has(k)) || body.lightweight !== true) return false;
  const limit = body.limit === undefined ? null : Number(body.limit);
  if (Array.isArray(body.ids)) {
    return body.search === undefined && body.ids.length > 0 && body.ids.length <= MAX_REGISTROS && body.ids.every((x) => UUID.test(String(x))) && (limit === null || (Number.isInteger(limit) && limit >= body.ids.length && limit <= MAX_REGISTROS));
  }
  return typeof body.search === "string" && DOMINIO.test(body.search) && Number.isInteger(limit) && limit! > 0 && limit! <= MAX_REGISTROS;
}

function esHistorialDeCarrier(body: Record<string, unknown>) {
  const permitidas = new Set(["action", "vendor_id", "limit", "offset"]);
  if (Object.keys(body).some((k) => !permitidas.has(k)) || !UUID.test(String(body.vendor_id || ""))) return false;
  const limit = Number(body.limit ?? 300), offset = Number(body.offset ?? 0);
  return Number.isInteger(limit) && limit >= 25 && limit <= 300 && Number.isInteger(offset) && offset === 0;
}

export type Servicio = "rateware-api" | "rfx-bid-api";

export interface Respuesta {
  status: number;
  body: any;
  headers: Record<string, string>;
}

export type Enviar = (servicio: Servicio, body: Record<string, unknown>, autorizacion: string | null) => Promise<Respuesta>;

export const LECTURAS: Record<Servicio, Set<string>> = {
  "rateware-api": new Set(["list_carrier_tariff_candidates", "preview_rfx_event_creation", "list_rfx_events", "list_rfx_detail", "list_rfx_segment_confirmations", "list_outreach_messages", "list_rfx_condition_catalog", "list_rfx_lane_conditions", "list_rfx_invitation_wave_reviews", "carrier_recommendations", "list_rateware", "list_rfx_carrier_replies", "get_rfx_carrier_reply", "list_rfx_reply_readings", "list_outreach_campaigns", "list_outreach_templates", "list_vendors", "list_contact_history", "list_carrier_list_templates", "get_carrier_list_template"]),
  "rfx-bid-api": new Set(["get_invitation"])
};

export const ESCRITURAS: Record<Servicio, Set<string>> = {
  "rateware-api": new Set([
    "create_rfx_event_draft",
    "create_rfx_event",
    "import_rfx_lanes",
    "shortlist_rfx_lane_vendors",
    "update_rfx_event",
    "update_rfx_bid",
    "invite_rfx_lane_vendors",
    "award_rfx_lane_vendor",
    "clear_rfx_award",
    "closeout_awarded_rfx_to_rateware",
    "generate_outreach_drafts",
    "generate_rfx_award_notices",
    "send_outreach_messages",
    "save_rfx_lane_conditions",
    // 2º y 3º intento: solo deja un borrador en la Cola de Rateware (no envía).
    "draft_bid_room_carrier_message",
    // Invitar desde la Mesa: campaña propia de Fr8Bid por evento y la marca
    // «Revisado» que antes se ponía en Bidware.
    "create_outreach_campaign",
    "record_rfx_invitation_wave_review",
    // MCP: escrituras condicionales atómicas (rateware PR #213). Solo escriben si la
    // participación sigue sin tarifa o si el plazo sigue igual al leído; si no, 409.
    "capture_rfx_bid_if_empty",
    "mark_rfx_replied_if_empty",
    "extend_rfx_due_date_if_unchanged",
    // MCP: intento/recordatorio por WhatsApp con plantilla de Meta (rateware PR #215). Rateware
    // revalida número, «no contactar», permiso y plantilla APROBADA contra Meta, y no repite
    // el mismo recordatorio; desde el MCP solo lo confirma el propietario.
    "prepare_whatsapp_rfx_reminder",
    "send_whatsapp_outreach_messages",
    // MCP: alta de un carrier en una lista (vendor_segments participant_template). Solo
    // vendor_ids y con expected_version: Rateware la aplica únicamente si la lista sigue
    // en esa versión (409 template_version_conflict si otro la cambió).
    "update_carrier_list_template",
    // Página del evento (bloque C del recorrido 22-nov), antes solo en «Detalle
    // completo»: archivar, borrar un borrador sin actividad (Rateware revisa y
    // borra en un solo paso, rateware #224) y rechazar una oferta no adjudicada.
    "archive_rfx_event",
    "delete_rfx_event",
    "reject_rfx_bid",
    // «Cerrar sin adjudicar» y rutas desiertas desde la página del evento (bloque C).
    "set_rfx_lane_no_award"
  ]),
  "rfx-bid-api": new Set(["submit_bid", "save_segment_confirmations", "decline_invitation"])
};

// Con FR8BID_ESCRITURAS_REALES=borradores solo pasan estas: dejan un borrador
// en la Cola de Rateware y no envían, no invitan, no adjudican ni tocan ofertas.
export const SOLO_BORRADORES: Record<Servicio, Set<string>> = {
  "rateware-api": new Set(["draft_bid_room_carrier_message"]),
  "rfx-bid-api": new Set()
};

export type ModoEscrituras = "no" | "borradores" | "si";

export function modoEscrituras(valor: string | undefined): ModoEscrituras {
  return valor === "si" ? "si" : valor === "borradores" ? "borradores" : "no";
}

// rateware-api (b11991f8) devuelve invitation_token ya descifrado en
// list_rfx_detail y bid_link en la metadata de los avisos; las variantes
// _encrypted/_hash las quita Rateware, pero aquí se quitan otra vez por si acaso.
// Acciones cuya forma en Fr8Bid solo está probada contra el simulado. Contra
// Rateware real se hacen en las pantallas de Rateware (Bid Room y Cola) hasta
// alinear cada una con su handler: la preparación del evento, las invitaciones
// y la liga del carrier (las invitaciones reales apuntan al portal de Rateware).
export const SOLO_SIMULADO: Record<Servicio, Set<string>> = {
  "rateware-api": new Set([
    "create_rfx_event",
    "import_rfx_lanes"
    // Preseleccionar carriers y preparar invitaciones ya van contra Rateware
    // real (24-oct-2026): campaña de Fr8Bid con la plantilla en español.
    // Las condiciones de ruta (R1) ya van contra Rateware real: desplegado en
    // rateware-prod el 23-oct-2026 (rateware-api v715, rfx-bid-api v344). Las
    // respuestas por correo y chat (R2) también: rateware-api v716, 24-oct-2026.
  ]),
  "rfx-bid-api": new Set(["get_invitation", "submit_bid", "save_segment_confirmations", "decline_invitation"])
};

// update_rfx_event con status «closed» en rateware-api exige todas las rutas
// decididas y ejecuta closeoutAwardedRfxToRateware sin el operation_id de
// Fr8Bid, además de generar avisos. La entrega solo sale por
// closeout_awarded_rfx_to_rateware; el cierre a ofertas es mover due_date.
const ESTADOS_DE_CIERRE = new Set(["closed", "awarded", "archived"]);

const CLAVES_SECRETAS = /^(token|token_digest|token_hash|bid_link|invitation_token(_encrypted|_hash|_ciphertext|_digest)?)$/i;

// Los avisos de Rateware llevan la liga con token dentro del texto
// (text_body, html_body, gmail_compose_url).
const TOKEN_EN_TEXTO = /([?&](?:amp;)?token=)[^&\s"'<>]+/gi;

export function sinSecretos(x: any): any {
  if (typeof x === "string") return x.replace(TOKEN_EN_TEXTO, "$1[oculto]");
  if (Array.isArray(x)) return x.map(sinSecretos);
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) if (!CLAVES_SECRETAS.test(k)) out[k] = sinSecretos(v);
    return out;
  }
  return x;
}

function filtrarProtegidos(body: any): any {
  if (body?.event && esProtegido(body.event.id)) return null;
  if (!body) return body;
  let limpio = body;
  for (const k of ["rows", "events"]) {
    if (Array.isArray(body[k])) limpio = { ...limpio, [k]: body[k].filter((e: any) => !esProtegido(e?.id) && !esProtegido(e?.rfx_event_id)) };
  }
  return limpio;
}

export interface OpcionesProxy {
  enviar: Enviar;
  permitirEscrituras: boolean;
  // FR8BID_ESCRITURAS_REALES=borradores: solo las acciones de SOLO_BORRADORES.
  soloBorradores?: boolean;
  // true cuando el destino es rateware-prod (funciones /api de Vercel).
  real?: boolean;
  hoy?: () => string;
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

  if (action === "carrier_recommendations") {
    // Solo el «Carrier fit» de un evento: la consulta acotada del Bid Room, no
    // el motor completo de inteligencia de Rateware.
    const config = body?.config && typeof body.config === "object" ? (body.config as Record<string, unknown>) : null;
    if (!config || config.rfx_carrier_fit !== true || !config.rfx_event_id)
      return error(400, "SOLO_CARRIER_FIT", "Fr8Bid solo consulta el Carrier fit de un evento.");
    if (esProtegido(config.rfx_event_id)) return error(404, "NOT_FOUND", "No encontrado.");
  }

  if (action === "list_rateware" && !esConsultaSegmento(body!)) {
    // Solo la consulta del historial del segmento: caja y operación, sin
    // búsqueda libre ni otros filtros (no es una puerta al tarifario).
    return error(400, "SOLO_HISTORIAL_SEGMENTO", "Fr8Bid solo consulta el historial del segmento de una ruta.");
  }

  if (action === "list_carrier_tariff_candidates" && !paginaTarifario.safeParse(body).success) {
    return error(400, "CONSULTA_TARIFARIO_INVALIDA", "Indica ciudades de origen y destino y una página válida del tarifario.");
  }

  if (action === "list_vendors" && !esConsultaContactos(body!)) {
    // Solo los contactos de carriers concretos (por id) o de su dominio: no es
    // una puerta al directorio completo de carriers.
    return error(400, "SOLO_CONTACTOS", "Fr8Bid solo consulta el contacto de carriers concretos o de su dominio.");
  }

  if (action === "list_contact_history" && !esHistorialDeCarrier(body!)) {
    return error(400, "SOLO_HISTORIAL_CARRIER", "Fr8Bid solo consulta el historial de contacto de un carrier.");
  }

  if (op.real && SOLO_SIMULADO[servicio].has(action)) {
    return error(501, "PASO_EN_RATEWARE", "Este paso todavía se hace en Rateware (Bid Room o Cola). Fr8Bid solo lo ejecuta en modo simulado.", { action });
  }

  if (action === "update_rfx_event") {
    const patch = body?.patch && typeof body.patch === "object" ? (body.patch as Record<string, unknown>) : null;
    if (!patch) return error(400, "FALTA_PATCH", "update_rfx_event necesita patch.");
    if (ESTADOS_DE_CIERRE.has(String(patch.status ?? "").toLowerCase())) {
      return error(409, "CIERRE_POR_ENTREGA", "Cerrar el evento en Rateware es la entrega: usa «Entregar a Rateware», que lleva su operation_id.");
    }
  }

  if (action === "extend_rfx_due_date_if_unchanged") {
    // Solo mover el plazo, con el plazo leído: nunca estado, notas ni otra cosa.
    const patch = body?.patch && typeof body.patch === "object" ? (body.patch as Record<string, unknown>) : null;
    if (!body?.event_id) return error(400, "FALTA_EVENTO", "Extender el plazo necesita event_id.");
    if (!patch || Object.keys(patch).join(",") !== "due_date" || !("expected_due_date" in body!))
      return error(400, "SOLO_PLAZO", "Solo se extiende el plazo y con el plazo leído (expected_due_date).");
  }

  if (action === "update_carrier_list_template") {
    // Solo membresía, con la versión leída: nunca nombre, descripción ni estado (archivar o
    // restaurar es del Administrador en Rateware).
    const patch = body?.patch && typeof body.patch === "object" ? (body.patch as Record<string, unknown>) : null;
    const claves = Object.keys(body ?? {}).filter(k => k !== "action").sort().join(",");
    if (claves !== "expected_version,patch,template_id" || !patch || Object.keys(patch).join(",") !== "vendor_ids" || !Array.isArray(patch.vendor_ids) || !Number.isSafeInteger(body?.expected_version))
      return error(400, "SOLO_MIEMBROS", "Desde Fr8Bid solo se cambia la membresía de una lista, con expected_version.");
  }

  if (esEscritura && !op.permitirEscrituras && op.soloBorradores && !SOLO_BORRADORES[servicio].has(action)) {
    return error(423, "SOLO_BORRADORES", "Fr8Bid está en modo «solo borradores»: este paso se hace en Rateware o con la aprobación del propietario.", { action });
  }

  if (esEscritura && !op.permitirEscrituras && !(op.soloBorradores && SOLO_BORRADORES[servicio].has(action))) {
    return error(423, "ESCRITURA_NO_AUTORIZADA", "Escribir en Rateware real requiere la aprobación del propietario para esta acción.", { action });
  }

  if (action === "closeout_awarded_rfx_to_rateware" && !UUID_RATEWARE.test(String(body?.operation_id || ""))) {
    return error(400, "OPERACION_INVALIDA", "La entrega necesita un operation_id generado antes del primer intento.");
  }

  if (action === "draft_bid_room_carrier_message") {
    const texto = String(body?.body || "").trim();
    if (!texto || texto.length > 600) return error(400, "TEXTO_INVALIDO", "El texto del intento debe tener entre 1 y 600 caracteres.");
    if (!String(body?.idempotency_key || "").startsWith("fr8bid-intento-")) return error(400, "FALTA_CLAVE", "El intento necesita su clave para no duplicar borradores.");
  }

  if (action === "shortlist_rfx_lane_vendors" || action === "record_rfx_invitation_wave_review") {
    const bloqueo = await guardaPreparacion(action, body!, autorizacion, op);
    if (bloqueo) return bloqueo;
  }

  if (action === "archive_rfx_event" || action === "delete_rfx_event") {
    // Un texto, nunca un arreglo: el candado de eventos protegidos compara el id tal cual.
    if (typeof body?.id !== "string" || !UUID.test(body.id)) return error(400, "FALTA_EVENTO", "Indica el evento.");
    if (body?.confirmed !== true || body?.confirmation_action !== action) return error(400, "SIN_CONFIRMAR", "Esta acción requiere confirmación explícita.");
    if (action === "archive_rfx_event") {
      // Un evento adjudicado ya se entregó a Rateware: archivarlo lo sacaría de la vista sin deshacer la entrega.
      const lectura = await leerDetalle(body.id, autorizacion, op);
      if (lectura === "sin_respuesta") return error(504, "SIN_RESPUESTA", "No se pudo comprobar el evento. No se archivó.");
      if (lectura.status !== 200) return { ...lectura, body: sinSecretos(lectura.body) };
      if (String(lectura.body?.event?.status || "").toLowerCase() === "awarded")
        return error(409, "EVENTO_ADJUDICADO", "Un evento adjudicado no se archiva desde Fr8Bid.");
    }
  }

  if (action === "reject_rfx_bid") {
    const bloqueo = await guardaRechazo(body!, autorizacion, op);
    if (bloqueo) return bloqueo;
  }

  if (action === "set_rfx_lane_no_award") {
    const bloqueo = await guardaDesierta(body!, autorizacion, op);
    if (bloqueo) return bloqueo;
  }

  if (action === "create_outreach_campaign") {
    const bloqueo = await guardaCampana(body!, autorizacion, op);
    if (bloqueo) return bloqueo;
  }

  if (action === "update_rfx_bid" || action === "invite_rfx_lane_vendors" || action === "draft_bid_room_carrier_message" || action === "capture_rfx_bid_if_empty" || action === "mark_rfx_replied_if_empty") {
    const bloqueo = await guardaParticipaciones(action, body!, autorizacion, op);
    if (bloqueo) return bloqueo;
  }

  if (action === "award_rfx_lane_vendor") {
    const bloqueo = await guardaAdjudicacion(body!, autorizacion, op);
    if (bloqueo) return bloqueo;
  }

  if (action === "save_rfx_lane_conditions") {
    const bloqueo = await guardaCondiciones(body!, autorizacion, op);
    if (bloqueo) return bloqueo;
  }

  if (action === "generate_outreach_drafts") {
    const bloqueo = (await guardaCampanaDeEnvio(body!, autorizacion, op)) ?? (await guardaRevisados(body!, autorizacion, op));
    if (bloqueo) return bloqueo;
  }

  if (action === "generate_rfx_award_notices" || action === "send_outreach_messages") {
    const bloqueo = await guardaAvisos(action, body!, autorizacion, op);
    if (bloqueo) return bloqueo;
  }
  if (action === "prepare_whatsapp_rfx_reminder" || action === "send_whatsapp_outreach_messages") {
    const bloqueo = await guardaWhatsapp(action, body!, autorizacion, op);
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
  let rubros: Respuesta;
  let condiciones: Respuesta;
  const sinCondiciones = op.real && SOLO_SIMULADO["rateware-api"].has("list_rfx_lane_conditions");
  try {
    [lectura, rubros, condiciones] = await conLimite(
      Promise.all([
        op.enviar("rateware-api", { action: "list_rfx_detail", event_id: body.event_id }, autorizacion),
        op.enviar("rateware-api", { action: "list_rfx_segment_confirmations", event_id: body.event_id }, autorizacion),
        sinCondiciones
          ? Promise.resolve({ status: 200, body: { rows: [] }, headers: {} })
          : op.enviar("rateware-api", { action: "list_rfx_lane_conditions", event_id: body.event_id }, autorizacion)
      ]),
      op.timeoutMs ?? 25000
    );
  } catch {
    return error(504, "SIN_RESPUESTA", "No se pudieron comprobar los candados. No se adjudicó nada.");
  }
  if (lectura.status !== 200) return { ...lectura, body: sinSecretos(lectura.body) };
  if (rubros.status !== 200) return { ...rubros, body: sinSecretos(rubros.body) };
  if (condiciones.status !== 200) return { ...condiciones, body: sinSecretos(condiciones.body) };
  const d = detalle(lectura.body, [], null, { hoy: op.hoy?.() ?? hoyMexico(), rubros: rubros.body?.rows || [], condiciones: condiciones.body?.rows || [] });
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

// La captura del equipo y «marcar invitadas» llevan ids de participación, no
// de evento: se exige event_id y se comprueba con una lectura fresca que cada id
// es de ese evento (así un id ajeno, p. ej. de HDships, no pasa).
// Rechazar una oferta: la participación tiene que ser de este evento, tener
// oferta y no estar adjudicada; el evento, abierto o cerrado (no adjudicado ni
// archivado). Rateware vuelve a negar la adjudicada.
async function guardaRechazo(body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  if (!body.event_id) return error(400, "FALTA_EVENTO", "Esta acción necesita event_id.");
  if (!body.id) return error(400, "FALTA_PARTICIPACION", "Indica la participación.");
  if (!String(body.reason || "").trim()) return error(400, "FALTA_MOTIVO", "Rechazar una oferta necesita el motivo.");
  if (body.confirmed !== true || body.confirmation_action !== "reject_rfx_bid") return error(400, "SIN_CONFIRMAR", "Rechazar una oferta requiere confirmación explícita.");
  const lectura = await leerDetalle(body.event_id, autorizacion, op);
  if (lectura === "sin_respuesta") return error(504, "SIN_RESPUESTA", "No se pudo comprobar el evento. No se escribió nada.");
  if (lectura.status !== 200) return { ...lectura, body: sinSecretos(lectura.body) };
  const estado = String(lectura.body?.event?.status || "").toLowerCase();
  // «Cerrado a ofertas» es un evento abierto con el plazo vencido; «closed» en
  // Rateware ya es un evento cerrado y sus ofertas no se tocan.
  if (!["open", "live", "published"].includes(estado)) return error(409, "EVENTO_NO_PERMITE", "Solo se rechazan ofertas en un evento abierto o cerrado a ofertas.");
  const fila = ((lectura.body?.lanes || []) as any[]).flatMap((l) => l.invitations || []).find((v: any) => v.id === body.id);
  if (!fila) return error(404, "NOT_FOUND", "La participación no pertenece a este evento.");
  if (fila.bid_rate === null || fila.bid_rate === undefined) return error(409, "SIN_OFERTA", "Esta participación no tiene oferta.");
  if (["primary", "backup"].includes(String(fila.award_role || "").toLowerCase())) return error(409, "ADJUDICADA", "Una oferta adjudicada no se rechaza: primero quita la decisión.");
  // Con la versión que se mostró, la lectura fresca debe coincidir (Rateware lo
  // vuelve a comprobar al escribir).
  if ("expected_updated_at" in body) {
    const vista = Date.parse(String(body.expected_updated_at || ""));
    if (!Number.isFinite(vista) || (fila.updated_at && Date.parse(String(fila.updated_at)) !== vista))
      return error(409, "OFERTA_CAMBIO", "La oferta cambió desde que la viste. No se rechazó nada; revísala otra vez.");
  }
  return null;
}

// Ruta desierta o reabierta: rutas de este evento, confirmación explícita, motivo al
// declarar, y las mismas reglas que la página del evento (evento cerrado a ofertas,
// ruta sin primario ni respaldo). Rateware no rechaza un evento ya adjudicado: aquí sí.
async function guardaDesierta(body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  if (!UUID.test(String(body.rfx_event_id || ""))) return error(400, "FALTA_EVENTO", "Indica el evento.");
  const ids = Array.isArray(body.lane_ids) ? body.lane_ids.map(String) : [];
  if (!ids.length || ids.length > 500 || ids.some((x) => !UUID.test(x)) || new Set(ids).size !== ids.length) return error(400, "FALTA_RUTA", "Indica entre 1 y 500 rutas válidas.");
  if (body.confirmed !== true || body.confirmation_action !== "set_rfx_lane_no_award") return error(400, "SIN_CONFIRMAR", "Esta acción requiere confirmación explícita.");
  const declarar = body.no_award !== false;
  if (declarar && !String(body.reason || "").trim()) return error(400, "FALTA_MOTIVO", "Declarar una ruta desierta necesita el motivo.");
  const lectura = await leerDetalle(body.rfx_event_id, autorizacion, op);
  if (lectura === "sin_respuesta") return error(504, "SIN_RESPUESTA", "No se pudo comprobar el evento. No se escribió nada.");
  if (lectura.status !== 200) return { ...lectura, body: sinSecretos(lectura.body) };
  if (["closed", "archived", "awarded"].includes(String(lectura.body?.event?.status || "").toLowerCase())) return error(409, "EVENTO_NO_PERMITE", "El evento ya está cerrado; sus rutas ya no cambian.");
  const d = detalle(lectura.body, [], null, { hoy: op.hoy?.() ?? hoyMexico() });
  for (const id of ids) {
    const ruta = d.rutas.find((r) => r.id === id);
    if (!ruta) return error(404, "NOT_FOUND", "Alguna ruta no pertenece a este evento.");
    const motivo = declarar ? bloqueoDesierta(d, ruta) : bloqueoReabrirRuta(d, ruta);
    if (motivo) return error(409, "NO_PERMITIDO", motivo);
  }
  return null;
}

async function guardaParticipaciones(action: string, body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  if (!body.event_id) return error(400, "FALTA_EVENTO", "Esta acción necesita event_id.");
  const porId = action === "update_rfx_bid" || action === "capture_rfx_bid_if_empty" || action === "mark_rfx_replied_if_empty";
  const ids = porId ? [body.id] : action === "draft_bid_room_carrier_message" ? [body.rfx_lane_vendor_id] : Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length || ids.some((x) => !x)) return error(400, "FALTA_PARTICIPACION", "Indica la participación.");
  if (porId && (!body.patch || typeof body.patch !== "object")) return error(400, "FALTA_PATCH", `${action} necesita patch.`);
  const patchCondicional = body.patch as Record<string, unknown> | undefined;
  if (action === "capture_rfx_bid_if_empty" && !(typeof patchCondicional?.bid_rate === "number" && patchCondicional.bid_rate > 0))
    return error(400, "SIN_TARIFA", "La captura necesita una tarifa mayor que cero.");
  if (action === "mark_rfx_replied_if_empty" && ("bid_rate" in (patchCondicional ?? {}) || !["responded", "declined"].includes(String(patchCondicional?.invitation_status || ""))))
    return error(400, "SIN_TARIFA", "«Ya respondió» solo marca respondió o rechazó, sin tarifa.");
  if (action === "invite_rfx_lane_vendors" && (body.confirmed !== true || body.confirmation_action !== "invite_rfx_lane_vendors"))
    return error(400, "SIN_CONFIRMAR", "Marcar como invitadas requiere confirmación explícita.");
  if (action === "draft_bid_room_carrier_message" && (body.confirmed !== true || body.confirmation_action !== "draft_bid_room_carrier_message"))
    return error(400, "SIN_CONFIRMAR", "Preparar el intento requiere confirmación explícita.");
  let lectura: Respuesta;
  try {
    lectura = await conLimite(op.enviar("rateware-api", { action: "list_rfx_detail", event_id: body.event_id }, autorizacion), op.timeoutMs ?? 25000);
  } catch {
    return error(504, "SIN_RESPUESTA", "No se pudo comprobar el evento. No se escribió nada.");
  }
  if (lectura.status !== 200) return { ...lectura, body: sinSecretos(lectura.body) };
  const propias = new Set(((lectura.body?.lanes || []) as any[]).flatMap((l) => (l.invitations || []).map((v: any) => v.id)));
  if (ids.some((x) => !propias.has(x))) return error(404, "NOT_FOUND", "La participación no pertenece a este evento.");
  // update_rfx_bid sin tarifa reescribe bid_rate a null en rateware-api: solo se
  // usa para marcar «respondió» o «rechazó», y nunca sobre una oferta existente.
  const patch = body.patch as Record<string, unknown> | undefined;
  if (action === "update_rfx_bid" && (patch?.bid_rate === null || patch?.bid_rate === undefined)) {
    if (!["responded", "declined"].includes(String(patch?.invitation_status || "")))
      return error(400, "SIN_TARIFA", "Sin tarifa solo se puede marcar que el carrier respondió o rechazó.");
    const fila = ((lectura.body?.lanes || []) as any[]).flatMap((l) => l.invitations || []).find((v: any) => v.id === body.id);
    if (fila && fila.bid_rate !== null && fila.bid_rate !== undefined)
      return error(409, "YA_OFERTO", "Esta participación ya tiene oferta; no se marca como respuesta sin tarifa.");
  }
  return null;
}

// I8 y D3 del lado del servidor: generate_rfx_award_notices de rateware-api no
// exige el evento «awarded» y send_outreach_messages tampoco distingue avisos.
// Aquí, con lecturas frescas: avisos solo tras el recibo, solo mensajes de este
// evento y solo la versión que el Administrador vio. Desde el 24-oct-2026 los
// avisos de no adjudicación y de respaldo también salen desde la Mesa.
// WhatsApp por plantilla de Meta (rateware PR #215): solo el recordatorio de RFx y un mensaje por envío,
// con su versión y aprobación; el mensaje debe ser un recordatorio de WhatsApp de ese evento (lectura fresca).
// Rateware vuelve a revisar número, «no contactar», permiso, plantilla APROBADA y duplicados.
async function guardaWhatsapp(action: string, body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  const eventId = body.rfx_event_id;
  if (!eventId) return error(400, "FALTA_EVENTO", "Esta acción necesita el evento.");
  if (action === "prepare_whatsapp_rfx_reminder") {
    if (body.purpose !== "rfx_reminder" || !body.vendor_id || !body.reminder_window) return error(400, "SOLO_RECORDATORIO", "Solo el recordatorio de RFx por WhatsApp.");
    return null;
  }
  const ids: unknown[] = Array.isArray(body.ids) ? body.ids : [];
  const versiones = Array.isArray(body.expected_versions) ? body.expected_versions as any[] : [];
  if (ids.length !== 1 || !ids[0] || versiones.length !== 1 || versiones[0]?.id !== ids[0] || !versiones[0]?.updated_at || !versiones[0]?.whatsapp_approval)
    return error(400, "UN_WHATSAPP", "Un WhatsApp a la vez, con su versión y su aprobación.");
  if (body.confirmed !== true || body.confirmation_action !== "send_whatsapp_outreach_messages") return error(400, "SIN_CONFIRMAR", "Enviar requiere confirmación explícita.");
  let mensajes: Respuesta;
  try {
    mensajes = await conLimite(op.enviar("rateware-api", { action: "list_outreach_messages", rfx_event_id: eventId, channel: "whatsapp", limit: 200 }, autorizacion), op.timeoutMs ?? 25000);
  } catch {
    return error(504, "SIN_RESPUESTA", "No se pudo comprobar el mensaje. No se envió nada.");
  }
  if (mensajes.status !== 200) return { ...mensajes, body: sinSecretos(mensajes.body) };
  const filas: any[] = mensajes.body?.rows ?? mensajes.body?.messages ?? [];
  const m = filas.find((x) => x?.id === ids[0]);
  if (!m || m.channel !== "whatsapp" || m.rfx_event_id !== eventId || m.metadata?.whatsapp_purpose !== "rfx_reminder")
    return error(409, "MENSAJE_AJENO", "El mensaje no es un recordatorio de WhatsApp de este evento. No se envió nada.");
  return null;
}

async function guardaAvisos(action: string, body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  const eventId = action === "send_outreach_messages" ? body.rfx_event_id : body.event_id;
  if (!eventId) return error(400, "FALTA_EVENTO", "Esta acción necesita el evento.");
  const ids: unknown[] = Array.isArray(body.ids) ? body.ids : [];
  const versiones = new Map<unknown, unknown>(
    (Array.isArray(body.expected_versions) ? body.expected_versions : []).map((v: any) => [v?.id, v?.updated_at])
  );
  if (action === "send_outreach_messages") {
    if (!ids.length || ids.some((x) => !x)) return error(400, "FALTA_MENSAJE", "Indica los avisos.");
    if (ids.some((x) => !versiones.get(x))) return error(400, "FALTA_VERSION", "Cada aviso necesita la versión exacta aprobada.");
    if (body.confirmed !== true || body.confirmation_action !== "send_outreach_messages")
      return error(400, "SIN_CONFIRMAR", "Enviar requiere confirmación explícita.");
    if (body.provider !== "gmail" || body.channel !== "email") return error(400, "CANAL", "Los avisos salen por Gmail.");
    if (ids.length > MAXIMO_POR_LLAMADA) return error(400, "TANDA_GRANDE", `Se envía en tandas de hasta ${MAXIMO_POR_LLAMADA} avisos.`);
  }
  let lectura: Respuesta;
  let mensajes: Respuesta | null = null;
  try {
    [lectura, mensajes] = await conLimite(
      Promise.all([
        op.enviar("rateware-api", { action: "list_rfx_detail", event_id: eventId }, autorizacion),
        action === "send_outreach_messages"
          ? op.enviar("rateware-api", { action: "list_outreach_messages", rfx_event_id: eventId, limit: 200 }, autorizacion)
          : Promise.resolve(null)
      ]),
      op.timeoutMs ?? 25000
    );
  } catch {
    return error(504, "SIN_RESPUESTA", "No se pudo comprobar el evento. No se generó ni envió nada.");
  }
  if (lectura.status !== 200) return { ...lectura, body: sinSecretos(lectura.body) };
  const adjudicado = String(lectura.body?.event?.status || "") === "awarded";
  if (action === "generate_rfx_award_notices") {
    return adjudicado ? null : error(409, "RFX_NOT_CLOSED_OUT", "Los avisos de adjudicación se generan después del recibo de Rateware.");
  }
  if (!mensajes || mensajes.status !== 200) return mensajes ? { ...mensajes, body: sinSecretos(mensajes.body) } : null;
  const filas: any[] = mensajes.body?.rows || mensajes.body?.messages || [];
  const porId = new Map(filas.map((m) => [m.id, m]));
  const invitaciones: any[] = [];
  for (const id of ids) {
    const m = porId.get(id);
    if (!m) return error(404, "NOT_FOUND", "El aviso no pertenece a este evento.");
    const meta = m.metadata || {};
    if (meta.notice_type !== "rfx_award_closeout") {
      // Invitaciones e intentos: solo a carriers con «Revisado» vigente (abajo).
      // La versión exacta la exige Rateware (expected_versions), y repetir la
      // misma tanda con su operation_id devuelve el resultado guardado.
      invitaciones.push(m);
      continue;
    }
    if (!adjudicado) return error(409, "RFX_NOT_CLOSED_OUT", "Sin recibo de Rateware no hay aviso de adjudicación.");
    if (String(m.updated_at) !== String(versiones.get(id)))
      return error(409, "OUTREACH_VERSION_CONFLICT", "El texto cambió desde que lo viste. Revísalo otra vez.");
  }
  if (!invitaciones.length) return null;
  // La revisión pudo revocarse después de preparar el borrador.
  const carrierDe = new Map<string, string>();
  for (const l of lectura.body?.lanes || []) for (const lv of l.invitations || []) carrierDe.set(String(lv.id), String(lv.vendor_id));
  const vendorIds = invitaciones.map((m) => carrierDe.get(String(m.rfx_lane_vendor_id)) || String(m.vendor_id || ""));
  return comprobarRevisados(eventId, vendorIds, autorizacion, op, "No se envió nada.");
}

async function leerDetalle(eventId: unknown, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | "sin_respuesta"> {
  try {
    return await conLimite(op.enviar("rateware-api", { action: "list_rfx_detail", event_id: eventId }, autorizacion), op.timeoutMs ?? 25000);
  } catch {
    return "sin_respuesta";
  }
}

// Sumar un carrier y marcarlo «Revisado»: solo en un evento propio, abierto o
// en borrador, y sobre rutas o carriers de ese evento.
async function guardaPreparacion(action: string, body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  const eventId = body.event_id || body.rfx_event_id;
  if (!eventId) {
    // Las pruebas del simulado preseleccionan antes de tener evento a la vista.
    if (!op.real && action === "shortlist_rfx_lane_vendors") return null;
    return error(400, "FALTA_EVENTO", "Esta acción necesita event_id.");
  }
  if (action === "shortlist_rfx_lane_vendors") {
    const ids = body.vendor_ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 25 || ids.some((x) => !x)) return error(400, "FALTA_CARRIER", "Indica entre 1 y 25 carriers.");
  } else {
    if (!body.vendor_id) return error(400, "FALTA_CARRIER", "Indica el carrier.");
    if (body.reviewed !== true) return error(400, "SOLO_REVISADO", "Fr8Bid solo marca «Revisado»; revocar se hace en Bidware.");
    if (body.confirmed !== true || body.confirmation_action !== "record_rfx_invitation_wave_review")
      return error(400, "SIN_CONFIRMAR", "Marcar «Revisado» requiere confirmación explícita.");
  }
  const lectura = await leerDetalle(eventId, autorizacion, op);
  if (lectura === "sin_respuesta") return error(504, "SIN_RESPUESTA", "No se pudo comprobar el evento. No se escribió nada.");
  if (lectura.status !== 200) return { ...lectura, body: sinSecretos(lectura.body) };
  const d = detalle(lectura.body, [], null, { hoy: op.hoy?.() ?? hoyMexico() });
  if (!["borrador", "abierto"].includes(d.evento.estado)) return error(409, "EVENTO_CERRADO", "El evento ya no acepta carriers nuevos.");
  if (action === "shortlist_rfx_lane_vendors") {
    if (!d.rutas.some((r) => r.id === body.lane_id)) return error(404, "NOT_FOUND", "La ruta no pertenece a este evento.");
    return null;
  }
  if (!d.rutas.some((r) => r.participaciones.some((p) => p.carrierId === body.vendor_id))) return error(404, "NOT_FOUND", "El carrier no está en este evento.");
  return null;
}

async function leerPlantillas(autorizacion: string | null, op: OpcionesProxy): Promise<Record<string, any>[] | null> {
  try {
    const r = await conLimite(op.enviar("rateware-api", { action: "list_outreach_templates" }, autorizacion), op.timeoutMs ?? 25000);
    return r.status === 200 ? r.body?.rows || [] : null;
  } catch {
    return null;
  }
}

// La campaña de Fr8Bid: una por evento, plantilla en español, audiencia «todos
// los elegibles» (la reduce reviewed_vendor_ids) y canal Gmail.
async function guardaCampana(body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  const c = body.campaign && typeof body.campaign === "object" ? (body.campaign as Record<string, any>) : null;
  if (!body.event_id || !c || c.rfx_event_id !== body.event_id) return error(400, "FALTA_EVENTO", "La campaña debe ser del evento.");
  if (c.idempotency_key !== claveCampana(String(body.event_id))) return error(400, "CAMPANA_FR8BID", "Fr8Bid solo crea su propia campaña del evento.");
  if (String(c.channel) !== "email" || c.audience_policy?.mode !== "all_eligible") return error(400, "CAMPANA_FR8BID", "La campaña de Fr8Bid es por Gmail y para todos los elegibles.");
  const lectura = await leerDetalle(body.event_id, autorizacion, op);
  if (lectura === "sin_respuesta") return error(504, "SIN_RESPUESTA", "No se pudo comprobar el evento. No se creó nada.");
  if (lectura.status !== 200) return { ...lectura, body: sinSecretos(lectura.body) };
  const plantillas = await leerPlantillas(autorizacion, op);
  if (!plantillas) return error(503, "PLANTILLAS_NO_DISPONIBLES", "No se pudieron leer las plantillas. No se creó nada.");
  if (!esPlantillaInvitacion(plantillas.find((t) => t.id === c.template_id))) return error(409, "PLANTILLA", "La invitación sale solo con la plantilla en español.");
  return null;
}

// Preparar invitaciones: la campaña tiene que ser la de Fr8Bid de este evento y
// la plantilla, la de invitación en español (nunca la de PRUEBA).
async function guardaCampanaDeEnvio(body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  if (!body.campaign_id) return op.real ? error(400, "FALTA_CAMPANA", "Preparar invitaciones necesita la campaña de Fr8Bid del evento.") : null;
  if (!body.event_id) return error(400, "FALTA_EVENTO", "Esta acción necesita el evento.");
  if (String(body.channel || "") !== "email") return error(400, "CANAL", "Las invitaciones salen por Gmail.");
  let campanas: Respuesta;
  try {
    campanas = await conLimite(op.enviar("rateware-api", { action: "list_outreach_campaigns" }, autorizacion), op.timeoutMs ?? 25000);
  } catch {
    return error(504, "SIN_RESPUESTA", "No se pudo comprobar la campaña. No se preparó nada.");
  }
  if (campanas.status !== 200) return { ...campanas, body: sinSecretos(campanas.body) };
  const c = ((campanas.body?.rows || []) as any[]).find((x) => x.id === body.campaign_id);
  if (c && (c.rfx_event_id !== body.event_id || c.idempotency_key !== claveCampana(String(body.event_id))))
    return error(409, "CAMPANA_FR8BID", "La campaña no es la de Fr8Bid para este evento. No se preparó nada.");
  // El catálogo global trae solo las 100 más recientes y la lectura del evento no
  // trae idempotency_key: si la campaña no aparece, no se adivina por nombre.
  if (!c) return error(409, "CAMPANA_NO_VERIFICADA", "No pude comprobar que la campaña sea la de Fr8Bid para este evento. No se preparó nada.");
  const plantillas = await leerPlantillas(autorizacion, op);
  if (!plantillas) return error(503, "PLANTILLAS_NO_DISPONIBLES", "No se pudieron leer las plantillas. No se preparó nada.");
  if (!esPlantillaInvitacion(plantillas.find((t) => t.id === body.template_id))) return error(409, "PLANTILLA", "La invitación sale solo con la plantilla en español.");
  return null;
}

// Solo carriers con la marca «Revisado» vigente reciben invitación. Se lee la
// revisión en el momento; si la lectura falla, no se prepara ni envía nada.
async function guardaRevisados(body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  const eventId = body.event_id || body.rfx_event_id;
  if (!eventId) return error(400, "FALTA_EVENTO", "Esta acción necesita el evento.");
  const ids = body.reviewed_vendor_ids;
  if (!Array.isArray(ids) || !ids.length || ids.some((x) => !x))
    return error(409, "REVISADOS_REQUERIDOS", "Las invitaciones se preparan solo para carriers marcados como «Revisado».");
  return comprobarRevisados(eventId, ids.map(String), autorizacion, op, "No se preparó nada.");
}

async function comprobarRevisados(eventId: unknown, vendorIds: string[], autorizacion: string | null, op: OpcionesProxy, nada: string): Promise<Respuesta | null> {
  let lectura: Respuesta;
  try {
    lectura = await conLimite(op.enviar("rateware-api", { action: "list_rfx_invitation_wave_reviews", rfx_event_id: eventId }, autorizacion), op.timeoutMs ?? 25000);
  } catch {
    return error(504, "SIN_RESPUESTA", `No se pudo comprobar la revisión de los carriers. ${nada}`);
  }
  if (lectura.status !== 200) return error(503, "REVISION_NO_DISPONIBLE", `No se pudo comprobar la revisión de los carriers. ${nada}`);
  const vigentes = revisionesVigentes(lectura.body?.rows || []);
  const faltan = [...new Set(vendorIds)].filter((v) => !v || vigentes[v]?.revisado !== true);
  if (faltan.length) return error(409, "CARRIER_SIN_REVISION", `${faltan.length} carrier(s) sin la marca «Revisado» vigente. ${nada}`, { vendor_ids: faltan });
  return null;
}

// R1 (biddingClosed) ya rechaza cambiar condiciones con el plazo vencido; el
// proxy lo comprueba antes con una lectura fresca y además valida la ruta.
async function guardaCondiciones(body: Record<string, unknown>, autorizacion: string | null, op: OpcionesProxy): Promise<Respuesta | null> {
  if (!body.event_id || !body.lane_id) return error(400, "FALTA_RUTA", "Indica el evento y la ruta.");
  let lectura: Respuesta;
  try {
    lectura = await conLimite(op.enviar("rateware-api", { action: "list_rfx_detail", event_id: body.event_id }, autorizacion), op.timeoutMs ?? 25000);
  } catch {
    return error(504, "SIN_RESPUESTA", "No se pudo comprobar el evento. No se guardó nada.");
  }
  if (lectura.status !== 200) return { ...lectura, body: sinSecretos(lectura.body) };
  const d = detalle(lectura.body, [], null, { hoy: op.hoy?.() ?? hoyMexico() });
  if (!["borrador", "abierto"].includes(d.evento.estado))
    return error(409, "EVENTO_CERRADO", "El evento ya está cerrado a ofertas: las condiciones ya no cambian.");
  if (!d.rutas.some((r) => r.id === body.lane_id)) return error(404, "NOT_FOUND", "La ruta no pertenece a este evento.");
  return null;
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
