// Rechazos del servidor de Rateware que llegan en inglés: aquí se muestran en
// español, con la misma información. Un código que no está en la lista deja el
// mensaje del servidor tal cual. Los rechazos de modelo comercial no están aquí:
// el servidor ya los escribe en el idioma de la oferta (es/en) y los del equipo en español.

type Cuerpo = Record<string, unknown> | null | undefined;

const MENSAJES: Record<string, (cuerpo: Cuerpo) => string> = {
  RFX_EVENT_CLOSED_FOR_INVITES: () => "El plazo de este evento ya cerró: no se prepararon invitaciones. Extiende el plazo si quieres invitar a más carriers.",
  RFX_DELETE_NOT_DRAFT: () => "Solo se borra un evento en borrador: archívalo en lugar de borrarlo.",
  RFX_DELETE_HAS_ACTIVITY: () => "El evento ya tiene invitaciones u ofertas: archívalo en lugar de borrarlo.",
  RFX_LANE_EVENT_NOT_EDITABLE: () => "La ruta solo se corrige mientras el evento está en borrador o abierto.",
  RFX_LANE_AWARDED: () => "La ruta ya tiene primario o respaldo: ya no se corrige. Quita la adjudicación primero si de verdad cambió.",
  RFX_LANE_NO_AWARD: () => "La ruta está declarada desierta. Reábrela antes de corregirla.",
  RFX_LANE_CHANGED: () => "Alguien cambió la ruta mientras la corregías. Recarga la página y vuelve a intentarlo; no se guardó nada.",
  RFX_LANE_PLACE_REQUIRED: () => "La ruta necesita origen y destino.",
  ACCEPTED_COMMERCIAL_MODELS_INVALID: () => "Los modelos comerciales del evento no son válidos. Elige entre Brokerage, Cost plus, Sell share y Fee plus."
};

export function mensajeDelServidor(code: string, mensaje: string, cuerpo?: Cuerpo): string {
  const traducido = MENSAJES[code];
  return traducido ? traducido(cuerpo) : mensaje;
}
