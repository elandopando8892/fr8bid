// Restricciones de cada acción del equipo, compartidas por la Mesa y el MCP.
// Cada función devuelve null si la acción procede o el motivo por el que no.
// El MCP las aplica al preparar y otra vez al confirmar (el evento pudo cambiar).

import { MOTIVO_SIN_AVISOS, esProtegido, eventoSinAvisos } from "./protegidos.js";
import { estadoRevision } from "./revision.js";
import { versionVigente } from "./recorrido.js";
import type { SeguimientoCarrier } from "./seguimiento.js";
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

// «Ya respondió» sin tarifa. Se decide por lo GUARDADO en la participación
// (rfx_lane_vendors): invitada o vista, sin oferta y sin adjudicar. Un correo o
// WhatsApp detectado (seguimiento → «respondió por correo») NO la bloquea: es
// justo el caso de esta acción (contestó por correo sin tarifa) y solo es contexto.
export function motivoNoMarcable(p: Participacion): string | null {
  if (p.versiones.length > 0 || versionVigente(p)) return "ya ofertó";
  if (p.rol) return "adjudicado";
  if (p.estado === "invitada" || p.estado === "vista") return null;
  return p.estado === "respondio" ? "ya marcado como respondió" : p.estado === "declino" ? "declinó" : p.estado === "preseleccionada" ? "no invitado" : p.estado === "excluida" ? "excluida" : "no pendiente";
}
export const marcablesRespondio = <T extends { participacion: Participacion }>(filas: T[]): T[] => filas.filter((f) => !motivoNoMarcable(f.participacion));

export function bloqueoRespondioEvento(d: Detalle): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  return d.evento.estado !== "abierto" ? "Solo con el evento abierto a ofertas." : null;
}
// Evento abierto y al menos una ruta del carrier por marcar.
export function bloqueoRespondio(d: Detalle, s: Pick<SeguimientoCarrier, "carrier" | "pendientes">): string | null {
  const e = bloqueoRespondioEvento(d);
  if (e) return e;
  if (!marcablesRespondio(s.pendientes).length) return `${s.carrier} no tiene rutas por marcar (ya ofertó, declinó o ya está marcado).`;
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

// Volver a dar «Revisado» a una revisión revocada: solo el Administrador desde
// la página del evento (el MCP sigue sin poder hacerlo). Mismas condiciones que
// una revisión nueva, pero solo aplica a la revocada.
export function bloqueoReRevision(d: Detalle, p: Pick<Participacion, "carrierId" | "carrier" | "correo">): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (!editable(d)) return "Solo en eventos abiertos o en borrador.";
  if (estadoRevision(d, p.carrierId) !== "revocada") return `La revisión de ${p.carrier} no está revocada.`;
  if (!p.correo) return `${p.carrier} no tiene correo.`;
  return null;
}

// Intentos de seguimiento: evento abierto y respuestas consultadas.
export function bloqueoIntentos(d: Detalle): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (eventoSinAvisos(d.evento)) return `${MOTIVO_SIN_AVISOS}.`;
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
  if (d.evento.estado !== "abierto") return "El evento no está abierto a ofertas; primero se publica desde la página del evento.";
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

// Un evento sin actividad: ninguna invitación salió (todas siguen
// preseleccionadas, que es «shortlisted» o «drafted» en Rateware), sin ofertas
// ni adjudicaciones. La misma regla que usa Rateware para dejar borrarlo.
export function sinActividad(d: Pick<Detalle, "rutas">): boolean {
  return d.rutas.every((r) => r.participaciones.every((p) => p.estado === "preseleccionada" && !p.versiones.length && !p.rol));
}

// «Desierta»: la ruta se cierra sin adjudicar (set_rfx_lane_no_award). Solo con
// el evento cerrado a ofertas, como adjudicar; la ruta no debe tener primario ni
// respaldo (Rateware lo exige: lane_has_award) y no debe estar ya desierta.
export function bloqueoDesierta(d: Detalle, ruta: Ruta): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (d.evento.estado !== "cerrado") return "Solo con el evento cerrado a ofertas.";
  if (ruta.desiertaMotivo) return `La ruta ${ruta.numero} ya está desierta.`;
  if (ruta.participaciones.some((p) => p.rol)) return `La ruta ${ruta.numero} tiene primario o respaldo: quítalos antes de declararla desierta.`;
  return null;
}

// Reabrir una ruta desierta para adjudicarla: mismo momento (evento cerrado a ofertas).
export function bloqueoReabrirRuta(d: Detalle, ruta: Ruta): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (d.evento.estado !== "cerrado") return "Solo con el evento cerrado a ofertas.";
  if (!ruta.desiertaMotivo) return `La ruta ${ruta.numero} no está desierta.`;
  return null;
}

// Rutas que faltan por decidir: sin primario ni respaldo y sin declararse desiertas.
export const rutasSinDecidir = (d: Pick<Detalle, "rutas">): Ruta[] => d.rutas.filter((r) => !r.desiertaMotivo && !r.participaciones.some((p) => p.rol));

// «Cerrar sin adjudicar»: declara desiertas las rutas que faltan por decidir;
// después se entrega a Rateware como siempre, y eso cierra el evento. Rateware
// no entrega un evento sin ninguna oferta: ese se archiva.
export function bloqueoCerrarSinAdjudicar(d: Detalle): string | null {
  if (bloqueoEvento(d)) return bloqueoEvento(d);
  if (d.evento.estado !== "cerrado") return "Solo con el evento cerrado a ofertas.";
  if (!rutasSinDecidir(d).length) return "Todas las rutas ya están decididas.";
  if (!d.rutas.some((r) => r.participaciones.some((p) => p.versiones.length))) return "Sin ninguna oferta no hay nada que entregar a Rateware: archiva el evento.";
  return null;
}
