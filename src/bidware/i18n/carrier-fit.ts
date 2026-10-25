import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  "text001": {
    "es": "DUPLICADO",
    "en": "DUPLICATE"
  },
  "text002": {
    "es": "ELEGIBLE",
    "en": "ELIGIBLE"
  },
  "text003": {
    "es": "\n\n⚠ {0} de los seleccionados son la misma razón social ",
    "en": "\n\n⚠ {0} selected carriers have the same legal name "
  },
  "text004": {
    "es": "capturada dos veces. La base los aceptará a ambos.",
    "en": "entered twice. The database will accept both."
  },
  "text005": {
    "es": "Vas a agregar {0} carrier(s) a {1} lane(s) ",
    "en": "You are about to add {0} carrier(s) to {1} lane(s) "
  },
  "text006": {
    "es": "({0} participaciones) usando \"{1}\" v{2}.",
    "en": "({0} participations) using “{1}” v{2}."
  },
  "text007": {
    "es": "\n\nQuedan como borrador: no se envía ninguna invitación todavía. ¿Continuar?",
    "en": "\n\nThey remain drafts: no invitation is sent yet. Continue?"
  },
  "text008": {
    "es": "Agregados: {0} participaciones nuevas, ",
    "en": "Added: {0} new participations, "
  },
  "text009": {
    "es": "{0} ya estaban, {1} rechazadas.",
    "en": "{0} already existed, {1} rejected."
  },
  "text010": {
    "es": "{0} · Reintentar con el mismo id es seguro ({1}…).",
    "en": "{0} · Retrying with the same ID is safe ({1}…)."
  },
  "text011": {
    "es": "Lista",
    "en": "Template"
  },
  "text012": {
    "es": "— Elige una lista activa —",
    "en": "— Choose an active template —"
  },
  "text013": {
    "es": "{0} lane{1} · {2} carrier{3} en el RFx",
    "en": "{0} lane{1} · {2} carrier{3} in the RFx"
  },
  "text014": {
    "es": "Tablero público",
    "en": "Public board"
  },
  "text015": {
    "es": "Parte de una lista de carriers y elige quiénes entran al evento",
    "en": "A template as a starting point · eligibility for the event · draft participants"
  },
  "text016": {
    "es": "Encuentra carriers para esta oportunidad",
    "en": "Find carriers for this opportunity"
  },
  "text017": {
    "es": "Elige una lista y el evento: verás quién es elegible. La lista no cambia y nada se envía desde aquí.",
    "en": "The template is the starting point: eligibility is recalculated for this RFx without changing it."
  },
  "text018": {
    "es": "La plantilla no cambia",
    "en": "The template does not change"
  },
  "text019": {
    "es": "Nada se envía hasta la Cola de envío",
    "en": "Nothing is sent until the Delivery queue"
  },
  "text020": {
    "es": "Punto de partida",
    "en": "Starting point"
  },
  "text021": {
    "es": "Plantilla guardada",
    "en": "Saved template"
  },
  "text022": {
    "es": "Evento RFx",
    "en": "RFx event"
  },
  "text023": {
    "es": "— Elige el evento RFx —",
    "en": "— Choose the RFx event —"
  },
  "text024": {
    "es": "Administrar listas ↗",
    "en": "Manage templates in Carrier CRM ↗"
  },
  "text025": {
    "es": "Siguiente:",
    "en": "Next:"
  },
  "text026": {
    "es": "Revisar contactos →",
    "en": "Review contacts →"
  },
  "text027": {
    "es": "Preparar el mensaje →",
    "en": "Prepare message →"
  },
  "text028": {
    "es": "En la lista",
    "en": "Template members"
  },
  "text029": {
    "es": "Elegibles",
    "en": "Eligible"
  },
  "text030": {
    "es": "Ya en el RFx",
    "en": "Already in the RFx"
  },
  "text031": {
    "es": "No disponibles",
    "en": "Unavailable"
  },
  "text032": {
    "es": "Seleccionados",
    "en": "Selected"
  },
  "text033": {
    "es": "las {0} del evento",
    "en": "the event’s {0}"
  },
  "text034": {
    "es": "{0} de {1}",
    "en": "{0} of {1}"
  },
  "text035": {
    "es": "Ocultar",
    "en": "Hide"
  },
  "text036": {
    "es": "Elegir lanes",
    "en": "Choose lanes"
  },
  "text037": {
    "es": "{0} carrier(s) seleccionados son el mismo registro duplicado ",
    "en": "{0} selected carrier(s) are duplicate records "
  },
  "text038": {
    "es": "(misma razón social y mismo dominio). La base solo impide repetir el mismo vendor_id en ",
    "en": "(same legal name and domain). The database only prevents repeating the same vendor_id in "
  },
  "text039": {
    "es": "un lane, no la misma empresa capturada dos veces. Filtra por «Duplicados» para resolverlo.",
    "en": "a lane, not entering the same company twice. Filter by “Duplicates” to resolve it."
  },
  "text040": {
    "es": "Cargando…",
    "en": "Loading…"
  },
  "text041": {
    "es": "Elige una lista activa",
    "en": "Choose an active template"
  },
  "text042": {
    "es": "Solo las listas activas se cargan en un evento.",
    "en": "Only active templates can be loaded in an event."
  },
  "text043": {
    "es": "Falta el evento:",
    "en": "Event missing:"
  },
  "text044": {
    "es": "elige arriba el evento RFx al que vas a agregar estos carriers.",
    "en": "choose the RFx event above to add these carriers to."
  },
  "text045": {
    "es": "Todos",
    "en": "All"
  },
  "text046": {
    "es": "EN_RFX",
    "en": "IN_RFX"
  },
  "text047": {
    "es": "Duplicados",
    "en": "Duplicates"
  },
  "text048": {
    "es": "Seleccionar los ",
    "en": "Select the "
  },
  "text049": {
    "es": " elegibles",
    "en": " eligible"
  },
  "text050": {
    "es": "Limpiar",
    "en": "Clear"
  },
  "text051": {
    "es": "Elegibilidad",
    "en": "Eligibility"
  },
  "text052": {
    "es": "Etapa",
    "en": "Stage"
  },
  "text053": {
    "es": "Contacto",
    "en": "Contact"
  },
  "text054": {
    "es": "En el RFx",
    "en": "In the RFx"
  },
  "text055": {
    "es": "sin dominio",
    "en": "no domain"
  },
  "text056": {
    "es": "Elegible",
    "en": "Eligible"
  },
  "text057": {
    "es": "Misma razón social y mismo dominio",
    "en": "Same legal name and domain"
  },
  "text058": {
    "es": "también ",
    "en": "also "
  },
  "text059": {
    "es": "— sin contacto",
    "en": "— no contact"
  },
  "text060": {
    "es": "contacto compartido con ",
    "en": "contact shared with "
  },
  "text061": {
    "es": "YA EN EL RFX",
    "en": "ALREADY IN THE RFX"
  },
  "text062": {
    "es": "no está",
    "en": "is missing"
  },
  "text063": {
    "es": "Seleccionar {0}",
    "en": "Select {0}"
  },
  "text064": {
    "es": "La lista no tiene carriers",
    "en": "The template has no members"
  },
  "text065": {
    "es": "Agrégalos desde Listas de carriers.",
    "en": "Edit it in Carrier CRM."
  },
  "text066": {
    "es": " participaciones · agregar crea la participación; nada se envía hasta la Cola de envío",
    "en": " participations · adding creates the participation; nothing is sent until the Delivery queue"
  },
  "text067": {
    "es": "Agregando…",
    "en": "Adding…"
  },
  "text068": {
    "es": "Agregar {0} carriers al RFx",
    "en": "Add {0} carriers to RFx"
  },
  "text069": {
    "es": "No visible para tu usuario",
    "en": "Not visible to your account"
  },
  "text070": {
    "es": "Estatus {0}",
    "en": "Status {0}"
  },
  "text071": {
    "es": "Etapa archivada",
    "en": "Archived stage"
  },
  "text072": {
    "es": "Sin email ni WhatsApp",
    "en": "No email or WhatsApp"
  }
};

