// Traduce la forma cruda de rateware-api al modelo de la Mesa. Los nombres de
// columna salen de rfx_lanes / rfx_lane_vendors (migraciones de Rateware) y de
// submit_bid en rfx-bid-api b11991f8. Campos marcados «sin verificar» se leyeron
// del código, no de una respuesta real.

import { huellaAviso, huellaOferta } from "../dominio/huella.js";
import { esProtegido } from "../dominio/protegidos.js";
import { hoyMexico } from "../dominio/recorrido.js";
import type {
  Aviso,
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

const ESTADO_AVISO: Record<string, EstadoAviso> = {
  draft: "borrador",
  approved: "aprobado",
  sent: "aceptado",
  bounced: "rebotado",
  failed: "fallido",
  uncertain: "incierto"
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
  for (const c of confirmaciones) if (c.rfx_lane_vendor_id === lv.id) rubros[c.rubric_key] = RUBRO[c.answer] || "sin_respuesta";
  const vendor = lv.vendors || {};
  return {
    id: lv.id,
    carrierId: lv.vendor_id,
    carrier: String(vendor.vendor_name || vendor.domain || "Carrier"),
    correo: vendor.primary_email || null,
    carrierBloqueado: String(vendor.status || "").toLowerCase() === "blocked",
    estado: ESTADO_PARTICIPACION[lv.invitation_status] || "invitada",
    rubros,
    versiones,
    rol,
    motivo: lv.award_reason || null,
    adjudicada,
    entregadaEn: lv.rateware_closeout_at || null
  };
}

function ruta(l: Fila, confirmaciones: Fila[]): Ruta {
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
    participaciones: (l.invitations || []).map((lv: Fila) => participacion(lv, confirmaciones))
  };
}

export function aviso(m: Fila): Aviso {
  const base = { destinatario: String(m.to_email || ""), asunto: String(m.subject || ""), cuerpo: String(m.body || "") };
  const huella = huellaAviso(base);
  const aprobadaVigente = m.approved_version !== null && m.approved_version === m.content_version;
  return {
    id: m.id,
    tipo: m.kind === "rfx_award" ? "adjudicacion" : "invitacion",
    participacionId: m.rfx_lane_vendor_id,
    canal: "gmail",
    ...base,
    huella,
    version: Number(m.content_version || 1),
    estado: ESTADO_AVISO[m.status] || "borrador",
    aprobadoPor: m.approved_by || null,
    aprobadoHuella: aprobadaVigente ? huella : null,
    reciboProveedor: m.gmail_message_id || null
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
  extra: { hoy?: string; rubros?: Fila[] } = {}
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
    rutas: (crudo.lanes || []).map((l: Fila) => ruta(l, extra.rubros || [])).sort((a: Ruta, b: Ruta) => a.numero - b.numero),
    avisos: mensajes.map(aviso),
    recibo: reciboCrudo ? recibo(reciboCrudo) : null
  };
}

export function resumenes(crudo: Fila, hoy: string = hoyMexico()): ResumenEvento[] {
  return (crudo.events || [])
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
