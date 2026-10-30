import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  "text001": {
    "es": "Pendientes",
    "en": "Pending"
  },
  "text002": {
    "es": "Revisados",
    "en": "Reviewed"
  },
  "text003": {
    "es": "Sin contacto",
    "en": "No contact"
  },
  "text004": {
    "es": "Revocados",
    "en": "Revoked"
  },
  "text005": {
    "es": "Todos",
    "en": "All"
  },
  "text006": {
    "es": "PENDIENTE",
    "en": "PENDING"
  },
  "text007": {
    "es": "REVISADO",
    "en": "REVIEWED"
  },
  "text008": {
    "es": "SIN CONTACTO",
    "en": "NO CONTACT"
  },
  "text009": {
    "es": "REVOCADO",
    "en": "REVOKED"
  },
  "text010": {
    "es": "GRUPO WHATSAPP",
    "en": "WHATSAPP GROUP"
  },
  "text011": {
    "es": "correo antes {0}",
    "en": "previous email {0}"
  },
  "text012": {
    "es": "teléfono antes {0}",
    "en": "previous phone {0}"
  },
  "text013": {
    "es": "contacto antes {0}",
    "en": "previous contact {0}"
  },
  "text014": {
    "es": "{0}: contacto confirmado y guardado en la bitácora.",
    "en": "{0}: contact confirmed and recorded in the audit log."
  },
  "text015": {
    "es": "{0}: revisión revocada; vuelve a pendientes.",
    "en": "{0}: review revoked; returned to pending."
  },
  "text016": {
    "es": "{0}: contacto corregido en el Carrier CRM. Confírmalo para dejarlo revisado.",
    "en": "{0}: contact corrected in Carrier CRM. Confirm it to mark it reviewed."
  },
  "text017": {
    "es": "Revisión de contactos",
    "en": "Contact review"
  },
  "text018": {
    "es": "{0} carrier{1} en audiencia",
    "en": "{0} carrier{1} in the audience"
  },
  "text019": {
    "es": "Antes de que salga una invitación, alguien confirma que el contacto es el correcto. Cada revisión guarda una foto de lo que se verificó, y se puede revocar.",
    "en": "Before an invitation goes out, someone confirms that the contact is correct. Each review saves a snapshot of what was verified and can be revoked."
  },
  "text020": {
    "es": "CONTRATO REAL",
    "en": "ACTUAL CONTRACT"
  },
  "text021": {
    "es": "record_rfx_invitation_wave_review · por (evento, carrier) · contact_snapshot: vendor_name · vendor_domain · contact_name · email · phone · escribe a saas_audit_log",
    "en": "record_rfx_invitation_wave_review · per (event, carrier) · contact_snapshot: vendor_name · vendor_domain · contact_name · email · phone · writes to saas_audit_log"
  },
  "text022": {
    "es": "Cuenta de Consulta:",
    "en": "Viewer account:"
  },
  "text023": {
    "es": "ves los contactos y sus revisiones, pero no puedes confirmarlas ni corregir contactos.",
    "en": "you can see contacts and reviews but cannot confirm them or correct contacts."
  },
  "text024": {
    "es": "Carriers del evento",
    "en": "Event carriers"
  },
  "text025": {
    "es": "Cargando los contactos del evento…",
    "en": "Loading event contacts…"
  },
  "text026": {
    "es": "Ver ",
    "en": "View "
  },
  "text027": {
    "es": " más de ",
    "en": " more than "
  },
  "text028": {
    "es": "Nadie en este filtro.",
    "en": "Nobody matches this filter."
  },
  "text029": {
    "es": "El evento aún no tiene carriers: agrégalos en Carrier fit.",
    "en": "The event has no carriers yet: add them in Carrier Fit."
  },
  "text030": {
    "es": "Por qué esta compuerta",
    "en": "Why this gate"
  },
  "text031": {
    "es": "Una invitación mal dirigida no se puede recoger. Va a un buzón real, de una empresa real, con el nombre del cliente encima.",
    "en": "A misdirected invitation cannot be recalled. It reaches a real mailbox at a real company, with the customer’s name on it."
  },
  "text032": {
    "es": "La foto importa: si el contacto cambia después, la bitácora sigue diciendo qué se verificó y cuándo. Sin eso, «yo lo revisé» no es comprobable.",
    "en": "The snapshot matters: if the contact changes later, the audit log still shows what was verified and when. Without it, “I checked it” cannot be verified."
  },
  "text033": {
    "es": " pendiente",
    "en": " pending"
  },
  "text034": {
    "es": " de ",
    "en": " of "
  },
  "text035": {
    "es": "Revisar no es obligatorio para enviar, pero queda en la bitácora quién confirmó cada contacto y cuándo.",
    "en": "Review is not required to send, but the audit log records who confirmed each contact and when."
  },
  "text036": {
    "es": "(sin nombre)",
    "en": "(unnamed)"
  },
  "text037": {
    "es": "sin dominio",
    "en": "no domain"
  },
  "text038": {
    "es": "Contacto",
    "en": "Contact"
  },
  "text039": {
    "es": "Correo",
    "en": "Email"
  },
  "text040": {
    "es": "Teléfono",
    "en": "Phone"
  },
  "text041": {
    "es": "— sin número",
    "en": "— no number"
  },
  "text042": {
    "es": "Canal",
    "en": "Channel"
  },
  "text043": {
    "es": "Revisado por ",
    "en": "Reviewed by "
  },
  "text044": {
    "es": " · el contacto cambió desde la revisión (",
    "en": " · the contact changed since review ("
  },
  "text045": {
    "es": "Revocar revisión",
    "en": "Revoke review"
  },
  "text046": {
    "es": "No puede invitarse hasta tener correo o WhatsApp. Se queda a la vista, no se descarta.",
    "en": "An invitation cannot be sent without email or WhatsApp. The carrier stays visible and is not discarded."
  },
  "text047": {
    "es": "Agregar contacto",
    "en": "Add contact"
  },
  "text048": {
    "es": "Revocada por ",
    "en": "Revoked by "
  },
  "text049": {
    "es": "Confirmar guarda una foto de estos datos en la bitácora.",
    "en": "Confirming saves a snapshot of these details in the audit log."
  },
  "text050": {
    "es": "Corregir contacto",
    "en": "Correct contact"
  },
  "text051": {
    "es": "Guardando…",
    "en": "Saving…"
  },
  "text052": {
    "es": "Confirmar y marcar revisado",
    "en": "Confirm and mark reviewed"
  },
  "text053": {
    "es": "Nombre de quien cotiza",
    "en": "Quoting contact name"
  },
  "text054": {
    "es": "tarifas@empresa.com",
    "en": "rates@example.test"
  },
  "text055": {
    "es": "Se guarda en el Carrier CRM. Después confírmalo para dejarlo revisado.",
    "en": "Saved in Carrier CRM. Then confirm it to mark it reviewed."
  },
  "text056": {
    "es": "Cancelar",
    "en": "Cancel"
  },
  "text057": {
    "es": "Guardar contacto",
    "en": "Save contact"
  },
  "text058": {
    "es": "LISTO",
    "en": "READY"
  },
  "text059": {
    "es": "BLOQUEADO",
    "en": "LOCKED"
  },
  "text060": {
    "es": "ENVIADO",
    "en": "SENT"
  },
  "text061": {
    "es": "REBOTADO",
    "en": "BOUNCED"
  },
  "text062": {
    "es": "FALLÓ",
    "en": "FAILED"
  },
  "text063": {
    "es": "SIN CONFIRMAR",
    "en": "UNCONFIRMED"
  },
  "text064": {
    "es": "ARCHIVADO",
    "en": "ARCHIVED"
  },
  "text065": {
    "es": ", {0} sin cambio",
    "en": ", {0} unchanged"
  },
  "text066": {
    "es": "Error: {0}",
    "en": "Error: {0}"
  },
  "text067": {
    "es": "{0} por correo (Gmail, sales@heymarksman.com)",
    "en": "{0} by email (Gmail, sales@heymarksman.com)"
  },
  "text068": {
    "es": "{0} por WhatsApp",
    "en": "{0} by WhatsApp"
  },
  "text069": {
    "es": "Vas a ENVIAR {0}. Los carriers los reciben de inmediato y no se puede deshacer.",
    "en": "You are about to SEND {0}. Carriers receive them immediately and this cannot be undone."
  },
  "text070": {
    "es": " y ",
    "en": " and "
  },
  "text071": {
    "es": "\n\n{0} seleccionado(s) no están listos para enviarse y no se incluyen.",
    "en": "\n\n{0} selected message(s) are not ready and will not be included."
  },
  "text072": {
    "es": "\n\n{0} carrier(s) de este envío no tienen su contacto revisado.",
    "en": "\n\n{0} carrier(s) in this batch do not have a reviewed contact."
  },
  "text073": {
    "es": "\n\n¿Enviar?",
    "en": "\n\nSend?"
  },
  "text074": {
    "es": "Aprobar y enviar",
    "en": "Approve and send"
  },
  "text075": {
    "es": "{0}: {1} enviado(s)",
    "en": "{0}: {1} sent"
  },
  "text076": {
    "es": ", {0} fallaron",
    "en": ", {0} failed"
  },
  "text077": {
    "es": ", {0} omitido(s)",
    "en": ", {0} skipped"
  },
  "text078": {
    "es": ", {0} sin confirmar",
    "en": ", {0} unconfirmed"
  },
  "text079": {
    "es": "Ninguno de los {0} seleccionados puede pasar a \"{1}\" desde su estado actual.",
    "en": "None of the {0} selected messages can move to “{1}” from their current state."
  },
  "text080": {
    "es": "Vas a marcar {0} mensaje(s) como \"{1}\". No se envía nada: solo cambia cómo queda registrado.",
    "en": "You are about to mark {0} message(s) as “{1}”. Nothing is sent: only the recorded state changes."
  },
  "text081": {
    "es": "\n\n{0} seleccionado(s) no pueden pasar a ese estado y se quedan igual.",
    "en": "\n\n{0} selected message(s) cannot move to that state and remain unchanged."
  },
  "text082": {
    "es": "\n\n¿Continuar?",
    "en": "\n\nContinue?"
  },
  "text083": {
    "es": "marcado(s) como \"{0}\"",
    "en": "marked as “{0}”"
  },
  "text084": {
    "es": "Vas a archivar {0} mensaje(s). Salen de la cola activa; lo que el carrier recibió, sus respuestas y sus ofertas se conservan.\n\n¿Archivar?",
    "en": "You are about to archive {0} message(s). They leave the active queue; received messages, responses and offers remain. Archive?"
  },
  "text085": {
    "es": "Vas a BORRAR {0} borrador(es) que nunca se enviaron. No se puede deshacer.",
    "en": "You are about to DELETE {0} draft(s) that were never sent. This cannot be undone."
  },
  "text086": {
    "es": "\n\n{0} seleccionado(s) ya salieron o están archivados: esos no se borran (se archivan).",
    "en": "\n\n{0} selected message(s) have been sent or archived: those are not deleted (they can be archived)."
  },
  "text087": {
    "es": "\n\n¿Borrar?",
    "en": "\n\nDelete?"
  },
  "text088": {
    "es": "Aprobar y enviar ({0})",
    "en": "Approve and send ({0})"
  },
  "text089": {
    "es": "Máximo {0} por canal en cada envío",
    "en": "Maximum {0} per channel per batch"
  },
  "text090": {
    "es": "Cola de envío",
    "en": "Delivery queue"
  },
  "text091": {
    "es": "ÚNICA SUPERFICIE DE ENVÍO",
    "en": "ONLY SENDING SURFACE"
  },
  "text092": {
    "es": "Actualizar",
    "en": "Refresh"
  },
  "text093": {
    "es": "Procesando…",
    "en": "Processing…"
  },
  "text094": {
    "es": "Compuerta de envío:",
    "en": "Delivery gate:"
  },
  "text095": {
    "es": "ya {0}; lo demás espera. ",
    "en": "already {0}; the rest wait. "
  },
  "text096": {
    "es": "salió 1",
    "en": "1 sent"
  },
  "text097": {
    "es": "salieron {0}",
    "en": "{0} sent"
  },
  "text098": {
    "es": "nada salió todavía. ",
    "en": "nothing sent yet. "
  },
  "text099": {
    "es": "Revisa los borradores, desmarca lo que no quieras y aprueba explícitamente. El envío es idempotente: reintentar no duplica mensajes.",
    "en": "Review drafts, deselect anything you do not want and approve explicitly. Sending is idempotent: retrying does not duplicate messages."
  },
  "text100": {
    "es": "Revisión de contactos:",
    "en": "Contact review:"
  },
  "text101": {
    "es": "{0} de los {1} carriers listos para enviar no tienen su contacto revisado. ",
    "en": "{0} of the {1} carriers ready to send do not have a reviewed contact. "
  },
  "text102": {
    "es": "Se pueden enviar igual; la bitácora registra quién revisó cada contacto.",
    "en": "They can still be sent; the audit log records who reviewed each contact."
  },
  "text103": {
    "es": "los {0} carriers listos para enviar tienen su contacto revisado.",
    "en": "the {0} carriers ready to send have reviewed contacts."
  },
  "text104": {
    "es": "Revisar contactos →",
    "en": "Review contacts →"
  },
  "text105": {
    "es": "No se pudieron leer las revisiones de contactos: ",
    "en": "Contact reviews could not be read: "
  },
  "text106": {
    "es": "Borradores",
    "en": "Drafts"
  },
  "text107": {
    "es": "Listos",
    "en": "Ready"
  },
  "text108": {
    "es": "Bloqueados",
    "en": "Blocked"
  },
  "text109": {
    "es": "Enviados",
    "en": "Sent"
  },
  "text110": {
    "es": "Respondieron",
    "en": "Replied"
  },
  "text111": {
    "es": "Rebotes y fallas",
    "en": "Bounces and failures"
  },
  "text112": {
    "es": "Canal: Todos",
    "en": "Channel: All"
  },
  "text113": {
    "es": "Canal: Email",
    "en": "Channel: Email"
  },
  "text114": {
    "es": "Canal: WhatsApp",
    "en": "Channel: WhatsApp"
  },
  "text115": {
    "es": "Estado: Activos",
    "en": "Status: Active"
  },
  "text116": {
    "es": "Estado: ",
    "en": "Status: "
  },
  "text117": {
    "es": "Buscar carrier, correo o teléfono…",
    "en": "Search carrier, email or phone…"
  },
  "text118": {
    "es": "Seleccionar todos los listos (",
    "en": "Select all ready ("
  },
  "text119": {
    "es": "· Limpiar",
    "en": "· Clear"
  },
  "text120": {
    "es": "Cargando mensajes…",
    "en": "Loading messages…"
  },
  "text121": {
    "es": "Seleccionar esta página",
    "en": "Select this page"
  },
  "text122": {
    "es": "Idioma",
    "en": "Language"
  },
  "text123": {
    "es": "Estado",
    "en": "Status"
  },
  "text124": {
    "es": "Entrega",
    "en": "Delivery"
  },
  "text125": {
    "es": "Seleccionar {0}",
    "en": "Select {0}"
  },
  "text126": {
    "es": "— sin contacto",
    "en": "— no contact"
  },
  "text127": {
    "es": "Carrier: ",
    "en": "Carrier: "
  },
  "text128": {
    "es": "← Anterior",
    "en": "← Previous"
  },
  "text129": {
    "es": "Siguiente →",
    "en": "Next →"
  },
  "text130": {
    "es": "Ningún mensaje con este filtro",
    "en": "No messages with this filter"
  },
  "text131": {
    "es": "Sin mensajes en la cola",
    "en": "No messages in the queue"
  },
  "text132": {
    "es": "Prueba con otro estado o búsqueda.",
    "en": "Try another status or search."
  },
  "text133": {
    "es": "Genera los borradores desde Mensaje.",
    "en": "Generate drafts from Message."
  },
  "text134": {
    "es": " seleccionado{0}",
    "en": " selected"
  },
  "text135": {
    "es": " · 1 mensaje por carrier y canal",
    "en": " · 1 message per carrier and channel"
  },
  "text136": {
    "es": "{0} bloqueado{1} no se envían: resuelve el contacto o espera la aprobación de la plantilla en Meta.",
    "en": "{0} blocked message{1} will not be sent: resolve the contact or wait for Meta template approval."
  },
  "text137": {
    "es": "Máximo {0} por canal en cada envío: aprueba en tandas.",
    "en": "Maximum {0} per channel per batch: approve in batches."
  },
  "text138": {
    "es": "Solo se envían los listos; lo demás se queda como está.",
    "en": "Only ready messages are sent; the rest remain unchanged."
  },
  "text139": {
    "es": "Marcar como…",
    "en": "Mark as…"
  },
  "text140": {
    "es": "Archivar (",
    "en": "Archive ("
  },
  "text141": {
    "es": "Solo borradores que nunca se enviaron",
    "en": "Only drafts that were never sent"
  },
  "text142": {
    "es": "Borrar (",
    "en": "Delete ("
  },
  "text143": {
    "es": "Evento",
    "en": "Event"
  },
  "text144": {
    "es": "Revisión",
    "en": "Review"
  },
  "text145": {
    "es": "Mensaje",
    "en": "Message"
  },
  "text146": {
    "es": "grupo de WhatsApp",
    "en": "WhatsApp group"
  },
  "text147": {
    "es": "SIN CONECTAR",
    "en": "NOT CONNECTED"
  },
  "text148": {
    "es": "Plantilla \"{0}\" guardada. Los próximos borradores usan este texto.",
    "en": "Template “{0}” saved. Upcoming drafts use this text."
  },
  "text149": {
    "es": "Se prepararán borradores de \"{0}\" por {1} ",
    "en": "Drafts of “{0}” will be prepared via {1} "
  },
  "text150": {
    "es": "para {0} carrier{1}. ",
    "en": "for {0} carrier{1}. "
  },
  "text151": {
    "es": "No se envía nada: pasan a la Cola de envío. ¿Continuar?",
    "en": "Nothing is sent: they go to the Delivery queue. Continue?"
  },
  "text152": {
    "es": "Generar borradores",
    "en": "Generate drafts"
  },
  "text153": {
    "es": "No se pudo crear la campaña.",
    "en": "Could not create the campaign."
  },
  "text154": {
    "es": " (omitidos {0}: {1})",
    "en": " (skipped {0}: {1})"
  },
  "text155": {
    "es": "Borradores listos · {0}. Revísalos y apruébalos en la Cola de envío.",
    "en": "Drafts ready · {0}. Review and approve them in the Delivery queue."
  },
  "text156": {
    "es": "Vas a archivar la campaña \"{0}\". Deja de aparecer en las listas; ",
    "en": "You are about to archive campaign “{0}”. It will leave the lists; "
  },
  "text157": {
    "es": "sus mensajes no cambian (lo enviado sigue enviado y los borradores siguen en la cola). ¿Continuar?",
    "en": "its messages remain unchanged (sent messages stay sent and drafts stay in the queue). Archive?"
  },
  "text158": {
    "es": "Archivar",
    "en": "Archive"
  },
  "text159": {
    "es": "Campaña archivada.",
    "en": "Campaign archived."
  },
  "text160": {
    "es": "Transportes Ejemplo",
    "en": "Example Transport"
  },
  "text161": {
    "es": "Generar borradores{0} →",
    "en": "Generate drafts{0} →"
  },
  "text162": {
    "es": " para {0} carrier{1}",
    "en": " for {0} carrier{1}"
  },
  "text163": {
    "es": "Guarda la plantilla antes de generar: los borradores usan el texto guardado",
    "en": "Save the template before generating: drafts use the saved text"
  },
  "text164": {
    "es": "Plantilla del sistema: duplícala en Plantillas de correo para editarla",
    "en": "System template: duplicate it in Email templates to edit it"
  },
  "text165": {
    "es": "Guardar plantilla",
    "en": "Save template"
  },
  "text166": {
    "es": "Generando…",
    "en": "Generating…"
  },
  "text167": {
    "es": "AUDIENCIA",
    "en": "AUDIENCE"
  },
  "text168": {
    "es": " invitado",
    "en": " invited"
  },
  "text169": {
    "es": "en ",
    "en": "via "
  },
  "text170": {
    "es": " · uno por carrier, con todos sus lanes",
    "en": " · one per carrier, with all their lanes"
  },
  "text171": {
    "es": "Cambiar audiencia en Carrier fit ↗",
    "en": "Change audience in Carrier Fit ↗"
  },
  "text172": {
    "es": "Cargando el mensaje…",
    "en": "Loading message…"
  },
  "text173": {
    "es": "Plantilla y contenido",
    "en": "Template and content"
  },
  "text174": {
    "es": "Abrir en Plantillas de correo ↗",
    "en": "Open in Email templates ↗"
  },
  "text175": {
    "es": "Plantilla de Outreach",
    "en": "Outreach template"
  },
  "text176": {
    "es": " · del sistema",
    "en": " · system"
  },
  "text177": {
    "es": "Campaña de este evento: ",
    "en": "Campaign for this event: "
  },
  "text178": {
    "es": "Archivar campaña",
    "en": "Archive campaign"
  },
  "text179": {
    "es": "Al generar se crea la campaña que liga este evento con la plantilla; crearla no envía nada.",
    "en": "Generating creates the campaign linking this event to the template; creating it sends nothing."
  },
  "text180": {
    "es": " · Plantilla del sistema: solo lectura.",
    "en": " · System template: read-only."
  },
  "text181": {
    "es": "Asunto",
    "en": "Subject"
  },
  "text182": {
    "es": "Cuerpo del correo",
    "en": "Email body"
  },
  "text183": {
    "es": "Insertar variable:",
    "en": "Insert variable:"
  },
  "text184": {
    "es": "Canales",
    "en": "Channels"
  },
  "text185": {
    "es": "Remitente {0} · identidad MARKSMAN Procurement",
    "en": "Sender {0} · MARKSMAN Procurement identity"
  },
  "text186": {
    "es": "Sin buzón conectado: nada saldrá por correo.",
    "en": "No mailbox connected: no email will go out."
  },
  "text187": {
    "es": "REVISAR",
    "en": "REVIEW"
  },
  "text188": {
    "es": "WhatsApp · plantilla Meta",
    "en": "WhatsApp · Meta template"
  },
  "text189": {
    "es": "Esta plantilla no está conectada a WhatsApp (se conecta en Plantillas de correo).",
    "en": "This template is not connected to WhatsApp (connect it in Email templates)."
  },
  "text190": {
    "es": "WhatsApp · grupo",
    "en": "WhatsApp · group"
  },
  "text191": {
    "es": "Envío no automatizado: se prepara el texto y se manda a mano en el grupo.",
    "en": "Sending is manual: prepare the text and send it to the group yourself."
  },
  "text192": {
    "es": "Cada canal genera su propia cola: un mensaje por carrier y canal.",
    "en": "Each channel generates its own queue: one message per carrier and channel."
  },
  "text193": {
    "es": "Vista previa",
    "en": "Preview"
  },
  "text194": {
    "es": "Vista previa del correo",
    "en": "Email preview"
  },
  "text195": {
    "es": "Cada carrier recibe su enlace privado único. El Bid Room es la fuente del libro de negocio vigente.",
    "en": "Each carrier receives its own private link. Bid Room is the source of the current business book."
  },
  "text196": {
    "es": "SIN ESTADO",
    "en": "NO STATUS"
  },
  "text197": {
    "es": " bloqueado",
    "en": " blocked"
  },
  "text198": {
    "es": " sigue ",
    "en": " remains "
  },
  "text199": {
    "es": " en Meta. Esos carriers reciben solo correo hasta que se apruebe.",
    "en": " in Meta. Those carriers receive email only until approval."
  },
  "text200": {
    "es": "Revisar en Integraciones",
    "en": "Review in Integrations"
  },
  "text201": {
    "es": "Se preparan ",
    "en": "Prepare "
  },
  "text202": {
    "es": " borrador",
    "en": " draft"
  },
  "text203": {
    "es": " personalizados por canal (",
    "en": " personalized per channel ("
  },
  "text204": {
    "es": "ningún canal",
    "en": "no channel"
  },
  "text205": {
    "es": ") y pasan a la Cola de envío.",
    "en": ") and go to the Delivery queue."
  },
  "text206": {
    "es": "AQUÍ NO SE ENVÍA",
    "en": "NOTHING IS SENT HERE"
  },
  "text207": {
    "es": "Mensaje solo prepara; se envía desde la Cola de envío.",
    "en": "Message only prepares; sending happens in the Delivery queue."
  },
  "text208": {
    "es": "Ir a la Cola de envío →",
    "en": "Go to Delivery queue →"
  },
  "text209": {
    "es": "Hay cambios sin guardar. ¿Salir sin guardarlos?",
    "en": "There are unsaved changes. Leave without saving?"
  },
  "text210": {
    "es": "el nombre",
    "en": "the name"
  },
  "text211": {
    "es": "el cuerpo del correo",
    "en": "the email body"
  },
  "text212": {
    "es": "el texto de WhatsApp",
    "en": "the WhatsApp text"
  },
  "text213": {
    "es": "Falta {0}.",
    "en": "Missing {0}."
  },
  "text214": {
    "es": "Plantilla guardada. Los borradores que se generen desde ahora la usan; los ya generados no cambian.",
    "en": "Template saved. Drafts generated from now on use it; existing drafts do not change."
  },
  "text215": {
    "es": "Guarda los cambios antes de conectar WhatsApp.",
    "en": "Save changes before connecting WhatsApp."
  },
  "text216": {
    "es": "Se conecta con la invitación de WhatsApp que Meta ya aprobó en {0} ",
    "en": "Connects to the WhatsApp invitation already approved by Meta in {0} "
  },
  "text217": {
    "es": "(rateware_rfx_invitation_{0}). No se envía nada a ningún carrier; si Meta no la tuviera, ",
    "en": "(rateware_rfx_invitation_{0}). Nothing is sent to carriers; if Meta does not have it, "
  },
  "text218": {
    "es": "rateware la manda a revisión de Meta.\n\n¿Conectar?",
    "en": "rateware submits it to Meta for review. Connect?"
  },
  "text219": {
    "es": "Conectada: las campañas con esta plantilla ya pueden invitar por WhatsApp.",
    "en": "Connected: campaigns using this template can now invite via WhatsApp."
  },
  "text220": {
    "es": "Meta todavía no la aprueba: {0}.",
    "en": "Meta has not approved it yet: {0}."
  },
  "text221": {
    "es": "Nueva plantilla",
    "en": "New template"
  },
  "text222": {
    "es": "Plantilla",
    "en": "Template"
  },
  "text223": {
    "es": "Outreach  ›  Plantillas de correo",
    "en": "Outreach › Email templates"
  },
  "text224": {
    "es": "Del sistema · solo lectura",
    "en": "System · read-only"
  },
  "text225": {
    "es": "Del equipo",
    "en": "Team"
  },
  "text226": {
    "es": "← Plantillas",
    "en": "← Templates"
  },
  "text227": {
    "es": "Crear plantilla",
    "en": "Create template"
  },
  "text228": {
    "es": "Guardar",
    "en": "Save"
  },
  "text229": {
    "es": "Cargando plantilla…",
    "en": "Loading template…"
  },
  "text230": {
    "es": "Plantilla del sistema:",
    "en": "System template:"
  },
  "text231": {
    "es": "no se edita. Para cambiarla, crea la versión del equipo desde la lista de plantillas.",
    "en": "cannot be edited. To change it, create a team version from the template list."
  },
  "text232": {
    "es": "Nombre",
    "en": "Name"
  },
  "text233": {
    "es": "Asunto del correo",
    "en": "Email subject"
  },
  "text234": {
    "es": "Cuerpo del correo (HTML)",
    "en": "Email body (HTML)"
  },
  "text235": {
    "es": "Texto de WhatsApp",
    "en": "WhatsApp text"
  },
  "text236": {
    "es": "Variables que se llenan por carrier (",
    "en": "Variables filled per carrier ("
  },
  "text237": {
    "es": "ninguna",
    "en": "none"
  },
  "text238": {
    "es": "Asunto: ",
    "en": "Subject: "
  },
  "text239": {
    "es": " · las variables se ven como ",
    "en": " · variables appear as "
  },
  "text240": {
    "es": " hasta generar el borrador.",
    "en": " until generating the draft."
  },
  "text241": {
    "es": "sin invitación de Meta",
    "en": "no Meta invitation"
  },
  "text242": {
    "es": "Conectar a WhatsApp",
    "en": "Connect to WhatsApp"
  },
  "text243": {
    "es": "Por WhatsApp directo sale la invitación aprobada por Meta en el idioma de la plantilla, con el enlace al Bid Room del carrier; este texto queda en el borrador. Sin conexión, las campañas con esta plantilla no pueden invitar por WhatsApp.",
    "en": "Direct WhatsApp sends the Meta-approved invitation in the template language, with the carrier’s Bid Room link; this text remains in the draft. Without a connection, campaigns using this template cannot invite via WhatsApp."
  },
  "text244": {
    "es": "Al crearla queda sin conexión con WhatsApp; se conecta desde aquí después de guardarla.",
    "en": "It starts without a WhatsApp connection; connect it here after saving."
  },
  "text245": {
    "es": "Español",
    "en": "Spanish"
  },
  "text246": {
    "es": "Inglés",
    "en": "English"
  },
  "text247": {
    "es": "No aplica",
    "en": "Not applicable"
  },
  "text248": {
    "es": "APROBADA",
    "en": "APPROVED"
  },
  "text249": {
    "es": "EN REVISIÓN",
    "en": "UNDER REVIEW"
  },
  "text250": {
    "es": "Se crea la versión del equipo de \"{0}\": mismo nombre y mismo contenido, y esa sí se puede editar. ",
    "en": "A team version of “{0}” will be created: same name and content, and it can be edited. "
  },
  "text251": {
    "es": "La del sistema no cambia.\n\n¿Crear?",
    "en": "The system version does not change. Create?"
  },
  "text252": {
    "es": "\"{0}\" sale de todas las listas y ya no se puede elegir para campañas nuevas. ",
    "en": "“{0}” leaves all lists and can no longer be selected for new campaigns. "
  },
  "text253": {
    "es": "Las campañas que ya la usan la conservan.\n\n¿Archivar?",
    "en": "Existing campaigns keep it. Archive?"
  },
  "text254": {
    "es": "\"{0}\" archivada.",
    "en": "“{0}” archived."
  },
  "text255": {
    "es": "Vas a BORRAR \"{0}\" (la versión del equipo) para siempre.",
    "en": "You are about to permanently DELETE “{0}” (the team version)."
  },
  "text256": {
    "es": " Para campañas nuevas queda la versión del sistema.",
    "en": " The system version remains available for new campaigns."
  },
  "text257": {
    "es": "\n\nLas campañas y los mensajes que ya la usaron se conservan, sin liga a la plantilla, ",
    "en": "\n\nExisting campaigns and messages remain, without a link to the template, "
  },
  "text258": {
    "es": "y se pierde su conexión con WhatsApp.\n\n¿Borrar?",
    "en": "and its WhatsApp connection is lost. Delete?"
  },
  "text259": {
    "es": "\"{0}\" borrada.",
    "en": "“{0}” deleted."
  },
  "text260": {
    "es": "Plantillas de correo",
    "en": "Email templates"
  },
  "text261": {
    "es": "Las invitaciones que reciben los carriers, por correo y WhatsApp",
    "en": "Invitations carriers receive by email and WhatsApp"
  },
  "text262": {
    "es": "Sistema y equipo:",
    "en": "System and team:"
  },
  "text263": {
    "es": "Las plantillas del sistema no se editan: «Crear versión del equipo» hace una copia editable. Cada evento elige su plantilla al preparar el mensaje.",
    "en": "System templates cannot be edited: “Create team version” makes an editable copy. Each event picks its template when preparing the message."
  },
  "text264": {
    "es": "Cargando plantillas…",
    "en": "Loading templates…"
  },
  "text265": {
    "es": "Actualizada",
    "en": "Updated"
  },
  "text266": {
    "es": "Del sistema",
    "en": "System"
  },
  "text267": {
    "es": "Crear versión del equipo",
    "en": "Create team version"
  },
  "text268": {
    "es": "Editar",
    "en": "Edit"
  },
  "text269": {
    "es": "Duplicar",
    "en": "Duplicate"
  },
  "text270": {
    "es": "Borrar",
    "en": "Delete"
  },
  "text271": {
    "es": "Sin plantillas",
    "en": "No templates"
  },
  "text272": {
    "es": "Crea la primera con “Nueva plantilla”.",
    "en": "Create the first with “New template”."
  },
  "text273": {
    "es": "No existe una plantilla activa con ese id (puede estar archivada o borrada).",
    "en": "No active template exists with this ID (it may be archived or deleted)."
  },
  "text274": {
    "es": "Por revisar",
    "en": "To review"
  },
  "text275": {
    "es": "CAMBIÓ",
    "en": "CHANGED"
  },
  "text276": {
    "es": "Solo los carriers revisados reciben invitación. Confirma que cada contacto es el correcto; si cambia después, vuelve aquí para revisarlo otra vez.",
    "en": "Only reviewed carriers get invited. Confirm each contact is the right one; if it changes later, it comes back here to be reviewed again."
  },
  "text277": {
    "es": "Nada por revisar: {0} carrier(s) revisados.",
    "en": "Nothing to review: {0} carrier(s) reviewed."
  },
  "text278": {
    "es": "Volver a la página del evento",
    "en": "Back to the event"
  },
  "text279": {
    "es": "Seguir al mensaje →",
    "en": "Continue to the message →"
  },
  "text280": {
    "es": "Eventos",
    "en": "Events"
  },
  "text281": {
    "es": "Hacer predeterminada",
    "en": "Make default"
  },
  "text282": {
    "es": "«{0}» es ahora la plantilla predeterminada en {1}.",
    "en": "“{0}” is now the default template in {1}."
  }
};

