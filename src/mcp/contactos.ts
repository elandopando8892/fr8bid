import { z } from "zod";
import type { Rol } from "../dominio/tipos.js";
import { clasificarPuesto } from "../dominio/apollo.js";
import { firmar, huella, huellaCuerpos, verificar, type Captura } from "./confirmacion.js";
import { APROBADORES_POR_OMISION, Rechazo, esAfirmacion } from "./escrituras.js";

// Contactos de carriers desde el MCP. Reutiliza el contrato durable de Rateware
// (carrier-contacts-api, rateware#203) a través del adaptador de Fr8Bid
// /api/contactos-empresa (#46): la organización sale del principal de Rateware,
// la reserva de créditos es la fila de carrier_contact_operations (una por
// organización, empresa y persona) y el «claim» es atómico. Nunca se llama a
// Apollo directo ni a la ruta antigua /api/apollo.
//
// buscar_contacto: lee contactos conocidos (sin rebotados ni suprimidos) y, si se
//   pide, busca en Apollo (gratis; Rateware guarda la lista 1 h para poder preparar).
// preparar_revelar_contacto / preparar_elegir_contacto: solo leen y firman la vista
//   previa. No crean la operación ni reservan créditos.
// confirmar: tras un «sí» del propietario, relee, crea la operación y la reclama
//   (revelar) o elige el correo conocido (CRM). Un resultado incierto no se reintenta.

export interface RespuestaContactos { status: number; body: any }
export type TransporteContactos = (body: Record<string, unknown>) => Promise<RespuestaContactos>;

/** Acciones de carrier-contacts-api que usa el MCP; resolve_known y apply_result quedan en la página del evento en Fr8Bid. */
export const ACCIONES_CONTACTOS_MCP = new Set(["context", "operation", "search", "prepare_reveal", "confirm_reveal", "choose_known"]);
const ESCRITURAS_CONTACTOS = new Set(["search", "prepare_reveal", "confirm_reveal", "choose_known"]);

/** Solo el /api/contactos-empresa de ESTE recurso; un fallo de red en una escritura vuelve como incierto, sin reintento. */
export function transporteContactos(resource: string, token: string, request: typeof fetch = fetch): TransporteContactos {
  const endpoint = new URL("/api/contactos-empresa", resource);
  return async body => {
    const action = String(body.action);
    if (!ACCIONES_CONTACTOS_MCP.has(action)) throw new Error("Acción fuera del MCP");
    let response: Response;
    try {
      response = await request(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(45000) });
    } catch {
      return { status: 504, body: { code: "CONTACT_UNCERTAIN", incierta: ESCRITURAS_CONTACTOS.has(action) } };
    }
    return { status: response.status, body: await response.json().catch(() => ({ code: "RESPUESTA_INVALIDA", incierta: ESCRITURAS_CONTACTOS.has(action) })) };
  };
}

