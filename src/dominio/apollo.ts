// Contactos nuevos en Apollo.io cuando Rateware no conoce a nadie útil del
// carrier (pedido de Jose del 24-oct-2026, «Ambas»). Buscar personas por el
// dominio del carrier es gratis; revelar un correo cuesta 1 crédito de Apollo y
// se confirma uno por uno en la Mesa. Fr8Bid no guarda ni envía nada: el correo
// se pone a mano en Rateware y el carrier se marca «Revisado» en Bidware.

export interface PersonaApollo {
  id: string;
  nombre: string;
  puesto: string;
  tieneCorreo: boolean;
  tieneTelefono: boolean;
  // 1 = decide la tarifa (dueño, director, comercial, pricing); 2 = cotiza o
  // despacha (ventas, tráfico, dispatch, logística); 3 = el resto.
  prioridad: 1 | 2 | 3;
  rol: string;
}

export interface CorreoRevelado {
  id: string;
  nombre: string;
  puesto: string;
  correo: string | null;
  estado: string | null;
}

const DECIDE = [
  [/\b(ceo|owner|founder|president|presidente|dueñ[oa]|propietari[oa]|socio)\b/i, "dueño o dirección"],
  [/\b(coo|cro|cco|managing director|general manager|gerente general|director general)\b/i, "dirección"],
  [/\b(director|gerente|manager|head|vp|vice ?president)\b.*\b(comercial|commercial|sales|ventas|pricing|business|negocios|revenue)\b/i, "dirección comercial"],
  [/\b(comercial|commercial|sales|ventas|pricing|business|negocios)\b.*\b(director|gerente|manager|head|vp)\b/i, "dirección comercial"],
  [/\bpricing\b|\btarif/i, "pricing"]
] as const;

const COTIZA = [
  [/\b(dispatch|despach|tr[aá]fico|traffic)\b/i, "tráfico y dispatch"],
  [/\b(loads?|cargas?|carrier sales|freight)\b/i, "cargas"],
  [/\b(log[ií]stic|operations?|operaciones)\b/i, "logística y operaciones"],
  [/\b(sales|ventas|vendedor|account (executive|manager)|ejecutivo|comercial|business development|desarrollo de negocios)\b/i, "ventas"]
] as const;

export function clasificarPuesto(puesto: string): { prioridad: 1 | 2 | 3; rol: string } {
  for (const [re, rol] of DECIDE) if (re.test(puesto)) return { prioridad: 1, rol };
  for (const [re, rol] of COTIZA) if (re.test(puesto)) return { prioridad: 2, rol };
  return { prioridad: 3, rol: "otro puesto" };
}

const si = (v: unknown) => v === true || (typeof v === "string" && /^(yes|true|maybe)/i.test(v));

// Respuesta de mixed_people/api_search → personas ordenadas: primero quien
// decide, luego quien cotiza; dentro de cada grupo, las que tienen correo.
export function leerPersonas(body: any): PersonaApollo[] {
  const gente: any[] = Array.isArray(body?.people) ? body.people : [];
  return gente
    .filter((p) => typeof p?.id === "string")
    .map((p) => {
      const puesto = String(p.title || "").trim();
      const nombre = [p.first_name, p.last_name_obfuscated || p.last_name].filter(Boolean).join(" ").trim() || "Sin nombre";
      return { id: p.id, nombre, puesto: puesto || "sin puesto", tieneCorreo: p.has_email === true, tieneTelefono: si(p.has_direct_phone), ...clasificarPuesto(puesto) };
    })
    .sort((a, b) => a.prioridad - b.prioridad || Number(b.tieneCorreo) - Number(a.tieneCorreo));
}

export function leerRevelado(id: string, body: any): CorreoRevelado {
  const p = body?.person || {};
  const correo = typeof p.email === "string" && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(p.email) ? p.email : null;
  return { id, nombre: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Sin nombre", puesto: String(p.title || ""), correo, estado: p.email_status ? String(p.email_status) : null };
}