export const tr = translator(copy);

const extraCopy={
  "extra0": {
    "es": "Borrador",
    "en": "Draft"
  },
  "extra1": {
    "es": "En cola",
    "en": "Queued"
  },
  "extra2": {
    "es": "Enviando",
    "en": "Sending"
  },
  "extra3": {
    "es": "Enviado",
    "en": "Sent"
  },
  "extra4": {
    "es": "Entregado",
    "en": "Delivered"
  },
  "extra5": {
    "es": "Leído",
    "en": "Read"
  },
  "extra6": {
    "es": "Enviado a mano",
    "en": "Sent manually"
  },
  "extra7": {
    "es": "Sin confirmar",
    "en": "Unconfirmed"
  },
  "extra8": {
    "es": "Falló",
    "en": "Failed"
  },
  "extra9": {
    "es": "Respondió",
    "en": "Replied"
  },
  "extra10": {
    "es": "Cotizó",
    "en": "Quoted"
  },
  "extra11": {
    "es": "Rebotó",
    "en": "Bounced"
  },
  "extra12": {
    "es": "Suprimido",
    "en": "Suppressed"
  },
  "extra13": {
    "es": "Archivado",
    "en": "Archived"
  },
  "extra14": {
    "es": "Correo y WhatsApp",
    "en": "Email and WhatsApp"
  },
  "extra15": {
    "es": "Solo correo",
    "en": "Email only"
  },
  "extra16": {
    "es": "Solo WhatsApp",
    "en": "WhatsApp only"
  }
};
export const extra=translator({ ...extraCopy, extra17: { es: "Regresar a la cola", en: "Return to queue" } });

