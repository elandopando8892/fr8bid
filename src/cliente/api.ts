// Acciones de la Mesa del evento sobre Rateware. La interfaz y las pruebas del
// recorrido usan esta misma capa; solo cambia el transporte (HTTP a /api o el
// Rateware simulado detrás del mismo proxy).

import { configCarrierFit, leerCarrierFit, type CarrierFit } from "../dominio/carrierFit";
import type { EntradaCatalogo } from "../dominio/condiciones-r1";
import { operacionEntrega } from "../dominio/operacion";
import { hoyMexico, primario, versionMasReciente, versionVigente } from "../dominio/recorrido";
import { ESPERA_ENTRE_TANDAS_MS, esCuota, leerResultado, operacionTanda, planearTandas, requiereAtencion, type ResultadoEnvio } from "../dominio/tandas";
import type { Aviso, Detalle, EntregaLocal, Recibo, ResumenEvento } from "../dominio/tipos";
import { manejar, type Respuesta, type Servicio } from "../servidor/proxy";
import type { RatewareSimulado } from "../simulado/rateware";
import * as mapear from "./mapear";

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

export class MesaApi {
  constructor(private t: Transporte, private hoy: () => string = () => hoyMexico()) {}

  private async rw(body: Record<string, unknown>, servicio: Servicio = "rateware-api") {
    const r = await this.t(servicio, body);
    if (r.status >= 200 && r.status < 300) return r.body;
    throw new ErrorApi(r.status, String(r.body?.code || r.status), String(r.body?.error || "Error de Rateware"), Boolean(r.body?.incierta));
  }

  async eventos(): Promise<ResumenEvento[]> {
    return mapear.resumenes(await this.rw({ action: "list_rfx_events" }), this.hoy());
  }

  async detalle(eventId: string, recibo: Recibo | null = null): Promise<Detalle> {
    const [crudo, mensajes, rubros, condiciones, revisiones] = await Promise.all([
      this.rw({ action: "list_rfx_detail", event_id: eventId }),
      this.rw({ action: "list_outreach_messages", rfx_event_id: eventId }),
      this.rw({ action: "list_rfx_segment_confirmations", event_id: eventId }),
      this.condicionesDe(eventId),
      this.revisionesDe(eventId)
    ]);
    const d = mapear.detalle(crudo, mensajes.rows || mensajes.messages || [], null, { hoy: this.hoy(), rubros: rubros.rows || [], condiciones, revisiones });
    return { ...d, recibo };
  }

  // ——— Condiciones de ruta (parche R1; contra Rateware real, hasta que se
  // aplique, el proxy responde 501 y la Mesa sigue sin condiciones) ———
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
  // «Carrier fit» de Rateware para las rutas del evento (solo lectura).
  async carrierFit(d: Detalle): Promise<CarrierFit> {
    return leerCarrierFit(d, await this.rw({ action: "carrier_recommendations", config: configCarrierFit(d) }));
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
  preseleccionar(laneId: string, vendorIds: string[]) {
    return this.rw({ action: "shortlist_rfx_lane_vendors", lane_id: laneId, vendor_ids: vendorIds });
  }
  // Solo para carriers con la marca «Revisado» vigente (el proxy lo vuelve a
  // comprobar). Rateware reporta los omitidos en skipped_rows.
  prepararInvitaciones(eventId: string, revisados: string[]) {
    return this.rw({ action: "generate_outreach_drafts", event_id: eventId, reviewed_vendor_ids: revisados });
  }
  publicar(eventId: string) {
    return this.rw({ action: "update_rfx_event", event_id: eventId, patch: { status: "open" } });
  }
  // La invitación salió por otro canal (correo propio, WhatsApp, llamada): solo
  // cambia el estado en Rateware; Fr8Bid no envía nada.
  marcarInvitadas(eventId: string, ids: string[]) {
    return this.rw({ action: "invite_rfx_lane_vendors", event_id: eventId, ids, confirmed: true, confirmation_action: "invite_rfx_lane_vendors" });
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
        capture_source: "manual_operator",
        manual_source_channel: c.canal,
        source_note: `Captured from ${etiqueta}${notas ? `: ${notas}` : ""}`
      }
    });
  }

  // ——— Decisiones (Administrador) ———
  // En Rateware «closed» es la entrega, no el cierre a ofertas. Cerrar a ofertas
  // es mover el plazo a ayer: la liga responde 409 y el evento sigue abierto
  // para adjudicar y entregar con operation_id.
  cerrarAOfertas(eventId: string) {
    return this.rw({ action: "update_rfx_event", event_id: eventId, patch: { due_date: diaAnterior(this.hoy()) } });
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
        if (!x.adjudicada || !vx) return { estado: "sin_preparar", operationId: null, error: `No se identifica la versión adjudicada de ${x.carrier}.` };
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
