import { translator } from "./language";

const copy = {
  review: { es: "Revisar mensaje", en: "Review message" },
  title: { es: "Mensaje guardado", en: "Stored message" },
  readOnly: { es: "Revisar no envía. Cierra esta vista y aprueba el envío desde la Cola.", en: "Reviewing does not send. Close this view and approve sending from the queue." },
  whatsappTemplate: { es: "Plantilla · idioma · categoría", en: "Template · language · category" },
  whatsappExpires: { es: "Revisión válida hasta", en: "Review valid until" },
  whatsappExact: { es: "Este es el texto de la plantilla con los datos del destinatario. Si cambia el mensaje, el remitente o la plantilla, deberás revisarlo de nuevo.", en: "This is the template text with the recipient's data. If the message, sender or template changes, you must review it again." },
  whatsappBody: { es: "Contenido que se enviaría por WhatsApp", en: "Content that would be sent through WhatsApp" },
  whatsappReceipt: { es: "Contenido conservado del intento de envío. La aceptación del proveedor no confirma entrega ni lectura. Esta vista no permite reenviarlo.", en: "Stored content from the send attempt. Provider acceptance does not confirm delivery or reading. This view cannot resend it." },
  whatsappUnavailable: { es: "No hay una revisión vigente para enviar este WhatsApp. Revisa la conexión, el teléfono con código de país, el permiso de contacto y la plantilla aprobada. Los mensajes enviados o sin confirmar no se pueden volver a aprobar aquí.", en: "There is no current review for sending this WhatsApp message. Check the connection, phone with country code, contact permission and approved template. Sent or unconfirmed messages cannot be approved again here." },
  whatsappReviewFirst: { es: "Revisa el contenido de WhatsApp antes de aprobar. La revisión vence a los 15 minutos.", en: "Review the WhatsApp content before approving. The review expires after 15 minutes." },
  whatsappRefresh: { es: "La revisión de WhatsApp venció, cambió o no está disponible. Actualiza la Cola, revisa el contenido y aprueba de nuevo. No hubo reintento automático.", en: "The WhatsApp review expired, changed or is unavailable. Refresh the queue, review the content and approve again. There was no automatic retry." },
  carrier: { es: "Carrier", en: "Carrier" },
  from: { es: "Remitente", en: "Sender" },
  to: { es: "Destinatario", en: "Recipient" },
  subject: { es: "Asunto", en: "Subject" },
  status: { es: "Estado guardado", en: "Stored status" },
  preview: { es: "Contenido guardado del correo", en: "Stored email content" },
  text: { es: "Ver texto guardado", en: "View stored text" },
  empty: { es: "No hay contenido guardado.", en: "No stored content." },
  missing: { es: "Este mensaje ya no está disponible en el evento. Actualiza la Cola.", en: "This message is no longer available in this event. Refresh the queue." },
  remote: { es: "Vista de lectura: imágenes externas y enlaces desactivados. El mensaje guardado no cambia.", en: "Read-only view: external images and links disabled. The stored message is unchanged." },
  drafted: { es: "Borrador", en: "Draft" },
  queued: { es: "En cola", en: "Queued" },
  sending: { es: "En curso", en: "Sending" },
  sent: { es: "Enviado", en: "Sent" },
  delivered: { es: "Entregado", en: "Delivered" },
  read: { es: "Leído", en: "Read" },
  manual_sent: { es: "Enviado manualmente", en: "Manually sent" },
  replied: { es: "Respondido", en: "Replied" },
  quoted: { es: "Cotizado", en: "Quoted" },
  suppressed: { es: "Suprimido", en: "Suppressed" },
  failed: { es: "Falló", en: "Failed" },
  bounced: { es: "Rebotó", en: "Bounced" },
  archived: { es: "Archivado", en: "Archived" },
  delivery_unknown: { es: "Sin confirmar", en: "Unconfirmed" },
};
export const tr = translator(copy);
export function storedStatus(status: string | null | undefined) {
  return status && Object.prototype.hasOwnProperty.call(copy, status) ? tr(status as keyof typeof copy) : status || "—";
}
