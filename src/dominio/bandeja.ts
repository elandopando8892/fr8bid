// Bandeja de respuestas con IA (prioridad 6 del rediseño, 25-nov-2026): los borradores que
// la lectura automática dejó en todos los eventos abiertos, en una sola lista. Cada uno se
// revisa en la página de su evento; al guardar, marcar o descartar queda «listo» para todo
// el equipo (rateware mark_rfx_reply_reading). La IA solo propone: nada se guarda sin confirmar.

import type { Lectura, TipoLectura } from "./lectura.js";

export type Desenlace = "captured" | "declined" | "answered" | "dismissed";

export interface RespuestaBandeja {
  eventoId: string;
  evento: string;
  folio: string;
  plazo: string | null;
  correoId: string;
  carrierId: string | null;
  carrier: string;
  en: string;
  tipo: TipoLectura | "fallo";
  resumen: string;
  rutas: number;
  fallo: string | null;
}

export const TIPO_BANDEJA: Record<RespuestaBandeja["tipo"], string> = {
  oferta: "Mandó oferta",
  rechazo: "No cotiza",
  pregunta: "Hizo una pregunta",
  otro: "Sin oferta",
  fallo: "La IA no pudo leerlo"
};

// Un solo botón por respuesta, con lo que toca.
export const BOTON_BANDEJA: Record<RespuestaBandeja["tipo"], string> = {
  oferta: "Revisar y guardar",
  rechazo: "Revisar y marcar",
  pregunta: "Ver la pregunta",
  otro: "Revisar",
  fallo: "Leer a mano"
};

const texto = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const ID_CORREO = /^[A-Za-z0-9_-]{6,64}$/;

// Fila de list_rfx_reply_inbox → respuesta de la bandeja. Lo incompleto se deja fuera.
export function aRespuestaBandeja(f: any): RespuestaBandeja | null {
  const eventoId = texto(f?.rfx_event_id);
  const correoId = texto(f?.gmail_message_id);
  if (!eventoId || !ID_CORREO.test(correoId)) return null;
  const lectura: Lectura | null = f?.status === "proposed" && f?.reading?.lectura && typeof f.reading.lectura === "object" ? f.reading.lectura : null;
  const tipo: RespuestaBandeja["tipo"] = lectura && ["oferta", "rechazo", "pregunta", "otro"].includes(lectura.tipo) ? lectura.tipo : "fallo";
  const ofertas = Array.isArray(lectura?.ofertas) ? lectura!.ofertas : [];
  return {
    eventoId,
    evento: texto(f?.event_name) || texto(f?.event_rfx_id) || "Evento",
    folio: texto(f?.event_rfx_id),
    plazo: texto(f?.event_due_date) || null,
    correoId,
    carrierId: texto(f?.vendor_id) || null,
    carrier: texto(f?.vendor_name) || "Carrier",
    en: texto(f?.received_at) || texto(f?.created_at),
    tipo,
    resumen: tipo === "fallo" ? "" : texto(lectura?.resumen).slice(0, 280),
    rutas: new Set(ofertas.map((o) => o?.rutaId).filter(Boolean)).size,
    fallo: tipo === "fallo" ? texto(f?.error) || "La IA no pudo leer este correo." : null
  };
}

// Una respuesta sin la lista no se toma como «no hay pendientes»: se avisa que no se pudo leer.
export function aBandeja(cuerpo: any): { respuestas: RespuestaBandeja[]; hayMas: boolean } {
  if (!Array.isArray(cuerpo?.readings)) throw new Error("RESPUESTA_INCOMPLETA");
  const filas = cuerpo.readings;
  const vistos = new Set<string>();
  const respuestas: RespuestaBandeja[] = [];
  for (const f of filas) {
    const r = aRespuestaBandeja(f);
    const clave = r && `${r.eventoId}:${r.correoId}`;
    if (!r || vistos.has(clave!)) continue;
    vistos.add(clave!);
    respuestas.push(r);
  }
  respuestas.sort((a, b) => b.en.localeCompare(a.en));
  return { respuestas, hayMas: cuerpo?.has_more === true };
}

// Liga a la página del evento con esa respuesta abierta para revisarla.
export const ligaRespuesta = (r: Pick<RespuestaBandeja, "eventoId" | "correoId">) => `/eventos/${r.eventoId}?respuesta=${encodeURIComponent(r.correoId)}`;
