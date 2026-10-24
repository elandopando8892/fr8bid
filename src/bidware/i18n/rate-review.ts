import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  outcomeAwarded: { es: "Primaria adjudicada", en: "Awarded primary" },
  outcomeBackup: { es: "Respaldo", en: "Backup" },
  outcomeNotAwarded: { es: "No adjudicada", en: "Not awarded" },
  outcomeSubmitted: { es: "Oferta sin adjudicar", en: "Unawarded bid" },
  outcomeWithdrawn: { es: "Oferta retirada", en: "Withdrawn bid" },
  outcomeUnknown: { es: "Resultado RFx sin confirmar", en: "Unconfirmed RFx outcome" },
  rfxApprovalHeld: { es: "Requiere adjudicación primaria en RFx", en: "Requires a primary award in RFx" },
  "text001": {
    "es": "Corregir tarifa",
    "en": "Correct rate"
  },
  "text002": {
    "es": "El servidor no pudo ligar ese carrier (sin dominio, correo ni nombre que coincidan). Lo demás sí se guardó.",
    "en": "The server could not match that carrier (no matching domain, email or name). Everything else was saved."
  },
  "text003": {
    "es": "Cancelar",
    "en": "Cancel"
  },
  "text004": {
    "es": "Guardando…",
    "en": "Saving…"
  },
  "text005": {
    "es": "Guardar",
    "en": "Save"
  },
  "text006": {
    "es": "Carrier del CRM ",
    "en": "CRM carrier "
  },
  "text007": {
    "es": "Cambiar",
    "en": "Change"
  },
  "text008": {
    "es": "Buscar carrier por nombre, dominio o correo…",
    "en": "Search carrier by name, domain or email…"
  },
  "text009": {
    "es": "Tarifa all-in",
    "en": "All-in rate"
  },
  "text010": {
    "es": "Moneda",
    "en": "Currency"
  },
  "text011": {
    "es": "Fecha de cotización",
    "en": "Quote date"
  },
  "text012": {
    "es": "Capacidad / semana",
    "en": "Capacity / week"
  },
  "text013": {
    "es": "Operación",
    "en": "Operation"
  },
  "text014": {
    "es": "Servicio",
    "en": "Service"
  },
  "text015": {
    "es": " (como viene)",
    "en": " (as received)"
  },
  "text016": {
    "es": "Flete MX",
    "en": "MX linehaul"
  },
  "text017": {
    "es": "Flete US",
    "en": "US linehaul"
  },
  "text018": {
    "es": "Cruce",
    "en": "Crossing"
  },
  "text019": {
    "es": "Los componentes se guardan tal cual; el all-in no se recalcula con ellos.",
    "en": "Components are saved as entered; the all-in is not recalculated from them."
  },
  "text020": {
    "es": "Punto de cruce MX",
    "en": "MX crossing point"
  },
  "text021": {
    "es": "Punto de cruce US",
    "en": "US crossing point"
  },
  "text022": {
    "es": "Carga sin evento",
    "en": "Upload without event"
  },
  "text023": {
    "es": "Evento que ya no está en el Bid Room",
    "en": "Event no longer in Bid Room"
  },
  "text024": {
    "es": "Archivo cargado",
    "en": "Uploaded file"
  },
  "text025": {
    "es": "Ninguna de las tarifas elegidas se puede aprobar todavía: corrige lo que dicen sus avisos en rojo o mapea sus valores.",
    "en": "None of the selected rates can be approved yet: correct the red warnings or map their values."
  },
  "text026": {
    "es": "Se aprobarán {0} tarifa(s): entran al tarifario con los nombres del catálogo y su texto original queda en sus notas.",
    "en": "{0} rate(s) will be approved: they enter the rate base using catalog names, with the original text kept in their notes."
  },
  "text027": {
    "es": "\n\n{0} de las elegidas no se aprueban porque aún tienen pendientes.",
    "en": "\n\n{0} selected rates will not be approved because they still have pending issues."
  },
  "text028": {
    "es": "\n\nAntes se guardarán {0} sinónimo(s) en el catálogo compartido.",
    "en": "\n\nFirst, {0} synonym(s) will be saved in the shared catalog."
  },
  "text029": {
    "es": "\n\n¿Continuar?",
    "en": "\n\nContinue?"
  },
  "text030": {
    "es": "sinónimo «{0}»",
    "en": "synonym “{0}”"
  },
  "text031": {
    "es": "Se aprobaron {0} tarifa(s).",
    "en": "Approved {0} rate(s)."
  },
  "text032": {
    "es": " No se pudieron: {0}.",
    "en": " Could not complete: {0}."
  },
  "text033": {
    "es": "Se archivarán {0} tarifa(s): salen de la revisión y no entran al tarifario. Siguen guardadas, archivadas.\n\n¿Continuar?",
    "en": "{0} rate(s) will be archived: they leave review and do not enter the rate base. They remain saved as archived. Archive?"
  },
  "text034": {
    "es": "Se rechazarán {0} tarifa(s): no entran al tarifario y quedan marcadas como rechazadas.\n\n¿Continuar?",
    "en": "{0} rate(s) will be rejected: they do not enter the rate base and remain marked as rejected. Reject?"
  },
  "text035": {
    "es": "{0} tarifa(s) {1}.",
    "en": "{0} rate(s) {1}."
  },
  "text036": {
    "es": "Cargando tarifas en revisión…",
    "en": "Loading rates under review…"
  },
  "text037": {
    "es": "Procurement  ›  Tarifario",
    "en": "Procurement › Rate base"
  },
  "text038": {
    "es": "Revisión de tarifas",
    "en": "Rate review"
  },
  "text039": {
    "es": "Ofertas del Bid Room y tarifas cargadas que esperan entrar al tarifario",
    "en": "Bid Room offers and uploaded rates waiting to enter the rate base"
  },
  "text040": {
    "es": "Actualizar",
    "en": "Refresh"
  },
  "text041": {
    "es": "No pudimos leer el catálogo: {0}",
    "en": "Could not load the catalog: {0}"
  },
  "text042": {
    "es": " en revisión",
    "en": " under review"
  },
  "text043": {
    "es": " se pueden aprobar",
    "en": " ready for approval"
  },
  "text044": {
    "es": " con pendientes",
    "en": " with pending issues"
  },
  "text045": {
    "es": " de prueba",
    "en": " for testing"
  },
  "text046": {
    "es": "Elegir las que se pueden aprobar",
    "en": "Select rates ready for approval"
  },
  "text047": {
    "es": "No hay tarifas en revisión",
    "en": "No rates under review"
  },
  "text048": {
    "es": "Todo lo que llegó ya se aprobó, rechazó o archivó.",
    "en": "Everything received has been approved, rejected or archived."
  },
  "text049": {
    "es": "Valores que el catálogo no reconoce",
    "en": "Values the catalog does not recognize"
  },
  "text050": {
    "es": " por decidir",
    "en": " awaiting decision"
  },
  "text051": {
    "es": "El tarifario usa los nombres del catálogo en todas sus tarifas. Mapea cada valor; una tarifa con un valor sin mapear no se aprueba. «Guardar como sinónimo» (solo Administradores) hace que la próxima tarifa lo reconozca sola.",
    "en": "The rate base uses catalog names for all rates. Map each value; a rate with an unmapped value cannot be approved. “Save as synonym” (Administrators only) recognizes it automatically next time."
  },
  "text052": {
    "es": "Mapear todo con sugerencias",
    "en": "Map all suggestions"
  },
  "text053": {
    "es": "Elegir las tarifas de {0}",
    "en": "Select rates for {0}"
  },
  "text054": {
    "es": "PRUEBA",
    "en": "TEST"
  },
  "text055": {
    "es": " tarifa(s) · ",
    "en": " rate(s) · "
  },
  "text056": {
    "es": "Ruta",
    "en": "Route"
  },
  "text057": {
    "es": "Unidad",
    "en": "Unit"
  },
  "text058": {
    "es": "Operación · servicio",
    "en": "Operation · service"
  },
  "text059": {
    "es": "Tarifa",
    "en": "Rate"
  },
  "text060": {
    "es": "Vigencia",
    "en": "Validity"
  },
  "text061": {
    "es": "Estado",
    "en": "Status"
  },
  "text062": {
    "es": "Elegir {0} → {1}",
    "en": "Select {0} → {1}"
  },
  "text063": {
    "es": " sin moneda",
    "en": " no currency"
  },
  "text064": {
    "es": "costo ",
    "en": "cost "
  },
  "text065": {
    "es": " · cliente ",
    "en": " · customer "
  },
  "text066": {
    "es": "cotizada {0}",
    "en": "quoted {0}"
  },
  "text067": {
    "es": " · {0}/sem",
    "en": " · {0}/wk"
  },
  "text068": {
    "es": "Lista",
    "en": "Ready"
  },
  "text069": {
    "es": "Por mapear",
    "en": "To map"
  },
  "text070": {
    "es": "Corregir",
    "en": "Correct"
  },
  "text071": {
    "es": " elegida(s) · ",
    "en": " selected · "
  },
  "text072": {
    "es": " · aprobar es de un Administrador",
    "en": " · approval requires an Administrator"
  },
  "text073": {
    "es": "Quitar selección",
    "en": "Clear selection"
  },
  "text074": {
    "es": "Archivando…",
    "en": "Archiving…"
  },
  "text075": {
    "es": "Archivar",
    "en": "Archive"
  },
  "text076": {
    "es": "Rechazando…",
    "en": "Rejecting…"
  },
  "text077": {
    "es": "Rechazar",
    "en": "Reject"
  },
  "text078": {
    "es": "Aprobando {0}…",
    "en": "Approving {0}…"
  },
  "text079": {
    "es": "Aprobar {0}",
    "en": "Approve {0}"
  },
  "text080": {
    "es": "Sin tarifa",
    "en": "No rate"
  },
  "text081": {
    "es": "La tarifa trae texto",
    "en": "The rate contains text"
  },
  "text082": {
    "es": "El desglose no cuadra con el all-in",
    "en": "Breakdown does not match the all-in"
  },
  "text083": {
    "es": "Sin moneda",
    "en": "No currency"
  },
  "text084": {
    "es": "Sin ubicar origen o destino",
    "en": "Origin or destination not located"
  },
  "text085": {
    "es": "Sin carrier del CRM",
    "en": "No CRM carrier"
  },
  "text086": {
    "es": "Sin fecha de cotización",
    "en": "No quote date"
  },
  "text087": {
    "es": "Sin operación",
    "en": "No operation"
  },
  "text088": {
    "es": "Sin servicio",
    "en": "No service"
  },
  "text089": {
    "es": "Cruce sin puntos de cruce MX y US",
    "en": "Crossing without MX and US crossing points"
  },
  "text090": {
    "es": "El servicio no coincide con la oferta",
    "en": "Service does not match the offer"
  },
  "text091": {
    "es": "Revisar la fuente (avisos o confianza baja)",
    "en": "Review the source (warnings or low confidence)"
  }
};

export const tr = translator(copy);

const wordCopy={
  "word0": {
    "es": "sin carrier",
    "en": "no carrier"
  },
  "word1": {
    "es": "(ligado)",
    "en": "(matched)"
  },
  "word2": {
    "es": "(sin ligar)",
    "en": "(unmatched)"
  },
  "word3": {
    "es": "archivadas",
    "en": "archived"
  },
  "word4": {
    "es": "rechazadas",
    "en": "rejected"
  },
  "word5": {
    "es": "tarifa(s)",
    "en": "rate(s)"
  }
};
export const words=translator(wordCopy);
