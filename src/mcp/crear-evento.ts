import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Transporte } from "../cliente/api.js";
import { firmar, verificar, huella, huellaCuerpos } from "./confirmacion.js";
import { APROBADORES_POR_OMISION, esAfirmacion, Rechazo, type ContextoEscrituras } from "./escrituras.js";

const texto = z.string().trim().min(1).max(2000);
const opcional = texto.nullable().optional();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}).nullable().optional();
export const esquemaEvento = z.object({
  name: texto.max(200), description: opcional, customer: opcional, customer_id: z.string().uuid().nullable().optional(),
  event_type: z.enum(["spot", "bid", "rfx"]), bid_visibility_mode: z.enum(["private", "anonymous_rank", "open_leaderboard"]),
  operation_start_date: fecha, due_date: fecha, notes: opcional,
  lanes: z.array(z.object({
    origin: texto, destination: texto,
    origin_city: opcional, origin_state: opcional, origin_country: opcional,
    destination_city: opcional, destination_state: opcional, destination_country: opcional,
    equipment: opcional, trailer: opcional.describe("Tipo de caja del catálogo trailer, por ejemplo Dry Van. Independiente de equipment."),
    operation: opcional, service: opcional,
    currency: opcional, target_rate: z.number().nonnegative().max(1_000_000).nullable().optional(),
    logistics_model: opcional, operation_criteria: opcional, business_rules: opcional,
    service_specifications: opcional, carrier_requirements: opcional, other_notes: opcional, notes: opcional
  }).strict()).min(1).max(50)
}).strict();
export const esquemaConfirmarEvento = z.object({ confirmacion_id: z.string().min(20).max(60000), frase_ok: z.string().min(1).max(300) }).strict();
export const herramientasCrearEvento = {
  preparar_evento: { rol: "operator" as const, schema: esquemaEvento,
    descripcion: "Prepara un RFx draft y sus rutas, valida catálogos en Rateware y muestra faltantes. Usa trailer para el tipo de caja (por ejemplo Dry Van) y equipment para el equipo. No persiste ni invita. Muestra la vista previa completa y pide aprobación humana en otro mensaje antes de confirmar_creacion_evento." },
  confirmar_creacion_evento: { rol: "operator" as const, schema: esquemaConfirmarEvento,
    descripcion: "Crea únicamente el borrador y sus rutas de la vista previa, con frase_ok literal del propietario. Confirmación de 15 minutos, ligada a sesión y organización. No invita, envía ni adjudica; no reintenta resultados inciertos." }
};

const erroresVista = new Map([
  ["invalid_fields", "Rateware recibió campos que no admite en el borrador."],
  ["invalid_event", "Revisa el nombre, el tipo o la visibilidad del evento."],
  ["invalid_date", "Revisa que las fechas existan y usen el formato AAAA-MM-DD."],
  ["invalid_customer", "El identificador del cliente es inválido."],
  ["invalid_lanes", "El borrador debe incluir entre 1 y 50 rutas."],
  ["invalid_number", "Una ruta tiene un valor numérico fuera del rango permitido."],
  ["invalid_text", "Un campo de texto está vacío o supera la longitud permitida."],
  ["missing_route", "Indica origen y destino para cada ruta."],
  ["unknown_catalog_equipment", "El valor de equipment no existe en su catálogo. Para el tipo de caja, usa trailer."],
  ["unknown_catalog_trailer", "El valor de trailer no existe en el catálogo de tipos de caja."],
  ["unknown_catalog_operation", "El valor de operation no existe en su catálogo."],
  ["unknown_catalog_service", "El valor de service no existe en su catálogo."],
  ["invalid_currency", "Indica la moneda con un código de tres letras, como USD."],
  ["role_or_organization_forbidden", "La sesión de Rateware no tiene el rol o la organización requeridos."],
  ["customer_not_in_workspace", "El cliente no pertenece al espacio de trabajo de Rateware."],
  ["SIN_SESION", "Inicia sesión antes de preparar el borrador."],
]);

