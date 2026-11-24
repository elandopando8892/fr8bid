import { translator, type Lang } from "./language";

/**
 * Bid Room del carrier, etapa 3: la plantilla de Excel. La plantilla se descarga
 * en el idioma elegido y se importa en cualquiera de los dos: los encabezados de
 * cada idioma son un formato exacto, no se mezclan.
 */
export const excelCopy = {
  // Archivo y hojas
  "file.name": { es: "ofertas-rfx.xlsx", en: "rfx-offers.xlsx" },
  "sheet.offers": { es: "Ofertas", en: "Offers" },
  "sheet.help": { es: "Instrucciones y modelos", en: "Instructions and models" },

  // Columnas de identidad
  "col.event_id": { es: "Evento ID", en: "Event ID" },
  "col.invitation_id": { es: "Invitación ID", en: "Invitation ID" },
  "col.lane_id": { es: "Ruta ID", en: "Lane ID" },
  "col.lane_number": { es: "Ruta #", en: "Lane #" },
  "col.origin": { es: "Origen", en: "Origin" },
  "col.destination": { es: "Destino", en: "Destination" },
  "col.equipment": { es: "Equipo", en: "Equipment" },
  "col.baseline": { es: "Base de oferta", en: "Offer baseline" },
  "col.send": { es: "Enviar ruta", en: "Send lane" },

  // Columnas de la oferta
  "col.bid_rate": { es: "Tarifa carrier", en: "Carrier rate" },
  "col.currency": { es: "Moneda", en: "Currency" },
  "col.commercial_model": { es: "Modelo comercial", en: "Commercial model" },
  "col.pct": { es: "Porcentaje", en: "Percentage" },
  "col.weekly_capacity": { es: "Capacidad semanal", en: "Weekly capacity" },
  "col.transit_days": { es: "Tránsito (días)", en: "Transit (days)" },
  "col.valid_through": { es: "Vigente hasta", en: "Valid through" },
  "col.equipment_available": { es: "Equipo disponible", en: "Equipment available" },
  "col.current_unit_location": { es: "Ubicación de unidad", en: "Unit location" },
  "col.deadhead_distance": { es: "Vacío al origen", en: "Deadhead to origin" },
  "col.deadhead_unit": { es: "Unidad de vacío", en: "Deadhead unit" },
  "col.unit_details": { es: "Detalle de unidad", en: "Unit details" },
  "col.eta_pickup": { es: "ETA recolección", en: "Pickup ETA" },
  "col.eta_delivery": { es: "ETA entrega", en: "Delivery ETA" },
  "col.mirror_account_enabled": { es: "Cuenta espejo GPS", en: "GPS mirror account" },
  "col.best_alternative_offered": { es: "Ofrezco alternativa", en: "Alternative offered" },
  "col.alternative_equipment": { es: "Equipo alternativo", en: "Alternative equipment" },
  "col.alternative_units": { es: "Unidades alternativas", en: "Alternative units" },
  "col.alternative_notes": { es: "Condiciones alternativas", en: "Alternative conditions" },
  "col.best_final": { es: "Oferta final", en: "Final offer" },
  "col.notes": { es: "Notas", en: "Notes" },

  // Valores
  "val.yes": { es: "Sí", en: "Yes" },
  "val.no": { es: "No", en: "No" },
  "val.none": { es: "Sin dato", en: "No data" },
  "val.pct": { es: "{0} %", en: "{0} %" },
  "val.pctDefault": { es: "{0} % (predeterminado)", en: "{0} % (default)" },

  // Hoja de instrucciones
  "help.title": { es: "Cómo responder", en: "How to answer" },
  "help.send": {
    es: "Marca Sí en Enviar ruta solo para las ofertas que deseas registrar. Importar no envía.",
    en: "Write Yes in Send lane only for the offers you want to record. Importing does not send.",
  },
  "help.keep": {
    es: "Conserva las columnas, IDs y Base de oferta; usa esta plantilla únicamente con la misma invitación.",
    en: "Keep the columns, IDs and Offer baseline; use this template only with the same invitation.",
  },
  "help.blank": {
    es: "Los campos vacíos sustituyen/borran el dato anterior al enviar. Revisa todos los datos antes de confirmar.",
    en: "Blank fields replace/clear the previous value when sent. Review all the data before confirming.",
  },
  "help.dates": {
    es: "Fechas: AAAA-MM-DD. ETA: AAAA-MM-DDTHH:mm en la zona horaria de tu navegador.",
    en: "Dates: YYYY-MM-DD. ETA: YYYY-MM-DDTHH:mm in your browser's time zone.",
  },
  "help.numbers": {
    es: "Números: punto decimal, sin separadores de miles. Sí/No para confirmaciones. Vacío: mi o km.",
    en: "Numbers: decimal point, no thousands separators. Yes/No for confirmations. Deadhead: mi or km.",
  },
  "help.values": {
    es: "Usa valores, no fórmulas. Si ya cambió una oferta, descarga una plantilla nueva.",
    en: "Use values, not formulas. If an offer has already changed, download a new template.",
  },
  "help.locked": {
    es: "XBF compra-venta es fijo. Captura tu tarifa de venta a XBF; no captures porcentajes.",
    en: "XBF buy-sell is fixed. Enter your sell rate to XBF; do not enter percentages.",
  },
  "help.model": {
    es: "Modelo comercial: opcional. Celda vacía = MARKSMAN lo define antes de adjudicar. Si lo indicas, usa uno de la tabla de abajo.",
    en: "Commercial model: optional. Empty cell = MARKSMAN sets it before awarding. If you enter one, use a model from the table below.",
  },
  "help.pct": {
    es: "Porcentaje vacío: se aplica el predeterminado del modelo. No escribas 0.03 para 3 %; escribe 3.",
    en: "Blank percentage: the model's default applies. Do not write 0.03 for 3 %; write 3.",
  },
  "help.colModel": { es: "Modelo", en: "Model" },
  "help.colEnter": { es: "Captura", en: "What you enter" },
  "help.colEffect": { es: "Efecto", en: "Effect" },
  "help.colMin": { es: "Mínimo %", en: "Minimum %" },
  "help.colMax": { es: "Máximo %", en: "Maximum %" },
  "help.colDefault": { es: "Predeterminado %", en: "Default %" },
  "help.colBilling": { es: "Facturación", en: "Billing" },

  // Errores al importar
  "err.yesNo": { es: "{0}: escribe Sí o No.", en: "{0}: write Yes or No." },
  "err.dateFormat": {
    es: "{0}: fecha inválida; usa el formato de las instrucciones.",
    en: "{0}: invalid date; use the format in the instructions.",
  },
  "err.etaOrder": {
    es: "La ETA de entrega debe ser posterior a la recolección.",
    en: "The delivery ETA must be after the pickup.",
  },
  "err.tooBig": { es: "El archivo supera 5 MiB.", en: "The file is over 5 MiB." },
  "err.noSheet": {
    es: "Falta la hoja Ofertas; descarga la plantilla de este Bid Room.",
    en: "The Offers sheet is missing; download the template from this Bid Room.",
  },
  "err.size": {
    es: "La plantilla admite hasta 1,000 rutas y sus columnas originales.",
    en: "The template accepts up to 1,000 lanes and its original columns.",
  },
  "err.formula": {
    es: "Celda {0}: sustituye fórmulas o errores por valores.",
    en: "Cell {0}: replace formulas or errors with values.",
  },
  "err.headers": {
    es: "Las columnas no coinciden con la plantilla. Descarga una nueva y conserva todos sus encabezados.",
    en: "The columns do not match the template. Download a new one and keep all its headers.",
  },
  "err.foreign": { es: "La ruta no pertenece a esta invitación.", en: "The lane does not belong to this invitation." },
  "err.duplicate": { es: "La ruta está duplicada.", en: "The lane is duplicated." },
  "err.closed": { es: "La ruta ya no admite ofertas.", en: "The lane no longer accepts offers." },
  "err.stale": {
    es: "La oferta cambió desde la descarga; descarga una nueva plantilla.",
    en: "The offer changed since the download; download a new template.",
  },
  "err.missing": { es: "La plantilla omite datos requeridos.", en: "The template is missing required data." },
  "err.date": { es: "{0}: fecha inválida.", en: "{0}: invalid date." },
  // {0} es el nombre de la columna tal como viene en el archivo; {1}, el de su hoja de instrucciones.
  "err.model": {
    es: "{0} desconocido; usa uno de los modelos de la hoja {1} o deja la celda vacía.",
    en: "{0}: unknown model; use one of the models in the {1} sheet or leave the cell empty.",
  },
  "err.modelNotAccepted": {
    es: "{0}: este evento no acepta ese modelo. Acepta: {1}.",
    en: "{0}: this event does not accept that model. It accepts: {1}.",
  },
  "err.currency": {
    es: "{0}: usa tres letras, por ejemplo USD o MXN.",
    en: "{0}: use three letters, for example USD or MXN.",
  },
  "err.deadheadUnit": { es: "{0}: usa mi o km.", en: "{0}: use mi or km." },
  "err.number": {
    es: "{0}: usa un número positivo o cero, con punto decimal y sin separadores.",
    en: "{0}: use a positive number or zero, with a decimal point and no separators.",
  },
  "err.alternative": {
    es: "Hay datos de alternativa: marca Sí en {0} o borra esos campos para no perderlos al enviar.",
    en: "There is alternative data: write Yes in {0} or clear those fields so they are not lost when sending.",
  },
  "err.row": { es: "Fila {0}: {1}", en: "Row {0}: {1}" },
  "err.none": {
    es: "Marca Sí en {0} para al menos una oferta.",
    en: "Write Yes in {0} for at least one offer.",
  },
  "err.changed": {
    es: "Ruta {0}: cambió la oferta, su acceso o los modelos del evento. Recarga y descarga una nueva plantilla.",
    en: "Lane {0}: the offer, its access or the event's models changed. Reload and download a new template.",
  },
} as const;

export const xls = translator(excelCopy);

/** A text in a given language, whatever the page shows: a file keeps the language it was downloaded in. */
export const excelText = (key: keyof typeof excelCopy, lang: Lang): string => excelCopy[key][lang];
