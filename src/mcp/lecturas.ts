import { z } from "zod";
import { ErrorApi, MesaApi, type Transporte } from "../cliente/api.js";
import { LECTURAS, sinSecretos } from "../servidor/proxy.js";
import { esProtegido } from "../dominio/protegidos.js";
import { describirModelo, cambiosComerciales } from "../dominio/modelo.js";
import { candadosAdjudicacion, hoyMexico, recorrido, versionVigente } from "../dominio/recorrido.js";
import { seguimiento, siguienteIntento } from "../dominio/seguimiento.js";
import { consultaSegmento, familiaCaja, POR_PAGINA } from "../dominio/segmento.js";
import type { Detalle, Rol, Ruta } from "../dominio/tipos.js";

const id = z.string().regex(/^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i);
const evento = { event_id: id };
const pagina = { offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(100).default(30) };
export const herramientas = {
  eventos: { descripcion: "Busca eventos por nombre/folio/shipper y estado; devuelve IDs para las demás consultas. Paginación local del listado recibido, cobertura de origen declarada.", schema: z.object({ buscar: z.string().max(100).optional(), estado: z.enum(["borrador", "abierto", "cerrado", "adjudicado", "archivado"]).optional(), ...pagina }).strict() },
  evento: { descripcion: "Foto del evento y su recorrido; no cambia estado. La liga abre la Mesa, no ejecuta botones.", schema: z.object(evento).strict() },
  seguimiento_evento: { descripcion: "Invitaciones, aperturas, respuestas y siguiente intento por cadencia existente; nunca envía ni prepara mensajes.", schema: z.object({ ...evento, ...pagina }).strict() },
  respuestas_evento: { descripcion: "Canales y fechas de respuesta. No contiene el texto ni acredita una tarifa capturada. Distingue consulta incompleta.", schema: z.object({ ...evento, ...pagina }).strict() },
  ofertas_evento: { descripcion: "Compara all-in y target por ruta, moneda, modelo, vigencia y condiciones, con candados. No adjudica.", schema: z.object({ ...evento, ruta_id: id.optional(), ...pagina }).strict() },
  historial_oferta: { descripcion: "Versiones disponibles de una participación del evento; Rateware real puede devolver solo la vigente.", schema: z.object({ ...evento, participacion_id: id }).strict() },
  candados_ruta: { descripcion: "Candados de primario y respaldo de una ruta, calculados con las reglas de la Mesa y el rol actual.", schema: z.object({ ...evento, ruta_id: id }).strict() },
  carriers_sugeridos: { descripcion: "Carrier fit existente con evidencia y carencias; no revisa ni invita carriers.", schema: z.object(evento).strict() },
  tarifas_ruta: { descripcion: "Tarifas aprobadas de una ruta/caja D2D y ofertas de hasta cinco eventos seleccionados. No son pagos. Cada página examina hasta 1000 tarifas; seguir siguiente_offset aunque no haya coincidencias.", schema: z.object({ origen: z.string().min(2).max(100), destino: z.string().min(2).max(100), caja: z.enum(["dry_van", "reefer", "flatbed"]), operacion: z.enum(["D2D Export", "D2D Import"]), offset: z.number().int().min(0).max(100000).multipleOf(POR_PAGINA).default(0), event_ids: z.array(id).max(5).default([]) }).strict() },
  carrier: { descripcion: "Perfil ligero de un carrier por UUID. No busca contactos nuevos ni consume Apollo.", schema: z.object({ carrier_id: id }).strict() },
  historial_carrier: { descripcion: "Hasta 300 registros del historial de contacto de un carrier. No equivale a historial contable ni a todas sus ofertas.", schema: z.object({ carrier_id: id }).strict() }
};
export type NombreHerramienta = keyof typeof herramientas;
const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const ciudad = (s: string) => normal(s.split(",")[0]);
const liga = (id: string) => `https://fr8bid.heymarksman.com/eventos/${encodeURIComponent(id)}`;
const entrega = { estado: "sin_preparar" as const, operationId: null, error: null };
function paginar<T>(rows: T[], offset: number, limit: number) {
  return { filas: rows.slice(offset, offset + limit), total_recibido: rows.length, siguiente_offset: offset + limit < rows.length ? offset + limit : null };
}

/** Una instancia por petición: sin caché de datos ni credenciales entre usuarios. */
export function crearLecturas(t: Transporte, ahora: () => Date = () => new Date(), rol: Rol = "viewer") {
  const soloLectura: Transporte = async (s, body) => {
    if (s !== "rateware-api" || !LECTURAS[s].has(String(body.action))) throw new Error("Acción fuera del MCP de lectura");
    if (esProtegido(String(body.event_id || body.rfx_event_id || ""))) throw new Error("Evento protegido");
    return t(s, body);
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
        const v = versionVigente(p);
        return { participacion_id: p.id, carrier_id: p.carrierId, carrier: p.carrier, estado: p.estado, vigente: v, modelo: v ? describirModelo(v) : null,
          diferencia_objetivo: v && r.objetivo !== null && v.moneda === r.moneda ? v.tarifaAllIn - r.objetivo : null,
          condiciones: p.condiciones, rubros: p.rubros, candados: candadosAdjudicacion(d, r, p, ctx), candados_respaldo: candadosAdjudicacion(d, r, p, ctx, "respaldo") };
      }) };
  }
  return async (nombre: string, args: Record<string, unknown>): Promise<Record<string, any>> => {
    if (!Object.hasOwn(herramientas, nombre)) throw new Error("Herramienta fuera de esta entrega de lectura");
    const a: any = herramientas[nombre as NombreHerramienta].schema.parse(args);
    const fecha = ahora().toISOString();
    let result: Record<string, unknown>;
    if (nombre === "eventos") {
      const rows = (await api.eventos()).filter(e => !esProtegido(e.id) && (!a.estado || e.estado === a.estado) && (!a.buscar || normal(`${e.folio} ${e.nombre} ${e.shipper}`).includes(normal(a.buscar))));
      const p = paginar(rows, a.offset, a.limit);
      result = { eventos: p.filas, total_recibido: p.total_recibido, siguiente_offset: p.siguiente_offset, cobertura: "Listado recibido de la API; no garantiza exhaustividad del origen." };
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
    if (JSON.stringify(limpio).length > 200000) throw new Error("Resultado demasiado grande. Consulta una ruta o reduce limit; revisa el detalle en la Mesa.");
    return limpio;
  };
}
