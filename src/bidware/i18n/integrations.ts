import { translator } from "./language";

/** Copy del equipo; los valores de catálogo y datos del usuario se conservan. */
export const copy = {
  senderIdentity: { es: "Identidad de remitente", en: "Sender identity" },
  senderNotConfigured: { es: "Sin configurar", en: "Not configured" },
  "text001": {
    "es": "El servidor no devolvió la dirección de Google para conectar.",
    "en": "The server did not return the Google connection URL."
  },
  "text002": {
    "es": "{0} quedó conectado.",
    "en": "{0} is connected."
  },
  "text003": {
    "es": "No se pudo conectar {0}{1}",
    "en": "Could not connect {0}{1}"
  },
  "text004": {
    "es": "Sin conectar: los mensajes del Bid Room no llegan a Google Chat y no se ven las respuestas del equipo.",
    "en": "Not connected: Bid Room messages do not reach Google Chat and team replies are not visible."
  },
  "text005": {
    "es": "Conectado, pero sin espacio elegido: no hay dónde publicar.",
    "en": "Connected, but no space selected: there is nowhere to post."
  },
  "text006": {
    "es": "Publica en el espacio, pero no tiene permiso para leer las respuestas. Reconéctalo.",
    "en": "Posts to the space, but cannot read replies. Reconnect it."
  },
  "text007": {
    "es": "Publica los mensajes del Bid Room y trae las respuestas del equipo.",
    "en": "Posts Bid Room messages and retrieves team replies."
  },
  "text008": {
    "es": "Sin conectar. Nada saldrá por correo.",
    "en": "Not connected. No email will be sent."
  },
  "text009": {
    "es": "Google rechazó la renovación del token. Hay que reconectar.",
    "en": "Google rejected the token refresh. Reconnection is required."
  },
  "text010": {
    "es": "Estado: {0}.",
    "en": "Status: {0}."
  },
  "text011": {
    "es": "Listo para enviar.",
    "en": "Ready to send."
  },
  "text012": {
    "es": "vigente",
    "en": "valid"
  },
  "text013": {
    "es": "vencido hace {0} día(s) · se renueva solo al enviar",
    "en": "expired {0} day(s) ago · refreshed automatically when sending"
  },
  "text014": {
    "es": "Sin conexión de WhatsApp Business.",
    "en": "WhatsApp Business is not connected."
  },
  "text015": {
    "es": "desconocido",
    "en": "unknown"
  },
  "text016": {
    "es": "Meta marcó la calidad en ROJO. Los envíos se limitan.",
    "en": "Meta marked quality as RED. Sending is limited."
  },
  "text017": {
    "es": "Meta marcó la calidad en AMARILLO. Cuida el volumen.",
    "en": "Meta marked quality as YELLOW. Watch sending volume."
  },
  "text018": {
    "es": "Conectada y en calidad verde.",
    "en": "Connected with green quality."
  },
  "text019": {
    "es": "Listo",
    "en": "Ready"
  },
  "text020": {
    "es": "Atención",
    "en": "Attention"
  },
  "text021": {
    "es": "No usable",
    "en": "Unavailable"
  },
  "text022": {
    "es": "Desconocido",
    "en": "Unknown"
  },
  "text023": {
    "es": "Conectado",
    "en": "Connected"
  },
  "text024": {
    "es": "hoy {0}",
    "en": "today {0}"
  },
  "text025": {
    "es": "✓ configurado",
    "en": "✓ configured"
  },
  "text026": {
    "es": "falta",
    "en": "missing"
  },
  "text027": {
    "es": "Se abre Google para autorizar {0}. ",
    "en": "Google will open to authorize {0}. "
  },
  "text028": {
    "es": "el envío de correo",
    "en": "email sending"
  },
  "text029": {
    "es": "Inicia sesión con {0}: Google no acepta otra cuenta. Al terminar regresas a esta página.\n\n¿Continuar?",
    "en": "Sign in with {0}: Google does not accept another account. You will return to this page when finished. Continue?"
  },
  "text030": {
    "es": "la cuenta de ventas",
    "en": "the sales account"
  },
  "text031": {
    "es": "Integraciones",
    "en": "Integrations"
  },
  "text032": {
    "es": "Los canales por los que Fr8Bid envía y recibe: WhatsApp, Gmail y Google Chat",
    "en": "The channels Fr8Bid sends and receives through: WhatsApp, Gmail and Google Chat"
  },
  "text033": {
    "es": "Consultando…",
    "en": "Checking…"
  },
  "text034": {
    "es": "Refrescar estado",
    "en": "Refresh status"
  },
  "text035": {
    "es": "Integración heredada:",
    "en": "Shared integration:"
  },
  "text036": {
    "es": "Fr8Bid no configura canales aparte. Usa el mismo remitente, plantillas y webhooks ya conectados en el backend compartido. Los secretos nunca vuelven al navegador.",
    "en": "Fr8Bid uses the sender, templates and webhooks already connected in the shared backend. Secrets are never returned to the browser."
  },
  "text037": {
    "es": "Consultando canales…",
    "en": "Checking channels…"
  },
  "text038": {
    "es": "Línea viva: {0} · {1} · calidad {2}.",
    "en": "Active line: {0} · {1} · quality {2}."
  },
  "text039": {
    "es": "La prueba no confirmó la conexión.",
    "en": "The test did not confirm the connection."
  },
  "text040": {
    "es": "Probando…",
    "en": "Testing…"
  },
  "text041": {
    "es": "Probar línea",
    "en": "Test line"
  },
  "text042": {
    "es": "Se traerán las plantillas desde Meta y se actualizará lo que guardamos. ¿Continuar?",
    "en": "Templates will be fetched from Meta and the stored copies updated. Continue?"
  },
  "text043": {
    "es": "Plantillas sincronizadas desde Meta.",
    "en": "Templates synchronized from Meta."
  },
  "text044": {
    "es": "Sincronizando…",
    "en": "Synchronizing…"
  },
  "text045": {
    "es": "Sincronizar plantillas",
    "en": "Sync templates"
  },
  "text046": {
    "es": "Se volverá a verificar el webhook y se actualizará la conexión. ¿Continuar?",
    "en": "The webhook will be verified again and the connection updated. Continue?"
  },
  "text047": {
    "es": "Webhook verificado en {0}.",
    "en": "Webhook verified at {0}."
  },
  "text048": {
    "es": "el endpoint configurado",
    "en": "the configured endpoint"
  },
  "text049": {
    "es": "El webhook no quedó verificado; revisa el verify token.",
    "en": "The webhook was not verified; check the verify token."
  },
  "text050": {
    "es": "Verificando…",
    "en": "Verifying…"
  },
  "text051": {
    "es": "Verificar webhook",
    "en": "Verify webhook"
  },
  "text052": {
    "es": "Remitente",
    "en": "Sender"
  },
  "text053": {
    "es": "Nombre verificado",
    "en": "Verified name"
  },
  "text054": {
    "es": "oculto",
    "en": "hidden"
  },
  "text055": {
    "es": "verificado {0}",
    "en": "verified {0}"
  },
  "text056": {
    "es": "sin verificar",
    "en": "unverified"
  },
  "text057": {
    "es": "Modo ",
    "en": "Mode "
  },
  "text058": {
    "es": ": el token y el secreto de app los administra MARKSMAN a nivel plataforma, no esta organización. Que aparezcan ocultos aquí es lo esperado, no una falla.",
    "en": ": MARKSMAN manages the token and app secret at platform level. They are intentionally hidden here."
  },
  "text059": {
    "es": "Plantillas Meta",
    "en": "Meta templates"
  },
  "text060": {
    "es": "requeridas fuera de la ventana de 24 h",
    "en": "required outside the 24-hour window"
  },
  "text061": {
    "es": " · sincronizadas {0}{1}",
    "en": " · synchronized {0}{1}"
  },
  "text062": {
    "es": " · hace más de dos semanas",
    "en": " · more than two weeks ago"
  },
  "text063": {
    "es": "Cargando plantillas…",
    "en": "Loading templates…"
  },
  "text064": {
    "es": "Sin plantillas guardadas. Sincroniza desde Meta para traerlas.",
    "en": "No saved templates. Sync from Meta to fetch them."
  },
  "text065": {
    "es": "lista para envío automático",
    "en": "ready for automatic sending"
  },
  "text066": {
    "es": "bloquea envío automático en {0}",
    "en": "blocks automatic sending in {0}"
  },
  "text067": {
    "es": "Aviso",
    "en": "Note"
  },
  "text068": {
    "es": "Mientras Meta revisa una plantilla, el envío automático por WhatsApp en ese idioma queda en pausa; los borradores de correo siguen funcionando.",
    "en": "While Meta reviews a template, automatic WhatsApp sending in that language is paused; email drafts keep working."
  },
  "text069": {
    "es": "Grupos de WhatsApp",
    "en": "WhatsApp groups"
  },
  "text070": {
    "es": "El envío a grupos está encendido: un grupo con su ID de Meta queda listo y se envía desde la Cola de envío.",
    "en": "Group sending is on: a group with its Meta ID is ready and is sent from the delivery queue."
  },
  "text071": {
    "es": "El envío automático a grupos está apagado: abre o copia el mensaje del grupo y márcalo como enviado en la Cola de envío.",
    "en": "Automatic group sending is off: open or copy the group message and mark it as sent in the delivery queue."
  },
  "text072": {
    "es": "Buscando grupos…",
    "en": "Finding groups…"
  },
  "text073": {
    "es": "Grupo",
    "en": "Group"
  },
  "text074": {
    "es": "Abrir el Carrier CRM",
    "en": "Open Carrier CRM"
  },
  "text075": {
    "es": "{0}: verificado; sigue con envío manual.",
    "en": "{0}: verified; still sent manually."
  },
  "text076": {
    "es": "{0}: verificado y listo para envío automático.",
    "en": "{0}: verified and ready for automatic sending."
  },
  "text077": {
    "es": "Verificar grupo",
    "en": "Verify group"
  },
  "text078": {
    "es": "Ningún carrier tiene el grupo de WhatsApp como canal preferido. El grupo se captura en la ficha del carrier, en el ",
    "en": "No carrier has a WhatsApp group as its preferred channel. Set the group on the carrier card in "
  },
  "text079": {
    "es": "Marcar enviado manualmente",
    "en": "Mark as sent manually"
  },
  "text080": {
    "es": " se hace en la Cola de envío de cada evento, sobre el borrador del grupo.",
    "en": " is done on the group's draft in each event's Delivery queue."
  },
  "text081": {
    "es": "Buzón",
    "en": "Mailbox"
  },
  "text082": {
    "es": "Estado reportado",
    "en": "Reported status"
  },
  "text083": {
    "es": "cifrado",
    "en": "encrypted"
  },
  "text084": {
    "es": "Token de acceso",
    "en": "Access token"
  },
  "text085": {
    "es": "Rebotes sincronizados",
    "en": "Bounces synchronized"
  },
  "text086": {
    "es": "Sin sincronización registrada",
    "en": "No synchronization recorded"
  },
  "text087": {
    "es": "Último error",
    "en": "Last error"
  },
  "text088": {
    "es": "ninguno",
    "en": "none"
  },
  "text089": {
    "es": "Las invitaciones y avisos salen de este buzón. Los rebotes se sincronizan para no volver a escribir a correos inválidos.",
    "en": "Invitations and notices are sent from this mailbox. Bounces are synced so invalid addresses are not emailed again."
  },
  "text090": {
    "es": " Un token de acceso vencido es normal: duran una hora y el backend los renueva solo al enviar.",
    "en": " An expired access token is normal: tokens last one hour and the backend refreshes them when sending."
  },
  "text091": {
    "es": " Si Google revocó el permiso, todo el correo (invitaciones, avisos, cotizaciones) deja de salir hasta reconectar.",
    "en": " If Google revoked permission, all email (invitations, notices, quotes) stops until you reconnect."
  },
  "text092": {
    "es": "Abriendo Google…",
    "en": "Opening Google…"
  },
  "text093": {
    "es": "Conectar Gmail",
    "en": "Connect Gmail"
  },
  "text094": {
    "es": "Reconectar buzón",
    "en": "Reconnect mailbox"
  },
  "text095": {
    "es": "Rebotes: {0} avisos revisados, {1} nuevos, {2} correos suprimidos.",
    "en": "Bounces: {0} notices checked, {1} new, {2} email addresses suppressed."
  },
  "text096": {
    "es": "Sincronizar rebotes",
    "en": "Sync bounces"
  },
  "text097": {
    "es": "Correos rebotados",
    "en": "Bounced emails"
  },
  "text098": {
    "es": "Vas a DESCONECTAR el Gmail de ventas. Desde ese momento no sale ningún correo de Fr8Bid ni de rateware ",
    "en": "You are about to DISCONNECT sales Gmail. No email will be sent from Fr8Bid or rateware "
  },
  "text099": {
    "es": "(invitaciones, avisos, cotizaciones) hasta que alguien lo vuelva a conectar.\n\n¿Desconectar?",
    "en": "(invitations, notices, quotes) until someone reconnects it. Disconnect?"
  },
  "text100": {
    "es": "Gmail desconectado. No sale correo hasta reconectarlo.",
    "en": "Gmail disconnected. Email is paused until reconnection."
  },
  "text101": {
    "es": "Desconectar",
    "en": "Disconnect"
  },
  "text102": {
    "es": "Cuenta",
    "en": "Account"
  },
  "text103": {
    "es": "Espacio del Bid Room",
    "en": "Bid Room space"
  },
  "text104": {
    "es": "sin elegir",
    "en": "not selected"
  },
  "text105": {
    "es": "Lee las respuestas",
    "en": "Reads replies"
  },
  "text106": {
    "es": "sí",
    "en": "yes"
  },
  "text107": {
    "es": "Espacio donde se publican las conversaciones del Bid Room",
    "en": "Space where Bid Room conversations are posted"
  },
  "text108": {
    "es": "Elige un espacio…",
    "en": "Choose a space…"
  },
  "text109": {
    "es": "Espacio guardado: las conversaciones nuevas se publican ahí.",
    "en": "Space saved: new conversations will be posted there."
  },
  "text110": {
    "es": "Guardar espacio",
    "en": "Save space"
  },
  "text111": {
    "es": "Reconectar Google Chat",
    "en": "Reconnect Google Chat"
  },
  "text112": {
    "es": "Conectar Google Chat",
    "en": "Connect Google Chat"
  },
  "text113": {
    "es": "Cambiar espacio",
    "en": "Change space"
  },
  "text114": {
    "es": "Reintentados {0}: {1} publicados, {2} fallaron{3}.",
    "en": "Retried {0}: {1} posted, {2} failed{3}."
  },
  "text115": {
    "es": ", {0} omitidos",
    "en": ", {0} skipped"
  },
  "text116": {
    "es": "No había mensajes pendientes: todo lo del Bid Room ya está en Google Chat.",
    "en": "No pending messages: all Bid Room messages are already in Google Chat."
  },
  "text117": {
    "es": "Reintentando…",
    "en": "Retrying…"
  },
  "text118": {
    "es": "Reintentar pendientes",
    "en": "Retry pending"
  },
  "text119": {
    "es": "Vas a DESCONECTAR Google Chat. Las conversaciones del Bid Room dejan de publicarse en el espacio del equipo ",
    "en": "You are about to DISCONNECT Google Chat. Bid Room conversations will stop being posted to the team space "
  },
  "text120": {
    "es": "y ya no se traen sus respuestas hasta reconectarlo.\n\n¿Desconectar?",
    "en": "and replies will not be retrieved until reconnection. Disconnect?"
  },
  "text121": {
    "es": "Google Chat desconectado.",
    "en": "Google Chat disconnected."
  },
  "text122": {
    "es": "Reintentar",
    "en": "Retry"
  },
  "text123": {
    "es": " vuelve a publicar en el espacio los mensajes del Bid Room que no llegaron (hasta 50); a los carriers no les llega nada.",
    "en": " reposts undelivered Bid Room messages to the space (up to 50); nothing is sent to carriers."
  },
  "text124": {
    "es": "Aprobación",
    "en": "Approval"
  },
  "text125": {
    "es": "Aunque los tres canales estén conectados, nada se envía sin tu aprobación en la Cola de envío. Los secretos nunca se muestran: solo se indica si están configurados.",
    "en": "Even with all three channels connected, nothing is sent without your approval in the delivery queue. Secrets are never shown: only whether they are configured."
  },
  "text126": { "es": "Calidad", "en": "Quality" },
  "text127": { "es": "ID del número", "en": "Phone number ID" },
  "text128": { "es": "Secreto de la app", "en": "App secret" },
  "text129": { "es": "Token del webhook", "en": "Webhook token" },
  "text130": { "es": "Envío automático", "en": "Automatic sending" },
  "text131": { "es": "Envío manual", "en": "Manual sending" },
  "text132": { "es": "Aprobada", "en": "Approved" },
  "text133": { "es": "En revisión", "en": "In review" },
  "text134": { "es": "Rechazada", "en": "Rejected" },
  "text135": { "es": "Pausada", "en": "Paused" },
  "text136": { "es": "Manual", "en": "Manual" },
  "text137": { "es": "Automático", "en": "Automatic" },
  "text138": { "es": "Verificado", "en": "Verified" },
  "text139": { "es": "Bloqueado", "en": "Blocked" }
};

export const tr = translator(copy);
