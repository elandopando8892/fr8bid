// Restricciones de cada acción del equipo, compartidas por la Mesa y el MCP.
// Cada función devuelve null si la acción procede o el motivo por el que no.
// El MCP las aplica al preparar y otra vez al confirmar (el evento pudo cambiar).

import { esProtegido } from "./protegidos.js";
import { estadoRevision } from "./revision.js";
import { esperaRespuesta, type SeguimientoCarrier } from "./seguimiento.js";
import type { Detalle, Participacion, Ruta } from "./tipos.js";

const editable = (d: Detalle) => d.evento.estado === "abierto" || d.evento.estado === "borrador";

export function bloqueoEvento(d: Detalle): string | null {
  return esProtegido(d.evento.id) ? "Evento protegido." : null;
}

// Captura del equipo: no en eventos adjudicados o archivados, ni en participaciones
// preseleccionadas (sin invitar), que declinaron o ya adjudicadas.
export function bloqueoCaptura(d: Detalle, p: Participacion): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (d.evento.estado === "adjudicado" || d.evento.estado === "archivado") return "El evento ya está adjudicado o archivado.";
  if (p.estado === "preseleccionada") return `${p.carrier} aún no está invitado.`;
  if (p.estado === "declino") return `${p.carrier} declinó.`;
  if (p.rol) return `${p.carrier} ya está adjudicado en esta ruta.`;
  return null;
}
export const candidatasCaptura = (d: Detalle, ruta: Ruta) => ruta.participaciones.filter((p) => !bloqueoCaptura(d, p));

// «Ya respondió» sin tarifa: evento abierto y carrier que sigue esperando respuesta.
export function bloqueoRespondio(d: Detalle, s: Pick<SeguimientoCarrier, "estado" | "carrier">): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (d.evento.estado !== "abierto") return "Solo con el evento abierto a ofertas.";
  if (!esperaRespuesta(s.estado)) return `${s.carrier} ya no está esperando respuesta (respondió, ofertó, declinó o rebotó).`;
  return null;
}

// «Revisado»: evento abierto o en borrador, carrier sin revisión y con correo.
export function bloqueoRevision(d: Detalle, p: Pick<Participacion, "carrierId" | "carrier" | "correo">): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (!editable(d)) return "Solo en eventos abiertos o en borrador.";
  const e = estadoRevision(d, p.carrierId);
  if (e === "sin_consulta") return "No se pudo consultar la revisión.";
  if (e === "revisado") return `${p.carrier} ya tiene «Revisado» vigente.`;
  if (e === "revocada") return `La revisión de ${p.carrier} fue revocada; se vuelve a dar en Revisión de contactos.`;
  if (!p.correo) return `${p.carrier} no tiene correo.`;
  return null;
}

// Intentos de seguimiento: evento abierto y respuestas consultadas.
export function bloqueoIntentos(d: Detalle): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (d.evento.estado !== "abierto") return "Solo con el evento abierto a ofertas.";
  if (d.respuestas == null) return "No se pudo saber quién ya respondió; intenta más tarde.";
  return null;
}

export function bloqueoBorradoresInvitacion(d: Detalle): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (!editable(d)) return "Solo en eventos abiertos o en borrador.";
  if (!d.revisiones) return "No se pudo consultar la revisión; no se invita a nadie.";
  return null;
}

export function bloqueoEnvioInvitacion(d: Detalle): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (d.evento.estado !== "abierto") return "El evento no está abierto a ofertas; primero se publica en la Mesa.";
  if (!d.revisiones) return "No se pudo consultar la revisión; no se envía nada.";
  return null;
}

// Extender plazo: solo hacia adelante, evento abierto o en borrador.
export function bloqueoPlazo(d: Detalle, nueva: string, hoy: string): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (!editable(d)) return "Solo se extiende el plazo de eventos abiertos o en borrador.";
  if (nueva <= hoy) return "La fecha nueva debe ser posterior a hoy; no se cierra ni se adelanta el plazo.";
  const actual = d.evento.plazo ? d.evento.plazo.slice(0, 10) : null;
  if (actual && nueva <= actual) return `Solo hacia adelante: la fecha nueva debe ser posterior al plazo actual (${actual}).`;
  return null;
}
