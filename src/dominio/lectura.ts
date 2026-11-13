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
  // Solo para comparar en el servidor con la tabla citada del correo; nunca llega a la IA.
  objetivo?: number | null;
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

export function quitarCitado(original: string): { texto: string; recortado: boolean; citado: string } {
  const lineas = original.split(/\r?\n/);
  let corte = -1;
  for (let i = 0; i < lineas.length && corte < 0; i++) {
    if (INICIO_CITA.some((r) => r.test(lineas[i]))) corte = i;
    // Gmail parte «El lun, 9 nov… escribió:» en dos o tres renglones.
    else if (ENCABEZADO_CITA.test(lineas[i]) && [0, 1, 2].some((k) => FIN_ENCABEZADO_CITA.test(lineas[i + k] ?? ""))) corte = i;
  }
  if (corte < 0) return { texto: original.trim(), recortado: false, citado: "" };
  return { texto: lineas.slice(0, corte).join("\n").trim(), recortado: true, citado: lineas.slice(corte).join("\n") };
}

const AVISA_OFERTA = /propuesta|cotizaci|tarifa|rate|quote|oferta|precio|adjunt/i;

// Algunos carriers contestan editando la tabla citada: cambian la columna donde
// iba nuestro objetivo por su tarifa (JPI en O-I). Se rescatan solo las cifras
// que NO coinciden con el objetivo de esa ruta, y solo si el carrier avisa que
// manda una propuesta; el objetivo mismo nunca sale de aquí. Sin objetivo
// conocido no se puede distinguir y no se rescata nada.
export function tarifasEnCitado(citado: string, rutas: RutaLectura[], propio: string): string[] {
  if (!citado || !AVISA_OFERTA.test(propio)) return [];
  const bloques: { n: number; texto: string }[] = [];
  let actual: { n: number; texto: string } | null = null;
  for (const cruda of citado.split(/\r?\n/)) {
    const linea = cruda.replace(/^\s*(>\s*)+/, "");
    const fila = linea.match(/^(\d{1,2})\t/);
    if (fila) {
      if (actual) bloques.push(actual);
      actual = { n: Number(fila[1]), texto: linea };
    } else if (actual) {
      if (linea.trim() === "") {
        bloques.push(actual);
        actual = null;
      } else actual.texto += ` ${linea}`;
    }
  }
  if (actual) bloques.push(actual);
  const vistas = new Set<number>();
  const salida: string[] = [];
  for (const b of bloques) {
    const ruta = rutas.find((r) => r.numero === b.n);
    if (!ruta || vistas.has(b.n) || typeof ruta.objetivo !== "number") continue;
    const monto = b.texto.match(/(\d[\d.,]*)\s*(USD|MXN)\s*$/i);
    if (!monto) continue;
    const valor = Number(monto[1].replace(/,(?=\d{3}(\D|$))/g, ""));
    if (!Number.isFinite(valor) || valor <= 0 || valor === ruta.objetivo) continue;
    vistas.add(b.n);
    salida.push(`Ruta ${b.n}: ${monto[1]} ${monto[2].toUpperCase()}`);
  }
  return salida;
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

// Correo del carrier que Rateware trae de Gmail (get_rfx_carrier_reply,
// 13-nov-2026): llena el texto y los archivos sin pegar ni descargar nada.
// Solo pasan PDF e imágenes dentro de los límites de la lectura; lo demás se
// nombra para que el equipo sepa qué no leyó la IA (por ejemplo, un Excel).
export interface AnexoTexto {
  nombre: string;
  texto: string;
}
export const MAX_ANEXOS_TEXTO = 3;

export interface CorreoTraido {
  texto: string;
  // Correos adjuntos (.eml) que Rateware ya convirtió a texto.
  anexos: AnexoTexto[];
  adjuntos: AdjuntoLectura[];
  omitidos: string[];
  de: string | null;
  asunto: string | null;
  en: string | null;
}

export function correoParaLectura(crudo: any): CorreoTraido {
  const omitidos: string[] = (Array.isArray(crudo?.skipped_attachments) ? crudo.skipped_attachments : []).map((a: any) => texto(a?.filename, 120) || "archivo");
  const adjuntos: AdjuntoLectura[] = [];
  let bytes = 0;
  for (const a of Array.isArray(crudo?.attachments) ? crudo.attachments : []) {
    const nombre = texto(a?.filename, 120) || "archivo";
    const b64 = typeof a?.base64 === "string" ? a.base64 : "";
    const tamano = bytesBase64(b64);
    if (!TIPOS_ADJUNTO.includes(a?.mime_type) || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || adjuntos.length >= MAX_ADJUNTOS_LECTURA || bytes + tamano > MAX_BYTES_ADJUNTOS) {
      omitidos.push(nombre);
      continue;
    }
    bytes += tamano;
    adjuntos.push({ nombre, tipo: a.mime_type, base64: b64 });
  }
  const anexos: AnexoTexto[] = (Array.isArray(crudo?.attached_emails) ? crudo.attached_emails : [])
    .map((a: any) => ({ nombre: texto(a?.filename, 120) || "correo adjunto", texto: typeof a?.text === "string" ? a.text.trim().slice(0, MAX_TEXTO_LECTURA) : "" }))
    .filter((a: AnexoTexto) => a.texto)
    .slice(0, MAX_ANEXOS_TEXTO);
  return {
    texto: typeof crudo?.text === "string" ? crudo.text.slice(0, MAX_TEXTO_LECTURA) : "",
    anexos,
    adjuntos,
    omitidos,
    de: texto(crudo?.from, 200) || null,
    asunto: texto(crudo?.subject, 300) || null,
    en: texto(crudo?.at, 40) || null
  };
}
