import { crearEventos, herramientasCrearEvento } from "./crear-evento.js";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { ErrorApi, MesaApi, type Transporte } from "../cliente/api.js";
import { LECTURAS, sinSecretos } from "../servidor/proxy.js";
import { sinProtegidos } from "../servidor/paso.js";
import { esPrima, esProtegido, eventoSinAvisos } from "../dominio/protegidos.js";
import { hoyMexico, versionVigente } from "../dominio/recorrido.js";
import { claveIntento, intentosPorPreparar, intentosWhatsapp, seguimiento, textoIntento } from "../dominio/seguimiento.js";
import { BLOQUEO_SIN_AVISOS, bloqueosMeta, enmascarar, estadoPlantilla, MENSAJE_PLANTILLA_PENDIENTE, PLANTILLA_RECORDATORIO, recordatorioYaEnviado, textoRecordatorio, VENTANA_RATEWARE, variablesRecordatorio } from "../dominio/whatsapp-meta.js";
import { audienciaInvitacion, estadoRevision, resumenOmisiones } from "../dominio/revision.js";
import { bloqueoBorradoresInvitacion, bloqueoCaptura, bloqueoEnvioInvitacion, bloqueoIntentos, bloqueoPlazo, bloqueoRespondioEvento, bloqueoRevision, motivoNoMarcable } from "../dominio/acciones-mesa.js";
import { REMITENTE, campanaDelEvento, campanaFr8bid, elegirPlantilla } from "../dominio/invitacion.js";
import { MAXIMO_POR_LLAMADA, leerResultado, requiereAtencion } from "../dominio/tandas.js";
import type { Aviso, Detalle, Participacion, Rol, Ruta } from "../dominio/tipos.js";
import { firmar, huella, huellaCuerpos, verificar } from "./confirmacion.js";
import { ESCRITURAS_MCP } from "./transporte.js";

// Entrega 2 del MCP: cambios con vista previa y «sí» explícito. preparar_* solo
// lee y firma la vista previa; confirmar escribe por el proxy (/api/rateware).
// Captura, «ya respondió» y extender plazo usan las escrituras condicionales atómicas
// de rateware-api (capture_rfx_bid_if_empty, mark_rfx_replied_if_empty,
// extend_rfx_due_date_if_unchanged): la condición va en el mismo UPDATE, así que una
// oferta o un plazo que cambie entre preparar y confirmar da 409 y nunca «aplicada».
// Intento por WhatsApp: prepare_whatsapp_rfx_reminder (borrador + aprobación de 15 min de
// Rateware) y send_whatsapp_outreach_messages, con la plantilla de Meta rateware_rfx_reminder_es.
// Fuera del MCP (se hacen en la Mesa, con su liga): adjudicar, limpiar
// adjudicación, entregar a Rateware y avisos de adjudicación.

const APP = "https://fr8bid.heymarksman.com";
export const ligaMesa = (id: string) => `${APP}/eventos/${encodeURIComponent(id)}`;
export const FUERA_DEL_MCP = ["award_rfx_lane_vendor", "clear_rfx_award", "closeout_awarded_rfx_to_rateware", "generate_rfx_award_notices"];
// PRIMA nunca se cierra ni se rechaza desde el chat ni recibe avisos (decisión del
// propietario); la identificación vive en dominio/protegidos.ts.
export { esPrima };
const CAMPANA_NUEVA = "$campana_creada";
// El envío por WhatsApp usa el borrador y la aprobación que devuelve el paso anterior.
const RECORDATORIO = "$recordatorio_preparado";
// confirmar acepta hasta este largo de confirmacion_id; preparar_* nunca firma uno mayor.
export const LIMITE_TOKEN = 60000;
const PARTIBLES = new Set(["intentos", "ya_respondio"]);
// invitation_status crudos (src/cliente/mapear.ts) que ya no esperan respuesta: «ya respondió» no los toca.
const YA_CONTESTADA = new Set(["responded", "quoted", "bid_submitted", "declined", "withdrawn", "awarded", "archived"]);
// AGENTS.md regla 6: aprobación del PROPIETARIO por acción. Toda escritura real (intentos,
// «Revisado», campaña y borradores, tanda) solo la confirma un correo de FR8BID_MCP_APROBADORES,
// sobre una vista previa que él mismo preparó (el token es de su sesión). Los demás solo preparan.
// Rateware comprueba este propietario en la Edge Function y en el RPC de reapertura.
const PROPIETARIO_REAPERTURA = "sales@heymarksman.com";
export const APROBADORES_POR_OMISION = [PROPIETARIO_REAPERTURA];
export function aprobadoresDe(env: NodeJS.ProcessEnv): string[] {
  const lista = String(env.FR8BID_MCP_APROBADORES || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  return lista.length ? lista : APROBADORES_POR_OMISION;
}

const id = z.string().regex(/^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i);
const ids = z.array(id).min(1).max(100);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Fecha inválida");
const vista = "Solo lee y devuelve una vista previa con confirmacion_id; no escribe nada. Muestra la vista previa completa y pide un «sí» explícito antes de llamar a confirmar.";

export const herramientasEscritura = {
  ...herramientasCrearEvento,
  preparar_intentos: { rol: "operator" as Rol, descripcion: `Seguimiento (2º/3º intento por correo) a carriers que no han contestado, según la cadencia; excluye a quien ya respondió u ofertó. Al confirmar quedan como BORRADOR en la Cola de Rateware (no se envían). ${vista}`,
    schema: z.object({ event_id: id, participacion_ids: ids.optional() }).strict() },
  preparar_ya_respondio: { rol: "operator" as Rol, descripcion: `Marca que un carrier respondió o rechazó sin tarifa (lo saca de los intentos). Indica carrier_id o participacion_ids. Nunca sobre una participación con oferta: Rateware solo lo aplica si sigue sin tarifa. ${vista}`,
    schema: z.object({ event_id: id, carrier_id: id.optional(), participacion_ids: ids.optional(), respuesta: z.enum(["respondio", "rechazo"]), canal: z.enum(["email", "whatsapp", "phone"]), nota: z.string().trim().max(300).default("") }).strict() },
  preparar_captura: { rol: "operator" as Rol, descripcion: `Captura una oferta all-in que llegó por otro canal en una participación SIN oferta (nunca modifica una existente: Rateware solo la guarda si sigue sin tarifa). Muestra all-in vs target. ${vista}`,
    schema: z.object({ event_id: id, participacion_id: id, tarifa: z.number().positive().max(1_000_000), moneda: z.enum(["USD", "MXN"]), vigencia: fecha.nullable().default(null), capacidad_semanal: z.number().int().min(0).max(10_000).nullable().default(null), dias_transito: z.number().int().min(0).max(90).nullable().default(null), canal: z.enum(["email", "phone", "whatsapp", "other"]), nota: z.string().trim().max(500).default("") }).strict() },
  preparar_revision: { rol: "admin" as Rol, descripcion: `Administrador: marca «Revisado» a un carrier preseleccionado para que pueda recibir invitación. No envía nada. ${vista}`,
    schema: z.object({ event_id: id, carrier_id: id }).strict() },
  preparar_invitacion: { rol: "operator" as Rol, descripcion: `Invitación por tandas. fase «borradores» (Operador): genera borradores solo para carriers con «Revisado» vigente, no envía. fase «envio» (Administrador): envía por Gmail una tanda de hasta ${MAXIMO_POR_LLAMADA} borradores con su versión exacta. ${vista}`,
    schema: z.object({ event_id: id, fase: z.enum(["borradores", "envio"]) }).strict() },
  preparar_cambio_evento: { rol: "admin" as Rol, descripcion: `Administrador: SOLO extiende el plazo (fecha nueva posterior a la actual y a hoy) de un evento abierto o en borrador. No cierra, no publica, no cambia estado. Si otro movió el plazo entre la vista previa y la confirmación, Rateware no lo aplica. ${vista}`,
    schema: z.object({ event_id: id, nueva_fecha: fecha }).strict() },
  preparar_reapertura_evento: { rol: "admin" as Rol, descripcion: `Administrador: prepara la reapertura de un RFx cerrado a ofertas con un plazo futuro. Conserva rutas, ofertas y participaciones. Si hay adjudicaciones o procesos posteriores, informa el bloqueo. ${vista}`,
    schema: z.object({ event_id: id, nueva_fecha: fecha, motivo: z.string().trim().min(1).max(500) }).strict() },
  preparar_whatsapp_intento: { rol: "operator" as Rol, descripcion: `Intento por WhatsApp con la plantilla de Meta aprobada (${PLANTILLA_RECORDATORIO.nombre}) a un carrier al que ya le toca (4º intento de la cadencia). Muestra destinatario enmascarado, plantilla y variables; Rateware pone la liga privada del Bid Room. Al confirmar SE ENVÍA 1 WhatsApp; solo lo confirma el propietario. Si no está listo (número dudoso, no contactar, sin permiso o plantilla no aprobada) no prepara nada: usa el respaldo manual de whatsapp_pendientes. ventana 48h/24h (respondió sin tarifa) llega con fr8bid#72. ${vista}`,
    schema: z.object({ event_id: id, carrier_id: id, ventana: z.enum(["intento_4", "48h", "24h"]).default("intento_4") }).strict() },
  confirmar: { rol: "operator" as Rol, descripcion: "Ejecuta una vista previa ya mostrada. confirmacion_id = el de preparar_*; frase_ok = el texto literal con el que el usuario dijo «sí» (vacío = rechazo). Vence a los 15 min, vuelve a comprobar el evento y no reintenta. Adjudicar, entregar a Rateware y avisos de adjudicación no están aquí: se hacen en la página del evento en Fr8Bid.",
    schema: z.object({ confirmacion_id: z.string().min(20).max(LIMITE_TOKEN), frase_ok: z.string().max(300).optional() }).strict() }
};
export type NombreEscritura = keyof typeof herramientasEscritura;

// Rol mínimo por acción firmada (se comprueba al preparar Y al confirmar).
const ROL_ACCION: Record<string, Rol> = {
  intentos: "operator", ya_respondio: "operator", captura: "operator", revision: "admin",
  invitacion_borradores: "operator", invitacion_envio: "admin", cambio_evento: "admin",
  reapertura_evento: "admin", whatsapp_intento: "operator"
};
const RANGO: Record<Rol, number> = { viewer: 0, operator: 1, admin: 2 };
const permite = (rol: Rol, minimo: Rol) => RANGO[rol] >= RANGO[minimo];

/** Rechazo de negocio: el mensaje es nuestro y se puede mostrar. */
export class Rechazo extends Error {
  constructor(public codigo: string, mensaje: string, public status = 409) { super(mensaje); }
}
const PENDIENTE = () => new Rechazo("CONFIRMACIONES_PENDIENTES", "Confirmaciones pendientes de configurar (falta FR8BID_MCP_CONFIRM_SECRET). Las consultas siguen disponibles; este cambio hazlo en la página del evento en Fr8Bid.", 503);
// frase_ok: lista blanca de afirmaciones explícitas. Cualquier negación o duda
// la invalida aunque también diga «sí».
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim().replace(/\s+/g, " ");
const AFIRMATIVAS_REAPERTURA = new Set(["si", "confirmo", "ok", "okay", "adelante", "dale", "hazlo", "autorizo", "yes", "confirm", "procede"]);
const AFIRMATIVAS = new Set([...AFIRMATIVAS_REAPERTURA, "envialo", "enviala", "envialos", "envialas"]);
const DUDAS = /\b(no|nel|espera|esperar|esperemos|quiza|quizas|tal vez|duda|dudas|dudo|luego|despues|por ahora|todavia|aun|cancela|cancelar|alto|detente|pero)\b/;
export function esAfirmacion(frase: string, permitidas = AFIRMATIVAS): boolean {
  const n = normalizar(frase);
  if (!n || DUDAS.test(n)) return false;
  return n.split(" ").every(p => permitidas.has(p));
}

// Vista segura de un correo: el HTML se muestra como texto (sin scripts ni estilos), truncado
// con su largo total. Si texto y HTML dicen cosas distintas se muestran ambas variantes.
export const LIMITE_VISTA = 4000;
const ENTIDADES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", "#39": "'" };
// Entidad numérica fuera de Unicode o sustituto: carácter de reemplazo, nunca una excepción.
const caracter = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "�";
export function textoDeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|table|section)\s*>/gi, "\n")
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, href, t) => `${t} (${href})`)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+|#39);/gi, (m, e: string) => ENTIDADES[e.toLowerCase()] ?? (e[0] === "#" ? caracter(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m))
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
}
const recortar = (t: string) => t.length > LIMITE_VISTA ? { contenido: `${t.slice(0, LIMITE_VISTA)}…`, largo_total: t.length, truncado: true } : { contenido: t, largo_total: t.length, truncado: false };
const plano = (t: string) => t.replace(/\s+/g, " ").trim();
export interface ContenidoCorreo { asunto: string; texto: ReturnType<typeof recortar> | null; html: ReturnType<typeof recortar> | null; distintas: boolean; visible: boolean }
export function contenidoCorreo(m: { subject?: unknown; text_body?: unknown; html_body?: unknown }): ContenidoCorreo {
  const asunto = String(m.subject ?? "").trim();
  const texto = String(m.text_body ?? "").trim();
  const html = typeof m.html_body === "string" && m.html_body.trim() ? textoDeHtml(m.html_body) : "";
  return { asunto, texto: texto ? recortar(texto) : null, html: html ? recortar(html) : null,
    distintas: Boolean(texto && html && plano(texto) !== plano(html)),
    // Solo se puede aprobar lo que se mostró completo: un cuerpo truncado no es enviable desde el chat.
    visible: Boolean(asunto && (texto || html)) && texto.length <= LIMITE_VISTA && html.length <= LIMITE_VISTA };
}
function vistaPlantilla(t: Record<string, any>) {
  const c = contenidoCorreo({ subject: t.subject, text_body: t.body ?? t.text_body, html_body: t.html_body });
  return { asunto: c.asunto || null, cuerpo: c.texto, html: c.html, variantes_distintas: c.distintas };
}

