import { z } from "zod";
import type { Transporte } from "../cliente/api.js";
import type { Rol } from "../dominio/tipos.js";
import { esProtegido } from "../dominio/protegidos.js";
import { firmar, huella, huellaCuerpos, verificar, type Captura } from "./confirmacion.js";
import { APROBADORES_POR_OMISION, Rechazo, esAfirmacion } from "./escrituras.js";

// Listas de carriers desde el MCP. Fuente de verdad: Rateware public.vendor_segments con
// segment_type='participant_template' (miembros en vendor_ids, una lista por nombre y
// organización). «Principal» y «· Ampliada» son dos listas distintas emparejadas por nombre
// (src/bidware/features/carrier-templates/evidence-review.ts). Contrato existente en
// rateware-api: list_/get_carrier_list_template(s) y update_carrier_list_template con
// expected_version (UPDATE condicional a template_version: si otro cambió la lista, 409
// template_version_conflict). Alta en lista NO es shortlist, «Revisado» ni invitación:
// no toca eventos, no invita y no envía nada.

export const AMPLIADA = " · Ampliada";
export const ACCIONES_LISTAS = new Set(["list_carrier_list_templates", "get_carrier_list_template", "update_carrier_list_template", "list_vendors"]);
const ESCRITURA_LISTAS = "update_carrier_list_template";
const PAGINA = 200, MAX_PAGINAS = 5;

/** /api/rateware de ESTE recurso, solo con las acciones de listas; un fallo de red al escribir vuelve como incierto. */
export function transporteListas(resource: string, token: string, request: typeof fetch = fetch): Transporte {
  const endpoint = new URL("/api/rateware", resource);
  return async (servicio, body) => {
    const action = String(body.action);
    if (servicio !== "rateware-api" || !ACCIONES_LISTAS.has(action)) throw new Error("Acción fuera del MCP");
    let response: Response;
    try {
      response = await request(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(28000) });
    } catch {
      return { status: 504, body: { code: "SIN_RESPUESTA", incierta: action === ESCRITURA_LISTAS }, headers: {} };
    }
    return { status: response.status, body: await response.json().catch(() => ({ code: "RESPUESTA_INVALIDA", incierta: action === ESCRITURA_LISTAS })), headers: {} };
  };
}

