import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  originFallback: { es: "origen", en: "origin" },
  destinationFallback: { es: "destino", en: "destination" },
  "text001": {
    "es": "Adicionales + markup",
    "en": "Accessorials + markup"
  },
  "text002": {
    "es": "Cancelar",
    "en": "Cancel"
  },
  "text003": {
    "es": "Aplicar al cálculo",
    "en": "Apply to calculation"
  },
  "text004": {
    "es": "Accesoriales",
    "en": "Accessorials"
  },
  "text005": {
    "es": "Concepto",
    "en": "Item"
  },
  "text006": {
    "es": "Unidad",
    "en": "Unit"
  },
  "text007": {
    "es": "Cant",
    "en": "Qty"
  },
  "text008": {
    "es": "Tarifa",
    "en": "Rate"
  },
  "text009": {
    "es": "Incluir {0}",
    "en": "Include {0}"
  },
  "text010": {
    "es": "adicional",
    "en": "accessorial"
  },
  "text011": {
    "es": "+ Agregar accesorial",
    "en": "+ Add accessorial"
  },
  "text012": {
    "es": "Subtotal adicionales",
    "en": "Accessorials subtotal"
  },
  "text013": {
    "es": "Costo base",
    "en": "Base cost"
  },
  "text014": {
    "es": "+ Adicionales",
    "en": "+ Accessorials"
  },
  "text015": {
    "es": "Margen",
    "en": "Margin"
  },
  "text016": {
    "es": "Los costos no pueden ser negativos.",
    "en": "Costs cannot be negative."
  },
  "text017": {
    "es": "El markup en % debe estar entre -100 y 1000.",
    "en": "Markup percentage must be between -100 and 1000."
  },
  "text018": {
    "es": "El margen objetivo debe ser mayor o igual a 0 y menor a 100%.",
    "en": "Target margin must be at least 0 and below 100%."
  },
  "text019": {
    "es": " · diésel del {0}",
    "en": " · diesel as of {0}"
  },
  "text020": {
    "es": "FSC de EUA por estado",
    "en": "US FSC by state"
  },
  "text021": {
    "es": "Elige origen y destino del catálogo para calcular millas.",
    "en": "Choose origin and destination from the catalog to calculate miles."
  },
  "text022": {
    "es": "Alguna parte de la ruta no se pudo medir ({0}); escríbela a mano.",
    "en": "Part of the route could not be measured ({0}); enter it manually."
  },
  "text023": {
    "es": "Alguna parte de la ruta no está en el catálogo de millas; escríbela a mano.",
    "en": "Part of the route is not in the mileage catalog; enter it manually."
  },
  "text024": {
    "es": "Elige origen y destino del catálogo para estimar con el FCM.",
    "en": "Choose origin and destination from the catalog to estimate with FCM."
  },
  "text025": {
    "es": "La ruta necesita origen y destino del catálogo.",
    "en": "The lane needs an origin and destination from the catalog."
  },
  "text026": {
    "es": "Vas a quitar la ruta {0} de {1}. ¿Continuar?",
    "en": "You are about to remove lane {0} from {1}. Continue?"
  },
  "text027": {
    "es": "Datos de la ruta",
    "en": "Lane details"
  },
  "text028": {
    "es": "Origen y destino: ciudad/estado en México; ZIP3 o mercado KMA en EUA y Canadá.",
    "en": "Catalogs from rateware. Geography: MX city/state · US/CA ZIP3 or KMA market, as in FCM."
  },
  "text029": {
    "es": "Origen",
    "en": "Origin"
  },
  "text030": {
    "es": "Destino",
    "en": "Destination"
  },
  "text031": {
    "es": "Operación",
    "en": "Operation"
  },
  "text032": {
    "es": "Servicio",
    "en": "Service"
  },
  "text033": {
    "es": "Al cliente se muestra como One Way.",
    "en": "Shown to the customer as One Way."
  },
  "text034": {
    "es": "Equipo",
    "en": "Equipment"
  },
  "text035": {
    "es": "Tractocamión, rabón, torton, 3.5 t…",
    "en": "Tractor, straight truck, tandem truck, 3.5 t…"
  },
  "text036": {
    "es": "Remolque",
    "en": "Trailer"
  },
  "text037": {
    "es": "Caja seca, reefer, plataforma…",
    "en": "Dry van, reefer, flatbed…"
  },
  "text038": {
    "es": "Configuración",
    "en": "Configuration"
  },
  "text039": {
    "es": "Sencillo, full…",
    "en": "Single, tandem…"
  },
  "text040": {
    "es": "Cruce fronterizo",
    "en": "Border crossing"
  },
  "text041": {
    "es": "Elige el cruce…",
    "en": "Choose a crossing…"
  },
  "text042": {
    "es": "Modelo de cruce",
    "en": "Crossing model"
  },
  "text043": {
    "es": "Peso (lb)",
    "en": "Weight (lb)"
  },
  "text044": {
    "es": "Cargas por semana",
    "en": "Loads per week"
  },
  "text045": {
    "es": "Millas",
    "en": "Miles"
  },
  "text046": {
    "es": "Calculando…",
    "en": "Calculating…"
  },
  "text047": {
    "es": "Calcular millas",
    "en": "Calculate miles"
  },
  "text048": {
    "es": "Millas MX",
    "en": "MX miles"
  },
  "text049": {
    "es": "Millas US",
    "en": "US miles"
  },
  "text050": {
    "es": "sin dato",
    "en": "no data"
  },
  "text051": {
    "es": "catálogo",
    "en": "catalog"
  },
  "text052": {
    "es": "Se miden con Google, tramo MX y tramo US; si Google no responde, se usa el catálogo de millas.",
    "en": "Measured by Google for the MX and US legs; if Google is unavailable, rateware's mileage catalog is used."
  },
  "text053": {
    "es": "Del catálogo de millas. Si la ruta no está, escríbelas a mano.",
    "en": "From rateware's mileage catalog. If the route is missing, enter miles manually."
  },
  "text054": {
    "es": "Componentes de cálculo",
    "en": "Calculation components"
  },
  "text055": {
    "es": "Adjudicado:",
    "en": "Awarded:"
  },
  "text056": {
    "es": " · ya es el costo de esta ruta.",
    "en": " · already used as this lane's cost."
  },
  "text057": {
    "es": "Estimar con FCM",
    "en": "Estimate with FCM"
  },
  "text058": {
    "es": "Estimando…",
    "en": "Estimating…"
  },
  "text059": {
    "es": "Volver a estimar",
    "en": "Re-estimate"
  },
  "text060": {
    "es": "Estimar",
    "en": "Estimate"
  },
  "text061": {
    "es": "No hay bases de costos del FCM disponibles.",
    "en": "No FCM cost bases available."
  },
  "text062": {
    "es": "Base de costos",
    "en": "Cost base"
  },
  "text063": {
    "es": "Automática · según la ruta",
    "en": "Automatic · based on route"
  },
  "text064": {
    "es": "cualquier ruta",
    "en": "any route"
  },
  "text065": {
    "es": "Nivel",
    "en": "Level"
  },
  "text066": {
    "es": "Casetas MX (MXN)",
    "en": "MX tolls (MXN)"
  },
  "text067": {
    "es": "tabla del FCM",
    "en": "FCM table"
  },
  "text068": {
    "es": "Bases del FCM al",
    "en": "FCM bases as of"
  },
  "text069": {
    "es": " · se actualizan cada hora.",
    "en": " · updated hourly."
  },
  "text070": {
    "es": " Fórmula igual a la del FCM publicado{0}.",
    "en": " Formula matches the published FCM{0}."
  },
  "text071": {
    "es": " (versión {0})",
    "en": " (version {0})"
  },
  "text072": {
    "es": " Fórmula aún sin comparar con el FCM.",
    "en": " Formula not yet compared with FCM."
  },
  "text073": {
    "es": "En revisión:",
    "en": "Under review:"
  },
  "text074": {
    "es": "el FCM cambió.",
    "en": "FCM has changed."
  },
  "text075": {
    "es": " Los precios del FCM pueden no coincidir hasta que QuoteDesk se ponga al día.",
    "en": " FCM prices may differ until QuoteDesk is updated."
  },
  "text076": {
    "es": "Tramo MX all-in",
    "en": "MX leg all-in"
  },
  "text077": {
    "es": "diésel y casetas incluidos{0}",
    "en": "diesel and tolls included{0}"
  },
  "text078": {
    "es": "Combustible / FSC",
    "en": "Fuel / FSC"
  },
  "text079": {
    "es": "usar ",
    "en": "use "
  },
  "text080": {
    "es": "Cruce fronterizo",
    "en": "Border crossing"
  },
  "text081": {
    "es": "Tarifa del carrier",
    "en": "Carrier rate"
  },
  "text082": {
    "es": "adjudicada en el Bid Room",
    "en": "awarded in the Bid Room"
  },
  "text083": {
    "es": "Adicionales",
    "en": "Accessorials"
  },
  "text084": {
    "es": "sin adicionales",
    "en": "no accessorials"
  },
  "text085": {
    "es": "sin markup",
    "en": "no markup"
  },
  "text086": {
    "es": "Tarifa all-in",
    "en": "All-in rate"
  },
  "text087": {
    "es": "El FCM precarga los componentes; edítalos y los derivados (auto) se recalculan.",
    "en": "FCM prefills the components; edit them and the derived values recalculate automatically."
  },
  "text088": {
    "es": "Adicionales + markup…",
    "en": "Accessorials + markup…"
  },
  "text089": {
    "es": "Notas de la ruta",
    "en": "Lane notes"
  },
  "text090": {
    "es": "Quitar ruta",
    "en": "Remove lane"
  },
  "text091": {
    "es": "Cambios sin guardar",
    "en": "Unsaved changes"
  },
  "text092": {
    "es": "Guardando…",
    "en": "Saving…"
  },
  "text093": {
    "es": "Guardar ruta",
    "en": "Save lane"
  },
  "text094": {
    "es": "Agregar ruta",
    "en": "Add lane"
  },
  "text095": {
    "es": "sin casetas en la tabla",
    "en": "no tolls in the table"
  },
  "text096": {
    "es": "casetas ${0} MXN{1}",
    "en": "tolls ${0} MXN{1}"
  },
  "text097": {
    "es": " (captura)",
    "en": " (manual entry)"
  },
  "text098": {
    "es": "Calculado como",
    "en": "Calculated as"
  },
  "text099": {
    "es": "Tramo MX all-in ",
    "en": "MX leg all-in "
  },
  "text100": {
    "es": "Tramo EE. UU. ",
    "en": "US leg "
  },
  "text101": {
    "es": "Cruce",
    "en": "Crossing"
  },
  "text102": {
    "es": "{0} · intercambio",
    "en": "{0} · interchange"
  },
  "text103": {
    "es": "sin costo · placas azules",
    "en": "no cost · blue plates"
  },
  "text104": {
    "es": "Precio del transportista ",
    "en": "Carrier price "
  },
  "text105": {
    "es": " (al cliente {0})",
    "en": " (customer {0})"
  },
  "text106": {
    "es": " (automática)",
    "en": " (automatic)"
  },
  "text107": {
    "es": "Una carga o necesidad puntual; se cotiza y se cierra.",
    "en": "A single load or one-time need; quote and close."
  },
  "text108": {
    "es": "Varias rutas o recurrencia corta, con fecha de cierre.",
    "en": "Multiple lanes or short recurrence, with a closing date."
  },
  "text109": {
    "es": "QuoteDesk {0} · ruta {1}",
    "en": "QuoteDesk {0} · lane {1}"
  },
  "text110": {
    "es": "Creando el evento…",
    "en": "Creating event…"
  },
  "text111": {
    "es": "Creado desde QuoteDesk {0}.",
    "en": "Created from QuoteDesk {0}."
  },
  "text112": {
    "es": "Agregando {0} ruta(s)…",
    "en": "Adding {0} lane(s)…"
  },
  "text113": {
    "es": "El evento recibió {0} de {1} rutas. Revisa el evento antes de reintentar.",
    "en": "The event received {0} of {1} lanes. Review the event before retrying."
  },
  "text114": {
    "es": "Ligando la cotización con el evento…",
    "en": "Linking quote to event…"
  },
  "text115": {
    "es": "Listo: la cotización está en el Bid Room",
    "en": "Done: the quote is in the Bid Room"
  },
  "text116": {
    "es": "Cerrar",
    "en": "Close"
  },
  "text117": {
    "es": "Se creó el evento con ",
    "en": "The event was created with "
  },
  "text118": {
    "es": " ruta(s). Todavía no se ha invitado a nadie: en el evento eliges carriers (Carrier Fit), preparas el mensaje y apruebas el envío en la cola.",
    "en": " lane(s). Nobody has been invited yet: choose carriers in the event (Carrier Fit), prepare the message and approve sending in the queue."
  },
  "text119": {
    "es": "Abrir el evento",
    "en": "Open event"
  },
  "text120": {
    "es": "Mandar al Bid Room",
    "en": "Move to Bid Room"
  },
  "text121": {
    "es": "Trabajando…",
    "en": "Working…"
  },
  "text122": {
    "es": "Reintentar",
    "en": "Retry"
  },
  "text123": {
    "es": "Crear evento",
    "en": "Create event"
  },
  "text124": {
    "es": "Crea un evento del Bid Room con las ",
    "en": "Creates a Bid Room event with the "
  },
  "text125": {
    "es": " ruta(s) de ",
    "en": " lane(s) from "
  },
  "text126": {
    "es": ". Tu costo estimado no se muestra a los carriers.",
    "en": ". Your estimated cost is hidden from carriers."
  },
  "text127": {
    "es": "Nombre del evento",
    "en": "Event name"
  },
  "text128": {
    "es": "Cierre de ofertas",
    "en": "Bid deadline"
  },
  "text129": {
    "es": "Qué ven los carriers",
    "en": "What carriers see"
  },
  "text130": {
    "es": "El evento ya existe; solo falta terminar de ligarlo.",
    "en": "The event already exists; finish linking it."
  },
  "text131": {
    "es": "Ciudad, Estado",
    "en": "City, State"
  },
  "text132": {
    "es": "Ciudad o estado…",
    "en": "City or state…"
  },
  "text133": {
    "es": "Ciudad, ZIP3 o mercado KMA…",
    "en": "City, ZIP3 or KMA market…"
  },
  "text134": {
    "es": "Elige una opción del catálogo",
    "en": "Choose a catalog option"
  },
  "text135": {
    "es": "Buscando…",
    "en": "Searching…"
  },
  "text136": {
    "es": "Sin resultados en el catálogo. Prueba solo la ciudad",
    "en": "No catalog results. Try the city alone"
  },
  "text137": {
    "es": ", el ZIP3 o el mercado",
    "en": ", ZIP3 or market"
  },
  "text138": {
    "es": "Nueva cotización",
    "en": "New quote"
  },
  "text139": {
    "es": "Creando…",
    "en": "Creating…"
  },
  "text140": {
    "es": "Crear cotización",
    "en": "Create quote"
  },
  "text141": {
    "es": "Shipper (CRM)",
    "en": "Shipper (CRM)"
  },
  "text142": {
    "es": "Nombre (opcional)",
    "en": "Name (optional)"
  },
  "text143": {
    "es": "Ej. Spot reefer Monterrey → Laredo",
    "en": "E.g. Spot reefer Monterrey → Laredo"
  },
  "text144": {
    "es": "Tipo",
    "en": "Type"
  },
  "text145": {
    "es": "Contrato",
    "en": "Contract"
  },
  "text146": {
    "es": "Llegó por",
    "en": "Received via"
  },
  "text147": {
    "es": "Solicitó",
    "en": "Requested by"
  },
  "text148": {
    "es": "Moneda",
    "en": "Currency"
  },
  "text149": {
    "es": "Vigencia",
    "en": "Validity"
  },
  "text150": {
    "es": "Notas",
    "en": "Notes"
  },
  "text151": {
    "es": "Nuevo",
    "en": "New"
  },
  "text152": {
    "es": "Estimando",
    "en": "Estimating"
  },
  "text153": {
    "es": "Cotizada",
    "en": "Quoted"
  },
  "text154": {
    "es": "En Bid Room",
    "en": "In Bid Room"
  },
  "text155": {
    "es": "Ganada",
    "en": "Won"
  },
  "text156": {
    "es": "Perdida",
    "en": "Lost"
  },
  "text157": {
    "es": "Vencida",
    "en": "Expired"
  },
  "text158": {
    "es": "Archivada",
    "en": "Archived"
  },
  "text159": {
    "es": "Correo",
    "en": "Email"
  },
  "text160": {
    "es": "Teléfono",
    "en": "Phone"
  },
  "text161": {
    "es": "Captura de shipper (RFI)",
    "en": "Shipper intake (RFI)"
  },
  "text162": {
    "es": "Otro",
    "en": "Other"
  },
  "text163": {
    "es": "por hora",
    "en": "per hour"
  },
  "text164": {
    "es": "por evento",
    "en": "per event"
  },
  "text165": {
    "es": "por viaje",
    "en": "per trip"
  },
  "text166": {
    "es": "por día",
    "en": "per day"
  },
  "text167": {
    "es": "por milla",
    "en": "per mile"
  },
  "text168": {
    "es": "otro",
    "en": "other"
  },
  "text169": {
    "es": "% sobre costo",
    "en": "% on cost"
  },
  "text170": {
    "es": "sobre costo base + adicionales",
    "en": "on base cost + accessorials"
  },
  "text171": {
    "es": "Monto fijo",
    "en": "Fixed amount"
  },
  "text172": {
    "es": "se suma al costo",
    "en": "added to cost"
  },
  "text173": {
    "es": "Margen objetivo",
    "en": "Target margin"
  },
  "text174": {
    "es": "% del precio final",
    "en": "% of final price"
  },
  "text175": {
    "es": "Directo · placas azules",
    "en": "Direct · blue plates"
  },
  "text176": {
    "es": "Transfer · intercambio",
    "en": "Transfer · interchange"
  },
  "text177": {
    "es": "Swap · intercambio",
    "en": "Swap · interchange"
  },
  "text178": {
    "es": "Drayage · intercambio",
    "en": "Drayage · interchange"
  },
  "text179": {
    "es": "B1 · placas azules",
    "en": "B1 · blue plates"
  },
  "text180": {
    "es": "Mínimo",
    "en": "Minimum"
  },
  "text181": {
    "es": "Objetivo",
    "en": "Target"
  },
  "text182": {
    "es": "Activas",
    "en": "Active"
  },
  "text183": {
    "es": "En cola",
    "en": "Queued"
  },
  "text184": {
    "es": "Cotizadas",
    "en": "Quoted"
  },
  "text185": {
    "es": "Ganadas",
    "en": "Won"
  },
  "text186": {
    "es": "Perdidas",
    "en": "Lost"
  },
  "text187": {
    "es": "Archivadas",
    "en": "Archived"
  },
  "text188": {
    "es": "Hay cambios sin guardar en la cotización abierta. ¿Descartarlos?",
    "en": "The open quote has unsaved changes. Discard them?"
  },
  "text189": {
    "es": "A Bid Room",
    "en": "To Bid Room"
  },
  "text190": {
    "es": "Margen prom",
    "en": "Avg. margin"
  },
  "text191": {
    "es": "Cotiza rutas para shippers: estima con el FCM, aplica margen o mándalas al Bid Room.",
    "en": "Opportunity tracker · FCM calculation components · estimate, apply markup or move to Bid Room"
  },
  "text192": {
    "es": "Actualizar",
    "en": "Refresh"
  },
  "text193": {
    "es": "Buscar folio, shipper o ciudad…",
    "en": "Search reference, shipper or city…"
  },
  "text194": {
    "es": "Cargando cotizaciones…",
    "en": "Loading quotes…"
  },
  "text195": {
    "es": "Shipper",
    "en": "Customer (CRM)"
  },
  "text196": {
    "es": "Costo",
    "en": "FCM cost"
  },
  "text197": {
    "es": "Estado",
    "en": "Status"
  },
  "text198": {
    "es": "Clic: ver a la derecha · doble clic: abrir completa",
    "en": "Click: view on the right · double-click: open full quote"
  },
  "text199": {
    "es": "¿origen?",
    "en": "origin?"
  },
  "text200": {
    "es": "¿destino?",
    "en": "destination?"
  },
  "text201": {
    "es": "Sin rutas todavía",
    "en": "No lanes yet"
  },
  "text202": {
    "es": "Ninguna cotización con esta búsqueda",
    "en": "No quotes match this search"
  },
  "text203": {
    "es": "Aún no hay cotizaciones aquí",
    "en": "No quotes here yet"
  },
  "text204": {
    "es": "Ajusta la búsqueda.",
    "en": "Adjust your search."
  },
  "text205": {
    "es": "Crea una con “Nueva cotización”: eliges el shipper del CRM y capturas las rutas.",
    "en": "Create one with “New quote”: choose the CRM shipper and enter lanes."
  },
  "text206": {
    "es": "Elige una cotización",
    "en": "Select a quote"
  },
  "text207": {
    "es": "Sus drivers del FCM y componentes de cálculo se editan aquí.",
    "en": "Edit its FCM drivers and calculation components here."
  },
  "text208": {
    "es": "Catálogos: {0}",
    "en": "Catalogs: {0}"
  },
  "text209": {
    "es": "hora",
    "en": "hour"
  },
  "text210": {
    "es": "horas",
    "en": "hours"
  },
  "text211": {
    "es": "evento",
    "en": "event"
  },
  "text212": {
    "es": "eventos",
    "en": "events"
  },
  "text213": {
    "es": "viaje",
    "en": "trip"
  },
  "text214": {
    "es": "viajes",
    "en": "trips"
  },
  "text215": {
    "es": "día",
    "en": "day"
  },
  "text216": {
    "es": "días",
    "en": "days"
  },
  "text217": {
    "es": "milla",
    "en": "mile"
  },
  "text218": {
    "es": "millas",
    "en": "miles"
  },
  "text219": {
    "es": "unidad",
    "en": "unit"
  },
  "text220": {
    "es": "unidades",
    "en": "units"
  },
  "text221": {
    "es": "Cotización {0}{1}",
    "en": "Quote {0}{1}"
  },
  "text222": {
    "es": "Cliente: {0}",
    "en": "Customer: {0}"
  },
  "text223": {
    "es": "Vigencia: hasta {0}",
    "en": "Valid through: {0}"
  },
  "text224": {
    "es": "   Tarifa all-in: {0} {1} por carga",
    "en": "   All-in rate: {0} {1} per load"
  },
  "text225": {
    "es": "   Incluye {0}: {1} {2} × {3}",
    "en": "   Includes {0}: {1} {2} × {3}"
  },
  "text226": {
    "es": "Tarifas sujetas a disponibilidad de equipo al momento de confirmar la carga.",
    "en": "Rates subject to equipment availability when the load is confirmed."
  },
  "text227": {
    "es": "Hay cambios sin guardar en esta ruta. ¿Descartarlos?",
    "en": "This lane has unsaved changes. Discard them?"
  },
  "text228": {
    "es": "{0} ahora está en “{1}”.",
    "en": "{0} is now “{1}”."
  },
  "text229": {
    "es": "La tarifa del carrier ganador de cada ruta se vuelve su costo y se recalcula el all-in con tu markup. ",
    "en": "Each winning carrier's rate becomes the lane cost, and all-in is recalculated with your markup. "
  },
  "text230": {
    "es": "Tu estimado anterior queda guardado como referencia. ¿Continuar?",
    "en": "Your previous estimate is saved for reference. Continue?"
  },
  "text231": {
    "es": "Se aplicaron {0} adjudicación(es) como costo.",
    "en": "Applied {0} award(s) as cost."
  },
  "text232": {
    "es": "Todavía no hay adjudicaciones primarias en el evento.",
    "en": "The event has no primary awards yet."
  },
  "text233": {
    "es": "Cargando cotización…",
    "en": "Loading quote…"
  },
  "text234": {
    "es": "Marcar cotizada",
    "en": "Mark quoted"
  },
  "text235": {
    "es": "Cada ruta necesita su tarifa all-in",
    "en": "Each lane needs an all-in rate"
  },
  "text236": {
    "es": "{0} queda como cotizada al shipper. Envíale el texto de la cotización. ¿Continuar?",
    "en": "{0} will be marked as quoted to the shipper. Send them the quote text. Continue?"
  },
  "text237": {
    "es": "Agrega al menos una ruta",
    "en": "Add at least one lane"
  },
  "text238": {
    "es": "¿El shipper aceptó {0}?",
    "en": "Did the shipper accept {0}?"
  },
  "text239": {
    "es": "¿Por qué se perdió? (opcional)",
    "en": "Why was it lost? (optional)"
  },
  "text240": {
    "es": "{0} queda vencida. ¿Continuar?",
    "en": "{0} will be marked expired. Continue?"
  },
  "text241": {
    "es": "Reabrir",
    "en": "Reopen"
  },
  "text242": {
    "es": "Reabrir {0} para seguir trabajándola. ¿Continuar?",
    "en": "Reopen {0} to continue working on it. Continue?"
  },
  "text243": {
    "es": "Archivar",
    "en": "Archive"
  },
  "text244": {
    "es": "Archivar {0}. Sale de la lista activa. ¿Continuar?",
    "en": "Archive {0}. It will leave the active list. Continue?"
  },
  "text245": {
    "es": "Restaurar",
    "en": "Restore"
  },
  "text246": {
    "es": "Restaurar {0} a la cola. ¿Continuar?",
    "en": "Restore {0} to the queue. Continue?"
  },
  "text247": {
    "es": "Cotización",
    "en": "Quote"
  },
  "text248": {
    "es": "No pudimos actualizar la cotización; lo que ves puede estar desactualizado. {0}",
    "en": "Could not refresh the quote; displayed information may be outdated. {0}"
  },
  "text249": {
    "es": "Actualizando…",
    "en": "Refreshing…"
  },
  "text250": {
    "es": " · llegó por ",
    "en": " · received via "
  },
  "text251": {
    "es": " · solicitó {0}",
    "en": " · requested by {0}"
  },
  "text252": {
    "es": " · TC {0} ({1})",
    "en": " · FX {0} ({1})"
  },
  "text253": {
    "es": " · vigente hasta {0}",
    "en": " · valid through {0}"
  },
  "text254": {
    "es": "Editar datos",
    "en": "Edit details"
  },
  "text255": {
    "es": "Enviar por correo",
    "en": "Send by email"
  },
  "text256": {
    "es": "Texto para el shipper",
    "en": "Text for the shipper"
  },
  "text257": {
    "es": "Motivo: ",
    "en": "Reason: "
  },
  "text258": {
    "es": "En el Bid Room:",
    "en": "In the Bid Room:"
  },
  "text259": {
    "es": " · {0} ruta(s) adjudicada(s)",
    "en": " · {0} awarded lane(s)"
  },
  "text260": {
    "es": " · sin adjudicar todavía",
    "en": " · no awards yet"
  },
  "text261": {
    "es": "Abrir evento",
    "en": "Open event"
  },
  "text262": {
    "es": "Traer adjudicación",
    "en": "Import award"
  },
  "text263": {
    "es": "Rutas",
    "en": "Lanes"
  },
  "text264": {
    "es": "Costo total",
    "en": "Total cost"
  },
  "text265": {
    "es": "+ Ruta",
    "en": "+ Lane"
  },
  "text266": {
    "es": "Cargando ruta…",
    "en": "Loading lane…"
  },
  "text267": {
    "es": "Ruta guardada.",
    "en": "Lane saved."
  },
  "text268": {
    "es": "Ruta quitada.",
    "en": "Lane removed."
  },
  "text269": {
    "es": "Datos actualizados.",
    "en": "Details updated."
  },
  "text270": {
    "es": "Cópialo a tu correo, o usa «Preparar para la Cola» para dejarlo como borrador.",
    "en": "Copy it to your email, or use «Prepare for the queue» to leave it as a draft."
  },
  "text271": {
    "es": "Texto copiado.",
    "en": "Text copied."
  },
  "text272": {
    "es": "Selecciona el texto y cópialo.",
    "en": "Select the text and copy it."
  },
  "text273": {
    "es": "Copiar",
    "en": "Copy"
  },
  "text274": {
    "es": "Editar {0}",
    "en": "Edit {0}"
  },
  "text275": {
    "es": "Guardar",
    "en": "Save"
  },
  "text276": {
    "es": "Nombre",
    "en": "Name"
  },
  "text277": {
    "es": "La moneda se fija en cuanto hay costos capturados.",
    "en": "Currency is locked once costs are entered."
  },
  "text278": {
    "es": "{0} cargas/sem",
    "en": "{0} loads/wk"
  },
  "text279": {
    "es": "Modelo: {0}",
    "en": "Model: {0}"
  },
  "text280": {
    "es": "Cruce: {0}",
    "en": "Crossing: {0}"
  },
  "text281": {
    "es": "Operación: {0}",
    "en": "Operation: {0}"
  },
  "text282": {
    "es": "Servicio: {0}",
    "en": "Service: {0}"
  },
  "text283": {
    "es": "Equipo: {0}",
    "en": "Equipment: {0}"
  },
  "text284": {
    "es": "Peso: {0} lb",
    "en": "Weight: {0} lb"
  },
  "text285": {
    "es": "Abrir la cotización completa",
    "en": "Open full quote"
  },
  "text286": {
    "es": "Abrir ↗",
    "en": "Open ↗"
  },
  "text287": {
    "es": "No pudimos actualizar la cotización. {0}",
    "en": "Could not refresh the quote. {0}"
  },
  "text288": {
    "es": "Lo que pasa al evento RFx",
    "en": "RFx Event details"
  },
  "text289": {
    "es": "Todavía sin rubros: captura la ruta y sus datos.",
    "en": "No categories yet: enter the lane and its drivers."
  },
  "text290": {
    "es": "Estos datos de la ruta viajan al evento cuando la mandas al Bid Room.",
    "en": "Entered categories are standardized and included as snippets in the RFx Event / quote."
  },
  "text291": {
    "es": " ruta",
    "en": " lane"
  },
  "text292": {
    "es": "Guarda la ruta primero",
    "en": "Save the lane first"
  },
  "text293": {
    "es": "Enviar cotización al shipper",
    "en": "Send quote to shipper"
  },
  "text294": {
    "es": "Enviando",
    "en": "Sending"
  },
  "text295": {
    "es": "Enviada",
    "en": "Sent"
  },
  "text296": {
    "es": "Falló",
    "en": "Failed"
  },
  "text297": {
    "es": "Sin confirmar",
    "en": "Unconfirmed"
  },
  "text298": {
    "es": "Se enviará {0} a {1}{2} ",
    "en": "{0} will be sent to {1}{2} "
  },
  "text299": {
    "es": " (copia: {0})",
    "en": " (CC: {0})"
  },
  "text300": {
    "es": "desde {0}. ¿Enviar ahora?",
    "en": "from {0}. Send now?"
  },
  "text301": {
    "es": "Ese mismo correo ya se había enviado a {0}; no se volvió a mandar.",
    "en": "This email had already been sent to {0}; it was not sent again."
  },
  "text302": {
    "es": "Cotización enviada a {0}. Queda como cotizada.",
    "en": "Quote sent to {0}. Status changed to quoted."
  },
  "text303": {
    "es": "El buzón de envío no está conectado. Conéctalo en Integraciones.",
    "en": "The sending mailbox is not connected. Connect it in Integrations."
  },
  "text304": {
    "es": "No se puede enviar a {0}: está en la lista de rebotes o bajas.",
    "en": "Cannot send to {0}: the address is on the bounce or unsubscribe list."
  },
  "text305": {
    "es": "Falta el correo del destinatario.",
    "en": "Recipient email is missing."
  },
  "text306": {
    "es": "Enviar {0} por correo",
    "en": "Email {0}"
  },
  "text307": {
    "es": "Actualizar vista previa",
    "en": "Refresh preview"
  },
  "text308": {
    "es": "Enviando…",
    "en": "Sending…"
  },
  "text309": {
    "es": "Enviar",
    "en": "Send"
  },
  "text310": {
    "es": "Para",
    "en": "To"
  },
  "text311": {
    "es": "correo del shipper",
    "en": "shipper email"
  },
  "text312": {
    "es": "Copia (opcional)",
    "en": "CC (optional)"
  },
  "text313": {
    "es": "separa con comas",
    "en": "separate with commas"
  },
  "text314": {
    "es": "Mensaje (opcional)",
    "en": "Message (optional)"
  },
  "text315": {
    "es": "Te compartimos nuestra cotización:",
    "en": "Here is our quote:"
  },
  "text316": {
    "es": "De ",
    "en": "From "
  },
  "text317": {
    "es": " · Asunto: ",
    "en": " · Subject: "
  },
  "text318": {
    "es": "Cambiaste datos: actualiza la vista previa antes de enviar.",
    "en": "Details changed: refresh the preview before sending."
  },
  "text319": {
    "es": "Preparando la vista previa…",
    "en": "Preparing preview…"
  },
  "text320": {
    "es": "Vista previa del correo",
    "en": "Email preview"
  },
  "text321": {
    "es": "Envíos anteriores",
    "en": "Previous sends"
  },
  "text322": {
    "es": "Cotización",
    "en": "Quote"
  },
  "text323": {
    "es": "Ruta",
    "en": "Lane"
  },
  "text324": {
    "es": "en Bid Room",
    "en": "in Bid Room"
  },
  "text325": {
    "es": "Más",
    "en": "More"
  },
  "text326": {
    "es": "Cotizaciones",
    "en": "Quotes"
  }
};

export const tr = translator(copy);