const wordCopy={
  "word0": {
    "es": "— sin nombre",
    "en": "— no name"
  },
  "word1": {
    "es": "— sin correo",
    "en": "— no email"
  },
  "word2": {
    "es": "archivado(s)",
    "en": "archived"
  },
  "word3": {
    "es": "borrado(s)",
    "en": "deleted"
  },
  "word4": {
    "es": "mensaje",
    "en": "message"
  },
  "word5": {
    "es": "correo",
    "en": "email"
  },
  "word6": {
    "es": "sin aprobar",
    "en": "not approved"
  },
  "word7": {
    "es": "el asunto",
    "en": "the subject"
  },
  "word8": {
    "es": "sin respuesta",
    "en": "no response"
  },
  "word9": {
    "es": " · predeterminada",
    "en": " · default"
  },
  "word10": {
    "es": "{{nombre}}",
    "en": "{{name}}"
  }
};
export const words=translator(wordCopy);

/** UI delivery labels only; provider diagnostics and stored messages stay verbatim. */
export const deliveryText = translator({
  queued: { es: "En cola · sin confirmación", en: "Queued · not confirmed" },
  sending: { es: "En proceso · sin confirmación", en: "Sending · not confirmed" },
  previousError: { es: "Último error", en: "Last error" },
  suppressed: { es: "suprimido", en: "suppressed" },
  missingEmail: { es: "sin email de contacto", en: "no contact email" },
  missingPhone: { es: "sin teléfono de contacto", en: "no contact phone" },
  suppressedRecipient: { es: "destinatario suprimido", en: "suppressed recipient" },
  read: { es: "entregado · leído", en: "delivered · read" },
  delivered: { es: "entregado", en: "delivered" },
  suppressedSuffix: { es: " · suprimido", en: " · suppressed" },
  failed: { es: "falló", en: "failed" },
  sent: { es: "enviado", en: "sent" },
});

