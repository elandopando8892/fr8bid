import { z } from "zod";
import { ErrorApi, MesaApi, type Transporte } from "../cliente/api.js";
import { LECTURAS, sinSecretos } from "../servidor/proxy.js";
import { sinProtegidos } from "../servidor/paso.js";
import { esProtegido } from "../dominio/protegidos.js";
import { hoyMexico, versionVigente } from "../dominio/recorrido.js";
import { claveIntento, intentosPorPreparar, textoIntento } from "../dominio/seguimiento.js";
import { audienciaInvitacion, estadoRevision, resumenOmisiones } from "../dominio/revision.js";
import { REMITENTE, campanaDelEvento, campanaFr8bid, elegirPlantilla } from "../dominio/invitacion.js";
import { MAXIMO_POR_LLAMADA, leerResultado, requiereAtencion } from "../dominio/tandas.js";
import type { Aviso, Detalle, Participacion, Rol, Ruta } from "../dominio/tipos.js";
import { firmar, huella, huellaCuerpos, verificar } from "./confirmacion.js";
import { ESCRITURAS_MCP } from "./transporte.js";

// Entrega 2 del MCP: cambios con vista previa y «sí» explícito. preparar_* solo
// lee y firma la vista previa; confirmar escribe por el proxy (/api/rateware).
// Fuera del MCP (se hacen en la Mesa, con su liga): adjudicar, limpiar
// adjudicación, entregar a Rateware y avisos de adjudicación.

const APP = "https://fr8bid.heymarksman.com";
export const ligaMesa = (id: string) => `${APP}/eventos/${encodeURIComponent(id)}`;
export const FUERA_DEL_MCP = ["award_rfx_lane_vendor", "clear_rfx_award", "closeout_awarded_rfx_to_rateware", "generate_rfx_award_notices"];
// PRIMA nunca se cierra ni se rechaza desde el chat (decisión del propietario).
const FOLIOS_SIN_CIERRE = new Set(["rfx-1021-primapro"]);
export const esPrima = (folio: unknown) => FOLIOS_SIN_CIERRE.has(String(folio ?? "").trim().toLowerCase());
const CAMPANA_NUEVA = "$campana_creada";

