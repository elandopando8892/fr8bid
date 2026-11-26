// Perfiles y solicitudes que leen documentos (prioridad 8, 26-nov).
//
// El carrier o el shipper sube su constancia, W-9, autoridad MC, póliza o su
// correo/Excel de rutas desde su liga privada; la IA propone valores para los
// campos del formulario y la persona confirma cuáles usa. Aquí vive lo que el
// navegador y el servidor comparten: los límites, la forma de la lectura y la
// regla que acepta solo lo que el formulario conoce. Nada se guarda aquí: la
// persona guarda con el botón de siempre.

import { bytesBase64, TIPOS_ADJUNTO, type AdjuntoLectura } from "./lectura.js";

export { bytesBase64, TIPOS_ADJUNTO };
export type { AdjuntoLectura };

/** De dónde viene la lectura: cada liga se valida contra su propia función de Rateware. */
export type OrigenDocumentos = "perfil_carrier" | "perfil_shipper" | "solicitud";
export const ORIGENES: OrigenDocumentos[] = ["perfil_carrier", "perfil_shipper", "solicitud"];

/** Campo que el formulario ofrece a la lectura. «lista» = varias opciones (casillas). */
export interface CampoDocumento {
  clave: string;
  etiqueta: string;
  tipo: "texto" | "opcion" | "lista";
  opciones?: string[];
  /** Pista breve para la IA (formato, unidad). */
  nota?: string;
}

/** Lo que la IA leyó para un campo, ya aceptado contra el formulario. */
export interface ValorLeido {
  clave: string;
  /** Texto u opción: un elemento. Lista: los que coinciden con las opciones. */
  valores: string[];
  /** De dónde salió: archivo y renglón tal cual. */
  cita: string;
}

export interface LecturaDocumentos {
  resumen: string;
  campos: ValorLeido[];
  /** Solo en la solicitud: una entrada por ruta, con sus campos. */
  rutas: { campos: ValorLeido[] }[];
  dudas: string[];
}

export const MAX_ADJUNTOS_DOCUMENTOS = 4;
// Entre todos. Vercel corta el cuerpo en 4.5 MB y base64 crece un tercio.
export const MAX_BYTES_DOCUMENTOS = 3_000_000;
// Texto pegado o la hoja de Excel convertida a CSV.
export const MAX_TEXTO_DOCUMENTOS = 30_000;
export const MAX_CAMPOS_DOCUMENTOS = 80;
export const MAX_RUTAS_DOCUMENTOS = 60;
export const MAX_VALOR = 600;

const CLAVE = /^[a-z][a-z0-9_]{0,40}(\.[a-z][a-z0-9_]{0,40})?$/;
const texto = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
const plano = (x: string) =>
  x
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Los campos que manda el navegador, limpios. null si no sirven. */
export function camposValidos(crudos: unknown): CampoDocumento[] | null {
  if (!Array.isArray(crudos) || !crudos.length || crudos.length > MAX_CAMPOS_DOCUMENTOS) return null;
  const vistos = new Set<string>();
  const salida: CampoDocumento[] = [];
  for (const c of crudos as any[]) {
    const clave = typeof c?.clave === "string" ? c.clave : "";
    const tipo = c?.tipo === "opcion" || c?.tipo === "lista" ? c.tipo : c?.tipo === "texto" ? "texto" : null;
    if (!CLAVE.test(clave) || vistos.has(clave) || !tipo) return null;
    const opciones = Array.isArray(c?.opciones) ? c.opciones.map((o: unknown) => texto(o, 80)).filter(Boolean).slice(0, 40) : [];
    if (tipo !== "texto" && !opciones.length) return null;
    vistos.add(clave);
    salida.push({ clave, etiqueta: texto(c?.etiqueta, 120) || clave, tipo, ...(tipo !== "texto" ? { opciones } : {}), ...(c?.nota ? { nota: texto(c.nota, 160) } : {}) });
  }
  return salida;
}

/** Una opción del formulario a partir de lo que escribió la IA (mayúsculas y acentos no cuentan). */
export function opcionDe(campo: CampoDocumento, valor: string): string | null {
  const buscado = plano(valor);
  if (!buscado) return null;
  return campo.opciones?.find((o) => plano(o) === buscado) ?? null;
}