export const queueRefreshText = translator({
  updating: { es: "Actualizando la Cola y sus contadores…", en: "Updating the queue and its counts…" },
  unavailable: { es: "No se pudo actualizar la Cola. Pulsa Actualizar antes de continuar.", en: "The queue could not be updated. Click Refresh before continuing." },
});

export const generationText = translator({
  reviewedCount: { es: "{0} carriers revisados de {1} seleccionados", en: "{0} reviewed carriers out of {1} selected" },
  audienceRule: { es: "El RFx contiene {0} carriers. Sólo se preparan borradores para la selección con revisión vigente; los demás no se agregan.", en: "The RFx contains {0} carriers. Drafts are prepared only for the selection with a current review; the others are not added." },
  noReviewed: { es: "Marca como Revisado al menos un carrier seleccionado antes de preparar borradores.", en: "Mark at least one selected carrier as Reviewed before preparing drafts." },
  selectionUnavailable: { es: "No se pudo resolver la selección guardada. Actualiza antes de preparar borradores.", en: "The saved selection could not be resolved. Refresh before preparing drafts." },
  reviewContacts: { es: "Revisar contactos ↗", en: "Review contacts ↗" },
  notReviewed: { es: "Carrier sin revisión vigente o fuera de participación", en: "Carrier has no current review or is not participating" },
  changed: { es: "La selección o una revisión cambió. Actualizamos la audiencia; revísala antes de confirmar de nuevo. No se prepararon borradores en este intento.", en: "The selection or a review changed. We refreshed the audience; review it before confirming again. No drafts were prepared in this attempt." },
  none: { es: "No se prepararon borradores · {0}. Revisa las omisiones o los mensajes existentes en la Cola. No se envió ningún mensaje.", en: "No drafts were prepared · {0}. Review the skipped entries or existing messages in the queue. No messages were sent." },
  dailyCap: { es: "Se alcanzó el límite interno de preparación de borradores", en: "The internal draft-preparation limit was reached" },
});

