// Invitación desde la Mesa contra Rateware real. generate_outreach_drafts de
// rateware-api no recibe el evento sino una campaña (outreach_campaigns) con su
// plantilla. Fr8Bid usa una campaña propia por evento, con audiencia «todos los
// elegibles» (así un carrier sumado después también entra) y siempre la
// plantilla en español: la de por defecto en Rateware es la de PRUEBA (SPRINT 15).

export const REMITENTE = "sales@heymarksman.com";

export const claveCampana = (eventoId: string) => `fr8bid-invitacion-${eventoId}`;

// Rateware guarda las plantillas de invitación con canal «multi» (correo y
// WhatsApp en la misma plantilla); también sirven para el correo.
const CANALES_CORREO = new Set(["email", "multi"]);

export function esPlantillaInvitacion(t: Record<string, any> | null | undefined): boolean {
  if (!t || t.active === false) return false;
  const nombre = String(t.name || "");
  return (
    CANALES_CORREO.has(String(t.channel || "email").toLowerCase()) &&
    /rfx/i.test(nombre) &&
    /invitation|invitaci[oó]n/i.test(nombre) &&
    /spanish|español|espanol/i.test(nombre) &&
    !/prueba|sprint|test/i.test(nombre)
  );
}

// Puede haber más de una plantilla en español (la global y la propia de la
// cuenta, con HTML distinto). Gana la que ya usa una campaña de este evento, para
// que las invitaciones nuevas salgan igual que las anteriores; si no hay, la
// primera en el orden de Rateware (primero las propias, luego la predeterminada).
export function elegirPlantilla(rows: Record<string, any>[], preferidas: readonly unknown[] = []): Record<string, any> | null {
  const validas = rows.filter(esPlantillaInvitacion);
  for (const id of preferidas) {
    const t = id ? validas.find((x) => String(x.id) === String(id)) : undefined;
    if (t) return t;
  }
  return validas[0] ?? null;
}

// Plantillas de las campañas de un evento: primero la campaña de Fr8Bid, luego
// las demás del evento, de la más reciente a la más vieja. `delEvento` sale de
// la lectura completa acotada al evento (el catálogo global corta en 100 filas).
export function plantillasDelEvento(delEvento: Record<string, any>[], eventoId: string, propia?: Record<string, any> | null): string[] {
  const otras = delEvento
    .filter((c) => c.rfx_event_id === eventoId && c.status !== "archived" && c.id !== propia?.id)
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return [...(propia ? [propia] : []), ...otras].map((c) => String(c.template_id ?? "")).filter(Boolean);
}

// La lectura acotada al evento no trae idempotency_key: la campaña de Fr8Bid se
// reconoce por su nombre y su audiencia (campanaFr8bid). Solo se usa para
// preferir su plantilla o para comprobar su id; crearla sigue siendo idempotente
// en Rateware por idempotency_key.
const NOMBRE_FR8BID = "Fr8Bid · invitación ";
export function campanaFr8bidEnEvento(delEvento: Record<string, any>[], eventoId: string): Record<string, any> | null {
  // Si más de una cumple, no se adivina: ninguna se acepta (el proxy rechaza y
  // la creación por idempotency_key devuelve la verdadera).
  const candidatas = delEvento.filter(
    (c) => c.rfx_event_id === eventoId && c.status !== "archived" && String(c.name || "").startsWith(NOMBRE_FR8BID) && c.audience_policy?.mode === "all_eligible"
  );
  return candidatas.length === 1 ? candidatas[0] : null;
}

// La lectura acotada al evento solo sirve si Rateware la da por completa.
export function campanasDelEventoCompletas(r: Record<string, any> | null | undefined, eventoId: string): Record<string, any>[] | null {
  const rows = r?.rows;
  if (!r || r.complete !== true || r.has_more === true || r.rfx_event_id !== eventoId || !Array.isArray(rows)) return null;
  if (typeof r.total === "number" && r.total !== rows.length) return null;
  if (rows.some((c: any) => !c || c.rfx_event_id !== eventoId)) return null;
  return rows;
}

export function campanaFr8bid(eventoId: string, folio: string, plantillaId: string, base?: Record<string, any> | null) {
  return {
    rfx_event_id: eventoId,
    template_id: plantillaId,
    name: `${NOMBRE_FR8BID}${folio}`,
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
