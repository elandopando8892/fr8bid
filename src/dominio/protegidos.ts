// Regla I12: eventos que Fr8Bid no lista, no abre y no toca hasta que el
// propietario decida. HDships: 298 participaciones, 5 ofertas, 0 adjudicaciones,
// discrepancia 1 800 frente a 1 900.
export const EVENTOS_PROTEGIDOS = new Set(["5894a5f1-f523-40b1-963e-445ab780b5f9"]);

export function esProtegido(id: unknown): boolean {
  return typeof id === "string" && EVENTOS_PROTEGIDOS.has(id.toLowerCase());
}

// PRIMA (RFx-1021-PRIMAPro): nunca se cierra ni se rechaza desde el chat, y desde
// el 17-nov-2026 queda fuera de todo recordatorio y aviso (correo y WhatsApp), por
// decisión del propietario. Se identifica por folio, en un solo lugar.
const FOLIOS_PRIMA = new Set(["rfx-1021-primapro"]);
export const esPrima = (folio: unknown) => FOLIOS_PRIMA.has(String(folio ?? "").trim().toLowerCase());

export const MOTIVO_SIN_AVISOS = "PRIMA: sin avisos por decisión del propietario";

// Eventos a los que Fr8Bid no prepara intentos, recordatorios ni avisos.
export function eventoSinAvisos(evento: { folio?: unknown } | null | undefined): boolean {
  return esPrima(evento?.folio);
}