const uuid = z.string().regex(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
export const herramientasListas = {
  listas_carrier: { rol: "operator" as Rol, descripcion: "Listas de carriers de la organización (Rateware). Con carrier_id dice en qué listas está ese carrier. Cada lista base puede tener su par «· Ampliada»: Principal = oferta real o cotización propia; Ampliada = tarifa histórica compatible. No es la shortlist de un evento ni «Revisado». Solo lee.",
    schema: z.object({ carrier_id: uuid.optional(), buscar: z.string().trim().max(80).optional() }).strict() },
  preparar_alta_lista: { rol: "operator" as Rol, descripcion: "Alta de UN carrier en UNA lista exacta (por lista_id de listas_carrier), con la evidencia que la justifica. Si ya pertenece, lo informa sin duplicar. No invita, no envía mensajes ni toca eventos. Solo lee y devuelve una vista previa con confirmacion_id; muestra carrier, lista, tipo (Principal/Ampliada), evidencia y efecto, y pide un «sí» explícito antes de confirmar.",
    schema: z.object({ carrier_id: uuid, lista_id: uuid, evidencia: z.string().trim().min(10).max(600) }).strict() }
};
export type NombreListas = keyof typeof herramientasListas;
export const ACTOS_LISTAS = new Set(["lista_alta"]);
const RANGO: Record<Rol, number> = { viewer: 0, operator: 1, admin: 2 };

export interface ContextoListasMcp {
  userId: string; clientId: string; rol: Rol; secreto: Uint8Array | null;
  email?: string | null; aprobadores?: string[]; ahora?: () => Date;
  registrar?: (entrada: Record<string, unknown>) => void;
}

interface Lista { id: string; segment_name: string; lifecycle_status?: string; status?: string; template_version?: number; vendor_ids?: string[]; archived_at?: string | null }
const tipoDe = (nombre: string) => nombre.endsWith(AMPLIADA) ? "ampliada" : "principal";
const baseDe = (nombre: string) => nombre.endsWith(AMPLIADA) ? nombre.slice(0, -AMPLIADA.length) : nombre;
const estadoDe = (l: Lista) => String(l.lifecycle_status || l.status || "active");
const miembros = (l: Lista) => [...new Set((l.vendor_ids ?? []).map(String))];

function falla(r: { status: number; body: any }): Rechazo {
  if (r.status === 404 && r.body?.enabled === false) return new Rechazo("LISTAS_DESACTIVADAS", "Las listas de carriers no están habilitadas en este Rateware (CARRIER_LIST_TEMPLATES_V2_ENABLED).", 503);
  if (r.status === 403) return new Rechazo("SIN_PERMISO_RATEWARE", "Rateware no permite esta acción a tu cuenta (organización o permiso vendors:manage).", 403);
  if (r.status === 423) return new Rechazo("ESCRITURA_NO_AUTORIZADA", "Rateware real tiene las escrituras de Fr8Bid cerradas (FR8BID_ESCRITURAS_REALES).", 423);
  if (r.status === 409 && r.body?.code === "template_version_conflict") return new Rechazo("LISTA_CAMBIO", "Otra persona cambió la lista entre la vista previa y la confirmación. Rateware no aplicó nada. Vuelve a preparar.", 409);
  return new Rechazo(`HTTP_${r.status}`, "No se pudo completar la consulta de listas. No se reintentó.", r.status >= 400 && r.status < 600 ? r.status : 502);
}

export function crearListas(t: Transporte, ctx: ContextoListasMcp) {
  const ahora = ctx.ahora ?? (() => new Date());
  const registrar = ctx.registrar ?? ((e: Record<string, unknown>) => console.info(JSON.stringify(e)));
  const aprobadores = ctx.aprobadores ?? APROBADORES_POR_OMISION;
  const pedir = async (body: Record<string, unknown>) => {
    if (!ACCIONES_LISTAS.has(String(body.action))) throw new Rechazo("FUERA_DEL_MCP", "Acción fuera del MCP.", 403);
    return t("rateware-api", body);
  };
  async function lista(id: string): Promise<Lista> {
    const r = await pedir({ action: "get_carrier_list_template", template_id: id });
    const l = r.body?.row ?? r.body?.template;
    if (r.status !== 200 || !l || l.id !== id) throw r.status === 404 && r.body?.enabled !== false ? new Rechazo("LISTA_NO_EXISTE", "Esa lista no existe en tu organización.", 404) : falla(r);
    return l;
  }
  async function carrier(id: string) {
    if (esProtegido(id)) throw new Rechazo("PROTEGIDO", "Registro protegido.", 404);
    const r = await pedir({ action: "list_vendors", ids: [id], lightweight: true });
    const v = (r.body?.rows ?? r.body?.vendors ?? []).find((x: any) => x?.id === id);
    if (r.status !== 200) throw falla(r);
    if (!v) throw new Rechazo("CARRIER_NO_EXISTE", "Ese carrier no existe o no está disponible en tu organización.", 404);
    return { id: v.id as string, nombre: String(v.vendor_name ?? v.name ?? "sin nombre") };
  }
  async function todas() {
    const filas: Lista[] = [];
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const r = await pedir({ action: "list_carrier_list_templates", limit: PAGINA, offset: p * PAGINA });
      if (r.status !== 200 || !Array.isArray(r.body?.rows)) throw falla(r);
      filas.push(...r.body.rows);
      if (!r.body.has_more) return { filas, completas: true };
    }
    return { filas, completas: false };
  }

  async function leer(args: Record<string, unknown>) {
    const a = herramientasListas.listas_carrier.schema.parse(args);
    const c = a.carrier_id ? await carrier(a.carrier_id) : null;
    const { filas, completas } = await todas();
    const q = a.buscar?.toLowerCase();
    const vistas = filas.filter(l => !q || l.segment_name.toLowerCase().includes(q)).map(l => ({
      lista_id: l.id, nombre: l.segment_name, base: baseDe(l.segment_name), tipo: tipoDe(l.segment_name), estado: estadoDe(l), miembros: miembros(l).length,
      ...(c ? { contiene_al_carrier: miembros(l).includes(c.id) } : {})
    }));
    return {
      ...(c ? { carrier: c, listas_del_carrier: vistas.filter(v => v.contiene_al_carrier).map(v => ({ lista_id: v.lista_id, nombre: v.nombre, tipo: v.tipo, estado: v.estado })) } : {}),
      listas: vistas, completas,
      nota: completas ? "Principal y «· Ampliada» son listas distintas; pertenecer a una no implica la otra." : `Solo se leyeron ${filas.length} listas; puede haber más.`
    };
  }

  const foto = (l: Lista) => ({ id: l.id, version: Number(l.template_version) || 1, estado: estadoDe(l), nombre: l.segment_name, miembros: miembros(l).sort() });

  async function preparar(args: Record<string, unknown>) {
    const a = herramientasListas.preparar_alta_lista.schema.parse(args);
    if (RANGO[ctx.rol] < RANGO.operator) throw new Rechazo("SIN_PERMISO", "El alta en lista es del Operador.", 403);
    if (!ctx.secreto) throw new Rechazo("CONFIRMACIONES_PENDIENTES", "Confirmaciones pendientes de configurar (falta FR8BID_MCP_CONFIRM_SECRET).", 503);
    const c = await carrier(a.carrier_id);
    const l = await lista(a.lista_id);
    if (estadoDe(l) === "archived" || l.archived_at) throw new Rechazo("LISTA_ARCHIVADA", `«${l.segment_name}» está archivada; restaurarla es del Administrador en Rateware.`, 409);
    const tipo = tipoDe(l.segment_name);
    const actuales = miembros(l);
    if (actuales.includes(c.id))
      return { estado: "ya_pertenece", escrito: false, carrier: c, lista: { id: l.id, nombre: l.segment_name, tipo }, instruccion: "El carrier ya está en esa lista. No hay nada que confirmar." };
    const version = Number(l.template_version) || 1;
    const cuerpo = { action: ESCRITURA_LISTAS, template_id: l.id, expected_version: version, patch: { vendor_ids: [...actuales, c.id] } };
    const fijo = { carrier: c, lista: { id: l.id, nombre: l.segment_name, tipo }, evidencia: a.evidencia };
    const firma = await firmar({ sub: ctx.userId, client_id: ctx.clientId, act: "lista_alta", ev: l.id, arg: { carrier_id: c.id, lista_id: l.id }, cuerpos: [cuerpo], fijo, pre: huella(foto(l)) }, ctx.secreto, ahora());
    return { estado: "vista_previa", escrito: false, accion: "lista_alta",
      vista_previa: { carrier: c, lista: { id: l.id, nombre: l.segment_name, tipo, miembros_actuales: actuales.length, version },
        evidencia: a.evidencia,
        efecto: `Rateware agrega a ${c.nombre} a «${l.segment_name}» (${tipo}) y lo registra en la auditoría (carrier_template.add_members). Solo se aplica si la lista sigue en la versión ${version}.`,
        no_hace: `No lo agrega a ${tipo === "principal" ? "la lista «· Ampliada»" : "la lista principal"}, no lo preselecciona en ningún evento, no marca «Revisado», no invita ni envía mensajes.` },
      confirmacion_id: firma.token, vence_en: firma.vence,
      instruccion: "Nada se escribió. Muestra esta vista previa completa (carrier, lista exacta, evidencia y efecto) y pide un «sí» explícito del propietario. Solo después llama a confirmar." };
  }

  async function confirmar(args: { confirmacion_id: string; frase_ok?: string }) {
    const log: Record<string, unknown> = { tipo: "fr8bid_mcp_confirmar_lista", usuario: ctx.userId, cliente: ctx.clientId, rol: ctx.rol, en: ahora().toISOString() };
    const fin = (estado: string, extra: Record<string, unknown>, instruccion: string) => { log.resultado = estado; registrar(log); return { estado, accion: "lista_alta", ...extra, instruccion }; };
    try {
      if (!ctx.secreto) throw new Rechazo("CONFIRMACIONES_PENDIENTES", "Confirmaciones pendientes de configurar.", 503);
      const frase = (args.frase_ok ?? "").trim();
      if (!frase) throw new Rechazo("SIN_SI", "Falta la confirmación explícita del propietario (frase_ok).", 400);
      if (!esAfirmacion(frase)) throw new Rechazo("NO_CONFIRMADO", "La respuesta no es un «sí» explícito. No se escribió nada.", 400);
      log.frase_ok = frase.slice(0, 100);
      let c: Captura;
      try { c = await verificar(args.confirmacion_id, ctx.secreto, ahora()); }
      catch { throw new Rechazo("CONFIRMACION_INVALIDA", "La confirmación no es válida o venció (15 min). Vuelve a preparar la vista previa.", 400); }
      Object.assign(log, { accion: c.act, lista_id: c.ev, h: c.h, jti: c.jti });
      if (!ACTOS_LISTAS.has(c.act)) throw new Rechazo("ACCION", "Acción no disponible en el MCP.", 400);
      if (c.sub !== ctx.userId || c.client_id !== ctx.clientId) throw new Rechazo("OTRA_SESION", "Esta confirmación es de otra sesión o cliente.", 403);
      if (RANGO[ctx.rol] < RANGO.operator) throw new Rechazo("SIN_PERMISO", "Tu rol ya no permite esta acción.", 403);
      if (!aprobadores.includes(String(ctx.email ?? "").trim().toLowerCase())) throw new Rechazo("SOLO_PROPIETARIO", "Solo el propietario puede confirmar esto, sobre una vista previa que él mismo preparó.", 403);
      const body = c.cuerpos[0] as Record<string, any>;
      const carrierId = String((c.arg as any).carrier_id);
      if (huellaCuerpos(c.cuerpos, c.fijo) !== c.h || c.cuerpos.length !== 1 || body?.action !== ESCRITURA_LISTAS || body.template_id !== c.ev || Object.keys(body.patch ?? {}).join(",") !== "vendor_ids" || !body.patch.vendor_ids.includes(carrierId))
        throw new Rechazo("ALTERADA", "La confirmación no coincide con su vista previa.", 400);
      // Relectura: si ya pertenece, nada que escribir; si la lista cambió, se vuelve a preparar.
      const l = await lista(c.ev);
      if (miembros(l).includes(carrierId)) return fin("sin_efecto", { lista_id: c.ev, carrier_id: carrierId }, "El carrier ya estaba en la lista: no se duplicó ni se escribió.");
      if (huella(foto(l)) !== c.pre) throw new Rechazo("YA_APLICADO_O_CAMBIO", "La lista cambió desde la vista previa. Vuelve a preparar; no se escribió nada.");
      const r = await pedir(body);
      if (r.status === 504 || r.body?.incierta) return fin("incierta", { lista_id: c.ev, carrier_id: carrierId }, "Resultado incierto: Rateware no confirmó. No reintentes; consulta listas_carrier antes de repetir.");
      if (r.status !== 200) throw falla(r);
      const ok = Array.isArray(r.body?.row?.vendor_ids) && r.body.row.vendor_ids.includes(carrierId);
      return fin(ok ? "aplicada" : "incierta", { lista_id: c.ev, carrier_id: carrierId, version: r.body?.row?.template_version ?? null },
        ok ? "Hecho: Rateware agregó al carrier a la lista." : "Rateware respondió sin confirmar la membresía. No reintentes; consulta listas_carrier.");
    } catch (e) {
      log.resultado = e instanceof Rechazo ? `rechazada:${e.codigo}` : "error";
      registrar(log);
      throw e;
    }
  }

  return async (nombre: string, args: Record<string, unknown>): Promise<Record<string, any>> => {
    if (nombre === "listas_carrier") return leer(args);
    if (nombre === "preparar_alta_lista") return preparar(args);
    if (nombre === "confirmar") return confirmar(args as { confirmacion_id: string; frase_ok?: string });
    throw new Rechazo("FUERA_DEL_MCP", "Herramienta fuera del MCP.", 400);
  };
}

/** Acto de un confirmacion_id SIN verificar (solo para enrutar; quien lo atiende lo verifica completo). */
export function actoDe(token: string): string | null {
  try { const p = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")); return typeof p?.act === "string" ? p.act : null; }
  catch { return null; }
}
