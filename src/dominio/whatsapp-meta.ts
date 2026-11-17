// Intento/recordatorio por WhatsApp con la plantilla de Meta de Rateware (rateware PR #215).
// Rateware rellena la plantilla, revalida número, «no contactar», base de permiso y plantilla
// APROBADA contra Meta, y no repite el mismo recordatorio (participación + ventana). Aquí solo se
// decide si está listo y se arma la misma vista previa; la liga privada nunca pasa por Fr8Bid.

import type { IntentoWhatsapp } from "./seguimiento.js";
import type { Detalle } from "./tipos.js";

export const PLANTILLA_RECORDATORIO = {
  nombre: "rateware_rfx_reminder_es",
  idioma: "es_MX",
  categoria: "UTILITY",
  cuerpo: "Hola {{1}}, te recordamos que la solicitud de cotización {{2}} cierra el {{3}}. Si aún no has enviado tu tarifa, puedes hacerlo aquí: {{4}}\nGracias, MARKSMAN."
} as const;

/** Lo que va en {{4}} en la vista previa: Rateware pone la liga existente del Bid Room del carrier. */
export const LIGA_PRIVADA = "[liga privada del Bid Room del carrier; la pone Rateware]";

export const MENSAJE_PLANTILLA_PENDIENTE = `Plantilla de recordatorio pendiente de aprobación en Meta (${PLANTILLA_RECORDATORIO.nombre}).`;

// 4º intento de la cadencia y, con fr8bid#72 (respondió sin tarifa), los avisos 48 h / 24 h antes del cierre.
export type VentanaRecordatorio = "intento_4" | "48h" | "24h";
export const VENTANA_RATEWARE: Record<VentanaRecordatorio, string> = { intento_4: "attempt_4", "48h": "48h", "24h": "24h" };

/** «31/12/2026 a las 23:59 (hora CDMX)»: el evento cierra el día del plazo a las 23:59 de México. */
export function cierreCdmx(plazo: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(plazo ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]} a las 23:59 (hora CDMX)` : "";
}

/** {{1}}..{{3}} como los arma Rateware: nombre del carrier, «evento (folio)» y cierre en CDMX. */
export function variablesRecordatorio(d: Detalle, carrier: string): [string, string, string] {
  const evento = [d.evento.nombre, d.evento.folio ? `(${d.evento.folio})` : ""].filter(Boolean).join(" ");
  return [carrier, evento, cierreCdmx(d.evento.plazo)];
}

export function textoRecordatorio(variables: readonly string[], liga = LIGA_PRIVADA): string {
  const valores = [...variables.slice(0, 3), liga];
  return PLANTILLA_RECORDATORIO.cuerpo.replace(/\{\{(\d)\}\}/g, (_m, i) => valores[Number(i) - 1] ?? "");
}

export interface EstadoPlantilla { aprobada: boolean; estado: string }

/** Estado de la plantilla en los mappings de Rateware (list_outreach_templates → whatsapp_meta). */
export function estadoPlantilla(filas: unknown): EstadoPlantilla {
  const rows = Array.isArray(filas) ? filas as Record<string, any>[] : [];
  const metas = rows.map(r => r?.whatsapp_meta).filter((m): m is Record<string, any> => !!m && m.meta_template_name === PLANTILLA_RECORDATORIO.nombre);
  const aprobada = metas.some(m => String(m.meta_template_status ?? "").toUpperCase() === "APPROVED" && m.meta_template_language === PLANTILLA_RECORDATORIO.idioma);
  return { aprobada, estado: aprobada ? "APPROVED" : String(metas[0]?.meta_template_status ?? "NO_REGISTRADA").toUpperCase() };
}

/** Rateware solo manda a un número con lada internacional explícita (E.164); nunca la infiere. */
export const e164Explicito = (valor: string | null | undefined) => /^\+[1-9]\d{7,14}$/.test(String(valor ?? "").trim());

/** «+52 •••• ••5678»: el destinatario se muestra enmascarado en la vista previa. */
export function enmascarar(numero: string | null | undefined): string | null {
  const d = String(numero ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  const lada = d.startsWith("1") ? "1" : d.slice(0, 2);
  return `+${lada} •••• ••${d.slice(-4)}`;
}

export interface BloqueoMeta { codigo: "no_contactar" | "sin_numero" | "numero_dudoso" | "sin_permiso" | "permiso_no_verificado" | "plantilla_no_aprobada" | "plantilla_no_verificada"; motivo: string }
const PERMISOS = new Set(["consent", "contractual", "manual"]);

/**
 * Por qué no se puede mandar por Meta (vacío = listo). permiso: base de WhatsApp del carrier en Rateware
 * (undefined = no se pudo leer); plantilla: null = no se pudo leer.
 */
export function bloqueosMeta(w: IntentoWhatsapp, permiso: string | null | undefined, plantilla: EstadoPlantilla | null): BloqueoMeta[] {
  const b: BloqueoMeta[] = [];
  const crudo = String(w.s.whatsapp ?? "").trim();
  if (w.s.whatsappNoContactar) b.push({ codigo: "no_contactar", motivo: "Marcado «no contactar por WhatsApp» en Rateware." });
  else if (!crudo) b.push({ codigo: "sin_numero", motivo: "Sin número de WhatsApp en Rateware." });
  else if (w.telefono.certeza === "dudoso" || !w.numero) b.push({ codigo: "numero_dudoso", motivo: `Número dudoso: ${w.telefono.motivo}` });
  else if (!e164Explicito(crudo) || crudo.replace(/\D/g, "") !== w.numero) b.push({ codigo: "numero_dudoso", motivo: "El número en Rateware no tiene lada internacional explícita (+52/+1): corrígelo en Rateware antes de mandarlo por Meta." });
  if (permiso === undefined) b.push({ codigo: "permiso_no_verificado", motivo: "No se pudo leer la base de permiso de WhatsApp del carrier." });
  else if (!PERMISOS.has(String(permiso ?? ""))) b.push({ codigo: "sin_permiso", motivo: "El carrier no tiene base de permiso para WhatsApp en Rateware (consentimiento, contractual o manual)." });
  if (!plantilla) b.push({ codigo: "plantilla_no_verificada", motivo: "No se pudo leer el estado de la plantilla en Rateware." });
  else if (!plantilla.aprobada) b.push({ codigo: "plantilla_no_aprobada", motivo: MENSAJE_PLANTILLA_PENDIENTE });
  return b;
}

/** ¿Rateware ya tiene ese recordatorio (enviado o en curso)? Llave de rateware PR #215: participación + ventana. */
export function recordatorioYaEnviado(mensajes: unknown, eventoId: string, carrierId: string, ventana: VentanaRecordatorio): boolean {
  const llave = `rfx_reminder:${eventoId}:${carrierId}:${VENTANA_RATEWARE[ventana]}`.toLowerCase();
  return (Array.isArray(mensajes) ? mensajes as Record<string, any>[] : []).some(m => m?.channel === "whatsapp" && m.status !== "archived" && m.status !== "drafted"
    && String(m.metadata?.whatsapp_reminder_key ?? "").toLowerCase() === llave);
}