export const tr = translator(copy);

const wordCopy={
  "invalidMembers": {
    "es": "No se pudo verificar la carga completa de miembros. Actualiza la lista antes de continuar.",
    "en": "The complete membership could not be verified. Refresh the template before continuing."
  },
  "word0": {
    "es": "repite a ",
    "en": "duplicates "
  },
  "word1": {
    "es": "No visible para tu usuario",
    "en": "Not visible to your account"
  },
  "word2": {
    "es": "Sin email ni WhatsApp",
    "en": "No email or WhatsApp"
  },
  "word3": {
    "es": "Etapa archivada",
    "en": "Archived stage"
  },
  "word4": {
    "es": "Estatus blocked",
    "en": "Status blocked"
  },
  "word5": {
    "es": "Estatus inactive",
    "en": "Status inactive"
  },
  "word6": {
    "es": "Estatus archived",
    "en": "Status archived"
  },
  "word7": {
    "es": "Estatus deleted",
    "en": "Status deleted"
  }
};
export const words=translator(wordCopy);

const reeferCopy: Record<string, {es:string;en:string}> = {
  title:{es:"D2D Reefer · frontera US",en:"D2D Reefer · US border"},
  scope:{es:"Cada carrier debe cumplir las condiciones en todas las rutas seleccionadas. Lo pendiente o fuera de alcance no se puede agregar. Esta preselección es para solicitar cotización; no confirma disponibilidad, homologación, temperatura aceptada ni tarifa vigente.",en:"Each carrier must meet the conditions on every selected lane. Pending or out-of-scope carriers cannot be added. This shortlist is for requesting quotes; it does not confirm availability, qualification, accepted temperature or current rates."},
  requirements:{es:"Datos que debe contener el RFx",en:"Required RFx details"},
  requirementsHelp:{es:"Completa las especificaciones y criterios de la ruta con datos confirmados. Se reconocen etiquetas explícitas; el texto ambiguo queda pendiente. Frío Express requiere además peso bruto, tarimas, preenfriado y quién cubre los servicios excluidos. Ejemplo de formato (no sustituye los datos de tu carga):",en:"Complete lane specifications and criteria with confirmed facts. Explicit labels are recognized; ambiguous text stays pending. Frío Express also requires gross weight, pallets, precooling and responsibility for excluded services. Format example (does not replace your shipment facts):"},
  format:{es:"Producto: Jitomate\nTemperatura: 10 °C\nPeso bruto: 18000 kg\nTarimas: Sí\nPreenfriado: Sí\nDespacho aduanal a cargo del carrier: No\nSeguro de carga a cargo del carrier: No\nManiobras a cargo del carrier: No",en:"Product: Tomatoes\nTemperature: 10 °C\nGross weight: 18000 kg\nPalletized: Yes\nPrecooled: Yes\nCustoms brokerage by carrier: No\nCargo insurance by carrier: No\nLoading/unloading by carrier: No"},
  compatible:{es:"Compatible para RFQ",en:"Compatible for RFQ"},
  pending:{es:"Pendiente de datos/evidencia",en:"Data/evidence pending"},
  blocked:{es:"Fuera de alcance",en:"Out of scope"},
  reefer_pending:{es:"Pendientes Reefer",en:"Reefer pending"},
  reefer_blocked:{es:"Fuera de alcance Reefer",en:"Reefer out of scope"},
  lane:{es:"Ruta",en:"Lane"},
  rfqOnly:{es:"Antecedente histórico. Confirmar condiciones y disponibilidad en la cotización.",en:"Historical evidence. Confirm conditions and availability in the quote."},
  workspace:{es:"La política no corresponde a este espacio.",en:"The policy does not belong to this workspace."},
  member:{es:"Carrier sin regla aprobada en esta plantilla.",en:"No approved rule for this template member."},
  innovativos_history:{es:"Innovativos · oferta del 27/jul/2026: Querétaro → Laredo, Reefer, Mercancía: Arbolitos; Temperatura: 10 °C; Peso: 18,000 kg. Es el caso documentado, no una capacidad máxima ni evidencia para jitomate. Confirmar condiciones actuales al cotizar.",en:"Innovativos · July 27, 2026 quote: Querétaro → Laredo, Reefer, Product: Arbolitos (source wording); Temperature: 10 °C; Weight: 18,000 kg. This is the documented case, not maximum capacity or evidence for tomatoes. Confirm current conditions when quoting."},
  temperature_innovativos:{es:"Innovativos: esta temperatura difiere de los 10 °C documentados.",en:"Innovativos: this temperature differs from the documented 10 °C."},
  weight_innovativos:{es:"Innovativos: este peso difiere de los 18,000 kg documentados. El antecedente no acredita un rango de pesos.",en:"Innovativos: this weight differs from the documented 18,000 kg. The historical case does not establish a weight range."},
  choose_lanes:{es:"Elige un evento y sus rutas.",en:"Select an event and its lanes."},
  lane_unknown:{es:"No se pudo verificar una ruta seleccionada.",en:"A selected lane could not be verified."},
  geography_missing:{es:"Faltan ciudad, estado o país de origen/destino.",en:"Origin/destination city, state or country is missing."},
  route:{es:"Origen o destino fuera de la evidencia aprobada para este carrier.",en:"Origin or destination is outside this carrier's approved evidence."},
  direction:{es:"El sentido debe ser exportación MX→frontera US.",en:"Direction must be MX export to the US border."},
  equipment:{es:"El equipo indicado no es Reefer o es contradictorio.",en:"The specified equipment is not Reefer or conflicts."},
  equipment_missing:{es:"Falta especificar el remolque Reefer.",en:"The Reefer trailer must be specified."},
  product:{es:"Producto excluido o sin evidencia aprobada para este carrier.",en:"Product is excluded or lacks approved evidence for this carrier."},
  product_missing:{es:"Falta producto explícito corroborado.",en:"Explicit corroborated product is missing."},
  temperature_missing:{es:"Falta temperatura explícita en °C; «estándar» no define un valor.",en:"Explicit temperature in °C is missing; 'standard' is not a value."},
  requirements_ambiguous:{es:"Hay requisitos contradictorios o con formato/unidad ambiguos.",en:"Requirements conflict or have ambiguous format/units."},
  weight_missing:{es:"Falta peso con unidad.",en:"Weight with units is missing."},
  gross_weight_missing:{es:"Falta peso bruto con unidad.",en:"Gross weight with units is missing."},
  weight_breco:{es:"Breco requiere menos de 20,000 kg.",en:"Breco requires less than 20,000 kg."},
  weight_frio:{es:"Frío Express admite hasta 20,000 kg brutos.",en:"Frío Express allows up to 20,000 kg gross."},
  palletized_missing:{es:"Falta confirmar carga en tarimas.",en:"Palletized loading must be confirmed."},
  precooled_missing:{es:"Falta confirmar producto preenfriado.",en:"Precooled product must be confirmed."},
  palletized:{es:"Frío Express requiere tarimas.",en:"Frío Express requires pallets."},
  precooled:{es:"Frío Express requiere producto preenfriado.",en:"Frío Express requires precooled product."},
  customsByCarrier_missing:{es:"Falta indicar quién cubre el despacho aduanal.",en:"Customs brokerage responsibility is missing."},
  insuranceByCarrier_missing:{es:"Falta indicar quién cubre el seguro de carga.",en:"Cargo insurance responsibility is missing."},
  handlingByCarrier_missing:{es:"Falta indicar quién cubre las maniobras.",en:"Loading/unloading responsibility is missing."},
  customsByCarrier:{es:"Frío Express no ofrece despacho aduanal.",en:"Frío Express does not provide customs brokerage."},
  insuranceByCarrier:{es:"La oferta de Frío Express excluye seguro de carga.",en:"Frío Express's offer excludes cargo insurance."},
  handlingByCarrier:{es:"La oferta de Frío Express excluye maniobras.",en:"Frío Express's offer excludes loading/unloading."},
  serverBlock:{es:"La API detectó restricciones pendientes o incumplidas con los datos actuales del RFx. Recarga y revisa las rutas; esta solicitud no agregó participantes.",en:"The API found pending or unmet restrictions in current RFx data. Reload and review the lanes; this request did not add participants."},
};
export const reeferText=translator(reeferCopy);
