import { translator } from "./language";

/** The website tray (Shipper intake page). */
export const copy = {
  "title": {
    "es": "Solicitudes del sitio web",
    "en": "Website requests"
  },
  "hint": {
    "es": "Leads de shippers y tarifarios de carriers que llegaron por heymarksman.com, xbfreight.com y el sitio del grupo. Nada entra al CRM, a QuoteDesk ni a las cargas hasta que alguien decide.",
    "en": "Shipper leads and carrier rate sheets from heymarksman.com, xbfreight.com and the group site. Nothing reaches the CRM, QuoteDesk or uploads until someone decides."
  },
  "tabLeads": {
    "es": "Leads",
    "en": "Leads"
  },
  "tabSheets": {
    "es": "Tarifarios",
    "en": "Rate sheets"
  },
  "pendingOnly": {
    "es": "Solo pendientes",
    "en": "Pending only"
  },
  "loading": {
    "es": "Cargando solicitudes del sitio…",
    "en": "Loading website requests…"
  },
  "emptyLeads": {
    "es": "No hay leads pendientes.",
    "en": "No pending leads."
  },
  "emptySheets": {
    "es": "No hay tarifarios pendientes.",
    "en": "No pending rate sheets."
  },
  "colWhen": {
    "es": "Llegó",
    "en": "Received"
  },
  "colSite": {
    "es": "Sitio",
    "en": "Site"
  },
  "colCompany": {
    "es": "Empresa y contacto",
    "en": "Company and contact"
  },
  "colCorridor": {
    "es": "Corredor",
    "en": "Lane"
  },
  "colFile": {
    "es": "Archivo y cobertura",
    "en": "File and coverage"
  },
  "colStatus": {
    "es": "Estado",
    "en": "Status"
  },
  "pending": {
    "es": "PENDIENTE",
    "en": "PENDING"
  },
  "promoted": {
    "es": "PROMOVIDO",
    "en": "PROMOTED"
  },
  "registered": {
    "es": "REGISTRADO",
    "en": "REGISTERED"
  },
  "dismissed": {
    "es": "DESCARTADO",
    "en": "DISMISSED"
  },
  "promote": {
    "es": "Promover a solicitud Spot",
    "en": "Promote to Spot request"
  },
  "register": {
    "es": "Registrar tarifario",
    "en": "Register rate sheet"
  },
  "dismiss": {
    "es": "Descartar",
    "en": "Dismiss"
  },
  "viewFile": {
    "es": "Ver archivo",
    "en": "View file"
  },
  "promoteTitle": {
    "es": "Promover lead a solicitud Spot",
    "en": "Promote lead to Spot request"
  },
  "promoteHint": {
    "es": "Elige el shipper del CRM y completa la ruta. La solicitud aparece en la lista de arriba como enviada y desde ahí se vuelve cotización en QuoteDesk.",
    "en": "Pick the CRM shipper and complete the lane. The request shows up in the list above as submitted, and from there it becomes a QuoteDesk quote."
  },
  "visitorWrote": {
    "es": "Lo que escribió el visitante",
    "en": "What the visitor wrote"
  },
  "shipper": {
    "es": "Shipper",
    "en": "Shipper"
  },
  "origin": {
    "es": "Origen",
    "en": "Origin"
  },
  "destination": {
    "es": "Destino",
    "en": "Destination"
  },
  "truckType": {
    "es": "Tipo de equipo",
    "en": "Equipment type"
  },
  "trailer": {
    "es": "Caja o remolque",
    "en": "Trailer"
  },
  "loadsPerWeek": {
    "es": "Cargas por semana",
    "en": "Loads per week"
  },
  "weight": {
    "es": "Peso promedio (lb)",
    "en": "Average weight (lb)"
  },
  "border": {
    "es": "Cruce fronterizo",
    "en": "Border crossing"
  },
  "product": {
    "es": "Producto",
    "en": "Product"
  },
  "targetRate": {
    "es": "Tarifa objetivo del cliente",
    "en": "Customer target rate"
  },
  "currency": {
    "es": "Moneda",
    "en": "Currency"
  },
  "missing": {
    "es": "Falta: {0}",
    "en": "Missing: {0}"
  },
  "confirmPromote": {
    "es": "Promover",
    "en": "Promote"
  },
  "registerTitle": {
    "es": "Registrar tarifario en el Carrier CRM",
    "en": "Register rate sheet in the Carrier CRM"
  },
  "registerHint": {
    "es": "El archivo queda como carga del carrier elegido. La lectura y la aprobación de tarifas siguen en Cargas de tarifas, como cualquier otro archivo.",
    "en": "The file becomes an upload of the chosen carrier. Reading and approving rates stays in Rate uploads, like any other file."
  },
  "carrier": {
    "es": "Carrier",
    "en": "Carrier"
  },
  "searchCarrier": {
    "es": "Busca por nombre o dominio",
    "en": "Search by name or domain"
  },
  "noCarrier": {
    "es": "No hay carriers con ese nombre. Dalo de alta en el Carrier CRM y vuelve.",
    "en": "No carriers by that name. Add it in the Carrier CRM and come back."
  },
  "confirmRegister": {
    "es": "Registrar",
    "en": "Register"
  },
  "xlsxOnly": {
    "es": "Solo se registran archivos XLSX. Pide al carrier la plantilla en Excel o descarta este envío.",
    "en": "Only XLSX files can be registered. Ask the carrier for the Excel template or dismiss this one."
  },
  "dismissPrompt": {
    "es": "¿Por qué se descarta? (opcional, queda en la bitácora)",
    "en": "Why dismiss it? (optional, kept in the log)"
  },
  "final": {
    "es": "Esta decisión es definitiva.",
    "en": "This decision is final."
  },
  "cancel": {
    "es": "Cancelar",
    "en": "Cancel"
  },
  "working": {
    "es": "Guardando…",
    "en": "Saving…"
  },
  "donePromoted": {
    "es": "Solicitud Spot abierta. Conviértela en cotización desde la lista de arriba.",
    "en": "Spot request opened. Turn it into a quote from the list above."
  },
  "doneRegistered": {
    "es": "Tarifario registrado en las cargas del carrier.",
    "en": "Rate sheet registered in the carrier's uploads."
  },
  "doneDismissed": {
    "es": "Descartado.",
    "en": "Dismissed."
  },
  "openUploads": {
    "es": "Ir a Cargas de tarifas",
    "en": "Go to Rate uploads"
  },
  "errDecided": {
    "es": "Esta solicitud ya tiene una decisión. Recarga la lista.",
    "en": "This request already has a decision. Reload the list."
  },
  "errKind": {
    "es": "Este envío es de otro tipo. Recarga la lista.",
    "en": "This submission is of another kind. Reload the list."
  },
  "errRecord": {
    "es": "El shipper o carrier no está disponible en tu espacio (puede estar archivado).",
    "en": "The shipper or carrier isn't available in your workspace (it may be archived)."
  },
  "errXlsx": {
    "es": "El archivo guardado no es un XLSX válido.",
    "en": "The stored file isn't a valid XLSX."
  },
  "errLane": {
    "es": "La ruta está incompleta: origen, destino, equipo y cargas por semana son obligatorios.",
    "en": "The lane is incomplete: origin, destination, equipment and loads per week are required."
  },
  "errForbidden": {
    "es": "Tu rol no permite decidir solicitudes del sitio.",
    "en": "Your role can't decide website requests."
  },
  "errUnavailable": {
    "es": "La bandeja del sitio no está disponible por ahora. No se guardó nada; inténtalo más tarde.",
    "en": "The website tray isn't available right now. Nothing was saved; try again later."
  },
  "readOnly": {
    "es": "Solo lectura: tu rol puede ver la bandeja pero no decidir.",
    "en": "Read only: your role can see the tray but not decide."
  }
};

export const tr = translator(copy);
