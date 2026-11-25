// Acciones de la Mesa del evento sobre Rateware. La interfaz y las pruebas del
// recorrido usan esta misma capa; solo cambia el transporte (HTTP a /api o el
// Rateware simulado detrás del mismo proxy).

import type { ConsultaTelefono, Telefono } from "../dominio/telefonos.js";
import { MAX_TELEFONOS, revisarTelefonos } from "../servidor/telefonos.js";
import { leerRespuesta } from "../servidor/lectura.js";
import { correoParaLectura, type AdjuntoLectura, type AnexoTexto, type CanalLectura, type CorreoTraido, type Lectura, type RutaLectura } from "../dominio/lectura.js";
import type { CorreoRevelado, PersonaApollo } from "../dominio/apollo.js";
import type { LecturaServidor } from "../dominio/lecturaAutomatica.js";
import { aBandeja, type Desenlace, type RespuestaBandeja } from "../dominio/bandeja.js";
import { MAX_REGISTROS, dominioBuscable, sugerirContactos, type ContactosCarrier } from "../dominio/contactos.js";
import { configCarrierFit, leerCarrierFit, type CarrierFit } from "../dominio/carrierFit.js";
import type { EntradaCatalogo } from "../dominio/condiciones-r1.js";
import { MAX_PAGINAS, POR_PAGINA, claveSegmento, consultaSegmento, leerHistorialSegmento, segmentoDeRuta, type HistorialSegmento, type Segmento } from "../dominio/segmento.js";
import { campanaDelEvento, campanasDelEventoCompletas, campanaFr8bid, elegirPlantilla, plantillasDelEvento } from "../dominio/invitacion.js";
import { operacionEntrega } from "../dominio/operacion.js";
import { notasConCierre } from "../dominio/cierre.js";
import { leerPropuestaPublicada } from "../dominio/propuesta.js";
import { env } from "../bidware/config/env.js";
import { hoyMexico, primario, versionMasReciente, versionVigente } from "../dominio/recorrido.js";
import { ESPERA_ENTRE_TANDAS_MS, esCuota, leerResultado, operacionTanda, planearTandas, requiereAtencion, type ResultadoEnvio } from "../dominio/tandas.js";
import type { Aviso, Detalle, EntregaLocal, ModeloComercial, Recibo, ResumenEvento } from "../dominio/tipos.js";
import { manejar, type Respuesta, type Servicio } from "../servidor/proxy.js";
import type { RatewareSimulado } from "../simulado/rateware.js";
import { manejarFr8Desk, type CasoFr8Desk, type Impacto } from "../servidor/fr8desk.js";
import { mensajeDelServidor } from "../dominio/errores.js";
import * as mapear from "./mapear.js";

export type Transporte = (servicio: Servicio, body: Record<string, unknown>) => Promise<Respuesta>;

export interface AvanceEnvio {
  tandas: number;
  hechas: number;
  enviados: number;
  enCola: number;
  fallidos: number;
  inciertos: number;
  pendientes: number;
  detenido: string | null;
}

// Gmail responde «Quota exceeded … per minute» (o 429) cuando se le consulta
// demasiado seguido; pasa solo en un minuto.
const PAUSA_GMAIL_MS = 2000;
export function gmailSaturado(e: unknown): boolean {
  if (!(e instanceof ErrorApi)) return false;
  return e.status === 429 || /quota exceeded|rate limit|ratelimitexceeded/i.test(e.message);
}

export class ErrorApi extends Error {
  constructor(public status: number, public code: string, mensaje: string, public incierta = false) {
    super(mensaje);
  }
}

export function transporteHttp(token: () => Promise<string | null>): Transporte {
  return async (servicio, body) => {
    const t = await token();
    let r: Response;
    try {
      r = await fetch(servicio === "rateware-api" ? "/api/rateware" : "/api/bid", {
        method: "POST",
        headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify(body)
      });
    } catch {
      return { status: 504, body: { error: "Sin conexión con Fr8Bid.", code: "SIN_RESPUESTA", incierta: true }, headers: {} };
    }
    const json = await r.json().catch(() => ({ error: "Respuesta no válida", code: "RESPUESTA_INVALIDA" }));
    return { status: r.status, body: json, headers: {} };
  };
}

// El simulado pasa por el mismo proxy que producción, con escrituras permitidas
// porque no salen de este proceso.
export function transporteSimulado(sim: RatewareSimulado, usuario: () => string | null): Transporte {
  return (servicio, body) => {
    const clave = usuario();
    return manejar(servicio, body, clave ? `Bearer sim:${clave}` : null, {
      enviar: (s, b, auth) => sim.llamar(s, b, auth),
      permitirEscrituras: true,
      hoy: () => sim.hoy(),
      timeoutMs: 2000
    });
  };
}

// Día anterior a `hoy` (AAAA-MM-DD). rfx-bid-api cierra la liga al terminar el
// día de due_date (23:59, hora de México), así que due_date = ayer la cierra ya.
export function diaAnterior(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Revisión de números de WhatsApp (POST /api/telefonos): reglas por lada y,
// para los dudosos, la IA del servidor.
export type RevisorTelefonos = (telefonos: ConsultaTelefono[]) => Promise<{ status: number; body: any }>;

export function revisorHttp(token: () => Promise<string | null>): RevisorTelefonos {
  return async (telefonos) => {
    const t = await token();
    try {
      const r = await fetch("/api/telefonos", {
        method: "POST",
        headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ telefonos })
      });
      return { status: r.status, body: await r.json().catch(() => ({ error: "Respuesta no válida", code: "RESPUESTA_INVALIDA" })) };
    } catch {
      return { status: 504, body: { error: "Sin conexión con Fr8Bid.", code: "SIN_RESPUESTA" } };
    }
  };
}

