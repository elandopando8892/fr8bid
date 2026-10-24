// Invitación desde la Mesa contra Rateware real. generate_outreach_drafts de
// rateware-api no recibe el evento sino una campaña (outreach_campaigns) con su
// plantilla. Fr8Bid usa una campaña propia por evento, con audiencia «todos los
// elegibles» (así un carrier sumado después también entra) y siempre la
// plantilla en español: la de por defecto en Rateware es la de PRUEBA (SPRINT 15).

export const REMITENTE = "sales@heymarksman.com";

export const claveCampana = (eventoId: string) => `fr8bid-invitacion-${eventoId}`;

export function esPlantillaInvitacion(t: Record<string, any> | null | undefined): boolean {
  if (!t || t.active === false) return false;
  const nombre = String(t.name || "");
  return (
    String(t.channel || "email").toLowerCase() === "email" &&
    /rfx/i.test(nombre) &&
    /invitation|invitaci[oó]n/i.test(nombre) &&
    /spanish|español|espanol/i.test(nombre) &&
    !/prueba|sprint|test/i.test(nombre)
  );
}

export function elegirPlantilla(rows: Record<string, any>[]): Record<string, any> | null {
  return rows.find(esPlantillaInvitacion) ?? null;
}

export function campanaFr8bid(eventoId: string, folio: string, plantillaId: string, base?: Record<string, any> | null) {
  return {
    rfx_event_id: eventoId,
    template_id: plantillaId,
    name: `Fr8Bid · invitación ${folio}`,
    channel: "email",
    idempotency_key: claveCampana(eventoId),
    sender_email: base?.sender_email || REMITENTE,
    sender_label: base?.sender_label || base?.sender_email || REMITENTE,
    sender_connection_status: base?.sender_connection_status || "oauth_connected",
    audience_policy: { mode: "all_eligible" },
    notes: "Creada por Fr8Bid: solo carriers con «Revisado» vigente."
  };
}

export function campanaDelEvento(rows: Record<string, any>[], eventoId: string): Record<string, any> | null {
  return rows.find((c) => c.idempotency_key === claveCampana(eventoId) && c.rfx_event_id === eventoId && c.status !== "archived") ?? null;
}