// Campos de una captura que se comparan con lo que Rateware guardó.
export const CAMPOS_CAPTURA = ["currency", "valid_through", "weekly_capacity", "transit_days", "notes"];
function igualCampo(k: string, aprobado: unknown, guardado: unknown): boolean {
  if (aprobado == null || guardado == null) return aprobado == null && guardado == null;
  if (k === "valid_through") return String(aprobado).slice(0, 10) === String(guardado).slice(0, 10);
  if (k === "weekly_capacity" || k === "transit_days") return Number(aprobado) === Number(guardado);
  return String(aprobado).trim() === String(guardado).trim();
}

// 409 de las escrituras condicionales de Rateware: la condición no se cumplió y no se escribió nada.
export const CONFLICTOS_CONDICIONALES: Record<string, string> = {
  YA_HAY_OFERTA: "Ya hay oferta en esta participación (entró antes de confirmar); no se modificó nada. Revísala en la página del evento.",
  PLAZO_CAMBIO: "El plazo cambió desde la vista previa (otra persona lo movió); no se escribió nada. Vuelve a preparar si aún quieres extenderlo.",
  CONDICION_NO_CUMPLIDA: "La participación o el evento ya no están como en la vista previa (adjudicado, archivado o cerrado); no se escribió nada."
};
// Rateware sin la acción desplegada responde 400 «Unknown action.» antes de escribir.
export const accionNoDesplegada = (status: number, b: any) => status === 400 && (/unknown action/i.test(String(b?.error ?? "")) || b?.code === "UNSUPPORTED_ACTION");
export const MENSAJE_NO_DESPLEGADA = "Rateware todavía no tiene esta acción (escrituras condicionales de rateware PR #213 sin desplegar). No se escribió nada; hazlo en la página del evento en Fr8Bid.";
export const MENSAJE_NO_DESPLEGADA_WHATSAPP = "Rateware todavía no tiene el recordatorio por WhatsApp (rateware PR #215 sin desplegar). No se envió nada; usa el respaldo manual de whatsapp_pendientes.";
const ACCIONES_WHATSAPP = new Set(["prepare_whatsapp_rfx_reminder", "send_whatsapp_outreach_messages"]);
export const mensajeNoDesplegada = (action: string) => ACCIONES_WHATSAPP.has(action) ? MENSAJE_NO_DESPLEGADA_WHATSAPP : MENSAJE_NO_DESPLEGADA;
// Rechazos de prepare_whatsapp_rfx_reminder (rateware PR #215): no se envió nada.
export const RECHAZOS_WHATSAPP: Record<string, string> = {
  PLANTILLA_RECORDATORIO_PENDIENTE: `${MENSAJE_PLANTILLA_PENDIENTE} No se envió nada; usa el respaldo manual de whatsapp_pendientes.`,
  RECORDATORIO_DUPLICADO: "Ese WhatsApp ya se envió (o se está enviando) a este carrier en esta ventana; Rateware no lo repite.",
  WHATSAPP_NO_CONTACTAR: "El carrier está marcado «no contactar por WhatsApp» en Rateware; no se envió nada.",
  WHATSAPP_SIN_PERMISO: "El carrier no tiene base de permiso para WhatsApp en Rateware; no se envió nada.",
  NUMERO_DUDOSO: "El número no tiene lada internacional explícita en Rateware; no se envió nada.",
  SIN_REMITENTE: "Rateware no tiene un remitente de WhatsApp conectado; no se envió nada.",
  FUERA_DE_VENTANA: "Aún no toca esa ventana de recordatorio; no se envió nada.",
  PLAZO_VENCIDO: "El evento ya cerró; no se envió nada.",
  CONDICION_NO_CUMPLIDA: "El evento ya no está abierto; no se envió nada."
};

export interface Efecto { efecto: "completo" | "parcial" | "nulo" | "incierto"; omisiones: { id: string | null; motivo: string }[] }
/** Compara la respuesta (ya válida) con lo aprobado: solo «completo» cuenta como hecho. */
export function evaluarEfecto(body: Record<string, any>, b: any): Efecto {
  const completo: Efecto = { efecto: "completo", omisiones: [] };
  const nulo = (id: unknown, motivo: string): Efecto => ({ efecto: "nulo", omisiones: [{ id: id == null ? null : String(id), motivo }] });
  const sinVerificar = (id: unknown): Efecto => ({ efecto: "parcial", omisiones: [{ id: id == null ? null : String(id), motivo: "Rateware no devolvió el estado; verifica en la página del evento." }] });
  const row = b?.row ?? {};
  switch (body.action) {
    case "draft_bid_room_carrier_message":
      return b.reused === true ? nulo(body.rfx_lane_vendor_id, "ya había un borrador con esa clave; no se creó otro") : completo;
    case "record_rfx_invitation_wave_review":
      return !("reviewed" in row) ? sinVerificar(body.vendor_id) : row.reviewed === true ? completo : nulo(body.vendor_id, "Rateware no registró «Revisado»");
    case "capture_rfx_bid_if_empty": {
      const p = body.patch || {};
      if (!("bid_rate" in row)) return sinVerificar(body.id);
      if (Number(row.bid_rate) !== Number(p.bid_rate)) return nulo(body.id, "Rateware no reflejó la tarifa");
      // Cada campo aprobado debe volver igual; uno ausente no se da por bueno.
      const distintos: string[] = [], ausentes: string[] = [];
      for (const k of CAMPOS_CAPTURA) {
        if (!(k in p)) continue;
        if (!(k in row)) { ausentes.push(k); continue; }
        if (!igualCampo(k, p[k], row[k])) distintos.push(k);
      }
      if (distintos.length) return { efecto: "parcial", omisiones: [{ id: String(body.id), motivo: `Rateware guardó distinto: ${distintos.join(", ")}. Verifica en la página del evento.` }] };
      if (ausentes.length) return { efecto: "parcial", omisiones: [{ id: String(body.id), motivo: `No confirmado (${ausentes.join(", ")}); verifica en la página del evento.` }] };
      return completo;
    }
    case "mark_rfx_replied_if_empty": {
      // «Ya respondió»: sin tarifa. Se confirman estado Y nota.
      const p = body.patch || {};
      const ausentes = ["invitation_status", "notes"].filter(k => k in p && !(k in row));
      if (ausentes.length) return { efecto: "parcial", omisiones: [{ id: String(body.id), motivo: `No confirmado (${ausentes.join(", ")}); verifica en la página del evento.` }] };
      if (row.invitation_status !== p.invitation_status) return nulo(body.id, "Rateware no reflejó el cambio de estado");
      if ("notes" in p && String(row.notes ?? "").trim() !== String(p.notes ?? "").trim()) return { efecto: "parcial", omisiones: [{ id: String(body.id), motivo: "Rateware guardó otra nota; verifica en la página del evento." }] };
      return completo;
    }
    case "extend_rfx_due_date_if_unchanged":
      return !("due_date" in row) ? sinVerificar(body.event_id) : String(row.due_date ?? "").slice(0, 10) === body.patch?.due_date ? completo : nulo(body.event_id, "Rateware no reflejó el plazo nuevo");
    case "generate_outreach_drafts": {
      const esperados: string[] = (body.reviewed_vendor_ids || []).map(String);
      const generados = new Set((Array.isArray(b.rows) ? b.rows : []).map((x: any) => String(x?.vendor_id ?? "")));
      const motivos = new Map<string, string>((Array.isArray(b.skipped_rows) ? b.skipped_rows : []).map((x: any) => [String(x?.vendor_id ?? ""), String(x?.reason || "omitido")]));
      const faltan = esperados.filter(v => !generados.has(v));
      if (!faltan.length) return completo;
      return { efecto: faltan.length === esperados.length ? "nulo" : "parcial", omisiones: faltan.map(v => ({ id: v, motivo: motivos.get(v) || "Rateware no generó borrador" })) };
    }
    case "send_outreach_messages":
    case "send_whatsapp_outreach_messages": {
      const ids: string[] = body.ids || [];
      const res = leerResultado(b, ids);
      const lista = [...res.failures, ...res.skipped_rows].map(f => ({ id: f.id, motivo: f.reason || "no enviado" }));
      // Entrega desconocida: nunca «aplicada» ni «sin_efecto»; el resultado es incierto.
      if (res.delivery_unknown > 0) return { efecto: "incierto", omisiones: [{ id: null, motivo: `${res.delivery_unknown} con entrega desconocida; revisa en la página del evento antes de repetir.` }, ...lista] };
      if (res.sent === ids.length && !requiereAtencion(res, ids)) return completo;
      if (res.sent === 0) return { efecto: "nulo", omisiones: lista.length ? lista : [{ id: null, motivo: "Rateware no envió ninguno" }] };
      return { efecto: "parcial", omisiones: lista.length ? lista : [{ id: null, motivo: `${ids.length - res.sent} sin confirmar como enviados` }] };
    }
  }
  return nulo(null, "acción sin verificación");
}