const id = z.string().regex(/^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Fecha inválida");
const ids = z.array(id).min(1).max(100);
const vista = "Solo lee y devuelve una vista previa con confirmacion_id; no escribe nada. Muestra la vista previa completa y pide un «sí» explícito antes de llamar a confirmar.";

export const herramientasEscritura = {
  preparar_intentos: { rol: "operator" as Rol, descripcion: `Seguimiento (2º/3º intento por correo) a carriers que no han contestado, según la cadencia; excluye a quien ya respondió u ofertó. Al confirmar quedan como BORRADOR en la Cola de Rateware (no se envían). ${vista}`,
    schema: z.object({ event_id: id, participacion_ids: ids.optional() }).strict() },
  preparar_ya_respondio: { rol: "operator" as Rol, descripcion: `Marca que un carrier respondió o rechazó sin tarifa (lo saca de los intentos). Indica carrier_id o participacion_ids. Nunca sobre una participación con oferta. ${vista}`,
    schema: z.object({ event_id: id, carrier_id: id.optional(), participacion_ids: ids.optional(), respuesta: z.enum(["respondio", "rechazo"]), canal: z.enum(["email", "whatsapp", "phone"]), nota: z.string().trim().max(300).default("") }).strict() },
  preparar_captura: { rol: "operator" as Rol, descripcion: `Captura una oferta all-in que llegó por otro canal en una participación SIN oferta (nunca modifica una existente). Muestra all-in vs target. ${vista}`,
    schema: z.object({ event_id: id, participacion_id: id, tarifa: z.number().positive().max(1_000_000), moneda: z.string().regex(/^[A-Z]{3}$/), vigencia: fecha.nullable().default(null), capacidad_semanal: z.number().int().min(0).max(10_000).nullable().default(null), dias_transito: z.number().int().min(0).max(90).nullable().default(null), canal: z.enum(["email", "phone", "whatsapp", "other"]), nota: z.string().trim().max(500).default("") }).strict() },
  preparar_revision: { rol: "admin" as Rol, descripcion: `Administrador: marca «Revisado» a un carrier preseleccionado para que pueda recibir invitación. No envía nada. ${vista}`,
    schema: z.object({ event_id: id, carrier_id: id }).strict() },
  preparar_invitacion: { rol: "operator" as Rol, descripcion: `Invitación por tandas. fase «borradores» (Operador): genera borradores solo para carriers con «Revisado» vigente, no envía. fase «envio» (Administrador): envía por Gmail una tanda de hasta ${MAXIMO_POR_LLAMADA} borradores con su versión exacta. ${vista}`,
    schema: z.object({ event_id: id, fase: z.enum(["borradores", "envio"]) }).strict() },
  preparar_cambio_evento: { rol: "admin" as Rol, descripcion: `Administrador: SOLO extiende el plazo (fecha nueva posterior a la actual y a hoy) de un evento abierto o en borrador. No cierra, no publica, no cambia estado. ${vista}`,
    schema: z.object({ event_id: id, nueva_fecha: fecha }).strict() },
  confirmar: { rol: "operator" as Rol, descripcion: "Ejecuta una vista previa ya mostrada. confirmacion_id = el de preparar_*; frase_ok = el texto literal con el que el usuario dijo «sí» (vacío = rechazo). Vence a los 15 min, vuelve a comprobar el evento y no reintenta. Adjudicar, entregar a Rateware y avisos de adjudicación no están aquí: se hacen en la Mesa.",
    schema: z.object({ confirmacion_id: z.string().min(20).max(60000), frase_ok: z.string().max(300).optional() }).strict() }
};
export type NombreEscritura = keyof typeof herramientasEscritura;

// Rol mínimo por acción firmada (se comprueba al preparar Y al confirmar).
const ROL_ACCION: Record<string, Rol> = {
  intentos: "operator", ya_respondio: "operator", captura: "operator", revision: "admin",
  invitacion_borradores: "operator", invitacion_envio: "admin", cambio_evento: "admin"
};
const RANGO: Record<Rol, number> = { viewer: 0, operator: 1, admin: 2 };
const permite = (rol: Rol, minimo: Rol) => RANGO[rol] >= RANGO[minimo];

/** Rechazo de negocio: el mensaje es nuestro y se puede mostrar. */
export class Rechazo extends Error {
  constructor(public codigo: string, mensaje: string, public status = 409) { super(mensaje); }
}
const PENDIENTE = () => new Rechazo("CONFIRMACIONES_PENDIENTES", "Confirmaciones pendientes de configurar (falta FR8BID_MCP_CONFIRM_SECRET). Las consultas siguen disponibles; este cambio hazlo en la Mesa.", 503);
// frase_ok: lista blanca de afirmaciones explícitas. Cualquier negación o duda
// la invalida aunque también diga «sí».
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim().replace(/\s+/g, " ");
const AFIRMATIVAS = new Set(["si", "confirmo", "ok", "okay", "adelante", "dale", "hazlo", "envialo", "enviala", "envialos", "envialas", "autorizo", "yes", "confirm", "procede"]);
const DUDAS = /\b(no|nel|espera|esperar|esperemos|quiza|quizas|tal vez|duda|dudas|dudo|luego|despues|por ahora|todavia|aun|cancela|cancelar|alto|detente|pero)\b/;
export function esAfirmacion(frase: string): boolean {
  const n = normalizar(frase);
  if (!n || DUDAS.test(n)) return false;
  return n.split(" ").every(p => AFIRMATIVAS.has(p));
}

/** 2xx con la forma que esa acción devuelve; si no, el resultado no está confirmado. */
export function respuestaValida(action: string, b: any, enviados: number): boolean {
  if (!b || typeof b !== "object" || Array.isArray(b) || b.incierta || b.error) return false;
  const fila = (x: any) => !!x && typeof x === "object" && !Array.isArray(x);
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0;
  switch (action) {
    case "draft_bid_room_carrier_message": return fila(b.outreach_message) && !!b.outreach_message.id;
    case "create_outreach_campaign": return fila(b.row) && !!b.row.id;
    case "update_rfx_bid": case "record_rfx_invitation_wave_review": case "update_rfx_event": return fila(b.row);
    case "generate_outreach_drafts": return Array.isArray(b.rows);
    case "send_outreach_messages": return num(b.sent) && num(b.failed) && b.sent <= enviados;
    default: return false;
  }
}

export interface ContextoEscrituras {
  userId: string;
  clientId: string;
  rol: Rol;
  secreto: Uint8Array | null;
  ahora?: () => Date;
  registrar?: (entrada: Record<string, unknown>) => void;
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
}

export function crearEscrituras(t: Transporte, ctx: ContextoEscrituras) {
  const ahora = ctx.ahora ?? (() => new Date());
  const hoy = () => hoyMexico(ahora());
  const registrar = ctx.registrar ?? ((e: Record<string, unknown>) => console.info(JSON.stringify(e)));
  // Lista cerrada también aquí, además del transporte HTTP: lecturas + ESCRITURAS_MCP.
  const seguro: Transporte = async (s, body) => {
    const action = String(body.action);
    if (s !== "rateware-api" || !(LECTURAS[s].has(action) || ESCRITURAS_MCP.has(action))) throw new Rechazo("FUERA_DEL_MCP", "Acción fuera del MCP.", 403);
    for (const k of ["event_id", "rfx_event_id", "id"]) if (esProtegido(body[k])) throw new Rechazo("EVENTO_PROTEGIDO", "Evento protegido.", 404);
    if (action === "update_rfx_event") {
      const patch = body.patch as Record<string, unknown> | undefined;
      if (!patch || Object.keys(patch).join(",") !== "due_date") throw new Rechazo("SOLO_PLAZO", "Desde el chat solo se extiende el plazo.", 403);
    }
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
  const resumenEvento = (d: Detalle) => ({ id: d.evento.id, folio: d.evento.folio, nombre: d.evento.nombre, estado: d.evento.estado, plazo: d.evento.plazo });
  const todas = (d: Detalle) => d.rutas.flatMap(r => r.participaciones.map(p => ({ r, p })));
  const rutaTxt = (r: Ruta) => `#${r.numero} ${r.origen} → ${r.destino} (${r.equipo})`;
  const conOferta = (p: Participacion) => p.versiones.length > 0 || versionVigente(p) !== null;

  const planes: Record<string, (a: any) => Promise<Plan>> = {
    async intentos(a: { event_id: string; participacion_ids?: string[] }) {
      const d = await leer(a.event_id);
      // null (falló) o undefined (no disponible, PASO_EN_RATEWARE): sin saber quién respondió no se insiste.
      if (d.respuestas == null) throw new Rechazo("SIN_RESPUESTAS", "No se pudo saber quién ya respondió; intenta más tarde. No se preparó nada.");
      let lista = intentosPorPreparar(d, ahora(), hoy());
      if (a.participacion_ids) lista = lista.filter(x => a.participacion_ids!.includes(x.participacion.id));
      if (!lista.length) throw new Rechazo("NADA_POR_PREPARAR", "Nadie tiene un intento pendiente por la cadencia (ya respondió, ya ofertó, ya está en la Cola o aún no toca).");
      lista.sort((x, y) => x.participacion.id.localeCompare(y.participacion.id));
      const cuerpos: Record<string, unknown>[] = [];
      for (const x of lista) cuerpos.push({ ...(await cuerpoDe(m => m.prepararIntento(d.evento.id, x.participacion.id, textoIntento(d, x.paso), claveIntento(d.evento.id, x.participacion.id, x.paso.intento)))), app_origin: APP });
      return { act: "intentos", ev: d.evento.id, evento: resumenEvento(d),
        arg: { event_id: d.evento.id, participacion_ids: lista.map(x => x.participacion.id) },
        cuerpos,
        // Destinatario fijado: si cambia el carrier o su correo, confirmar se niega.
        foto: lista.map(x => ({ p: x.participacion.id, carrier_id: x.s.carrierId, correo: x.s.correo, intento: x.paso.intento, estado: x.s.estado, en_cola: x.paso.enCola })),
        vista: {
          canal: "Correo. Al confirmar queda como BORRADOR en la Cola de Rateware; NO se envía hasta que el Administrador lo apruebe en la Mesa (Seguimiento) o en la Cola.",
          destinatarios: lista.map(x => ({ carrier: x.s.carrier, correo: x.s.correo, participacion_id: x.participacion.id, ruta: rutaTxt(x.ruta), intento: x.paso.intento, toco_en: x.paso.tocaEn, texto: textoIntento(d, x.paso) })),
          excluidos: "Quien ya respondió (correo, chat o marcado), ofertó, declinó o ya tiene borrador en la Cola no aparece."
        } };
    },

    async ya_respondio(a: { event_id: string; carrier_id?: string; participacion_ids?: string[]; respuesta: "respondio" | "rechazo"; canal: "email" | "whatsapp" | "phone"; nota: string }) {
      if (!!a.carrier_id === !!a.participacion_ids) throw new Rechazo("ARGUMENTOS", "Indica carrier_id o participacion_ids (solo uno).", 400);
      const d = await leer(a.event_id);
      const rechazo = a.respuesta === "rechazo";
      if (rechazo && esPrima(d.evento.folio)) throw new Rechazo("PRIMA_PROTEGIDO", "En PRIMA no se marca rechazo desde el chat; hazlo en la Mesa.", 403);
      let elegidas = todas(d).filter(x => a.participacion_ids ? a.participacion_ids.includes(x.p.id) : x.p.carrierId === a.carrier_id && !conOferta(x.p) && (x.p.estado === "invitada" || x.p.estado === "vista"));
      if (a.participacion_ids && elegidas.length !== new Set(a.participacion_ids).size) throw new Rechazo("AJENA", "Alguna participación no pertenece al evento.", 404);
      if (!elegidas.length) throw new Rechazo("NADA_POR_MARCAR", "Ese carrier no tiene participaciones invitadas sin oferta en este evento.");
      for (const { p, r } of elegidas) {
        if (conOferta(p)) throw new Rechazo("YA_OFERTO", `${p.carrier} ya tiene oferta en ${rutaTxt(r)}; no se marca respuesta sin tarifa.`);
        if (p.estado === (rechazo ? "declino" : "respondio")) throw new Rechazo("YA_MARCADA", `${p.carrier} ya está marcado así en ${rutaTxt(r)}.`);
        if (p.estado === "preseleccionada" || p.estado === "excluida") throw new Rechazo("NO_INVITADA", `${p.carrier} no está invitado en ${rutaTxt(r)}.`);
      }
      elegidas = [...elegidas].sort((x, y) => x.p.id.localeCompare(y.p.id));
      const cuerpos: Record<string, unknown>[] = [];
      for (const { p } of elegidas) cuerpos.push(await cuerpoDe(m => m.marcarRespondio({ eventId: d.evento.id, participacionId: p.id, rechazo, canal: a.canal, nota: a.nota })));
      return { act: "ya_respondio", ev: d.evento.id, evento: resumenEvento(d),
        arg: { event_id: d.evento.id, participacion_ids: elegidas.map(x => x.p.id), respuesta: a.respuesta, canal: a.canal, nota: a.nota },
        cuerpos,
        foto: elegidas.map(x => ({ p: x.p.id, estado: x.p.estado, versiones: x.p.versiones.length })),
        vista: { cambio: rechazo ? "Marcar que RECHAZÓ (declinó) sin tarifa" : "Marcar que RESPONDIÓ sin tarifa", canal_de_la_respuesta: a.canal,
          participaciones: elegidas.map(({ p, r }, i) => ({ carrier: p.carrier, ruta: rutaTxt(r), estado_actual: p.estado, nota_que_se_guarda: (cuerpos[i].patch as any).notes })),
          efecto: "Sale de los intentos de seguimiento. No envía nada ni toca ofertas." } };
    },

    async captura(a: { event_id: string; participacion_id: string; tarifa: number; moneda: string; vigencia: string | null; capacidad_semanal: number | null; dias_transito: number | null; canal: "email" | "phone" | "whatsapp" | "other"; nota: string }) {
      const d = await leer(a.event_id);
      const x = todas(d).find(x => x.p.id === a.participacion_id);
      if (!x) throw new Rechazo("AJENA", "La participación no pertenece al evento.", 404);
      const crudoDetalle = await crudo({ action: "list_rfx_detail", event_id: d.evento.id });
      const fila = (crudoDetalle.lanes || []).flatMap((l: any) => l.invitations || []).find((v: any) => v.id === a.participacion_id);
      const bidRate = fila?.bid_rate ?? null;
      if (conOferta(x.p) || bidRate !== null) throw new Rechazo("YA_HAY_OFERTA", "Esta participación ya tiene oferta; el MCP no modifica ofertas. Revísala en la Mesa.");
      if (x.p.estado === "excluida") throw new Rechazo("EXCLUIDA", "La participación está excluida.");
      const cuerpo = await cuerpoDe(m => m.capturarOferta({ eventId: d.evento.id, participacionId: x.p.id, tarifa: a.tarifa, moneda: a.moneda, vigencia: a.vigencia, capacidadSemanal: a.capacidad_semanal, diasTransito: a.dias_transito, canal: a.canal, notas: a.nota }));
      const misma = x.r.objetivo !== null && x.r.moneda === a.moneda;
      return { act: "captura", ev: d.evento.id, evento: resumenEvento(d),
        arg: { ...a, event_id: d.evento.id },
        cuerpos: [cuerpo],
        foto: { p: x.p.id, estado: x.p.estado, versiones: x.p.versiones.length, bid_rate: bidRate },
        vista: { ruta: rutaTxt(x.r), carrier: x.p.carrier, tarifa_all_in: a.tarifa, moneda: a.moneda, vigencia: a.vigencia, capacidad_semanal: a.capacidad_semanal, dias_transito: a.dias_transito,
          canal: a.canal, nota_de_origen: (cuerpo.patch as any).source_note,
          target: x.r.objetivo, moneda_target: x.r.moneda,
          all_in_vs_target: misma ? a.tarifa - (x.r.objetivo as number) : null,
          comparacion: misma ? (a.tarifa <= (x.r.objetivo as number) ? "en o bajo target" : "arriba del target") : "sin comparar: falta target o la moneda es distinta (no se convierten monedas)",
          efecto: "Registra la oferta como capturada por el Operador. No adjudica ni avisa al carrier." } };
    },

    async revision(a: { event_id: string; carrier_id: string }) {
      const d = await leer(a.event_id);
      if (d.evento.estado !== "abierto" && d.evento.estado !== "borrador") throw new Rechazo("EVENTO_NO_EDITABLE", "Solo en eventos abiertos o en borrador.");
      const x = todas(d).find(x => x.p.carrierId === a.carrier_id);
      if (!x) throw new Rechazo("AJENA", "El carrier no está en este evento.", 404);
      const e = estadoRevision(d, a.carrier_id);
      if (e === "sin_consulta") throw new Rechazo("SIN_CONSULTA", "No se pudo consultar la revisión; no se marca nada.");
      if (e === "revisado") throw new Rechazo("YA_REVISADO", `${x.p.carrier} ya tiene «Revisado» vigente.`);
      const cuerpo = await cuerpoDe(m => m.marcarRevisado(d.evento.id, { carrierId: x.p.carrierId, carrier: x.p.carrier, correo: x.p.correo }));
      return { act: "revision", ev: d.evento.id, evento: resumenEvento(d), arg: { event_id: d.evento.id, carrier_id: a.carrier_id }, cuerpos: [cuerpo],
        foto: { carrier: a.carrier_id, estado: e, en: d.revisiones?.[a.carrier_id]?.en ?? null },
        vista: { carrier: x.p.carrier, correo: x.p.correo, rutas: todas(d).filter(y => y.p.carrierId === a.carrier_id).map(y => rutaTxt(y.r)), estado_actual: e,
          efecto: "Marca «Revisado»: podrá recibir la invitación. No envía nada." } };
    },

    async invitacion_borradores(a: { event_id: string }) {
      const d = await leer(a.event_id);
      if (d.evento.estado !== "abierto" && d.evento.estado !== "borrador") throw new Rechazo("EVENTO_NO_EDITABLE", "Solo en eventos abiertos o en borrador.");
      if (!d.revisiones) throw new Rechazo("SIN_CONSULTA", "No se pudo consultar la revisión; no se invita a nadie.");
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
      const fijo = { plantilla: huella({ id: plantilla.id, asunto: plantilla.subject ?? null, cuerpo: plantilla.body ?? plantilla.text_body ?? plantilla.html_body ?? null, version: plantilla.updated_at ?? plantilla.version ?? null }), destinatarios };
      return { act: "invitacion_borradores", ev: d.evento.id, evento: resumenEvento(d), arg: { event_id: d.evento.id, fase: "borradores" }, cuerpos, fijo,
        foto: { revisados, campana: campana?.id ?? null, plantilla_id: String(plantilla.id), borradores: invitaciones.map(x => x.id).sort(), ...fijo },
        vista: { canal: `Correo (Gmail, ${REMITENTE}). Al confirmar se generan BORRADORES en la Cola; no se envía nada. El envío es la fase «envio» (Administrador).`,
          destinatarios: [...porCarrier.values()].map(p => ({ carrier: p.carrier, correo: p.correo })),
          texto: { plantilla: plantilla.name ?? null, asunto: plantilla.subject ?? null, cuerpo: plantilla.body ?? plantilla.text_body ?? null, nota: "Rateware llena la plantilla por carrier; el texto final exacto se muestra en la fase «envio»." },
          quedan_fuera: { resumen: resumenOmisiones(audiencia) || "Nadie.", carriers: [...new Map(audiencia.omitidas.map(o => [o.p.carrierId, { carrier: o.p.carrier, motivo: o.motivo }])).values()] },
          campana: campana ? "existente" : "se crea la campaña de Fr8Bid del evento (clave idempotente)" } };
    },

    async invitacion_envio(a: { event_id: string }) {
      const d = await leer(a.event_id);
      if (d.evento.estado !== "abierto") throw new Rechazo("EVENTO_NO_ABIERTO", "El evento no está abierto a ofertas. Publícalo en la Mesa; el MCP no publica.");
      const participaciones = todas(d).map(x => x.p);
      const carrierDe = (x: Aviso) => participaciones.find(p => p.id === x.participacionId);
      const revisada = (x: Aviso) => { const p = carrierDe(x); return Boolean(p && estadoRevision(d, p.carrierId) === "revisado"); };
      const invitaciones = d.avisos.filter(x => x.tipo === "invitacion" && !x.intento);
      // «en_cola» mezcla queued y sending: con el estado crudo solo se ofrecen los pendientes
      // de verdad (drafted, queued, failed). Uno en proceso (sending) no entra y no altera la tanda.
      const crudos = await crudo({ action: "list_outreach_messages", rfx_event_id: d.evento.id, channel: "email" });
      const estadoCrudo = new Map<string, string>(((crudos.rows ?? crudos.messages ?? []) as any[]).map(m => [String(m.id), String(m.status ?? "")]));
      const PENDIENTES = new Set(["drafted", "queued", "failed"]);
      const enProceso = invitaciones.filter(x => (x.estado === "borrador" || x.estado === "fallido" || x.estado === "en_cola") && !PENDIENTES.has(estadoCrudo.get(x.id) ?? ""));
      const enviables = invitaciones.filter(x => (x.estado === "borrador" || x.estado === "fallido" || x.estado === "en_cola") && PENDIENTES.has(estadoCrudo.get(x.id) ?? ""));
      const porEnviar = enviables.filter(revisada).sort((x, y) => x.id.localeCompare(y.id));
      const tanda = porEnviar.slice(0, MAXIMO_POR_LLAMADA);
      if (!tanda.length) throw new Rechazo("NADA_POR_ENVIAR", "No hay borradores de invitación listos de carriers revisados.");
      const cuerpo = await cuerpoDe(m => m.enviarAvisos(d.evento.id, tanda));
      return { act: "invitacion_envio", ev: d.evento.id, evento: resumenEvento(d), arg: { event_id: d.evento.id, fase: "envio" }, cuerpos: [cuerpo],
        foto: tanda.map(x => ({ id: x.id, version: x.version, estado: x.estado, crudo: estadoCrudo.get(x.id), revisado: revisada(x) })),
        vista: { canal: `Gmail desde ${REMITENTE}. Al confirmar SE ENVÍAN ${tanda.length} invitaciones con este texto exacto (versión aprobada).`,
          operation_id: cuerpo.operation_id,
          destinatarios: tanda.map(x => ({ carrier: carrierDe(x)?.carrier ?? null, para: x.destinatario, asunto: x.asunto, texto: x.cuerpo, estado: x.estado })),
          quedan_fuera: [
            ...enviables.filter(x => !revisada(x)).map(x => ({ carrier: carrierDe(x)?.carrier ?? null, motivo: carrierDe(x) ? `sin «Revisado» vigente (${estadoRevision(d, carrierDe(x)!.carrierId)})` : "participación no encontrada" })),
            ...porEnviar.slice(MAXIMO_POR_LLAMADA).map(x => ({ carrier: carrierDe(x)?.carrier ?? null, motivo: "siguiente tanda" })),
            ...enProceso.map(x => ({ carrier: carrierDe(x)?.carrier ?? null, motivo: estadoCrudo.get(x.id) === "sending" ? "en proceso (Rateware lo está enviando)" : "en proceso o estado no confirmado" }))
          ],
          ya_enviadas_u_otras: invitaciones.length - enviables.length } };
    },

    async cambio_evento(a: { event_id: string; nueva_fecha: string }) {
      const d = await leer(a.event_id);
      if (d.evento.estado !== "abierto" && d.evento.estado !== "borrador") throw new Rechazo("EVENTO_NO_EDITABLE", "Solo se extiende el plazo de eventos abiertos o en borrador.");
      // Solo hacia adelante: nunca cierra (tampoco PRIMA, que jamás se cierra ni se rechaza).
      const actual = d.evento.plazo ? d.evento.plazo.slice(0, 10) : null;
      if (a.nueva_fecha <= hoy()) throw new Rechazo("FECHA_PASADA", "La fecha nueva debe ser posterior a hoy; desde el chat no se cierra ni se adelanta el plazo.", 400);
      if (actual && a.nueva_fecha <= actual) throw new Rechazo("SOLO_EXTENDER", `Solo hacia adelante: la fecha nueva debe ser posterior al plazo actual (${actual}).`, 400);
      return { act: "cambio_evento", ev: d.evento.id, evento: resumenEvento(d), arg: { event_id: d.evento.id, nueva_fecha: a.nueva_fecha },
        cuerpos: [{ action: "update_rfx_event", event_id: d.evento.id, patch: { due_date: a.nueva_fecha } }],
        foto: { estado: d.evento.estado, plazo: actual },
        vista: { plazo_actual: actual, plazo_nuevo: a.nueva_fecha, efecto: "Solo mueve el plazo hacia adelante. No cierra, no publica, no cambia estado ni avisa a carriers." } };
    }
  };

  async function preparar(nombre: NombreEscritura, args: Record<string, unknown>) {
    const a: any = herramientasEscritura[nombre].schema.parse(args);
    const act = nombre === "preparar_invitacion" ? `invitacion_${a.fase}` : nombre.replace(/^preparar_/, "");
    if (!permite(ctx.rol, ROL_ACCION[act])) throw new Rechazo("SIN_PERMISO", `Esta acción es del ${ROL_ACCION[act] === "admin" ? "Administrador" : "Operador"}.`, 403);
    if (!ctx.secreto) throw PENDIENTE();
    if (esProtegido(a.event_id)) throw new Rechazo("EVENTO_PROTEGIDO", "Evento protegido.", 404);
    const plan = await planes[act](a);
    const firma = await firmar({ sub: ctx.userId, client_id: ctx.clientId, act, ev: plan.ev, arg: plan.arg, cuerpos: plan.cuerpos, fijo: plan.fijo, pre: huella(plan.foto) }, ctx.secreto, ahora());
    return { estado: "vista_previa", escrito: false, accion: act, evento: plan.evento, vista_previa: plan.vista, confirmacion_id: firma.token, vence_en: firma.vence, mesa_url: ligaMesa(plan.ev),
      instruccion: "Nada se escribió. Muestra esta vista previa completa (destinatarios, canal y texto) y pide un «sí» explícito. Solo después llama a confirmar con este confirmacion_id y frase_ok = el texto literal de esa respuesta." };
  }

  async function confirmar(args: Record<string, unknown>) {
    const a = herramientasEscritura.confirmar.schema.parse(args);
    const log: Record<string, unknown> = { tipo: "fr8bid_mcp_confirmar", usuario: ctx.userId, cliente: ctx.clientId, rol: ctx.rol, en: ahora().toISOString() };
    try {
      if (!permite(ctx.rol, "operator")) throw new Rechazo("SIN_PERMISO", "Tu rol es de consulta.", 403);
      if (!ctx.secreto) throw PENDIENTE();
      const frase = (a.frase_ok ?? "").trim();
      if (!frase) throw new Rechazo("SIN_SI", "Falta la confirmación explícita del usuario (frase_ok). Muestra la vista previa y espera su «sí».", 400);
      if (!esAfirmacion(frase)) throw new Rechazo("NO_CONFIRMADO", "La respuesta del usuario no es un «sí» explícito (sí, confirmo, adelante, hazlo…). No se escribió nada.", 400);
      log.frase_ok = frase.slice(0, 100);
      let c;
      try { c = await verificar(a.confirmacion_id, ctx.secreto, ahora()); }
      catch { throw new Rechazo("CONFIRMACION_INVALIDA", "La confirmación no es válida o venció (15 min). Vuelve a preparar la vista previa.", 400); }
      Object.assign(log, { accion: c.act, event_id: c.ev, h: c.h, jti: c.jti });
      if (c.sub !== ctx.userId || c.client_id !== ctx.clientId) throw new Rechazo("OTRA_SESION", "Esta confirmación es de otra sesión o cliente.", 403);
      const minimo = ROL_ACCION[c.act];
      if (!minimo || !planes[c.act]) throw new Rechazo("ACCION", "Acción no disponible en el MCP.", 400);
      if (!permite(ctx.rol, minimo)) throw new Rechazo("SIN_PERMISO", "Tu rol ya no permite esta acción.", 403);
      if (huellaCuerpos(c.cuerpos, c.fijo) !== c.h) throw new Rechazo("ALTERADA", "La confirmación no coincide con su vista previa.", 400);
      if (esProtegido(c.ev) || c.cuerpos.some(b => !ESCRITURAS_MCP.has(String(b.action)) || ![b.event_id, b.rfx_event_id].includes(c.ev))) throw new Rechazo("ALTERADA", "La confirmación no coincide con su vista previa.", 400);
      // Relectura: si el evento ya no está como en la vista previa (o ya se aplicó), no se escribe.
      let plan: Plan;
      try { plan = await planes[c.act](c.arg); }
      catch (e) { if (e instanceof Rechazo) throw new Rechazo("YA_APLICADO_O_CAMBIO", `Ya aplicado o el evento cambió: ${e.message} No se escribió nada.`); throw e; }
      if (plan.ev !== c.ev || huella(plan.foto) !== c.pre || huellaCuerpos(plan.cuerpos, plan.fijo) !== c.h)
        throw new Rechazo("YA_APLICADO_O_CAMBIO", "Ya aplicado o el evento cambió desde la vista previa. Vuelve a preparar; no se escribió nada.");
      const pasos: Record<string, unknown>[] = [];
      let estado = "aplicada";
      let campana: string | null = null;
      let envio: Record<string, unknown> | null = null;
      for (const original of c.cuerpos) {
        const body = original.campaign_id === CAMPANA_NUEVA ? { ...original, campaign_id: campana } : original;
        let r;
        try { r = await seguro("rateware-api", body); }
        catch { r = { status: 504, body: { code: "SIN_RESPUESTA", incierta: true }, headers: {} }; }
        const exito = r.status >= 200 && r.status < 300;
        // Un 2xx sin la forma esperada (JSON inválido, «incierta», sin contadores) NO es éxito.
        const invalida = exito && !respuestaValida(String(body.action), r.body, (body.ids as string[] | undefined)?.length ?? 0);
        const ok = exito && !invalida;
        pasos.push({ accion: body.action, status: r.status, ok, codigo: ok ? null : invalida ? "RESPUESTA_INVALIDA" : String(r.body?.code || r.status),
          ...(r.status === 423 ? { mensaje: "Rateware real tiene las escrituras de Fr8Bid cerradas (FR8BID_ESCRITURAS_REALES). Hazlo en la Mesa o pide la aprobación del propietario." } : {}),
          ...(invalida ? { mensaje: "Respuesta no confirmada: revisa en la página del evento antes de repetir." } : {}) });
        if (!ok) { estado = invalida || r.status === 504 || r.body?.incierta ? "incierta" : pasos.length > 1 ? "parcial" : "rechazada"; break; }
        if (body.action === "create_outreach_campaign") campana = String(r.body.row.id);
        if (body.action === "send_outreach_messages") {
          const idsTanda = (body.ids as string[]) || [];
          const res = leerResultado(r.body, idsTanda);
          envio = { enviados: res.sent, fallidos: res.failed, omitidos: res.skipped, inciertos: res.delivery_unknown };
          if (requiereAtencion(res, idsTanda)) estado = "parcial";
        }
      }
      if (estado === "aplicada" && pasos.length < c.cuerpos.length) estado = "parcial";
      log.resultado = estado;
      return { estado, accion: c.act, event_id: c.ev, pasos, ...(envio ? { envio } : {}), mesa_url: ligaMesa(c.ev),
        instruccion: estado === "aplicada" ? "Hecho. Verifica en la Mesa si hace falta." : estado === "incierta"
          ? "Resultado incierto: Rateware no confirmó. No reintentes; revisa en la página del evento antes de repetir."
          : "No se completó. No reintentes automáticamente; revisa la Mesa." };
    } catch (e) {
      log.resultado = e instanceof Rechazo ? `rechazada:${e.codigo}` : "error";
      throw e;
    } finally {
      registrar(log);
    }
  }

  return async (nombre: string, args: Record<string, unknown>): Promise<Record<string, any>> => {
    if (!Object.hasOwn(herramientasEscritura, nombre)) throw new Rechazo("FUERA_DEL_MCP", "Herramienta fuera del MCP.", 400);
    if (nombre === "confirmar") return confirmar(args);
    return preparar(nombre as NombreEscritura, args);
  };
}
