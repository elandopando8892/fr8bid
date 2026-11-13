// Núcleo de POST /api/lectura: la IA lee la respuesta de un carrier y propone
// la oferta por ruta. Solo con sesión en Rateware. A la IA van el texto pegado,
// el nombre del carrier y las rutas (origen, destino, equipo): nunca el
// objetivo, otras ofertas ni datos del shipper. No guarda nada y no envía nada.

import { aceptarLectura, MAX_RUTAS_LECTURA, MAX_TEXTO_LECTURA, type CanalLectura, type Lectura, type RutaLectura } from "../dominio/lectura.js";

export interface ConsultaLectura {
  texto: string;
  canal: CanalLectura;
  carrier: string;
  hoy: string;
  rutas: RutaLectura[];
}

export type Leer = (c: ConsultaLectura) => Promise<unknown>;

export interface Respuesta {
  status: number;
  body: { lectura: Lectura } | { error: string; code: string };
}

const corto = (x: unknown, max: number) => String(x ?? "").trim().slice(0, max);

export async function leerRespuesta(body: any, sesionValida: boolean, leer: Leer | null): Promise<Respuesta> {
  if (!sesionValida) return { status: 401, body: { error: "Inicia sesión para continuar.", code: "SIN_SESION" } };
  const original = typeof body?.texto === "string" ? body.texto.trim() : "";
  if (original.length < 3) return { status: 400, body: { error: "Pega el texto de la respuesta del carrier.", code: "TEXTO_VACIO" } };
  // No se recorta en silencio: una tarifa podría quedar fuera.
  if (original.length > MAX_TEXTO_LECTURA) return { status: 400, body: { error: `El texto pasa de ${MAX_TEXTO_LECTURA} caracteres. Pega solo la respuesta del carrier.`, code: "TEXTO_LARGO" } };
  const crudas: any[] = Array.isArray(body?.rutas) ? body.rutas : [];
  if (!crudas.length || crudas.length > MAX_RUTAS_LECTURA || crudas.some((r) => typeof r?.id !== "string" || !r.id))
    return { status: 400, body: { error: "Faltan las rutas del evento.", code: "RUTAS_INVALIDAS" } };
  if (!leer) return { status: 503, body: { error: "La IA todavía no está configurada (falta ANTHROPIC_API_KEY en Vercel).", code: "IA_NO_CONFIGURADA" } };
  const rutas: RutaLectura[] = crudas.map((r) => ({ id: r.id, numero: Number(r.numero) || 0, origen: corto(r.origen, 120), destino: corto(r.destino, 120), equipo: corto(r.equipo, 60) }));
  const hoy = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.hoy)) ? String(body.hoy) : new Date().toISOString().slice(0, 10);
  try {
    const cruda = await leer({ texto: original, canal: body?.canal === "whatsapp" ? "whatsapp" : "email", carrier: corto(body?.carrier, 120), hoy, rutas });
    return { status: 200, body: { lectura: aceptarLectura(original, rutas, cruda) } };
  } catch {
    return { status: 502, body: { error: "La IA no pudo leer esta respuesta. Captúrala a mano.", code: "IA_FALLO" } };
  }
}
