import { getLang } from "./language";

const copy: Record<string, { es: string; en: string }> = {
  "Modelo Logístico": {
    "es": "Modelo Logístico",
    "en": "Logistics Model"
  },
  "Criterios de Operación": {
    "es": "Criterios de Operación",
    "en": "Operating Criteria"
  },
  "Reglas de Negocio": {
    "es": "Reglas de Negocio",
    "en": "Business Rules"
  },
  "Especificaciones de Servicio": {
    "es": "Especificaciones de Servicio",
    "en": "Service Specifications"
  },
  "Perfil de Transportista": {
    "es": "Perfil de Transportista",
    "en": "Carrier Profile"
  },
  "Otras Notas": {
    "es": "Otras Notas",
    "en": "Other Notes"
  },
  "De acuerdo": {
    "es": "De acuerdo",
    "en": "Agreed"
  },
  "Con excepción": {
    "es": "Con excepción",
    "en": "With exception"
  },
  "No puedo": {
    "es": "No puedo",
    "en": "Cannot comply"
  },
  "No aplica": {
    "es": "No aplica",
    "en": "Not applicable"
  },
  "Primario": {
    "es": "Primario",
    "en": "Primary"
  },
  "Respaldo": {
    "es": "Respaldo",
    "en": "Backup"
  },
  "Tipo de camión": {
    "es": "Tipo de camión",
    "en": "Truck type"
  },
  "Tipo de equipo": {
    "es": "Tipo de equipo",
    "en": "Equipment type"
  },
  "Configuración": {
    "es": "Configuración",
    "en": "Configuration"
  },
  "Operación": {
    "es": "Operación",
    "en": "Operation"
  },
  "Servicio": {
    "es": "Servicio",
    "en": "Service"
  }
};
export const domainLabel = (value: string) => copy[value]?.[getLang()] ?? value;
