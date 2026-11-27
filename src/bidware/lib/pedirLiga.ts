/**
 * «Pedir una liga nueva» (recorrido del 26-nov, P5): en una liga vencida o
 * inválida, el carrier o el shipper escribe al equipo en un clic, con el
 * correo ya armado. El asunto va siempre en español (regla de Jose, 22-nov);
 * el cuerpo, en el idioma de la página. La liga vieja no viaja en el correo:
 * el equipo encuentra al carrier o al shipper por su empresa.
 */

export type PaginaLiga = "bidroom" | "perfil_carrier" | "solicitud" | "perfil_shipper";
export type MarcaLiga = "marksman" | "xbf";

interface Contacto {
  correo: string;
  /** Dígitos con lada de país para wa.me; null mientras el equipo no tenga un número para esto. */
  whatsapp: string | null;
}

/** Solo marcas con un contacto confirmado; sin él la página queda con su texto de siempre. */
export const CONTACTO_LIGAS: Record<MarcaLiga, Contacto | null> = {
  marksman: { correo: "sales@heymarksman.com", whatsapp: null },
  xbf: null,
};

const PAGINA: Record<PaginaLiga, { asunto: string; es: string; en: string }> = {
  bidroom: { asunto: "Bid Room", es: "Bid Room", en: "Bid Room" },
  perfil_carrier: { asunto: "perfil de carrier", es: "perfil de carrier", en: "carrier profile" },
  solicitud: { asunto: "solicitud de cotización", es: "solicitud de cotización", en: "quote request" },
  perfil_shipper: { asunto: "perfil de empresa", es: "perfil de empresa", en: "company profile" },
};

export interface PedirLiga {
  correo: string;
  whatsapp: string | null;
}

export function pedirLiga(pagina: PaginaLiga, lang: "es" | "en", marca: MarcaLiga = "marksman"): PedirLiga | null {
  const contacto = CONTACTO_LIGAS[marca];
  if (!contacto) return null;
  const p = PAGINA[pagina];
  const asunto = `Liga nueva · ${p.asunto}`;
  const texto =
    lang === "en"
      ? `Hi, my ${p.en} link no longer works. Could you send me a new one?\n\nCompany: \nName: `
      : `Hola, mi liga de ${p.es} ya no funciona. ¿Me pueden enviar una nueva?\n\nEmpresa: \nNombre: `;
  const correo = `mailto:${contacto.correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
  const whatsapp = contacto.whatsapp ? `https://wa.me/${contacto.whatsapp}?text=${encodeURIComponent(texto.split("\n")[0])}` : null;
  return { correo, whatsapp };
}

/** El rechazo es de la liga (no existe, venció, se revocó), no de la red: ahí sí se ofrece pedir otra. */
export const esErrorDeLiga = (message: string | null | undefined) =>
  /not found|expired|revoked|deactivat|not active|no longer|invalid|no rows|0 rows|json object requested|pgrst116|venci|no es válid|no está activa|ya no/i.test(String(message ?? ""));
