// Seguimiento de la invitación por carrier (idea 3 de la sesión Codex): quién
// abrió su liga, quién ofertó, quién declinó y quién no ha respondido, más un
// recordatorio para los que no responden. Fr8Bid no envía el recordatorio: lo
// abre como borrador en Gmail y el Administrador decide si lo manda.

import { versionVigente } from "./recorrido.js";
import type { Aviso, Detalle, Participacion, Ruta } from "./tipos.js";

export type EstadoSeguimiento = "rebote" | "sin_abrir" | "abrio" | "respondio" | "oferto" | "declino";

export interface SeguimientoCarrier {
  carrierId: string;
  carrier: string;
  correo: string | null;
  estado: EstadoSeguimiento;
  rutas: number;
  ofertadas: number;
  declinadas: number;
  invitadaEn: string | null; // sent_at de la invitación aceptada por Gmail
  intentos: number; // invitaciones que Gmail aceptó (1 = solo la original)
  ultimoEnvio: string | null;
  borradorEnCola: boolean; // ya hay un intento preparado en la Cola sin enviar
  vistaEn: string | null;
  // Canales donde Rateware vio su respuesta (correo, chat del Bid Room).
  respondioPor: ("correo" | "chat")[];
  diasSinRespuesta: number | null;
  pendientes: { participacion: Participacion; ruta: Ruta }[];
  invitacion: Aviso | null;
}

export const ETIQUETA_SEGUIMIENTO: Record<EstadoSeguimiento, string> = {
  rebote: "rebotó la invitación",
  sin_abrir: "no ha abierto la liga",
  abrio: "abrió la liga, sin oferta",
  respondio: "ya respondió por otro canal",
  oferto: "ofertó",
  declino: "declinó"
};

const dia = (iso: string) => iso.slice(0, 10);

export function diasEntre(desde: string, hasta: string): number {
  return Math.max(0, Math.round((Date.parse(`${dia(hasta)}T12:00:00Z`) - Date.parse(`${dia(desde)}T12:00:00Z`)) / 86_400_000));
}

const minimo = (xs: (string | null)[]) => xs.filter((x): x is string => Boolean(x)).sort()[0] ?? null;

// Un renglón por carrier (puede estar en varias rutas). No cuenta a los
// preseleccionados que no se invitaron ni a los excluidos.
export function seguimiento(d: Detalle, hoy: string): SeguimientoCarrier[] {
  const porCarrier = new Map<string, { participacion: Participacion; ruta: Ruta }[]>();
  for (const ruta of d.rutas) {
    for (const p of ruta.participaciones) {
      if (p.estado === "preseleccionada" || p.estado === "excluida") continue;
      porCarrier.set(p.carrierId, [...(porCarrier.get(p.carrierId) || []), { participacion: p, ruta }]);
    }
  }
  const invitaciones = d.avisos.filter((a) => a.tipo === "invitacion");
  return [...porCarrier.values()].map((filas) => {
    const p0 = filas[0].participacion;
    const ids = new Set(filas.map((f) => f.participacion.id));
    const suyas = invitaciones.filter((a) => a.participaciones.some((id) => ids.has(id)));
    const aceptadas = suyas.filter((a) => a.estado === "aceptado");
    const ofertadas = filas.filter((f) => f.participacion.estado !== "declino" && versionVigente(f.participacion)).length;
    const declinadas = filas.filter((f) => f.participacion.estado === "declino").length;
    const vistaEn = minimo(filas.map((f) => f.participacion.vistaEn));
    const contestadas = filas.map((f) => d.respuestas?.[f.participacion.id]).filter((r): r is NonNullable<typeof r> => Boolean(r));
    const respondioPor = [...new Set(contestadas.flatMap((r) => r.canales))];
    const vista = Boolean(vistaEn) || filas.some((f) => ["vista", "respondio"].includes(f.participacion.estado));
    const estado: EstadoSeguimiento =
      ofertadas > 0 ? "oferto"
      : declinadas === filas.length ? "declino"
      // Regla de Jose (23-oct-2026): quien ya respondió por correo o WhatsApp
      // (preguntó, rechazó o cotizó fuera de la liga) no recibe más intentos.
      // Desde R2 (24-oct-2026) el correo y el chat del Bid Room se detectan solos.
      : filas.some((f) => f.participacion.estado === "respondio") || contestadas.length > 0 ? "respondio"
      : suyas.some((a) => a.estado === "rebotado") && !aceptadas.length ? "rebote"
      : vista ? "abrio"
      : "sin_abrir";
    const invitadaEn = minimo(aceptadas.map((a) => a.enviadoEn));
    const envios = aceptadas.map((a) => a.enviadoEn).filter((x): x is string => Boolean(x)).sort();
    return {
      carrierId: p0.carrierId,
      carrier: p0.carrier,
      correo: p0.correo,
      estado,
      rutas: filas.length,
      ofertadas,
      declinadas,
      invitadaEn,
      intentos: envios.length,
      ultimoEnvio: envios[envios.length - 1] ?? null,
      borradorEnCola: suyas.some((a) => a.estado === "borrador" || a.estado === "en_cola"),
      vistaEn,
      respondioPor,
      diasSinRespuesta: invitadaEn && (estado === "sin_abrir" || estado === "abrio") ? diasEntre(invitadaEn, hoy) : null,
      pendientes: filas.filter((f) => f.participacion.estado !== "declino" && !versionVigente(f.participacion)),
      invitacion: aceptadas[0] ?? suyas[0] ?? null
    };
  });
}

