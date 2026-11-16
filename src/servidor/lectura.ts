// Núcleo de POST /api/lectura: la IA lee la respuesta de un carrier y propone
// la oferta por ruta. Solo con sesión en Rateware. A la IA van el texto pegado
// (sin el correo citado), los archivos que el equipo subió, el nombre del
// carrier y las rutas (origen, destino, equipo): nunca el
// objetivo, otras ofertas ni datos del shipper. No guarda nada y no envía nada.

import {
  aceptarLectura,
  bytesBase64,
  MAX_ADJUNTOS_LECTURA,
  MAX_BYTES_ADJUNTOS,
  MAX_RUTAS_LECTURA,
  MAX_TEXTO_LECTURA,
  MAX_ANEXOS_TEXTO,
  quitarCitado,
  tarifasEnCitado,
  TIPOS_ADJUNTO,
  type AdjuntoLectura,
  type CanalLectura,
  type Lectura,
  type RutaLectura
} from "../dominio/lectura.js";

export interface ConsultaLectura {
  texto: string;
  canal: CanalLectura;
  carrier: string;
  hoy: string;
  rutas: RutaLectura[];
  adjuntos: AdjuntoLectura[];
}

export type Leer = (c: ConsultaLectura) => Promise<unknown>;

export interface Respuesta {
  status: number;
  // recortado: se quitó el correo citado (nuestra invitación) antes de leer.
  body: { lectura: Lectura; recortado: boolean } | { error: string; code: string };
}

const corto = (x: unknown, max: number) => String(x ?? "").trim().slice(0, max);

export async function leerRespuesta(body: any, sesionValida: boolean, leer: Leer | null): Promise<Respuesta> {
  if (!sesionValida) return { status: 401, body: { error: "Inicia sesión para continuar.", code: "SIN_SESION" } };
  const pegado = typeof body?.texto === "string" ? body.texto.trim() : "";
  // No se recorta en silencio por tamaño: una tarifa podría quedar fuera.
  if (pegado.length > MAX_TEXTO_LECTURA) return { status: 400, body: { error: `El texto pasa de ${MAX_TEXTO_LECTURA} caracteres. Pega solo la respuesta del carrier.`, code: "TEXTO_LARGO" } };
  const listados: any[] = Array.isArray(body?.adjuntos) ? body.adjuntos : [];
  if (
    listados.length > MAX_ADJUNTOS_LECTURA ||
    listados.some((a) => !TIPOS_ADJUNTO.includes(a?.tipo) || typeof a?.base64 !== "string" || !a.base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.base64))
  )
    return { status: 400, body: { error: `Sube hasta ${MAX_ADJUNTOS_LECTURA} archivos en PDF, PNG, JPG o WebP.`, code: "ADJUNTOS_INVALIDOS" } };
  if (listados.reduce((n, a) => n + bytesBase64(a.base64), 0) > MAX_BYTES_ADJUNTOS) return { status: 400, body: { error: "Los archivos pasan de 3 MB entre todos. Sube solo la cotización.", code: "ADJUNTOS_GRANDES" } };
  const adjuntos: AdjuntoLectura[] = listados.map((a) => ({ nombre: corto(a.nombre, 120) || "archivo", tipo: a.tipo, base64: a.base64 }));
  // Correos adjuntos (.eml) ya convertidos a texto por Rateware.
  const anexosCrudos: any[] = Array.isArray(body?.anexos) ? body.anexos : [];
  if (anexosCrudos.length > MAX_ANEXOS_TEXTO || anexosCrudos.some((a) => typeof a?.texto !== "string" || a.texto.length > MAX_TEXTO_LECTURA))
    return { status: 400, body: { error: "Los correos adjuntos son demasiado largos. Pega solo la cotización.", code: "ANEXOS_INVALIDOS" } };
  const anexos = anexosCrudos.map((a) => ({ nombre: corto(a.nombre, 120) || "correo adjunto", texto: a.texto.trim() })).filter((a) => a.texto);
  const crudas: any[] = Array.isArray(body?.rutas) ? body.rutas : [];
  // Lo citado (nuestra invitación con el objetivo) no llega a la IA.
  const { texto: propio, recortado, citado } = quitarCitado(pegado);
  const objetivos = crudas.map((r) => ({ id: String(r?.id ?? ""), numero: Number(r?.numero) || 0, origen: "", destino: "", equipo: "", objetivo: typeof r?.objetivo === "number" ? r.objetivo : null }));
  const rescatadas = tarifasEnCitado(citado, objetivos, propio);
  const original = [
    propio,
    rescatadas.length ? `[Cifras que el carrier cambió en la tabla citada del correo]\n${rescatadas.join("\n")}` : "",
    ...anexos.map((a) => `[Correo adjunto «${a.nombre}»]\n${a.texto}`)
  ].filter(Boolean).join("\n\n");
  if (original.length < 3 && !adjuntos.length)
    return { status: 400, body: { error: recortado ? "Solo quedó el correo citado. Pega lo que escribió el carrier o sube su archivo." : "Pega el texto de la respuesta del carrier o sube su archivo.", code: "TEXTO_VACIO" } };
  if (!crudas.length || crudas.length > MAX_RUTAS_LECTURA || crudas.some((r) => typeof r?.id !== "string" || !r.id))
    return { status: 400, body: { error: "Faltan las rutas del evento.", code: "RUTAS_INVALIDAS" } };
  if (!leer) return { status: 503, body: { error: "La IA todavía no está configurada (falta ANTHROPIC_API_KEY en Vercel).", code: "IA_NO_CONFIGURADA" } };
  const rutas: RutaLectura[] = crudas.map((r) => ({ id: r.id, numero: Number(r.numero) || 0, origen: corto(r.origen, 120), destino: corto(r.destino, 120), equipo: corto(r.equipo, 60) }));
  const hoy = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.hoy)) ? String(body.hoy) : new Date().toISOString().slice(0, 10);
  try {
    const cruda = await leer({ texto: original, canal: body?.canal === "whatsapp" ? "whatsapp" : "email", carrier: corto(body?.carrier, 120), hoy, rutas, adjuntos });
    const lectura = aceptarLectura(original, rutas, cruda, adjuntos.length > 0);
    if (rescatadas.length) lectura.dudas.push("Algunas tarifas salen de la tabla citada del correo: compáralas con el correo antes de guardar.");
    return { status: 200, body: { lectura, recortado } };
  } catch {
    return { status: 502, body: { error: "La IA no pudo leer esta respuesta. Captúrala a mano.", code: "IA_FALLO" } };
  }
}
