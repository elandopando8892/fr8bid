// «Reportar a Fr8Desk» desde la Mesa: proxy servidor a servidor hacia el
// servicio común de trabajo de Fr8Desk (/v1, contrato en
// fr8desk/docs/servicio-comun-v1.md y GET /v1/openapi.json).
// - El navegador nunca ve la credencial fd_… (FR8DESK_TOKEN).
// - Siempre en nombre de la persona: x-fr8desk-actor lleva su token de sesión,
//   el mismo que Fr8Bid manda a rateware-prod.
// - Antes de llamar a Fr8Desk se comprueba que la persona ve el evento, con la
//   misma lectura que usa la Mesa (list_rfx_detail con su token).
// - A Fr8Desk solo va lo que escribe la persona (asunto, descripción, impacto)
//   y la referencia {tipo: "rfx_evento", ref: <uuid>}: Fr8Bid es dueño del RFx.
// - request_id lo genera el navegador al abrir el formulario y se reenvía tal
//   cual: el reintento no duplica el caso.

import { esProtegido } from "../dominio/protegidos.js";
import type { Enviar } from "./proxy.js";

export const FR8DESK_URL_PREDETERMINADA = "https://fr8desk-sandy.vercel.app";
export const TIPO_OBJETO = "rfx_evento";
export const IMPACTOS = ["detiene", "retrasa", "molesta", "consulta"] as const;
export type Impacto = (typeof IMPACTOS)[number];
export const MAX_ASUNTO = 140;
export const MAX_DESCRIPCION = 4000;

// Forma de uuid (el simulado usa prefijos legibles como «evt00000-…»).
const UUID = /^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/i;
const UUID_ESTRICTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConfigFr8Desk {
  url?: string;
  token?: string;
  equipo?: string;
}

export interface OpcionesFr8Desk {
  config: ConfigFr8Desk;
  // Lectura de Rateware con el token de la persona (la de la Mesa). null = Rateware sin configurar.
  rateware: Enviar | null;
  fetch: typeof fetch;
  timeoutMs?: number;
}

export interface RespuestaFr8Desk {
  status: number;
  body: any;
}

export interface CasoFr8Desk {
  folio: string;
  asunto: string;
  estado: string;
  url: string;
}

const error = (status: number, code: string, mensaje: string, extra: Record<string, unknown> = {}): RespuestaFr8Desk => ({
  status,
  body: { error: mensaje, code, ...extra }
});

export const urlDeCaso = (base: string, folio: string) => `${base}/#/t/${encodeURIComponent(folio)}`;

const baseDe = (config: ConfigFr8Desk) => (config.url?.trim() || FR8DESK_URL_PREDETERMINADA).replace(/\/+$/, "");

