import { z } from "zod";
import { consultarTarifario, esquemaTarifario } from "./tarifario.js";
import { ErrorApi, MesaApi, type Transporte } from "../cliente/api.js";
import { LECTURAS, sinSecretos } from "../servidor/proxy.js";
import { sinProtegidos } from "../servidor/paso.js";
import { esProtegido, eventoSinAvisos } from "../dominio/protegidos.js";
import { describirModelo, cambiosComerciales } from "../dominio/modelo.js";
import { avisoDe, candadosAdjudicacion, entregaConfirmada, hoyMexico, primario, recorrido, versionVigente } from "../dominio/recorrido.js";
import { intentosWhatsapp, seguimiento, siguienteIntento } from "../dominio/seguimiento.js";
import { consultaSegmento, familiaCaja, POR_PAGINA } from "../dominio/segmento.js";
import { BLOQUEO_SIN_AVISOS, bloqueosMeta, enmascarar, estadoPlantilla, PLANTILLA_RECORDATORIO, recordatorioYaEnviado, textoRecordatorio, variablesRecordatorio, type EstadoPlantilla } from "../dominio/whatsapp-meta.js";
import type { Detalle, Participacion, Rol, Ruta } from "../dominio/tipos.js";

const id = z.string().regex(/^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i);
const evento = { event_id: id };
const pagina = { offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(100).default(30) };
export const herramientas = {
  consultar_tarifario: { descripcion: "Tarifario general de Rateware, histórico y actual. Especifica origen y destino como ciudad, estado, país, y equipo. Usa tipo_servicio solo si conoces el servicio. Cada fila conserva importe, moneda, vigencia y procedencia. Continúa con siguiente_cursor incluso si la página queda vacía.", schema: esquemaTarifario },
  eventos: { descripcion: "Busca eventos por nombre/folio/shipper y estado; devuelve IDs para las demás consultas. Paginación local del listado recibido, cobertura de origen declarada.", schema: z.object({ buscar: z.string().max(100).optional(), estado: z.enum(["borrador", "abierto", "cerrado", "adjudicado", "archivado"]).optional(), ...pagina }).strict() },
  evento: { descripcion: "Foto del evento y su recorrido; no cambia estado. La liga abre la página del evento en Fr8Bid, no ejecuta botones.", schema: z.object(evento).strict() },
  seguimiento_evento: { descripcion: "Invitaciones, aperturas, respuestas y siguiente intento por cadencia existente; nunca envía ni prepara mensajes.", schema: z.object({ ...evento, ...pagina }).strict() },
  respuestas_evento: { descripcion: "Canales y fechas de respuesta. No contiene el texto ni acredita una tarifa capturada. Distingue consulta incompleta.", schema: z.object({ ...evento, ...pagina }).strict() },
  ofertas_evento: { descripcion: "Compara all-in y target por ruta, moneda, modelo, vigencia y condiciones, con candados. No adjudica.", schema: z.object({ ...evento, ruta_id: id.optional(), ...pagina }).strict() },
  historial_oferta: { descripcion: "Versiones disponibles de una participación del evento; Rateware real puede devolver solo la vigente.", schema: z.object({ ...evento, participacion_id: id }).strict() },
  candados_ruta: { descripcion: "Candados de primario y respaldo de una ruta, calculados con las reglas de Fr8Bid y el rol actual.", schema: z.object({ ...evento, ruta_id: id }).strict() },
  carriers_sugeridos: { descripcion: "Carrier fit existente con evidencia y carencias; no revisa ni invita carriers.", schema: z.object(evento).strict() },
  tarifas_ruta: { descripcion: "Tarifas aprobadas de una ruta/caja D2D y ofertas de hasta cinco eventos seleccionados. No son pagos. Cada página examina hasta 1000 tarifas; seguir siguiente_offset aunque no haya coincidencias.", schema: z.object({ origen: z.string().min(2).max(100), destino: z.string().min(2).max(100), caja: z.enum(["dry_van", "reefer", "flatbed"]), operacion: z.enum(["D2D Export", "D2D Import"]), offset: z.number().int().min(0).max(100000).multipleOf(POR_PAGINA).default(0), event_ids: z.array(id).max(5).default([]) }).strict() },
  carrier: { descripcion: "Perfil ligero de un carrier por UUID. No busca contactos nuevos ni consume Apollo.", schema: z.object({ carrier_id: id }).strict() },
  historial_carrier: { descripcion: "Hasta 300 registros del historial de contacto de un carrier. No equivale a historial contable ni a todas sus ofertas.", schema: z.object({ carrier_id: id }).strict() },
  whatsapp_pendientes: { descripcion: "Carriers que pasaron el 3er intento por correo sin responder y a los que ya toca WhatsApp (cadencia de Fr8Bid). Por carrier: listo_para_meta y bloqueos (número dudoso o sin lada, no contactar, sin permiso, plantilla de Meta no aprobada), vista previa de la plantilla con el número enmascarado y, solo como respaldo_manual, el texto y la liga wa.me. No envía ni prepara nada: el envío por Meta es preparar_whatsapp_intento", schema: z.object({ ...evento, ...pagina }).strict() },
  verificar_adjudicacion: { descripcion: "Revisa una adjudicación ya hecha: por ruta, primario y respaldo con la versión adjudicada y si su huella coincide con la oferta vigente, cierre en Rateware (rateware_closeout_at) y avisos de ganador, respaldo y no adjudicado. Declara lo que no puede leer. No adjudica, no entrega ni envía avisos.", schema: z.object({ ...evento, ...pagina }).strict() }
};
export type NombreHerramienta = keyof typeof herramientas;
const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const ciudad = (s: string) => normal(s.split(",")[0]);
const liga = (id: string) => `https://fr8bid.heymarksman.com/eventos/${encodeURIComponent(id)}`;
const entrega = { estado: "sin_preparar" as const, operationId: null, error: null };
// Lo que verificar_adjudicacion no puede comprobar con las lecturas de LECTURAS.
const FALTANTES_ADJUDICACION = [
  "Estado actual de la tarifa en Rateware («en revisión» / pending_review): no hay lectura en el MCP. El cierre registrado indica que la entrega se hizo; confirma el estado en Rateware o en la página del evento en Fr8Bid.",
  "Recibo de la entrega (operation_id, insertadas, en revisión): solo se muestra al confirmar la entrega en la página del evento en Fr8Bid; aquí la prueba es rateware_closeout_at de cada primario.",
  "Idioma de cada aviso: esta lectura no lo trae."
];
function verificarAdjudicacion(d: Detalle, r: Ruta) {
  const aviso = (p: Participacion) => {
    const a = avisoDe(d, p.id, "adjudicacion");
    return a ? { resultado: a.resultado, estado: a.estado, enviado_en: a.enviadoEn, motivo: a.motivo } : null;
  };
  const decidida = (p: Participacion) => {
    const v = versionVigente(p);
    const adj = p.adjudicada;
    const huella = !adj ? "sin_verificar" : v && v.numero === adj.numero && v.huella === adj.huella ? "coincide" : "no_coincide";
    const adjudicada = adj ? p.versiones.find(x => x.numero === adj.numero) ?? null : null;
    return { participacion_id: p.id, carrier_id: p.carrierId, carrier: p.carrier, rol: p.rol, version_adjudicada: adj?.numero ?? null, version_vigente: v?.numero ?? null,
      huella, tarifa_adjudicada: adjudicada?.tarifaAllIn ?? null, moneda: adjudicada?.moneda ?? null, adjudicada_en: adj?.en ?? null, cierre_rateware_en: p.entregadaEn, aviso: aviso(p) };
  };
  const prim = primario(r);
  const respaldos = r.participaciones.filter(p => p.rol === "respaldo");
  const noAdjudicados = r.participaciones.filter(p => !p.rol && p.estado !== "excluida" && p.estado !== "declino" && versionVigente(p));
  const problemas: string[] = [];
  if (!prim && !r.desiertaMotivo) problemas.push("Ruta sin primario ni motivo de desierta.");
  const filas = [...(prim ? [prim] : []), ...respaldos].map(decidida);
  for (const f of filas) {
    const quien = `${f.rol === "primario" ? "Primario" : "Respaldo"} ${f.carrier}`;
    if (f.huella === "no_coincide") problemas.push(`${quien}: hay una versión posterior a la adjudicada (v${f.version_vigente} vs v${f.version_adjudicada}).`);
    if (f.huella === "sin_verificar") problemas.push(`${quien}: no se pudo determinar la versión adjudicada.`);
    if (f.rol === "primario" && !f.cierre_rateware_en) problemas.push(`${quien}: sin cierre en Rateware (no se ha entregado).`);
    if (f.aviso?.estado !== "aceptado") problemas.push(`${quien}: aviso ${f.aviso ? f.aviso.estado : "no generado"}.`);
  }
  const otros = noAdjudicados.map(p => ({ participacion_id: p.id, carrier_id: p.carrierId, carrier: p.carrier, aviso: aviso(p) }));
  for (const o of otros) if (o.aviso?.estado !== "aceptado") problemas.push(`No adjudicado ${o.carrier}: aviso ${o.aviso ? o.aviso.estado : "no generado"}.`);
  return { ruta_id: r.id, numero: r.numero, origen: r.origen, destino: r.destino, equipo: r.equipo, desierta: r.desiertaMotivo, adjudicados: filas, no_adjudicados: otros, problemas, ok: problemas.length === 0 };
}
function paginar<T>(rows: T[], offset: number, limit: number) {
  return { filas: rows.slice(offset, offset + limit), total_recibido: rows.length, siguiente_offset: offset + limit < rows.length ? offset + limit : null };
}

