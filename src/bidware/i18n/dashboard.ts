import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  "text001": {
    "es": "Genera un enlace para que el shipper pida spot o mini-bid con info parcial. Llega como draft y tú autorizas.",
    "en": "Create a link for the shipper to request a spot quote or mini-bid with partial information. It arrives as a draft for your approval."
  },
  "text002": {
    "es": "Crea eventos, importa lanes, arma la audiencia de carriers, revisa bids en vivo y adjudica.",
    "en": "Create events, import lanes, build a carrier audience, review live bids and award."
  },
  "text003": {
    "es": "Listas reutilizables de carriers (membresía exacta). Se comparten y replican con rateware.",
    "en": "Reusable carrier lists with exact membership. Shared and synchronized with rateware."
  },
  "text004": {
    "es": "Tablero público",
    "en": "Public board"
  },
  "text005": {
    "es": "Marketplace de oportunidades activas, sin exponer identidad de carriers.",
    "en": "Marketplace of active opportunities, keeping carrier identities private."
  },
  "text006": {
    "es": "Cotizaciones spot con los componentes del FCM: estima, aplica markup o manda a Bid Room.",
    "en": "Spot quotes using FCM components: estimate, apply markup or move to Bid Room."
  },
  "text007": {
    "es": "La base de carriers: pipeline, estatus en el TMS, contactos, duplicados y rebotes.",
    "en": "The carrier base: pipeline, TMS status, contacts, duplicates and bounces."
  },
  "text008": {
    "es": "Solicitudes nuevas",
    "en": "New requests"
  },
  "text009": {
    "es": "Shippers que ya respondieron su solicitud y esperan al equipo",
    "en": "Shippers who completed their requests and are waiting for the team"
  },
  "text010": {
    "es": "Eventos activos",
    "en": "Active events"
  },
  "text011": {
    "es": "Bid Rooms abiertos: aparecen en el tablero público",
    "en": "Open Bid Rooms: shown on the public board"
  },
  "text012": {
    "es": "Bids hoy",
    "en": "Bids today"
  },
  "text013": {
    "es": "Ofertas recibidas o revisadas desde las 00:00, incluidas las que capturó el equipo",
    "en": "Bids received or revised since midnight, including those entered by the team"
  },
  "text014": {
    "es": "Carriers en el CRM, sin contar los archivados",
    "en": "Carriers in the CRM, excluding archived carriers"
  },
  "text015": {
    "es": "Hola",
    "en": "Hello"
  },
  "text016": {
    "es": "Módulo Bid Room. Todo lo que creas aquí vive en el mismo backend que rateware.",
    "en": "Bid Room module. Everything you create here uses the same backend as rateware."
  }
};

export const tr = translator(copy);
