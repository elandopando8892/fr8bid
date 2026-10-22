// Traduce la forma cruda de rateware-api al modelo de la Mesa. Los nombres de
// columna salen de rfx_lanes / rfx_lane_vendors (migraciones de Rateware) y de
// submit_bid en rfx-bid-api b11991f8. Campos marcados «sin verificar» se leyeron
// del código, no de una respuesta real.

import { conditionKeyFromRubric } from "../dominio/condiciones-r1.js";
import { huellaAviso, huellaOferta } from "../dominio/huella.js";
import { esProtegido } from "../dominio/protegidos.js";
import { hoyMexico } from "../dominio/recorrido.js";
import { revisionesVigentes } from "../dominio/revision.js";
import type {
  Aviso,
  CondicionRuta,
  Detalle,
  EstadoAviso,
  EstadoEvento,
  EstadoParticipacion,
  OfertaVersion,
  Participacion,
  Recibo,
  ResumenEvento,
  RubroEstado,
  Ruta
} from "../dominio/tipos.js";

type Fila = Record<string, any>;

const ESTADO_EVENTO: Record<string, EstadoEvento> = {
  draft: "borrador",
  open: "abierto",
  closed: "cerrado",
  awarded: "adjudicado",
  archived: "archivado"
};

const ESTADO_PARTICIPACION: Record<string, EstadoParticipacion> = {
  drafted: "preseleccionada",
  shortlisted: "preseleccionada",
  invited: "invitada",
  viewed: "vista",
  responded: "respondio",
  quoted: "respondio",
  bid_submitted: "respondio",
  declined: "declino",
  withdrawn: "declino",
  archived: "excluida"
};

// rfx_segment_confirmations.answer (rfx-bid-api SEGMENT_CONFIRMATION_ANSWERS);
// «disagree» es la negativa expresa que bloquea la entrega.
const RUBRO: Record<string, RubroEstado> = {
  pending: "sin_respuesta",
  agree: "de_acuerdo",
  exception: "excepcion",
  disagree: "no_puedo",
  not_applicable: "no_aplica"
};

// Estado de la Mesa a partir de Rateware. «abierto» con el plazo vencido es
// «cerrado a ofertas»: la liga ya no acepta versiones (rfx-bid-api dueState).
function estadoEvento(e: Fila, hoy: string): EstadoEvento {
  const base = ESTADO_EVENTO[e.status] || "borrador";
  if (base === "abierto" && e.due_date && String(e.due_date).slice(0, 10) < hoy) return "cerrado";
  return base;
}

// Estados de outreach_messages (OUTREACH_MANUAL_STATUSES de rateware-api).
// queued/sending/delivery_unknown no se reenvían: cuentan como inciertos.
const ESTADO_AVISO: Record<string, EstadoAviso> = {
  drafted: "borrador",
  queued: "en_cola",
  sending: "en_cola",
  sent: "aceptado",
  delivered: "aceptado",
  read: "aceptado",
  manual_sent: "aceptado",
  replied: "aceptado",
  delivery_unknown: "incierto",
  failed: "fallido",
  bounced: "rebotado"
};

const num = (x: unknown): number | null => (x === null || x === undefined || x === "" ? null : Number(x));
const lugar = (ciudad: unknown, estado: unknown, libre: unknown) =>
  [ciudad, estado].filter(Boolean).join(", ") || String(libre || "—");

export const esPrueba = (nombre: unknown) => /PRUEBA CONTROLADA/i.test(String(nombre || ""));

function version(r: Fila, numero: number): OfertaVersion {
  const base = {
    tarifaAllIn: Number(r.bid_rate),
    moneda: String(r.currency || "USD").toUpperCase(),
    modeloComercial: String(r.commercial_model || "cost_plus"),
    carrierSharePct: num(r.carrier_share_pct),
    margenPct: num(r.marksman_margin_pct),
    capacidadSemanal: num(r.weekly_capacity),
    transitoDias: num(r.transit_days),
    vigenteHasta: r.valid_through ? String(r.valid_through).slice(0, 10) : null,
    esFinal: r.best_final === true
  };
  const fuente = r.response_source === "carrier_portal" ? "portal_carrier" : r.response_source === "import" ? "importacion" : "captura_equipo";
  return {
    ...base,
    numero,
    fuente,
    actor: String(r.actor || (fuente === "portal_carrier" ? "portal del carrier" : "equipo")),
    nota: r.notes || null,
    creadaEn: String(r.created_at || r.responded_at || ""),
    huella: huellaOferta(base)
  };
}