export async function manejarFr8Desk(
  metodo: string,
  consulta: Record<string, unknown>,
  body: Record<string, unknown> | null,
  autorizacion: string | null,
  op: OpcionesFr8Desk
): Promise<RespuestaFr8Desk> {
  if (metodo !== "GET" && metodo !== "POST") return error(405, "METODO", "Solo GET o POST.");
  if (!op.config.token || !op.config.equipo) return error(503, "FR8DESK_NO_CONFIGURADO", "Integración con Fr8Desk no configurada.");
  const sesion = /^Bearer (\S+)$/.exec(autorizacion || "")?.[1];
  if (!sesion) return error(401, "SIN_SESION", "Inicia sesión para continuar.");

  const eventoId = String((metodo === "GET" ? consulta.rfx_event_id : body?.rfx_event_id) ?? "");
  if (!UUID.test(eventoId) || esProtegido(eventoId)) return error(404, "NOT_FOUND", "No encontrado.");

  let datos: { asunto: string; descripcion: string; impacto: Impacto; requestId: string } | null = null;
  if (metodo === "POST") {
    const asunto = typeof body?.asunto === "string" ? body.asunto.trim() : "";
    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : "";
    const impacto = String(body?.impacto ?? "") as Impacto;
    const requestId = String(body?.request_id ?? "");
    if (!UUID_ESTRICTO.test(requestId)) return error(400, "DATOS_INVALIDOS", "Falta request_id (uuid) para que el reintento no duplique el caso.");
    if (!asunto || asunto.length > MAX_ASUNTO) return error(400, "DATOS_INVALIDOS", `Escribe un asunto de hasta ${MAX_ASUNTO} caracteres.`);
    if (!descripcion || descripcion.length > MAX_DESCRIPCION) return error(400, "DATOS_INVALIDOS", `Escribe una descripción de hasta ${MAX_DESCRIPCION} caracteres.`);
    if (!IMPACTOS.includes(impacto)) return error(400, "DATOS_INVALIDOS", `Impacto no válido: usa ${IMPACTOS.join(", ")}.`);
    datos = { asunto, descripcion, impacto, requestId };
  }

  // Acceso al evento: la misma lectura de la Mesa, con el token de la persona.
  if (!op.rateware) return error(503, "SIN_CONFIGURACION", "Fr8Bid no tiene configurado Rateware.");
  let lectura;
  try {
    lectura = await conLimite(op.rateware("rateware-api", { action: "list_rfx_detail", event_id: eventoId }, autorizacion), op.timeoutMs ?? 8000);
  } catch {
    return error(504, "SIN_RESPUESTA", "Rateware no respondió; vuelve a intentar.");
  }
  if (lectura.status === 401) return error(401, "SIN_SESION", "Inicia sesión para continuar.");
  const evento = lectura.status >= 200 && lectura.status < 300 ? lectura.body?.event : null;
  if (!evento || String(evento.id || "").toLowerCase() !== eventoId.toLowerCase()) return error(404, "NOT_FOUND", "No encontrado.");

  const base = baseDe(op.config);
  const cabeceras: Record<string, string> = {
    authorization: `Bearer ${op.config.token}`,
    "x-fr8desk-actor": sesion,
    accept: "application/json"
  };

  let r: { status: number; body: any };
  try {
    if (metodo === "GET") {
      const q = new URLSearchParams({ tipo: TIPO_OBJETO, ref: eventoId });
      r = await llamar(op, `${base}/v1/casos?${q}`, { method: "GET", headers: cabeceras });
    } else {
      r = await llamar(op, `${base}/v1/casos`, {
        method: "POST",
        headers: { ...cabeceras, "content-type": "application/json" },
        body: JSON.stringify({
          request_id: datos!.requestId,
          asunto: datos!.asunto,
          descripcion: datos!.descripcion,
          equipo: op.config.equipo,
          impacto: datos!.impacto,
          objeto: { tipo: TIPO_OBJETO, ref: eventoId }
        })
      });
    }
  } catch {
    // Sin respuesta: no se sabe si el caso se creó. Reintentar con el mismo
    // request_id es seguro (Fr8Desk no duplica).
    return error(504, "FR8DESK_SIN_RESPUESTA", "Fr8Desk no respondió. Puedes reintentar: no se duplica el caso.", { incierta: true });
  }

  if (r.status >= 200 && r.status < 300) {
    if (metodo === "GET") {
      const casos: CasoFr8Desk[] = (Array.isArray(r.body?.casos) ? r.body.casos : [])
        .filter((c: any) => c && typeof c.folio === "string")
        .map((c: any) => ({ folio: c.folio, asunto: String(c.asunto ?? ""), estado: String(c.estado ?? ""), url: urlDeCaso(base, c.folio) }));
      return { status: 200, body: { casos } };
    }
    const folio = String(r.body?.folio ?? "");
    if (!folio) return error(502, "FR8DESK_RESPUESTA_INVALIDA", "Fr8Desk respondió sin folio.");
    return { status: 200, body: { id: r.body?.id ?? null, folio, url: urlDeCaso(base, folio), repetido: Boolean(r.body?.repetido) } };
  }
  return traducirError(r);
}

// 4xx de Fr8Desk con mensaje legible. Un 401 es la credencial de Fr8Bid, no la
// sesión de la persona: no se devuelve 401 para no cerrar su sesión.
function traducirError(r: { status: number; body: any }): RespuestaFr8Desk {
  const codigo = String(r.body?.codigo || r.body?.code || r.status);
  const mensaje = typeof r.body?.mensaje === "string" ? r.body.mensaje : typeof r.body?.error === "string" ? r.body.error : null;
  if (r.status === 401) return error(502, "FR8DESK_CREDENCIAL", "Fr8Desk rechazó la credencial de Fr8Bid (FR8DESK_TOKEN).", { fr8desk: codigo });
  if (r.status === 403 && codigo === "actor_invalido") return error(403, "FR8DESK_SIN_ACCESO", "Tu usuario no tiene acceso a Fr8Desk. Pide tu alta al equipo de Fr8Desk.", { fr8desk: codigo });
  if (r.status === 409) return error(409, "FR8DESK_CONFLICTO", "Este envío ya se registró con otro contenido. Cierra el formulario y vuelve a abrirlo.", { fr8desk: codigo });
  if (r.status >= 400 && r.status < 500) return error(r.status, `FR8DESK_${codigo.toUpperCase()}`, mensaje ? `Fr8Desk: ${mensaje}` : `Fr8Desk rechazó la solicitud (${r.status}).`, { fr8desk: codigo });
  return error(502, "FR8DESK_ERROR", "Fr8Desk tuvo un error. Vuelve a intentar en un momento.", { fr8desk: codigo });
}

async function llamar(op: OpcionesFr8Desk, url: string, init: RequestInit): Promise<{ status: number; body: any }> {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), op.timeoutMs ?? 8000);
  try {
    const r = await op.fetch(url, { ...init, signal: control.signal });
    const texto = await r.text();
    let body: any = null;
    try {
      body = texto ? JSON.parse(texto) : null;
    } catch {
      body = null;
    }
    return { status: r.status, body };
  } finally {
    clearTimeout(t);
  }
}

function conLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("tiempo")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
