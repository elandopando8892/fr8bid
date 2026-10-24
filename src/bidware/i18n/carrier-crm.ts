import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  "bounceCleanupWarning": {
    "es": " El correo quedó reemplazado, pero no se pudo retirar su repetición en correos secundarios: {0}. Actualiza para revisar los contactos guardados; no repitas el reemplazo.",
    "en": " The email was replaced, but its duplicate secondary entry could not be removed: {0}. Refresh to review the saved contacts; do not repeat the replacement."
  },
  "archiveAction": {
    "es": "archivar",
    "en": "archive"
  },
  "text001": {
    "es": "Escribe un correo válido para reemplazar {0}.",
    "en": "Enter a valid email address to replace {0}."
  },
  "text002": {
    "es": "El correo nuevo tiene que ser distinto del que rebotó.",
    "en": "The new email must differ from the bounced address."
  },
  "text003": {
    "es": "{0}: {1} reemplaza a {2}; ya se le puede volver a invitar.",
    "en": "{0}: {1} replaces {2}; invitations can be sent again."
  },
  "text004": {
    "es": "Se leen los avisos de correo no entregado de los últimos 45 días en el Gmail de ventas. ",
    "en": "Undelivered mail notices from the last 45 days will be read in sales Gmail. "
  },
  "text005": {
    "es": "Cada dirección que rebotó sale de los contactos del carrier, queda bloqueada para envíos y aparece aquí.\n\n¿Buscar?",
    "en": "Each bounced address is removed from carrier contacts, blocked for sending and shown here. Search?"
  },
  "text006": {
    "es": "Revisados {0} aviso(s): {1} correo(s) rebotado(s), ",
    "en": "Checked {0} notice(s): {1} bounced address(es), "
  },
  "text007": {
    "es": "{0} bloqueado(s), {1} carrier(s) actualizados.",
    "en": "{0} blocked, {1} carrier(s) updated."
  },
  "text008": {
    "es": "Correos rebotados",
    "en": "Bounced emails"
  },
  "text009": {
    "es": "Direcciones que no recibieron correo y quedaron bloqueadas",
    "en": "Addresses that did not receive email and were blocked"
  },
  "text010": {
    "es": "Actualizar",
    "en": "Refresh"
  },
  "text011": {
    "es": "Buscando…",
    "en": "Searching…"
  },
  "text012": {
    "es": "Buscar rebotes en Gmail",
    "en": "Find bounces in Gmail"
  },
  "text013": {
    "es": "Por qué importa:",
    "en": "Why it matters:"
  },
  "text014": {
    "es": "un correo que rebotó sale de los contactos del carrier y queda bloqueado, así que ese carrier ya no recibe invitaciones por correo. Escribe el correo correcto y \"Reemplazar\": queda como su correo y se le puede volver a invitar.",
    "en": "a bounced address is removed from carrier contacts and blocked, so the carrier stops receiving email invitations. Enter the correct address and choose “Replace” to restore invitations."
  },
  "text015": {
    "es": "Carriers con rebote",
    "en": "Carriers with bounces"
  },
  "text016": {
    "es": "Correos por corregir",
    "en": "Addresses to correct"
  },
  "text017": {
    "es": "Cargando rebotes…",
    "en": "Loading bounces…"
  },
  "text018": {
    "es": "Correo que rebotó",
    "en": "Bounced address"
  },
  "text019": {
    "es": "Motivo",
    "en": "Reason"
  },
  "text020": {
    "es": "Detectado",
    "en": "Detected"
  },
  "text021": {
    "es": "Correo correcto",
    "en": "Correct email"
  },
  "text022": {
    "es": "Correo actual: ",
    "en": "Current email: "
  },
  "text023": {
    "es": "ninguno",
    "en": "none"
  },
  "text024": {
    "es": "correo@empresa.com",
    "en": "email@company.com"
  },
  "text025": {
    "es": "Correo que reemplaza a {0}",
    "en": "Email replacing {0}"
  },
  "text026": {
    "es": "Guardando…",
    "en": "Saving…"
  },
  "text027": {
    "es": "Reemplazar",
    "en": "Replace"
  },
  "text028": {
    "es": "Usar el actual (",
    "en": "Use current ("
  },
  "text029": {
    "es": "Sin correos rebotados",
    "en": "No bounced emails"
  },
  "text030": {
    "es": "Todos los carriers tienen un correo que recibe.",
    "en": "All carriers have a working email address."
  },
  "text031": {
    "es": "Ficha de carrier",
    "en": "Carrier card"
  },
  "text032": {
    "es": "Elige un carrier en la tabla para ver su ficha.",
    "en": "Select a carrier in the table to see its card."
  },
  "text033": {
    "es": "sin nombre",
    "en": "unnamed"
  },
  "text034": {
    "es": "ninguna",
    "en": "none"
  },
  "text035": {
    "es": "ninguna todavía",
    "en": "none yet"
  },
  "text036": {
    "es": "{0} lane{1} · {2} cotizada{3}",
    "en": "{0} lane{1} · {2} quoted"
  },
  "text037": {
    "es": "sin dominio",
    "en": "no domain"
  },
  "text038": {
    "es": " · {0} correo{1} secundario{2}",
    "en": " · {0} secondary email(s)"
  },
  "text039": {
    "es": "No se pudo leer la ficha completa: ",
    "en": "Could not load the complete card: "
  },
  "text040": {
    "es": "Etapa",
    "en": "Stage"
  },
  "text041": {
    "es": "Promovido por tener cotizaciones ligadas",
    "en": "Promoted because it has linked quotes"
  },
  "text042": {
    "es": "guardada: ",
    "en": "saved: "
  },
  "text043": {
    "es": "Estatus TMS",
    "en": "TMS status"
  },
  "text044": {
    "es": "sin número",
    "en": "no number"
  },
  "text045": {
    "es": "En plantillas",
    "en": "In templates"
  },
  "text046": {
    "es": "Participaciones RFx",
    "en": "RFx participation"
  },
  "text047": {
    "es": "Última actividad: {0}",
    "en": "Last activity: {0}"
  },
  "text048": {
    "es": "Cambiar estatus TMS",
    "en": "Change TMS status"
  },
  "text049": {
    "es": "Refleja la activación en el TMS. No cambia su etapa y no hace falta para invitarlo a un bid.",
    "en": "Reflects TMS activation. It does not change the stage and is not required for a bid invitation."
  },
  "text050": {
    "es": "A los ",
    "en": "For the "
  },
  "text051": {
    "es": " seleccionados:",
    "en": " selected:"
  },
  "text052": {
    "es": "Enlace de perfil",
    "en": "Profile link"
  },
  "text053": {
    "es": "\n\nEl backend exige confirmación explícita para este movimiento ({0}).",
    "en": "\n\nThe backend requires explicit confirmation for this move ({0})."
  },
  "text054": {
    "es": "Mover {0} carrier(s) de {1} a {2}.{3}\n\n¿Continuar?",
    "en": "Move {0} carrier(s) from {1} to {2}.{3} Continue?"
  },
  "text055": {
    "es": "{0} carrier(s) movidos a {1}.",
    "en": "{0} carrier(s) moved to {1}."
  },
  "text056": {
    "es": "Marcar {0} como {1} en el TMS.\n\n",
    "en": "Mark {0} as {1} in the TMS.\n\n"
  },
  "text057": {
    "es": "Esto refleja la activación en el TMS; no cambia su etapa ni hace falta para invitarlo.\n\n¿Continuar?",
    "en": "This reflects TMS activation; it does not change the stage and is not required for invitations. Continue?"
  },
  "text058": {
    "es": "{0} carrier(s) marcados como {1}.",
    "en": "{0} carrier(s) marked as {1}."
  },
  "text059": {
    "es": "sourcing › procurement › archivado · compartido con rateware",
    "en": "sourcing › procurement › archived · shared with rateware"
  },
  "text060": {
    "es": "Higiene",
    "en": "Hygiene"
  },
  "text061": {
    "es": "Rebotes",
    "en": "Bounces"
  },
  "text062": {
    "es": "Nuevo carrier",
    "en": "New carrier"
  },
  "text063": {
    "es": "Aplicando…",
    "en": "Applying…"
  },
  "text064": {
    "es": "Mover ({0})",
    "en": "Move ({0})"
  },
  "text065": {
    "es": "Dos ejes distintos:",
    "en": "Two separate dimensions:"
  },
  "text066": {
    "es": "la ETAPA es la posición en el pipeline; el ESTATUS es la activación en el TMS.",
    "en": "STAGE is the position in the pipeline; STATUS is activation in the TMS."
  },
  "text067": {
    "es": "Hay ",
    "en": "There are "
  },
  "text068": {
    "es": " onboardeado",
    "en": " onboarded"
  },
  "text069": {
    "es": " que sigue",
    "en": " that is still"
  },
  "text070": {
    "es": "s que siguen",
    "en": "s that are still"
  },
  "text071": {
    "es": " inactive — y eso nunca impide invitarlo",
    "en": " inactive — this never prevents an invitation"
  },
  "text072": {
    "es": " a un bid.",
    "en": " to a bid."
  },
  "text073": {
    "es": "Un carrier puede estar onboardeado y seguir inactive — y eso nunca impide invitarlo a un bid.",
    "en": "A carrier can be onboarded and still inactive — this never prevents a bid invitation."
  },
  "text074": {
    "es": "En procurement",
    "en": "In procurement"
  },
  "text075": {
    "es": "Archivados",
    "en": "Archived"
  },
  "text076": {
    "es": "En esta etapa",
    "en": "In this stage"
  },
  "text077": {
    "es": "Seleccionados",
    "en": "Selected"
  },
  "text078": {
    "es": "Etapas",
    "en": "Stages"
  },
  "text079": {
    "es": " · Vacías hoy: ",
    "en": " · Empty today: "
  },
  "text080": {
    "es": "Métricas parciales:",
    "en": "Partial metrics:"
  },
  "text081": {
    "es": "Buscar por nombre, dominio o correo…",
    "en": "Search by name, domain or email…"
  },
  "text082": {
    "es": "Seleccionar visibles",
    "en": "Select visible"
  },
  "text083": {
    "es": "Limpiar",
    "en": "Clear"
  },
  "text084": {
    "es": "Mover a",
    "en": "Move to"
  },
  "text085": {
    "es": " (solo Administrador)",
    "en": " (Administrator only)"
  },
  "text086": {
    "es": "Cargando pipeline…",
    "en": "Loading pipeline…"
  },
  "text087": {
    "es": "Razón social",
    "en": "Legal name"
  },
  "text088": {
    "es": "Contacto",
    "en": "Contact"
  },
  "text089": {
    "es": "Días",
    "en": "Days"
  },
  "text090": {
    "es": "Seleccionar {0}",
    "en": "Select {0}"
  },
  "text091": {
    "es": "— sin contacto",
    "en": "— no contact"
  },
  "text092": {
    "es": "guardado: ",
    "en": "saved: "
  },
  "text093": {
    "es": "Días desde su última actualización",
    "en": "Days since last update"
  },
  "text094": {
    "es": "Días en esta etapa",
    "en": "Days in this stage"
  },
  "text095": {
    "es": "Sin carriers en {0}",
    "en": "No carriers in {0}"
  },
  "text096": {
    "es": "Prueba con otra búsqueda.",
    "en": "Try another search."
  },
  "text097": {
    "es": "Mueve carriers desde otra etapa.",
    "en": "Move carriers from another stage."
  },
  "text098": {
    "es": "ETAPA EFECTIVA",
    "en": "EFFECTIVE STAGE"
  },
  "text099": {
    "es": " aparece en ",
    "en": " appears in "
  },
  "text100": {
    "es": " aunque su etapa guardada sea ",
    "en": " even though its saved stage is "
  },
  "text101": {
    "es": ": el backend promueve a quien tiene cotizaciones ligadas.",
    "en": ": the backend promotes carriers with linked quotes."
  },
  "text102": {
    "es": "Quien tiene cotizaciones ligadas aparece al menos en Nested, aunque su etapa guardada sea anterior: el backend lo promueve.",
    "en": "Carriers with linked quotes appear at least in Nested, even if their saved stage is earlier: the backend promotes them."
  },
  "text103": {
    "es": "Se muestra la efectiva y, cuando difiere, también la guardada.",
    "en": "The effective stage is shown, along with the saved stage when they differ."
  },
  "text104": {
    "es": "El dominio no recibe correo",
    "en": "The domain does not receive email"
  },
  "text105": {
    "es": "Buzón lleno",
    "en": "Mailbox full"
  },
  "text106": {
    "es": "La cuenta no existe o rechaza el correo",
    "en": "The account does not exist or rejects email"
  },
  "text107": {
    "es": "Rebotó",
    "en": "Bounced"
  },
  "text108": {
    "es": "Archivado",
    "en": "Archived"
  },
  "text109": {
    "es": "carriers encontrados que todavía no entran a procurement.",
    "en": "carriers found that have not yet entered procurement."
  },
  "text110": {
    "es": "pasó de la base de sourcing a procurement.",
    "en": "moved from sourcing to procurement."
  },
  "text111": {
    "es": "tiene cotizaciones ligadas, en staging o en el rate base.",
    "en": "has linked quotes in staging or the rate base."
  },
  "text112": {
    "es": "elegido para preparar su alta.",
    "en": "selected to prepare onboarding."
  },
  "text113": {
    "es": "ya se le mandó la invitación de alta.",
    "en": "onboarding invitation already sent."
  },
  "text114": {
    "es": "completó su registro como proveedor.",
    "en": "completed supplier registration."
  },
  "text115": {
    "es": "terminó la capacitación o la configuración en el TMS.",
    "en": "completed training or TMS setup."
  },
  "text116": {
    "es": "listo para usarse en procurement.",
    "en": "ready for procurement."
  },
  "text117": {
    "es": "firmó todo el paquete legal.",
    "en": "signed the complete legal package."
  },
  "text118": {
    "es": "fuera del pipeline; puede volver a sourcing o a procurement.",
    "en": "outside the pipeline; can return to sourcing or procurement."
  },
  "text119": {
    "es": "activo",
    "en": "active"
  },
  "text120": {
    "es": "inactivo",
    "en": "inactive"
  },
  "text121": {
    "es": "invitado",
    "en": "invited"
  },
  "text122": {
    "es": "bloqueado",
    "en": "blocked"
  },
  "text123": {
    "es": "Trae el Source ID de Apollo en sus notas",
    "en": "Has Apollo Source ID in its notes"
  },
  "text124": {
    "es": "Tiene más cotizaciones ligadas",
    "en": "Has more linked quotes"
  },
  "text125": {
    "es": "Cotizaciones ligadas",
    "en": "Linked quotes"
  },
  "text126": {
    "es": "Tiene el mejor score de salud",
    "en": "Has the best health score"
  },
  "text127": {
    "es": "Score de salud",
    "en": "Health score"
  },
  "text128": {
    "es": "Source ID de Apollo en notas",
    "en": "Apollo Source ID in notes"
  },
  "text129": {
    "es": "cotizaciones ligadas",
    "en": "linked quotes"
  },
  "text130": {
    "es": "score de salud",
    "en": "health score"
  },
  "text131": {
    "es": "una",
    "en": "one"
  },
  "text132": {
    "es": "dos",
    "en": "two"
  },
  "text133": {
    "es": "tres",
    "en": "three"
  },
  "text134": {
    "es": "cuatro",
    "en": "four"
  },
  "text135": {
    "es": "cinco",
    "en": "five"
  },
  "text136": {
    "es": "El patrón transfronterizo: la entidad mexicana y su LLC, con un contacto comercial.",
    "en": "Cross-border pattern: the Mexican entity and its LLC share a commercial contact."
  },
  "text137": {
    "es": "Mismo nombre con dominios distintos: la regla exacta no los junta.",
    "en": "Same name with different domains: the exact rule keeps them separate."
  },
  "text138": {
    "es": "{0} razones sociales, {1} dominios.",
    "en": "{0} legal names, {1} domains."
  },
  "text139": {
    "es": "Mismo dominio, razones sociales distintas.",
    "en": "Same domain, different legal names."
  },
  "text140": {
    "es": "Empresas distintas que comparten un contacto.",
    "en": "Different companies sharing a contact."
  },
  "text141": {
    "es": "1 participación RFx",
    "en": "1 RFx participation"
  },
  "text142": {
    "es": "{0} participaciones RFx",
    "en": "{0} RFx participations"
  },
  "text143": {
    "es": "este carrier",
    "en": "this carrier"
  },
  "text144": {
    "es": "Vas a fusionar un duplicado de «{0}» en el registro que se conserva.\n\n",
    "en": "You are about to merge a duplicate of “{0}” into the retained record.\n\n"
  },
  "text145": {
    "es": "El duplicado se BORRA de forma permanente. Antes, su historial —invitaciones, ofertas, ",
    "en": "The duplicate is permanently DELETED. First, its history — invitations, bids, "
  },
  "text146": {
    "es": "confirmaciones, contactos y grupos de WhatsApp, scorecards— pasa al que se conserva.\n\n",
    "en": "confirmations, contacts, WhatsApp groups and scorecards — moves to the retained record.\n\n"
  },
  "text147": {
    "es": "Esto no se puede deshacer. ¿Continuar?",
    "en": "This cannot be undone. Continue?"
  },
  "text148": {
    "es": "Fusionar y borrar el duplicado",
    "en": "Merge and delete duplicate"
  },
  "text149": {
    "es": "Fusionado: se borró {0} de «{1}» y su historial quedó en el que se conserva.",
    "en": "Merged: {0} was deleted from “{1}” and its history moved to the retained record."
  },
  "text150": {
    "es": "1 duplicado",
    "en": "1 duplicate"
  },
  "text151": {
    "es": "{0} duplicados",
    "en": "{0} duplicates"
  },
  "text152": {
    "es": " Quedan {0}; abajo aparece el siguiente.",
    "en": " {0} remain; the next one appears below."
  },
  "text153": {
    "es": " Ya no quedan duplicados exactos.",
    "en": " No exact duplicates remain."
  },
  "text154": {
    "es": "Dos cosas que se parecen y no son lo mismo: la misma empresa capturada dos veces, y dos empresas distintas que comparten un contacto comercial.",
    "en": "Two different cases: the same company entered twice, and two separate companies sharing a commercial contact."
  },
  "text155": {
    "es": "← Pipeline",
    "en": "← Pipeline"
  },
  "text156": {
    "es": "Recalcular",
    "en": "Recalculate"
  },
  "text157": {
    "es": "La regla:",
    "en": "The rule:"
  },
  "text158": {
    "es": "un duplicado es la misma razón social capturada dos veces. Nada más laxo. Compartir correo no prueba nada — una SA de CV y su LLC son dos carriers, y ambos se invitan por separado.",
    "en": "a duplicate is the same legal name entered twice. A shared email is not proof — a SA de CV and its LLC are two carriers, invited separately."
  },
  "text159": {
    "es": "Duplicados exactos · ",
    "en": "Exact duplicates · "
  },
  "text160": {
    "es": "{0} grupo{1}",
    "en": "{0} group(s)"
  },
  "text161": {
    "es": "mismo nombre normalizado Y mismo dominio",
    "en": "same normalized name AND same domain"
  },
  "text162": {
    "es": " · {0} registros · {1} se fusionarían",
    "en": " · {0} records · {1} would be merged"
  },
  "text163": {
    "es": "FUSIÓN SEGURA",
    "en": "SAFE MERGE"
  },
  "text164": {
    "es": "Calculando duplicados…",
    "en": "Finding duplicates…"
  },
  "text165": {
    "es": "CONSERVAR",
    "en": "KEEP"
  },
  "text166": {
    "es": "(sin nombre)",
    "en": "(unnamed)"
  },
  "text167": {
    "es": "FUSIONAR EN EL ANTERIOR",
    "en": "MERGE INTO PREVIOUS"
  },
  "text168": {
    "es": "Se conserva porque ",
    "en": "Retained because "
  },
  "text169": {
    "es": " Este grupo tiene {0} duplicados: se fusionan de uno en uno.",
    "en": " This group has {0} duplicates: they are merged one at a time."
  },
  "text170": {
    "es": "Sin duplicados exactos: nadie comparte razón social y dominio corporativo.",
    "en": "No exact duplicates: no records share both legal name and corporate domain."
  },
  "text171": {
    "es": "Los demás grupos, con la misma regla. Quién se conserva en cada uno lo decide el backend cuando le toca.",
    "en": "Remaining groups follow the same rule. The backend chooses which record to retain when each group is processed."
  },
  "text172": {
    "es": "Leyendo el CRM…",
    "en": "Loading CRM…"
  },
  "text173": {
    "es": "EN COLA",
    "en": "QUEUED"
  },
  "text174": {
    "es": " registros:",
    "en": " records:"
  },
  "text175": {
    "es": "No hay más grupos en cola.",
    "en": "No more queued groups."
  },
  "text176": {
    "es": "GUARDA DEL BACKEND",
    "en": "BACKEND GUARD"
  },
  "text177": {
    "es": "El servidor corre un preview primero y se niega a aplicar si el conjunto cambió desde entonces. Fusiona un duplicado por vez: al terminar aparece el siguiente.",
    "en": "The server previews first and refuses to apply if the set has changed. It merges one duplicate at a time; the next appears when finished."
  },
  "text178": {
    "es": "consolidate_exact_vendor_duplicates · dry_run: true → preview_count debe empatar con duplicates_to_remove",
    "en": "consolidate_exact_vendor_duplicates · dry_run: true → preview_count must match duplicates_to_remove"
  },
  "text179": {
    "es": "Ocultar la lista",
    "en": "Hide list"
  },
  "text180": {
    "es": "Ver todos los grupos ({0})",
    "en": "View all groups ({0})"
  },
  "text181": {
    "es": "Fusionando…",
    "en": "Merging…"
  },
  "text182": {
    "es": "Fusionar 1 duplicado",
    "en": "Merge 1 duplicate"
  },
  "text183": {
    "es": "Contacto compartido · ",
    "en": "Shared contact · "
  },
  "text184": {
    "es": "mismo correo o teléfono",
    "en": "same email or phone"
  },
  "text185": {
    "es": " · {0} registros · el racimo más grande son {1}",
    "en": " · {0} records · largest group has {1}"
  },
  "text186": {
    "es": "NO SON DUPLICADOS",
    "en": "NOT DUPLICATES"
  },
  "text187": {
    "es": "comparten ",
    "en": "share "
  },
  "text188": {
    "es": "Ningún contacto se repite entre carriers distintos.",
    "en": "No contacts are shared between different carriers."
  },
  "text189": {
    "es": "No se ofrece fusionar. Sólo se anota, para que en Carrier Fit se sepa que un contacto recibirá varias invitaciones.",
    "en": "Merging is not offered. This is noted so Carrier Fit can show that one contact will receive multiple invitations."
  },
  "text190": {
    "es": "Ver menos",
    "en": "Show less"
  },
  "text191": {
    "es": "Ver los {0}",
    "en": "View all {0}"
  },
  "text192": {
    "es": "Son empresas distintas: no se fusionan.",
    "en": "These are different companies: they are not merged."
  },
  "text193": {
    "es": "Fusionar",
    "en": "Merge"
  },
  "text194": {
    "es": "Por qué se separan",
    "en": "Why they are kept separate"
  },
  "text195": {
    "es": "Una versión anterior de este guardarraíl agrupaba por correo. Sobre una plantilla activa marcaba 4 pares y habría sacado 3 carriers legítimos de un bid.",
    "en": "An earlier guard grouped by email. On an active template it flagged 4 pairs and would have removed 3 legitimate carriers from a bid."
  },
  "text196": {
    "es": "La regla exacta —nombre normalizado Y dominio— encontraba 1. Esa es la diferencia entre limpiar la base y mutilarla.",
    "en": "The exact rule — normalized name AND domain — found 1, keeping legitimate carriers in the base."
  },
  "text197": {
    "es": "Nunca automático",
    "en": "Never automatic"
  },
  "text198": {
    "es": "Ni siquiera la fusión exacta corre sola. Preview, revisión humana, y la guarda de conteo del servidor por si algo cambió mientras mirabas.",
    "en": "Even exact merging requires a preview, human review and the server count guard in case something changed during review."
  },
  "text199": {
    "es": "Cuál se conserva,",
    "en": "Which record is retained,"
  },
  "text200": {
    "es": " en este orden: ",
    "en": " in this order: "
  },
  "text201": {
    "es": "Capturada por el carrier en su perfil",
    "en": "Entered by the carrier in its profile"
  },
  "text202": {
    "es": "del perfil",
    "en": "from profile"
  },
  "text203": {
    "es": "{0} quedó en el CRM",
    "en": "{0} was added to the CRM"
  },
  "text204": {
    "es": " como Targeted.",
    "en": " as Targeted."
  },
  "text205": {
    "es": " en Sourcing.",
    "en": " in Sourcing."
  },
  "text206": {
    "es": "Cancelar",
    "en": "Cancel"
  },
  "text207": {
    "es": "Crear carrier",
    "en": "Create carrier"
  },
  "text208": {
    "es": "Razón social *",
    "en": "Legal name *"
  },
  "text209": {
    "es": "Transportes Ejemplo SA de CV",
    "en": "Example Transport LLC"
  },
  "text210": {
    "es": "Nombre legal",
    "en": "Legal name"
  },
  "text211": {
    "es": "Dominio",
    "en": "Domain"
  },
  "text212": {
    "es": "Correo",
    "en": "Email"
  },
  "text213": {
    "es": "Correo no válido.",
    "en": "Invalid email."
  },
  "text214": {
    "es": "Canal preferido",
    "en": "Preferred channel"
  },
  "text215": {
    "es": "Ambos",
    "en": "Both"
  },
  "text216": {
    "es": "Entra a",
    "en": "Starts in"
  },
  "text217": {
    "es": "Procurement · Targeted (listo para invitar)",
    "en": "Procurement · Targeted (ready to invite)"
  },
  "text218": {
    "es": "Sourcing (todavía evaluándolo)",
    "en": "Sourcing (still evaluating)"
  },
  "text219": {
    "es": "Notas",
    "en": "Notes"
  },
  "text220": {
    "es": "Sin correo no hay invitación:",
    "en": "No email, no invitation:"
  },
  "text221": {
    "es": "el envío del RFx y los avisos de adjudicación salen por correo. Puedes crearlo sin él y completarlo después.",
    "en": "RFx invitations and award notices are sent by email. You can create the carrier without it and add it later."
  },
  "text222": {
    "es": "Enlace de perfil · {0}",
    "en": "Profile link · {0}"
  },
  "text223": {
    "es": "Copiado ✓",
    "en": "Copied ✓"
  },
  "text224": {
    "es": "Copiar enlace",
    "en": "Copy link"
  },
  "text225": {
    "es": "Creando…",
    "en": "Creating…"
  },
  "text226": {
    "es": "Crear enlace",
    "en": "Create link"
  },
  "text227": {
    "es": "Con este enlace el carrier llena o actualiza su propio perfil, sin cuenta: empresa, contactos, razón social, servicios y cobertura, equipo y seguros, y pagos. Vale 30 días. Cada vez que se crea es uno nuevo; los anteriores siguen sirviendo hasta que vencen.",
    "en": "This link lets the carrier complete or update its profile without an account: company, contacts, legal name, services and coverage, equipment, insurance and payments. Valid for 30 days. Each new link is unique; previous links work until they expire."
  },
  "text228": {
    "es": "Copiado al portapapeles. ",
    "en": "Copied to clipboard. "
  },
  "text229": {
    "es": "Cópialo de aquí. ",
    "en": "Copy it from here. "
  },
  "text230": {
    "es": "Vence el ",
    "en": "Expires on "
  },
  "text231": {
    "es": ". Envíalo tú al carrier por correo o WhatsApp: Bidware no lo manda solo.",
    "en": ". Send it to the carrier by email or WhatsApp: Bidware does not send it automatically."
  }
};

export const tr = translator(copy);
