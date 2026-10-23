// Rateware simulado. Responde con la forma cruda de rateware-api y rfx-bid-api
// (b11991f8) para las acciones que usa la rebanada, con sus reglas: tenencia
// por owner_email (404), roles del servidor (403), liga cerrada (409), guardas
// de cierre y entrega atómica con recibo por operation_id.
//
// Lo que NO es Rateware real y está marcado: `bid_revisions` (Rateware no
// expone el historial de versiones por acción; ver contratos §4, I1) y las
// fallas inyectables de `fallas`.

import {
  checkConditionAnswer,
  conditionKeyFromRubric,
  normalizeLaneConditions,
  publicLaneCondition,
  RFX_CONDITION_CATALOG,
  RFX_CONDITION_CATALOG_VERSION,
  sameRequirement
} from "../dominio/condiciones-r1";
import { UUID_RATEWARE } from "../dominio/operacion";

export type Servicio = "rateware-api" | "rfx-bid-api";

export interface RespuestaSimulada {
  status: number;
  body: any;
  headers: Record<string, string>;
}

export interface UsuarioSimulado {
  clave: string;
  email: string;
  ownerEmail: string;
  roles: string[];
}

type Fila = Record<string, any>;

const ADMIN_ACTIONS = new Set([
  "award_rfx_lane_vendor",
  "clear_rfx_award",
  "set_rfx_lane_no_award",
  "closeout_awarded_rfx_to_rateware",
  "generate_rfx_award_notices",
  "send_outreach_messages"
]);
const WRITE_ACTIONS = new Set([
  ...ADMIN_ACTIONS,
  "create_rfx_event",
  "import_rfx_lanes",
  "shortlist_rfx_lane_vendors",
  "invite_rfx_lane_vendors",
  "update_rfx_event",
  "update_rfx_bid",
  "generate_outreach_drafts",
  "save_rfx_lane_conditions",
  "draft_bid_room_carrier_message"
]);

export class ErrorRed extends Error {
  constructor() {
    super("Sin respuesta de Rateware (simulado)");
  }
}

let contador = 0;
const nuevoId = (prefijo: string) => {
  contador += 1;
  const n = contador.toString(16).padStart(12, "0");
  return `${prefijo.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${n}`;
};

export class RatewareSimulado {
  usuarios = new Map<string, UsuarioSimulado>();
  vendors: Fila[] = [];
  // Historial que Rateware usa para «Carrier fit» (carrier_recommendations).
  fitCarrier = new Map<string, { score: number; evidence: string[]; gaps?: string[]; linked_rates?: number }>();
  // Tarifas aprobadas de rate_staging (list_rateware), para el historial del segmento.
  tarifas: Fila[] = [];
  events: Fila[] = [];
  lanes: Fila[] = [];
  laneVendors: Fila[] = [];
  revisiones = new Map<string, Readonly<Fila>[]>();
  confirmaciones = new Map<string, Record<string, string>>();
  // Parche R1: condiciones por ruta y respuestas del carrier con dato.
  condicionesRuta: Fila[] = [];
  respuestasCondicion = new Map<string, Record<string, { answer: string; comment: string | null; value: unknown; condition_revision: number }>>();
  staging: Fila[] = [];
  recibos: Fila[] = [];
  mensajes: Fila[] = [];
  bitacora: Fila[] = [];
  llamadas: { servicio: Servicio; action: string }[] = [];
  // Marca «Revisado» de Bidware (saas_audit_log rfx.invitation_carrier.reviewed).
  revisionesCarrier: Fila[] = [];
  // Resultado de send_outreach_messages por operation_id (repetirlo no reenvía).
  operacionesEnvio = new Map<string, Fila>();
  // cuotaGmail: cuántos mensajes más acepta Gmail hoy (null = sin límite).
  fallas = { perderRespuestaDe: new Set<string>(), sinResponder: new Set<string>(), cuotaGmail: null as number | null, fallarRevisiones: false };
  hoy: () => string = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  ahora: () => string = () => new Date().toISOString();

  agregarUsuario(u: UsuarioSimulado) {
    this.usuarios.set(u.clave, u);
    return u;
  }

  agregarVendor(ownerEmail: string, nombre: string, extra: Fila = {}) {
    const v = { id: nuevoId("ven"), owner_email: ownerEmail, vendor_name: nombre, primary_email: "sales@heymarksman.com", status: "active", ...extra };
    this.vendors.push(v);
    return v;
  }

  revisar(eventId: string, vendorId: string, revisado = true, por = "sales@heymarksman.com") {
    this.revisionesCarrier.push({ rfx_event_id: eventId, vendor_id: vendorId, reviewed: revisado, reviewed_at: this.ahora(), reviewed_by: por, channel: "email" });
  }

  tokenDe(laneVendorId: string) {
    return this.laneVendors.find((lv) => lv.id === laneVendorId)?.invitation_token as string;
  }

  // ——— Entrada única, igual que una Edge Function ———
  async llamar(servicio: Servicio, body: Fila, autorizacion: string | null): Promise<RespuestaSimulada> {
    const action = String(body?.action || "");
    this.llamadas.push({ servicio, action });
    if (this.fallas.sinResponder.has(action)) {
      this.fallas.sinResponder.delete(action);
      throw new ErrorRed();
    }
    try {
      const r = servicio === "rateware-api" ? this.ratewareApi(action, body, autorizacion) : this.rfxBidApi(action, body);
      if (this.fallas.perderRespuestaDe.has(action)) {
        this.fallas.perderRespuestaDe.delete(action);
        // El COMMIT ya ocurrió; la respuesta se pierde en el camino.
        throw new ErrorRed();
      }
      return r;
    } catch (e: any) {
      if (e instanceof ErrorRed) throw e;
      if (e instanceof Falla) return { status: e.status, body: { error: e.message, code: e.code }, headers: {} };
      throw e;
    }
  }

  private usuario(autorizacion: string | null): UsuarioSimulado {
    const clave = (autorizacion || "").replace(/^Bearer\s+sim:/i, "");
    const u = this.usuarios.get(clave);
    if (!u) throw new Falla(401, "Unauthorized", "UNAUTHORIZED");
    return u;
  }