// Lectura con IA de la respuesta de un carrier (POST /api/lectura). Solo
// propone: nada se guarda hasta que el equipo confirma.
export type LectorRespuestas = (body: Record<string, unknown>) => Promise<{ status: number; body: any }>;

export function lectorHttp(token: () => Promise<string | null>): LectorRespuestas {
  return async (body) => {
    const t = await token();
    try {
      const r = await fetch("/api/lectura", {
        method: "POST",
        headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify(body)
      });
      return { status: r.status, body: await r.json().catch(() => ({ error: "Respuesta no válida", code: "RESPUESTA_INVALIDA" })) };
    } catch {
      return { status: 504, body: { error: "Sin conexión con Fr8Bid.", code: "SIN_RESPUESTA" } };
    }
  };
}

// En el simulado no hay IA: responde «no configurada» y la captura sigue a mano.
export const lectorSimulado: LectorRespuestas = async (body) => leerRespuesta(body, true, null);

// En el simulado no hay IA: solo reglas (los dudosos siguen dudosos).
export const revisorSimulado: RevisorTelefonos = async (telefonos) => revisarTelefonos({ telefonos }, true, null);

// Apollo (POST /api/apollo): buscar personas por dominio (gratis) y revelar un
// correo (1 crédito). En el simulado no hay Apollo.
export type ConsultaApollo = (body: Record<string, unknown>) => Promise<{ status: number; body: any }>;

export function apolloHttp(token: () => Promise<string | null>): ConsultaApollo {
  return async (body) => {
    const t = await token();
    try {
      const r = await fetch("/api/apollo", {
        method: "POST",
        headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify(body)
      });
      return { status: r.status, body: await r.json().catch(() => ({ error: "Respuesta no válida", code: "RESPUESTA_INVALIDA" })) };
    } catch {
      return { status: 504, body: { error: "Sin conexión con Fr8Bid.", code: "SIN_RESPUESTA" } };
    }
  };
}

export const apolloSimulado: ConsultaApollo = async () => ({
  status: 503,
  body: { error: "Apollo no está disponible en el modo simulado.", code: "APOLLO_NO_CONFIGURADO" }
});

// Fr8Desk (GET/POST /api/fr8desk/casos): casos ligados al evento y «Reportar a
// Fr8Desk». En el simulado pasa por el mismo manejador del servidor con un
// Fr8Desk en memoria.
export type ConsultaFr8Desk = (metodo: "GET" | "POST", eventoId: string, body?: Record<string, unknown>) => Promise<{ status: number; body: any }>;

export function fr8deskHttp(token: () => Promise<string | null>): ConsultaFr8Desk {
  return async (metodo, eventoId, body) => {
    const t = await token();
    const auth: Record<string, string> = t ? { authorization: `Bearer ${t}` } : {};
    try {
      const r =
        metodo === "GET"
          ? await fetch(`/api/fr8desk/casos?rfx_event_id=${encodeURIComponent(eventoId)}`, { headers: auth })
          : await fetch("/api/fr8desk/casos", { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify({ ...body, rfx_event_id: eventoId }) });
      return { status: r.status, body: await r.json().catch(() => ({ error: "Respuesta no válida", code: "RESPUESTA_INVALIDA" })) };
    } catch {
      return { status: 504, body: { error: "Sin conexión con Fr8Bid. Puedes reintentar: no se duplica el caso.", code: "SIN_RESPUESTA", incierta: true } };
    }
  };
}

export function fr8deskSimulado(sim: RatewareSimulado, usuario: () => string | null, desk: { fetch: typeof fetch }): ConsultaFr8Desk {
  return (metodo, eventoId, body) => {
    const clave = usuario();
    return manejarFr8Desk(metodo, { rfx_event_id: eventoId }, { ...body, rfx_event_id: eventoId }, clave ? `Bearer sim:${clave}` : null, {
      config: { token: "fd_simulado", equipo: "sistemas" },
      rateware: (s, b, auth) => sim.llamar(s, b, auth),
      fetch: desk.fetch,
      timeoutMs: 2000
    });
  };
}

export const fr8deskNoDisponible: ConsultaFr8Desk = async () => ({
  status: 503,
  body: { error: "Integración con Fr8Desk no configurada.", code: "FR8DESK_NO_CONFIGURADO" }
});

export interface RevisionTelefonos {
  telefonos: Map<string, Telefono>;
  ia: "sin_dudosos" | "ok" | "no_configurada" | "fallo";
  revisadosPorIa: number;
}

export class MesaApi {
  constructor(private t: Transporte, private hoy: () => string = () => hoyMexico(), private revisor: RevisorTelefonos = revisorSimulado, private apollo: ConsultaApollo = apolloSimulado, private lector: LectorRespuestas = lectorSimulado, private fr8desk: ConsultaFr8Desk = fr8deskNoDisponible) {}

  private async pedirFr8Desk(metodo: "GET" | "POST", eventoId: string, body?: Record<string, unknown>) {
    const r = await this.fr8desk(metodo, eventoId, body);
    if (r.status < 200 || r.status >= 300) throw new ErrorApi(r.status, String(r.body?.code || r.status), String(r.body?.error || "Fr8Desk no respondió"), Boolean(r.body?.incierta));
    return r.body;
  }

  async casosFr8Desk(eventoId: string): Promise<CasoFr8Desk[]> {
    return (await this.pedirFr8Desk("GET", eventoId)).casos || [];
  }

  // requestId: el mismo en cada reintento del mismo formulario (no duplica).
  async reportarFr8Desk(eventoId: string, caso: { requestId: string; asunto: string; descripcion: string; impacto: Impacto }): Promise<{ folio: string; url: string; repetido: boolean }> {
    const b = await this.pedirFr8Desk("POST", eventoId, { request_id: caso.requestId, asunto: caso.asunto, descripcion: caso.descripcion, impacto: caso.impacto });
    return { folio: b.folio, url: b.url, repetido: Boolean(b.repetido) };
  }