function participacion(lv: Fila, confirmaciones: Fila[]): Participacion {
  // Rateware real: solo la versión vigente (columnas de rfx_lane_vendors).
  // Simulado: además `bid_revisions`, el historial que Rateware no expone.
  const revisiones: Fila[] = Array.isArray(lv.bid_revisions) ? lv.bid_revisions : [];
  const versiones = revisiones.length
    ? revisiones.map((r) => version(r, Number(r.revision)))
    : lv.bid_rate !== null && lv.bid_rate !== undefined
      ? [version(lv, 1)]
      : [];
  const rol = lv.award_role === "primary" ? "primario" : lv.award_role === "backup" ? "respaldo" : null;
  let adjudicada: Participacion["adjudicada"] = null;
  if (rol && versiones.length) {
    // La adjudicación de Rateware apunta a la fila, no a una versión: se toma la
    // última versión anterior a awarded_at (contrato C2 pendiente).
    const corte = String(lv.awarded_at || "");
    const previas = corte ? versiones.filter((v) => !v.creadaEn || v.creadaEn <= corte) : versiones;
    const v = (previas.length ? previas : versiones).reduce((a, b) => (b.numero > a.numero ? b : a));
    adjudicada = { numero: v.numero, huella: v.huella, por: String(lv.awarded_by || ""), en: corte };
  }
  const rubros: Record<string, RubroEstado> = {};
  const condiciones: Participacion["condiciones"] = {};
  for (const c of confirmaciones) {
    if (c.rfx_lane_vendor_id !== lv.id) continue;
    const clave = conditionKeyFromRubric(c.rubric_key);
    const estado = RUBRO[c.answer] || "sin_respuesta";
    if (!clave) rubros[c.rubric_key] = estado;
    else condiciones[clave] = { estado, valor: c.value ?? null, comentario: c.comment || null, revision: num(c.condition_revision) };
  }
  const vendor = lv.vendors || {};
  return {
    id: lv.id,
    carrierId: lv.vendor_id,
    carrier: String(vendor.vendor_name || vendor.domain || "Carrier"),
    correo: vendor.primary_email || null,
    carrierBloqueado: String(vendor.status || "").toLowerCase() === "blocked",
    estado: ESTADO_PARTICIPACION[lv.invitation_status] || "invitada",
    rubros,
    condiciones,
    versiones,
    rol,
    motivo: lv.award_reason || null,
    adjudicada,
    entregadaEn: lv.rateware_closeout_at || null,
    vistaEn: lv.viewed_at || null,
    respondioEn: lv.responded_at || null
  };
}

// list_rfx_lane_conditions (R1): publicLaneCondition + rfx_lane_id.
export function condicion(c: Fila): CondicionRuta {
  return {
    clave: String(c.condition_key),
    grupo: String(c.group || ""),
    etiqueta: String(c.label_es || c.condition_key),
    tipo: c.kind,
    unidad: c.unit || null,
    comparador: c.comparator || null,
    opciones: c.choices || null,
    obligatoria: c.importance !== "preferred",
    objetivo: c.target ?? null,
    nota: c.note || null,
    revision: Number(c.revision || 1)
  };
}

function ruta(l: Fila, confirmaciones: Fila[], condiciones: Fila[] = []): Ruta {
  return {
    id: l.id,
    numero: Number(l.lane_number || 1),
    origen: lugar(l.origin_city, l.origin_state, l.origin),
    destino: lugar(l.destination_city, l.destination_state, l.destination),
    equipo: String(l.equipment || "—"),
    volumenSemanal: num(l.weekly_volume),
    objetivo: num(l.target_rate),
    moneda: String(l.currency || "USD"),
    desiertaMotivo: l.no_award_reason || (l.no_award_at ? "Ruta desierta" : null),
    condiciones: condiciones.filter((c) => c.rfx_lane_id === l.id).map(condicion),
    participaciones: (l.invitations || []).map((lv: Fila) => participacion(lv, confirmaciones))
  };
}