  private evento(u: UsuarioSimulado, id: unknown): Fila {
    const e = this.events.find((x) => x.id === id && x.owner_email === u.ownerEmail);
    if (!e) throw new Falla(404, "RFx event not found", "NOT_FOUND");
    return e;
  }

  private laneVendor(u: UsuarioSimulado, id: unknown): Fila {
    const lv = this.laneVendors.find((x) => x.id === id);
    if (!lv) throw new Falla(404, "Carrier bid not found", "NOT_FOUND");
    this.evento(u, lv.rfx_event_id);
    return lv;
  }

  private bitacorar(u: string, accion: string, entidad: string, id: string, de: unknown, a: unknown, detalle: Fila = {}) {
    this.bitacora.push(Object.freeze({ actor: u, accion, entidad, entidad_id: id, de_estado: de ?? null, a_estado: a ?? null, momento: this.ahora(), ...detalle }));
  }

  private ratewareApi(action: string, body: Fila, autorizacion: string | null): RespuestaSimulada {
    const u = this.usuario(autorizacion);
    const roles = u.roles.length ? u.roles : ["viewer"];
    if (ADMIN_ACTIONS.has(action) && !roles.includes("admin")) throw new Falla(403, "Esta acción es del Administrador.", "TEAM_ROLE_REQUIRED");
    if (WRITE_ACTIONS.has(action) && roles.includes("viewer") && !roles.includes("admin") && !roles.includes("operator"))
      throw new Falla(403, "Tu rol es de consulta.", "TEAM_ROLE_REQUIRED");
    const ok = (b: unknown, headers: Record<string, string> = {}) => ({ status: 200, body: b, headers });

    switch (action) {
      case "list_rfx_events": {
        const events = this.events.filter((e) => e.owner_email === u.ownerEmail).map((e) => ({
          ...e,
          lane_count: this.lanes.filter((l) => l.rfx_event_id === e.id).length,
          invitation_count: this.laneVendors.filter((lv) => lv.rfx_event_id === e.id).length,
          bid_count: this.laneVendors.filter((lv) => lv.rfx_event_id === e.id && lv.bid_rate !== null).length,
          lanes_preview: this.lanes.filter((l) => l.rfx_event_id === e.id).map((l) => `${l.origin_city} → ${l.destination_city} · ${l.equipment}`)
        }));
        return ok({ rows: events });
      }
      case "list_rfx_detail": {
        const event = this.evento(u, body.event_id || body.id);
        const lanes = this.lanes.filter((l) => l.rfx_event_id === event.id).map((l) => ({
          ...l,
          invitations: this.laneVendors.filter((lv) => lv.rfx_lane_id === l.id).map((lv) => this.invitacionCruda(lv))
        }));
        return ok({ event: { ...event }, lanes });
      }
      case "list_rfx_segment_confirmations": {
        const event = this.evento(u, body.event_id);
        const rows = this.laneVendors
          .filter((lv) => lv.rfx_event_id === event.id)
          .flatMap((lv) =>
            [
              ...Object.entries(this.confirmaciones.get(lv.id) || {}).map(([rubric_key, answer]) => ({
                rfx_lane_vendor_id: lv.id,
                vendor_id: lv.vendor_id,
                segment_key: this.lanes.find((l) => l.id === lv.rfx_lane_id)?.rfx_segment_key || "general",
                rubric_key,
                answer,
                comment: null,
                value: null,
                condition_revision: null
              })),
              ...Object.entries(this.respuestasCondicion.get(lv.id) || {}).map(([rubric_key, r]) => ({
                rfx_lane_vendor_id: lv.id,
                vendor_id: lv.vendor_id,
                segment_key: "lane",
                rubric_key,
                ...r
              }))
            ]
          );
        return ok({ rows });
      }
      case "list_rfx_condition_catalog":
        return ok({ version: RFX_CONDITION_CATALOG_VERSION, conditions: RFX_CONDITION_CATALOG });
      case "list_rfx_lane_conditions": {
        const event = this.evento(u, body.event_id);
        const rows = this.condicionesRuta
          .filter((c) => c.rfx_event_id === event.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((c) => ({ rfx_lane_id: c.rfx_lane_id, updated_at: c.updated_at, ...publicLaneCondition(c) }));
        return ok({ version: RFX_CONDITION_CATALOG_VERSION, rows });
      }
      case "save_rfx_lane_conditions": {
        // Como R1: reemplaza el juego de la ruta; un cambio de importancia,
        // objetivo o nota sube la revisión y deja vieja la respuesta anterior.
        const event = this.evento(u, body.event_id);
        // biddingClosed de R1: status de cierre o plazo vencido.
        if (["closed", "awarded", "archived"].includes(event.status) || (event.due_date && event.due_date < this.hoy()))
          throw new Falla(409, "This bid event is closed. Route conditions cannot change.", "CONFLICT");
        const lane = this.lanes.find((l) => l.id === body.lane_id && l.rfx_event_id === event.id);
        if (!lane) throw new Falla(404, "RFx lane not found in this event.", "NOT_FOUND");
        let next: ReturnType<typeof normalizeLaneConditions>;
        try {
          next = normalizeLaneConditions(body.conditions);
        } catch (e) {
          throw new Falla(400, e instanceof Error ? e.message : "Invalid route conditions.", "BAD_REQUEST");
        }
        const actuales = new Map(this.condicionesRuta.filter((c) => c.rfx_lane_id === lane.id).map((c) => [c.condition_key, c]));
        const filas = next.map((row) => {
          const antes = actuales.get(row.condition_key);
          const revision = !antes ? 1 : sameRequirement(antes, row) ? antes.revision : antes.revision + 1;
          return { ...row, rfx_event_id: event.id, rfx_lane_id: lane.id, revision, updated_at: this.ahora() };
        });
        const quitadas = [...actuales.keys()].filter((k) => !next.some((r) => r.condition_key === k));
        this.condicionesRuta = [...this.condicionesRuta.filter((c) => c.rfx_lane_id !== lane.id), ...filas];
        this.bitacorar(u.email, "bid_room.lane.conditions", "rfx_lanes", lane.id, null, null, { keys: filas.map((f) => f.condition_key), removed: quitadas });
        return ok({ version: RFX_CONDITION_CATALOG_VERSION, rows: filas.map((f) => ({ rfx_lane_id: f.rfx_lane_id, ...publicLaneCondition(f) })), removed: quitadas });
      }
      case "list_rfx_invitation_wave_reviews": {
        const event = this.evento(u, body.rfx_event_id || body.event_id);
        if (this.fallas.fallarRevisiones) throw new Falla(500, "Review log unavailable", "REVIEWS_UNAVAILABLE");
        return ok({ rows: this.revisionesCarrier.filter((r) => r.rfx_event_id === event.id).map((r) => ({ ...r })) });
      }
      case "list_rateware": {
        // Como list_rateware con column_filters: arreglo = coincidencia exacta;
        // solo status approved y de la misma organización, con vendors(...).
        const filtros: Fila = body.column_filters && typeof body.column_filters === "object" ? body.column_filters : {};
        const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 1000);
        const offset = Math.max(Number(body.offset) || 0, 0);
        const todas = this.tarifas
          .filter((t) => t.owner_email === u.ownerEmail && t.status === "approved")
          .filter((t) => Object.entries(filtros).every(([k, v]) => (Array.isArray(v) ? v.map(String).includes(String(t[k])) : String(t[k] || "").toLowerCase().includes(String(v).toLowerCase()))));
        const rows = todas.slice(offset, offset + limit).map((t) => {
          const v = this.vendors.find((x) => x.id === t.vendor_id);
          const { owner_email: _o, ...resto } = t;
          return { ...resto, vendors: v ? { vendor_name: v.vendor_name, domain: v.domain || null, primary_email: v.primary_email, base_stage: v.base_stage || null, status: v.status } : null };
        });
        return ok({ rows, total: todas.length, limit, offset, has_more: offset + rows.length < todas.length });
      }
      case "carrier_recommendations": {
        // Como buildCarrierRecommendations en modo rfx_carrier_fit: vendors de
        // la organización ordenados por fit_score, con evidencia y huecos.
        const config: Fila = body.config && typeof body.config === "object" ? body.config : {};
        if (config.rfx_event_id) this.evento(u, config.rfx_event_id);
        const limit = Math.min(Math.max(Number(config.limit) || 30, 1), 100);
        const recommendations = this.vendors
          .filter((v) => v.owner_email === u.ownerEmail)
          .map((v) => {
            const f = this.fitCarrier.get(v.id) || { score: 10, evidence: [], gaps: ["Sin cotizaciones en rutas parecidas"], linked_rates: 0 };
            return {
              vendor_id: v.id,
              vendor_name: v.vendor_name,
              primary_email: v.primary_email,
              base_stage: v.base_stage || "procurement",
              status: v.status,
              duplicate_vendor_ids: [],
              fit_score: f.score,
              why: f.evidence.slice(0, 3).join("; "),
              evidence: f.evidence,
              gaps: f.gaps || [],
              metrics: { linked_rates: f.linked_rates || 0 }
            };
          })
          .sort((a, b) => b.fit_score - a.fit_score)
          .slice(0, limit)
          .map((r, i) => ({ ...r, rank: i + 1 }));
        return ok({ recommendations, warnings: [], evidence_mode: config.rfx_carrier_fit ? "bounded_rfx_fit" : "full_recommendation", model_status: "deterministic" });
      }
      case "list_outreach_messages": {
        const event = this.evento(u, body.rfx_event_id || body.event_id);
        return ok({ rows: this.mensajes.filter((m) => m.rfx_event_id === event.id).map((m) => structuredClone(m)) });
      }
      case "create_rfx_event": {
        const datos: Fila = body.event && typeof body.event === "object" ? body.event : body;
        const e = {
          id: nuevoId("evt"),
          owner_email: u.ownerEmail,
          rfx_id: datos.rfx_id || `RFX-${String(this.events.length + 1).padStart(4, "0")}-PRBA`,
          name: datos.name,
          customer: datos.customer,
          due_date: datos.due_date || null,
          status: "draft",
          created_at: this.ahora()
        };
        this.events.push(e);
        this.bitacorar(u.email, "rfx.event.create", "rfx_events", e.id, null, "draft");
        return ok({ row: { ...e } });
      }
      case "import_rfx_lanes": {
        const event = this.evento(u, body.event_id);
        if (["closed", "awarded", "archived"].includes(event.status)) throw new Falla(409, "This bid event is closed. New lanes cannot be added.", "RFX_CLOSED");
        const creadas = (body.rows || []).map((l: Fila, i: number) => {
          const lane = {
            id: nuevoId("lan"),
            rfx_event_id: event.id,
            lane_number: this.lanes.filter((x) => x.rfx_event_id === event.id).length + i + 1,
            currency: "USD",
            no_award_reason: null,
            ...l
          };
          return lane;
        });
        this.lanes.push(...creadas);
        for (const l of creadas) this.bitacorar(u.email, "rfx.lane.import", "rfx_lanes", l.id, null, "open");
        return ok({ inserted: creadas.length, rows: creadas.map((l: Fila) => ({ ...l })) });
      }
      case "shortlist_rfx_lane_vendors": {
        const lane = this.lanes.find((l) => l.id === body.lane_id);
        if (!lane) throw new Falla(404, "Lane not found", "NOT_FOUND");
        this.evento(u, lane.rfx_event_id);
        const filas = (body.vendor_ids || []).map((vid: string) => {
          const lv = {
            id: nuevoId("rlv"),
            rfx_event_id: lane.rfx_event_id,
            rfx_lane_id: lane.id,
            vendor_id: vid,
            invitation_status: "drafted",
            invitation_token: `tok_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
            award_role: null,
            award_reason: null,
            awarded_by: null,
            awarded_at: null,
            bid_rate: null,
            currency: "USD",
            weekly_capacity: null,
            transit_days: null,
            valid_through: null,
            commercial_model: null,
            marksman_margin_pct: null,
            carrier_share_pct: null,
            best_final: false,
            responded_at: null,
            viewed_at: null,
            response_source: null,
            notes: null,
            rateware_closeout_at: null
          };
          this.revisiones.set(lv.id, []);
          this.bitacorar(u.email, "rfx.vendor.shortlist", "rfx_lane_vendors", lv.id, null, "drafted");
          return lv;
        });
        this.laneVendors.push(...filas);
        return ok({ rows: filas.map((f: Fila) => this.invitacionCruda(f)) });
      }
      case "generate_outreach_drafts": {
        // Con reviewed_vendor_ids (Bidware) solo se preparan esos carriers; el
        // resto se reporta en skipped_rows con su motivo.
        const event = this.evento(u, body.event_id || body.rfx_event_id);
        const revisados = Array.isArray(body.reviewed_vendor_ids) ? new Set(body.reviewed_vendor_ids.map(String)) : null;
        if (revisados && !revisados.size) throw new Falla(409, "Reviewed audience required", "reviewed_audience_required");
        const pendientes = this.laneVendors
          .filter((lv) => lv.rfx_event_id === event.id && lv.invitation_status === "drafted")
          .filter((lv) => !this.mensajes.some((m) => m.rfx_lane_vendor_id === lv.id && m.metadata.notice_type === "rfx_invitation"));
        const omitidos = pendientes.filter((lv) => revisados && !revisados.has(lv.vendor_id));
        const nuevos = pendientes.filter((lv) => !omitidos.includes(lv)).map((lv) => this.invitacionMensaje(event, lv));
        return ok({
          generated: nuevos.length,
          skipped: omitidos.length,
          skipped_rows: omitidos.map((lv) => ({ rfx_lane_vendor_id: lv.id, vendor_id: lv.vendor_id, reason: "not_reviewed" })),
          rows: nuevos.map((m) => structuredClone(m))
        });
      }
      case "draft_bid_room_carrier_message": {
        // Como rateware-api: un borrador por clave (la misma clave devuelve el
        // existente), respuesta en el hilo de la invitación; nunca envía.
        if (body.confirmed !== true || body.confirmation_action !== "draft_bid_room_carrier_message") throw new Falla(400, "Confirmation required", "CONFIRMATION_REQUIRED");
        const texto = String(body.body || "").trim();
        if (!texto) throw new Falla(400, "Message body is required.", "BODY_REQUIRED");
        if (texto.length > 600) throw new Falla(400, "Keep a direct carrier question under 600 characters.", "BODY_TOO_LONG");
        const clave = String(body.idempotency_key || "");
        if (!clave) throw new Falla(400, "A message request key is required to prevent duplicate sends.", "KEY_REQUIRED");
        const event = this.evento(u, body.rfx_event_id || body.event_id);
        const previo = this.mensajes.find((m) => m.metadata.bid_room_request_key === clave);
        if (previo) return ok({ reused: true, draft_only: true, outreach_message: structuredClone(previo) });
        const lv = this.laneVendors.find((x) => x.id === body.rfx_lane_vendor_id && x.rfx_event_id === event.id);
        if (!lv) throw new Falla(404, "That carrier invitation does not belong to the selected RFx.", "NOT_FOUND");
        const vendor = this.vendors.find((v) => v.id === lv.vendor_id)!;
        const original = this.mensajes.find((m) => m.rfx_lane_vendor_id === lv.id && m.metadata.notice_type === "rfx_invitation");
        const m = this.filaMensaje(event, lv, vendor, original ? `Re: ${original.subject}` : `${event.rfx_id} | Question`, texto, {
          source: "bid_room_carrier_ask",
          bid_room_request_key: clave,
          rfx_lane_vendor_ids: [lv.id]
        });
        this.mensajes.push(m);
        this.bitacorar(u.email, "bid_room.carrier_question.draft", "outreach_messages", m.id, null, "drafted", { request_key: clave });
        return ok({ reused: false, draft_only: true, outreach_message: structuredClone(m) });
      }
      case "generate_rfx_award_notices": {
        // Como rateware-api: no exige el evento «awarded» (eso lo pone el
        // proxy de Fr8Bid), un mensaje por carrier con decisión o
        // participación, y nunca reinicia uno que ya no está en «drafted».
        const event = this.evento(u, body.event_id || body.rfx_event_id);
        const porVendor = new Map<string, Fila[]>();
        for (const lv of this.laneVendors.filter((x) => x.rfx_event_id === event.id)) {
          const participo = lv.bid_rate !== null && lv.bid_rate !== undefined;
          if (!lv.award_role && !participo && !["invited", "viewed", "responded", "quoted"].includes(lv.invitation_status)) continue;
          porVendor.set(lv.vendor_id, [...(porVendor.get(lv.vendor_id) || []), lv]);
        }
        const rows: Fila[] = [];
        for (const grupo of porVendor.values()) rows.push(this.avisoAdjudicacion(event, grupo));
        return ok({ generated: rows.length, rows: rows.map((m) => structuredClone(m)) });
      }
      case "send_outreach_messages": {
        // outreach-version-v1: cada id con su updated_at; solo drafted, queued
        // o failed; con confirmación explícita.
        if (body.confirmed !== true || body.confirmation_action !== "send_outreach_messages") throw new Falla(400, "Confirmation required", "CONFIRMATION_REQUIRED");
        const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length > 100) throw new Falla(400, "At most 100 messages per call.", "TOO_MANY_MESSAGES");
        const previa = body.operation_id ? this.operacionesEnvio.get(String(body.operation_id)) : null;
        if (previa) return ok(structuredClone(previa));
        const versiones = new Map((body.expected_versions || []).map((v: Fila) => [v.id, v.updated_at]));
        const mensajes = ids.map((id) => this.mensaje(u, id));
        for (const m of mensajes) {
          if (versiones.get(m.id) !== m.updated_at) throw new Falla(409, "The message changed since it was reviewed.", "OUTREACH_VERSION_CONFLICT");
          if (!["drafted", "queued", "failed"].includes(m.status)) throw new Falla(409, "The message is not sendable.", "OUTREACH_NOT_SENDABLE");
        }
        const enviados: Fila[] = [];
        const enCola: Fila[] = [];
        for (const m of mensajes) {
          const antes = m.status;
          if (this.fallas.cuotaGmail !== null && this.fallas.cuotaGmail <= 0) {
            // Gmail respondió dailyLimitExceeded: Rateware pausa y lo deja en cola.
            m.status = "queued";
            m.delivery_error = "dailyLimitExceeded";
            m.updated_at = this.marca();
            this.bitacorar(u.email, "outreach.queue", "outreach_messages", m.id, antes, "queued", { reason: "daily_cap" });
            enCola.push(m);
            continue;
          }
          if (this.fallas.cuotaGmail !== null) this.fallas.cuotaGmail -= 1;
          enviados.push(m);
          m.status = "sent";
          m.delivery_error = null;
          m.provider_message_id = `gm_${m.id.slice(-6)}`;
          m.sent_at = this.ahora();
          m.updated_at = this.marca();
          this.bitacorar(u.email, "outreach.send", "outreach_messages", m.id, antes, "sent", { provider_message_id: m.provider_message_id, version: versiones.get(m.id) });
          if (m.metadata.notice_type === "rfx_invitation") {
            const lv = this.laneVendors.find((x) => x.id === m.rfx_lane_vendor_id)!;
            lv.invitation_status = "invited";
            this.bitacorar(u.email, "rfx.vendor.invite", "rfx_lane_vendors", lv.id, "drafted", "invited");
          }
        }
        const resultado = {
          sent: enviados.length,
          failed: 0,
          skipped: enCola.length,
          delivery_unknown: 0,
          failures: [],
          skipped_rows: enCola.map((m) => ({ id: m.id, reason: "daily_cap" })),
          operation_id: body.operation_id ?? null,
          rows: mensajes.map((m) => structuredClone(m))
        };
        if (body.operation_id) this.operacionesEnvio.set(String(body.operation_id), structuredClone(resultado));
        return ok(resultado);
      }
      case "update_rfx_event": {
        // rateware-api: el cambio llega en body.patch. status «closed» NO es el
        // cierre a ofertas: exige todas las rutas decididas y ejecuta la entrega
        // a Rateware sin operation_id del cliente (y genera avisos). Fr8Bid no
        // lo usa nunca; el proxy lo bloquea. El cierre a ofertas es due_date.
        const event = this.evento(u, body.event_id || body.id);
        const patch: Fila = body.patch && typeof body.patch === "object" ? body.patch : {};
        if (patch.status !== undefined) {
          const destino = String(patch.status);
          if (destino === "closed") {
            if (!roles.includes("admin")) throw new Falla(403, "Cerrar es del Administrador.", "TEAM_ROLE_REQUIRED");
            return this.closeout(u, { event_id: event.id });
          }
          const permitidos: Record<string, string[]> = { draft: ["open"], open: ["draft"] };
          if (!(permitidos[event.status] || []).includes(destino)) throw new Falla(409, `Transición no permitida: ${event.status} → ${destino}`, "INVALID_TRANSITION");
          const antes = event.status;
          event.status = destino;
          this.bitacorar(u.email, "rfx.event.status", "rfx_events", event.id, antes, destino);
        }
        if (patch.due_date !== undefined) {
          const antes = event.due_date;
          event.due_date = patch.due_date || null;
          this.bitacorar(u.email, "rfx.event.due_date", "rfx_events", event.id, antes, event.due_date);
        }
        return ok({ row: { ...event } });
      }
      case "update_rfx_bid": {
        // Captura del equipo cuando la oferta llega por otro canal. rateware-api
        // pide `{ id, patch }` (id de rfx_lane_vendors); sin `patch` responde 200
        // y no guarda la tarifa (visto el 22/oct).
        if (!body.id) throw new Falla(400, "RFx invitation id is required.", "BAD_REQUEST");
        const lv = this.laneVendor(u, body.id);
        const e = this.events.find((x) => x.id === lv.rfx_event_id)!;
        if (e.status === "awarded") throw new Falla(409, "El evento ya se entregó.", "RFX_CLOSED");
        if (!body.patch) return ok({ row: this.invitacionCruda(lv) });
        if (body.patch.bid_rate === null || body.patch.bid_rate === undefined) {
          // Igual que rateware-api: sin tarifa queda el estado que se mande.
          const antes = lv.invitation_status;
          Object.assign(lv, { bid_rate: null, invitation_status: body.patch.invitation_status || "drafted", notes: body.patch.notes ?? null, responded_at: null });
          this.bitacorar(u.email, "rfx.vendor.status", "rfx_lane_vendors", lv.id, antes, lv.invitation_status);
          return ok({ row: this.invitacionCruda(lv) });
        }
        this.registrarOferta(lv, body.patch, "team_capture", u.email);
        return ok({ row: this.invitacionCruda(lv) });
      }
      case "invite_rfx_lane_vendors": {
        // «Mark as invited» del Bid Room: solo cambia el estado, no envía nada.
        // rateware-api pide `ids` y la confirmación explícita.
        if (body.confirmed !== true || body.confirmation_action !== "invite_rfx_lane_vendors")
          throw new Falla(400, "Confirmation is required.", "CONFIRMATION_REQUIRED");
        const filas = (Array.isArray(body.ids) ? body.ids : []).map((id: unknown) => this.laneVendor(u, id));
        let updated = 0;
        for (const lv of filas) {
          if (lv.invitation_status !== "drafted") continue;
          lv.invitation_status = "invited";
          updated += 1;
          this.bitacorar(u.email, "rfx.vendor.invite", "rfx_lane_vendors", lv.id, "drafted", "invited", { canal: "fuera_de_fr8bid" });
        }
        return ok({ updated, rows: filas.map((lv: Fila) => this.invitacionCruda(lv)) });
      }
      case "award_rfx_lane_vendor": {
        const lv = this.laneVendor(u, body.rfx_lane_vendor_id || body.id);
        const lane = this.lanes.find((l) => l.id === lv.rfx_lane_id)!;
        const op = String(body.operation_id || "");
        const previa = this.bitacora.find((b) => b.accion === "rfx.award" && b.operation_id === op && op);
        if (previa) return ok({ row: this.invitacionCruda(lv), replayed: true });
        if (lv.bid_rate === null) throw new Falla(422, "La participación no tiene oferta.", "RFX_AWARD_REQUIRES_BID");
        if (lane.no_award_reason) throw new Falla(409, "La ruta está desierta.", "RFX_LANE_NO_AWARD");
        const role = body.award_role === "backup" ? "backup" : "primary";
        const otros = this.laneVendors.filter((x) => x.rfx_lane_id === lane.id && x.id !== lv.id);
        if (role === "primary" && otros.some((x) => x.award_role === "primary")) throw new Falla(409, "La ruta ya tiene primario.", "RFX_AWARD_CONFLICT");
        if (role === "backup" && !otros.some((x) => x.award_role === "primary")) throw new Falla(409, "El respaldo requiere primario.", "RFX_AWARD_CONFLICT");
        const antes = lv.award_role;
        lv.award_role = role;
        lv.award_reason = body.award_reason || null;
        lv.awarded_by = u.email;
        lv.awarded_at = this.ahora();
        this.bitacorar(u.email, "rfx.award", "rfx_lane_vendors", lv.id, antes, role, { operation_id: op || null, bid_rate: lv.bid_rate });
        return ok({ row: this.invitacionCruda(lv) });
      }
      case "clear_rfx_award": {
        const lv = this.laneVendor(u, body.rfx_lane_vendor_id || body.id);
        if (lv.rateware_closeout_at) throw new Falla(409, "Una adjudicación entregada no se quita.", "RFX_CLOSED_OUT");
        const antes = lv.award_role;
        lv.award_role = null;
        lv.award_reason = null;
        lv.awarded_by = null;
        lv.awarded_at = null;
        this.bitacorar(u.email, "rfx.award.clear", "rfx_lane_vendors", lv.id, antes, null);
        return ok({ row: this.invitacionCruda(lv), before: { award_role: antes } });
      }
      case "closeout_awarded_rfx_to_rateware":
        return this.closeout(u, body);
      default:
        throw new Falla(400, `Acción no simulada: ${action}`, "UNSUPPORTED_ACTION");
    }
  }

  // closeoutAwardedRfxToRateware + rfx_handoff_lookup/_snapshot/_commit.
  private closeout(u: UsuarioSimulado, body: Fila): RespuestaSimulada {
    const event = this.evento(u, body.event_id || body.rfx_event_id || body.id);
    const supplied = String(body.operation_id || "");
    const op = UUID_RATEWARE.test(supplied) ? supplied.toLowerCase() : `random-${Math.random()}`;
    const request = JSON.stringify({ event_id: event.id, target_status: "pending_review" });
    const previo = this.recibos.find((r) => r.owner_email === u.ownerEmail && r.rfx_event_id === event.id && r.operation_id === op);
    if (previo) {
      if (previo.request !== request) throw new Falla(409, "La entrega cambió durante la preparación. Actualiza y revisa antes de intentar otra vez.", "RFX_HANDOFF_CONFLICT");
      return { status: 200, body: { ...previo.result }, headers: { "X-Operation-Id": op } };
    }
    const conflicto = () => new Falla(409, "La entrega cambió durante la preparación. Actualiza y revisa antes de intentar otra vez.", "RFX_HANDOFF_CONFLICT");
    if (this.recibos.some((r) => r.rfx_event_id === event.id)) throw conflicto();
    const lanes = this.lanes.filter((l) => l.rfx_event_id === event.id);
    const filas = this.laneVendors.filter((lv) => lv.rfx_event_id === event.id);
    const hoy = this.hoy();
    // requireCompleteRfxAwardDecisions / requireEligibleRfxCloseout / requireHandoffParity
    for (const lane of lanes) {
      if (lane.no_award_reason) continue;
      const prim = filas.find((lv) => lv.rfx_lane_id === lane.id && lv.award_role === "primary" && lv.bid_rate !== null);
      if (!prim) throw new Falla(409, `La ruta ${lane.lane_number} no tiene primario.`, "RFX_AWARD_INCOMPLETE");
    }
    const adjudicadas = filas.filter((lv) => lv.award_role);
    for (const lv of adjudicadas) {
      const vendor = this.vendors.find((v) => v.id === lv.vendor_id)!;
      if ((lv.valid_through && lv.valid_through < hoy) || String(vendor.status).toLowerCase() === "blocked") throw conflicto();
      if (Object.values(this.confirmaciones.get(lv.id) || {}).includes("disagree")) throw new Falla(409, "Un rubro con negativa expresa bloquea el cierre.", "RFX_SEGMENT_BLOCKED");
      const snap = this.staging.find((s) => s.rfx_lane_vendor_id === lv.id && s.kind === "bid_snapshot");
      if (snap && Number(snap.all_in_rate) !== Number(lv.bid_rate)) throw conflicto();
    }
    // COMMIT único: staging + enlaces + evento + recibo.
    const momento = this.ahora();
    const ids: string[] = [];
    for (const lv of adjudicadas) {
      const s = {
        id: nuevoId("stg"),
        kind: "rfx_award",
        owner_email: u.ownerEmail,
        rfx_event_id: event.id,
        rfx_lane_vendor_id: lv.id,
        all_in_rate: lv.bid_rate,
        carrier_cost_rate: lv.bid_rate,
        currency: lv.currency,
        status: "pending_review",
        rfx_bid_outcome: lv.award_role === "primary" ? "awarded" : "backup"
      };
      this.staging.push(s);
      ids.push(s.id);
      lv.rateware_closeout_at = momento;
      this.bitacorar(u.email, "rate_staging.insert", "rate_staging", s.id, null, "pending_review", { operation_id: op });
    }
    const antes = event.status;
    event.status = "awarded";
    this.bitacorar(u.email, "rfx.award.closeout", "rfx_events", event.id, antes, "awarded", { operation_id: op });
    const result = {
      inserted: ids.length,
      linked: 0,
      skipped: 0,
      queued_for_review: ids.length,
      preserved_approved: 0,
      already_staged: 0,
      existing_rate_staging_ids: ids,
      raw_upload_id: nuevoId("raw"),
      job_id: nuevoId("job"),
      target_status: "pending_review",
      decisions: adjudicadas.map((lv) => ({ rfx_lane_vendor_id: lv.id, award_role: lv.award_role })),
      outcomes: adjudicadas.map((lv) => ({ rfx_lane_vendor_id: lv.id, outcome: lv.award_role === "primary" ? "awarded" : "backup" })),
      receipt_operation_id: op,
      committed_at: momento
    };
    this.recibos.push({ owner_email: u.ownerEmail, rfx_event_id: event.id, operation_id: op, request, result });
    return { status: 200, body: { ...result }, headers: { "X-Operation-Id": op } };
  }

  private rfxBidApi(action: string, body: Fila): RespuestaSimulada {
    const lv = this.laneVendors.find((x) => x.invitation_token && x.invitation_token === body.token);
    if (!lv || lv.invitation_status === "archived") throw new Falla(404, "Invitation link is invalid or has expired.", "NOT_FOUND");
    const event = this.events.find((e) => e.id === lv.rfx_event_id)!;
    const lane = this.lanes.find((l) => l.id === lv.rfx_lane_id)!;
    const bloqueo = () => {
      if (["closed", "awarded", "archived"].includes(event.status)) return "Esta puja ya cerro. Escribe al equipo de compras si necesitas actualizar tu oferta.";
      if (event.due_date && event.due_date < this.hoy()) return "La fecha limite de esta puja ya paso.";
      if (lv.award_role) return "Tu oferta ya fue adjudicada.";
      return null;
    };
    switch (action) {
      case "get_invitation": {
        // Como rfx-bid-api: la primera apertura deja viewed_at.
        if (!lv.viewed_at) lv.viewed_at = this.ahora();
        if (lv.invitation_status === "invited") {
          lv.invitation_status = "viewed";
          this.bitacorar(`token:${lv.id}`, "rfx.vendor.view", "rfx_lane_vendors", lv.id, "invited", "viewed");
        }
        const { invitation_token, ...propia } = this.invitacionCruda(lv);
        return {
          status: 200,
          body: {
            invitation: propia,
            event: { rfx_id: event.rfx_id, name: event.name, customer: event.customer, status: event.status, due_date: event.due_date },
            lane: { ...lane },
            segment_confirmations: [
              ...Object.entries(this.confirmaciones.get(lv.id) || {}).map(([rubric_key, answer]) => ({ segment_key: lane.rfx_segment_key || "general", rubric_key, answer })),
              ...Object.entries(this.respuestasCondicion.get(lv.id) || {}).map(([rubric_key, r]) => ({ segment_key: "lane", rubric_key, ...r }))
            ],
            lane_conditions: this.condicionesRuta
              .filter((c) => c.rfx_lane_id === lane.id)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((c) => publicLaneCondition(c)),
            bid_window_closed: Boolean(bloqueo())
          },
          headers: {}
        };
      }
      case "submit_bid": {
        const b = bloqueo();
        if (b) throw new Falla(409, b, "BID_WINDOW_CLOSED");
        this.registrarOferta(lv, body, "carrier_portal", `token:${lv.id}`);
        return { status: 200, body: { invitation: this.invitacionCruda(lv) }, headers: {} };
      }
      case "save_segment_confirmations": {
        const b = bloqueo();
        if (b) throw new Falla(409, b, "BID_WINDOW_CLOSED");
        const actual = { ...(this.confirmaciones.get(lv.id) || {}) };
        const RUBRICAS = ["logistics_model", "operation_criteria", "business_rules", "service_specifications", "carrier_requirements", "other_notes"];
        const RESPUESTAS = ["pending", "agree", "exception", "disagree", "not_applicable"];
        const condiciones = { ...(this.respuestasCondicion.get(lv.id) || {}) };
        for (const c of body.confirmations || []) {
          if (!c.segment_key) throw new Falla(400, "Segment key is required.", "BAD_REQUEST");
          const clave = conditionKeyFromRubric(c.rubric_key);
          if (!clave && !RUBRICAS.includes(c.rubric_key)) throw new Falla(400, "Invalid segment rubric.", "BAD_REQUEST");
          if (!RESPUESTAS.includes(c.answer || "pending")) throw new Falla(400, "Invalid segment confirmation answer.", "BAD_REQUEST");
          if (!clave) {
            actual[c.rubric_key] = c.answer || "pending";
            continue;
          }
          const cond = this.condicionesRuta.find((x) => x.rfx_lane_id === lane.id && x.condition_key === clave);
          if (!cond) throw new Falla(400, "Invalid segment rubric.", "BAD_REQUEST");
          let value: unknown;
          try {
            value = checkConditionAnswer(cond as { condition_key: string; target?: any }, c.answer || "pending", c.value, c.comment);
          } catch (e) {
            throw new Falla(400, e instanceof Error ? e.message : "Invalid answer.", "BAD_REQUEST");
          }
          condiciones[c.rubric_key] = { answer: c.answer || "pending", comment: c.comment ? String(c.comment).trim() : null, value, condition_revision: cond.revision };
        }
        this.confirmaciones.set(lv.id, actual);
        this.respuestasCondicion.set(lv.id, condiciones);
        this.bitacorar(`token:${lv.id}`, "rfx.segments.save", "rfx_lane_vendors", lv.id, null, null, { segments: actual });
        return { status: 200, body: { confirmations: actual }, headers: {} };
      }
      case "decline_invitation": {
        const b = bloqueo();
        if (b) throw new Falla(409, b, "BID_WINDOW_CLOSED");
        const antes = lv.invitation_status;
        lv.invitation_status = "declined";
        this.bitacorar(`token:${lv.id}`, "rfx.vendor.decline", "rfx_lane_vendors", lv.id, antes, "declined");
        return { status: 200, body: { invitation: this.invitacionCruda(lv) }, headers: {} };
      }
      default:
        throw new Falla(400, `Acción no simulada: ${action}`, "UNSUPPORTED_ACTION");
    }
  }

  private registrarOferta(lv: Fila, body: Fila, fuente: string, actor: string) {
    const ahora = this.ahora();
    const antes = lv.invitation_status;
    Object.assign(lv, {
      invitation_status: "quoted",
      bid_rate: Number(body.bid_rate),
      currency: body.currency || lv.currency || "USD",
      weekly_capacity: body.weekly_capacity ?? null,
      transit_days: body.transit_days ?? null,
      valid_through: body.valid_through ?? null,
      commercial_model: body.commercial_model || lv.commercial_model || "cost_plus",
      marksman_margin_pct: body.marksman_margin_pct ?? null,
      carrier_share_pct: body.carrier_share_pct ?? null,
      best_final: body.best_final === true,
      notes: body.notes ?? null,
      response_source: fuente,
      responded_at: ahora
    });
    const historial = this.revisiones.get(lv.id) || [];
    const revision = Object.freeze({
      revision: historial.length + 1,
      bid_rate: lv.bid_rate,
      currency: lv.currency,
      weekly_capacity: lv.weekly_capacity,
      transit_days: lv.transit_days,
      valid_through: lv.valid_through,
      commercial_model: lv.commercial_model,
      marksman_margin_pct: lv.marksman_margin_pct,
      carrier_share_pct: lv.carrier_share_pct,
      best_final: lv.best_final,
      notes: lv.notes,
      response_source: fuente,
      actor,
      created_at: ahora
    });
    this.revisiones.set(lv.id, Object.freeze([...historial, revision]) as Readonly<Fila>[]);
    // Snapshot en rate_staging, como ensureBidRateStagingRow.
    const snap = this.staging.find((s) => s.rfx_lane_vendor_id === lv.id && s.kind === "bid_snapshot");
    if (snap) snap.all_in_rate = lv.bid_rate;
    else this.staging.push({ id: nuevoId("stg"), kind: "bid_snapshot", rfx_lane_vendor_id: lv.id, all_in_rate: lv.bid_rate, status: "draft" });
    this.bitacorar(actor, "rfx.bid.submit", "rfx_lane_vendors", lv.id, antes, "quoted", { revision: revision.revision, bid_rate: lv.bid_rate });
  }

  private invitacionCruda(lv: Fila): Fila {
    const vendor = this.vendors.find((v) => v.id === lv.vendor_id);
    return {
      ...lv,
      vendors: vendor ? { id: vendor.id, vendor_name: vendor.vendor_name, primary_email: vendor.primary_email, status: vendor.status } : null,
      // Solo simulado: Rateware real no devuelve el historial de versiones.
      bid_revisions: (this.revisiones.get(lv.id) || []).map((r) => ({ ...r }))
    };
  }

  // Edición hecha en la Cola de Rateware (solo para pruebas): cambia updated_at.
  editarMensaje(id: string, cambios: { subject?: string; text_body?: string }) {
    const m = this.mensajes.find((x) => x.id === id)!;
    Object.assign(m, cambios, { updated_at: this.marca() });
  }

  private ultimaMarca = "";
  private marca(): string {
    let t = this.ahora();
    if (t <= this.ultimaMarca) t = new Date(Date.parse(this.ultimaMarca) + 1).toISOString();
    this.ultimaMarca = t;
    return t;
  }

  private filaMensaje(event: Fila, lv: Fila, vendor: Fila, subject: string, text: string, metadata: Fila): Fila {
    return {
      id: nuevoId("msg"),
      owner_email: event.owner_email,
      rfx_event_id: event.id,
      rfx_lane_id: lv.rfx_lane_id,
      rfx_lane_vendor_id: lv.id,
      vendor_id: lv.vendor_id,
      channel: "email",
      recipient_email: vendor.primary_email,
      subject,
      text_body: text,
      html_body: `<p>${text}</p>`,
      status: "drafted",
      metadata,
      provider_message_id: null,
      sent_at: null,
      updated_at: this.marca()
    };
  }

  private invitacionMensaje(event: Fila, lv: Fila): Fila {
    const vendor = this.vendors.find((v) => v.id === lv.vendor_id)!;
    const lane = this.lanes.find((l) => l.id === lv.rfx_lane_id)!;
    const prueba = /PRUEBA CONTROLADA/i.test(event.name) ? "[PRUEBA CONTROLADA] " : "";
    const ruta = `${lane.origin_city} → ${lane.destination_city}`;
    const m = this.filaMensaje(
      event,
      lv,
      vendor,
      `${prueba}Invitación ${event.rfx_id} · ${ruta}`,
      `${vendor.vendor_name}: le invitamos a cotizar la ruta ${ruta}, ${lane.equipment}. Plazo ${event.due_date ?? "por definir"}.${prueba ? " Prueba controlada, sin valor comercial." : ""} Liga: https://rateware.vercel.app/rfx-bid.html?token=${lv.invitation_token}`,
      { notice_type: "rfx_invitation", rfx_lane_vendor_ids: [lv.id] }
    );
    this.mensajes.push(m);
    this.bitacorar("sistema", "outreach.draft", "outreach_messages", m.id, null, "drafted", { notice_type: "rfx_invitation" });
    return m;
  }

  private avisoAdjudicacion(event: Fila, grupo: Fila[]): Fila {
    const first = grupo[0];
    const vendor = this.vendors.find((v) => v.id === first.vendor_id)!;
    const conteo: Record<string, number> = {};
    const lineas = grupo.map((lv) => {
      const lane = this.lanes.find((l) => l.id === lv.rfx_lane_id)!;
      const clave = lv.award_role === "primary" ? "awarded" : lv.award_role === "backup" ? "backup" : lane.no_award_at ? "no_award" : "not_awarded";
      conteo[clave] = (conteo[clave] || 0) + 1;
      const etiqueta = { awarded: "Adjudicada", backup: "Respaldo", no_award: "Sin adjudicar", not_awarded: "No adjudicada" }[clave];
      return `${lane.origin_city} → ${lane.destination_city} · ${lane.equipment}: ${etiqueta}${clave === "awarded" ? ` a ${lv.bid_rate} ${lv.currency}` : ""}`;
    });
    const prefijo = conteo.awarded ? "Adjudicación" : conteo.backup ? "Capacidad de respaldo" : "Cierre de RFx";
    const subject = `${prefijo}: ${event.rfx_id}`;
    const text = [`Estimados ${vendor.vendor_name},`, `RFx: ${event.rfx_id}`, "", ...lineas, "", `Bid Room: https://rateware.vercel.app/rfx-bid.html?token=${first.invitation_token}`, "Gracias por participar."].join("\n");
    const metadata = { notice_type: "rfx_award_closeout", award_summary: conteo, rfx_lane_vendor_ids: grupo.map((lv) => lv.id), channel: "email" };
    const existente = this.mensajes.find((m) => m.rfx_event_id === event.id && m.vendor_id === first.vendor_id && m.metadata.notice_type === "rfx_award_closeout");
    if (existente && existente.status !== "drafted") return existente;
    if (existente) {
      Object.assign(existente, { subject, text_body: text, html_body: `<p>${text}</p>`, metadata, updated_at: this.marca() });
      return existente;
    }
    const m = this.filaMensaje(event, first, vendor, subject, text, metadata);
    this.mensajes.push(m);
    this.bitacorar("sistema", "outreach.draft", "outreach_messages", m.id, null, "drafted", { notice_type: "rfx_award_closeout" });
    return m;
  }

  private mensaje(u: UsuarioSimulado, id: unknown): Fila {
    const m = this.mensajes.find((x) => x.id === id && x.owner_email === u.ownerEmail);
    if (!m) throw new Falla(404, "Message not found", "NOT_FOUND");
    return m;
  }
}

class Falla extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}
