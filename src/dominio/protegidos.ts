// Regla I12: eventos que Fr8Bid no lista, no abre y no toca hasta que el
// propietario decida. HDships: 298 participaciones, 5 ofertas, 0 adjudicaciones,
// discrepancia 1 800 frente a 1 900.
export const EVENTOS_PROTEGIDOS = new Set(["5894a5f1-f523-40b1-963e-445ab780b5f9"]);

export function esProtegido(id: unknown): boolean {
  return typeof id === "string" && EVENTOS_PROTEGIDOS.has(id.toLowerCase());
}
