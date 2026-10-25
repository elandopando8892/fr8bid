import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  "text001": {
    "es": "Aprobada",
    "en": "Approved"
  },
  "text002": {
    "es": "Editada",
    "en": "Edited"
  },
  "text003": {
    "es": "Regresada a revisión",
    "en": "Returned to review"
  },
  "text004": {
    "es": "Archivada",
    "en": "Archived"
  },
  "text005": {
    "es": "Borrada",
    "en": "Deleted"
  },
  "text006": {
    "es": "Carrier ligado",
    "en": "Carrier matched"
  },
  "text007": {
    "es": "Lugares renormalizados",
    "en": "Locations normalized again"
  },
  "text008": {
    "es": "Cambio masivo",
    "en": "Bulk update"
  },
  "text009": {
    "es": "Borrado masivo",
    "en": "Bulk deletion"
  },
  "text010": {
    "es": "Cambio de estado",
    "en": "Status change"
  },
  "text011": {
    "es": "Carga masiva",
    "en": "Bulk upload"
  },
  "text012": {
    "es": "Equipo",
    "en": "Equipment"
  },
  "text013": {
    "es": "Este filtro tiene {0} tarifas; el archivo lleva las primeras ",
    "en": "This filter contains {0} rates; the file contains the first "
  },
  "text014": {
    "es": "{0}. Para el resto, afina la búsqueda.\n\n¿Exportar?",
    "en": "{0}. Refine the search for the rest. Export?"
  },
  "text015": {
    "es": "Preparando el archivo…",
    "en": "Preparing file…"
  },
  "text016": {
    "es": "Preparando el archivo… {0} de {1}",
    "en": "Preparing file… {0} of {1}"
  },
  "text017": {
    "es": "Exportadas {0} tarifas.",
    "en": "Exported {0} rates."
  },
  "text018": {
    "es": "Error: {0}",
    "en": "Error: {0}"
  },
  "text019": {
    "es": "La tarifa {0} → {1} ",
    "en": "Rate {0} → {1} "
  },
  "text020": {
    "es": "sale del tarifario (QuoteDesk y los Ratebooks dejan de usarla) y regresa a Revisión de tarifas, ",
    "en": "leaves the rate base (QuoteDesk and Ratebooks stop using it) and returns to Rate review, "
  },
  "text021": {
    "es": "donde se corrigen el lane y los lugares y se vuelve a aprobar.\n\n¿Por qué regresa?",
    "en": "where its lane and locations can be corrected before approval. Why is it being returned?"
  },
  "text022": {
    "es": "Escribe por qué regresa; queda en las notas de la tarifa.",
    "en": "Enter the reason; it will be kept in the rate notes."
  },
  "text023": {
    "es": "La tarifa regresó a Revisión de tarifas.",
    "en": "The rate returned to Rate review."
  },
  "text024": {
    "es": "Tarifas",
    "en": "Rates"
  },
  "text025": {
    "es": "Tarifario",
    "en": "Rate base"
  },
  "text026": {
    "es": "Las tarifas aprobadas: las que usan QuoteDesk y los Ratebooks",
    "en": "Approved rates: used by QuoteDesk and Ratebooks"
  },
  "text027": {
    "es": "Revisión de tarifas",
    "en": "Rate review"
  },
  "text028": {
    "es": "Actualizar",
    "en": "Refresh"
  },
  "text029": {
    "es": "Exportando…",
    "en": "Exporting…"
  },
  "text030": {
    "es": "Exportar CSV",
    "en": "Export CSV"
  },
  "text031": {
    "es": "Corregir tarifa aprobada",
    "en": "Correct approved rate"
  },
  "text032": {
    "es": "Tarifa corregida; sigue aprobada.",
    "en": "Rate corrected; it remains approved."
  },
  "text033": {
    "es": "Buscar ruta, ciudad, carrier o RFx…",
    "en": "Search lane, city, carrier or RFx…"
  },
  "text034": {
    "es": "Buscar",
    "en": "Search"
  },
  "text035": {
    "es": "Quitar búsqueda",
    "en": "Clear search"
  },
  "text036": {
    "es": "Operación",
    "en": "Operation"
  },
  "text037": {
    "es": "Servicio",
    "en": "Service"
  },
  "text038": {
    "es": "Toda operación",
    "en": "All operations"
  },
  "text039": {
    "es": "Todo servicio",
    "en": "All services"
  },
  "text040": {
    "es": "Tarifas con este filtro",
    "en": "Rates with this filter"
  },
  "text041": {
    "es": "Buscando en todo el tarifario… con filtros puede tardar hasta medio minuto.",
    "en": "Searching the entire rate base… filtered searches may take up to half a minute."
  },
  "text042": {
    "es": "Cargando tarifas…",
    "en": "Loading rates…"
  },
  "text043": {
    "es": "Operación / servicio",
    "en": "Operation / service"
  },
  "text044": {
    "es": "Capacidad",
    "en": "Capacity"
  },
  "text045": {
    "es": "Cotizada",
    "en": "Quoted"
  },
  "text046": {
    "es": "Cruce ",
    "en": "Crossing "
  },
  "text047": {
    "es": "Corregir",
    "en": "Correct"
  },
  "text048": {
    "es": "Historial",
    "en": "History"
  },
  "text049": {
    "es": "Para corregir el lane o los lugares",
    "en": "To correct the lane or locations"
  },
  "text050": {
    "es": "Regresando…",
    "en": "Returning…"
  },
  "text051": {
    "es": "Regresar a revisión",
    "en": "Return to review"
  },
  "text052": {
    "es": " de ",
    "en": " of "
  },
  "text053": {
    "es": "← Anterior",
    "en": "← Previous"
  },
  "text054": {
    "es": "Siguiente →",
    "en": "Next →"
  },
  "text055": {
    "es": "Ninguna tarifa con este filtro",
    "en": "No rates with this filter"
  },
  "text056": {
    "es": "Prueba con otra búsqueda o quita filtros.",
    "en": "Try another search or clear filters."
  },
  "text057": {
    "es": "Historial de la tarifa",
    "en": "Rate history"
  },
  "text058": {
    "es": "Cargando historial…",
    "en": "Loading history…"
  },
  "text059": {
    "es": "Sin movimientos registrados",
    "en": "No recorded changes"
  },
  "text060": {
    "es": "Las tarifas cargadas antes del registro de cambios no tienen historial.",
    "en": "Rates uploaded before change tracking began have no history."
  },
  "text061": {
    "es": "Ruta",
    "en": "Lane"
  },
  "text062": {
    "es": "Más",
    "en": "More"
  }
};

export const tr = translator(copy);

const wordCopy={
  "word0": {
    "es": "sin carrier",
    "en": "no carrier"
  }
};
export const words=translator(wordCopy);
