import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  "text001": {
    "es": "Correo",
    "en": "Email"
  },
  "text002": {
    "es": "Imagen",
    "en": "Image"
  },
  "text003": {
    "es": "SIN LEER",
    "en": "UNREAD"
  },
  "text004": {
    "es": "LEYENDO",
    "en": "READING"
  },
  "text005": {
    "es": "LEÍDO",
    "en": "READ"
  },
  "text006": {
    "es": "{0}: {1} tarifa(s) listas para revisar",
    "en": "{0}: {1} rate(s) ready for review"
  },
  "text007": {
    "es": " (el archivo parece tener {0}; revisa si faltan y vuelve a leerlo con una nota)",
    "en": " (the file appears to contain {0}; check for missing rates and read it again with a note)"
  },
  "text008": {
    "es": "Subiendo {0}…",
    "en": "Uploading {0}…"
  },
  "text009": {
    "es": "Leyendo {0}… puede tardar un minuto.",
    "en": "Reading {0}… this may take a minute."
  },
  "text010": {
    "es": "El archivo se guardó, pero no se pudo leer: {0}. Vuelve a intentarlo con \"Leer\" en la lista.",
    "en": "The file was saved but could not be read: {0}. Try again using “Read” in the list."
  },
  "text011": {
    "es": "Error: {0}",
    "en": "Error: {0}"
  },
  "text012": {
    "es": "Leer {0} de nuevo archiva las {1} tarifa(s) que dio antes y las reemplaza. ",
    "en": "Reading {0} again archives its previous {1} rate(s) and replaces them. "
  },
  "text013": {
    "es": "Si ya había tarifas aprobadas, solo un Administrador puede hacerlo.\n\n",
    "en": "If any rates were already approved, only an Administrator can do this.\n\n"
  },
  "text014": {
    "es": "Nota para la lectura (opcional), por ejemplo qué faltó o qué leyó mal:",
    "en": "Reading note (optional), for example what was missed or read incorrectly:"
  },
  "text015": {
    "es": "{0} sale de la lista. Sus tarifas se quedan como están.\n\n¿Archivar?",
    "en": "{0} leaves the list. Its rates remain unchanged. Archive?"
  },
  "text016": {
    "es": "{0} archivado.",
    "en": "{0} archived."
  },
  "text017": {
    "es": "Vas a BORRAR {0} y TODAS las tarifas que salieron de él ({1}), ",
    "en": "You are about to DELETE {0} and ALL rates extracted from it ({1}), "
  },
  "text018": {
    "es": "también las aprobadas en el tarifario. No se puede deshacer. Si alguna está aprobada, solo un Administrador puede.\n\n",
    "en": "including approved rates in the rate base. This cannot be undone. If any are approved, only an Administrator can do it.\n\n"
  },
  "text019": {
    "es": "Para solo quitarlo de la lista, usa Archivar.\n\n¿Borrar?",
    "en": "To remove it from the list only, use Archive. Delete?"
  },
  "text020": {
    "es": "{0} y sus tarifas se borraron.",
    "en": "{0} and its rates were deleted."
  },
  "text021": {
    "es": "Tarifas",
    "en": "Rates"
  },
  "text022": {
    "es": "Archivos de tarifas",
    "en": "Rate files"
  },
  "text023": {
    "es": "Sube la lista de precios o cotización de un carrier y se lee en tarifas para revisar",
    "en": "Upload a carrier price list or quote to extract rates for review"
  },
  "text024": {
    "es": "Revisión de tarifas",
    "en": "Rate review"
  },
  "text025": {
    "es": "Actualizar",
    "en": "Refresh"
  },
  "text026": {
    "es": "Subir un archivo",
    "en": "Upload a file"
  },
  "text027": {
    "es": "Excel (.xlsx), PDF, correo (.eml) o imagen. Al subirlo se lee solo; las tarifas que salgan quedan en Revisión de tarifas para aprobarlas.",
    "en": "Excel (.xlsx), PDF, email (.eml) or image. Uploading starts extraction automatically; extracted rates go to Rate review for approval."
  },
  "text028": {
    "es": "Archivo",
    "en": "File"
  },
  "text029": {
    "es": "Carrier (opcional)",
    "en": "Carrier (optional)"
  },
  "text030": {
    "es": "Cambiar",
    "en": "Change"
  },
  "text031": {
    "es": "Buscar carrier…",
    "en": "Search carrier…"
  },
  "text032": {
    "es": "RFx (opcional)",
    "en": "RFx (optional)"
  },
  "text033": {
    "es": "Ese tipo de archivo no se acepta",
    "en": "File type not accepted"
  },
  "text034": {
    "es": "Procesando…",
    "en": "Processing…"
  },
  "text035": {
    "es": "Subir y leer",
    "en": "Upload and read"
  },
  "text036": {
    "es": "{0}: solo Excel (.xlsx), PDF, correo (.eml) o imagen.",
    "en": "{0}: Excel (.xlsx), PDF, email (.eml) or image only."
  },
  "text037": {
    "es": "Cargando archivos…",
    "en": "Loading files…"
  },
  "text038": {
    "es": "Del equipo (",
    "en": "Team files ("
  },
  "text039": {
    "es": "Ofertas del Bid Room (",
    "en": "Bid Room offers ("
  },
  "text040": {
    "es": "Las guarda el sistema con cada oferta de un carrier; solo se consultan.",
    "en": "The system saves them with each carrier offer; they are read-only."
  },
  "text041": {
    "es": "Subido",
    "en": "Uploaded"
  },
  "text042": {
    "es": "Estado",
    "en": "Status"
  },
  "text043": {
    "es": " advertencia(s) al leer",
    "en": " reading warning(s)"
  },
  "text044": {
    "es": "de ~",
    "en": "of ~"
  },
  "text045": {
    "es": " en el archivo",
    "en": " in the file"
  },
  "text046": {
    "es": "Ver archivo",
    "en": "View file"
  },
  "text047": {
    "es": "Leyendo…",
    "en": "Reading…"
  },
  "text048": {
    "es": "Leer de nuevo",
    "en": "Read again"
  },
  "text049": {
    "es": "Leer",
    "en": "Read"
  },
  "text050": {
    "es": "Archivar",
    "en": "Archive"
  },
  "text051": {
    "es": "Si alguna de sus tarifas está aprobada, solo un Administrador puede borrarlo",
    "en": "If any of its rates are approved, only an Administrator can delete it"
  },
  "text052": {
    "es": "Borrar",
    "en": "Delete"
  },
  "text053": {
    "es": " de ",
    "en": " of "
  },
  "text054": {
    "es": "Mostrar todos (",
    "en": "Show all ("
  },
  "text055": {
    "es": "Sin archivos del equipo",
    "en": "No team files"
  },
  "text056": {
    "es": "Sin ofertas guardadas",
    "en": "No saved offers"
  },
  "text057": {
    "es": "Sube el primero arriba.",
    "en": "Upload the first above."
  }
};

export const tr = translator(copy);

const extraCopy={
  "extra0": {
    "es": "{0}: solo Excel (.xlsx), PDF, correo (.eml) o imagen.",
    "en": "{0}: Excel (.xlsx), PDF, email (.eml) or image only."
  },
  "extra1": {
    "es": "Inicia sesión para continuar.",
    "en": "Sign in to continue."
  },
  "extra2": {
    "es": "El archivo original no está disponible.",
    "en": "The original file is unavailable."
  },
  "extra3": {
    "es": "No se pudo subir el archivo ({0}).",
    "en": "Could not upload the file ({0})."
  }
};
export const extra=translator(extraCopy);

const wordCopy={
  "word0": {
    "es": "el archivo",
    "en": "the file"
  }
};
export const words=translator(wordCopy);
