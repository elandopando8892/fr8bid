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
  RFX_PROPOSAL_NO_SHIPPER_REQUEST: () => "Este evento no salió de una solicitud del shipper: no hay liga del shipper donde publicar la propuesta.",
  RFX_PROPOSAL_EVENT_NOT_READY: () => "Un evento en borrador o archivado no publica propuesta.",
  RFX_PROPOSAL_LANE_NOT_AWARDED: () => "Cada ruta de la propuesta necesita primario. Recarga la página: algo cambió en la adjudicación.",
  RFX_PROPOSAL_HAS_ACCEPTANCE: () => "El shipper ya aceptó rutas que cambiarían: esas rutas no se cambian. Habla con él.",
  RFX_PROPOSAL_STALE: () => "La adjudicación, las rutas o la propuesta publicada cambiaron mientras revisabas. Vuelve a cargar la página y revisa la propuesta antes de publicar.",
  RFX_PROPOSAL_LANE_INVALID: () => "Una ruta de la propuesta no es de este evento o no tiene tarifa de venta.",
  RFX_PROPOSAL_LANE_DUPLICATE: () => "Una ruta aparece dos veces en la propuesta.",
  RFX_PROPOSAL_LANES_REQUIRED: () => "No hay rutas adjudicadas que publicar.",
  RFX_PROPOSAL_CURRENCY_INVALID: () => "La moneda de la propuesta debe ser USD o MXN.",
  RFX_PROPOSAL_VALIDITY_PAST: () => "La vigencia de la propuesta ya pasó.",
  ACCEPTED_COMMERCIAL_MODELS_INVALID: () => "Los modelos comerciales del evento no son válidos. Elige entre Brokerage, Cost plus, Sell share y Fee plus."
};

export function mensajeDelServidor(code: string, mensaje: string, cuerpo?: Cuerpo): string {
  const traducido = MENSAJES[code];
  return traducido ? traducido(cuerpo) : mensaje;
}