// Solo con el evento abierto, a quien no ha ofertado ni declinado y tiene correo.
export function candidatosRecordatorio(d: Detalle, hoy: string): SeguimientoCarrier[] {
  if (d.evento.estado !== "abierto" || d.respuestas === null) return [];
  return seguimiento(d, hoy).filter((s) => (s.estado === "sin_abrir" || s.estado === "abrio") && s.correo);
}

// Cadencia de Jose (23-oct-2026) cuando una ruta no junta suficientes ofertas:
// 2º intento a las 8 h del envío, 3º 12 h después del 2º y luego WhatsApp.
// Cada paso cuenta desde el envío anterior que Gmail aceptó. Fr8Bid solo dice
// cuándo toca y a quién; cada envío lo aprueba el Administrador.
export const PROFUNDIDAD_MINIMA = 3;

export interface PasoCadencia {
  intento: number;
  canal: "correo" | "whatsapp";
  horasDesdeAnterior: number;
}

export const CADENCIA: PasoCadencia[] = [
  { intento: 2, canal: "correo", horasDesdeAnterior: 8 },
  { intento: 3, canal: "correo", horasDesdeAnterior: 12 },
  { intento: 4, canal: "whatsapp", horasDesdeAnterior: 12 }
];

export interface SiguienteIntento extends PasoCadencia {
  tocaEn: string;
  vencido: boolean;
  enCola: boolean;
}

// Rutas abiertas con menos ofertas vigentes que el mínimo.
export function rutasSinProfundidad(d: Detalle, minimoOfertas = PROFUNDIDAD_MINIMA): { ruta: Ruta; ofertas: number }[] {
  if (d.evento.estado !== "abierto") return [];
  return d.rutas
    .map((ruta) => ({ ruta, ofertas: ruta.participaciones.filter((p) => p.estado !== "declino" && versionVigente(p)).length }))
    .filter((x) => x.ofertas < minimoOfertas);
}

// Siguiente paso para un carrier que sigue sin responder en alguna ruta sin
// profundidad. null: no le toca seguimiento o ya se agotó la cadencia.
export function siguienteIntento(d: Detalle, s: SeguimientoCarrier, ahora: Date, minimoOfertas = PROFUNDIDAD_MINIMA): SiguienteIntento | null {
  if (!(s.estado === "sin_abrir" || s.estado === "abrio") || !s.ultimoEnvio) return null;
  const flacas = new Set(rutasSinProfundidad(d, minimoOfertas).map((x) => x.ruta.id));
  if (!s.pendientes.some((f) => flacas.has(f.ruta.id))) return null;
  const paso = CADENCIA.find((c) => c.intento === s.intentos + 1);
  if (!paso) return null;
  const tocaEn = new Date(Date.parse(s.ultimoEnvio) + paso.horasDesdeAnterior * 3_600_000).toISOString();
  return { ...paso, tocaEn, vencido: Date.parse(tocaEn) <= ahora.getTime(), enCola: s.borradorEnCola };
}

// Intentos por correo que ya tocan y no tienen borrador en la Cola: lo que
// «Preparar intento» deja como borrador en Rateware.
export function intentosPorPreparar(d: Detalle, ahora: Date, hoy: string): { s: SeguimientoCarrier; paso: SiguienteIntento; participacion: Participacion; ruta: Ruta }[] {
  // Sin la revisión de respuestas no se sabe a quién ya no hay que escribirle.
  if (d.respuestas === null) return [];
  const flacas = new Set(rutasSinProfundidad(d).map((x) => x.ruta.id));
  return seguimiento(d, hoy).flatMap((s) => {
    const paso = siguienteIntento(d, s, ahora);
    const pendiente = s.pendientes.find((f) => flacas.has(f.ruta.id));
    if (!paso || !paso.vencido || paso.enCola || paso.canal !== "correo" || !s.correo || !pendiente) return [];
    return [{ s, paso, participacion: pendiente.participacion, ruta: pendiente.ruta }];
  });
}