const uuid = z.string().regex(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
const vista = "Solo lee y devuelve una vista previa con confirmacion_id; no crea la operación, no reserva ni consume créditos y no cambia el CRM. Muestra la vista previa completa y pide un «sí» explícito antes de llamar a confirmar.";

export const herramientasContactos = {
  buscar_contacto: { rol: "viewer" as Rol, descripcion: "Contactos de un carrier por su UUID (el de `carrier`/`seguimiento_evento`; nunca por nombre). Devuelve los correos conocidos del mismo dominio, sin rebotados ni suprimidos, y la operación de revelado en curso. Con buscar_en_apollo=true (Operador) busca personas en Apollo: no consume créditos; Rateware guarda la lista 1 h para poder preparar el revelado. Prioriza dispatch, ventas, logística, tráfico, dirección o VP comercial y dueño. No revela correos.",
    schema: z.object({ carrier_id: uuid, buscar_en_apollo: z.boolean().default(false), pagina: z.number().int().min(1).max(10).default(1) }).strict() },
  preparar_revelar_contacto: { rol: "admin" as Rol, descripcion: `Administrador: revelar en Apollo el correo de UNA persona de buscar_contacto (candidato_ref). Muestra carrier, persona, costo máximo en créditos y efecto en el CRM. ${vista}`,
    schema: z.object({ carrier_id: uuid, candidato_ref: z.string().min(20).max(4000) }).strict() },
  preparar_elegir_contacto: { rol: "operator" as Rol, descripcion: `CRM: fija como contacto principal un correo CONOCIDO del carrier (de buscar_contacto), por ejemplo para sustituir uno rebotado. No consume créditos. ${vista}`,
    schema: z.object({ carrier_id: uuid, correo: z.string().trim().toLowerCase().email().max(254) }).strict() }
};
export type NombreContactos = keyof typeof herramientasContactos;
export const ACTOS_CONTACTOS = new Set(["contacto_revelar", "contacto_elegir"]);
const ROL_ACTO: Record<string, Rol> = { contacto_revelar: "admin", contacto_elegir: "operator" };
const RANGO: Record<Rol, number> = { viewer: 0, operator: 1, admin: 2 };
const permite = (rol: Rol, minimo: Rol) => RANGO[rol] >= RANGO[minimo];

export interface ContextoContactosMcp {
  userId: string; clientId: string; rol: Rol; secreto: Uint8Array | null;
  email?: string | null; aprobadores?: string[]; ahora?: () => Date;
  registrar?: (entrada: Record<string, unknown>) => void;
}

const MENSAJES: Record<string, string> = {
  SESSION_REQUIRED: "La sesión no es válida para Contactos de Rateware.",
  CONTACT_ACCESS: "No puedes ver ni actualizar este carrier (otra organización, restringido o sin acceso).",
  ACCESS_DENIED: "Tu cuenta no puede realizar esta acción en Contactos.",
  ADMIN_REQUIRED: "El administrador confirma los créditos de Apollo.",
  WRITES_DISABLED: "Las escrituras de contactos están cerradas en este entorno (FR8BID_ESCRITURAS_REALES).",
  CREDIT_POLICY_UNAVAILABLE: "Falta verificar la tarifa o la conexión de Apollo. No se solicitarán créditos.",
  COMPANY_DOMAIN_REQUIRED: "El carrier no tiene un dominio propio único: revisa su identidad antes de buscar.",
  CONFIRMATION_CHANGED: "La selección o confirmación cambió en Rateware.",
  APOLLO_LIMIT: "Apollo pidió esperar.",
  APOLLO_CONFIGURATION: "La conexión con Apollo necesita revisión.",
  CONTACT_SERVICE_UNAVAILABLE: "Contactos de Rateware no respondió con un resultado utilizable."
};
function falla(r: RespuestaContactos): Rechazo {
  const code = String(r.body?.code ?? "");
  return new Rechazo(Object.hasOwn(MENSAJES, code) ? code : `HTTP_${r.status}`, `${MENSAJES[code] ?? "No se pudo completar la consulta de contactos."} No se reintentó.`, r.status >= 400 && r.status < 600 ? r.status : 502);
}

export function crearContactos(t: TransporteContactos, ctx: ContextoContactosMcp) {
  const ahora = ctx.ahora ?? (() => new Date());
  const registrar = ctx.registrar ?? ((e: Record<string, unknown>) => console.info(JSON.stringify(e)));
  const aprobadores = ctx.aprobadores ?? APROBADORES_POR_OMISION;
  const seguro: TransporteContactos = async body => {
    if (!ACCIONES_CONTACTOS_MCP.has(String(body.action))) throw new Rechazo("FUERA_DEL_MCP", "Acción fuera del MCP.", 403);
    return t(body);
  };
  async function contexto(carrierId: string) {
    const r = await seguro({ action: "context", vendor_id: carrierId });
    if (r.status !== 200 || !r.body?.vendor || r.body.vendor.id !== carrierId) throw falla(r.status === 200 ? { status: 502, body: { code: "CONTACT_SERVICE_UNAVAILABLE" } } : r);
    return r.body as { vendor: { id: string; name: string; domain: string; email: string | null }; known: { state: string; candidates: { email: string; source: string }[] }; operation: any; available: boolean; capabilities: { can_write: boolean; can_search: boolean; can_spend: boolean; max_credits: number | null } };
  }
  const operacionPublica = (o: any) => o ? { id: o.id, persona_id: o.person_id, persona: o.person_name || null, estado: o.state, creditos_max: o.max_credits, creditos_confirmados: o.credits_confirmed, correo: o.email, vinculado: o.linked, codigo: o.code, vence: o.expires_at } : null;
  // Foto de las precondiciones: si cambia entre la vista previa y confirmar, no se escribe.
  const foto = (c: Awaited<ReturnType<typeof contexto>>) => ({ vendor: c.vendor.id, dominio: c.vendor.domain, correo: c.vendor.email, conocido: c.known.state, candidatos: c.known.candidates.map(x => x.email).sort(), disponible: c.available, creditos_max: c.capabilities.max_credits, operacion: c.operation ? { id: c.operation.id, persona: c.operation.person_id, estado: c.operation.state } : null });

  async function buscar(args: Record<string, unknown>) {
    const a = herramientasContactos.buscar_contacto.schema.parse(args);
    const c = await contexto(a.carrier_id);
    const out: Record<string, unknown> = {
      carrier: { id: c.vendor.id, nombre: c.vendor.name, dominio: c.vendor.domain || null, contacto_principal: c.vendor.email },
      conocidos: { estado: c.known.state, correos: c.known.candidates.map(x => ({ correo: x.email, fuente: x.source })),
        nota: "Rateware excluye correos de otro dominio, rebotados (180 días) y suprimidos. Una lectura parcial no prueba que no existan otros contactos." },
      operacion_en_curso: operacionPublica(c.operation),
      capacidades: { buscar_en_apollo: c.capabilities.can_search, revelar: c.capabilities.can_spend, creditos_max_por_revelado: c.capabilities.max_credits }
    };
    if (!a.buscar_en_apollo) return { ...out, apollo: "no consultado (usa buscar_en_apollo=true; no consume créditos)" };
    if (!permite(ctx.rol, "operator")) throw new Rechazo("SIN_PERMISO", "Buscar en Apollo es del Operador.", 403);
    if (c.known.state === "restricted") throw new Rechazo("RESTRINGIDO", "Este carrier está restringido para contactos.", 403);
    if (c.known.state === "domain_required" || (c.known.state === "ambiguous" && !c.known.candidates.length))
      throw new Rechazo("IDENTIDAD", "El carrier no tiene un dominio propio único: varias empresas lo comparten o es un dominio público. Revisa su identidad en la página del evento en Fr8Bid antes de buscar.", 409);
    const r = await seguro({ action: "search", vendor_id: a.carrier_id, page: a.pagina });
    if (r.status !== 200 || !Array.isArray(r.body?.candidates)) throw falla(r.status === 200 ? { status: 502, body: { code: "CONTACT_SERVICE_UNAVAILABLE" } } : r);
    const candidatos = await Promise.all((r.body.candidates as any[]).filter(p => typeof p?.id === "string").map(async p => {
      const { prioridad, rol } = clasificarPuesto(String(p.title || ""));
      const persona = { id: p.id, nombre: String(p.name || "Sin nombre"), puesto: String(p.title || "sin puesto"), tiene_correo: p.has_email === true, empresa_verificada: p.company_verified === true };
      const ref = ctx.secreto && persona.tiene_correo
        ? (await firmar({ sub: ctx.userId, client_id: ctx.clientId, act: "contacto_candidato", ev: a.carrier_id, arg: { persona, dominio: c.vendor.domain }, cuerpos: [], pre: "" }, ctx.secreto, ahora())).token : null;
      return { ...persona, rol, prioridad, puesto_objetivo: prioridad < 3, candidato_ref: ref };
    }));
    candidatos.sort((x, y) => x.prioridad - y.prioridad || Number(y.tiene_correo) - Number(x.tiene_correo));
    return { ...out, apollo: { pagina: a.pagina, costo: "0 créditos (búsqueda)", candidatos,
      nota: "Nombres parciales de Apollo: la búsqueda no prueba empleo actual. Solo se puede revelar a quien tiene correo (candidato_ref); la lista vence en 1 h." } };
  }

  async function preparar(nombre: Exclude<NombreContactos, "buscar_contacto">, args: Record<string, unknown>) {
    const act = nombre === "preparar_revelar_contacto" ? "contacto_revelar" : "contacto_elegir";
    if (!permite(ctx.rol, ROL_ACTO[act])) throw new Rechazo("SIN_PERMISO", `Esta acción es del ${ROL_ACTO[act] === "admin" ? "Administrador" : "Operador"}.`, 403);
    if (!ctx.secreto) throw new Rechazo("CONFIRMACIONES_PENDIENTES", "Confirmaciones pendientes de configurar (falta FR8BID_MCP_CONFIRM_SECRET).", 503);
    let arg: Record<string, unknown>, fijo: Record<string, unknown>, cuerpos: Record<string, unknown>[], vistaPrevia: Record<string, unknown>;
    let c: Awaited<ReturnType<typeof contexto>>;
    if (act === "contacto_revelar") {
      const a = herramientasContactos.preparar_revelar_contacto.schema.parse(args);
      let ref: Captura;
      try { ref = await verificar(a.candidato_ref, ctx.secreto, ahora()); }
      catch { throw new Rechazo("CANDIDATO_VENCIDO", "La selección venció o no es válida. Vuelve a buscar el contacto.", 400); }
      if (ref.act !== "contacto_candidato" || ref.ev !== a.carrier_id || ref.sub !== ctx.userId || ref.client_id !== ctx.clientId)
        throw new Rechazo("CANDIDATO_AJENO", "La persona elegida no pertenece a este carrier ni a esta sesión.", 400);
      const persona = ref.arg.persona as { id: string; nombre: string; puesto: string; tiene_correo: boolean; empresa_verificada: boolean };
      c = await contexto(a.carrier_id);
      if (!c.available) throw new Rechazo("RESTRINGIDO", "Este carrier está restringido para contactos.", 403);
      if (c.vendor.domain !== ref.arg.dominio) throw new Rechazo("IDENTIDAD", "El dominio del carrier cambió desde la búsqueda. Vuelve a buscar.", 409);
      if (c.known.state === "current") throw new Rechazo("YA_TIENE_CONTACTO", `El carrier ya tiene contacto principal vigente (${c.vendor.email}); Rateware no lo sustituiría y no hay nada que revelar.`, 409);
      const op = c.operation;
      if (op && ["processing", "needs_link", "uncertain"].includes(op.state))
        throw new Rechazo("OPERACION_EN_CURSO", `Hay un revelado en estado «${op.state}» para este carrier. Recupéralo en la página del evento en Fr8Bid antes de gastar otro crédito.`, 409);
      if (op && op.person_id === persona.id && op.state !== "draft") throw new Rechazo("YA_REVELADO", "Esa persona ya se reveló para esta organización; no se vuelve a cobrar.", 409);
      if (!c.capabilities.can_spend || !c.capabilities.max_credits) throw new Rechazo("CREDIT_POLICY_UNAVAILABLE", MENSAJES.CREDIT_POLICY_UNAVAILABLE, 503);
      const costo = c.capabilities.max_credits;
      arg = { carrier_id: a.carrier_id, persona_id: persona.id };
      fijo = { persona, costo_creditos_max: costo, dominio: c.vendor.domain };
      cuerpos = [{ action: "prepare_reveal", vendor_id: a.carrier_id, person_id: persona.id }, { action: "confirm_reveal" }];
      vistaPrevia = { carrier: { id: c.vendor.id, nombre: c.vendor.name, dominio: c.vendor.domain }, persona: { nombre: persona.nombre, puesto: persona.puesto, rol: clasificarPuesto(persona.puesto).rol, empresa_verificada: persona.empresa_verificada },
        costo: { creditos_max: costo, referencia: "1 crédito por contacto", nota: "Rateware reserva la operación al confirmar; una repetición o confirmación simultánea no vuelve a cobrar." },
        efecto_crm: "Si Apollo devuelve un correo verificado del mismo dominio, Rateware lo guarda como contacto principal del carrier y lo registra en su historial. Si no hay correo verificado, no cambia el CRM aunque el crédito pueda consumirse.",
        no_hace: "No envía mensajes ni invita al carrier." };
    } else {
      const a = herramientasContactos.preparar_elegir_contacto.schema.parse(args);
      c = await contexto(a.carrier_id);
      if (!c.available) throw new Rechazo("RESTRINGIDO", "Este carrier está restringido para contactos.", 403);
      if (c.known.state === "current") throw new Rechazo("YA_TIENE_CONTACTO", `El carrier ya tiene contacto principal vigente (${c.vendor.email}). Si rebotó, Rateware lo dejará de considerar vigente al registrar el rebote.`, 409);
      const elegido = c.known.candidates.find(x => x.email === a.correo);
      if (!elegido) throw new Rechazo("NO_CONOCIDO", "Ese correo no es un contacto conocido y vigente del carrier (otro dominio, rebotado o suprimido). No se agrega por esta vía.", 409);
      arg = { carrier_id: a.carrier_id, correo: a.correo };
      fijo = { correo: a.correo, fuente: elegido.source };
      cuerpos = [{ action: "choose_known", vendor_id: a.carrier_id, email: a.correo }];
      vistaPrevia = { carrier: { id: c.vendor.id, nombre: c.vendor.name, dominio: c.vendor.domain }, correo: a.correo, fuente: elegido.source, contacto_actual: c.vendor.email ?? "sin contacto vigente",
        costo: { creditos: 0 }, efecto_crm: "Rateware fija este correo como contacto principal del carrier y lo registra en su historial (contact_associated).", no_hace: "No envía mensajes ni invita al carrier." };
    }
    const firma = await firmar({ sub: ctx.userId, client_id: ctx.clientId, act, ev: String(arg.carrier_id), arg, cuerpos, fijo, pre: huella(foto(c)) }, ctx.secreto, ahora());
    return { estado: "vista_previa", escrito: false, accion: act, vista_previa: vistaPrevia, confirmacion_id: firma.token, vence_en: firma.vence,
      instruccion: "Nada se escribió ni se consumió. Muestra esta vista previa completa (persona o correo, costo y efecto en el CRM) y pide un «sí» explícito del propietario. Solo después llama a confirmar con este confirmacion_id y frase_ok = su respuesta literal." };
  }

  async function confirmar(args: { confirmacion_id: string; frase_ok?: string }) {
    const log: Record<string, unknown> = { tipo: "fr8bid_mcp_confirmar_contacto", usuario: ctx.userId, cliente: ctx.clientId, rol: ctx.rol, en: ahora().toISOString() };
    try {
      if (!ctx.secreto) throw new Rechazo("CONFIRMACIONES_PENDIENTES", "Confirmaciones pendientes de configurar.", 503);
      const frase = (args.frase_ok ?? "").trim();
      if (!frase) throw new Rechazo("SIN_SI", "Falta la confirmación explícita del propietario (frase_ok). Muestra la vista previa y espera su «sí».", 400);
      if (!esAfirmacion(frase)) throw new Rechazo("NO_CONFIRMADO", "La respuesta no es un «sí» explícito. No se escribió nada.", 400);
      log.frase_ok = frase.slice(0, 100);
      let c: Captura;
      try { c = await verificar(args.confirmacion_id, ctx.secreto, ahora()); }
      catch { throw new Rechazo("CONFIRMACION_INVALIDA", "La confirmación no es válida o venció (15 min). Vuelve a preparar la vista previa.", 400); }
      Object.assign(log, { accion: c.act, carrier_id: c.ev, h: c.h, jti: c.jti });
      if (!ACTOS_CONTACTOS.has(c.act)) throw new Rechazo("ACCION", "Acción no disponible en el MCP.", 400);
      if (c.sub !== ctx.userId || c.client_id !== ctx.clientId) throw new Rechazo("OTRA_SESION", "Esta confirmación es de otra sesión o cliente.", 403);
      if (!permite(ctx.rol, ROL_ACTO[c.act])) throw new Rechazo("SIN_PERMISO", "Tu rol ya no permite esta acción.", 403);
      if (!aprobadores.includes(String(ctx.email ?? "").trim().toLowerCase())) throw new Rechazo("SOLO_PROPIETARIO", "Solo el propietario puede confirmar esto, sobre una vista previa que él mismo preparó.", 403);
      if (huellaCuerpos(c.cuerpos, c.fijo) !== c.h || c.cuerpos.some(b => !ACCIONES_CONTACTOS_MCP.has(String(b.action)) || (b.vendor_id !== undefined && b.vendor_id !== c.ev)))
        throw new Rechazo("ALTERADA", "La confirmación no coincide con su vista previa.", 400);
      const fijo = c.fijo as Record<string, any>;
      // Relectura: carrier, dominio, candidatos, costo y operación deben seguir como en la vista previa.
      const actual = await contexto(c.ev);
      if (c.act === "contacto_revelar" && actual.capabilities.max_credits !== fijo.costo_creditos_max)
        throw new Rechazo("COSTO_CAMBIADO", `El costo cambió (${fijo.costo_creditos_max} → ${actual.capabilities.max_credits ?? "sin política"} créditos). Vuelve a preparar; no se consumió nada.`);
      if (huella(foto(actual)) !== c.pre) throw new Rechazo("YA_APLICADO_O_CAMBIO", "El carrier o su contacto cambiaron desde la vista previa (o ya se aplicó). Vuelve a preparar; no se escribió nada.");
      const r1 = await seguro(c.cuerpos[0]);
      if (c.act === "contacto_elegir") {
        if (r1.status === 504 || r1.body?.incierta) return resultado(log, "incierta", c, { mensaje: "Rateware no confirmó. No reintentes; revisa el carrier antes de repetir." });
        if (r1.status !== 200) throw falla(r1);
        const ok = r1.body?.vendor?.email === fijo.correo;
        return resultado(log, ok ? "aplicada" : "sin_efecto", c, { contacto_principal: r1.body?.vendor?.email ?? null });
      }
      // Revelar: prepare_reveal crea (o devuelve) la operación durable; confirm_reveal la reclama una sola vez.
      if (r1.status === 504 || r1.body?.incierta) return resultado(log, "incierta", c, { mensaje: "No se supo si Rateware creó la operación. No reintentes; consulta el carrier." });
      if (r1.status !== 200) throw falla(r1);
      const op = r1.body?.operation;
      if (!op || op.vendor_id !== c.ev || op.person_id !== (c.arg as any).persona_id) return resultado(log, "rechazada", c, { mensaje: "Rateware devolvió otra operación. No se reclamó nada." });
      if (op.state !== "draft") return resultado(log, op.state === "completed" ? "sin_efecto" : "incierta", c, { operacion: operacionPublica(op), mensaje: "Ya existía una operación para esta persona: no se volvió a cobrar." });
      if (!op.confirmation_hash || op.max_credits !== fijo.costo_creditos_max)
        return resultado(log, "rechazada", c, { mensaje: "Rateware no entregó una reserva con el costo aprobado. No se reclamó." });
      const r2 = await seguro({ action: "confirm_reveal", operation_id: op.id, confirmation_hash: op.confirmation_hash });
      if (r2.status === 504 || r2.body?.incierta) return resultado(log, "incierta", c, { operacion: { id: op.id }, mensaje: "Resultado incierto: Rateware no confirmó. No reintentes; el crédito pudo consumirse. Consulta la operación del carrier." });
      if (r2.status !== 200) throw falla(r2);
      const fin = r2.body?.operation;
      const estado = fin?.state === "completed" ? "aplicada" : fin?.state === "needs_link" ? "parcial" : fin?.state === "failed" ? "rechazada" : "incierta";
      return resultado(log, estado, c, { operacion: operacionPublica(fin) });
    } catch (e) {
      log.resultado = e instanceof Rechazo ? `rechazada:${e.codigo}` : "error";
      registrar(log);
      throw e;
    }
  }
  function resultado(log: Record<string, unknown>, estado: string, c: Captura, extra: Record<string, unknown>) {
    log.resultado = estado;
    registrar(log);
    const instruccion = estado === "aplicada" ? "Hecho: Rateware reflejó lo aprobado." : estado === "incierta" ? "Resultado incierto. No reintentes; revisa el carrier en la página del evento en Fr8Bid."
      : estado === "parcial" ? "Correo obtenido; el vínculo con el carrier quedó pendiente en Rateware. No reintentes." : "No se aplicó. No reintentes automáticamente.";
    return { estado, accion: c.act, carrier_id: c.ev, ...extra, instruccion };
  }

  return async (nombre: string, args: Record<string, unknown>): Promise<Record<string, any>> => {
    if (nombre === "buscar_contacto") return buscar(args);
    if (nombre === "preparar_revelar_contacto" || nombre === "preparar_elegir_contacto") return preparar(nombre, args);
    if (nombre === "confirmar") return confirmar(args as { confirmacion_id: string; frase_ok?: string });
    throw new Rechazo("FUERA_DEL_MCP", "Herramienta fuera del MCP.", 400);
  };
}

/** Acto de un confirmacion_id SIN verificar (solo para enrutar; quien lo atiende lo verifica completo). */
export function actoDe(token: string): string | null {
  try { const p = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")); return typeof p?.act === "string" ? p.act : null; }
  catch { return null; }
}