const compacto = (x: string) => plano(x).replace(/ /g, "");

/**
 * ¿La cita sale de verdad del texto? Se compara sin acentos, mayúsculas,
 * espacios ni puntuación; un «archivo: …» al inicio y los «…» de en medio se
 * toleran. Sin texto de referencia (solo PDF o fotos) no hay contra qué.
 */
export function citaEnTexto(cita: string, fuente: string): boolean {
  const base = compacto(fuente);
  const sinArchivo = cita.includes(":") ? cita.slice(cita.indexOf(":") + 1) : cita;
  return [cita, sinArchivo].some((c) => {
    const trozos = c.split(/\.\.\.|…/).map(compacto).filter(Boolean);
    return trozos.length > 0 && trozos.every((t) => base.includes(t));
  });
}

/** «40,000» y «40.000» son miles; «1.5» y «1,5» son decimales: nunca se confunden con «15». */
function aNumero(texto: string): number | null {
  const t = texto.replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const n = /^\d{1,3}([.,]\d{3})+$/.test(t) ? Number(t.replace(/[.,]/g, "")) : Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const CONTEXTO: Record<string, RegExp> = {
  // La cifra tiene que contar cargas: «5 semanas» es una duración, no un volumen.
  loads: /carga|load|viaje|trip|camion|truck|embarque|shipment|envio|unidades/,
  weight: /\b(lb|lbs|kg|kgs|libra|kilo|ton|tons|tonelada|peso|weight)/,
  annual_volume: /ano|anual|year|annual/,
};

const MESES = ["ene|jan", "feb", "mar", "abr|apr", "may", "jun", "jul", "ago|aug", "sep|set", "oct", "nov", "dic|dec"];

/** La fecha propuesta está en la cita: el día, el mes (número o nombre) y, si viene, el año. */
function fechaEnCita(ano: number, mes: number, dia: number, cita: string): boolean {
  // AAAA-MM-DD no tiene ambigüedad.
  const iso = (cita.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g) ?? []).map((f) => f.split("-").map(Number));
  if (iso.length) return iso.some(([a, m, d]) => a === ano && m === mes && d === dia);
  const c = plano(cita);
  const nums = (c.match(/\d+/g) ?? []).map(Number);
  // «15/12/25»: el año va en la tercera posición; se lee antes de quitar las barras.
  const cortos = [...cita.matchAll(/\b\d{1,2}[/.-]\d{1,2}[/.-](\d{2})\b/g)].map((m) => Number(m[1]));
  if (!nums.includes(dia)) return false;
  const conNombre = new RegExp(`\\b(${MESES[mes - 1]})`).test(c);
  const conNumero = nums.filter((n) => n === mes).length > (mes === dia ? 1 : 0);
  if (!conNombre && !conNumero) return false;
  // «12/01/2026» puede ser 12 de enero o 1 de diciembre: sin el nombre del mes, no se adivina.
  if (!conNombre && dia !== mes && dia <= 12 && mes <= 12) return false;
  const anos = [...nums.filter((n) => n >= 1000), ...cortos];
  return !anos.length || anos.some((n) => n === ano || n === ano % 100);
}

const numerosDe = (texto: string) => (texto.match(/\d[\d.,]*\d|\d/g) ?? []).map(aNumero).sort((a, b) => (a ?? 0) - (b ?? 0));

/**
 * ¿La cita respalda el valor? Las cifras del valor (cargas, peso, RFC,
 * dirección) son exactamente las de la cita, sin números de más: «5» o
 * «5 cargas» no pasan con «15 cargas» ni con «Ruta 5: 15 cargas». Además, al
 * menos una palabra con sustancia del valor aparece en la cita. Las fechas
 * (AAAA-MM-DD) se dejan pasar.
 */