/** Una instancia por petición: sin caché de datos ni credenciales entre usuarios. */
export function crearLecturas(t: Transporte, ahora: () => Date = () => new Date(), rol: Rol = "viewer") {
  const soloLectura: Transporte = async (s, body) => {
    if (s !== "rateware-api" || !LECTURAS[s].has(String(body.action))) throw new Error("Acción fuera del MCP de lectura");
    if (esProtegido(String(body.event_id || body.rfx_event_id || ""))) throw new Error("Evento protegido");
    const r = await t(s, body);
    if (r.status >= 200 && r.status < 300) {
      const b = r.body;
      const objeto = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
      const filas = (x: unknown) => Array.isArray(x) && x.every(objeto);
      if (!objeto(b)) throw new Error("Respuesta inválida");
      if (body.action === "list_rfx_detail") {
        if (!objeto(b.event) || typeof b.event.id !== "string" || b.event.id.toLowerCase() !== String(body.event_id).toLowerCase() ||
            !filas(b.lanes) || b.lanes.some((l: any) => !filas(l.invitations))) throw new Error("Detalle inválido");
        // El mapper compartido usa Number(): un vacío no debe convertirse en cero.
        // Regla conservadora: si la oferta trae un importe presente pero inválido, o alguna revisión no trae importe válido,
        // la participación queda sin versiones («sin tarifa»). Así no hay oferta de cero, no cuenta como oferta
        // en seguimiento/recorrido y no resucita una revisión anterior como vigente.
        const importe = (x: unknown) => (typeof x === "number" || typeof x === "string" && x.trim() !== "") && Number.isFinite(Number(x)) ? Number(x) : null;
        const invalido = (x: unknown) => x !== null && x !== undefined && importe(x) === null;
        const participacion = (p: Record<string, any>) => {
          const revisiones: unknown[] = Array.isArray(p.bid_revisions) ? p.bid_revisions : [];
          if (invalido(p.bid_rate) || revisiones.some(v => !objeto(v) || importe(v.bid_rate) === null))
            return { ...p, bid_rate: null, ...(Array.isArray(p.bid_revisions) ? { bid_revisions: [] } : {}) };
          return { ...p, bid_rate: importe(p.bid_rate) };
        };
        return { ...r, body: sinProtegidos(sinSecretos({ ...b, lanes: b.lanes.map((l: any) => ({ ...l,
          invitations: l.invitations.map(participacion)
        })) })) };
      } else if (body.action === "list_rfx_events") {
        if (!filas(b.rows ?? b.events)) throw new Error("Listado inválido");
      } else if (body.action === "carrier_recommendations") {
        if (!filas(b.recommendations)) throw new ErrorApi(502, "RESPUESTA_INVALIDA", "Respuesta de sugerencias inválida");
      } else {
        if (!filas(b.rows ?? (body.action === "list_outreach_messages" ? b.messages : undefined))) throw new Error("Listado inválido");
      }
    }
    return { ...r, body: sinProtegidos(sinSecretos(r.body)) };
  };
  const api = new MesaApi(soloLectura, () => hoyMexico(ahora()));
  const pedir = async (body: Record<string, unknown>) => {
    const r = await soloLectura("rateware-api", body);
    if (r.status < 200 || r.status >= 300) throw new ErrorApi(r.status, String(r.body?.code || "LECTURA"), "No se pudo completar la lectura");
    return r.body;
  };
  function ofertas(d: Detalle, r: Ruta) {
    const ctx = { rol, hoy: hoyMexico(ahora()), entrega };
    return { ruta_id: r.id, numero: r.numero, origen: r.origen, destino: r.destino, equipo: r.equipo, objetivo: r.objetivo, moneda: r.moneda, condiciones: r.condiciones,
      ofertas: r.participaciones.map(p => {
        const candidata = versionVigente(p);
        const v = candidata && Number.isFinite(candidata.tarifaAllIn) ? candidata : null;
        const participacion = v ? p : { ...p, versiones: [] };
        return { participacion_id: p.id, carrier_id: p.carrierId, carrier: p.carrier, estado: p.estado, vigente: v, modelo: v ? describirModelo(v) : null,
          tarifa: v?.tarifaAllIn ?? null, estado_tarifa: v ? "con_tarifa" : "sin_tarifa",
          diferencia_objetivo: v && r.objetivo !== null && v.moneda === r.moneda ? v.tarifaAllIn - r.objetivo : null,
          condiciones: p.condiciones, rubros: p.rubros, candados: candadosAdjudicacion(d, r, participacion, ctx), candados_respaldo: candadosAdjudicacion(d, r, participacion, ctx, "respaldo") };
      }) };
  }
  return async (nombre: string, args: Record<string, unknown>): Promise<Record<string, any>> => {
    if (!Object.hasOwn(herramientas, nombre)) throw new Error("Herramienta fuera de esta entrega de lectura");
    const a: any = herramientas[nombre as NombreHerramienta].schema.parse(args);
    if (esProtegido(a.event_id) || (a.event_ids as string[] | undefined)?.some(esProtegido)) throw new Error("Evento protegido");
    const fecha = ahora().toISOString();
    let result: Record<string, unknown>;
    if (nombre === "consultar_tarifario") {
      result = await consultarTarifario(a, hoyMexico(ahora()), pedir);
    } else if (nombre === "eventos") {
      const rows = (await api.eventos()).filter(e => !esProtegido(e.id) && (!a.estado || e.estado === a.estado) && (!a.buscar || normal(`${e.folio} ${e.nombre} ${e.shipper}`).includes(normal(a.buscar))));
      const p = paginar(rows, a.offset, a.limit);
      result = { eventos: p.filas.map(({ rutas: _rutas, ...e }) => e), total_recibido: p.total_recibido, siguiente_offset: p.siguiente_offset, cobertura: "Listado recibido de la API; no garantiza exhaustividad del origen." };
    } else if (nombre === "carrier" || nombre === "historial_carrier") {
      const b = await pedir(nombre === "carrier" ? { action: "list_vendors", ids: [a.carrier_id], lightweight: true } : { action: "list_contact_history", vendor_id: a.carrier_id, limit: 300, offset: 0 });
      const rows = (Array.isArray(b.rows) ? b.rows : []).filter((r: any) => !esProtegido(r.rfx_event_id) && !esProtegido(r.event_id) && !esProtegido(r.metadata?.rfx_event_id) && !esProtegido(r.metadata?.event_id));
      result = { filas: rows.map((r: any) => nombre === "carrier"
        ? { id: r.id, nombre: r.vendor_name, dominio: r.domain, correo: r.primary_email, telefono: r.whatsapp_phone, no_contactar_whatsapp: r.whatsapp_do_not_contact, estado: r.status, etapa: r.base_stage }
        : { id: r.id, fecha: r.occurred_at || r.created_at, tipo: r.event_type || r.type || r.action, direccion: r.direction, canal: r.channel, estado: r.status, resumen: r.summary || r.notes }), truncado: b.has_more === true, cobertura: nombre === "carrier" ? "Perfil ligero; no incluye membresías de listas ni historial de ofertas." : "Historial de contacto, máximo 300 registros; más registros se consultan en la app." };
    } else if (nombre === "tarifas_ruta") {
      const q = consultaSegmento({ familia: a.caja, operacion: a.operacion, estadoOrigen: null, estadoDestino: null }, a.offset / POR_PAGINA);
      const b = await pedir(q);
      const rows: any[] = b.rows || [];
      const matches = rows.filter(r => !esProtegido(r.rfx_event_id) && !esProtegido(r.event_id) && ciudad(String(r.origin_city || r.origin || "")) === ciudad(a.origen) && ciudad(String(r.destination_city || r.destination || "")) === ciudad(a.destino));
      const historicas: unknown[] = [];
      for (const eventId of [...new Set<string>(a.event_ids)]) {
        const d = await api.detalle(eventId);
        for (const r of d.rutas) if (ciudad(r.origen) === ciudad(a.origen) && ciudad(r.destino) === ciudad(a.destino) && familiaCaja(r.equipo) === a.caja && r.segmento?.operacion === a.operacion) historicas.push({ evento: d.evento, ...ofertas(d, r) });
      }
      result = { tarifas: matches.map(r => ({ id: r.id, origen: r.origin_city || r.origin, estado_origen: r.origin_state, pais_origen: r.origin_country, destino: r.destination_city || r.destination, estado_destino: r.destination_state, pais_destino: r.destination_country, caja: r.trailer, moneda: r.currency, all_in: r.all_in_rate, carrier: r.vendors?.vendor_name || null, carrier_id: r.vendor_id, fecha: r.created_at })), ofertas_rfx: historicas,
        filas_examinadas: rows.length, siguiente_offset: b.has_more === true ? a.offset + POR_PAGINA : null,
        cobertura: "Tarifas aprobadas D2D de esta página y solo los RFx seleccionados. Coincidencia por ciudad: confirmar estados/países antes de comparar. No acredita pagos realizados; sin convertir monedas." };
    } else {
      const d = await api.detalle(a.event_id);
      const ctx = { rol, hoy: hoyMexico(ahora()), entrega };
      const common = { evento: d.evento, mesa_url: liga(d.evento.id), respuestas_consultadas: d.respuestas !== null && d.respuestas !== undefined, cobertura_versiones: "Versiones disponibles en la fuente; en Rateware real puede ser solo la vigente." };
      if (nombre === "evento") result = { ...common, rutas: d.rutas.map(({ participaciones: _p, ...r }) => r), recorrido: recorrido(d, ctx) };
      else if (nombre === "seguimiento_evento") result = { ...common, ...paginar(seguimiento(d, ctx.hoy).map(s => ({ carrier_id: s.carrierId, carrier: s.carrier, estado: s.estado, rutas: s.rutas, ofertadas: s.ofertadas, declinadas: s.declinadas, intentos: s.intentos, ultimo_envio: s.ultimoEnvio, correo_abierto: s.correoAbiertoEn, apertura_posible: s.aperturaPosibleEn, correo_medido: s.correoMedido, liga_abierta: s.vistaEn, respondio_por: s.respondioPor, siguiente_intento: d.respuestas == null ? null : siguienteIntento(d, s, ahora()) })), a.offset, a.limit) };
      else if (nombre === "respuestas_evento") result = { ...common, ...paginar(Object.values(d.respuestas || {}), a.offset, a.limit), cobertura: "Canales y fechas; no incluye contenido del mensaje ni convierte una respuesta en oferta." };
      else if (nombre === "carriers_sugeridos") result = { ...common, sugerencias: await api.carrierFit(d) };
      else if (nombre === "whatsapp_pendientes") {
        // Misma lista que la Mesa (intentosWhatsapp): sin respuestas consultadas devuelve vacío.
        const lista = intentosWhatsapp(d, ahora(), ctx.hoy);
        const p = paginar(lista, a.offset, a.limit);
        // Base de permiso (list_vendors) y estado de la plantilla (list_outreach_templates → whatsapp_meta):
        // si no se pueden leer, el carrier no queda listo, con su motivo.
        const ids = p.filas.map(w => w.s.carrierId);
        const [vendors, plantillas, whatsapps] = ids.length ? await Promise.all([
          pedir({ action: "list_vendors", ids, lightweight: true }).then(b => b.rows as any[], () => null),
          pedir({ action: "list_outreach_templates" }).then(b => estadoPlantilla(b.rows), () => null),
          pedir({ action: "list_outreach_messages", rfx_event_id: d.evento.id, channel: "whatsapp" }).then(b => (b.rows ?? b.messages) as any[], () => null)
        ]) : [null, null, null];
        const permisoDe = (id: string) => vendors ? (vendors.find(v => v?.id === id)?.whatsapp_permission_basis ?? null) : undefined;
        const filas = p.filas.map(w => {
          const bloqueos: { codigo: string; motivo: string }[] = bloqueosMeta(w, permisoDe(w.s.carrierId), plantillas as EstadoPlantilla | null);
          if (recordatorioYaEnviado(whatsapps, d.evento.id, w.s.carrierId, "intento_4")) bloqueos.unshift({ codigo: "ya_enviado", motivo: "Ya se le mandó este WhatsApp por Meta; no se repite." });
          // PRIMA: nunca queda listo (decisión del propietario, 17-nov-2026).
          if (eventoSinAvisos(d.evento)) bloqueos.unshift(BLOQUEO_SIN_AVISOS);
          return { carrier_id: w.s.carrierId, carrier: w.s.carrier, estado: w.s.estado, intentos_correo: w.s.intentos, ultimo_envio: w.s.ultimoEnvio,
            rutas_pendientes: w.s.pendientes.map(f => ({ ruta_id: f.ruta.id, numero: f.ruta.numero, origen: f.ruta.origen, destino: f.ruta.destino, equipo: f.ruta.equipo })),
            telefono: w.numero ? `+${w.numero}` : null, pais: w.telefono.pais, certeza: w.telefono.certeza, revision_telefono: w.telefono.motivo,
            listo_para_meta: bloqueos.length === 0, bloqueos,
            meta: { plantilla: PLANTILLA_RECORDATORIO.nombre, estado_plantilla: plantillas?.estado ?? "NO_VERIFICADA", para: enmascarar(w.numero),
              texto: textoRecordatorio(variablesRecordatorio(d, w.s.carrier)) },
            // Solo si Meta no está lista: una persona lo manda desde su teléfono.
            respaldo_manual: { texto: w.texto, liga_whatsapp: w.liga, sin_liga_porque: w.motivo } };
        });
        result = { ...common, filas, total_recibido: p.total_recibido, siguiente_offset: p.siguiente_offset,
          plantilla_meta: { nombre: PLANTILLA_RECORDATORIO.nombre, estado: plantillas?.estado ?? "NO_VERIFICADA" },
          cobertura: common.respuestas_consultadas ? "Solo quienes ya agotaron los correos de la cadencia y siguen sin responder en rutas sin suficientes ofertas. País por reglas de lada; «dudoso» se confirma antes de enviar (la revisión con IA está en la página del evento en Fr8Bid). El envío por Meta es preparar_whatsapp_intento (solo con listo_para_meta); respaldo_manual es para mandarlo a mano." : "No se pudieron consultar las respuestas de los carriers: sin eso no se sabe a quién ya no escribir, así que la lista sale vacía." };
      }
      else if (nombre === "verificar_adjudicacion") {
        const p = paginar(d.rutas, a.offset, a.limit);
        const rutas = p.filas.map(r => verificarAdjudicacion(d, r));
        result = { ...common, estado_evento: d.evento.estado, entrega_confirmada: entregaConfirmada(d, entrega), rutas, total_rutas: p.total_recibido, siguiente_offset: p.siguiente_offset,
          rutas_con_problemas: rutas.filter(r => !r.ok).length, no_verificable: FALTANTES_ADJUDICACION };
      }
      else if (nombre === "historial_oferta") {
        const p = d.rutas.flatMap(r => r.participaciones).find(p => p.id === a.participacion_id);
        if (!p) throw new Error("La participación no pertenece al evento");
        const versiones = [...p.versiones].sort((a, b) => a.numero - b.numero);
        result = { ...common, versiones, cobertura: common.cobertura_versiones, cambios: versiones.slice(1).map((v, i) => ({ numero: v.numero, cambios: cambiosComerciales(versiones[i], v) })) };
      } else {
        const rutas = d.rutas.filter(r => !a.ruta_id || r.id === a.ruta_id);
        if (a.ruta_id && !rutas.length) throw new Error("La ruta no pertenece al evento");
        const p = paginar(rutas, a.offset ?? 0, a.limit ?? 100);
        result = { ...common, rutas: p.filas.map(r => ofertas(d, r)), siguiente_offset: p.siguiente_offset };
      }
    }
    const limpio = sinSecretos({ ...result, consultado_en: fecha, solo_lectura: true });
    if (JSON.stringify(limpio).length > 200000) {
      if (nombre === "consultar_tarifario") return {
        estado:"incompleta", completa:false, cursor_entrada:a.cursor ?? null, limit_sugerido:Math.max(1,Math.floor(a.limit/2)),
        error:{codigo:"RESPUESTA_DEMASIADO_GRANDE", sugerencia:a.limit===1
          ? "Una tarifa supera el límite de respuesta. La cobertura queda incompleta."
          : "Reduce limit y repite desde el mismo cursor."},
        consultado_en:fecha, solo_lectura:true,
      };
      const rutas: any[] = Array.isArray(limpio.rutas) ? limpio.rutas : [];
      const grande = rutas.find(r => JSON.stringify(r).length > 200000);
      return { error: { codigo: "RESPUESTA_DEMASIADO_GRANDE", ruta_id: grande?.ruta_id ?? grande?.id ?? a.ruta_id ?? null,
        sugerencia: grande ? "Filtra la consulta; esta ruta supera el límite por sí sola. Revisa sus ofertas en la página del evento en Fr8Bid." : "Filtra por ruta o reduce limit; revisa el detalle en la página del evento en Fr8Bid." },
        consultado_en: fecha, solo_lectura: true };
    }
    return limpio;
  };
}