// generate_rfx_award_notices: metadata.notice_type «rfx_award_closeout», un
// mensaje por carrier (metadata.rfx_lane_vendor_ids) y award_summary con el
// conteo awarded/backup/not_awarded/no_award.
export function aviso(m: Fila): Aviso {
  const meta: Fila = m.metadata && typeof m.metadata === "object" ? m.metadata : {};
  const base = { destinatario: String(m.recipient_email || ""), asunto: String(m.subject || ""), cuerpo: String(m.text_body || "") };
  const esAdjudicacion = meta.notice_type === "rfx_award_closeout";
  const conteo: Fila = meta.award_summary || {};
  const resultado = !esAdjudicacion ? null : conteo.awarded ? "adjudicado" : conteo.backup ? "respaldo" : "no_adjudicado";
  const participaciones = Array.isArray(meta.rfx_lane_vendor_ids) && meta.rfx_lane_vendor_ids.length ? meta.rfx_lane_vendor_ids.map(String) : [String(m.rfx_lane_vendor_id)];
  return {
    id: m.id,
    tipo: esAdjudicacion ? "adjudicacion" : "invitacion",
    participacionId: String(m.rfx_lane_vendor_id),
    participaciones,
    resultado,
    canal: "gmail",
    ...base,
    huella: huellaAviso(base),
    version: String(m.updated_at || ""),
    estado: ESTADO_AVISO[String(m.status)] || "incierto",
    reciboProveedor: m.provider_message_id || null,
    motivo: m.delivery_error || m.last_error || null,
    enviadoEn: m.sent_at || null
  };
}

export function recibo(r: Fila): Recibo {
  return {
    operationId: String(r.receipt_operation_id),
    insertados: Number(r.inserted || 0),
    enlazados: Number(r.linked || 0),
    enRevision: Number(r.queued_for_review || 0),
    conservadosAprobados: Number(r.preserved_approved || 0),
    stagingIds: (r.existing_rate_staging_ids || []).map(String),
    estadoDestino: "pending_review",
    momento: String(r.committed_at || new Date().toISOString())
  };
}

export function detalle(
  crudo: Fila,
  mensajes: Fila[] = [],
  reciboCrudo: Fila | null = null,
  extra: { hoy?: string; rubros?: Fila[]; condiciones?: Fila[]; revisiones?: Fila[] | null } = {}
): Detalle {
  const hoy = extra.hoy ?? hoyMexico();
  const e = crudo.event || {};
  if (esProtegido(e.id)) throw new Error("Evento protegido");
  return {
    evento: {
      id: e.id,
      folio: String(e.rfx_id || e.id),
      nombre: String(e.name || ""),
      shipper: String(e.customer || "—"),
      estado: estadoEvento(e, hoy),
      plazo: e.due_date || null,
      prueba: esPrueba(e.name)
    },
    rutas: (crudo.lanes || []).map((l: Fila) => ruta(l, extra.rubros || [], extra.condiciones || [])).sort((a: Ruta, b: Ruta) => a.numero - b.numero),
    avisos: mensajes.map(aviso),
    recibo: reciboCrudo ? recibo(reciboCrudo) : null,
    revisiones: extra.revisiones ? revisionesVigentes(extra.revisiones) : null
  };
}

export function resumenes(crudo: Fila, hoy: string = hoyMexico()): ResumenEvento[] {
  // rateware-api devuelve `rows`; sin `lanes_preview`, solo `lane_count`.
  return (crudo.rows || crudo.events || [])
    .filter((e: Fila) => !esProtegido(e.id))
    .map((e: Fila) => ({
      id: e.id,
      folio: String(e.rfx_id || e.id),
      nombre: String(e.name || ""),
      shipper: String(e.customer || "—"),
      estado: estadoEvento(e, hoy),
      plazo: e.due_date || null,
      prueba: esPrueba(e.name),
      rutas: e.lanes_preview || [],
      ofertas: Number(e.bid_count || 0),
      participaciones: Number(e.invitation_count || 0)
    }));
}
