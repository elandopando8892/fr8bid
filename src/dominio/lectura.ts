// Lectura con IA de la respuesta de un carrier que llegó por correo o WhatsApp
// (pedido de Jose del 12-nov-2026). La IA solo PROPONE: lo que sale de aquí es
// un borrador que el equipo revisa y confirma en la página del evento. Regla de
// integridad: una tarifa que no aparece tal cual en el texto no se propone.

export type TipoLectura = "oferta" | "rechazo" | "pregunta" | "otro";
export type CanalLectura = "email" | "whatsapp";

// Lo único del evento que viaja a la IA: nunca el objetivo ni otras ofertas.
export interface RutaLectura {
  id: string;
  numero: number;
  origen: string;
  destino: string;
  equipo: string;
}

export interface OfertaLeida {
  rutaId: string;
  tarifa: number | null;
  moneda: "USD" | "MXN" | null;
  vigencia: string | null; // AAAA-MM-DD
  capacidadSemanal: number | null;
  diasTransito: number | null;
  notas: string;
  cita: string; // fragmento del texto de donde salió
  dudas: string[];
}

export interface Lectura {
  tipo: TipoLectura;
  resumen: string;
  ofertas: OfertaLeida[];
  dudas: string[];
}

export const MAX_TEXTO_LECTURA = 12000;
export const MAX_RUTAS_LECTURA = 60;

// Lo que el carrier adjuntó (su cotización en PDF o una captura de pantalla).
export const TIPOS_ADJUNTO = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export type TipoAdjunto = (typeof TIPOS_ADJUNTO)[number];
export interface AdjuntoLectura {
  nombre: string;
  tipo: TipoAdjunto;
  base64: string;
}
export const MAX_ADJUNTOS_LECTURA = 4;
// Entre todos. Vercel corta el cuerpo en 4.5 MB y base64 crece un tercio.
export const MAX_BYTES_ADJUNTOS = 3_000_000;

export const bytesBase64 = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

// Una respuesta de correo trae citada nuestra invitación, con la columna
// «Objetivo»: esos importes son de Marksman, no del carrier, y no deben llegar
// a la IA. Se corta en la primera marca de cita.
const INICIO_CITA = [
  /^\s*>/,
  /^\s*_{8,}\s*$/,
  /^\s*-{2,}\s*(original message|mensaje original|forwarded message|mensaje reenviado)/i,
  /^\s*(from|de):\s.*\S+@\S+/i
];
const ENCABEZADO_CITA = /^\s*(el|on)\s.+/i;
const FIN_ENCABEZADO_CITA = /(escribi[oó]|wrote):?\s*$/i;

export function quitarCitado(original: string): { texto: string; recortado: boolean } {
  const lineas = original.split(/\r?\n/);
  let corte = -1;
  for (let i = 0; i < lineas.length && corte < 0; i++) {
    if (INICIO_CITA.some((r) => r.test(lineas[i]))) corte = i;
    // Gmail parte «El lun, 9 nov… escribió:» en dos o tres renglones.
    else if (ENCABEZADO_CITA.test(lineas[i]) && [0, 1, 2].some((k) => FIN_ENCABEZADO_CITA.test(lineas[i + k] ?? ""))) corte = i;
  }
  if (corte < 0) return { texto: original.trim(), recortado: false };
  return { texto: lineas.slice(0, corte).join("\n").trim(), recortado: true };
}

const TIPOS: TipoLectura[] = ["oferta", "rechazo", "pregunta", "otro"];

const texto = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

function positivo(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null;
}

function fechaValida(x: unknown): string | null {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return null;
  const d = new Date(`${x}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== x ? null : x;
}

// «2,350», «2.350», «2 350» y «$2350.00» son el mismo número escrito distinto:
// se quitan los separadores de miles (seguidos de tres dígitos) antes de buscar.
export function tarifaEnTexto(tarifa: number, original: string): boolean {
  const entero = String(Math.trunc(tarifa));
  const pegado = original.replace(/(\d)[,.\u00a0 ](?=\d{3}(\D|$))/g, "$1");
  // No basta con que los dígitos estén dentro de otro número más largo.
  return new RegExp(`(^|\\D)${entero}(\\D|$)`).test(pegado);
}

// Limpia lo que devolvió la IA. Todo lo que no se puede sostener con el texto o
// con las rutas del evento se quita y se avisa en `dudas`.
// Con adjuntos la tarifa puede venir del archivo: no se puede comprobar contra
// el texto, así que se propone y se pide compararla con el archivo.
export function aceptarLectura(original: string, rutas: RutaLectura[], cruda: any, conAdjuntos = false): Lectura {
  const dudas: string[] = (Array.isArray(cruda?.dudas) ? cruda.dudas : []).map((x: unknown) => texto(x, 200)).filter(Boolean).slice(0, 8);
  const porId = new Map(rutas.map((r) => [r.id, r]));
  const vistas = new Set<string>();
  const ofertas: OfertaLeida[] = [];
  for (const o of Array.isArray(cruda?.ofertas) ? cruda.ofertas : []) {
    const ruta = porId.get(String(o?.ruta_id ?? ""));
    if (!ruta) {
      dudas.push("La IA propuso una ruta que no es de este evento; se descartó.");
      continue;
    }
    if (vistas.has(ruta.id)) {
      dudas.push(`La IA propuso más de una tarifa para la ruta ${ruta.numero}; revisa el texto.`);
      continue;
    }
    vistas.add(ruta.id);
    const propias: string[] = (Array.isArray(o?.dudas) ? o.dudas : []).map((x: unknown) => texto(x, 200)).filter(Boolean).slice(0, 5);
    let tarifa = positivo(o?.tarifa);
    if (tarifa !== null && !tarifaEnTexto(tarifa, original)) {
      if (conAdjuntos) propias.push("La tarifa sale del archivo adjunto: compárala con el archivo antes de guardar.");
      else {
        propias.push(`La IA propuso ${tarifa}, pero ese número no aparece en el texto: captúralo a mano.`);
        tarifa = null;
      }
    }
    const moneda = o?.moneda === "USD" || o?.moneda === "MXN" ? o.moneda : null;
    if (tarifa !== null && !moneda) propias.push("El texto no dice la moneda.");
    if (o?.vigencia && !fechaValida(o.vigencia)) propias.push("La vigencia no se pudo leer como fecha.");
    ofertas.push({
      rutaId: ruta.id,
      tarifa,
      moneda,
      vigencia: fechaValida(o?.vigencia),
      capacidadSemanal: positivo(o?.capacidad_semanal),
      diasTransito: positivo(o?.dias_transito),
      notas: texto(o?.notas, 500),
      cita: texto(o?.cita, 300),
      dudas: propias
    });
  }
  let tipo: TipoLectura = TIPOS.includes(cruda?.tipo) ? cruda.tipo : "otro";
  // Sin una sola tarifa sostenida por el texto no es una oferta capturable.
  if (tipo === "oferta" && !ofertas.some((o) => o.tarifa !== null)) {
    dudas.push(conAdjuntos ? "No se encontró una tarifa clara en el texto ni en los archivos." : "No se encontró una tarifa clara en el texto.");
    if (!ofertas.length) tipo = "otro";
  }
  return { tipo, resumen: texto(cruda?.resumen, 400), ofertas, dudas };
}