export function citaRespalda(valor: string, cita: string, clave = ""): boolean {
  const fecha = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (fecha) return fechaEnCita(Number(fecha[1]), Number(fecha[2]), Number(fecha[3]), cita);
  // Una cifra sola necesita decir qué cuenta: «Ruta 5» no es un volumen.
  const campo = clave.split(".").pop() ?? "";
  const contexto = CONTEXTO[campo];
  if (contexto && !contexto.test(plano(cita))) return false;
  // Un volumen al mes, al día o al año no es «por semana»: se queda para notas.
  if (campo === "loads" && /\b(mes|mensual|month|monthly|dia|diario|diarias|daily|ano|anual|year|annual)\b/.test(plano(cita))) return false;
  // El «archivo.txt:» del inicio no cuenta como cifra de la cita.
  const sinArchivo = cita.replace(/^[^:\n]{1,120}\.[a-z0-9]{2,5}:\s*/i, "");
  if (/\d/.test(valor)) {
    const delValor = numerosDe(valor);
    const deLaCita = numerosDe(sinArchivo);
    if (delValor.some((n) => n === null) || delValor.length !== deLaCita.length || delValor.some((n, i) => n !== deLaCita[i])) return false;
  }
  const piezas = plano(valor.replace(/\d[\d.,]*/g, " ")).split(" ").filter((p) => p.length >= 3);
  if (!piezas.length) return true;
  const enCita = compacto(cita);
  return piezas.some((p) => enCita.includes(p)) || enCita.includes(compacto(valor));
}

function valoresDe(crudos: unknown, campos: CampoDocumento[], fuente?: string): ValorLeido[] {
  const porClave = new Map(campos.map((c) => [c.clave, c]));
  const salida = new Map<string, ValorLeido>();
  for (const v of Array.isArray(crudos) ? (crudos as any[]) : []) {
    const campo = porClave.get(typeof v?.clave === "string" ? v.clave : "");
    if (!campo || salida.has(campo.clave)) continue;
    const brutos: string[] = (Array.isArray(v?.valores) ? v.valores : [v?.valor]).map((x: unknown) => texto(x, MAX_VALOR)).filter(Boolean);
    const valores =
      campo.tipo === "texto"
        ? brutos.slice(0, 1)
        : [...new Set(brutos.map((b) => opcionDe(campo, b)).filter((x): x is string => Boolean(x)))].slice(0, campo.tipo === "opcion" ? 1 : 40);
    // Sin la cita literal de donde sale, no es un dato leído sino uno supuesto.
    const cita = texto(v?.cita, 240);
    if (!valores.length || !cita) continue;
    if (fuente !== undefined && (!citaEnTexto(cita, fuente) || (campo.tipo === "texto" && !citaRespalda(valores[0], cita, campo.clave)))) continue;
    salida.set(campo.clave, { clave: campo.clave, valores, cita });
  }
  return [...salida.values()];
}

/**
 * Acepta la respuesta cruda de la IA contra los campos que el formulario
 * ofreció: claves desconocidas, opciones que no existen y valores vacíos se
 * quedan fuera. Lo que no se pudo leer no se inventa. Con `fuente` (todo
 * llegó como texto) cada cita tiene que aparecer en ese texto.
 */
export function aceptarDocumentos(cruda: any, campos: CampoDocumento[], camposRuta: CampoDocumento[], fuente?: string): LecturaDocumentos {
  const rutas = camposRuta.length
    ? (Array.isArray(cruda?.rutas) ? (cruda.rutas as any[]) : [])
        .slice(0, MAX_RUTAS_DOCUMENTOS)
        .map((r) => ({ campos: valoresDe(r?.campos, camposRuta, fuente) }))
        .filter((r) => r.campos.length > 0)
    : [];
  return {
    resumen: texto(cruda?.resumen, 300),
    campos: campos.length ? valoresDe(cruda?.campos, campos, fuente) : [],
    rutas,
    dudas: (Array.isArray(cruda?.dudas) ? cruda.dudas : []).map((d: unknown) => texto(d, 240)).filter(Boolean).slice(0, 8),
  };
}

/** El valor guardado y el leído dicen lo mismo (para no proponer lo que ya está). */
export function mismoValor(actual: string | string[] | undefined, leido: string[]): boolean {
  const a = (Array.isArray(actual) ? actual : actual ? [actual] : []).map(plano).filter(Boolean).sort();
  const b = leido.map(plano).filter(Boolean).sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