/** 2xx con la forma que esa acción devuelve; si no, el resultado no está confirmado. */
export function respuestaValida(action: string, b: any, enviados: number): boolean {
  if (!b || typeof b !== "object" || Array.isArray(b) || b.incierta || b.error) return false;
  const fila = (x: any) => !!x && typeof x === "object" && !Array.isArray(x);
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0;
  switch (action) {
    case "draft_bid_room_carrier_message": return fila(b.outreach_message) && !!b.outreach_message.id;
    case "create_outreach_campaign": return fila(b.row) && !!b.row.id;
    case "record_rfx_invitation_wave_review": case "capture_rfx_bid_if_empty": case "mark_rfx_replied_if_empty": case "extend_rfx_due_date_if_unchanged": return fila(b.row);
    case "generate_outreach_drafts": return Array.isArray(b.rows);
    case "send_outreach_messages": case "send_whatsapp_outreach_messages": return num(b.sent) && num(b.failed) && b.sent <= enviados;
    case "prepare_whatsapp_rfx_reminder": return fila(b.row) && !!b.row.id && typeof b.row.updated_at === "string" && fila(b.whatsapp_approval) && fila(b.preview) && Array.isArray(b.preview.parameters);
    default: return false;
  }
}

export interface ContextoEscrituras {
  organizacionId?: string | null;
  secretoReapertura?: string | null;
  userId: string;
  clientId: string;
  rol: Rol;
  secreto: Uint8Array | null;
  ahora?: () => Date;
  registrar?: (entrada: Record<string, unknown>) => void;
  /** Correo de la sesión OAuth (para FR8BID_MCP_APROBADORES). */
  email?: string | null;
  /** Correos que pueden confirmar envíos reales y cambios de plazo; por omisión, APROBADORES_POR_OMISION. */
  aprobadores?: string[];
  /** Solo pruebas: límite menor que LIMITE_TOKEN para ejercitar la partición. */
  limiteToken?: number;
}

interface Plan {
  act: string;
  ev: string;
  arg: Record<string, unknown>;
  cuerpos: Record<string, unknown>[];
  // Contenido que no viaja en los cuerpos pero se aprobó (plantilla, destinatarios): entra en h y en pre.
  fijo?: unknown;
  foto: unknown;
  vista: Record<string, unknown>;
  evento: Record<string, unknown>;
  bloqueos?: string[];
  // Acciones partibles: participaciones agrupadas por carrier; una parte nunca separa a un carrier.
  grupos?: { carrier: string; ids: string[] }[];
}

const contextoReapertura = z.object({
  can_reopen: z.boolean(), blocking: z.array(z.string()),
  snapshot: z.object({
    event_id: id, folio: z.string(), name: z.string(),
    status: z.enum(["draft", "open", "closed", "awarded", "archived"]), due_date: fecha.nullable(),
    version: z.string().regex(/^[a-f0-9]{64}$/), lanes: z.number().int().nonnegative(),
    participations: z.number().int().nonnegative(), bids: z.number().int().nonnegative(),
    awards: z.number().int().nonnegative(), award_history: z.boolean(), notices: z.boolean(),
    handoff: z.boolean(), operations: z.boolean(), void_lanes: z.number().int().nonnegative(),
  }),
});

const estadoReapertura = { draft: "borrador", open: "abierto", closed: "cerrado", awarded: "adjudicado", archived: "archivado" };
const bloqueoReapertura: Record<string, string> = {
  EVENTO_CAMBIO: "El evento cambió o hubo un conflicto de bloqueo. Consulta el estado y el plazo en la página del evento antes de preparar otra reapertura.",
  EVENTO_NO_REABRIBLE: "Solo se reabren eventos cerrados a ofertas. Revisa el estado en Fr8Bid.",
  PLAZO_INVALIDO: "El nuevo plazo debe ser posterior al plazo guardado y a hoy en Ciudad de México.",
  CON_ADJUDICACIONES: "El administrador debe conciliar las adjudicaciones antes de decidir si procede una reapertura.",
  CON_AVISOS_ADJUDICACION: "El administrador debe revisar los avisos de adjudicación ya generados.",
  CON_ENTREGA_RATEWARE: "El administrador debe conciliar la entrega a Rateware y su recibo.",
  CON_PROCESOS_OPERATIVOS: "El administrador debe revisar los procesos operativos vinculados.",
  CON_RUTAS_RESUELTAS: "El administrador debe revisar las rutas declaradas desiertas.",
  APROBACION_NO_VERIFICADA: "Rateware no pudo verificar la aprobación firmada.",
  REAPERTURA_NO_CONFIGURADA: "La aprobación de reapertura todavía no está configurada.",
};
const reaperturaNoConfigurada = () => new Rechazo("REAPERTURA_NO_CONFIGURADA", bloqueoReapertura.REAPERTURA_NO_CONFIGURADA, 503);

