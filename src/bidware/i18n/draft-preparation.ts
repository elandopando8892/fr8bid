import { translator } from "./language";

export const draftPreparationText = translator({
  title: { es: "Resultado de preparación", en: "Draft preparation result" },
  campaign: { es: "Confirmando la campaña antes de preparar los canales…", en: "Confirming the campaign before preparing channels…" },
  campaignUnconfirmed: { es: "No se pudo confirmar la campaña. No se solicitó la preparación de ningún canal.", en: "The campaign could not be confirmed. No channel preparation was requested." },
  running: { es: "Preparando…", en: "Preparing…" },
  waiting: { es: "No iniciado", en: "Not started" },
  confirmed: { es: "Confirmado", en: "Confirmed" },
  unconfirmed: { es: "Sin confirmar", en: "Unconfirmed" },
  rejected: { es: "Requiere revisión", en: "Review required" },
  counts: { es: "{0} preparados · {1} omisiones", en: "{0} prepared · {1} skipped" },
  complete: { es: "Preparación completada. Revisa los borradores en la Cola antes de aprobar un envío.", en: "Preparation completed. Review the drafts in the queue before approving a send." },
  zero: { es: "Ningún borrador preparado. Revisa las omisiones y los registros existentes en la Cola.", en: "No drafts prepared. Review skipped entries and existing records in the queue." },
  stopped: { es: "Preparación detenida. Se conserva lo confirmado. Comprueba el estado en la Cola antes de iniciar otro intento.", en: "Preparation stopped. Confirmed results are retained. Check the queue before starting another attempt." },
  unknownHelp: { es: "La respuesta no confirma el resultado. Puede haber borradores guardados.", en: "The response does not confirm the outcome. Drafts may have been saved." },
  audience: { es: "La selección o su revisión cambió: este canal no se preparó. Revisa los contactos.", en: "The selection or its review changed: this channel was not prepared. Review the contacts." },
  scope: { es: "Sólo se preparan borradores; aquí no se envía. Este resumen corresponde al intento en esta pantalla. Al salir o recargar, consulta la Cola para comprobar los registros.", en: "Only drafts are prepared; nothing is sent here. This summary covers the attempt on this screen. After leaving or reloading, check the queue to verify the records." },
  queue: { es: "Comprobar en Cola de envío →", en: "Check delivery queue →" },
});
