import {
  bytesBase64,
  MAX_ADJUNTOS_DOCUMENTOS,
  MAX_BYTES_DOCUMENTOS,
  MAX_TEXTO_DOCUMENTOS,
  TIPOS_ADJUNTO,
  type AdjuntoLectura,
  type CampoDocumento,
  type LecturaDocumentos,
  type OrigenDocumentos,
} from "../../../dominio/documentos";

export type Lang = "es" | "en";

/** Lo que la persona eligió: PDFs y fotos viajan como archivo; Excel, CSV y texto como texto. */
export interface Elegido {
  nombre: string;
  adjunto?: AdjuntoLectura;
  texto?: string;
  /** El archivo original, para que la solicitud pruebe primero nuestra plantilla. */
  archivo: File;
}

const HOJA = /\.(xlsx|xls|csv)$/i;
const TEXTO = /\.(txt|eml)$/i;
export const ACEPTA = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.txt,.eml";

function base64De(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

/** Un archivo elegido, listo para la lectura. Error en el idioma de la persona si no se puede leer. */
export async function prepararArchivo(archivo: File, lang: Lang): Promise<Elegido> {
  const tipo = archivo.type === "image/jpg" ? "image/jpeg" : archivo.type;
  if ((TIPOS_ADJUNTO as readonly string[]).includes(tipo)) {
    return { nombre: archivo.name, archivo, adjunto: { nombre: archivo.name, tipo: tipo as AdjuntoLectura["tipo"], base64: base64De(await archivo.arrayBuffer()) } };
  }
  if (HOJA.test(archivo.name)) {
    const XLSX = await import("xlsx");
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
    const hojas = libro.SheetNames.map((nombre) => {
      const csv = XLSX.utils.sheet_to_csv(libro.Sheets[nombre], { blankrows: false }).trim();
      return csv ? `[Hoja «${nombre}»]\n${csv}` : "";
    }).filter(Boolean);
    return { nombre: archivo.name, archivo, texto: `[Archivo «${archivo.name}»]\n${hojas.join("\n\n")}` };
  }
  if (TEXTO.test(archivo.name) || archivo.type.startsWith("text/")) {
    return { nombre: archivo.name, archivo, texto: `[Archivo «${archivo.name}»]\n${await archivo.text()}` };
  }
  throw new Error(
    lang === "en"
      ? `«${archivo.name}» can't be read. Use PDF, a photo (PNG, JPG), Excel or CSV.`
      : `«${archivo.name}» no se puede leer. Usa PDF, una foto (PNG, JPG), Excel o CSV.`,
  );
}

/** Revisa límites antes de mandar, para decirlo en palabras de la persona y no con un error del servidor. */
export function problemaDeTamano(elegidos: Elegido[], pegado: string, lang: Lang): string | null {
  const adjuntos = elegidos.filter((e) => e.adjunto);
  if (adjuntos.length > MAX_ADJUNTOS_DOCUMENTOS)
    return lang === "en" ? `Upload up to ${MAX_ADJUNTOS_DOCUMENTOS} PDFs or photos at a time.` : `Sube hasta ${MAX_ADJUNTOS_DOCUMENTOS} PDF o fotos a la vez.`;
  if (adjuntos.reduce((n, e) => n + bytesBase64(e.adjunto!.base64), 0) > MAX_BYTES_DOCUMENTOS)
    return lang === "en" ? "The files add up to more than 3 MB. Upload fewer pages or a lighter photo." : "Los archivos pasan de 3 MB entre todos. Sube menos páginas o una foto más ligera.";
  if (textoTotal(elegidos, pegado).length > MAX_TEXTO_DOCUMENTOS)
    return lang === "en" ? "The text is too long. Paste or upload only the part that matters." : "El texto es demasiado largo. Pega o sube solo la parte que importa.";
  return null;
}

export const textoTotal = (elegidos: Elegido[], pegado: string) =>
  [pegado.trim(), ...elegidos.map((e) => e.texto ?? "")].filter(Boolean).join("\n\n");

export interface PedidoLectura {
  origen: OrigenDocumentos;
  token: string;
  idioma: Lang;
  elegidos: Elegido[];
  pegado: string;
  campos: CampoDocumento[];
  camposRuta?: CampoDocumento[];
}

/** POST /api/documentos. Solo propone: nada se guarda hasta que la persona guarda. */
export async function leerDocumentos(p: PedidoLectura): Promise<LecturaDocumentos> {
  let r: Response;
  try {
    r = await fetch("/api/documentos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        origen: p.origen,
        token: p.token,
        idioma: p.idioma,
        hoy: new Date().toLocaleDateString("en-CA"),
        texto: textoTotal(p.elegidos, p.pegado),
        adjuntos: p.elegidos.flatMap((e) => (e.adjunto ? [e.adjunto] : [])),
        campos: p.campos,
        camposRuta: p.camposRuta ?? [],
      }),
    });
  } catch {
    throw new Error(p.idioma === "en" ? "No connection. Check your internet and try again." : "Sin conexión. Revisa tu internet y vuelve a intentar.");
  }
  const datos = await r.json().catch(() => null);
  if (!r.ok || !datos?.lectura) {
    throw new Error(
      datos?.error ||
        (p.idioma === "en" ? "We couldn't read these documents. Fill in the details by hand." : "No pudimos leer estos documentos. Llena los datos a mano."),
    );
  }
  return datos.lectura as LecturaDocumentos;
}