export function crearEscrituras(t: Transporte, ctx: ContextoEscrituras) {
  const ahora = ctx.ahora ?? (() => new Date());
  const hoy = () => hoyMexico(ahora());
  const registrar = ctx.registrar ?? ((e: Record<string, unknown>) => console.info(JSON.stringify(e)));
  // Lista cerrada también aquí, además del transporte HTTP: lecturas + ESCRITURAS_MCP.
  const seguro: Transporte = async (s, body) => {
    const action = String(body.action);
    if (s !== "rateware-api" || !(LECTURAS[s].has(action) || ESCRITURAS_MCP.has(action))) throw new Rechazo("FUERA_DEL_MCP", "Acción fuera del MCP.", 403);
    for (const k of ["event_id", "rfx_event_id", "id"]) if (esProtegido(body[k])) throw new Rechazo("EVENTO_PROTEGIDO", "Evento protegido.", 404);
    const patch = body.patch as Record<string, unknown> | undefined;
    // Solo las formas que arma este MCP: captura con tarifa, «ya respondió» sin tarifa, plazo con el previo.
    if (action === "capture_rfx_bid_if_empty" && !(typeof patch?.bid_rate === "number" && patch.bid_rate > 0)) throw new Rechazo("SIN_TARIFA", "La captura necesita tarifa.", 403);
    if (action === "mark_rfx_replied_if_empty" && (!patch || "bid_rate" in patch || !["responded", "declined"].includes(String(patch.invitation_status)))) throw new Rechazo("SIN_CAPTURA", "«Ya respondió» no lleva tarifa.", 403);
    if (action === "extend_rfx_due_date_if_unchanged" && (!patch || Object.keys(patch).join(",") !== "due_date" || !("expected_due_date" in body))) throw new Rechazo("SOLO_PLAZO", "Desde el chat solo se extiende el plazo, con el plazo leído.", 403);
    // WhatsApp: solo el recordatorio con plantilla (sin dry_run ni otro propósito) y un mensaje por envío, con su aprobación.
    if (action === "prepare_whatsapp_rfx_reminder" && (body.purpose !== "rfx_reminder" || "dry_run" in body || !body.vendor_id || !body.reminder_window)) throw new Rechazo("SOLO_RECORDATORIO", "Desde el chat solo se prepara el recordatorio de RFx por WhatsApp.", 403);
    if (action === "send_whatsapp_outreach_messages" && (!Array.isArray(body.ids) || body.ids.length !== 1 || !Array.isArray(body.expected_versions) || body.expected_versions.length !== 1 || !(body.expected_versions[0] as any)?.whatsapp_approval)) throw new Rechazo("UN_WHATSAPP", "Desde el chat se envía un WhatsApp a la vez, con su aprobación.", 403);
    const r = await t(s, body);
    return { ...r, body: sinProtegidos(sinSecretos(r.body)) };
  };
  const api = new MesaApi(seguro, hoy);
  // Cuerpo exacto que arma la Mesa, sin enviarlo.
  async function cuerpoDe(f: (a: MesaApi) => Promise<unknown>): Promise<Record<string, unknown>> {
    let cuerpo: Record<string, unknown> | null = null;
    await f(new MesaApi(async (_s, b) => { cuerpo = b; return { status: 200, body: {}, headers: {} }; }, hoy));
    return cuerpo!;
  }
  async function leer(eventId: string): Promise<Detalle> {
    if (esProtegido(eventId)) throw new Rechazo("EVENTO_PROTEGIDO", "Evento protegido.", 404);
    const d = await api.detalle(eventId);
    if (esProtegido(d.evento.id) || d.evento.id.toLowerCase() !== eventId.toLowerCase()) throw new Rechazo("EVENTO_PROTEGIDO", "Evento protegido.", 404);
    return d;
  }
  async function crudo(body: Record<string, unknown>) {
    const r = await seguro("rateware-api", body);
    if (r.status < 200 || r.status >= 300) throw new ErrorApi(r.status, String(r.body?.code || "LECTURA"), "No se pudo completar la lectura");
    return r.body;
  }
  const conOferta = (p: Participacion) => p.versiones.length > 0 || versionVigente(p) !== null;
  const resumenEvento = (d: Detalle) => ({ id: d.evento.id, folio: d.evento.folio, nombre: d.evento.nombre, estado: d.evento.estado, plazo: d.evento.plazo });
  const todas = (d: Detalle) => d.rutas.flatMap(r => r.participaciones.map(p => ({ r, p })));
  const rutaTxt = (r: Ruta) => `#${r.numero} ${r.origen} → ${r.destino} (${r.equipo})`;
  const porCarrier = (xs: { id: string; carrierId: string; carrier: string }[]) => {
    const m = new Map<string, { carrier: string; ids: string[] }>();
    for (const x of xs) { const g = m.get(x.carrierId) ?? { carrier: x.carrier, ids: [] }; g.ids.push(x.id); m.set(x.carrierId, g); }
    return [...m.values()];
  };

  const planes: Record<string, (a: any) => Promise<Plan>> = {
    async intentos(a: { event_id: string; participacion_ids?: string[] }) {
      const d = await leer(a.event_id);
      // Mismas reglas que la Mesa: evento abierto y respuestas consultadas (null o
      // undefined por PASO_EN_RATEWARE: sin saber quién respondió no se insiste).
      const bloqueo = bloqueoIntentos(d);
      if (bloqueo) throw new Rechazo(eventoSinAvisos(d.evento) ? "EVENTO_SIN_AVISOS" : d.respuestas == null ? "SIN_RESPUESTAS" : "NO_PERMITIDO", `${bloqueo} No se preparó nada.`);
      let lista = intentosPorPreparar(d, ahora(), hoy());
      // Con participacion_ids: primero el carrier de cada ID y luego su intento con la
      // participación elegida (no la primera pendiente).
      if (a.participacion_ids) {
        const sel = new Set(a.participacion_ids);
        lista = lista.flatMap(x => {
          const elegida = x.s.pendientes.find(f => sel.has(f.participacion.id));
          return elegida ? [{ ...x, participacion: elegida.participacion, ruta: elegida.ruta }] : [];
        });
      }
      if (!lista.length) throw new Rechazo("NADA_POR_PREPARAR", "Nadie tiene un intento pendiente por la cadencia (ya ofertó, declinó, ya está en la Cola o aún no toca; a quien respondió sin tarifa solo le toca 48 h y 24 h antes del cierre).");
      lista.sort((x, y) => x.participacion.id.localeCompare(y.participacion.id));
      const cuerpos: Record<string, unknown>[] = [];
      for (const x of lista) cuerpos.push({ ...(await cuerpoDe(m => m.prepararIntento(d.evento.id, x.participacion.id, textoIntento(d, x.paso), claveIntento(d.evento.id, x.participacion.id, x.paso.intento, x.paso.antesDelCierre)))), app_origin: APP });
      return { act: "intentos", ev: d.evento.id, evento: resumenEvento(d),
        arg: { event_id: d.evento.id, participacion_ids: lista.map(x => x.participacion.id) },
        grupos: porCarrier(lista.map(x => ({ id: x.participacion.id, carrierId: x.s.carrierId, carrier: x.s.carrier }))),
        cuerpos,
        // Destinatario fijado: si cambia el carrier o su correo, confirmar se niega.
        // antes_del_cierre: el recordatorio de 48 h y el de 24 h son pasos distintos aunque
        // el número de intento coincida; si cambia de ventana, confirmar se niega.
        foto: lista.map(x => ({ p: x.participacion.id, carrier_id: x.s.carrierId, correo: x.s.correo, intento: x.paso.intento, antes_del_cierre: x.paso.antesDelCierre, estado: x.s.estado, en_cola: x.paso.enCola })),
        vista: {
          canal: "Correo. Al confirmar queda como BORRADOR en la Cola de Rateware; NO se envía hasta que el Administrador lo apruebe en la página del evento en Fr8Bid (Seguimiento) o en la Cola.",
          destinatarios: lista.map(x => ({ carrier: x.s.carrier, correo: x.s.correo, participacion_id: x.participacion.id, ruta: rutaTxt(x.ruta), intento: x.paso.intento, tipo: x.paso.antesDelCierre ? `recordatorio ${x.paso.antesDelCierre} h antes del cierre (respondió sin tarifa)` : "cadencia", toco_en: x.paso.tocaEn, texto: textoIntento(d, x.paso) })),
          excluidos: "Quien ofertó, declinó o ya tiene borrador en la Cola no aparece. Quien respondió sin tarifa solo aparece 48 h y 24 h antes del cierre."
        } };
    },

    async ya_respondio(a: { event_id: string; carrier_id?: string; participacion_ids?: string[]; respuesta: "respondio" | "rechazo"; canal: "email" | "whatsapp" | "phone"; nota: string }) {
      if (!!a.carrier_id === !!a.participacion_ids) throw new Rechazo("ARGUMENTOS", "Indica carrier_id o participacion_ids (solo uno).", 400);
      const d = await leer(a.event_id);
      const rechazo = a.respuesta === "rechazo";
      if (rechazo && esPrima(d.evento.folio)) throw new Rechazo("PRIMA_PROTEGIDO", "En PRIMA no se marca rechazo desde el chat; hazlo en la página del evento en Fr8Bid.", 403);
      // El seguimiento solo da contexto (p. ej. «llegó un correo suyo»); no decide si se marca.
      const segs = seguimiento(d, hoy());
      let elegidas = todas(d).filter(x => a.participacion_ids ? a.participacion_ids.includes(x.p.id) : x.p.carrierId === a.carrier_id);
      if (a.participacion_ids && elegidas.length !== new Set(a.participacion_ids).size) throw new Rechazo("AJENA", "Alguna participación no pertenece al evento.", 404);
      if (!elegidas.length) throw new Rechazo("AJENA", "Ese carrier no está en este evento.", 404);
      // Estado GUARDADO de cada participación en Rateware (invitation_status, responded_at, bid_rate):
      // es lo que decide y lo que fija la foto, para que confirmar no falle por un correo detectado.
      const crudoDetalle = await crudo({ action: "list_rfx_detail", event_id: d.evento.id });
      const filasCrudas = new Map<string, any>((crudoDetalle.lanes || []).flatMap((l: any) => l.invitations || []).map((v: any) => [String(v.id), v]));
      const guardado = (id: string) => {
        const v = filasCrudas.get(id);
        return { invitation_status: v?.invitation_status ?? null, responded_at: v?.responded_at ?? null, bid_rate: v?.bid_rate ?? null };
      };
      // Mismas reglas que la Mesa («Ya respondió»), sobre lo guardado: sin tarifa y con
      // invitation_status que aún espera respuesta; además, el estado crudo de Rateware.
      const motivo = (p: Participacion): string | null => {
        const g = guardado(p.id);
        if (conOferta(p) || g.bid_rate !== null) return "ya ofertó";
        if (g.invitation_status && YA_CONTESTADA.has(String(g.invitation_status))) return g.invitation_status === "declined" || g.invitation_status === "withdrawn" ? "declinó" : g.invitation_status === "archived" ? "excluida" : g.invitation_status === "awarded" ? "adjudicado" : "ya marcado como respondió";
        return motivoNoMarcable(p);
      };
      const bloqueo = bloqueoRespondioEvento(d);
      if (bloqueo) throw new Rechazo("NO_PERMITIDO", bloqueo);
      // Con carrier_id, como la Mesa: solo sus rutas por marcar; las demás se muestran como excluidas con su motivo.
      const excluidas: { carrier: string; ruta: string; estado: string; motivo: string }[] = [];
      if (a.carrier_id) {
        if (!segs.some(x => x.carrierId === a.carrier_id)) throw new Rechazo("NO_INVITADA", "Ese carrier no está invitado en este evento.");
        for (const { p, r } of elegidas) { const m = motivo(p); if (m) excluidas.push({ carrier: p.carrier, ruta: rutaTxt(r), estado: p.estado, motivo: m }); }
        elegidas = elegidas.filter(x => !motivo(x.p));
        if (!elegidas.length) throw new Rechazo("NADA_POR_MARCAR", `${excluidas[0]?.carrier ?? "Ese carrier"} no tiene rutas por marcar en este evento (ya ofertó, declinó o ya está marcado).`);
      }
      for (const { p, r } of elegidas) {
        const m = motivo(p);
        if (!m) continue;
        if (m === "ya ofertó") throw new Rechazo("YA_OFERTO", `${p.carrier} ya tiene oferta en ${rutaTxt(r)}; no se marca respuesta sin tarifa.`);
        if (p.estado === (rechazo ? "declino" : "respondio")) throw new Rechazo("YA_MARCADA", `${p.carrier} ya está marcado así en ${rutaTxt(r)}.`);
        if (m === "no invitado") throw new Rechazo("NO_INVITADA", `${p.carrier} no está invitado en ${rutaTxt(r)}.`);
        throw new Rechazo("NO_PENDIENTE", `${p.carrier} no tiene pendiente ${rutaTxt(r)} (${m}).`);
      }
      elegidas = [...elegidas].sort((x, y) => x.p.id.localeCompare(y.p.id));
      const contexto = segs.filter(s => s.respondioPor.length && elegidas.some(x => x.p.carrierId === s.carrierId))
        .map(s => `Llegó un ${s.respondioPor.map(c => c === "correo" ? "correo" : c === "chat" ? "mensaje por el chat" : "WhatsApp").join(" y ")} de ${s.carrier}; no bloquea marcarlo.`);
      const cuerpos: Record<string, unknown>[] = [];
      // Mismo cuerpo que arma la Mesa (estado y nota), por la escritura condicional: Rateware
      // solo lo aplica si la participación sigue sin tarifa y nunca escribe bid_rate.
      for (const { p } of elegidas) {
        const mesa = await cuerpoDe(m => m.marcarRespondio({ eventId: d.evento.id, participacionId: p.id, rechazo, canal: a.canal, nota: a.nota }));
        cuerpos.push({ ...mesa, action: "mark_rfx_replied_if_empty", patch: { ...(mesa.patch as Record<string, unknown>), channel: a.canal } });
      }
      return { act: "ya_respondio", ev: d.evento.id, evento: resumenEvento(d),
        arg: { event_id: d.evento.id, participacion_ids: elegidas.map(x => x.p.id), respuesta: a.respuesta, canal: a.canal, nota: a.nota },
        grupos: porCarrier(elegidas.map(x => ({ id: x.p.id, carrierId: x.p.carrierId, carrier: x.p.carrier }))),
        cuerpos,
        // Foto del estado guardado (no del seguimiento): un correo detectado no la cambia.
        foto: elegidas.map(x => ({ p: x.p.id, estado: x.p.estado, versiones: x.p.versiones.length, ...guardado(x.p.id) })),
        vista: { cambio: rechazo ? "Marcar que RECHAZÓ (declinó) sin tarifa" : "Marcar que RESPONDIÓ sin tarifa", canal_de_la_respuesta: a.canal,
          participaciones: elegidas.map(({ p, r }, i) => ({ carrier: p.carrier, ruta: rutaTxt(r), estado_actual: p.estado, nota_que_se_guarda: (cuerpos[i].patch as any).notes })),
          ...(excluidas.length ? { excluidas } : {}),
          ...(contexto.length ? { contexto } : {}),
          efecto: "Sale de los intentos de seguimiento. No envía nada ni toca ofertas: si entra una oferta antes de confirmar, Rateware no lo aplica." } };
    },

    async captura(a: { event_id: string; participacion_id: string; tarifa: number; moneda: string; vigencia: string | null; capacidad_semanal: number | null; dias_transito: number | null; canal: "email" | "phone" | "whatsapp" | "other"; nota: string }) {
      const d = await leer(a.event_id);
      const x = todas(d).find(x => x.p.id === a.participacion_id);
      if (!x) throw new Rechazo("AJENA", "La participación no pertenece al evento.", 404);
      const crudoDetalle = await crudo({ action: "list_rfx_detail", event_id: d.evento.id });
      const fila = (crudoDetalle.lanes || []).flatMap((l: any) => l.invitations || []).find((v: any) => v.id === a.participacion_id);
      const bidRate = fila?.bid_rate ?? null;
      if (conOferta(x.p) || bidRate !== null) throw new Rechazo("YA_HAY_OFERTA", "Esta participación ya tiene oferta; el MCP no modifica ofertas. Revísala en la página del evento en Fr8Bid.");
      // Mismas reglas que la Mesa (Captura del equipo) más «nunca sobre una participación excluida».
      const bloqueo = bloqueoCaptura(d, x.p) ?? (x.p.estado === "excluida" ? "La participación está excluida." : null);
      if (bloqueo) throw new Rechazo("NO_PERMITIDO", bloqueo);
      // Mismo cuerpo que la Captura del equipo de la Mesa, por la escritura condicional (bid_rate IS NULL).
      const mesa = await cuerpoDe(m => m.capturarOferta({ eventId: d.evento.id, participacionId: x.p.id, tarifa: a.tarifa, moneda: a.moneda, vigencia: a.vigencia, capacidadSemanal: a.capacidad_semanal, diasTransito: a.dias_transito, canal: a.canal, notas: a.nota }));
      const cuerpo = { ...mesa, action: "capture_rfx_bid_if_empty" };
      const misma = x.r.objetivo !== null && x.r.moneda === a.moneda;
      return { act: "captura", ev: d.evento.id, evento: resumenEvento(d),
        arg: { ...a, event_id: d.evento.id },
        cuerpos: [cuerpo],
        foto: { p: x.p.id, estado: x.p.estado, versiones: x.p.versiones.length, bid_rate: bidRate },
        vista: { ruta: rutaTxt(x.r), carrier: x.p.carrier, tarifa_all_in: a.tarifa, moneda: a.moneda, vigencia: a.vigencia, capacidad_semanal: a.capacidad_semanal, dias_transito: a.dias_transito,
          canal: a.canal, nota_de_origen: (mesa.patch as any).source_note,
          target: x.r.objetivo, moneda_target: x.r.moneda,
          all_in_vs_target: misma ? a.tarifa - (x.r.objetivo as number) : null,
          comparacion: misma ? (a.tarifa <= (x.r.objetivo as number) ? "en o bajo target" : "arriba del target") : "sin comparar: falta target o la moneda es distinta (no se convierten monedas)",
          efecto: "Registra la oferta como capturada por el Operador solo si la participación sigue sin oferta. No adjudica ni avisa al carrier." } };
    },

    async cambio_evento(a: { event_id: string; nueva_fecha: string }) {
      const d = await leer(a.event_id);
      const bloqueoP = bloqueoPlazo(d, a.nueva_fecha, hoy());
      if (bloqueoP) throw new Rechazo(d.evento.estado !== "abierto" && d.evento.estado !== "borrador" ? "EVENTO_NO_EDITABLE" : a.nueva_fecha <= hoy() ? "FECHA_PASADA" : "SOLO_EXTENDER", bloqueoP, 400);
      // Solo hacia adelante: nunca cierra (tampoco PRIMA, que jamás se cierra ni se rechaza).
      // expected_due_date = el plazo leído aquí: si otro lo mueve antes de confirmar, Rateware da 409 PLAZO_CAMBIO.
      const actual = d.evento.plazo ? d.evento.plazo.slice(0, 10) : null;
      return { act: "cambio_evento", ev: d.evento.id, evento: resumenEvento(d), arg: { event_id: d.evento.id, nueva_fecha: a.nueva_fecha },
        cuerpos: [{ action: "extend_rfx_due_date_if_unchanged", event_id: d.evento.id, patch: { due_date: a.nueva_fecha }, expected_due_date: actual }],
        foto: { estado: d.evento.estado, plazo: actual },
        vista: { plazo_actual: actual, plazo_nuevo: a.nueva_fecha, efecto: "Solo mueve el plazo hacia adelante, y solo si nadie lo cambió desde esta vista previa. No cierra, no publica, no cambia estado ni avisa a carriers." } };
    },

    async reapertura_evento(a: { event_id: string; nueva_fecha: string; motivo: string }) {
      if (!ctx.organizacionId || (ctx.secretoReapertura?.length ?? 0) < 32) throw reaperturaNoConfigurada();
      const r = await seguro("rateware-api", { action: "preview_rfx_event_reopen", event_id: a.event_id, new_due_date: a.nueva_fecha });
      if (accionNoDesplegada(r.status, r.body)) throw new Rechazo("ACCION_NO_DESPLEGADA", "Rateware aún no ofrece la vista previa de reapertura.", 503);
      if (r.status !== 200) throw new Rechazo(String(r.body?.code || "REAPERTURA_NO_DISPONIBLE"), "No se pudo verificar si el evento puede reabrirse.", r.status);
      const datos = contextoReapertura.safeParse(r.body);
      if (!datos.success || datos.data.snapshot.event_id.toLowerCase() !== a.event_id.toLowerCase() ||
          datos.data.can_reopen !== (datos.data.blocking.length === 0)) {
        throw new Rechazo("REAPERTURA_NO_DISPONIBLE", "Rateware devolvió una vista previa incompleta.", 503);
      }
      const { snapshot: e, blocking } = datos.data;
      const estado = e.status === "open" && e.due_date && e.due_date < hoy() ? "cerrado" : estadoReapertura[e.status];
      return { act: "reapertura_evento", ev: e.event_id,
        evento: { id: e.event_id, folio: e.folio, nombre: e.name, estado, plazo: e.due_date },
        arg: { ...a, event_id: e.event_id }, foto: { version: e.version }, bloqueos: blocking,
        fijo: { organizacion_id: ctx.organizacionId },
        cuerpos: [{ action: "reopen_rfx_event_if_unchanged", event_id: e.event_id,
          new_due_date: a.nueva_fecha, reason: a.motivo, expected_version: e.version }],
        vista: { estado_actual: estado, estado_rateware: e.status, estado_propuesto: "abierto",
          plazo_actual: e.due_date, plazo_nuevo: a.nueva_fecha, zona_horaria: "America/Mexico_City",
          motivo: a.motivo, rutas: e.lanes, participaciones: e.participations, ofertas: e.bids,
          adjudicaciones: e.awards, historial_adjudicacion: e.award_history, avisos_adjudicacion: e.notices,
          entrega_rateware: e.handoff, procesos_operativos: e.operations, rutas_desiertas: e.void_lanes,
          usuario_responsable: ctx.email || ctx.userId,
          efecto: "Reabre la recepción de ofertas hasta el nuevo plazo. Conserva rutas, ofertas y participaciones. Las invitaciones y los avisos se autorizan por separado.",
        } };
    },

    async revision(a: { event_id: string; carrier_id: string }) {
      const d = await leer(a.event_id);
      const x = todas(d).find(x => x.p.carrierId === a.carrier_id);
      if (!x) throw new Rechazo("AJENA", "El carrier no está en este evento.", 404);
      // Mismas reglas que la Mesa: preseleccionado, sin revisión, con correo, evento abierto o borrador.
      const e = estadoRevision(d, a.carrier_id);
      const bloqueo = bloqueoRevision(d, x.p) ?? (todas(d).some(y => y.p.carrierId === a.carrier_id && y.p.estado === "preseleccionada") ? null : `${x.p.carrier} ya no está preseleccionado (ya se invitó o se excluyó).`);
      if (bloqueo) throw new Rechazo(e === "revisado" ? "YA_REVISADO" : "NO_PERMITIDO", bloqueo);
      const cuerpo = await cuerpoDe(m => m.marcarRevisado(d.evento.id, { carrierId: x.p.carrierId, carrier: x.p.carrier, correo: x.p.correo }));
      return { act: "revision", ev: d.evento.id, evento: resumenEvento(d), arg: { event_id: d.evento.id, carrier_id: a.carrier_id }, cuerpos: [cuerpo],
        foto: { carrier: a.carrier_id, estado: e, en: d.revisiones?.[a.carrier_id]?.en ?? null },
        vista: { carrier: x.p.carrier, correo: x.p.correo, rutas: todas(d).filter(y => y.p.carrierId === a.carrier_id).map(y => rutaTxt(y.r)), estado_actual: e,
          efecto: "Marca «Revisado»: podrá recibir la invitación. No envía nada." } };
    },

    async invitacion_borradores(a: { event_id: string }) {
      const d = await leer(a.event_id);
      const bloqueoB = bloqueoBorradoresInvitacion(d);
      if (bloqueoB) throw new Rechazo("NO_PERMITIDO", bloqueoB);
      const invitaciones = d.avisos.filter(x => x.tipo === "invitacion" && !x.intento);
      const audiencia = audienciaInvitacion(d);
      const sinBorrador = audiencia.aptas.filter(p => !invitaciones.some(x => x.participaciones.includes(p.id)));
      const revisados = [...new Set(sinBorrador.map(p => p.carrierId))].sort();
      if (!revisados.length) throw new Rechazo("NADA_POR_PREPARAR", "No hay carriers revisados sin borrador. Si ya hay borradores, usa la fase «envio».");
      const [campanas, plantillas] = await Promise.all([crudo({ action: "list_outreach_campaigns" }), crudo({ action: "list_outreach_templates" })]);
      const plantilla = elegirPlantilla(plantillas.rows || []);
      if (!plantilla) throw new Rechazo("SIN_PLANTILLA", "No encontré en Rateware la plantilla «RFx carrier invitation - Spanish». No se prepara nada.");
      const filas: Record<string, any>[] = campanas.rows || [];
      const campana = campanaDelEvento(filas, d.evento.id);
      const cuerpos: Record<string, unknown>[] = [];
      if (!campana) {
        const base = filas.find(c => c.rfx_event_id === d.evento.id && c.sender_email) ?? filas.find(c => c.channel === "email" && c.sender_email) ?? null;
        cuerpos.push({ action: "create_outreach_campaign", event_id: d.evento.id, campaign: campanaFr8bid(d.evento.id, d.evento.folio, String(plantilla.id), base) });
      }
      cuerpos.push({ action: "generate_outreach_drafts", event_id: d.evento.id, campaign_id: campana ? campana.id : CAMPANA_NUEVA, template_id: plantilla.id, channel: "email", reviewed_vendor_ids: revisados });
      const porCarrier = new Map(sinBorrador.map(p => [p.carrierId, p]));
      const destinatarios = [...porCarrier.values()].map(p => ({ carrier_id: p.carrierId, carrier: p.carrier, correo: p.correo })).sort((x, y) => x.carrier_id.localeCompare(y.carrier_id));
      const fijo = { plantilla: huella({ id: plantilla.id, asunto: plantilla.subject ?? null, cuerpo: plantilla.body ?? plantilla.text_body ?? null, html: plantilla.html_body ?? null, version: plantilla.updated_at ?? plantilla.version ?? null }), destinatarios };
      return { act: "invitacion_borradores", ev: d.evento.id, evento: resumenEvento(d), arg: { event_id: d.evento.id, fase: "borradores" }, cuerpos, fijo,
        foto: { revisados, campana: campana?.id ?? null, plantilla_id: String(plantilla.id), borradores: invitaciones.map(x => x.id).sort(), ...fijo },
        vista: { canal: `Correo (Gmail, ${REMITENTE}). Al confirmar se generan BORRADORES en la Cola; no se envía nada. El envío es la fase «envio» (Administrador).`,
          destinatarios: [...porCarrier.values()].map(p => ({ carrier: p.carrier, correo: p.correo })),
          texto: { plantilla: plantilla.name ?? null, ...vistaPlantilla(plantilla), nota: "Rateware llena la plantilla por carrier; el texto final exacto se muestra en la fase «envio»." },
          quedan_fuera: { resumen: resumenOmisiones(audiencia) || "Nadie.", carriers: [...new Map(audiencia.omitidas.map(o => [o.p.carrierId, { carrier: o.p.carrier, motivo: o.motivo }])).values()] },
          campana: campana ? "existente" : "se crea la campaña de Fr8Bid del evento (clave idempotente)" } };
    },

    async invitacion_envio(a: { event_id: string }) {
      const d = await leer(a.event_id);
      const bloqueoE = bloqueoEnvioInvitacion(d);
      if (bloqueoE) throw new Rechazo(d.evento.estado !== "abierto" ? "EVENTO_NO_ABIERTO" : "NO_PERMITIDO", `${bloqueoE} El MCP no publica.`);
      const participaciones = todas(d).map(x => x.p);
      const carrierDe = (x: Aviso) => participaciones.find(p => p.id === x.participacionId);
      const revisada = (x: Aviso) => { const p = carrierDe(x); return Boolean(p && estadoRevision(d, p.carrierId) === "revisado"); };
      const invitaciones = d.avisos.filter(x => x.tipo === "invitacion" && !x.intento);
      // «en_cola» mezcla queued y sending: con el estado crudo solo se ofrecen los pendientes
      // de verdad (drafted, queued, failed). Uno en proceso (sending) no entra y no altera la tanda.
      const crudos = await crudo({ action: "list_outreach_messages", rfx_event_id: d.evento.id, channel: "email" });
      const filasCrudas = (crudos.rows ?? crudos.messages ?? []) as any[];
      const estadoCrudo = new Map<string, string>(filasCrudas.map(m => [String(m.id), String(m.status ?? "")]));
      // Contenido exacto de cada mensaje: asunto, text_body y html_body (Aviso.cuerpo solo trae text_body).
      const contenidoDe = new Map<string, ContenidoCorreo>(filasCrudas.map(m => [String(m.id), contenidoCorreo(m)]));
      const PENDIENTES = new Set(["drafted", "queued", "failed"]);
      const enProceso = invitaciones.filter(x => (x.estado === "borrador" || x.estado === "fallido" || x.estado === "en_cola") && !PENDIENTES.has(estadoCrudo.get(x.id) ?? ""));
      const enviables = invitaciones.filter(x => (x.estado === "borrador" || x.estado === "fallido" || x.estado === "en_cola") && PENDIENTES.has(estadoCrudo.get(x.id) ?? ""));
      // Sin cuerpo visible no se puede mostrar el texto exacto: ese mensaje no entra en la tanda.
      const visible = (x: Aviso) => contenidoDe.get(x.id)?.visible === true;
      const sinCuerpo = enviables.filter(x => revisada(x) && !visible(x));
      const porEnviar = enviables.filter(x => revisada(x) && visible(x)).sort((x, y) => x.id.localeCompare(y.id));
      const tanda = porEnviar.slice(0, MAXIMO_POR_LLAMADA);
      if (!tanda.length) throw new Rechazo("NADA_POR_ENVIAR", sinCuerpo.length
        ? `${sinCuerpo.length} borrador(es) sin asunto, sin cuerpo visible o demasiado largos para mostrarse completos: no se puede mostrar el texto exacto. Revísalos en la Cola de Rateware.`
        : "No hay borradores de invitación listos de carriers revisados.");
      const cuerpo = await cuerpoDe(m => m.enviarAvisos(d.evento.id, tanda));
      return { act: "invitacion_envio", ev: d.evento.id, evento: resumenEvento(d), arg: { event_id: d.evento.id, fase: "envio" }, cuerpos: [cuerpo],
        foto: tanda.map(x => ({ id: x.id, version: x.version, estado: x.estado, crudo: estadoCrudo.get(x.id), revisado: revisada(x), contenido: huella(contenidoDe.get(x.id)) })),
        vista: { canal: `Gmail desde ${REMITENTE}. Al confirmar SE ENVÍAN ${tanda.length} invitaciones con este texto exacto (versión aprobada).`,
          operation_id: cuerpo.operation_id,
          destinatarios: tanda.map(x => { const c = contenidoDe.get(x.id)!; return { carrier: carrierDe(x)?.carrier ?? null, para: x.destinatario, asunto: c.asunto, texto: c.texto, html: c.html, variantes_distintas: c.distintas, estado: x.estado }; }),
          quedan_fuera: [
            ...enviables.filter(x => !revisada(x)).map(x => ({ carrier: carrierDe(x)?.carrier ?? null, motivo: carrierDe(x) ? `sin «Revisado» vigente (${estadoRevision(d, carrierDe(x)!.carrierId)})` : "participación no encontrada" })),
            ...porEnviar.slice(MAXIMO_POR_LLAMADA).map(x => ({ carrier: carrierDe(x)?.carrier ?? null, motivo: "siguiente tanda" })),
            ...sinCuerpo.map(x => ({ carrier: carrierDe(x)?.carrier ?? null, motivo: "sin asunto, sin cuerpo visible o demasiado largo para mostrarse completo: no se puede mostrar el texto exacto" })),
            ...enProceso.map(x => ({ carrier: carrierDe(x)?.carrier ?? null, motivo: estadoCrudo.get(x.id) === "sending" ? "en proceso (Rateware lo está enviando)" : "en proceso o estado no confirmado" }))
          ],
          ya_enviadas_u_otras: invitaciones.length - enviables.length } };
    },

    async whatsapp_intento(a: { event_id: string; carrier_id: string; ventana: "intento_4" | "48h" | "24h" }) {
      if (a.ventana !== "intento_4") throw new Rechazo("VENTANA_NO_DISPONIBLE", "Los recordatorios 48 h y 24 h antes del cierre (a quien respondió sin tarifa) llegan con la cadencia de fr8bid#72; hoy solo el 4º intento por WhatsApp. Rateware ya los acepta (rateware PR #215).", 400);
      const d = await leer(a.event_id);
      // PRIMA: sin avisos por decisión del propietario (17-nov-2026).
      if (eventoSinAvisos(d.evento)) throw new Rechazo("EVENTO_SIN_AVISOS", `${BLOQUEO_SIN_AVISOS.motivo}. No se preparó nada.`);
      // Mismas reglas que los intentos por correo: evento abierto y respuestas consultadas.
      const bloqueo = bloqueoIntentos(d);
      if (bloqueo) throw new Rechazo(d.respuestas == null ? "SIN_RESPUESTAS" : "NO_PERMITIDO", `${bloqueo} No se preparó nada.`);
      const w = intentosWhatsapp(d, ahora(), hoy()).find(x => x.s.carrierId === a.carrier_id);
      if (!w) throw new Rechazo("NO_TOCA", "A ese carrier no le toca el intento por WhatsApp (no agotó los 3 correos, ya respondió u ofertó, aún no pasan 12 h o no está en el evento).");
      // Base de permiso y estado de la plantilla, como los revisa Rateware al enviar.
      const [vendors, plantillas, whatsapps] = await Promise.all([crudo({ action: "list_vendors", ids: [a.carrier_id], lightweight: true }), crudo({ action: "list_outreach_templates" }),
        crudo({ action: "list_outreach_messages", rfx_event_id: d.evento.id, channel: "whatsapp" })]);
      if (recordatorioYaEnviado(whatsapps.rows ?? whatsapps.messages, d.evento.id, a.carrier_id, a.ventana)) throw new Rechazo("YA_ENVIADO", `${w.s.carrier} ya recibió este WhatsApp por Meta (o se está enviando); no se repite.`);
      const vendor = (Array.isArray(vendors.rows) ? vendors.rows : []).find((v: any) => v?.id === a.carrier_id);
      const plantilla = estadoPlantilla(plantillas.rows);
      const permiso: string | null | undefined = vendor ? vendor.whatsapp_permission_basis ?? null : undefined;
      const bloqueos = bloqueosMeta(w, permiso, plantilla);
      if (bloqueos.length) {
        const pendiente = bloqueos.length === 1 && bloqueos[0].codigo === "plantilla_no_aprobada";
        throw new Rechazo(pendiente ? "PLANTILLA_NO_APROBADA" : "NO_LISTO_PARA_META", `${bloqueos.map(b => b.motivo).join(" ")} No se preparó nada; el respaldo manual (texto y liga wa.me) está en whatsapp_pendientes.`);
      }
      const variables = variablesRecordatorio(d, w.s.carrier);
      const numero = `+${w.numero}`;
      return { act: "whatsapp_intento", ev: d.evento.id, evento: resumenEvento(d), arg: { event_id: d.evento.id, carrier_id: a.carrier_id, ventana: a.ventana },
        cuerpos: [
          { action: "prepare_whatsapp_rfx_reminder", purpose: "rfx_reminder", rfx_event_id: d.evento.id, vendor_id: a.carrier_id, reminder_window: VENTANA_RATEWARE[a.ventana] },
          { action: "send_whatsapp_outreach_messages", rfx_event_id: d.evento.id, ids: [RECORDATORIO], expected_versions: [RECORDATORIO], confirmed: true, confirmation_action: "send_whatsapp_outreach_messages" }
        ],
        // Lo aprobado que no viaja en los cuerpos: plantilla, destinatario y {{1}}..{{3}} (confirmar los compara con Rateware).
        fijo: { plantilla: PLANTILLA_RECORDATORIO.nombre, idioma: PLANTILLA_RECORDATORIO.idioma, para: numero, variables },
        foto: { carrier: a.carrier_id, numero, crudo: w.s.whatsapp, no_contactar: w.s.whatsappNoContactar, permiso, plantilla: plantilla.estado, intentos: w.s.intentos, estado: w.s.estado, plazo: d.evento.plazo },
        vista: { canal: `WhatsApp por Meta con la plantilla aprobada ${PLANTILLA_RECORDATORIO.nombre} (${PLANTILLA_RECORDATORIO.categoria}, ${PLANTILLA_RECORDATORIO.idioma}). Al confirmar SE ENVÍA 1 mensaje a este carrier.`,
          carrier: w.s.carrier, para: enmascarar(w.numero), pais: w.telefono.pais,
          variables: { "{{1}} carrier": variables[0], "{{2}} evento": variables[1], "{{3}} cierre": variables[2], "{{4}} liga": "liga privada del Bid Room del carrier (la pone Rateware; no se muestra aquí)" },
          texto: textoRecordatorio(variables),
          efecto: "Rateware vuelve a revisar número, «no contactar», permiso y plantilla APROBADA contra Meta justo antes de enviar, y no repite el mismo recordatorio. No toca ofertas ni el estado del carrier." } };
    },

  };

  async function preparar(nombre: NombreEscritura, args: Record<string, unknown>) {
    const a: any = herramientasEscritura[nombre].schema.parse(args);
    const act = nombre === "preparar_invitacion" ? `invitacion_${a.fase}` : nombre.replace(/^preparar_/, "");
    if (!permite(ctx.rol, ROL_ACCION[act])) throw new Rechazo("SIN_PERMISO", `Esta acción es del ${ROL_ACCION[act] === "admin" ? "Administrador" : "Operador"}.`, 403);
    if (!ctx.secreto) throw PENDIENTE();
    if (esProtegido(a.event_id)) throw new Rechazo("EVENTO_PROTEGIDO", "Evento protegido.", 404);
    const secreto = ctx.secreto;
    const limite = Math.min(ctx.limiteToken ?? LIMITE_TOKEN, LIMITE_TOKEN);
    const firmarPlan = (p: Plan) => firmar({ sub: ctx.userId, client_id: ctx.clientId, act, ev: p.ev, arg: p.arg, cuerpos: p.cuerpos, fijo: p.fijo, pre: huella(p.foto) }, secreto, ahora());
    const plan = await planes[act](a);
    if (plan.bloqueos?.length) return { estado: "bloqueada", escrito: false, accion: act,
      evento: plan.evento, vista_previa: plan.vista, blocking: plan.bloqueos, mesa_url: ligaMesa(plan.ev),
      instruccion: plan.bloqueos.map(code => bloqueoReapertura[code] ?? "Pide revisión administrativa en Fr8Bid.").join(" ") };
    const firma = await firmarPlan(plan);
    if (firma.token.length <= limite)
      return { estado: "vista_previa", escrito: false, accion: act, evento: plan.evento, vista_previa: plan.vista, confirmacion_id: firma.token, vence_en: firma.vence, mesa_url: ligaMesa(plan.ev),
        instruccion: act === "reapertura_evento"
          ? "Muestra el evento y el nuevo plazo. Pide al propietario una respuesta breve como «Sí, confirmo» y usa su texto literal en frase_ok."
          : "Nada se escribió. Muestra esta vista previa completa (destinatarios, canal y texto) y pide un «sí» explícito. Solo después llama a confirmar con este confirmacion_id y frase_ok = el texto literal de esa respuesta." };
    // No cabe en un confirmacion_id: se parte por carrier (nunca dentro de un carrier, para que
    // confirmar una parte no deje a las demás bloqueadas), cada parte con su vista previa.
    const ids = plan.arg.participacion_ids as string[] | undefined;
    const grupos = plan.grupos;
    if (!PARTIBLES.has(act) || !ids || !grupos || grupos.length < 2) {
      const solo = grupos?.length === 1 ? ` ${grupos[0].carrier} por sí solo excede el límite (${grupos[0].ids.length} participaciones): márcalo por rutas en partes o hazlo en la página del evento.` : "";
      throw new Rechazo("DEMASIADO_GRANDE", `La vista previa no cabe en una sola confirmación; acota la selección.${solo}`, 413);
    }
    const porId = firma.token.length / ids.length;
    let objetivo = limite * 0.9;
    for (;;) {
      const bloques: { carrier: string; ids: string[]; n: number }[] = [];
      let actual: { carrier: string; ids: string[]; n: number } | null = null;
      for (const g of grupos) {
        if (actual && (actual.ids.length + g.ids.length) * porId > objetivo) { bloques.push(actual); actual = null; }
        actual = actual ? { carrier: actual.carrier, ids: [...actual.ids, ...g.ids], n: actual.n + 1 } : { carrier: g.carrier, ids: [...g.ids], n: 1 };
      }
      if (actual) bloques.push(actual);
      const partes: Record<string, unknown>[] = [];
      let cabe = true;
      for (const b of bloques) {
        const p = await planes[act]({ ...plan.arg, participacion_ids: b.ids });
        const f = await firmarPlan(p);
        if (f.token.length <= limite) { partes.push({ vista_previa: p.vista, confirmacion_id: f.token, vence_en: f.vence }); continue; }
        if (b.n === 1) throw new Rechazo("DEMASIADO_GRANDE", `${b.carrier} por sí solo excede el límite de una confirmación (${b.ids.length} participaciones). Acota sus rutas o hazlo en la página del evento.`, 413);
        cabe = false;
        break;
      }
      if (cabe) return { estado: "vista_previa", escrito: false, accion: act, evento: plan.evento, mesa_url: ligaMesa(plan.ev),
        partes: partes.map((x, i) => ({ parte: i + 1, de: partes.length, ...x })),
        instruccion: `Nada se escribió. La selección no cabe en una sola confirmación: son ${partes.length} partes (cada carrier completo en una sola). Muestra cada parte completa y pide un «sí» explícito para cada una; confirma cada confirmacion_id por separado.` };
      objetivo = objetivo / 2;
    }
  }

  async function confirmar(args: Record<string, unknown>) {
    const a = herramientasEscritura.confirmar.schema.parse(args);
    const log: Record<string, unknown> = { tipo: "fr8bid_mcp_confirmar", usuario: ctx.userId, cliente: ctx.clientId, rol: ctx.rol, en: ahora().toISOString() };
    try {
      if (!permite(ctx.rol, "operator")) throw new Rechazo("SIN_PERMISO", "Tu rol es de consulta.", 403);
      if (!ctx.secreto) throw PENDIENTE();
      const frase = (a.frase_ok ?? "").trim();
      if (!frase) throw new Rechazo("SIN_SI", "Falta la confirmación explícita del usuario (frase_ok). Muestra la vista previa y espera su «sí».", 400);
      let c;
      try { c = await verificar(a.confirmacion_id, ctx.secreto, ahora()); }
      catch { throw new Rechazo("CONFIRMACION_INVALIDA", "La confirmación no es válida o venció (15 min). Vuelve a preparar la vista previa.", 400); }
      Object.assign(log, { accion: c.act, event_id: c.ev, h: c.h, jti: c.jti });
      if (c.sub !== ctx.userId || c.client_id !== ctx.clientId) throw new Rechazo("OTRA_SESION", "Esta confirmación es de otra sesión o cliente.", 403);
      const minimo = ROL_ACCION[c.act];
      if (!minimo || !planes[c.act]) throw new Rechazo("ACCION", "Acción no disponible en el MCP.", 400);
      if (!permite(ctx.rol, minimo)) throw new Rechazo("SIN_PERMISO", "Tu rol ya no permite esta acción.", 403);
      const email = String(ctx.email ?? "").toLowerCase();
      if (!(ctx.aprobadores ?? APROBADORES_POR_OMISION).includes(email.trim()) ||
          (c.act === "reapertura_evento" && email !== PROPIETARIO_REAPERTURA))
        throw new Rechazo("SOLO_PROPIETARIO", "Solo el propietario puede confirmar esto. El propietario debe preparar y confirmar su propia vista previa.", 403);
      if (c.act === "reapertura_evento") {
        if (frase.length > 100 || !esAfirmacion(frase, AFIRMATIVAS_REAPERTURA))
          throw new Rechazo("SIN_SI", "Para reabrir hace falta una afirmación como «Sí, confirmo», de hasta 100 caracteres.", 400);
      } else if (!esAfirmacion(frase)) {
        throw new Rechazo("NO_CONFIRMADO", "La respuesta del usuario no es un «sí» explícito (sí, confirmo, adelante, hazlo…). No se escribió nada.", 400);
      }
      log.frase_ok = frase.slice(0, 100);
      if (huellaCuerpos(c.cuerpos, c.fijo) !== c.h) throw new Rechazo("ALTERADA", "La confirmación no coincide con su vista previa.", 400);
      if (esProtegido(c.ev) || c.cuerpos.some(b => !ESCRITURAS_MCP.has(String(b.action)) || ![b.event_id, b.rfx_event_id].includes(c.ev))) throw new Rechazo("ALTERADA", "La confirmación no coincide con su vista previa.", 400);
      if (c.act === "reapertura_evento") {
        // La relectura de versión y dependencias se hace con el candado del evento
        // en Rateware. La misma operación devuelve el recibo sin volver a aplicarla.
        const body = c.cuerpos[0];
        if (c.cuerpos.length !== 1 || body.action !== "reopen_rfx_event_if_unchanged" || !id.safeParse(c.jti).success) {
          throw new Rechazo("ALTERADA", "La confirmación no coincide con su vista previa.", 400);
        }
        const { organizacionId, secretoReapertura } = ctx;
        if (!organizacionId || !secretoReapertura || secretoReapertura.length < 32) throw reaperturaNoConfigurada();
        if ((c.fijo as { organizacion_id?: string } | undefined)?.organizacion_id !== organizacionId) {
          throw new Rechazo("OTRA_SESION", "La organización cambió desde la vista previa.", 403);
        }
        // Este contrato se verifica en Rateware con el actor del acceso OAuth.
        const approval_signature = createHmac("sha256", secretoReapertura).update(JSON.stringify([
          "fr8bid.rfx.reopen.approval.v1", body.action, ctx.userId, organizacionId, body.event_id,
          body.new_due_date, body.expected_version, c.jti, body.reason, frase, c.exp,
        ])).digest("hex");
        const base = { accion: c.act, event_id: c.ev, operation_id: c.jti, mesa_url: ligaMesa(c.ev), reintentar: false };
        let r;
        try { r = await seguro("rateware-api", { ...body, operation_id: c.jti, approval_text: frase,
          approval_expires_at: c.exp, approval_signature }); }
        catch { r = { status: 504, body: {} }; }
        const recibo = r.body?.receipt;
        if (r.status === 200 && recibo?.operation_id === c.jti && recibo.event_id === c.ev &&
            recibo.actor_id === ctx.userId && recibo.organization_id === organizacionId &&
            recibo.status === "open" && recibo.due_date === body.new_due_date &&
            typeof recibo.committed_at === "string" && Number.isFinite(Date.parse(recibo.committed_at))) {
          let verificada = false;
          try {
            // list_rfx_detail can repair legacy invitation coverage on read.
            // Use the strictly read-only snapshot to reconcile this operation.
            const result = await crudo({ action: "preview_rfx_event_reopen", event_id: c.ev, new_due_date: body.new_due_date });
            const s = contextoReapertura.safeParse(result);
            verificada = s.success && s.data.snapshot.event_id === c.ev &&
              s.data.snapshot.status === "open" && s.data.snapshot.due_date === body.new_due_date;
          } catch { /* El recibo queda disponible para conciliación. */ }
          log.resultado = "aplicada";
          return { ...base, estado: "aplicada", recibo, lectura_verificada: verificada,
            instruccion: verificada ? "Rateware confirmó el recibo y el nuevo estado abierto."
              : "Rateware registró el recibo. Revisa el estado actual en Fr8Bid antes de continuar." };
        }
        const codigo = accionNoDesplegada(r.status, r.body) ? "ACCION_NO_DESPLEGADA" : String(r.body?.code || "REAPERTURA_NO_CONFIRMADA");
        const estado = codigo === "REAPERTURA_NO_CONFIGURADA" ? "rechazada"
          : r.status < 400 || r.status >= 500 || r.body?.incierta ? "incierta" : "rechazada";
        log.resultado = estado;
        return { ...base, estado, codigo,
          instruccion: estado === "incierta" ? "Consulta el evento y su recibo antes de cualquier nueva acción."
            : bloqueoReapertura[codigo] ?? "Revisa el estado actual en la página del evento en Fr8Bid." };
      }
      // Relectura: si el evento ya no está como en la vista previa (o ya se aplicó), no se escribe.
      let plan: Plan;
      try { plan = await planes[c.act](c.arg); }
      catch (e) { if (e instanceof Rechazo) throw new Rechazo("YA_APLICADO_O_CAMBIO", `Ya aplicado o el evento cambió: ${e.message} No se escribió nada.`); throw e; }
      if (plan.ev !== c.ev || huella(plan.foto) !== c.pre || huellaCuerpos(plan.cuerpos, plan.fijo) !== c.h)
        throw new Rechazo("YA_APLICADO_O_CAMBIO", "Ya aplicado o el evento cambió desde la vista previa. Vuelve a preparar; no se escribió nada.");
      const pasos: Record<string, unknown>[] = [];
      const efectos: Efecto["efecto"][] = [];
      const omisiones: Efecto["omisiones"] = [];
      let corte: "incierta" | "rechazada" | null = null;
      let campana: string | null = null;
      let campanaCreada: string | null = null;
      let envio: Record<string, unknown> | null = null;
      let recordatorio: { id: string; updated_at: string; aprobacion: unknown } | null = null;
      let mensajeWhatsapp: string | null = null;
      const conflictos = new Set<string>();
      let noDesplegadaEn: string | null = null;
      for (const original of c.cuerpos) {
        let body = original.campaign_id === CAMPANA_NUEVA ? { ...original, campaign_id: campana } : original;
        if (Array.isArray(original.ids) && original.ids[0] === RECORDATORIO) {
          if (!recordatorio) { corte = "rechazada"; break; }
          body = { ...original, ids: [recordatorio.id], expected_versions: [{ id: recordatorio.id, updated_at: recordatorio.updated_at, whatsapp_approval: recordatorio.aprobacion }] };
        }
        let r;
        try { r = await seguro("rateware-api", body); }
        catch { r = { status: 504, body: { code: "SIN_RESPUESTA", incierta: true }, headers: {} }; }
        const exito = r.status >= 200 && r.status < 300;
        // Un 2xx sin la forma esperada (JSON inválido, «incierta», sin contadores) NO es éxito.
        const invalida = exito && !respuestaValida(String(body.action), r.body, (body.ids as string[] | undefined)?.length ?? 0);
        const ok = exito && !invalida;
        const noDesplegada = accionNoDesplegada(r.status, r.body);
        const conflicto = r.status === 409 && !ACCIONES_WHATSAPP.has(String(body.action)) && Object.hasOwn(CONFLICTOS_CONDICIONALES, String(r.body?.code)) ? String(r.body.code) : null;
        const rechazoWhatsapp = !ok && ACCIONES_WHATSAPP.has(String(body.action)) && Object.hasOwn(RECHAZOS_WHATSAPP, String(r.body?.code)) ? RECHAZOS_WHATSAPP[String(r.body.code)] : null;
        if (rechazoWhatsapp) mensajeWhatsapp = rechazoWhatsapp;
        const paso: Record<string, unknown> = { accion: body.action, status: r.status, ok, codigo: ok ? null : invalida ? "RESPUESTA_INVALIDA" : noDesplegada ? "ACCION_NO_DESPLEGADA" : String(r.body?.code || r.status),
          ...(r.status === 423 ? { mensaje: "Rateware real tiene las escrituras de Fr8Bid cerradas (FR8BID_ESCRITURAS_REALES). Hazlo en la página del evento en Fr8Bid o pide la aprobación del propietario." } : {}),
          ...(noDesplegada ? { mensaje: mensajeNoDesplegada(String(body.action)) } : {}),
          ...(rechazoWhatsapp ? { mensaje: rechazoWhatsapp } : {}),
          ...(conflicto ? { mensaje: CONFLICTOS_CONDICIONALES[conflicto] } : {}),
          ...(invalida ? { mensaje: "Respuesta no confirmada: revisa en la página del evento antes de repetir." } : {}) };
        pasos.push(paso);
        // 409 de una escritura condicional: esa participación (o el plazo) no se tocó; las demás
        // participaciones de la misma confirmación son independientes y siguen.
        if (conflicto) {
          paso.efecto = "nulo";
          efectos.push("nulo");
          conflictos.add(conflicto);
          omisiones.push({ id: String(body.id ?? body.event_id ?? ""), motivo: CONFLICTOS_CONDICIONALES[conflicto] });
          continue;
        }
        if (!ok) { corte = invalida || r.status === 504 || r.body?.incierta ? "incierta" : "rechazada"; if (noDesplegada) noDesplegadaEn = String(body.action); break; }
        if (body.action === "prepare_whatsapp_rfx_reminder") {
          // {{1}}..{{3}} que rellenó Rateware contra los aprobados; {{4}} es la liga privada (no se muestra).
          const valores = (r.body.preview.parameters as any[]).map(x => String(x?.value ?? ""));
          const aprobados = ((c.fijo as any)?.variables ?? []) as string[];
          if (aprobados.length !== 3 || aprobados.some((v, i) => v !== valores[i]) || !valores[3]?.trim() || r.body.preview.template_name !== PLANTILLA_RECORDATORIO.nombre) {
            paso.ok = false;
            paso.codigo = "TEXTO_DISTINTO";
            paso.mensaje = "Rateware armó un texto distinto al de la vista previa: no se envió. Vuelve a preparar.";
            omisiones.push({ id: String(r.body.row.id), motivo: "Borrador del WhatsApp creado en Rateware pero NO enviado (texto distinto a la vista previa)." });
            corte = "rechazada";
            break;
          }
          recordatorio = { id: String(r.body.row.id), updated_at: String(r.body.row.updated_at), aprobacion: r.body.whatsapp_approval };
          // El borrador solo prepara el envío: el efecto se mide en el paso siguiente.
          paso.efecto = "preparado";
          continue;
        }
        if (body.action === "create_outreach_campaign") {
          // Crear la campaña persiste aunque lo siguiente falle: cuenta como efecto.
          campana = String(r.body.row.id);
          campanaCreada = r.body.reused === true ? null : campana;
          paso.efecto = "completo";
          if (campanaCreada) efectos.push("completo");
          continue;
        }
        // Resultado contra lo aprobado: generados/omitidos, enviados/fallidos, estado reflejado.
        let respuesta = r.body;
        const patch = body.patch as Record<string, unknown> | undefined;
        const campos = body.action === "capture_rfx_bid_if_empty" ? ["bid_rate", ...CAMPOS_CAPTURA] : body.action === "mark_rfx_replied_if_empty" ? ["invitation_status", "notes"] : [];
        if (campos.some(k => k in (patch ?? {}) && !(k in (respuesta.row ?? {})))) {
          // Rateware no devolvió algún campo aprobado: se relee el detalle antes de darlo por bueno.
          try {
            const det = await crudo({ action: "list_rfx_detail", event_id: c.ev });
            const fila = (det.lanes || []).flatMap((l: any) => l.invitations || []).find((v: any) => v.id === body.id);
            if (fila) respuesta = { ...respuesta, row: { ...fila, ...respuesta.row } };
          } catch { /* sin relectura: los campos ausentes quedan «no confirmado» */ }
        }
        const ef = evaluarEfecto(body, respuesta);
        paso.efecto = ef.efecto;
        efectos.push(ef.efecto);
        omisiones.push(...ef.omisiones);
        if (body.action === "send_outreach_messages" || body.action === "send_whatsapp_outreach_messages") {
          const res = leerResultado(r.body, (body.ids as string[]) || []);
          envio = { enviados: res.sent, fallidos: res.failed, omitidos: res.skipped, inciertos: res.delivery_unknown };
        }
      }
      const generado = pasos.some(x => x.accion === "generate_outreach_drafts" && x.efecto === "completo");
      if (campanaCreada && !generado) omisiones.unshift({ id: campanaCreada, motivo: `Campaña creada (${campanaCreada}), borradores no generados.` });
      const algo = efectos.some(e => e !== "nulo");
      const estado = corte === "incierta" || efectos.includes("incierto") ? "incierta"
        : corte === "rechazada" ? (algo ? "parcial" : "rechazada")
        : efectos.length && efectos.every(e => e === "completo") ? "aplicada"
        : !algo ? "sin_efecto" : "parcial";
      log.resultado = estado;
      const lista = [...conflictos];
      return { estado, accion: c.act, event_id: c.ev, pasos, ...(omisiones.length ? { omisiones } : {}), ...(envio ? { envio } : {}), ...(lista.length ? { conflictos: lista } : {}), mesa_url: ligaMesa(c.ev),
        instruccion: noDesplegadaEn ? `${mensajeNoDesplegada(noDesplegadaEn)}${estado === "parcial" ? " Lo anterior sí se aplicó (ver pasos)." : ""}`
          : mensajeWhatsapp && estado !== "aplicada" ? mensajeWhatsapp
          : lista.length && estado !== "aplicada" ? `${lista.map(k => CONFLICTOS_CONDICIONALES[k]).join(" ")}${estado === "parcial" ? " El resto sí se aplicó (ver omisiones)." : ""} No reintentes automáticamente.`
          : estado === "aplicada" ? "Hecho: Rateware reflejó todo lo aprobado." : estado === "incierta"
          ? "Resultado incierto: Rateware no confirmó. No reintentes; revisa en la página del evento antes de repetir."
          : estado === "sin_efecto" ? "Rateware no aplicó nada de lo aprobado (ver omisiones). No reintentes; revisa en la página del evento."
          : estado === "parcial" ? "Se aplicó solo una parte (ver omisiones). No reintentes automáticamente; revisa en la página del evento."
          : "No se completó. No reintentes automáticamente; revisa la página del evento en Fr8Bid." };
    } catch (e) {
      log.resultado = e instanceof Rechazo ? `rechazada:${e.codigo}` : "error";
      throw e;
    } finally {
      registrar(log);
    }
  }

  return async (nombre: string, args: Record<string, unknown>): Promise<Record<string, any>> => {
    if (!Object.hasOwn(herramientasEscritura, nombre)) throw new Rechazo("FUERA_DEL_MCP", "Herramienta fuera del MCP.", 400);
    if (nombre === "preparar_evento" || nombre === "confirmar_creacion_evento") return crearEventos(t, ctx)(nombre, args);
    if (nombre === "confirmar") return confirmar(args);
    return preparar(nombre as NombreEscritura, args);
  };
}
