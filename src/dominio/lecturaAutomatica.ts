// Lectura automática de respuestas por correo (pedido de Jose del 16-nov-2026).
// Al abrir la página del evento, la IA lee sola los correos nuevos de carriers y
// deja su propuesta como borrador. Nada se guarda como oferta sin confirmar.
// Lo leído se recuerda en este navegador para no pagar dos veces la misma lectura.

import type { Desenlace } from "./bandeja.js";
import type { Lectura } from "./lectura.js";
import type { CorreoRespuesta, Detalle } from "./tipos.js";

// Tope por apertura de la página: cada lectura cuesta unos 0.03 USD.
export const MAX_LECTURAS_POR_APERTURA = 5;
// Un correo que la IA no pudo leer se reintenta al día siguiente.
export const REINTENTO_MS = 24 * 60 * 60 * 1000;

export interface LecturaGuardada {
  correoId: string;
  carrierId: string;
  carrier: string;
  en: string; // fecha del correo
  leidoEn: string;
  lectura: (Lectura & { recortado: boolean }) | null;
  fallo: string | null;
  revisado: boolean; // ya se guardó o se descartó: no se vuelve a mostrar
  // Quedó lista aquí, pero el aviso al equipo (marca en el servidor) falló: se reintenta al abrir el evento.
  marcaPendiente?: Desenlace;
  // Quién la dejó lista: el reintento solo lo hace esa misma cuenta.
  marcaDe?: string | null;
  // Rutas que ya entraron como oferta desde este correo: un reintento o reabrir el borrador no las repite.
  rutasGuardadas?: string[];
  // Importe enviado por ruta antes de saber si entró: si la respuesta se pierde, sirve para reconocerla.
  intentos?: Record<string, { tarifa: number; moneda: string }>;
}

export interface Pendiente {
  correo: CorreoRespuesta;
  carrierId: string;
  carrier: string;
}

export const claveLecturas = (eventoId: string) => `fr8bid-lecturas-ia-${eventoId}`;

export function cargarLecturas(eventoId: string, almacen: Pick<Storage, "getItem"> | null = almacenLocal()): Record<string, LecturaGuardada> {
  try {
    const crudo = JSON.parse(almacen?.getItem(claveLecturas(eventoId)) || "{}");
    return crudo && typeof crudo === "object" && !Array.isArray(crudo) ? crudo : {};
  } catch {
    return {};
  }
}

export function guardarLecturas(eventoId: string, lecturas: Record<string, LecturaGuardada>, almacen: Pick<Storage, "setItem"> | null = almacenLocal()) {
  try {
    almacen?.setItem(claveLecturas(eventoId), JSON.stringify(lecturas));
  } catch {
    // Sin almacenamiento (ventana privada o lleno): se vuelve a leer en la próxima apertura.
  }
}

function almacenLocal(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

// Correos de carriers a los que todavía se les puede capturar oferta y que la IA
// no ha leído (o cuyo fallo ya puede reintentarse). Los más recientes primero.
export function correosPendientes(
  d: Detalle,
  capturables: Map<string, string>,
  leidas: Record<string, LecturaGuardada>,
  ahora = Date.now(),
  max = MAX_LECTURAS_POR_APERTURA
): Pendiente[] {
  const vistos = new Set<string>();
  const salida: Pendiente[] = [];
  for (const r of d.rutas)
    for (const p of r.participaciones) {
      const carrier = capturables.get(p.carrierId);
      if (!carrier) continue;
      for (const c of d.respuestas?.[p.id]?.correos ?? []) {
        if (vistos.has(c.id)) continue;
        vistos.add(c.id);
        const previa = leidas[c.id];
        // Un fallo se reintenta al día siguiente, salvo que el equipo ya lo haya dado por atendido.
        if (previa && (previa.revisado || !(previa.fallo && ahora - Date.parse(previa.leidoEn) >= REINTENTO_MS))) continue;
        salida.push({ correo: c, carrierId: p.carrierId, carrier });
      }
    }
  return salida.sort((a, b) => b.correo.en.localeCompare(a.correo.en)).slice(0, max);
}

// Lecturas listas para revisar: con propuesta, sin revisar, de carriers que aún admiten captura.
export function lecturasPorRevisar(leidas: Record<string, LecturaGuardada>, capturables: Map<string, string>): LecturaGuardada[] {
  return Object.values(leidas)
    .filter((l) => l.lectura && !l.revisado && capturables.has(l.carrierId))
    .sort((a, b) => b.en.localeCompare(a.en));
}

// Lecturas que dejó la revisión programada de Rateware (cada 15 min, aunque nadie abra la página).
// Fila de list_rfx_reply_readings: reading es la respuesta de /api/lectura ({ lectura, recortado }).
export interface LecturaServidor {
  gmail_message_id: string;
  vendor_id: string | null;
  received_at: string | null;
  status: "proposed" | "failed";
  reading: { lectura?: Lectura; recortado?: boolean } | null;
  error: string | null;
  created_at: string;
  // Bandeja (rateware #235): ya quedó lista para todo el equipo.
  reviewed_at?: string | null;
  review_outcome?: string | null;
}

// Une lo leído en el servidor con lo de este navegador. Lo local gana en la lectura, así que un correo
// ya guardado o descartado aquí no regresa; lo que alguien del equipo dejó listo en el servidor tampoco
// (bandeja, 25-nov). Lo del servidor evita pagar dos veces la lectura.
export function combinarLecturas(
  locales: Record<string, LecturaGuardada>,
  servidor: LecturaServidor[],
  carriers: Map<string, string>
): Record<string, LecturaGuardada> {
  const salida = { ...locales };
  for (const f of servidor) {
    if (!f?.gmail_message_id) continue;
    const listo = Boolean(f.reviewed_at);
    if (salida[f.gmail_message_id]) {
      if (listo && !salida[f.gmail_message_id].revisado) salida[f.gmail_message_id] = { ...salida[f.gmail_message_id], revisado: true };
      continue;
    }
    const carrierId = f.vendor_id || "";
    const lectura = f.status === "proposed" && f.reading?.lectura ? { ...f.reading.lectura, recortado: Boolean(f.reading.recortado) } : null;
    salida[f.gmail_message_id] = {
      correoId: f.gmail_message_id,
      carrierId,
      carrier: carriers.get(carrierId) || "Carrier",
      en: f.received_at || f.created_at,
      leidoEn: f.created_at,
      lectura,
      fallo: lectura ? null : f.error || "La IA no pudo leer este correo.",
      revisado: listo
    };
  }
  return salida;
}
