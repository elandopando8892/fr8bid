// Núcleo de POST /api/documentos: la IA lee los documentos que un carrier o un
// shipper sube desde su liga privada (perfil o solicitud) y propone valores
// para los campos del formulario. La liga es la credencial: el servidor la
// valida con la misma función de Rateware que abre esa página. No guarda los
// archivos, no escribe en Rateware y no envía nada: la persona confirma lo que
// usa y guarda con el botón de siempre.

import {
  aceptarDocumentos,
  bytesBase64,
  camposValidos,
  MAX_ADJUNTOS_DOCUMENTOS,
  MAX_BYTES_DOCUMENTOS,
  MAX_TEXTO_DOCUMENTOS,
  ORIGENES,
  TIPOS_ADJUNTO,
  type AdjuntoLectura,
  type CampoDocumento,
  type LecturaDocumentos,
  type OrigenDocumentos
} from "../dominio/documentos.js";

export interface ConsultaDocumentos {
  origen: OrigenDocumentos;
  idioma: "es" | "en";
  hoy: string;
  texto: string;
  adjuntos: AdjuntoLectura[];
  campos: CampoDocumento[];
  camposRuta: CampoDocumento[];
}

export type LeerDocumentos = (c: ConsultaDocumentos) => Promise<unknown>;
/** true si la liga existe y sigue activa. */
export type ValidarLiga = (origen: OrigenDocumentos, token: string) => Promise<boolean>;

export interface RespuestaDocumentos {
  status: number;
  body: { lectura: LecturaDocumentos } | { error: string; code: string };
}

/** Qué función y acción de Rateware abre cada liga (las mismas que usa su página). */
export const LIGA: Record<OrigenDocumentos, { fn: string; action: string }> = {
  perfil_carrier: { fn: "carrier-profile-api", action: "get_profile" },
  perfil_shipper: { fn: "shipper-profile-api", action: "get_profile" },
  solicitud: { fn: "rfx-bid-api", action: "get_customer_rfi" }
};

// Freno por liga dentro de cada instancia: una liga filtrada no puede gastar IA sin fin.
export const MAX_LECTURAS_POR_HORA = 12;
const usos = new Map<string, number[]>();
export function dentroDelLimite(token: string, ahora = Date.now()): boolean {
  const recientes = (usos.get(token) ?? []).filter((t) => ahora - t < 3_600_000);
  if (recientes.length >= MAX_LECTURAS_POR_HORA) {
    usos.set(token, recientes);
    return false;
  }
  recientes.push(ahora);
  usos.set(token, recientes);
  if (usos.size > 5000) usos.delete(usos.keys().next().value as string);
  return true;
}

const err = (status: number, code: string, es: string, en: string, idioma: "es" | "en"): RespuestaDocumentos => ({
  status,
  body: { error: idioma === "en" ? en : es, code }
});