// Texto del intento. Rateware (draft_bid_room_carrier_message) lo pone como
// pregunta dentro de una respuesta en el hilo de Gmail de la invitación, con
// el resumen de la ruta y el botón a la liga privada; acepta hasta 600
// caracteres. «ruta» hace que Rateware arme el correo en español.
export const LIMITE_TEXTO_INTENTO = 600;

export function textoIntento(d: Detalle, ruta: Ruta, paso: Pick<PasoCadencia, "intento">): string {
  const corta = (x: string) => x.split(",")[0].trim();
  const texto = [
    `${paso.intento === 2 ? "Seguimos" : "Último aviso: seguimos"} buscando tarifa all-in en ${ruta.moneda} para la ruta ${corta(ruta.origen)} → ${corta(ruta.destino)} · ${ruta.equipo}.`,
    `¿Nos comparte su oferta con el botón «Abrir Private Bid Room»? También puede responder a este correo con su tarifa y la capturamos.`,
    "Si no tiene unidad disponible, responda «sin unidad» y no le volvemos a escribir por este evento."
  ].join(" ");
  return texto.length > LIMITE_TEXTO_INTENTO ? texto.slice(0, LIMITE_TEXTO_INTENTO - 1) + "…" : texto;
}

// Misma clave en cada clic: Rateware devuelve el borrador existente en vez de
// crear otro.
export const claveIntento = (eventoId: string, participacionId: string, intento: number) => `fr8bid-intento-${intento}-${eventoId}-${participacionId}`;

export interface Recordatorio {
  para: string;
  asunto: string;
  cuerpo: string;
  gmail: string;
}

// El texto no lleva la liga privada (el proxy nunca la entrega): remite a la
// invitación original y ofrece reenviarla.
export function recordatorio(d: Detalle, s: SeguimientoCarrier): Recordatorio {
  const prueba = d.evento.prueba ? "[PRUEBA CONTROLADA] " : "";
  const original = s.invitacion?.asunto?.replace(/^\s*(re|fw|rv):\s*/i, "");
  const asunto = original ? `Re: ${original}` : `${prueba}Recordatorio: ${d.evento.folio} · ${d.evento.nombre}`;
  const rutas = s.pendientes.map((f) => `- ${f.ruta.origen} → ${f.ruta.destino} · ${f.ruta.equipo}`);
  const cuerpo = [
    `Hola, ${s.carrier}:`,
    "",
    `Le recordamos nuestra invitación a cotizar ${d.evento.nombre} (${d.evento.folio}).` +
      (s.estado === "abrio" ? " Vimos que ya abrió la liga, pero aún no recibimos su oferta." : ""),
    d.evento.plazo ? `El plazo vence el ${d.evento.plazo}.` : "",
    "",
    rutas.length > 1 ? "Rutas pendientes:" : "Ruta pendiente:",
    ...rutas,
    "",
    `Puede ofertar con la liga privada del correo de invitación${s.invitadaEn ? ` del ${dia(s.invitadaEn)}` : ""}. Si no la encuentra, responda a este correo y se la reenviamos.`,
    d.evento.prueba ? "Prueba controlada, sin valor comercial." : "",
    "",
    "Saludos,",
    "Marksman"
  ]
    .filter((linea, i, xs) => !(linea === "" && xs[i - 1] === ""))
    .join("\n")
    .trim();
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(s.correo || "")}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  return { para: s.correo || "", asunto, cuerpo, gmail };
}

// «Preguntar al carrier» desde su oferta: borrador de Gmail en el hilo de la
// invitación, con la versión y la ruta a la vista. Fr8Bid no lo envía.
export function preguntaAlCarrier(d: Detalle, ruta: Ruta, p: Participacion, pregunta: string): Recordatorio {
  const v = versionVigente(p);
  const invitacion = d.avisos.find((a) => a.tipo === "invitacion" && a.participaciones.includes(p.id)) ?? null;
  const original = invitacion?.asunto?.replace(/^\s*(re|fw|rv):\s*/i, "");
  const asunto = original ? `Re: ${original}` : `${d.evento.prueba ? "[PRUEBA CONTROLADA] " : ""}Pregunta sobre su oferta · ${d.evento.folio}`;
  const cuerpo = [
    `Hola, ${p.carrier}:`,
    "",
    `Sobre su oferta para ${ruta.origen} → ${ruta.destino} · ${ruta.equipo} (${d.evento.folio})${v ? `, versión ${v.numero} de ${v.tarifaAllIn.toLocaleString("es-MX")} ${v.moneda} all-in` : ""}:`,
    "",
    pregunta.trim(),
    "",
    "Gracias,",
    "Marksman"
  ].join("\n");
  const para = p.correo || "";
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(para)}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  return { para, asunto, cuerpo, gmail };
}