export const batchText = translator({
  interval: { es: "Pausa entre tandas", en: "Pause between batches" },
  one: { es: "1 minuto", en: "1 minute" },
  five: { es: "5 minutos", en: "5 minutes" },
  help: { es: "Tandas de 50. Mantén abierta esta Cola; al salir o recargar se detienen las pendientes.", en: "Batches of 50. Keep this queue open; leaving or reloading stops pending batches." },
  confirm: { es: " Se enviarán en {0} tanda(s), con {1} minuto(s) entre tandas. Mantén abierta la Cola.", en: " They will be sent in {0} batch(es), with {1} minute(s) between batches. Keep the queue open." },
  sending: { es: "Enviando tanda {0} de {1}. Confirmados: {2} de {3}.", en: "Sending batch {0} of {1}. Confirmed: {2} of {3}." },
  waiting: { es: "Pausa de {0} minuto(s) antes de la tanda {1} de {2}. Confirmados: {3} de {4}.", en: "Pausing {0} minute(s) before batch {1} of {2}. Confirmed: {3} of {4}." },
  stop: { es: "Detener tandas pendientes", en: "Stop pending batches" },
  complete: { es: "Envío terminado: {0} confirmado(s).", en: "Sending complete: {0} confirmed." },
  stopped: { es: "Tandas detenidas: {0} envío(s) confirmado(s). Revisa la Cola para aprobar los pendientes.", en: "Batches stopped: {0} send(s) confirmed. Review the queue to approve the remaining drafts." },
  attention: { es: "Envío detenido: {0} confirmado(s). Hay un error o resultado sin confirmar. Revisa los estados antes de volver a aprobar; no hubo reintento automático.", en: "Sending stopped: {0} confirmed. An error or unconfirmed outcome needs attention. Review statuses before approving again; no automatic retry was made." },
  version: { es: "La versión aprobada del correo cambió o no está disponible. Actualiza la Cola, revisa el mensaje y aprueba de nuevo. No se reintentará automáticamente.", en: "The approved email version changed or is unavailable. Refresh the queue, review the message and approve again. There is no automatic retry." },
  another: { es: "Hay un envío activo en otra pestaña de Fr8Bid. Espera a que termine.", en: "Another Fr8Bid tab is sending. Wait until it finishes." },
});