export async function leerDocumentos(body: any, validar: ValidarLiga, leer: LeerDocumentos | null): Promise<RespuestaDocumentos> {
  const idioma = body?.idioma === "en" ? "en" : "es";
  const origen = ORIGENES.includes(body?.origen) ? (body.origen as OrigenDocumentos) : null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!origen || !token || token.length > 200) return err(400, "LIGA_INVALIDA", "Esta liga no es válida.", "This link is not valid.", idioma);

  const pegado = typeof body?.texto === "string" ? body.texto.trim() : "";
  if (pegado.length > MAX_TEXTO_DOCUMENTOS)
    return err(400, "TEXTO_LARGO", "El texto es demasiado largo. Pega solo la parte que importa.", "The text is too long. Paste only the part that matters.", idioma);
  const listados: any[] = Array.isArray(body?.adjuntos) ? body.adjuntos : [];
  if (
    listados.length > MAX_ADJUNTOS_DOCUMENTOS ||
    listados.some((a) => !TIPOS_ADJUNTO.includes(a?.tipo) || typeof a?.base64 !== "string" || !a.base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.base64))
  )
    return err(400, "ADJUNTOS_INVALIDOS", `Sube hasta ${MAX_ADJUNTOS_DOCUMENTOS} archivos en PDF, PNG, JPG o WebP.`, `Upload up to ${MAX_ADJUNTOS_DOCUMENTOS} files as PDF, PNG, JPG or WebP.`, idioma);
  if (listados.reduce((n, a) => n + bytesBase64(a.base64), 0) > MAX_BYTES_DOCUMENTOS)
    return err(400, "ADJUNTOS_GRANDES", "Los archivos pasan de 3 MB entre todos. Sube menos páginas o una foto más ligera.", "The files add up to more than 3 MB. Upload fewer pages or a lighter photo.", idioma);
  if (pegado.length < 3 && !listados.length)
    return err(400, "SIN_DOCUMENTOS", "Sube un documento o pega el texto.", "Upload a document or paste the text.", idioma);

  const campos = Array.isArray(body?.campos) && body.campos.length ? camposValidos(body.campos) : [];
  const camposRuta = Array.isArray(body?.camposRuta) && body.camposRuta.length ? camposValidos(body.camposRuta) : [];
  if (!campos || !camposRuta || (!campos.length && !camposRuta.length) || (origen === "solicitud") !== camposRuta.length > 0)
    return err(400, "CAMPOS_INVALIDOS", "El formulario no se pudo preparar. Recarga la página.", "The form could not be prepared. Reload the page.", idioma);

  let valida = false;
  try {
    valida = await validar(origen, token);
  } catch {
    valida = false;
  }
  if (!valida)
    return err(401, "LIGA_INACTIVA", "Esta liga ya no está activa. Pide una nueva a tu contacto en MARKSMAN.", "This link is no longer active. Ask your MARKSMAN contact for a new one.", idioma);
  if (!leer) return err(503, "IA_NO_CONFIGURADA", "La lectura automática no está disponible. Llena los datos a mano.", "Automatic reading is not available. Fill in the details by hand.", idioma);
  if (!dentroDelLimite(token))
    return err(429, "DEMASIADAS_LECTURAS", "Ya leímos muchos documentos con esta liga. Intenta en una hora o llena los datos a mano.", "We have read many documents with this link. Try again in an hour or fill in the details by hand.", idioma);

  const adjuntos: AdjuntoLectura[] = listados.map((a) => ({ nombre: String(a.nombre ?? "").trim().slice(0, 120) || "archivo", tipo: a.tipo, base64: a.base64 }));
  const hoy = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.hoy)) ? String(body.hoy) : new Date().toISOString().slice(0, 10);
  try {
    const cruda = await leer({ origen, idioma, hoy, texto: pegado, adjuntos, campos, camposRuta });
    return { status: 200, body: { lectura: aceptarDocumentos(cruda, campos, camposRuta, adjuntos.length ? undefined : pegado) } };
  } catch {
    return err(502, "IA_FALLO", "No pudimos leer estos documentos. Intenta con otro archivo o llena los datos a mano.", "We couldn't read these documents. Try another file or fill in the details by hand.", idioma);
  }
}

/** Valida la liga llamando a la función de Rateware que abre esa página (sin sesión: el token es la credencial). */
export function validarConRateware(base: string, anon: string): ValidarLiga {
  return async (origen, token) => {
    const { fn, action } = LIGA[origen];
    const r = await fetch(`${base.replace(/\/$/, "")}/functions/v1/${fn}`, {
      method: "POST",
      headers: { apikey: anon, "content-type": "application/json" },
      body: JSON.stringify({ action, token }),
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return false;
    return ligaActiva(origen, await r.json().catch(() => null));
  };
}

const INACTIVA = ["expired", "revoked", "cancelled", "canceled", "inactive"];

/**
 * Un 200 no basta: la respuesta debe traer lo que esa página abre (perfil o
 * solicitud) y una liga que no esté vencida, revocada ni caducada.
 */
export function ligaActiva(origen: OrigenDocumentos, datos: any, ahora = Date.now()): boolean {
  if (!datos || typeof datos !== "object" || datos.error || datos.ok === false) return false;
  const esObjeto = (x: unknown) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
  const liga = origen === "solicitud" ? datos.link : datos.request;
  const abre = origen === "perfil_carrier" ? datos.vendor : origen === "perfil_shipper" ? datos.shipper : datos.project;
  if (!esObjeto(liga) || !esObjeto(abre) || typeof liga.id !== "string" || !liga.id) return false;
  if (INACTIVA.includes(String(liga.status ?? "").toLowerCase())) return false;
  const vence = liga.expires_at ? Date.parse(String(liga.expires_at)) : NaN;
  return Number.isNaN(vence) || vence > ahora;
}
