import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  "text001": {
    "es": "PRIMARIO",
    "en": "PRIMARY"
  },
  "text002": {
    "es": "RESPALDO",
    "en": "BACKUP"
  },
  "text003": {
    "es": "SIN ADJUDICAR",
    "en": "UNAWARDED"
  },
  "text004": {
    "es": "DESIERTO",
    "en": "NO AWARD"
  },
  "text005": {
    "es": "Se prepararán {0} aviso(s) por correo: {1} primario(s), {2} respaldo(s) y {3} sin adjudicación.",
    "en": "Prepare {0} email notice(s): {1} primary, {2} backup and {3} without an award."
  },
  "text006": {
    "es": "\n\n{0} lane(s) siguen con ofertas y sin primario: esos carriers reciben el aviso de cierre.",
    "en": "\n\n{0} lane(s) still have bids but no primary: those carriers receive a closeout notice."
  },
  "text007": {
    "es": "\n\nNo se envía nada: quedan como borradores en la cola, con su compuerta. Los que ya se enviaron antes no se tocan.\n\n¿Continuar?",
    "en": "\n\nNothing is sent: notices remain as drafts in the queue, subject to approval. Previously sent notices are untouched. Continue?"
  },
  "text008": {
    "es": "{0} · Reintentar es seguro ({1}…).",
    "en": "{0} · Safe to retry ({1}…)."
  },
  "text009": {
    "es": "Notificación de adjudicación",
    "en": "Award notification"
  },
  "text010": {
    "es": "{0} carrier{1} participaron",
    "en": "{0} carrier{1} participated"
  },
  "text011": {
    "es": "← Cierre del evento",
    "en": "← Event closeout"
  },
  "text012": {
    "es": "Todos los que participaron reciben respuesta, no solo el que ganó. Un carrier que invirtió tiempo y nunca supo qué pasó es un carrier que no vuelve a cotizar.",
    "en": "All participants receive a response, including those who did not win. Keeping carriers informed encourages them to quote again."
  },
  "text013": {
    "es": "CONTRATO REAL",
    "en": "ACTUAL CONTRACT"
  },
  "text014": {
    "es": "generate_rfx_award_notices · app_origin · bid_link al Bid Room del carrier · pasa por la misma cola de envío, con su compuerta",
    "en": "generate_rfx_award_notices · app_origin · bid_link to the carrier Bid Room · uses the same Delivery queue and approval gate"
  },
  "text015": {
    "es": "Solo un Administrador prepara los avisos:",
    "en": "Only an Administrator prepares notices:"
  },
  "text016": {
    "es": "aquí puedes ver qué recibirá cada carrier.",
    "en": "you can see what each carrier will receive here."
  },
  "text017": {
    "es": "Cotizaron",
    "en": "Quoted"
  },
  "text018": {
    "es": "Primarios",
    "en": "Primaries"
  },
  "text019": {
    "es": "Respaldos",
    "en": "Backups"
  },
  "text020": {
    "es": "Sin adjudicar",
    "en": "Unawarded"
  },
  "text021": {
    "es": "Sin correo",
    "en": "No email"
  },
  "text022": {
    "es": "Cargando el evento…",
    "en": "Loading event…"
  },
  "text023": {
    "es": "Idioma de los avisos: ",
    "en": "Notice language: "
  },
  "text024": {
    "es": "español",
    "en": "Spanish"
  },
  "text025": {
    "es": "inglés",
    "en": "English"
  },
  "text026": {
    "es": " — el backend lo decide por el nombre y el cliente del evento. Uno por carrier, con todos sus lanes. Solo por correo.",
    "en": " — the backend chooses based on the event name and customer. One per carrier with all its lanes. Email only."
  },
  "text027": {
    "es": " · {0} cotizaron, {1} solo invitados",
    "en": " · {0} quoted, {1} invited only"
  },
  "text028": {
    "es": "Asunto",
    "en": "Subject"
  },
  "text029": {
    "es": "Tabla por lane: resultado, ruta, equipo, servicio, capacidad, tránsito, su tarifa y notas.",
    "en": "Table by lane: result, route, equipment, service, capacity, transit, rate and notes."
  },
  "text030": {
    "es": "Correo",
    "en": "Email"
  },
  "text031": {
    "es": "{0} sin correo: no se les puede avisar",
    "en": "{0} without email: cannot be notified"
  },
  "text032": {
    "es": "todos con correo",
    "en": "all have email"
  },
  "text033": {
    "es": "Compuerta de envío",
    "en": "Sending gate"
  },
  "text034": {
    "es": " BORRADORES",
    "en": " DRAFTS"
  },
  "text035": {
    "es": "Generar los borradores no envía nada. Pasan por la misma cola que las invitaciones, con la misma compuerta: una persona revisa y autoriza. Reintentar es seguro — lleva la misma llave de idempotencia.",
    "en": "Generating drafts sends nothing. They use the same queue and gate as invitations: a person reviews and authorizes them. Retries use the same idempotency key."
  },
  "text036": {
    "es": " borrador(es) nuevos · ",
    "en": " new draft(s) · "
  },
  "text037": {
    "es": " actualizados",
    "en": " updated"
  },
  "text038": {
    "es": " · {0} ya enviados, intactos",
    "en": " · {0} already sent, unchanged"
  },
  "text039": {
    "es": " · {0} carrier(s) sin correo quedaron fuera — agrégales correo en Carrier CRM y vuelve a generar.",
    "en": " · {0} carrier(s) without email were excluded — add their email in Carrier CRM and generate again."
  },
  "text040": {
    "es": "{0} lane{1} con ofertas y sin primario: adjudícalos antes de notificar, o esos carriers reciben el aviso de cierre.",
    "en": "{0} lane{1} with bids but no primary: award them before notifying, or those carriers receive a closeout notice."
  },
  "text041": {
    "es": " sigue",
    "en": " remains"
  },
  "text042": {
    "es": "s siguen",
    "en": "s remain"
  },
  "text043": {
    "es": "Cada lane con ofertas tiene primario o está desierto.",
    "en": "Every lane with bids has a primary or is closed without award."
  },
  "text044": {
    "es": "Todos los lanes con ofertas tienen primario.",
    "en": "All lanes with bids have a primary."
  },
  "text045": {
    "es": "Preparando…",
    "en": "Preparing…"
  },
  "text046": {
    "es": "Generar {0} borrador{1}",
    "en": "Generate {0} draft{1}"
  },
  "text047": {
    "es": "Ir a la cola de envío →",
    "en": "Go to Delivery queue →"
  },
  "text048": {
    "es": " y {0} más",
    "en": " and {0} more"
  },
  "text049": {
    "es": "Cliente",
    "en": "Customer"
  },
  "text050": {
    "es": "Segmento operativo",
    "en": "Operating segment"
  },
  "text051": {
    "es": "Tipo de solicitud",
    "en": "Request type"
  },
  "text052": {
    "es": "Equipo estándar",
    "en": "Standard equipment"
  },
  "text053": {
    "es": "Operación · servicio",
    "en": "Operation · service"
  },
  "text054": {
    "es": "Frecuencia global",
    "en": "Overall frequency"
  },
  "text055": {
    "es": "{0} cargas/sem",
    "en": "{0} loads/wk"
  },
  "text056": {
    "es": "{0} cargas/año",
    "en": "{0} loads/year"
  },
  "text057": {
    "es": "Moneda",
    "en": "Currency"
  },
  "text058": {
    "es": "Visibilidad de bids",
    "en": "Bid visibility"
  },
  "text059": {
    "es": "Cierre de cotización",
    "en": "Quote deadline"
  },
  "text060": {
    "es": "Arranque estimado",
    "en": "Estimated start"
  },
  "text061": {
    "es": "Rutas",
    "en": "Lanes"
  },
  "text062": {
    "es": "{0} ruta{1} · {2} con target",
    "en": "{0} lane{1} · {2} with target"
  },
  "text063": {
    "es": "de la solicitud del shipper · editable",
    "en": "from shipper request · editable"
  },
  "text064": {
    "es": "de la cotización{0} · editable",
    "en": "from quote{0} · editable"
  },
  "text065": {
    "es": "capturados por el equipo · editable",
    "en": "entered by the team · editable"
  },
  "text066": {
    "es": "Estampado automático:",
    "en": "Automatic mapping:"
  },
  "text067": {
    "es": "los campos vienen homologados por rubro desde la solicitud del shipper. Edita lo necesario antes de lanzar; la cédula se guarda en cada ruta del evento.",
    "en": "fields are standardized by category from the shipper request. Edit as needed before launch; details are saved on each event lane."
  },
  "text068": {
    "es": "Estampado desde QuoteDesk",
    "en": "Mapped from QuoteDesk"
  },
  "text069": {
    "es": "las rutas y sus datos vienen de la cotización. Edita lo necesario antes de lanzar; la cédula se guarda en cada ruta del evento.",
    "en": "lanes and their details come from the quote. Edit as needed before launch; details are saved on each event lane."
  },
  "text070": {
    "es": "Captura manual:",
    "en": "Manual entry:"
  },
  "text071": {
    "es": "la cédula y las rutas las cargó el equipo. Edita lo necesario antes de lanzar; la cédula se guarda en cada ruta del evento.",
    "en": "the team entered the details and lanes. Edit as needed before launch; details are saved on each event lane."
  },
  "text072": {
    "es": "Cédula general del proyecto",
    "en": "Project overview"
  },
  "text073": {
    "es": "Sin definir",
    "en": "Undefined"
  },
  "text074": {
    "es": "Matriz de rutas / Lane Requirements",
    "en": "Lane matrix / Lane requirements"
  },
  "text075": {
    "es": "Agregar carriers con Carrier Fit",
    "en": "Add carriers with Carrier Fit"
  },
  "text076": {
    "es": "Cargar más rutas",
    "en": "Load more lanes"
  },
  "text077": {
    "es": "Origen",
    "en": "Origin"
  },
  "text078": {
    "es": "Destino",
    "en": "Destination"
  },
  "text079": {
    "es": "Equipo",
    "en": "Equipment"
  },
  "text080": {
    "es": "Operación",
    "en": "Operation"
  },
  "text081": {
    "es": "Servicio",
    "en": "Service"
  },
  "text082": {
    "es": "Segmento",
    "en": "Segment"
  },
  "text083": {
    "es": "Ofertas",
    "en": "Bids"
  },
  "text084": {
    "es": "{0}/sem",
    "en": "{0}/wk"
  },
  "text085": {
    "es": "Corrige origen, destino, equipo, volumen o requisitos",
    "en": "Edit origin, destination, equipment, volume or requirements"
  },
  "text086": {
    "es": "Editar",
    "en": "Edit"
  },
  "text087": {
    "es": "Autoriza las {0} invitación(es) en borrador de este lane",
    "en": "Authorize this lane's {0} draft invitation(s)"
  },
  "text088": {
    "es": "Este lane no tiene invitaciones en borrador",
    "en": "This lane has no draft invitations"
  },
  "text089": {
    "es": "Autorizar {0}",
    "en": "Authorize {0}"
  },
  "text090": {
    "es": "Autorizado",
    "en": "Authorized"
  },
  "text091": {
    "es": "Mostrar solo las primeras {0}",
    "en": "Show only the first {0}"
  },
  "text092": {
    "es": "+ {0} ruta{1} más{2}",
    "en": "+ {0} more lane{1}{2}"
  },
  "text093": {
    "es": " · importadas del intake",
    "en": " · imported from intake"
  },
  "text094": {
    "es": " · importadas de QuoteDesk",
    "en": " · imported from QuoteDesk"
  },
  "text095": {
    "es": "Sin rutas todavía.",
    "en": "No lanes yet."
  },
  "text096": {
    "es": " Cárgalas en el asistente del borrador, o promueve una solicitud de shipper.",
    "en": " Load them in the draft wizard, or promote a shipper request."
  },
  "text097": {
    "es": "Cargar rutas →",
    "en": "Load lanes →"
  },
  "text098": {
    "es": "Criterios & reglas — snippets homologados",
    "en": "Criteria & rules — standardized snippets"
  },
  "text099": {
    "es": "▲ amplía alcance",
    "en": "▲ widens reach"
  },
  "text100": {
    "es": "▼ acota · ↑ precio",
    "en": "▼ narrows reach · ↑ price"
  },
  "text101": {
    "es": "Sin capturar",
    "en": "Not entered"
  },
  "text102": {
    "es": " de ",
    "en": " of "
  },
  "text103": {
    "es": " rutas no llevan este texto; cada una conserva el suyo.",
    "en": " lanes do not have this text; each keeps its own."
  },
  "text104": {
    "es": "Mapear a…",
    "en": "Map to…"
  },
  "text105": {
    "es": " · sugerido",
    "en": " · suggested"
  },
  "text106": {
    "es": "Dejar como viene",
    "en": "Keep as provided"
  },
  "text107": {
    "es": "Usar «",
    "en": "Use “"
  },
  "text108": {
    "es": "Guardar como sinónimo",
    "en": "Save as synonym"
  },
  "text109": {
    "es": "Se crea tal cual",
    "en": "Created as provided"
  },
  "text110": {
    "es": "Por mapear",
    "en": "To map"
  },
  "text111": {
    "es": "Equipo (Google Chat)",
    "en": "Team (Google Chat)"
  },
  "text112": {
    "es": "Todos los carriers del evento",
    "en": "All event carriers"
  },
  "text113": {
    "es": "Todos los carriers de este lane",
    "en": "All carriers on this lane"
  },
  "text114": {
    "es": "Solo este carrier",
    "en": "Only this carrier"
  },
  "text115": {
    "es": "lo verán",
    "en": "will see it"
  },
  "text116": {
    "es": "lo verá",
    "en": "will see it"
  },
  "text117": {
    "es": "Esa adjudicación ya estaba aplicada; no se duplicó.",
    "en": "That award was already applied; it was not duplicated."
  },
  "text118": {
    "es": "Adjudicado como {0}.",
    "en": "Awarded as {0}."
  },
  "text119": {
    "es": "{0} oferta(s) que no se adjudican",
    "en": "{0} bid(s) that will not be awarded"
  },
  "text120": {
    "es": "sin ofertas",
    "en": "no bids"
  },
  "text121": {
    "es": "{0} sin adjudicar a nadie:\n{1}\n\n",
    "en": "{0} without an award: {1}\n\n"
  },
  "text122": {
    "es": "Este lane se cierra",
    "en": "This lane will close"
  },
  "text123": {
    "es": "Estos {0} lanes se cierran",
    "en": "These {0} lanes will close"
  },
  "text124": {
    "es": "Los carriers que participaron solo en {0} recibirán un aviso de que la ruta se cerró sin adjudicar. ",
    "en": "Carriers participating only in {0} will receive notice that the lane closed without award. "
  },
  "text125": {
    "es": "él",
    "en": "it"
  },
  "text126": {
    "es": "ellos",
    "en": "them"
  },
  "text127": {
    "es": "Se puede reabrir mientras el evento no se cierre.\n\n",
    "en": "It can be reopened until the event closes.\n\n"
  },
  "text128": {
    "es": "Motivo (interno; los carriers no lo ven):",
    "en": "Reason (internal; hidden from carriers):"
  },
  "text129": {
    "es": "Ese lane ya estaba desierto.",
    "en": "That lane was already closed without award."
  },
  "text130": {
    "es": "Esos lanes ya estaban desiertos.",
    "en": "Those lanes were already closed without award."
  },
  "text131": {
    "es": "Lane declarado desierto.",
    "en": "Lane closed without award."
  },
  "text132": {
    "es": "{0} lanes declarados desiertos.",
    "en": "{0} lanes closed without award."
  },
  "text133": {
    "es": "Lane reabierto: ya se puede adjudicar.",
    "en": "Lane reopened: awards are now available."
  },
  "text134": {
    "es": "Vas a entregar {0} adjudicación(es) a rateware.\n\n",
    "en": "You are about to hand {0} award(s) to rateware.\n\n"
  },
  "text135": {
    "es": "{0} sin transportista:\n",
    "en": "{0} without a carrier:\n"
  },
  "text136": {
    "es": "Este lane desierto se cierra",
    "en": "This unawarded lane will close"
  },
  "text137": {
    "es": "Estos {0} lanes desiertos se cierran",
    "en": "These {0} unawarded lanes will close"
  },
  "text138": {
    "es": "Las tarifas quedan encoladas para revisión humana, no se publican solas. ",
    "en": "Rates enter the human review queue; they are not published automatically. "
  },
  "text139": {
    "es": "Reintentar con el mismo id es seguro.\n\n¿Continuar?",
    "en": "Retrying with the same ID is safe. Continue?"
  },
  "text140": {
    "es": "Entregado a rateware: {0} tarifa(s) en revisión",
    "en": "Handed to rateware: {0} rate(s) under review"
  },
  "text141": {
    "es": " · {0} nuevas",
    "en": " · {0} new"
  },
  "text142": {
    "es": " · {0} ligadas",
    "en": " · {0} linked"
  },
  "text143": {
    "es": "Cierre enviado.",
    "en": "Closeout submitted."
  },
  "text144": {
    "es": "{0} de {1} lanes decididos: {2} con primario, {3} desierto{4}",
    "en": "{0} of {1} lanes decided: {2} with primary, {3} closed without award{4}"
  },
  "text145": {
    "es": "{0} de {1} lanes con primario",
    "en": "{0} of {1} lanes with primary"
  },
  "text146": {
    "es": "{0} lane{1} sin ninguna oferta: declára{2} o extiende la fecha",
    "en": "{0} lane{1} without bids: {2} or extend the deadline"
  },
  "text147": {
    "es": "lo desierto",
    "en": "close it without award"
  },
  "text148": {
    "es": "los desiertos",
    "en": "close them without award"
  },
  "text149": {
    "es": "Ningún lane sin ofertas queda abierto",
    "en": "No lane without bids remains open"
  },
  "text150": {
    "es": "{0} adjudicación{1} con la oferta ya vencida",
    "en": "{0} award{1} with expired bids"
  },
  "text151": {
    "es": "Ninguna adjudicación con oferta vencida",
    "en": "No awards with expired bids"
  },
  "text152": {
    "es": "{0} carrier{1} adjudicado{2} está{3} bloqueado{4}",
    "en": "Blocked awarded carrier{1}: {0}"
  },
  "text153": {
    "es": "Ningún carrier adjudicado está bloqueado",
    "en": "No awarded carrier is blocked"
  },
  "text154": {
    "es": "{0} adjudicado{1} dij{2} \"no puedo\" a un rubro",
    "en": "{0} awarded carrier{1} declined a category"
  },
  "text155": {
    "es": "{0} adjudicado{1} sin confirmar sus rubros",
    "en": "{0} awarded carrier{1} with unconfirmed categories"
  },
  "text156": {
    "es": "Los adjudicados confirmaron sus rubros{0}",
    "en": "Awarded carriers confirmed their categories{0}"
  },
  "text157": {
    "es": " ({0} con excepciones)",
    "en": " ({0} with exceptions)"
  },
  "text158": {
    "es": "Los adjudicados confirman sus rubros en su Bid Room",
    "en": "Awarded carriers confirm categories in their Bid Room"
  },
  "text159": {
    "es": "Con primario",
    "en": "With primary"
  },
  "text160": {
    "es": "Con respaldo",
    "en": "With backup"
  },
  "text161": {
    "es": "Desiertos",
    "en": "Closed without award"
  },
  "text162": {
    "es": "Sin cubrir",
    "en": "Uncovered"
  },
  "text163": {
    "es": "Ahorro vs objetivo",
    "en": "Savings vs target"
  },
  "text164": {
    "es": "Solo un Administrador adjudica:",
    "en": "Only an Administrator awards:"
  },
  "text165": {
    "es": "declara un lane desierto y entrega a rateware. Aquí puedes revisar las ofertas.",
    "en": "closes lanes without award and hands them to rateware. You can review bids here."
  },
  "text166": {
    "es": "{0} cargas/semana",
    "en": "{0} loads/week"
  },
  "text167": {
    "es": "objetivo {0}",
    "en": "target {0}"
  },
  "text168": {
    "es": "{0} oferta(s)",
    "en": "{0} bid(s)"
  },
  "text169": {
    "es": "Vuelve a abrir el lane para adjudicarlo",
    "en": "Reopen the lane to award it"
  },
  "text170": {
    "es": "Reabrir",
    "en": "Reopen"
  },
  "text171": {
    "es": "Quita primero el respaldo para declararlo desierto.",
    "en": "Remove the backup before closing without award."
  },
  "text172": {
    "es": "Cerrar este lane sin adjudicarlo a nadie",
    "en": "Close this lane without awarding it"
  },
  "text173": {
    "es": "Declarar desierto",
    "en": "Close without award"
  },
  "text174": {
    "es": "CUBIERTO",
    "en": "COVERED"
  },
  "text175": {
    "es": "SIN PRIMARIO",
    "en": "NO PRIMARY"
  },
  "text176": {
    "es": "SIN OFERTAS",
    "en": "NO BIDS"
  },
  "text177": {
    "es": "Se cierra sin adjudicar",
    "en": "Closes without award"
  },
  "text178": {
    "es": "Reabre el lane para adjudicarlo.",
    "en": "Reopen the lane to award it."
  },
  "text179": {
    "es": "oferta vencida el {0}",
    "en": "bid expired on {0}"
  },
  "text180": {
    "es": "vigente al {0}",
    "en": "valid through {0}"
  },
  "text181": {
    "es": "sin vigencia declarada",
    "en": "no declared validity"
  },
  "text182": {
    "es": "Rubros respondidos sin excepciones ni rechazos",
    "en": "Answered categories have no exceptions or refusals"
  },
  "text183": {
    "es": "No ha confirmado los términos en su Bid Room",
    "en": "Has not confirmed terms in its Bid Room"
  },
  "text184": {
    "es": "rubros sin confirmar",
    "en": "unconfirmed categories"
  },
  "text185": {
    "es": "Adjudicación retirada.",
    "en": "Award withdrawn."
  },
  "text186": {
    "es": "Quitar",
    "en": "Remove"
  },
  "text187": {
    "es": "Primario",
    "en": "Primary"
  },
  "text188": {
    "es": "Respaldo",
    "en": "Backup"
  },
  "text189": {
    "es": "Nadie cotizó este lane.",
    "en": "Nobody quoted this lane."
  },
  "text190": {
    "es": "Nadie cotizó este lane. Extiende la fecha, invita más carriers o declara el lane desierto.",
    "en": "Nobody quoted this lane. Extend the deadline, invite more carriers or close the lane without award."
  },
  "text191": {
    "es": "Sin lanes",
    "en": "No lanes"
  },
  "text192": {
    "es": "Este evento no tiene lanes que adjudicar.",
    "en": "This event has no lanes to award."
  },
  "text193": {
    "es": "Para cerrar el evento",
    "en": "To close the event"
  },
  "text194": {
    "es": "Entregando…",
    "en": "Handing off…"
  },
  "text195": {
    "es": "Cerrar y entregar a rateware",
    "en": "Close and hand off to rateware"
  },
  "text196": {
    "es": "Cerrar y entregar — bloqueado",
    "en": "Close and hand off — blocked"
  },
  "text197": {
    "es": "Las tarifas adjudicadas quedan en revisión humana en rateware; no se publican solas.{0}",
    "en": "Awarded rates enter human review in rateware; they are not published automatically.{0}"
  },
  "text198": {
    "es": " {0} sin transportista.",
    "en": " {0} without a carrier."
  },
  "text199": {
    "es": "El lane desierto cierra",
    "en": "The unawarded lane closes"
  },
  "text200": {
    "es": "Los {0} lanes desiertos cierran",
    "en": "The {0} unawarded lanes close"
  },
  "text201": {
    "es": "Este evento no tiene lanes.",
    "en": "This event has no lanes."
  },
  "text202": {
    "es": "{0}. Cerrar con lanes sin cubrir deja demanda sin transportista: adjudica, extiende la fecha o declara el lane desierto de forma explícita.",
    "en": "{0}. Closing with uncovered lanes leaves demand without a carrier: award, extend the deadline or explicitly close the lane without award."
  },
  "text203": {
    "es": "Falta decidir 1 lane",
    "en": "1 lane remains undecided"
  },
  "text204": {
    "es": "Faltan {0} lanes por decidir",
    "en": "{0} lanes remain undecided"
  },
  "text205": {
    "es": "{0} \"no puedo\" a un rubro del segmento. Acuérdenlo con él o adjudica a otro; rateware no debe recibir un término que el carrier no cumple.",
    "en": "{0} “cannot comply” with a segment category. Resolve it with the carrier or award another; rateware must not receive terms a carrier cannot meet."
  },
  "text206": {
    "es": "Un carrier adjudicado dijo",
    "en": "An awarded carrier said"
  },
  "text207": {
    "es": "{0} carriers adjudicados dijeron",
    "en": "{0} awarded carriers said"
  },
  "closeoutExpired": {
    "es": "Hay ofertas adjudicadas vencidas. Renueva su vigencia o adjudica a otro carrier antes de entregar.",
    "en": "Awarded offers have expired. Renew their validity or award another carrier before handing off."
  },
  "closeoutBlocked": {
    "es": "Hay carriers adjudicados bloqueados. Adjudica a otro carrier antes de entregar.",
    "en": "Awarded carriers are blocked. Award another carrier before handing off."
  },
  "closeoutRefused": {
    "es": "Un carrier adjudicado rechazó un rubro. Acuérdenlo con él o adjudica a otro antes de entregar.",
    "en": "An awarded carrier refused a category. Resolve it with the carrier or award another before handing off."
  },
  "text208": {
    "es": "Nadie cotizó en este evento: no hay tarifas que entregar a rateware. Si ya no sigue, archívalo.",
    "en": "Nobody quoted this event: no rates to hand to rateware. Archive it if it will not continue."
  },
  "text209": {
    "es": "Declarando…",
    "en": "Closing without award…"
  },
  "text210": {
    "es": "Declarar desierto el lane sin cubrir",
    "en": "Close uncovered lane without award"
  },
  "text211": {
    "es": "Declarar desiertos los {0} lanes sin cubrir",
    "en": "Close {0} uncovered lanes without award"
  },
  "text212": {
    "es": "1 lane tiene",
    "en": "1 lane has"
  },
  "text213": {
    "es": "{0} lanes tienen",
    "en": "{0} lanes have"
  },
  "text214": {
    "es": " respaldo y no primario: elige el primario o quita el respaldo.",
    "en": " a backup but no primary: choose a primary or remove the backup."
  },
  "text215": {
    "es": "Avisar a los carriers →",
    "en": "Notify carriers →"
  },
  "text216": {
    "es": "No se pudieron leer las confirmaciones de rubros: {0}",
    "en": "Could not load category confirmations: {0}"
  },
  "text217": {
    "es": "{0}/{1} rubros",
    "en": "{0}/{1} categories"
  },
  "text218": {
    "es": "{0} excepci{1}",
    "en": "{0} exception(s)"
  },
  "text219": {
    "es": "{0} no puede",
    "en": "{0} cannot comply"
  },
  "text220": {
    "es": "Todas",
    "en": "All"
  },
  "text221": {
    "es": "Por responder",
    "en": "Awaiting reply"
  },
  "text222": {
    "es": "Sin leer",
    "en": "Unread"
  },
  "text223": {
    "es": "Resueltas",
    "en": "Resolved"
  },
  "text224": {
    "es": "Todo el evento",
    "en": "Entire event"
  },
  "text225": {
    "es": "Evento",
    "en": "Event"
  },
  "text226": {
    "es": "{0} verán este mensaje en su Bid Room.\n\n¿Enviar?",
    "en": "{0} will see this message in their Bid Room. Send?"
  },
  "text227": {
    "es": "Mensaje enviado.",
    "en": "Message sent."
  },
  "text228": {
    "es": "Nota interna (solo la ve el equipo):",
    "en": "Internal note (team only):"
  },
  "text229": {
    "es": "Conversaciones",
    "en": "Conversations"
  },
  "text230": {
    "es": "Con los carriers del evento: por hilo del evento, de cada lane o privado",
    "en": "With event carriers: event, lane or private threads"
  },
  "text231": {
    "es": "Volver al evento",
    "en": "Back to event"
  },
  "text232": {
    "es": "Actualizar",
    "en": "Refresh"
  },
  "text233": {
    "es": "Nueva conversación",
    "en": "New conversation"
  },
  "text234": {
    "es": "Google Chat no está conectado: los mensajes quedan aquí y en el Bid Room de cada carrier.",
    "en": "Google Chat is not connected: messages remain here and in each carrier's Bid Room."
  },
  "text235": {
    "es": "Este evento aún no tiene hilo general.",
    "en": "This event has no general thread yet."
  },
  "text236": {
    "es": "Lo ven todos los carriers invitados al evento",
    "en": "Visible to all carriers invited to the event"
  },
  "text237": {
    "es": "Abrir hilo del evento",
    "en": "Open event thread"
  },
  "text238": {
    "es": "Cargando conversaciones…",
    "en": "Loading conversations…"
  },
  "text239": {
    "es": "Sin conversaciones",
    "en": "No conversations"
  },
  "text240": {
    "es": "Aparecen cuando un carrier escribe desde su Bid Room o cuando el equipo abre una.",
    "en": "Conversations appear when a carrier writes from its Bid Room or the team opens one."
  },
  "text241": {
    "es": "Nada en esta vista.",
    "en": "Nothing in this view."
  },
  "text242": {
    "es": "Resuelta",
    "en": "Resolved"
  },
  "text243": {
    "es": " · asignada a {0}",
    "en": " · assigned to {0}"
  },
  "text244": {
    "es": "el equipo",
    "en": "the team"
  },
  "text245": {
    "es": "Marcar leída",
    "en": "Mark read"
  },
  "text246": {
    "es": "Marcar sin leer",
    "en": "Mark unread"
  },
  "text247": {
    "es": "Resolver",
    "en": "Resolve"
  },
  "text248": {
    "es": "Asignarme",
    "en": "Assign to me"
  },
  "text249": {
    "es": "Nota interna",
    "en": "Internal note"
  },
  "text250": {
    "es": "Guarda en su invitación la oferta que dio en el chat",
    "en": "Save the bid given in chat to the invitation"
  },
  "text251": {
    "es": "Registrar oferta",
    "en": "Record bid"
  },
  "text252": {
    "es": "Nota interna:",
    "en": "Internal note:"
  },
  "text253": {
    "es": "Responder · ",
    "en": "Reply · "
  },
  "text254": {
    "es": "Enviando…",
    "en": "Sending…"
  },
  "text255": {
    "es": "Enviar",
    "en": "Send"
  },
  "text256": {
    "es": "Conversación abierta.",
    "en": "Conversation opened."
  },
  "text257": {
    "es": "Oferta registrada en la invitación del carrier; la conversación quedó resuelta.",
    "en": "Bid recorded on the carrier invitation; conversation resolved."
  },
  "text258": {
    "es": "Cancelar",
    "en": "Cancel"
  },
  "text259": {
    "es": "¿A quién?",
    "en": "To whom?"
  },
  "text260": {
    "es": "Un carrier (privado)",
    "en": "One carrier (private)"
  },
  "text261": {
    "es": "Todos los carriers de un lane",
    "en": "All carriers on a lane"
  },
  "text262": {
    "es": "Elige el lane…",
    "en": "Choose a lane…"
  },
  "text263": {
    "es": "Elige el carrier…",
    "en": "Choose a carrier…"
  },
  "text264": {
    "es": "Primero el lane",
    "en": "Choose the lane first"
  },
  "text265": {
    "es": "Mensaje",
    "en": "Message"
  },
  "text266": {
    "es": " en su Bid Room.",
    "en": " in their Bid Room."
  },
  "text267": {
    "es": "Registrar la oferta del chat",
    "en": "Record chat bid"
  },
  "text268": {
    "es": "Guardando…",
    "en": "Saving…"
  },
  "text269": {
    "es": "Tarifa all-in *",
    "en": "All-in rate *"
  },
  "text270": {
    "es": "Capacidad / semana",
    "en": "Capacity / week"
  },
  "text271": {
    "es": "Días de tránsito",
    "en": "Transit days"
  },
  "text272": {
    "es": "Notas",
    "en": "Notes"
  },
  "text273": {
    "es": "Se guarda como su oferta (como si la hubiera enviado en su Bid Room), con el último mensaje suyo como fuente, y la conversación queda resuelta.",
    "en": "Saved as the carrier's bid, as if submitted in its Bid Room, using its latest message as source. The conversation is resolved."
  },
  "text274": {
    "es": "Lista",
    "en": "Ready"
  },
  "text275": {
    "es": "Omitida",
    "en": "Skipped"
  },
  "text276": {
    "es": "Repetida",
    "en": "Repeated"
  },
  "text277": {
    "es": "Sin ruta",
    "en": "No route"
  },
  "text278": {
    "es": "Tipo de camión",
    "en": "Truck type"
  },
  "text279": {
    "es": "Tipo de equipo",
    "en": "Equipment type"
  },
  "text280": {
    "es": "Vol/sem",
    "en": "Vol/wk"
  },
  "text281": {
    "es": "Tarifa objetivo",
    "en": "Target rate"
  },
  "text282": {
    "es": "Estado",
    "en": "Status"
  },
  "text283": {
    "es": "Lugar: {0}",
    "en": "Location: {0}"
  },
  "text284": {
    "es": "Importar XLSX / CSV",
    "en": "Import XLSX / CSV"
  },
  "text285": {
    "es": "Plantilla con la matriz de rutas.",
    "en": "Template with the lane matrix."
  },
  "text286": {
    "es": "Capturar manual",
    "en": "Enter manually"
  },
  "text287": {
    "es": "Ruta por ruta, o pega varias filas.",
    "en": "Lane by lane, or paste multiple rows."
  },
  "text288": {
    "es": "Copiar de evento anterior",
    "en": "Copy from previous event"
  },
  "text289": {
    "es": "Duplica rutas de un RFx previo.",
    "en": "Duplicate lanes from a previous RFx."
  },
  "text290": {
    "es": "Desde Ratebook",
    "en": "From Ratebook"
  },
  "text291": {
    "es": "Rutas vigentes del shipper.",
    "en": "Current shipper lanes."
  },
  "text292": {
    "es": "No encontramos rutas ahí.",
    "en": "No lanes found there."
  },
  "text293": {
    "es": "Agregamos {0} ruta(s){1}.",
    "en": "Added {0} lane(s){1}."
  },
  "text294": {
    "es": "de la hoja «{0}»",
    "en": "from sheet “{0}”"
  },
  "text295": {
    "es": "Captura manual",
    "en": "Manual entry"
  },
  "text296": {
    "es": "De dónde vienen las rutas",
    "en": "Lane source"
  },
  "text297": {
    "es": " filas",
    "en": " rows"
  },
  "text298": {
    "es": " listas",
    "en": " ready"
  },
  "text299": {
    "es": " por mapear",
    "en": " to map"
  },
  "text300": {
    "es": "Descargar reporte ↓",
    "en": "Download report ↓"
  },
  "text301": {
    "es": "Reemplazar archivo",
    "en": "Replace file"
  },
  "text302": {
    "es": "Sube el Excel del shipper (el template RFI de Marksman tal cual), nuestra plantilla o cualquier tabla con Origen, Destino, Equipo y Volumen semanal.",
    "en": "Upload the MARKSMAN RFI template as provided (reads the lane sheet until “Business rules”), our template, or a table with Origin, Destination, Equipment and Weekly volume columns…"
  },
  "text303": {
    "es": "Leyendo…",
    "en": "Reading…"
  },
  "text304": {
    "es": "↑ Subir archivo",
    "en": "↑ Upload file"
  },
  "text305": {
    "es": "↓ Plantilla",
    "en": "↓ Template"
  },
  "text306": {
    "es": "Caja seca 53",
    "en": "53' dry van"
  },
  "text307": {
    "es": "+ Agregar ruta",
    "en": "+ Add lane"
  },
  "text308": {
    "es": "El equipo y los lugares se mapean abajo contra el catálogo, igual que un archivo.",
    "en": "Equipment and locations are mapped against the catalog below, just like an imported file."
  },
  "text309": {
    "es": "¿Varias? Pégalas desde una hoja",
    "en": "Multiple lanes? Paste from a spreadsheet"
  },
  "text310": {
    "es": "Una ruta por renglón: origen · destino · equipo · volumen semanal · tarifa objetivo · notas",
    "en": "One lane per row: origin · destination · equipment · weekly volume · target rate · notes"
  },
  "text311": {
    "es": "Monterrey, NL\tAlbany, GA\tCaja 53 grado alimenticio\t20\t\nTultitlán, MEX\tHouston, TX\tCaja 53 grado alimenticio\t10\t",
    "en": "Monterrey, NL Albany, GA Food-grade 53' dry van 20 Tultitlán, MEX Houston, TX Food-grade 53' dry van 10\t"
  },
  "text312": {
    "es": "Agregar rutas pegadas",
    "en": "Add pasted lanes"
  },
  "text313": {
    "es": "Buscar",
    "en": "Search"
  },
  "text314": {
    "es": "Clave, nombre o shipper",
    "en": "Reference, name or shipper"
  },
  "text315": {
    "es": "Elige un evento…",
    "en": "Choose an event…"
  },
  "text316": {
    "es": "Cargando eventos…",
    "en": "Loading events…"
  },
  "text317": {
    "es": "Agregar sus rutas",
    "en": "Add its lanes"
  },
  "text318": {
    "es": "Se copian rutas, equipo, volumen y rubros; las tarifas objetivo de ese evento no.",
    "en": "Copies lanes, equipment, volume and categories; excludes that event's target rates."
  },
  "text319": {
    "es": "Ratebooks de {0}",
    "en": "Ratebooks for {0}"
  },
  "text320": {
    "es": "Ratebooks (sin shipper, se ven todos)",
    "en": "Ratebooks (all shown when no shipper is selected)"
  },
  "text321": {
    "es": "Elige un Ratebook…",
    "en": "Choose a Ratebook…"
  },
  "text322": {
    "es": "Sin Ratebooks",
    "en": "No Ratebooks"
  },
  "text323": {
    "es": "Cargando…",
    "en": "Loading…"
  },
  "text324": {
    "es": "{0} rutas",
    "en": "{0} lanes"
  },
  "text325": {
    "es": "Buscar otro lugar en el catálogo…",
    "en": "Find another location in the catalog…"
  },
  "text326": {
    "es": " · se guarda como sinónimo",
    "en": " · saved as a synonym"
  },
  "text327": {
    "es": "Cambiar",
    "en": "Change"
  },
  "text328": {
    "es": " · {0} rutas",
    "en": " · {0} lanes"
  },
  "text329": {
    "es": "Recibido",
    "en": "Received"
  },
  "text330": {
    "es": "Mapear a ",
    "en": "Map to "
  },
  "text331": {
    "es": "sugerido",
    "en": "suggested"
  },
  "text332": {
    "es": "Elige…",
    "en": "Choose…"
  },
  "text333": {
    "es": "Tal como viene",
    "en": "As provided"
  },
  "text334": {
    "es": "Guardar alias en catálogo",
    "en": "Save alias in catalog"
  },
  "text335": {
    "es": "Mapear",
    "en": "Map"
  },
  "text336": {
    "es": "Omite {0} ruta(s) con este valor",
    "en": "Skip {0} lane(s) with this value"
  },
  "text337": {
    "es": "omitir",
    "en": "skip"
  },
  "text338": {
    "es": "Lugar",
    "en": "Location"
  },
  "text339": {
    "es": " · conserva ",
    "en": " · keeps "
  },
  "text340": {
    "es": " como ciudad",
    "en": " as city"
  },
  "text341": {
    "es": "Lugar · market",
    "en": "Location · market"
  },
  "text342": {
    "es": "Sin sugerencias: búscalo abajo o créalo tal cual.",
    "en": "No suggestions: search below or create it as provided."
  },
  "text343": {
    "es": "Guardar alias de ubicación",
    "en": "Save location alias"
  },
  "text344": {
    "es": "tal cual",
    "en": "as provided"
  },
  "text345": {
    "es": "Omite {0} ruta(s) con este lugar",
    "en": "Skip {0} lane(s) with this location"
  },
  "text346": {
    "es": "LISTA",
    "en": "READY"
  },
  "text347": {
    "es": "POR MAPEAR",
    "en": "TO MAP"
  },
  "text348": {
    "es": "OMITIDA",
    "en": "SKIPPED"
  },
  "text349": {
    "es": "REPETIDA",
    "en": "REPEATED"
  },
  "text350": {
    "es": "SIN RUTA",
    "en": "NO ROUTE"
  },
  "text351": {
    "es": " · buscando…",
    "en": " · searching…"
  },
  "text352": {
    "es": " (tal cual)",
    "en": " (as provided)"
  },
  "text353": {
    "es": "No pudimos leer el catálogo: {0}",
    "en": "Could not load the catalog: {0}"
  },
  "text354": {
    "es": "{0} {1} por mapear",
    "en": "{0} {1} to map"
  },
  "text355": {
    "es": "valor",
    "en": "value"
  },
  "text356": {
    "es": "valores",
    "en": "values"
  },
  "text357": {
    "es": "Todo mapeado",
    "en": "Everything mapped"
  },
  "text358": {
    "es": "Mapear todo con sugerencias",
    "en": "Map all suggestions"
  },
  "text359": {
    "es": "Omitir estas rutas",
    "en": "Skip these lanes"
  },
  "text360": {
    "es": "Elige a qué valor del catálogo corresponde cada uno, u omite la ruta. Nada se descarta solo.",
    "en": "No lane is discarded automatically. Map the received value to your catalog, save it as an alias for future imports, or explicitly skip the lane."
  },
  "text361": {
    "es": "Vista previa de la matriz de rutas",
    "en": "Lane matrix preview"
  },
  "text362": {
    "es": "validada contra el catálogo",
    "en": "validates against the rateware catalog"
  },
  "text363": {
    "es": "Las {0} rutas se conservan",
    "en": "All {0} lanes are kept"
  },
  "text364": {
    "es": "{0} de {1} rutas se conservan",
    "en": "{0} of {1} lanes are kept"
  },
  "text365": {
    "es": " · revisando lugares…",
    "en": " · checking locations…"
  },
  "text366": {
    "es": "igual a ",
    "en": "identical to "
  },
  "text367": {
    "es": "Mapear ▾",
    "en": "Map ▾"
  },
  "text368": {
    "es": "incluir",
    "en": "include"
  },
  "text369": {
    "es": "Aún no hay rutas en esta carga",
    "en": "No lanes in this import yet"
  },
  "text370": {
    "es": "Súbelas de un Excel, captúralas, o cópialas de un evento o un Ratebook.",
    "en": "Upload an Excel file, enter lanes, or copy them from an event or Ratebook."
  },
  "text371": {
    "es": "Una necesidad puntual: pocas rutas, se cotiza y se cierra.",
    "en": "A one-time need: a few lanes, quoted and closed."
  },
  "text372": {
    "es": "Varias rutas o recurrencia corta, con fecha de cierre.",
    "en": "Multiple lanes or short recurrence, with a closing date."
  },
  "text373": {
    "es": "RFx · Programa",
    "en": "RFx · Program"
  },
  "text374": {
    "es": "Un programa: muchas rutas y un arranque de operación.",
    "en": "A program: multiple lanes and an operational start date."
  },
  "text375": {
    "es": "Rango anónimo",
    "en": "Anonymous ranking"
  },
  "text376": {
    "es": "Cada carrier ve su distancia a la mejor oferta y su score, nunca quién cotizó ni a cuánto. Es el valor por omisión.",
    "en": "Each carrier sees its distance from the best bid and its score, never who quoted or their rates. This is the default."
  },
  "text377": {
    "es": "Privado",
    "en": "Private"
  },
  "text378": {
    "es": "El carrier solo ve su propia oferta. Sin señal de dónde está parado.",
    "en": "The carrier sees only its own bid, with no ranking feedback."
  },
  "text379": {
    "es": "Tablero abierto",
    "en": "Open board"
  },
  "text380": {
    "es": "Los carriers ven las posiciones entre sí. Presiona el precio, y expone tu base de transportistas.",
    "en": "Carriers see each other's positions. This puts pressure on price and exposes your carrier base."
  },
  "text381": {
    "es": "Modelo logístico",
    "en": "Logistics model"
  },
  "text382": {
    "es": "— patios, retornos de vacío, ventanas",
    "en": "— yards, empty returns, windows"
  },
  "text383": {
    "es": "Criterios de operación",
    "en": "Operating criteria"
  },
  "text384": {
    "es": "— visibilidad, reportes, escalación",
    "en": "— visibility, reporting, escalation"
  },
  "text385": {
    "es": "Reglas de negocio",
    "en": "Business rules"
  },
  "text386": {
    "es": "— penalizaciones, detención, facturación",
    "en": "— penalties, detention, invoicing"
  },
  "text387": {
    "es": "Especificaciones de servicio",
    "en": "Service specifications"
  },
  "text388": {
    "es": "— temperatura, sellos, citas",
    "en": "— temperature, seals, appointments"
  },
  "text389": {
    "es": "Perfil de transportista",
    "en": "Carrier profile"
  },
  "text390": {
    "es": "— pólizas, certificaciones, antigüedad de flota",
    "en": "— policies, certifications, fleet age"
  },
  "text391": {
    "es": "Otras notas",
    "en": "Other notes"
  },
  "text392": {
    "es": "— lo que no encaje arriba",
    "en": "— anything else"
  },
  "text393": {
    "es": "el shipper",
    "en": "the shipper"
  },
  "text394": {
    "es": "el nombre",
    "en": "the name"
  },
  "text395": {
    "es": "la fecha de cierre",
    "en": "the deadline"
  },
  "text396": {
    "es": "Nuevo bid event",
    "en": "New bid event"
  },
  "text397": {
    "es": "MANUAL · PERFIL",
    "en": "MANUAL · PROFILE"
  },
  "text398": {
    "es": "Lo creas tú desde procurement, sin RFI previo.",
    "en": "Create it from procurement without a prior RFI."
  },
  "text399": {
    "es": "Cerrar",
    "en": "Close"
  },
  "text400": {
    "es": "¿El shipper debe llenar la info?",
    "en": "Should the shipper complete the information?"
  },
  "text401": {
    "es": "Usa ",
    "en": "Use "
  },
  "text402": {
    "es": " y envíale un magic link. Aquí capturas tú la cédula.",
    "en": " and send a magic link. Here you enter the project details yourself."
  },
  "text403": {
    "es": "Shipper (Shipper CRM)",
    "en": "Shipper (Shipper CRM)"
  },
  "text404": {
    "es": "¿No está? Crear cuenta en Shipper CRM ↗",
    "en": "Missing? Create an account in Shipper CRM ↗"
  },
  "text405": {
    "es": "Tipo de evento",
    "en": "Event type"
  },
  "text406": {
    "es": "RFx / Programa",
    "en": "RFx / Program"
  },
  "text407": {
    "es": "Nombre del evento",
    "en": "Event name"
  },
  "text408": {
    "es": "Programa Occidente 2027",
    "en": "Western Region Program 2027"
  },
  "text409": {
    "es": "se genera sola",
    "en": "automatically generated"
  },
  "text410": {
    "es": "Fecha de cierre",
    "en": "Deadline"
  },
  "text411": {
    "es": "Segmento operativo ",
    "en": "Operating segment "
  },
  "text412": {
    "es": "Visibilidad de bids ",
    "en": "Bid visibility "
  },
  "text413": {
    "es": "Falta {0}.",
    "en": "Missing {0}."
  },
  "text414": {
    "es": "Se creará como borrador; después cargas cédula y rutas.",
    "en": "Created as a draft; enter project details and lanes next."
  },
  "text415": {
    "es": "Creando…",
    "en": "Creating…"
  },
  "text416": {
    "es": "Crear borrador y continuar →",
    "en": "Create draft and continue →"
  },
  "text417": {
    "es": "Cédula incompleta",
    "en": "Incomplete project details"
  },
  "text418": {
    "es": "Cédula completa",
    "en": "Complete project details"
  },
  "text419": {
    "es": "Falta {0}: más detalle atrae mejores carriers",
    "en": "Missing {0}: more detail attracts better carriers"
  },
  "text420": {
    "es": "Modelo logístico, criterios de operación y reglas de negocio definidos",
    "en": "Logistics model, operating criteria and business rules defined"
  },
  "text421": {
    "es": "{0} de {1} rutas mapeadas",
    "en": "{0} of {1} lanes mapped"
  },
  "text422": {
    "es": "Sin rutas",
    "en": "No lanes"
  },
  "text423": {
    "es": "{0} alias guardado(s) en el catálogo durante la carga",
    "en": "{0} alias(es) saved in the catalog during import"
  },
  "text424": {
    "es": "Todas validadas contra el catálogo al cargarlas",
    "en": "All validated against the catalog during import"
  },
  "text425": {
    "es": "Carga al menos una ruta en el paso 3",
    "en": "Load at least one lane in step 3"
  },
  "text426": {
    "es": "Lista de carriers elegida",
    "en": "Audience selected"
  },
  "text427": {
    "es": "Lista de carriers por elegir",
    "en": "Audience not selected"
  },
  "text428": {
    "es": "{0} carrier(s) elegible(s) nuevos de la lista{1}",
    "en": "{0} new eligible carrier(s) from the template{1}"
  },
  "text429": {
    "es": " · {0} ya en el RFx",
    "en": " · {0} already in the RFx"
  },
  "text430": {
    "es": "Elige la lista de carriers a invitar",
    "en": "Choose the starting carrier template"
  },
  "text431": {
    "es": "Plantilla de invitación",
    "en": "Invitation template"
  },
  "text432": {
    "es": "Falta elegir la plantilla (ES o EN)",
    "en": "Choose a template (ES or EN)"
  },
  "text433": {
    "es": "Se agregarán {0} carrier(s) de la lista «{1}» a las {2} ruta(s)",
    "en": "Add {0} carrier(s) from template “{1}” to {2} lane(s)"
  },
  "text434": {
    "es": " y se prepararán sus invitaciones con «{0}» por {1}.\n\n",
    "en": " and prepare their invitations using “{0}” via {1}.\n\n"
  },
  "text435": {
    "es": " y ",
    "en": " and "
  },
  "text436": {
    "es": "Nada se envía: los borradores pasan a la Cola de envío, donde una persona los revisa y aprueba.\n\n",
    "en": "Nothing is sent: drafts go to the Delivery queue for human review and approval.\n\n"
  },
  "text437": {
    "es": "El Bid Room queda abierto: el evento aparece en el tablero público y entre las rutas abiertas que ven otros carriers.\n\n¿Continuar?",
    "en": "The Bid Room opens: the event appears on the public board and among open lanes visible to other carriers. Continue?"
  },
  "text438": {
    "es": "Lanzar evento",
    "en": "Launch to Bid Room"
  },
  "text439": {
    "es": "Agregando carriers a las rutas…",
    "en": "Adding carriers to lanes…"
  },
  "text440": {
    "es": "Preparando la campaña…",
    "en": "Preparing campaign…"
  },
  "text441": {
    "es": "No se pudo crear la campaña.",
    "en": "Could not create the campaign."
  },
  "text442": {
    "es": "Generando borradores por {0}…",
    "en": "Generating drafts via {0}…"
  },
  "text443": {
    "es": "Abriendo el Bid Room…",
    "en": "Opening Bid Room…"
  },
  "text444": {
    "es": "{0} · Reintentar es seguro: no duplica carriers ni borradores.",
    "en": "{0} · Safe to retry: carriers and drafts are not duplicated."
  },
  "text445": {
    "es": "Resumen del evento",
    "en": "Event summary"
  },
  "text446": {
    "es": "Editar cédula",
    "en": "Edit project details"
  },
  "text447": {
    "es": "Tipo",
    "en": "Type"
  },
  "text448": {
    "es": "Cierre",
    "en": "Deadline"
  },
  "text449": {
    "es": "Arranque",
    "en": "Start"
  },
  "text450": {
    "es": "Visibilidad",
    "en": "Visibility"
  },
  "text451": {
    "es": "Editar rutas",
    "en": "Edit lanes"
  },
  "text452": {
    "es": "Volumen",
    "en": "Volume"
  },
  "text453": {
    "es": "{0} /sem",
    "en": "{0} /wk"
  },
  "text454": {
    "es": "Equipos",
    "en": "Equipment"
  },
  "text455": {
    "es": "Mercados",
    "en": "Markets"
  },
  "text456": {
    "es": "Checklist previo al lanzamiento",
    "en": "Pre-launch checklist"
  },
  "text457": {
    "es": "LISTO",
    "en": "READY"
  },
  "text458": {
    "es": "REVISAR",
    "en": "REVIEW"
  },
  "text459": {
    "es": "Carriers",
    "en": "Audience"
  },
  "text460": {
    "es": "Ajustar en Carrier Fit",
    "en": "Adjust in Carrier Fit"
  },
  "text461": {
    "es": "Cargando listas…",
    "en": "Loading templates…"
  },
  "text462": {
    "es": "Elige una lista de carriers…",
    "en": "Choose a carrier template…"
  },
  "text463": {
    "es": "Carriers en la lista",
    "en": "Template members"
  },
  "text464": {
    "es": "Elegibles",
    "en": "Eligible"
  },
  "text465": {
    "es": "Ya en el RFx",
    "en": "Already in the RFx"
  },
  "text466": {
    "es": "Sin contacto / no disponibles",
    "en": "No contact / unavailable"
  },
  "text467": {
    "es": "Agregar carriers crea su participación en el RFx. No envía nada todavía.",
    "en": "Adding carriers creates their RFx participation. Nothing is sent yet."
  },
  "text468": {
    "es": "Configuración de lanzamiento",
    "en": "Launch settings"
  },
  "text469": {
    "es": "Apertura del Bid Room",
    "en": "Bid Room opening"
  },
  "text470": {
    "es": "Al lanzar, el evento queda abierto y aparece en el tablero público; no hay apertura programada.",
    "en": "Launching opens the event and lists it on the public board; opening is immediate, not scheduled."
  },
  "text471": {
    "es": "Inmediata al lanzar",
    "en": "Immediate on launch"
  },
  "text472": {
    "es": "Cargando plantillas…",
    "en": "Loading templates…"
  },
  "text473": {
    "es": "Elige una plantilla…",
    "en": "Choose a template…"
  },
  "text474": {
    "es": " · del sistema",
    "en": " · system"
  },
  "text475": {
    "es": "Canal",
    "en": "Channel"
  },
  "text476": {
    "es": "Lanzar",
    "en": "Ready to launch"
  },
  "text477": {
    "es": "Lanzar agrega ",
    "en": "Launching adds "
  },
  "text478": {
    "es": "los {0} carriers elegibles",
    "en": "the {0} eligible carriers"
  },
  "text479": {
    "es": "los carriers de la lista",
    "en": "the template's carriers"
  },
  "text480": {
    "es": " a las ",
    "en": " to the "
  },
  "text481": {
    "es": " ruta(s) y prepara los borradores de invitación.",
    "en": " lane(s) and prepares invitation drafts."
  },
  "text482": {
    "es": "SIN ENVÍOS",
    "en": "GATE"
  },
  "text483": {
    "es": "Nada se envía hasta que apruebes en la Cola de envío.",
    "en": "Nothing is sent until you approve in the Delivery queue."
  },
  "text484": {
    "es": "Faltan rutas, la lista de carriers o la plantilla de invitación.",
    "en": "Missing lanes, carrier template or invitation template."
  },
  "text485": {
    "es": "Lanzando…",
    "en": "Launching…"
  },
  "text486": {
    "es": "Lanzar evento →",
    "en": "Launch to Bid Room →"
  },
  "text487": {
    "es": "Guardar y lanzar después",
    "en": "Save and launch later"
  },
  "text488": {
    "es": "el nombre del evento",
    "en": "the event name"
  },
  "text489": {
    "es": "el cierre de cotización",
    "en": "the quote deadline"
  },
  "text490": {
    "es": "Copiando la cédula a la ruta {0} de {1}…",
    "en": "Copying project details to lane {0} of {1}…"
  },
  "text491": {
    "es": "Borrador guardado. Lo encuentras en Eventos.",
    "en": "Draft saved. Find it in RFx / Bid Room as DRAFT."
  },
  "text492": {
    "es": "Todavía estamos revisando lugares en el catálogo.",
    "en": "Still checking catalog locations."
  },
  "text493": {
    "es": "Quedan {0} ruta(s) por mapear: mapéalas u omítelas.",
    "en": "{0} lane(s) still need mapping: map or skip them."
  },
  "text494": {
    "es": "El backend acepta {0} rutas por carga y vas en {1}. Divide la carga.",
    "en": "The backend accepts {0} lanes per import; you have {1}. Split the import."
  },
  "text495": {
    "es": "Se guardarán {0} sinónimo(s) en el catálogo compartido, para que el próximo archivo los reconozca solo.\n\n¿Continuar?",
    "en": "Save {0} synonym(s) in the shared catalog so future files recognize them automatically. Continue?"
  },
  "text496": {
    "es": "{0} ya estaban en el evento y se omitieron",
    "en": "{0} already existed in the event and were skipped"
  },
  "text497": {
    "es": "{0} el servidor no aceptó",
    "en": "{0} rejected by the server"
  },
  "text498": {
    "es": "no se pudieron guardar {0} sinónimo(s): {1}",
    "en": "could not save {0} synonym(s): {1}"
  },
  "text499": {
    "es": "{0} ruta(s) guardadas en el borrador{1}.",
    "en": "{0} lane(s) saved in the draft{1}."
  },
  "text500": {
    "es": "Las rutas no se guardaron: {0}. Reintentar es seguro: las repetidas se omiten.",
    "en": "Lanes were not saved: {0}. Safe to retry: repeated lanes are skipped."
  },
  "text501": {
    "es": "Carga al menos una ruta antes de revisar y lanzar.",
    "en": "Load at least one lane before reviewing and launching."
  },
  "text502": {
    "es": "Abriendo el borrador…",
    "en": "Opening draft…"
  },
  "text503": {
    "es": "Este evento ya no es un borrador:",
    "en": "This event is no longer a draft:"
  },
  "text504": {
    "es": "se administra desde su página. ",
    "en": "manage it from its page. "
  },
  "text505": {
    "es": "Abrir el evento →",
    "en": "Open event →"
  },
  "text506": {
    "es": "Shipper & tipo",
    "en": "Shipper & type"
  },
  "text507": {
    "es": "Cédula",
    "en": "Project details"
  },
  "text508": {
    "es": "Revisar & lanzar",
    "en": "Review & launch"
  },
  "text509": {
    "es": "RFX / BID ROOM · NUEVO EVENTO",
    "en": "RFX / BID ROOM · NEW EVENT"
  },
  "text510": {
    "es": " · BORRADOR {0}",
    "en": " · DRAFT {0}"
  },
  "text511": {
    "es": "Borrador sin nombre",
    "en": "Unnamed draft"
  },
  "text512": {
    "es": "Crear un bid event desde cero",
    "en": "Create a bid event from scratch"
  },
  "text513": {
    "es": "El borrador ya existe: cambia lo que haga falta y sigue con las rutas. Nada se envía hasta lanzar.",
    "en": "The draft exists: make changes and continue with lanes. Nothing is sent before launch."
  },
  "text514": {
    "es": "El camino para los bids que no nacen de un magic link. Se guarda como borrador al pasar a las rutas.",
    "en": "For bids created without a magic link. Saved as a draft when you proceed to lanes."
  },
  "text515": {
    "es": "Pasos",
    "en": "Steps"
  },
  "text516": {
    "es": "Quién y qué",
    "en": "Who and what"
  },
  "text517": {
    "es": "EN CURSO",
    "en": "IN PROGRESS"
  },
  "text518": {
    "es": "Cédula del proyecto",
    "en": "Project details"
  },
  "text519": {
    "es": "SIGUIENTE",
    "en": "NEXT"
  },
  "text520": {
    "es": "{0} CARGADAS",
    "en": "{0} LOADED"
  },
  "text521": {
    "es": "PENDIENTE",
    "en": "PENDING"
  },
  "text522": {
    "es": "Paso 1 · Quién y qué",
    "en": "Step 1 · Who and what"
  },
  "text523": {
    "es": "Búscalo por nombre; si no existe, créalo aquí.",
    "en": "From Shipper CRM. Create it here if missing."
  },
  "text524": {
    "es": "Nombre del evento *",
    "en": "Event name *"
  },
  "text525": {
    "es": "Tipo de evento *",
    "en": "Event type *"
  },
  "text526": {
    "es": "Programa",
    "en": "Program"
  },
  "text527": {
    "es": "Define cuántas rutas se esperan y si el evento se repite. Se puede cambiar hasta lanzar.",
    "en": "Defines expected lanes and whether the event repeats. Can be changed until launch."
  },
  "text528": {
    "es": "Cierre de cotización *",
    "en": "Quote deadline *"
  },
  "text529": {
    "es": "Inicio de operación",
    "en": "Operations start"
  },
  "text530": {
    "es": "Moneda del evento",
    "en": "Event currency"
  },
  "text531": {
    "es": "El carrier ve el inicio de operación junto al cierre. Puede cotizar en otra moneda; se convierte para comparar.",
    "en": "The carrier sees the operations start alongside the deadline. Bids in another currency are converted for comparison."
  },
  "text532": {
    "es": "La moneda y el segmento aplican a las rutas que cargues ahora; las ",
    "en": "Currency and segment apply to lanes loaded now; the "
  },
  "text533": {
    "es": " ya cargadas conservan los suyos.",
    "en": " already loaded lanes retain their values."
  },
  "text534": {
    "es": "Paso 2 · Cédula del proyecto",
    "en": "Step 2 · Project details"
  },
  "text535": {
    "es": "Lo que escribas aquí se hereda a cada segmento y es lo que el carrier confirma rubro por rubro en su Bid Room.",
    "en": "These details apply to every segment and are what the carrier confirms category by category in its Bid Room."
  },
  "text536": {
    "es": "El balance que importa",
    "en": "The balance that matters"
  },
  "text537": {
    "es": "Más detalle atrae mejores carriers",
    "en": "More detail attracts better carriers"
  },
  "text538": {
    "es": "Modelo Logístico, Criterios de Operación y Reglas de Negocio. Entre más claros, más atención captas de los transportistas correctos.",
    "en": "Logistics Model, Operating Criteria and Business Rules. Clearer details attract more attention from suitable carriers."
  },
  "text539": {
    "es": "Más requisitos encarecen y reducen",
    "en": "More requirements raise costs and narrow options"
  },
  "text540": {
    "es": "Especificaciones de Servicio y Perfil de Transportista. Cada requisito extra achica el universo de carriers y sube el precio.",
    "en": "Service Specifications and Carrier Profile. Every additional requirement narrows the carrier pool and increases price."
  },
  "text541": {
    "es": "Por eso los seis rubros no se piden igual: los tres primeros invitan a escribir, los dos siguientes avisan del costo.",
    "en": "The six categories are treated differently: the first three encourage detail; the next two highlight cost implications."
  },
  "text542": {
    "es": "Al guardar, la cédula se copia a las ",
    "en": "Saving copies project details to the "
  },
  "text543": {
    "es": " rutas ya cargadas.",
    "en": " already loaded lanes."
  },
  "text544": {
    "es": "Guardar borrador",
    "en": "Save draft"
  },
  "text545": {
    "es": "Paso 3 · Rutas →",
    "en": "Step 3 · Lanes →"
  },
  "text546": {
    "es": "RFx / Bid Room › Nuevo bid event",
    "en": "RFx / Bid Room › New bid event"
  },
  "text547": {
    "es": "Borrador",
    "en": "Draft"
  },
  "text548": {
    "es": "BORRADOR",
    "en": "DRAFT"
  },
  "text549": {
    "es": "Guardando rutas…",
    "en": "Saving lanes…"
  },
  "text550": {
    "es": "Continuar a Revisar →",
    "en": "Continue to Review →"
  },
  "text551": {
    "es": "Este borrador ya tiene {0} ruta(s).",
    "en": "This draft already has {0} lane(s)."
  },
  "text552": {
    "es": "Lo que cargues aquí se agrega; las repetidas se omiten solas.",
    "en": "New lanes are added; repeated lanes are skipped automatically."
  },
  "text553": {
    "es": "{0} de {1} rutas conservadas",
    "en": "{0} of {1} lanes kept"
  },
  "text554": {
    "es": " · {0} requieren mapeo antes de lanzar (ninguna se pierde).",
    "en": " · {0} need mapping before launch (none are lost)."
  },
  "text555": {
    "es": "{0} ruta(s) en el borrador. Carga más o sigue a revisar.",
    "en": "{0} lane(s) in the draft. Load more or continue to review."
  },
  "text556": {
    "es": "Carga las rutas del evento: de un archivo, a mano, de otro evento o de un Ratebook.",
    "en": "Load event lanes: from a file, manually, from another event or a Ratebook."
  },
  "text557": {
    "es": "← Atrás",
    "en": "← Back"
  },
  "text558": {
    "es": "Continuar a Revisar & lanzar →",
    "en": "Continue to Review & launch →"
  },
  "text559": {
    "es": "Al lanzar, el evento pasa de BORRADOR a LAUNCH: ya tiene carriers y sus invitaciones esperan en la cola.",
    "en": "Launching moves the event from DRAFT to LAUNCH: carriers are added and their invitations wait in the queue."
  },
  "text560": {
    "es": "← Atrás a Rutas",
    "en": "← Back to Lanes"
  },
  "text561": {
    "es": "El carrier dijo que no tiene unidad disponible.",
    "en": "The carrier reported no available equipment."
  },
  "text562": {
    "es": "Su vigencia venció el {0}.",
    "en": "Validity expired on {0}."
  },
  "text563": {
    "es": "Su vigencia vence el {0}.",
    "en": "Valid through {0}."
  },
  "text564": {
    "es": "Este lane no tiene carriers",
    "en": "This lane has no carriers"
  },
  "text565": {
    "es": "sin estado",
    "en": "no status"
  },
  "text566": {
    "es": "Oferta de {0} guardada.",
    "en": "Bid from {0} saved."
  },
  "text567": {
    "es": "Editar oferta",
    "en": "Edit bid"
  },
  "text568": {
    "es": "Capturar oferta",
    "en": "Enter bid"
  },
  "text569": {
    "es": "Guardar oferta",
    "en": "Save bid"
  },
  "text570": {
    "es": "Válida hasta",
    "en": "Valid through"
  },
  "text571": {
    "es": "¿Por dónde llegó?",
    "en": "Received via?"
  },
  "text572": {
    "es": "Teléfono",
    "en": "Phone"
  },
  "text573": {
    "es": "Otro",
    "en": "Other"
  },
  "text574": {
    "es": "Nota de la fuente (quién, cuándo)",
    "en": "Source note (who, when)"
  },
  "text575": {
    "es": "Correo de Juan Pérez del 28 sep",
    "en": "Email from John Smith on Sep 28"
  },
  "text576": {
    "es": "Notas de la oferta",
    "en": "Bid notes"
  },
  "text577": {
    "es": "Capacidad y días de tránsito deben ser números.",
    "en": "Capacity and transit days must be numbers."
  },
  "text578": {
    "es": "Se preparará un borrador para {0} con tu pregunta y la liga a su Bid Room. Nada se envía hasta aprobarlo en la Cola de envío.\n\n¿Preparar?",
    "en": "A draft with your question and Bid Room link will be prepared for {0}. Nothing is sent until you approve it in Delivery queue. Prepare?"
  },
  "text579": {
    "es": "Pregunta preparada para {0}. Revísala y aprueba su envío en la Cola de envío.",
    "en": "Question prepared for {0}. Review and approve its delivery in Delivery queue."
  },
  "text580": {
    "es": "Preguntar al carrier",
    "en": "Ask the carrier"
  },
  "text581": {
    "es": "Preparar pregunta",
    "en": "Prepare question"
  },
  "text582": {
    "es": "Pregunta",
    "en": "Question"
  },
  "text583": {
    "es": "¿Tu tarifa incluye el cruce? ¿Cuántas unidades por semana puedes cubrir?",
    "en": "Does your rate include the border crossing? How many units per week can you cover?"
  },
  "text584": {
    "es": "Se guarda como borrador en la Cola de envío. Al aprobarlo saldrá desde Gmail del equipo; las respuestas llegan a ese hilo.",
    "en": "Saved as a draft in Delivery queue. After approval it goes through the team's Gmail; replies arrive in that thread."
  },
  "questionPreparing": { "es": "Preparando…", "en": "Preparing…" },
  "questionAlreadySent": { "es": "Esta pregunta ya se envió. Su historial se conserva en la Cola de envío.", "en": "This question was already sent. Its history remains in Delivery queue." },
  "questionReviewExisting": { "es": "Esta pregunta ya existe en la Cola de envío. Revisa su estado antes de reintentar.", "en": "This question already exists in Delivery queue. Review its status before retrying." },
  "questionBackendUnavailable": { "es": "Este entorno todavía no permite preparar preguntas en la Cola de envío. La pregunta no se envió; inténtalo cuando se actualice el servicio.", "en": "This environment does not support question drafts in Delivery queue yet. Your question was not sent; retry after the service is updated." },
  "text585": {
    "es": "Origen *",
    "en": "Origin *"
  },
  "text586": {
    "es": "Destino *",
    "en": "Destination *"
  },
  "text587": {
    "es": "Ciudad origen",
    "en": "Origin city"
  },
  "text588": {
    "es": "Estado origen",
    "en": "Origin state"
  },
  "text589": {
    "es": "País origen",
    "en": "Origin country"
  },
  "text590": {
    "es": "Ciudad destino",
    "en": "Destination city"
  },
  "text591": {
    "es": "Estado destino",
    "en": "Destination state"
  },
  "text592": {
    "es": "País destino",
    "en": "Destination country"
  },
  "text593": {
    "es": "Configuración",
    "en": "Configuration"
  },
  "text594": {
    "es": "Cargas / semana",
    "en": "Loads / week"
  },
  "text595": {
    "es": "Cargas / año",
    "en": "Loads / year"
  },
  "text596": {
    "es": "Carrier actual",
    "en": "Current carrier"
  },
  "text597": {
    "es": "Requisitos al carrier",
    "en": "Carrier requirements"
  },
  "text598": {
    "es": "Lane {0} actualizado.",
    "en": "Lane {0} updated."
  },
  "text599": {
    "es": "Editar lane",
    "en": "Edit lane"
  },
  "text600": {
    "es": "Guardar {0} cambio(s)",
    "en": "Save {0} change(s)"
  },
  "text601": {
    "es": "Guardar",
    "en": "Save"
  },
  "text602": {
    "es": "» debe ser un número.",
    "en": "” must be a number."
  },
  "text603": {
    "es": "Al guardar se actualiza también el Ratebook del evento.",
    "en": "Saving also updates the event's Ratebook."
  },
  "text604": {
    "es": "Adjudicado como primario.",
    "en": "Awarded as primary."
  },
  "text605": {
    "es": "Adjudicado como respaldo.",
    "en": "Awarded as backup."
  },
  "text606": {
    "es": "El lane se declaró desierto.",
    "en": "The lane was closed without award."
  },
  "text607": {
    "es": "EN RIESGO",
    "en": "AT RISK"
  },
  "text608": {
    "es": "LÍDER",
    "en": "LEADER"
  },
  "text609": {
    "es": "La mejor oferta all-in del lane.",
    "en": "The lane's best all-in bid."
  },
  "text610": {
    "es": "Superado",
    "en": "Outbid"
  },
  "text611": {
    "es": "Alguien cotizó más bajo después de su última oferta.",
    "en": "Someone quoted lower after this bid."
  },
  "text612": {
    "es": "Activo",
    "en": "Active"
  },
  "text613": {
    "es": "Cotizó por encima de la mejor oferta.",
    "en": "Quoted above the best bid."
  },
  "text614": {
    "es": "ADJUDICADO",
    "en": "AWARDED"
  },
  "text615": {
    "es": "CON OFERTAS",
    "en": "WITH BIDS"
  },
  "text616": {
    "es": "▲ nuevo",
    "en": "▲ new"
  },
  "text617": {
    "es": "✎ capturada",
    "en": "✎ entered manually"
  },
  "text618": {
    "es": "hace un momento",
    "en": "just now"
  },
  "text619": {
    "es": "hace {0} min",
    "en": "{0} min ago"
  },
  "text620": {
    "es": "hace {0} h",
    "en": "{0} h ago"
  },
  "text621": {
    "es": "hace {0} días",
    "en": "{0} days ago"
  },
  "text622": {
    "es": "Invitados",
    "en": "Invited"
  },
  "text623": {
    "es": "Cobertura",
    "en": "Coverage"
  },
  "text624": {
    "es": "Líder promedio",
    "en": "Average leading bid"
  },
  "text625": {
    "es": "Bids en vivo",
    "en": "Live bids"
  },
  "text626": {
    "es": "Adjudicación",
    "en": "Award"
  },
  "text627": {
    "es": "Líder",
    "en": "Leader"
  },
  "text628": {
    "es": "Mejor all-in",
    "en": "Best all-in"
  },
  "text629": {
    "es": "Ver sus ofertas",
    "en": "View bids"
  },
  "text630": {
    "es": "Una oferta que llegó por correo, teléfono o WhatsApp",
    "en": "A bid received by email, phone or WhatsApp"
  },
  "text631": {
    "es": "Un correo a un carrier con la liga a su Bid Room",
    "en": "An email to a carrier with its Bid Room link"
  },
  "text632": {
    "es": "Preguntar a un carrier",
    "en": "Ask a carrier"
  },
  "text633": {
    "es": "Todos los lanes",
    "en": "All lanes"
  },
  "text634": {
    "es": "Muestra códigos en vez de nombres, para compartir pantalla",
    "en": "Show codes instead of names for screen sharing"
  },
  "text635": {
    "es": " Vista anónima",
    "en": " Anonymous view"
  },
  "text636": {
    "es": "No se pudo leer la actividad reciente.",
    "en": "Could not load recent activity."
  },
  "text637": {
    "es": "Δ 15 min: lo que cambió desde hace un cuarto de hora.",
    "en": "Δ 15 min: changes in the last quarter hour."
  },
  "text638": {
    "es": "Rubros",
    "en": "Categories"
  },
  "text639": {
    "es": "Última respuesta {0}",
    "en": "Last response {0}"
  },
  "text640": {
    "es": "Capturada por el equipo",
    "en": "Entered by the team"
  },
  "text641": {
    "es": "El carrier no ha confirmado los términos en su Bid Room",
    "en": "The carrier has not confirmed terms in its Bid Room"
  },
  "text642": {
    "es": "sin confirmar",
    "en": "unconfirmed"
  },
  "text643": {
    "es": "Está adjudicada: quita primero la adjudicación",
    "en": "Already awarded: remove the award first"
  },
  "text644": {
    "es": "Rechazar",
    "en": "Reject"
  },
  "text645": {
    "es": "Preguntar",
    "en": "Ask"
  },
  "text646": {
    "es": "Este lane no tiene ofertas todavía",
    "en": "This lane has no bids yet"
  },
  "text647": {
    "es": "Sin ofertas todavía",
    "en": "No bids yet"
  },
  "text648": {
    "es": "Aparecen cuando los carriers cotizan en su Bid Room privado, o cuando capturas una que llegó por otro lado.",
    "en": "Bids appear when carriers quote in their private Bid Room or you enter a bid received elsewhere."
  },
  "text649": {
    "es": "CERRADO",
    "en": "CLOSED"
  },
  "text650": {
    "es": "ARCHIVADO",
    "en": "ARCHIVED"
  },
  "text651": {
    "es": "Del shipper",
    "en": "From shipper"
  },
  "text652": {
    "es": "El shipper llena el RFI por enlace privado; tú promueves el draft a oportunidad y lanzas.",
    "en": "The shipper completes the RFI through a private link; promote the draft to an opportunity and launch."
  },
  "text653": {
    "es": "De una cotización",
    "en": "From a quote"
  },
  "text654": {
    "es": "Una oportunidad del QuoteDesk que mandas a subasta como spot o mini-bid.",
    "en": "A QuoteDesk opportunity sent to bidding as a spot or mini-bid."
  },
  "text655": {
    "es": "Desde el perfil del shipper",
    "en": "From the shipper profile"
  },
  "text656": {
    "es": "Tú lo creas: + Nuevo bid event (aquí) o desde el perfil del shipper. Sin RFI previo.",
    "en": "Create it with + New bid event here or from the shipper profile. No prior RFI."
  },
  "text657": {
    "es": "cerrado",
    "en": "closed"
  },
  "text658": {
    "es": "adjud.",
    "en": "awarded"
  },
  "text659": {
    "es": "vencido",
    "en": "expired"
  },
  "text660": {
    "es": "Borradores",
    "en": "Drafts"
  },
  "text661": {
    "es": "En launch",
    "en": "In launch"
  },
  "text662": {
    "es": "Cerrados",
    "en": "Closed"
  },
  "text663": {
    "es": "Bids totales",
    "en": "Total bids"
  },
  "text664": {
    "es": "Todos los bid events — sin importar cómo nacieron",
    "en": "All bid events — regardless of origin"
  },
  "text665": {
    "es": "+ Nuevo bid event",
    "en": "+ New bid event"
  },
  "text666": {
    "es": "Tres orígenes, una sola administración",
    "en": "Three sources, one place to manage them"
  },
  "text667": {
    "es": "Estado: Todos",
    "en": "Status: All"
  },
  "text668": {
    "es": "Origen: Todos",
    "en": "Origin: All"
  },
  "text669": {
    "es": "Manual · perfil",
    "en": "Manual · profile"
  },
  "text670": {
    "es": "Shipper: Todos",
    "en": "Shipper: All"
  },
  "text671": {
    "es": "Tipo: Todos",
    "en": "Type: All"
  },
  "text672": {
    "es": "Buscar evento, shipper, RFx…",
    "en": "Search event, shipper, RFx…"
  },
  "text673": {
    "es": "Cargando eventos RFx…",
    "en": "Loading RFx events…"
  },
  "text674": {
    "es": "Shipper (CRM)",
    "en": "Shipper (CRM)"
  },
  "text675": {
    "es": "Invit.",
    "en": "Invites"
  },
  "text676": {
    "es": "(sin nombre)",
    "en": "(unnamed)"
  },
  "text677": {
    "es": "Ningún evento con estos filtros",
    "en": "No events match these filters"
  },
  "text678": {
    "es": "No hay eventos RFx",
    "en": "No RFx events"
  },
  "text679": {
    "es": "Ajusta los filtros o la búsqueda.",
    "en": "Adjust filters or search."
  },
  "text680": {
    "es": "Se crean desde Shipper intake, QuoteDesk, o con + Nuevo bid event.",
    "en": "Create events from Shipper intake, QuoteDesk, or + New bid event."
  },
  "text681": {
    "es": "Se autorizaron {0} invitación(es); ya se pueden enviar.",
    "en": "Authorized {0} invitation(s); ready to send."
  },
  "text682": {
    "es": "No se autorizó ninguna invitación: ya no estaban en borrador.",
    "en": "No invitations authorized: they were no longer drafts."
  },
  "text683": {
    "es": "Se autorizan {0} invitación(es) en borrador de {1} lane(s). ",
    "en": "Authorize {0} draft invitation(s) for {1} lane(s). "
  },
  "text684": {
    "es": "Quedan listas para salir desde la cola de envío; no se manda ningún mensaje ahora. ¿Continuar?",
    "en": "They become ready in the Delivery queue; no message is sent now. Continue?"
  },
  "text685": {
    "es": "El evento queda abierto: aparece en el tablero público y en las rutas abiertas que ven otros carriers, ",
    "en": "The event opens: it appears on the public board and among open lanes visible to other carriers, "
  },
  "text686": {
    "es": "que pueden pedir acceso. Además, rateware agrega en borrador a cada carrier del evento en las rutas que le falten. ",
    "en": "who may request access. rateware also adds each event carrier as a draft on its missing lanes. "
  },
  "text687": {
    "es": "No se envía ningún mensaje. ¿Abrir el Bid Room?",
    "en": "No message is sent. Open the Bid Room?"
  },
  "text688": {
    "es": "Abrir Bid Room",
    "en": "Open Bid Room"
  },
  "text689": {
    "es": "Bid Room abierto: el evento ya aparece en el tablero público.",
    "en": "Bid Room opened: the event is now on the public board."
  },
  "text690": {
    "es": "este carrier",
    "en": "this carrier"
  },
  "text691": {
    "es": "¿Por qué se rechaza la oferta de {0}? Queda en el historial del evento; el carrier no lo ve.",
    "en": "Why reject the bid from {0}? Saved in event history; hidden from the carrier."
  },
  "text692": {
    "es": "Rechazada por procurement",
    "en": "Rejected by procurement"
  },
  "text693": {
    "es": "Se rechazó la oferta de {0}.",
    "en": "Bid from {0} rejected."
  },
  "text694": {
    "es": "El evento vuelve a borrador y reaparece en la lista de eventos activos. ¿Continuar?",
    "en": "The event returns to draft and reappears in the active list. Continue?"
  },
  "text695": {
    "es": "El evento sale de la lista de activos. No se cierra ni se entrega nada a rateware, ",
    "en": "The event leaves the active list. Nothing closes or is handed to rateware, "
  },
  "text696": {
    "es": "y las ofertas y borradores se conservan. Puedes restaurarlo después. ¿Archivar?",
    "en": "and bids and drafts are kept. You can restore it later. Archive?"
  },
  "text697": {
    "es": "Evento restaurado a borrador.",
    "en": "Event restored to draft."
  },
  "text698": {
    "es": "Evento archivado.",
    "en": "Event archived."
  },
  "text699": {
    "es": "Esto BORRA el evento para siempre y no se puede deshacer. Se va con él:\n",
    "en": "This permanently DELETES the event and cannot be undone. It also deletes:\n"
  },
  "text700": {
    "es": "· {0} lane(s) y {1} invitación(es)",
    "en": "· {0} lane(s) and {1} invitation(s)"
  },
  "text701": {
    "es": ", {0} con oferta",
    "en": ", {0} with bids"
  },
  "text702": {
    "es": ", {0} adjudicada(s)",
    "en": ", {0} awarded"
  },
  "text703": {
    "es": ";\n· todo el chat del evento.\n\n",
    "en": "; · the entire event chat.\n\n"
  },
  "text704": {
    "es": "Se conservan, ya sin evento: los mensajes enviados, las campañas, el historial de contacto, ",
    "en": "Kept without an event: sent messages, campaigns, contact history, "
  },
  "text705": {
    "es": "las cotizaciones y los Ratebooks. Las tarifas ya aprobadas en el tarifario no se tocan.\n\n",
    "en": "quotes and Ratebooks. Approved rates in the rate base remain unchanged.\n\n"
  },
  "text706": {
    "es": "Si solo quieres quitarlo de la lista, usa \"Archivar evento\".\n\n",
    "en": "To remove it from the list only, use “Archive event”.\n\n"
  },
  "text707": {
    "es": "Para borrarlo, escribe {0}:",
    "en": "To delete, type {0}:"
  },
  "text708": {
    "es": "No coincide con {0}; no se borró nada.",
    "en": "Does not match {0}; nothing was deleted."
  },
  "text709": {
    "es": "Este evento ya tiene embarques creados en el TMS y no se puede borrar. Archívalo.",
    "en": "This event has TMS shipments and cannot be deleted. Archive it."
  },
  "text710": {
    "es": "Evento RFx",
    "en": "RFx event"
  },
  "text711": {
    "es": "{0} invitaciones",
    "en": "{0} invitations"
  },
  "text712": {
    "es": "{0} cotizados",
    "en": "{0} quoted"
  },
  "text713": {
    "es": "{0}/{1} lanes adjudicados",
    "en": "{0}/{1} lanes awarded"
  },
  "text714": {
    "es": "{0} desierto{1}",
    "en": "{0} closed without award"
  },
  "text715": {
    "es": "cierra {0}",
    "en": "closes {0}"
  },
  "text716": {
    "es": "arranca {0}",
    "en": "starts {0}"
  },
  "text717": {
    "es": "Continuar a Launch →",
    "en": "Continue to Launch →"
  },
  "text718": {
    "es": "Tablero público ↗",
    "en": "Public board ↗"
  },
  "text719": {
    "es": "Autoriza todas las invitaciones en borrador del evento",
    "en": "Authorize all draft event invitations"
  },
  "text720": {
    "es": "No hay invitaciones en borrador",
    "en": "No draft invitations"
  },
  "text721": {
    "es": "Autorizar invitaciones",
    "en": "Authorize invitations"
  },
  "text722": {
    "es": "Restaurar a borrador",
    "en": "Restore to draft"
  },
  "text723": {
    "es": "Archivar",
    "en": "Archive"
  },
  "text724": {
    "es": "Borrar",
    "en": "Delete"
  },
  "text725": {
    "es": "Cargando evento…",
    "en": "Loading event…"
  },
  "text726": {
    "es": "{0} Los rubros de los carriers se muestran como sin confirmar hasta que se puedan leer.",
    "en": "{0} Carrier categories appear unconfirmed until they can be loaded."
  },
  "text727": {
    "es": "El Bid Room sigue cerrado:",
    "en": "The Bid Room remains closed:"
  },
  "text728": {
    "es": " el evento está en borrador, así que no aparece en el tablero público ni entre las rutas abiertas que ven los carriers. Sus invitados sí pueden cotizar.",
    "en": " the event is a draft, so it is not on the public board or open lanes visible to carriers. Invited carriers can still bid."
  },
  "text729": {
    "es": "Cola de envío",
    "en": "Delivery queue"
  },
  "text730": {
    "es": "Nada sale solo:",
    "en": "Nothing is sent automatically:"
  },
  "text731": {
    "es": "generar borradores no envía. El envío se autoriza en la cola, por una persona.",
    "en": "generating drafts does not send them. A person authorizes sending in the queue."
  },
  "text732": {
    "es": "Carriers agregados que nadie ha autorizado",
    "en": "Added carriers awaiting authorization"
  },
  "text733": {
    "es": "Sin autorizar",
    "en": "Unauthorized"
  },
  "text734": {
    "es": "Autorizadas; salen desde la Cola de envío",
    "en": "Authorized; sent from the Delivery queue"
  },
  "text735": {
    "es": "Por enviar",
    "en": "To send"
  },
  "text736": {
    "es": "El mensaje salió: Gmail o WhatsApp lo aceptaron",
    "en": "Message sent: accepted by Gmail or WhatsApp"
  },
  "text737": {
    "es": "Enviadas",
    "en": "Sent"
  },
  "text738": {
    "es": "Declinaron",
    "en": "Declined"
  },
  "text739": {
    "es": "Aún no alcanzable, pero puedes mirar",
    "en": "Not reachable yet, but you can preview"
  },
  "text740": {
    "es": "COMPLETO",
    "en": "COMPLETE"
  },
  "text741": {
    "es": "BLOQUEADO",
    "en": "LOCKED"
  },
  "text742": {
    "es": "PARA PASAR A {0}",
    "en": "TO PROCEED TO {0}"
  },
  "text743": {
    "es": "PARA CERRAR",
    "en": "TO CLOSE"
  },
  "text744": {
    "es": "Falta{0} {1} · no bloquea nada",
    "en": "Missing: {1} · does not block progress"
  },
  "text745": {
    "es": "Listo para {0}",
    "en": "Ready for {0}"
  },
  "text746": {
    "es": "PASAR A {0}",
    "en": "PROCEED TO {0}"
  },
  "text747": {
    "es": "CERRAR EL EVENTO",
    "en": "CLOSE EVENT"
  },
  "text748": {
    "es": "PARA ",
    "en": "FOR "
  },
  "text749": {
    "es": "{0} — falta{1} {2}",
    "en": "{0} — {2} missing"
  },
  "text750": {
    "es": "Avanzar a {0}",
    "en": "Proceed to {0}"
  },
  "text751": {
    "es": "Listo para cerrar",
    "en": "Ready to close"
  },
  "text752": {
    "es": "No bloquea nada: la etapa avanza sola cuando se cumple lo de arriba. Es lo que conviene resolver antes de hacer algo que no se puede deshacer.",
    "en": "This does not block progress: the stage advances when the conditions above are met. Resolve these before taking irreversible action."
  },
  "text753": {
    "es": "Todo listo en esta etapa.",
    "en": "Everything is ready in this stage."
  },
  "text754": {
    "es": "{0} lane(s) con origen y destino",
    "en": "{0} lane(s) with origin and destination"
  },
  "text755": {
    "es": "{0} carrier(s) en {1} participación(es)",
    "en": "{0} carrier(s) in {1} participation(s)"
  },
  "text756": {
    "es": "{0} de {1} invitaciones enviadas",
    "en": "{0} of {1} invitations sent"
  },
  "text757": {
    "es": "{0} sin correo ni WhatsApp",
    "en": "{0} without email or WhatsApp"
  },
  "text758": {
    "es": "Todos con contacto utilizable",
    "en": "All have usable contact details"
  },
  "text759": {
    "es": "{0} oferta(s) recibida(s)",
    "en": "{0} bid(s) received"
  },
  "text760": {
    "es": "{0} declinaron explícitamente",
    "en": "{0} explicitly declined"
  },
  "text761": {
    "es": "{0} de {1} lanes decididos ({2} desierto{3})",
    "en": "{0} of {1} lanes decided ({2} closed without award{3})"
  },
  "text762": {
    "es": "Hay ofertas que adjudicar",
    "en": "Bids available to award"
  },
  "text763": {
    "es": "{0} de {1} enviados{2}",
    "en": "{0} of {1} sent{2}"
  },
  "text764": {
    "es": " · {0} por enviar",
    "en": " · {0} to send"
  },
  "text765": {
    "es": "{0} ofertas recibidas",
    "en": "{0} bids received"
  },
  "text766": {
    "es": "requiere envíos",
    "en": "requires sent invitations"
  },
  "text767": {
    "es": "{0} de {1} lanes adjudicados{2}",
    "en": "{0} of {1} lanes awarded{2}"
  },
  "text768": {
    "es": " · {0} desierto{1}",
    "en": " · {0} closed without award"
  },
  "text769": {
    "es": "requiere ofertas",
    "en": "requires bids"
  },
  "text770": {
    "es": "no se guardaron {0} sinónimo(s) porque no están disponibles para este equipo: {1}. Las rutas conservan el valor elegido. Usa otro sinónimo para futuras importaciones",
    "en": "{0} synonym(s) were not saved because they are not available to this team: {1}. The lanes keep the selected value. Use a different synonym for future imports"
  },
  "text771": {
    "es": "plazo de pujas vencido el {0}",
    "en": "bidding deadline passed {0}"
  },
  "text772": {
    "es": "PUJAS CERRADAS POR PLAZO",
    "en": "BIDDING CLOSED BY DEADLINE"
  },
  "text773": {
    "es": "EVENTO ABIERTO PARA REVISIÓN",
    "en": "EVENT OPEN FOR REVIEW"
  },
  "text774": {
    "es": "Datos y cédula",
    "en": "Details & brief"
  },
  "text775": {
    "es": "Revisar y lanzar",
    "en": "Review & launch"
  },
  "text776": {
    "es": "Nuevo evento",
    "en": "New event"
  },
  "text777": {
    "es": "Eventos",
    "en": "Events"
  },
  "text778": {
    "es": "Borrador {0}",
    "en": "Draft {0}"
  },
  "text779": {
    "es": "Datos del evento",
    "en": "Event details"
  },
  "text780": {
    "es": "Cédula del proyecto",
    "en": "Project brief"
  },
  "text781": {
    "es": "{0} de 3",
    "en": "{0} of 3"
  },
  "text782": {
    "es": "OPCIONAL",
    "en": "OPTIONAL"
  },
  "text783": {
    "es": "Cada ruta la hereda y el carrier la confirma rubro por rubro. Los tres primeros rubros atraen mejores carriers; los requisitos extra (especificaciones y perfil) reducen opciones y suben el precio.",
    "en": "Every lane inherits it and the carrier confirms it item by item. The first three items attract better carriers; extra requirements (specs and profile) narrow the pool and raise the price."
  },
  "text784": {
    "es": "Se guarda como borrador al seguir. Nada se envía hasta lanzar.",
    "en": "It's saved as a draft when you continue. Nothing is sent until launch."
  },
  "text785": {
    "es": "Seguir a rutas →",
    "en": "Continue to lanes →"
  },
  "text786": {
    "es": "Guardar rutas",
    "en": "Save lanes"
  },
  "text787": {
    "es": "Seguir a revisar →",
    "en": "Continue to review →"
  },
  "text788": {
    "es": "Lista de carriers",
    "en": "Carrier list"
  },
  "text789": {
    "es": "sube el precio",
    "en": "raises the price"
  },
  "text790": {
    "es": "Objetivo",
    "en": "Target"
  },
  "text791": { "es": "Más", "en": "More" }
};

export const tr = translator(copy);