  // La IA lee lo que contestó el carrier y propone la oferta por ruta. Solo
  // viajan el texto (sin el correo citado), los archivos subidos, el nombre
  // del carrier y origen, destino y equipo de cada ruta. No guarda nada: el resultado es un borrador para confirmar.
  async leerRespuesta(c: { texto: string; canal: CanalLectura; carrier: string; rutas: RutaLectura[]; adjuntos?: AdjuntoLectura[]; anexos?: AnexoTexto[] }): Promise<Lectura & { recortado: boolean }> {
    const r = await this.lector({ ...c, hoy: this.hoy() });
    if (r.status < 200 || r.status >= 300) throw new ErrorApi(r.status, String(r.body?.code || r.status), String(r.body?.error || "La IA no respondió"));
    return { ...r.body.lectura, recortado: Boolean(r.body.recortado) };
  }

  // Texto y PDF/imágenes de un correo del carrier, desde Gmail vía Rateware
  // (solo lectura). Si Rateware aún no tiene la acción, el equipo pega el texto.
  async traerCorreo(eventId: string, gmailMessageId: string): Promise<CorreoTraido> {
    try {
      return correoParaLectura(await this.rw({ action: "get_rfx_carrier_reply", event_id: eventId, gmail_message_id: gmailMessageId }));
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 404) throw new ErrorApi(404, "CORREO_NO_ENCONTRADO", "Ese correo ya no está en Gmail o no es una respuesta a este evento. Pega el texto.");
      if (e instanceof ErrorApi && e.status >= 500) throw new ErrorApi(e.status, "GMAIL_NO_RESPONDIO", "Gmail no respondió. Intenta de nuevo o pega el texto.");
      throw new ErrorApi(e instanceof ErrorApi ? e.status : 400, "CORREO_NO_DISPONIBLE", "Rateware todavía no entrega el correo. Pega el texto o sube el archivo.");
    }
  }

  // Borradores que dejó la revisión programada de Rateware (solo lectura). Si Rateware no responde se
  // lanza el error: con una lista vacía se volverían a pagar lecturas y la bandeja daría avisos falsos.
  async lecturasServidor(eventId: string): Promise<LecturaServidor[]> {
    const r: any = await this.rw({ action: "list_rfx_reply_readings", event_id: eventId });
    if (!Array.isArray(r?.readings)) throw new ErrorApi(502, "RESPUESTA_INCOMPLETA", "Rateware no devolvió los borradores de la IA.");
    return r.readings;
  }

  // Bandeja de respuestas con IA (rateware #235): lo pendiente de todos los eventos abiertos.
  async bandejaRespuestas(): Promise<{ respuestas: RespuestaBandeja[]; hayMas: boolean }> {
    try {
      const cuerpo: any = await this.rw({ action: "list_rfx_reply_inbox" });
      if (!Array.isArray(cuerpo?.readings)) throw new ErrorApi(502, "RESPUESTA_INCOMPLETA", "Rateware no devolvió la lista de respuestas. Intenta de nuevo.");
      return aBandeja(cuerpo);
    } catch (e) {
      // Sin desplegar, Rateware responde 400 «Unknown action.»: la acción no lleva parámetros que puedan fallar.
      if (e instanceof ErrorApi && e.status === 400)
        throw new ErrorApi(400, "BANDEJA_NO_DISPONIBLE", "Rateware todavía no tiene la bandeja. Las respuestas siguen en la página de cada evento.");
      throw e;
    }
  }

  // Deja un borrador de la IA «listo» para todo el equipo (una sola vez: repetirla devuelve la primera marca).
  // false solo cuando Rateware dice que no tiene esa lectura (la leyó solo un navegador): no hay nada que
  // marcar. Cualquier otro error, 404 incluido, se lanza para que la marca quede pendiente.
  async marcarLectura(eventId: string, gmailMessageId: string, desenlace: Desenlace): Promise<boolean> {
    const r: any = await this.rw({ action: "mark_rfx_reply_reading", event_id: eventId, gmail_message_id: gmailMessageId, outcome: desenlace });
    return r?.missing !== true;
  }

  private async pedirApollo(body: Record<string, unknown>) {
    const r = await this.apollo(body);
    if (r.status < 200 || r.status >= 300) throw new ErrorApi(r.status, String(r.body?.code || r.status), String(r.body?.error || "Apollo no respondió"));
    return r.body;
  }

  // Gratis: personas que Apollo conoce con ese dominio, primero quien decide.
  async buscarEnApollo(dominio: string): Promise<{ total: number; personas: PersonaApollo[] }> {
    const b = await this.pedirApollo({ accion: "buscar", dominio });
    return { total: Number(b.total || 0), personas: b.personas || [] };
  }

  // 1 crédito de Apollo: solo después de que el Administrador lo confirma.
  async revelarCorreoApollo(personaId: string): Promise<CorreoRevelado & { creditos: number }> {
    return this.pedirApollo({ accion: "revelar", persona_id: personaId, confirmar: true });
  }

  async revisarTelefonos(telefonos: ConsultaTelefono[]): Promise<RevisionTelefonos> {
    const r = await this.revisor(telefonos.slice(0, MAX_TELEFONOS));
    if (r.status < 200 || r.status >= 300) throw new ErrorApi(r.status, String(r.body?.code || r.status), String(r.body?.error || "No se pudieron revisar los números"));
    return { telefonos: new Map(Object.entries(r.body?.telefonos || {})), ia: r.body?.ia, revisadosPorIa: Number(r.body?.revisados_por_ia || 0) };
  }

  private async rw(body: Record<string, unknown>, servicio: Servicio = "rateware-api") {
    const r = await this.t(servicio, body);
    if (r.status >= 200 && r.status < 300) return r.body;
    const code = String(r.body?.code || r.status);
    throw new ErrorApi(r.status, code, mensajeDelServidor(code, String(r.body?.error || "Error de Rateware"), r.body), Boolean(r.body?.incierta));
  }

  async eventos(): Promise<ResumenEvento[]> {
    return mapear.resumenes(await this.rw({ action: "list_rfx_events" }), this.hoy());
  }

  async detalle(eventId: string, recibo: Recibo | null = null): Promise<Detalle> {
    const [crudo, mensajes, rubros, condiciones, revisiones, revision] = await Promise.all([
      this.rw({ action: "list_rfx_detail", event_id: eventId }),
      this.rw({ action: "list_outreach_messages", rfx_event_id: eventId, channel: "email" }),
      this.rw({ action: "list_rfx_segment_confirmations", event_id: eventId }),
      this.condicionesDe(eventId),
      this.revisionesDe(eventId),
      this.respuestasDe(eventId)
    ]);
    if (mensajes.has_more === true) throw new ErrorApi(409, "LECTURA_INCOMPLETA", "Hay más avisos de los que devuelve esta lectura. Consulta la cola de Rateware antes de continuar.");
    const { respuestas, aperturas, gmailOcupado } = revision;
    const d = mapear.detalle(crudo, mapear.filasListado(mensajes, "messages"), null, { hoy: this.hoy(), rubros: rubros.rows || [], condiciones, revisiones, respuestas, aperturas });
    return { ...d, recibo, ...(gmailOcupado ? { gmailOcupado } : {}) };
  }

  // ——— Condiciones de ruta (parche R1, en rateware-prod desde el 23-oct-2026;
  // si la lectura falla, la Mesa sigue sin condiciones) ———
  private async condicionesDe(eventId: string): Promise<Record<string, unknown>[]> {
    try {
      return (await this.rw({ action: "list_rfx_lane_conditions", event_id: eventId })).rows || [];
    } catch (e) {
      if (e instanceof ErrorApi && e.code === "PASO_EN_RATEWARE") return [];
      throw e;
    }
  }
  // Marca «Revisado» de Bidware. Si no se puede leer, la Mesa no deja invitar
  // a nadie (null), pero el resto del evento se sigue viendo.
  private async revisionesDe(eventId: string): Promise<Record<string, unknown>[] | null> {
    try {
      return (await this.rw({ action: "list_rfx_invitation_wave_reviews", rfx_event_id: eventId })).rows || [];
    } catch {
      return null;
    }
  }
  // Quién ya contestó por correo, en el chat del Bid Room o por WhatsApp de
  // Meta (parche R2). Si Rateware todavía no tiene la acción, no se consultó
  // (undefined) y queda el botón «Ya respondió»; si falla, null: la Mesa no
  // prepara intentos. La misma lectura trae las aperturas del correo (píxel,
  // 7-nov-2026); sin ellas, el seguimiento sigue como antes.
  //
  // Gmail limita las consultas por minuto: varias recargas seguidas de la
  // página del evento la saturan (recorrido 24-nov-2026). Se reintenta una vez
  // tras una pausa corta y, si sigue saturado, se avisa con ese motivo.
  private async respuestasDe(eventId: string): Promise<{ respuestas: Record<string, unknown>[] | null | undefined; aperturas: Record<string, unknown>[]; gmailOcupado?: boolean }> {
    for (let intento = 0; ; intento++) {
      try {
        const r = await this.rw({ action: "list_rfx_carrier_replies", event_id: eventId });
        const aperturas = r.opens_status === "checked" && Array.isArray(r.opens) ? r.opens : [];
        return { respuestas: r.email_status === "checked" ? r.rows || [] : null, aperturas };
      } catch (e) {
        if (e instanceof ErrorApi && e.code === "PASO_EN_RATEWARE") return { respuestas: undefined, aperturas: [] };
        const ocupado = gmailSaturado(e);
        if (ocupado && intento === 0) {
          await new Promise((listo) => setTimeout(listo, PAUSA_GMAIL_MS));
          continue;
        }
        return { respuestas: null, aperturas: [], ...(ocupado ? { gmailOcupado: true } : {}) };
      }
    }
  }
  // Contactos que Rateware ya conoce del carrier y de otros registros con su
  // mismo dominio, sin rebotes recientes en Gmail ni «no contactar» (solo lectura).
  async contactosConocidos(vendorId: string): Promise<ContactosCarrier> {
    const propio = ((await this.rw({ action: "list_vendors", ids: [vendorId], lightweight: true })).rows || []) as Record<string, any>[];
    const dominio = propio[0] ? dominioBuscable(propio[0]) : null;
    const otros = dominio
      ? (((await this.rw({ action: "list_vendors", search: dominio, lightweight: true, limit: MAX_REGISTROS })).rows || []) as Record<string, any>[]).filter((v) => v.id !== vendorId && dominioBuscable(v) === dominio)
      : [];
    const vendors = [...propio, ...otros];
    const historial: Record<string, any>[] = [];
    for (const v of vendors.slice(0, 6)) historial.push(...((await this.rw({ action: "list_contact_history", vendor_id: v.id, limit: 300 })).rows || []));
    return sugerirContactos(vendorId, vendors, historial, this.hoy());
  }
  // «Carrier fit» de Rateware para las rutas del evento (solo lectura).
  async carrierFit(d: Detalle): Promise<CarrierFit> {
    return leerCarrierFit(d, await this.rw({ action: "carrier_recommendations", config: configCarrierFit(d) }));
  }
  // Historial del segmento: tarifas aprobadas de Rateware con la misma caja,
  // operación D2D y cruce que cada ruta (solo lectura). Un segmento por grupo
  // de rutas; si hay más de MAX_PAGINAS páginas, se marca «truncado».
  async historialSegmento(d: Detalle): Promise<HistorialSegmento[]> {
    const segmentos = new Map<string, Segmento>();
    for (const r of d.rutas) {
      const s = segmentoDeRuta(r);
      if (s && !segmentos.has(claveSegmento(s))) segmentos.set(claveSegmento(s), s);
    }
    const salida: HistorialSegmento[] = [];
    for (const s of segmentos.values()) {
      const filas: Record<string, any>[] = [];
      let truncado = false;
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const r = await this.rw(consultaSegmento(s, pagina));
        const rows: Record<string, any>[] = Array.isArray(r?.rows) ? r.rows : [];
        filas.push(...rows);
        if (!r?.has_more || rows.length < POR_PAGINA) break;
        if (pagina === MAX_PAGINAS - 1) truncado = true;
      }
      salida.push(leerHistorialSegmento(d, s, filas, truncado));
    }
    return salida;
  }
  async catalogoCondiciones(): Promise<EntradaCatalogo[]> {
    return (await this.rw({ action: "list_rfx_condition_catalog" })).conditions || [];
  }
  guardarCondiciones(eventId: string, laneId: string, condiciones: { condition_key: string; importance: "required" | "preferred"; target?: unknown; note?: string | null }[]) {
    return this.rw({ action: "save_rfx_lane_conditions", event_id: eventId, lane_id: laneId, conditions: condiciones });
  }

  // ——— Preparación (Operador) ———
  crearEvento(datos: { name: string; customer: string; due_date: string | null }) {
    return this.rw({ action: "create_rfx_event", event: datos });
  }
  importarRutas(eventId: string, rows: Record<string, unknown>[]) {
    return this.rw({ action: "import_rfx_lanes", event_id: eventId, rows });
  }
  preseleccionar(laneId: string, vendorIds: string[], eventId?: string) {
    return this.rw({ action: "shortlist_rfx_lane_vendors", event_id: eventId, lane_id: laneId, vendor_ids: vendorIds });
  }
  // Suma un carrier sugerido a todas las rutas del evento como preseleccionado.
  // No invita ni envía: queda pendiente de «Revisado».
  async sumarAlEvento(d: Detalle, vendorId: string) {
    for (const r of d.rutas) await this.preseleccionar(r.id, [vendorId], d.evento.id);
  }
  // La marca «Revisado» que antes se ponía en Bidware: el Administrador vio el
  // contacto y confirma que puede recibir la invitación.
  marcarRevisado(eventId: string, c: { carrierId: string; carrier: string; correo: string | null }) {
    return this.rw({
      action: "record_rfx_invitation_wave_review",
      event_id: eventId,
      rfx_event_id: eventId,
      vendor_id: c.carrierId,
      reviewed: true,
      channel: "email",
      contact_snapshot: { vendor_name: c.carrier, email: c.correo },
      confirmed: true,
      confirmation_action: "record_rfx_invitation_wave_review"
    });
  }
  // Solo para carriers con la marca «Revisado» vigente (el proxy lo vuelve a
  // comprobar). Rateware reporta los omitidos en skipped_rows. Usa la campaña
  // de Fr8Bid del evento (la crea la primera vez) con la plantilla en español.
  async prepararInvitaciones(eventId: string, revisados: string[], folio = eventId) {
    const [campanas, delEvento, plantillas] = await Promise.all([
      this.rw({ action: "list_outreach_campaigns" }),
      this.rw({ action: "list_outreach_campaigns", rfx_event_id: eventId }),
      this.rw({ action: "list_outreach_templates" })
    ]);
    const filas: Record<string, any>[] = campanas.rows || [];
    const completas = campanasDelEventoCompletas(delEvento, eventId);
    if (!completas) throw new ErrorApi(503, "CAMPANAS_INCOMPLETAS", "No se pudieron leer completas las campañas del evento. No se preparó nada.");
    // La campaña propia se identifica solo por idempotency_key. Si no está entre las
    // 100 más recientes del catálogo global, se crea: Rateware no duplica y, si ya
    // existía, devuelve la verdadera. La plantilla se elige con esa campaña real.
    let campana = campanaDelEvento(filas, eventId);
    if (!campana) {
      const tentativa = elegirPlantilla(plantillas.rows || [], plantillasDelEvento(completas, eventId));
      if (!tentativa) throw new ErrorApi(409, "SIN_PLANTILLA", "No encontré en Rateware la plantilla «RFx carrier invitation - Spanish». No se preparó nada.");
      const base = filas.find((c) => c.rfx_event_id === eventId && c.sender_email) ?? filas.find((c) => c.channel === "email" && c.sender_email) ?? null;
      campana = (await this.rw({ action: "create_outreach_campaign", event_id: eventId, campaign: campanaFr8bid(eventId, folio, String(tentativa.id), base) })).row;
      if (!campana?.id) throw new ErrorApi(502, "SIN_CAMPANA", "Rateware no devolvió la campaña del evento. No se preparó nada.");
    }
    const propia = completas.find((c) => c.id === campana!.id) ?? campana;
    const plantilla = elegirPlantilla(plantillas.rows || [], plantillasDelEvento(completas, eventId, propia));
    if (!plantilla) throw new ErrorApi(409, "SIN_PLANTILLA", "No encontré en Rateware la plantilla «RFx carrier invitation - Spanish». No se preparó nada.");
    return this.rw({
      action: "generate_outreach_drafts",
      event_id: eventId,
      campaign_id: campana!.id,
      template_id: plantilla.id,
      channel: "email",
      reviewed_vendor_ids: revisados
    });
  }
  // Archivar solo lo saca de las listas activas: rutas, ofertas y borradores se
  // quedan. No cierra el evento ni avisa a nadie.
  // Deshace «Archivar»: el evento vuelve a borrador, con sus rutas y ofertas como estaban.
  restaurar(eventId: string) {
    return this.rw({ action: "update_rfx_event", event_id: eventId, patch: { status: "draft" }, expected_status: "archived" });
  }
  // Corrige datos de una ruta (origen, destino, caja, volumen, objetivo, notas).
  corregirRuta(eventId: string, rutaId: string, patch: Record<string, unknown>) {
    return this.rw({ action: "update_rfx_lane", event_id: eventId, id: rutaId, patch });
  }
  // Propuesta al shipper (rateware #234): lo publicado y lo que el shipper aceptó.
  async propuestaShipper(eventId: string) {
    return leerPropuestaPublicada(await this.rw({ action: "get_rfx_shipper_proposal", event_id: eventId }));
  }
  // El servidor de Fr8Bid calcula rutas y tarifa de venta con una lectura fresca;
  // aquí solo va el evento y la vigencia.
  // `huella` es la de la propuesta que el Administrador revisó: el servidor la
  // recalcula y no publica si cambió. Publicar responde con la propuesta vigente
  // (con lo aceptado); si se publicó, el evento tiene solicitud del shipper.
  /** `base`: id de la propuesta publicada que se tenía a la vista (null si no había). */
  async publicarPropuesta(eventId: string, vigenteHasta: string | null, huella: string, base: string | null) {
    const r: any = await this.rw({
      action: "publish_rfx_shipper_proposal",
      event_id: eventId,
      ...(vigenteHasta ? { valid_through: vigenteHasta } : {}),
      proposal_fingerprint: huella,
      base_proposal_id: base,
      confirmed: true,
      confirmation_action: "publish_rfx_shipper_proposal"
    });
    return leerPropuestaPublicada({ ...r, has_shipper_request: true });
  }
  archivar(eventId: string) {
    return this.rw({ action: "archive_rfx_event", id: eventId, confirmed: true, confirmation_action: "archive_rfx_event" });
  }
  // Borrar es definitivo. Rateware lo revisa y borra en un solo paso: solo un
  // borrador sin invitaciones enviadas ni ofertas (409 RFX_DELETE_NOT_DRAFT /
  // RFX_DELETE_HAS_ACTIVITY si no).
  async borrar(eventId: string) {
    return this.rw({ action: "delete_rfx_event", id: eventId, confirmed: true, confirmation_action: "delete_rfx_event" });
  }
  // Rateware quita la oferta y deja la participación como «declinó» (rateware
  // #164: el motivo no lo ve el carrier). Una adjudicada no se rechaza.
  // expected_updated_at: solo se rechaza la versión que vio el Administrador; si el
  // carrier la cambió, Rateware responde 409 y no rechaza nada.
  rechazarOferta(eventId: string, participacionId: string, motivo: string, version?: string | null) {
    return this.rw({
      action: "reject_rfx_bid",
      event_id: eventId,
      id: participacionId,
      reason: motivo,
      ...(version ? { expected_updated_at: version } : {}),
      confirmed: true,
      confirmation_action: "reject_rfx_bid"
    });
  }
  publicar(eventId: string) {
    return this.rw({ action: "update_rfx_event", event_id: eventId, patch: { status: "open" } });
  }
  // Qué modelos comerciales acepta el evento de sus carriers; null = todos.
  // Rateware lo guarda en el paquete del evento y lo niega con política
  // bloqueada, con adjudicaciones o fuera de borrador/abierto (rateware #229).
  fijarModelosAceptados(eventId: string, modelos: ModeloComercial[] | null) {
    return this.rw({ action: "update_rfx_event", event_id: eventId, patch: { accepted_commercial_models: modelos } });
  }
  // El equipo define el modelo de una oferta que ya existe, sin reescribirla:
  // solo cambian el modelo y su porcentaje, y solo sobre la versión que se mostró
  // (409 si el carrier la cambió). La tarifa, la vigencia y la fuente no se tocan.
  definirModelo(c: { eventId: string; participacionId: string; modelo: ModeloComercial; pct: number | null; version: string }) {
    return this.rw({
      action: "set_rfx_bid_commercial_model",
      event_id: c.eventId,
      id: c.participacionId,
      commercial_model: c.modelo,
      ...(c.modelo === "sell_share" ? { carrier_share_pct: c.pct } : { marksman_margin_pct: c.pct }),
      expected_updated_at: c.version,
      confirmed: true,
      confirmation_action: "set_rfx_bid_commercial_model"
    });
  }
  // La invitación salió por otro canal (correo propio, WhatsApp, llamada): solo
  // cambia el estado en Rateware; Fr8Bid no envía nada.
  marcarInvitadas(eventId: string, ids: string[]) {
    return this.rw({ action: "invite_rfx_lane_vendors", event_id: eventId, ids, confirmed: true, confirmation_action: "invite_rfx_lane_vendors" });
  }
  // 2º/3º intento: rateware-api deja un borrador en la Cola como respuesta en
  // el hilo de Gmail de la invitación (con la liga privada). No envía: el envío
  // se aprueba en la Cola. scope «event»: el seguimiento es del bid completo, no
  // de una ruta. app_origin: la liga del Bid Room sale con el dominio de Fr8Bid
  // (sin él Rateware usa rateware.vercel.app).
  prepararIntento(eventId: string, participacionId: string, texto: string, clave: string) {
    return this.rw({
      action: "draft_bid_room_carrier_message",
      event_id: eventId,
      rfx_event_id: eventId,
      rfx_lane_vendor_id: participacionId,
      scope: "event",
      app_origin: env.appOrigin,
      body: texto,
      idempotency_key: clave,
      confirmed: true,
      confirmation_action: "draft_bid_room_carrier_message"
    });
  }
  // Captura del equipo: la oferta llegó por otro canal y la registra el Operador.
  // Rateware la guarda como una versión más (no edita las anteriores).
  capturarOferta(c: {
    eventId: string;
    participacionId: string;
    tarifa: number;
    moneda: string;
    vigencia: string | null;
    capacidadSemanal: number | null;
    diasTransito: number | null;
    canal: "email" | "phone" | "whatsapp" | "other";
    notas: string;
    // La propuso la IA a partir del texto del carrier y el equipo la confirmó.
    leidaConIA?: boolean;
    // Modelo comercial que el carrier indicó. Sin él, Rateware usa el único que
    // acepta el evento o deja la oferta «sin elegir».
    modelo?: ModeloComercial | null;
    pct?: number | null;
  }) {
    const etiqueta = { email: "Email", phone: "Phone", whatsapp: "WhatsApp", other: "Other" }[c.canal];
    const notas = c.notas.trim();
    return this.rw({
      action: "update_rfx_bid",
      event_id: c.eventId,
      id: c.participacionId,
      patch: {
        bid_rate: c.tarifa,
        currency: c.moneda,
        valid_through: c.vigencia,
        weekly_capacity: c.capacidadSemanal,
        transit_days: c.diasTransito,
        notes: notas || null,
        ...(c.modelo ? { commercial_model: c.modelo, ...(c.modelo === "sell_share" ? { carrier_share_pct: c.pct ?? null } : { marksman_margin_pct: c.pct ?? null }) } : {}),
        capture_source: "manual_operator",
        manual_source_channel: c.canal,
        source_note: `Captured from ${etiqueta}${c.leidaConIA ? " (read by AI, confirmed by operator)" : ""}${notas ? `: ${notas}` : ""}`
      }
    });
  }

  // Respuesta por correo o WhatsApp sin oferta: la saca de los intentos. Solo
  // cambia el estado y la nota de la participación; no envía nada.
  marcarRespondio(c: { eventId: string; participacionId: string; rechazo: boolean; canal: "email" | "whatsapp" | "phone"; nota: string }) {
    const etiqueta = { email: "Correo", whatsapp: "WhatsApp", phone: "Teléfono" }[c.canal];
    return this.rw({
      action: "update_rfx_bid",
      event_id: c.eventId,
      id: c.participacionId,
      patch: { invitation_status: c.rechazo ? "declined" : "responded", notes: `${etiqueta}: ${c.nota.trim() || (c.rechazo ? "rechazó" : "respondió")}` }
    });
  }

  // ——— Decisiones (Administrador) ———
  // En Rateware «closed» es la entrega, no el cierre a ofertas. Cerrar a ofertas
  // es mover el plazo a ayer: la liga responde 409 y el evento sigue abierto
  // para adjudicar y entregar con operation_id.
  // El plazo original queda en las notas del evento (fricción 9).
  async cerrarAOfertas(eventId: string) {
    const actual = await this.rw({ action: "list_rfx_detail", event_id: eventId });
    const e = actual?.event || {};
    const notes = notasConCierre(e.notes, this.hoy(), e.due_date || null);
    return this.rw({ action: "update_rfx_event", event_id: eventId, patch: { due_date: diaAnterior(this.hoy()), notes } });
  }

  adjudicar(a: { eventId: string; participacionId: string; rol: "primario" | "respaldo"; motivo: string; operationId: string; confirmaSinVigencia: boolean }) {
    return this.rw({
      action: "award_rfx_lane_vendor",
      event_id: a.eventId,
      rfx_lane_vendor_id: a.participacionId,
      award_role: a.rol === "primario" ? "primary" : "backup",
      award_reason: a.motivo.trim(),
      operation_id: a.operationId,
      confirma_sin_vigencia: a.confirmaSinVigencia
    });
  }

  // Ruta desierta: se cierra sin adjudicar. El motivo queda interno (nunca llega a los carriers).
  declararDesiertas(eventId: string, rutaIds: string[], motivo: string) {
    return this.rw({ action: "set_rfx_lane_no_award", rfx_event_id: eventId, lane_ids: rutaIds, no_award: true, reason: motivo.trim(), confirmed: true, confirmation_action: "set_rfx_lane_no_award" });
  }

  reabrirRuta(eventId: string, rutaId: string) {
    return this.rw({ action: "set_rfx_lane_no_award", rfx_event_id: eventId, lane_ids: [rutaId], no_award: false, confirmed: true, confirmation_action: "set_rfx_lane_no_award" });
  }

  quitarAdjudicacion(participacionId: string) {
    return this.rw({ action: "clear_rfx_award", rfx_lane_vendor_id: participacionId });
  }

  // Paso 9, fase 1: cero escrituras externas. Calcula la operación y comprueba
  // que lo adjudicado es exactamente la versión vigente (I2).
  prepararEntrega(d: Detalle): EntregaLocal {
    for (const ruta of d.rutas) {
      if (ruta.desiertaMotivo) continue;
      const p = primario(ruta);
      if (!p) return { estado: "sin_preparar", operationId: null, error: `La ruta ${ruta.numero} no tiene primario.` };
      for (const x of [p, ...ruta.participaciones.filter((y) => y.rol === "respaldo")]) {
        const vx = versionVigente(x);
        if (!x.adjudicada || !vx) return { estado: "sin_preparar", operationId: null, error: `No se identifica con certeza la versión adjudicada de ${x.carrier}. Revisa la adjudicación y las fechas de sus ofertas antes de entregar.` };
        if (versionMasReciente(x) || x.adjudicada.huella !== vx.huella)
          return { estado: "sin_preparar", operationId: null, error: `${x.carrier} tiene una versión más reciente que la adjudicada: anula y adjudica de nuevo.` };
      }
    }
    return { estado: "preparada", operationId: operacionEntrega(d), error: null };
  }

  // Paso 9, fase 2: la única escritura. Relee el evento y exige que la operación
  // siga siendo la misma; un reintento usa la misma operation_id.
  async confirmarEntrega(eventId: string, operationId: string): Promise<{ entrega: EntregaLocal; recibo: Recibo | null }> {
    const actual = await this.detalle(eventId);
    if (actual.evento.estado !== "adjudicado") {
      const preparada = this.prepararEntrega(actual);
      if (preparada.estado !== "preparada" || preparada.operationId !== operationId) {
        return { entrega: { estado: "rechazada", operationId, error: preparada.error || "Las decisiones cambiaron desde la preparación. Prepara otra vez." }, recibo: null };
      }
    }
    try {
      const r = await this.rw({ action: "closeout_awarded_rfx_to_rateware", event_id: eventId, operation_id: operationId });
      if (String(r.receipt_operation_id) !== operationId) {
        return { entrega: { estado: "incierta", operationId, error: "El recibo no corresponde a esta operación. Concilia antes de seguir." }, recibo: null };
      }
      return { entrega: { estado: "confirmada", operationId, error: null }, recibo: mapear.recibo(r) };
    } catch (e) {
      if (e instanceof ErrorApi && (e.incierta || e.status === 504)) return { entrega: { estado: "incierta", operationId, error: e.message }, recibo: null };
      if (e instanceof ErrorApi) return { entrega: { estado: "rechazada", operationId, error: e.message }, recibo: null };
      throw e;
    }
  }

  // ——— Avisos (Cola de Rateware, Gmail) ———
  // Rateware genera un borrador por carrier (adjudicado o no). El texto se
  // edita en la Cola de Rateware; aquí se aprueba y envía la versión exacta.
  generarAvisosAdjudicacion(eventId: string) {
    return this.rw({ action: "generate_rfx_award_notices", event_id: eventId });
  }
  // Aprobar = enviar con la versión (updated_at) que el Administrador vio. El
  // operation_id sale de los avisos y sus versiones: repetir no reenvía.
  enviarAvisos(eventId: string, avisos: Aviso[]) {
    return this.rw({
      action: "send_outreach_messages",
      rfx_event_id: eventId,
      ids: avisos.map((a) => a.id),
      expected_versions: avisos.map((a) => ({ id: a.id, updated_at: a.version })),
      provider: "gmail",
      channel: "email",
      confirmed: true,
      confirmation_action: "send_outreach_messages",
      operation_id: operacionTanda(eventId, avisos)
    });
  }

  // Varias invitaciones: tandas espaciadas. Se detiene en la primera tanda que
  // no sale completa (cuota de Gmail, fallo, incierto) y no reintenta sola; lo
  // que quedó en cola se ve como «en cola», nunca como enviado.
  async enviarPorTandas(
    eventId: string,
    avisos: Aviso[],
    o: { tamano?: number; esperaMs?: number; esperar?: (ms: number) => Promise<void>; alAvanzar?: (p: AvanceEnvio) => void; detener?: () => boolean } = {}
  ): Promise<AvanceEnvio> {
    const tandas = planearTandas(avisos, o.tamano);
    const esperar = o.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const avance: AvanceEnvio = { tandas: tandas.length, hechas: 0, enviados: 0, enCola: 0, fallidos: 0, inciertos: 0, pendientes: avisos.length, detenido: null };
    for (const [i, tanda] of tandas.entries()) {
      if (i > 0) {
        if (o.detener?.()) return { ...avance, detenido: "Detenido por el Administrador." };
        await esperar(o.esperaMs ?? ESPERA_ENTRE_TANDAS_MS);
        if (o.detener?.()) return { ...avance, detenido: "Detenido por el Administrador." };
      }
      const ids = tanda.map((a) => a.id);
      let r: ResultadoEnvio;
      try {
        r = leerResultado(await this.enviarAvisos(eventId, tanda), ids);
      } catch (e) {
        if (e instanceof ErrorApi && e.incierta) {
          avance.inciertos += ids.length;
          avance.detenido = "Rateware no respondió: esta tanda queda incierta. Revisa la Cola antes de seguir; reintentar no la duplica.";
          return avance;
        }
        throw e;
      }
      const enCola = r.skipped_rows.filter((x) => esCuota(x.reason)).length;
      avance.hechas += 1;
      avance.enviados += r.sent;
      avance.enCola += enCola;
      avance.fallidos += r.failed;
      avance.inciertos += r.delivery_unknown;
      avance.pendientes -= r.sent;
      o.alAvanzar?.({ ...avance });
      if (requiereAtencion(r, ids)) {
        avance.detenido = enCola
          ? `Gmail llegó a su cuota diaria: ${enCola} quedan en cola, sin enviar. Vuelve a aprobarlas cuando Gmail renueve la cuota; no se reintentan solas.`
          : "Una tanda no salió completa. Revisa los avisos antes de seguir.";
        return avance;
      }
    }
    return avance;
  }

  // ——— Liga del carrier ———
  invitacion(token: string) {
    return this.rw({ action: "get_invitation", token }, "rfx-bid-api");
  }
  enviarOferta(token: string, oferta: Record<string, unknown>) {
    return this.rw({ action: "submit_bid", token, ...oferta }, "rfx-bid-api");
  }
  responderRubros(token: string, confirmations: { segment_key: string; rubric_key: string; answer: string; value?: unknown; comment?: string | null }[]) {
    return this.rw({ action: "save_segment_confirmations", token, confirmations }, "rfx-bid-api");
  }
  declinar(token: string) {
    return this.rw({ action: "decline_invitation", token }, "rfx-bid-api");
  }
}
