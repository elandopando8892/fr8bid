import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  "text001": {
    "es": "NUEVO",
    "en": "NEW"
  },
  "text002": {
    "es": "LLENANDO",
    "en": "IN PROGRESS"
  },
  "text003": {
    "es": "LIGA ENVIADA",
    "en": "LINK SENT"
  },
  "text004": {
    "es": "PROMOVIDO",
    "en": "PROMOTED"
  },
  "text005": {
    "es": "Una pantalla: rutas sin precios. Se vuelve cotización en QuoteDesk.",
    "en": "One screen: routes without prices. It becomes a quote in QuoteDesk."
  },
  "text006": {
    "es": "Asistente RFQ de cuatro pasos. Se vuelve un evento Mini-bid del Bid Room.",
    "en": "Four-step RFQ wizard. It becomes a Mini-bid event in Bid Room."
  },
  "text007": {
    "es": "Programa",
    "en": "Program"
  },
  "text008": {
    "es": "Asistente RFQ de cuatro pasos. Se vuelve un evento RFx · Programa del Bid Room.",
    "en": "Four-step RFQ wizard. It becomes an RFx · Program event in Bid Room."
  },
  "text009": {
    "es": "Otro",
    "en": "Other"
  },
  "text010": {
    "es": "Dedicado, capacidad adicional, proveedor nuevo, benchmark o respaldo.",
    "en": "Dedicated, additional capacity, new provider, benchmark or backup."
  },
  "text011": {
    "es": "Mini-bid (contrato)",
    "en": "Mini-bid (contract)"
  },
  "text012": {
    "es": "Hoy {0}",
    "en": "Today {0}"
  },
  "text013": {
    "es": "Hoy",
    "en": "Today"
  },
  "text014": {
    "es": "Ayer",
    "en": "Yesterday"
  },
  "text015": {
    "es": "La solicitud quedó creada, pero no se pudo obtener su liga; vuelve a pedirla desde la lista.",
    "en": "The request was created, but its link could not be retrieved; request it again from the list."
  },
  "text016": {
    "es": "No se pudo recuperar la liga.",
    "en": "The link could not be retrieved."
  },
  "text017": {
    "es": "Liga copiada.",
    "en": "Link copied."
  },
  "text018": {
    "es": "Evento creado en el Bid Room. Nada se envió a los carriers.",
    "en": "Event created in Bid Room. Nothing was sent to carriers."
  },
  "text019": {
    "es": "Generar otra liga",
    "en": "New magic link"
  },
  "text020": {
    "es": "Enlaces activos",
    "en": "Active links"
  },
  "text021": {
    "es": "Drafts nuevos",
    "en": "New drafts"
  },
  "text022": {
    "es": "Promovidos",
    "en": "Promoted"
  },
  "text023": {
    "es": "Conversión",
    "en": "Conversion"
  },
  "text024": {
    "es": "1 · Generar liga para el shipper",
    "en": "1 · Generate magic link"
  },
  "text025": {
    "es": "Shipper",
    "en": "Shipper (Shipper CRM)"
  },
  "text026": {
    "es": "¿No está? Darlo de alta en Shippers ↗",
    "en": "Missing? Create an account in Shipper CRM ↗"
  },
  "text027": {
    "es": "Contacto",
    "en": "Contact"
  },
  "text028": {
    "es": " (del CRM)",
    "en": " (from CRM)"
  },
  "text029": {
    "es": "Quién llena",
    "en": "Completed by"
  },
  "text030": {
    "es": "autocompletado desde el CRM; puedes cambiarlo",
    "en": "autofilled from CRM; you can change it"
  },
  "text031": {
    "es": "Tipo de solicitud",
    "en": "Request type"
  },
  "text032": {
    "es": "Fecha límite (opcional)",
    "en": "Deadline (optional)"
  },
  "text033": {
    "es": "Generando…",
    "en": "Generating…"
  },
  "text034": {
    "es": "Generar liga",
    "en": "Generate link"
  },
  "text035": {
    "es": "Liga para ",
    "en": "Link associated with "
  },
  "text036": {
    "es": "Copiado",
    "en": "Copied"
  },
  "text037": {
    "es": "Copiar",
    "en": "Copy"
  },
  "text038": {
    "es": "Abrir",
    "en": "Open"
  },
  "text039": {
    "es": "Compártelo tú: no se envía solo.",
    "en": "Share it yourself: it is not sent automatically."
  },
  "text040": {
    "es": "Cómo funciona",
    "en": "How it works"
  },
  "text041": {
    "es": " el shipper llena sus rutas en una sola pantalla, como en QuoteDesk pero sin precios, con los catálogos del template RFI. Cuando la envía aparece como «Nuevo», y «Crear cotización» la pasa a QuoteDesk con las rutas cargadas.",
    "en": " the shipper enters routes on one screen, as in QuoteDesk without prices, using the RFI template catalogs. When submitted, it appears as “New”; “Create quote” moves it to QuoteDesk with the routes loaded."
  },
  "text042": {
    "es": " un asistente de cuatro pasos (contacto y segmentos, rutas con las columnas del template RFI, preguntas por segmento operativo, revisar) que guarda solo y acepta el Excel del template. Cuando la envía, «Crear evento» la convierte en un evento del Bid Room en borrador.",
    "en": " a four-step wizard (contact and segments, routes with the RFI template columns, operating questions by segment, review) that saves automatically and accepts the template Excel file. After submission, “Create event” turns it into a draft Bid Room event."
  },
  "text043": {
    "es": "«Abrir» te muestra la liga como la ve el shipper. Todo lo que captures ahí se guarda en su solicitud.",
    "en": "“Open” shows the link as the shipper sees it. Everything entered there is saved in their request."
  },
  "text044": {
    "es": "2 · Solicitudes recibidas",
    "en": "2 · Incoming drafts"
  },
  "text045": {
    "es": "Cada solicitud queda ligada al shipper. Cuando la envía, pásala a cotización o a evento del Bid Room.",
    "en": "Each request is linked to its Shipper CRM account. Once the shipper submits it, turn it into a quote or a Bid Room event."
  },
  "text046": {
    "es": "Cargando solicitudes…",
    "en": "Loading requests…"
  },
  "text047": {
    "es": "Shipper",
    "en": "Shipper (CRM)"
  },
  "text048": {
    "es": "Tipo",
    "en": "Type"
  },
  "text049": {
    "es": "Recibido",
    "en": "Received"
  },
  "text050": {
    "es": "Estado",
    "en": "Status"
  },
  "text051": {
    "es": "Acción",
    "en": "Action"
  },
  "text052": {
    "es": "Abrir el evento",
    "en": "Open event"
  },
  "text053": {
    "es": "Aún no la envía; fecha de la liga",
    "en": "Not submitted yet; link date"
  },
  "text054": {
    "es": "liga {0}",
    "en": "link {0}"
  },
  "text055": {
    "es": "Ver evento ",
    "en": "View event "
  },
  "text056": {
    "es": "Ver cotización ",
    "en": "View quote "
  },
  "text057": {
    "es": "Crear cotización →",
    "en": "Create quote →"
  },
  "text058": {
    "es": "Crear evento →",
    "en": "Create event →"
  },
  "text059": {
    "es": "Copiar liga",
    "en": "Copy link"
  },
  "text060": {
    "es": "Aún no hay solicitudes",
    "en": "No requests yet"
  },
  conversionMismatch: { es: "La solicitud cambió. Actualiza la lista antes de continuar.", en: "The request changed. Refresh the list before continuing." },
  conversionSpotOnly: { es: "Esta solicitud ya no es Spot. Actualiza la lista para revisar su tipo.", en: "This request is no longer Spot. Refresh the list to review its type." },
  conversionNotSubmitted: { es: "El shipper todavía no ha enviado esta solicitud.", en: "The shipper has not submitted this request yet." },
  conversionNoShipper: { es: "Esta solicitud no está ligada a un shipper del CRM; crea la cotización desde QuoteDesk.", en: "This request is not linked to a CRM shipper; create the quote from QuoteDesk." },
  conversionIncomplete: { es: "La solicitud trae rutas incompletas. Revisa origen, destino, equipo y número de cargas antes de convertirla.", en: "The request has incomplete lanes. Review origin, destination, equipment and load count before converting it." },
  conversionMarkFailed: { es: "{0} quedó creada, pero no se pudo vincular a la solicitud. Abre esa cotización; no crees otra.", en: "{0} was created, but could not be linked to the request. Open that quote; do not create another." },
  conversionLanesFailed: { es: "{0} quedó creada con {1} de {2} rutas confirmadas. Revisa sus rutas en QuoteDesk antes de completar las faltantes.", en: "{0} was created with {1} of {2} lanes confirmed. Review its lanes in QuoteDesk before completing any missing ones." },
  conversionOpen: { es: "Abrir cotización creada", en: "Open created quote" },
  conversionScopeChanged: { es: "La sesión cambió. Revisa la solicitud desde tu cuenta actual antes de continuar.", en: "The session changed. Review the request from your current account before continuing." },
  conversionUnavailable: { es: "No pudimos confirmar la conversión. Actualiza la lista o vuelve a intentar desde esta solicitud; no crees otra cotización manualmente.", en: "We could not confirm the conversion. Refresh the list or retry from this request; do not create another quote manually." },
  conversionLegacy: { es: "Esta solicitud tiene una cotización anterior que requiere revisión. Revisa su vínculo y sus rutas antes de continuar.", en: "This request has a previous quote that needs review. Check its link and lanes before continuing." },
  "text061": {
    "es": "Genera la primera liga a la izquierda.",
    "en": "Generate the first link on the left."
  },
  "text267": {
    "es": "Rutas",
    "en": "Lanes"
  }
};

export const tr = translator(copy);

const wordCopy={
  "word0": {
    "es": "correo@shipper.com",
    "en": "email@shipper.com"
  }
};
export const words=translator(wordCopy);