export function crearEventos(t: Transporte, ctx: ContextoEscrituras) {
  const ahora = ctx.ahora ?? (() => new Date());
  async function vista(payload: unknown) {
    const r = await t("rateware-api", { action: "preview_rfx_event_creation", payload });
    const code = r.body?.code;
    if ([400, 401, 403].includes(r.status) && typeof code === "string") {
      const mensaje = erroresVista.get(code);
      if (mensaje) throw new Rechazo(code, mensaje, r.status);
    }
    if (r.status !== 200 || !r.body || typeof r.body.actor_id !== "string" || typeof r.body.organization_id !== "string" ||
      typeof r.body.can_create !== "boolean" || !Array.isArray(r.body.missing) || !Array.isArray(r.body.warnings) || !r.body.payload) {
      throw new Rechazo("PREPARACION_NO_DISPONIBLE", "Rateware no devolvió una vista previa válida.", 503);
    }
    if (r.body.actor_id !== ctx.userId) throw new Rechazo("IDENTIDAD_CAMBIO", "La identidad de Rateware no coincide con la sesión.", 403);
    return r.body;
  }
  const ejecutar = async (nombre: string, args: Record<string, unknown>): Promise<Record<string, any>> => {
    if (ctx.rol !== "operator" && ctx.rol !== "admin") throw new Rechazo("SIN_PERMISO", "La creación requiere rol Operador o Administrador.", 403);
    if (!ctx.secreto) throw new Rechazo("CONFIRMACIONES_PENDIENTES", "Falta configurar la confirmación; no se creó nada.", 503);
    if (nombre === "preparar_evento") {
      const input = esquemaEvento.parse(args);
      const v = await vista(input);
      const resultado = { estado: v.can_create ? "preparada" : "incompleta", escrito: false, vista_previa: v,
        impacto: "Un evento draft y sus rutas; cero invitaciones, envíos y adjudicaciones." };
      if (!v.can_create) return { ...resultado, confirmacion_id: null };
      const cuerpos = [{ action: "create_rfx_event_draft", operation_id: randomUUID(), payload: input }];
      const f = await firmar({ sub: ctx.userId, client_id: ctx.clientId, act: "crear_evento", ev: "nuevo",
        arg: input, cuerpos, pre: huella(v) }, ctx.secreto, ahora());
      if (f.token.length > 60000) throw new Rechazo("VISTA_DEMASIADO_GRANDE", "Reduce las rutas o notas para mostrar y confirmar todo el contenido.");
      return { ...resultado, confirmacion_id: f.token, vence_en: f.vence };
    }
    if (nombre !== "confirmar_creacion_evento") throw new Rechazo("ACCION_NO_PERMITIDA", "Herramienta no permitida.");
    const a = esquemaConfirmarEvento.parse(args);
    if (!esAfirmacion(a.frase_ok)) throw new Rechazo("SIN_APROBACION", "Falta un sí explícito posterior a la vista previa.", 403);
    const aprobadores = ctx.aprobadores ?? APROBADORES_POR_OMISION;
    if (!ctx.email || !aprobadores.includes(ctx.email.toLowerCase())) throw new Rechazo("SOLO_PROPIETARIO", "Solo el propietario puede confirmar la creación.", 403);
    let c;
    try { c = await verificar(a.confirmacion_id, ctx.secreto, ahora()); }
    catch { throw new Rechazo("CONFIRMACION_INVALIDA", "La vista previa venció o fue alterada. No se creó nada.", 403); }
    if (c.act !== "crear_evento" || c.sub !== ctx.userId || c.client_id !== ctx.clientId || c.h !== huellaCuerpos(c.cuerpos, c.fijo) || c.cuerpos.length !== 1) {
      throw new Rechazo("CONFIRMACION_INVALIDA", "La confirmación no pertenece a esta acción o sesión.", 403);
    }
    const input = esquemaEvento.parse(c.arg);
    const cuerpo = c.cuerpos[0];
    if (cuerpo.action !== "create_rfx_event_draft" || huella(cuerpo.payload) !== huella(input) || !z.string().uuid().safeParse(cuerpo.operation_id).success) {
      throw new Rechazo("CONFIRMACION_INVALIDA", "El contenido aprobado no coincide.", 403);
    }
    const v = await vista(input);
    if (!v.can_create || huella(v) !== c.pre) throw new Rechazo("VISTA_CAMBIO", "Cambiaron identidad, organización, catálogos o contenido. Prepara de nuevo.");
    const operation_id = cuerpo.operation_id;
    let r;
    try { r = await t("rateware-api", { ...cuerpo, confirmed: true, approval_text: a.frase_ok, expected_preview_hash: c.pre }); }
    catch { return { estado: "incierta", operation_id, persistencia: "desconocida", reintentar: false }; }
    if (r.status !== 200) return { estado: r.status >= 500 ? "incierta" : "rechazada", operation_id,
      persistencia: r.status >= 500 ? "desconocida" : "no_confirmada", codigo: `HTTP_${r.status}`, reintentar: false };
    const b = r.body;
    if (!b || b.persistencia !== "completa" || !z.string().uuid().safeParse(b.event_id).success || !b.folio ||
      b.estado !== "draft" || b.actor_id !== v.actor_id || b.organization_id !== v.organization_id ||
      !Array.isArray(b.rutas) || b.rutas.length !== input.lanes.length ||
      b.rutas.some((x: any) => !z.string().uuid().safeParse(x.id).success || x.rfx_event_id !== b.event_id) ||
      new Set(b.rutas.map((x: any) => x.id)).size !== b.rutas.length || !Number.isFinite(Date.parse(b.created_at))) {
      return { estado: "incierta", operation_id, persistencia: "sin_recibo_verificable", reintentar: false };
    }
    const mesa_url = `https://fr8bid.heymarksman.com/eventos/${b.event_id}`;
    let leido = false;
    try {
      const d = await t("rateware-api", { action: "list_rfx_detail", event_id: b.event_id });
      leido = d.status === 200 && d.body?.event?.id === b.event_id && Array.isArray(d.body?.lanes) &&
        b.rutas.every((x: any) => d.body.lanes.some((l: any) => l.id === x.id && l.rfx_event_id === b.event_id));
    } catch { /* Persistencia confirmada; lectura posterior pendiente, sin repetir creación. */ }
    return { estado: leido ? "aplicada" : "parcial", event_id: b.event_id, folio: b.folio, estado_evento: b.estado,
      rutas: b.rutas.map((x: any) => ({ id: x.id, numero: x.lane_number })), created_at: b.created_at,
      actor_id: b.actor_id, organization_id: b.organization_id, persistencia: "completa", lectura_verificada: leido,
      operation_id, mesa_url, reintentar: false };
  };
  return async (nombre: string, args: Record<string, unknown>) => {
    const log: Record<string, unknown> = { accion: nombre, usuario: ctx.userId, cliente: ctx.clientId };
    try {
      const result = await ejecutar(nombre, args);
      Object.assign(log, { resultado: result.estado, operation_id: result.operation_id, event_id: result.event_id, organization_id: result.organization_id });
      return result;
    } catch (e) {
      log.resultado = e instanceof Rechazo ? `rechazada:${e.codigo}` : "error";
      throw e;
    } finally {
      // A logging failure must never turn a persisted receipt into an apparent failed creation.
      try { ctx.registrar?.(log); } catch { /* No tokens or payloads in fallback logs. */ }
    }
  };
}
