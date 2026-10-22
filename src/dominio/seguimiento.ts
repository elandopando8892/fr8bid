// Seguimiento de la invitación por carrier (idea 3 de la sesión Codex): quién
// abrió su liga, quién ofertó, quién declinó y quién no ha respondido, más un
// recordatorio para los que no responden. Fr8Bid no envía el recordatorio: lo
// abre como borrador en Gmail y el Administrador decide si lo manda.

import { versionVigente } from "./recorrido.js";
import type { Aviso, Detalle, Participacion, Ruta } from "./tipos.js";

export type EstadoSeguimiento = "rebote" | "sin_abrir" | "abrio" | "oferto" | "declino";

export interface SeguimientoCarrier {
  carrierId: string;
  carrier: string;
  correo: string | null;
  estado: EstadoSeguimiento;
  rutas: number;
  ofertadas: number;
  declinadas: number;
  invitadaEn: string | null; // sent_at de la invitación aceptada por Gmail
  vistaEn: string | null;
  diasSinRespuesta: number | null;
  pendientes: { participacion: Participacion; ruta: Ruta }[];
  invitacion: Aviso | null;
}

export const ETIQUETA_SEGUIMIENTO: Record<EstadoSeguimiento, string> = {
  rebote: "rebotó la invitación",
  sin_abrir: "no ha abierto la liga",
  abrio: "abrió la liga, sin oferta",
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
    const vista = Boolean(vistaEn) || filas.some((f) => ["vista", "respondio"].includes(f.participacion.estado));
    const estado: EstadoSeguimiento =
      ofertadas > 0 ? "oferto"
      : declinadas === filas.length ? "declino"
      : suyas.some((a) => a.estado === "rebotado") && !aceptadas.length ? "rebote"
      : vista ? "abrio"
      : "sin_abrir";
    const invitadaEn = minimo(aceptadas.map((a) => a.enviadoEn));
    return {
      carrierId: p0.carrierId,
      carrier: p0.carrier,
      correo: p0.correo,
      estado,
      rutas: filas.length,
      ofertadas,
      declinadas,
      invitadaEn,
      vistaEn,
      diasSinRespuesta: invitadaEn && (estado === "sin_abrir" || estado === "abrio") ? diasEntre(invitadaEn, hoy) : null,
      pendientes: filas.filter((f) => f.participacion.estado !== "declino" && !versionVigente(f.participacion)),
      invitacion: aceptadas[0] ?? suyas[0] ?? null
    };
  });
}

// Solo con el evento abierto, a quien no ha ofertado ni declinado y tiene correo.
export function candidatosRecordatorio(d: Detalle, hoy: string): SeguimientoCarrier[] {
  if (d.evento.estado !== "abierto") return [];
  return seguimiento(d, hoy).filter((s) => (s.estado === "sin_abrir" || s.estado === "abrio") && s.correo);
}

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
