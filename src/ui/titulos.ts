// Recorrido del 26-nov: todas las pestañas del equipo decían «Bid Room · MARKSMAN»
// y con varias abiertas no se distinguían. Cada sección pone su nombre.

type Titulo = { es: string; en: string };

const TITULOS: [RegExp, Titulo][] = [
  [/^\/$/, { es: "Hoy", en: "Today" }],
  [/^\/(eventos\/[^/]+|rfx\/(?!new)[^/]+)/, { es: "Evento", en: "Event" }],
  [/^\/rfx\/new/, { es: "Nuevo evento", en: "New event" }],
  [/^\/eventos/, { es: "Eventos", en: "Events" }],
  [/^\/respuestas/, { es: "Respuestas", en: "Replies" }],
  [/^\/quotedesk/, { es: "Cotizaciones", en: "Quotes" }],
  [/^\/intake/, { es: "Solicitudes de shippers", en: "Shipper requests" }],
  [/^\/crm\/higiene/, { es: "Higiene", en: "Hygiene" }],
  [/^\/crm\/rebotes/, { es: "Correos rebotados", en: "Bounced emails" }],
  [/^\/crm/, { es: "Carriers", en: "Carriers" }],
  [/^\/templates/, { es: "Listas de carriers", en: "Carrier lists" }],
  [/^\/carrier-fit/, { es: "A quién invitar", en: "Who to invite" }],
  [/^\/plantillas/, { es: "Plantillas de correo", en: "Email templates" }],
  [/^\/shippers/, { es: "Shippers", en: "Shippers" }],
  [/^\/(tarifas|tarifario|archivos)/, { es: "Tarifas", en: "Rates" }],
  [/^\/integraciones/, { es: "Integraciones", en: "Integrations" }],
];

export function tituloDe(ruta: string, idioma: "es" | "en" = "es"): string {
  const hallado = TITULOS.find(([patron]) => patron.test(ruta))?.[1];
  return hallado ? `${hallado[idioma]} · Fr8Bid` : "Fr8Bid";
}

// Nombres que el equipo escribe a mano y que antes abrían Hoy sin avisar.
export const ALIAS: Record<string, string> = {
  "/cotizaciones": "/quotedesk",
  "/solicitudes": "/intake",
  "/carriers": "/crm",
  "/directorio": "/crm",
  "/listas": "/templates",
  "/tarifa": "/tarifas",
  "/hoy": "/",
};
