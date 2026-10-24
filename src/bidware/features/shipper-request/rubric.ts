/**
 * rateware's RFI questionnaire by operating segment (src/customer-rfi.js:
 * SEGMENT_OPTIONS, LOGISTICS_MODEL_ITEMS, CHECKLIST_GROUPS,
 * SEGMENT_RUBRIC_MINIMUMS, SEGMENT_RUBRIC_DETAIL_LIBRARY and
 * RFI_RUBRIC_RESPONSE_CATALOGS), with the keys rateware's own form stores, so
 * an answer given here is the same checklist item there. Answers keep the
 * list's own value; the Spanish and English texts only translate it.
 *
 * Built from rateware's source as of 2026-09-26. Keep the keys as rateware
 * writes them (detail rows: detail_<segment>_<category>_<label>); a text can
 * be reworded here, a key can't.
 */
import type { CatalogOption } from "./catalog";
import type { Lang } from "./request.model";

export type RubricCategory =
  | "logistics_model"
  | "operation_criteria"
  | "business_rules"
  | "service_specifications"
  | "carrier_requirements"
  | "other_notes";

export type ResponseCatalog = "response_default" | "response_yes_no" | "response_load_model" | "response_tracking" | "response_update_frequency" | "response_payment_terms" | "response_currency" | "response_fuel" | "response_driver" | "response_trailer" | "response_temperature" | "response_carrier_type" | "response_compliance";

export interface RubricText {
  label: string;
  question: string;
  expected: string;
}

export interface RubricRow {
  key: string;
  category: RubricCategory;
  /** The answer list rateware offers for this question. */
  catalog: ResponseCatalog;
  es: RubricText;
  en: RubricText;
}

export interface RubricGroup {
  key: RubricCategory;
  es: { title: string; help: string };
  en: { title: string; help: string };
  rows: RubricRow[];
}

const option = (value: string, es: string, en = value): CatalogOption => ({ value, es, en });
const r = (key: string, category: RubricCategory, catalog: ResponseCatalog, es: [string, string, string], en: [string, string, string]): RubricRow => ({
  key,
  category,
  catalog,
  es: { label: es[0], question: es[1], expected: es[2] },
  en: { label: en[0], question: en[1], expected: en[2] },
});

/** Operating segments (SEGMENT_OPTIONS). */
export const SEGMENTS: CatalogOption[] = [
  option("local_ftl", "FTL local", "Local FTL"),
  option("regional_ftl", "FTL regional", "Regional FTL"),
  option("national_ftl", "FTL nacional", "National FTL"),
  option("crossborder", "FTL transfronterizo", "Crossborder FTL"),
  option("expedited", "Terrestre expeditado", "Expedited Ground"),
  option("time_critical", "Terrestre de tiempo crítico", "Time Critical Ground"),
  option("port_drayage_us", "Drayage portuario US", "Port Drayage US"),
  option("port_drayage_mx", "Drayage portuario MX", "Port Drayage MX"),
];
export const SEGMENT_KEYS = SEGMENTS.map((segment) => segment.value);

export const segmentLabel = (segment: string, lang: Lang) => SEGMENTS.find((entry) => entry.value === segment)?.[lang] ?? segment;

export const MODEL_TITLE = { es: "Modelo Logístico por Segmento Operativo", en: "Logistics Model by Operating Segment" };

/** Sections C–G: the same questions for every segment. */
export const GENERAL_GROUPS: RubricGroup[] = [
  {
    key: "operation_criteria",
    es: { title: "Criterios de Operación", help: "Documenta cómo debe ejecutarse el servicio." },
    en: { title: "Operating Criteria", help: "Document how the service must be executed." },
    rows: [
      r("c_pickup_window", "operation_criteria", "response_default", ["Ventana de pickup", "¿Cuál es la ventana de recogida?", "Hora inicio / fin"], ["Pickup window", "What is the pickup window?", "Start / end time"]),
      r("c_delivery_window", "operation_criteria", "response_load_model", ["Ventana de delivery", "¿Cuál es la ventana de entrega?", "Hora inicio / fin"], ["Delivery window", "What is the delivery window?", "Start / end time"]),
      r("c_appointment_required", "operation_criteria", "response_yes_no", ["Cita requerida", "¿Se requiere cita? ¿Quién agenda?", "Sí / No / quién agenda"], ["Appointment required", "Is an appointment required? Who schedules it?", "Yes / No / who schedules"]),
      r("c_loading_type", "operation_criteria", "response_load_model", ["Tipo de carga", "¿Cómo se carga?", "Live / Drop / Preload"], ["Loading type", "How is it loaded?", "Live / Drop / Preload"]),
      r("c_unloading_type", "operation_criteria", "response_load_model", ["Tipo de descarga", "¿Cómo se descarga?", "Live / Drop / Drop & hook"], ["Unloading type", "How is it unloaded?", "Live / Drop / Drop & hook"]),
      r("c_loading_time", "operation_criteria", "response_load_model", ["Tiempo de carga", "¿Cuánto tarda la carga?", "Horas"], ["Loading time", "How long does loading take?", "Hours"]),
      r("c_unloading_time", "operation_criteria", "response_load_model", ["Tiempo de descarga", "¿Cuánto tarda la descarga?", "Horas"], ["Unloading time", "How long does unloading take?", "Hours"]),
      r("c_operational_contact", "operation_criteria", "response_default", ["Contacto operativo", "¿Quién coordina la operación?", "Nombre / teléfono / email"], ["Operations contact", "Who coordinates the operation?", "Name / phone / email"]),
      r("c_site_instructions", "operation_criteria", "response_default", ["Instrucciones de sitio", "¿Qué instrucciones debe seguir el carrier?", "Texto"], ["Site instructions", "What instructions must the carrier follow?", "Text"]),
      r("c_access_rules", "operation_criteria", "response_yes_no", ["Reglas de acceso", "¿Qué reglas de acceso aplican?", "Texto / checklist"], ["Access rules", "What access rules apply?", "Text / checklist"]),
      r("c_tracking_requirement", "operation_criteria", "response_tracking", ["Requerimiento de tracking", "¿Qué tracking exige el cliente?", "GPS / check calls / ambos"], ["Tracking requirement", "What tracking does the customer require?", "GPS / check calls / both"]),
      r("c_update_frequency", "operation_criteria", "response_update_frequency", ["Frecuencia de updates", "¿Cada cuánto se debe actualizar?", "Cada 1h / 2h / 4h / por hito"], ["Update frequency", "How often must it be updated?", "Every 1h / 2h / 4h / per milestone"]),
      r("c_escalation", "operation_criteria", "response_default", ["Escalamiento", "¿Cómo se escala una excepción?", "Contacto / SLA / canal"], ["Escalation", "How is an exception escalated?", "Contact / SLA / channel"]),
    ],
  },
  {
    key: "business_rules",
    es: { title: "Reglas de Negocio", help: "Documenta condiciones que afectan margen, riesgo y ejecución." },
    en: { title: "Business Rules", help: "Document conditions that affect margin, risk and execution." },
    rows: [
      r("d_payment_terms", "business_rules", "response_payment_terms", ["Términos de pago", "¿Qué términos de pago aplican?", "Net 15 / 30 / 45 / otro"], ["Payment terms", "What payment terms apply?", "Net 15 / 30 / 45 / other"]),
      r("d_currency", "business_rules", "response_currency", ["Moneda", "¿En qué moneda debe cotizarse?", "MXN / USD"], ["Currency", "In what currency must it be quoted?", "MXN / USD"]),
      r("d_fuel_surcharge", "business_rules", "response_fuel", ["Recargo por combustible", "¿Cómo se maneja fuel?", "Incluido / indexado / separado"], ["Fuel surcharge", "How is fuel handled?", "Included / indexed / separate"]),
      r("d_detention", "business_rules", "response_default", ["Detention", "¿Cuál es el free time y tarifa?", "Tiempo libre + tarifa"], ["Detention", "What is the free time and rate?", "Free time + rate"]),
      r("d_layover", "business_rules", "response_yes_no", ["Layover", "¿Cuándo aplica y cuánto cuesta?", "Condición + tarifa"], ["Layover", "When does it apply and how much does it cost?", "Condition + rate"]),
      r("d_tonu", "business_rules", "response_yes_no", ["TONU", "¿Cuándo aplica y cuánto cuesta?", "Condición + tarifa"], ["TONU", "When does it apply and how much does it cost?", "Condition + rate"]),
      r("d_redelivery", "business_rules", "response_load_model", ["Redelivery", "¿Aplica redelivery?", "Aplica / no aplica"], ["Redelivery", "Does redelivery apply?", "Applies / does not apply"]),
      r("d_border_wait", "business_rules", "response_default", ["Espera en frontera", "¿Quién paga espera en frontera y desde cuándo?", "Responsable, gatillo y tarifa"], ["Border wait", "Who pays for border wait and starting when?", "Responsible party, trigger and rate"]),
      r("d_cancellation", "business_rules", "response_default", ["Cancelación", "¿Cuál es el plazo y cargo?", "Plazo y cargo"], ["Cancellation", "What is the notice period and fee?", "Notice period and fee"]),
      r("d_claims", "business_rules", "response_default", ["Claims", "¿Cómo se procesan claims?", "Proceso, tiempos, documentación"], ["Claims", "How are claims processed?", "Process, timelines, documentation"]),
      r("d_insurance", "business_rules", "response_yes_no", ["Seguro", "¿Qué seguro se requiere?", "Cargo value, liability, requerimientos especiales"], ["Insurance", "What insurance is required?", "Cargo value, liability, special requirements"]),
      r("d_penalties", "business_rules", "response_load_model", ["Penalizaciones", "¿Qué penalizaciones aplican?", "Late pickup, late delivery, no show"], ["Penalties", "What penalties apply?", "Late pickup, late delivery, no-show"]),
    ],
  },
  {
    key: "service_specifications",
    es: { title: "Especificaciones de Servicio", help: "Define el estándar operativo requerido." },
    en: { title: "Service Specifications", help: "Define the required operating standard." },
    rows: [
      r("e_equipment", "service_specifications", "response_trailer", ["Equipo", "¿Qué tipo de unidad se requiere?", "Tipo, largo, edad, configuración"], ["Equipment", "What type of truck is required?", "Type, length, age, configuration"]),
      r("e_driver", "service_specifications", "response_driver", ["Driver", "¿Qué tipo de driver aplica?", "Single / team / B1 / hazmat"], ["Driver", "What type of driver applies?", "Single / team / B1 / hazmat"]),
      r("e_trailer", "service_specifications", "response_temperature", ["Trailer", "¿Qué trailer se requiere?", "Dry van, reefer, flatbed, specialized"], ["Trailer", "What trailer is required?", "Dry van, reefer, flatbed, specialized"]),
      r("e_temperature", "service_specifications", "response_temperature", ["Temperatura", "¿Requiere temperatura controlada?", "Rango y tolerancia"], ["Temperature", "Is temperature control required?", "Range and tolerance"]),
      r("e_seals", "service_specifications", "response_default", ["Sellos", "¿Se requieren sellos?", "Requeridos / tipo"], ["Seals", "Are seals required?", "Required / type"]),
      r("e_security", "service_specifications", "response_tracking", ["Seguridad", "¿Qué protocolo de seguridad aplica?", "GPS, rutas, paradas autorizadas"], ["Security", "What security protocol applies?", "GPS, routes, authorized stops"]),
      r("e_documents", "service_specifications", "response_yes_no", ["Documentos", "¿Qué documentos son obligatorios?", "BOL, POD, packing list, invoice, pedimento, Carta Porte"], ["Documents", "What documents are mandatory?", "BOL, POD, packing list, invoice, pedimento, Carta Porte"]),
      r("e_pod", "service_specifications", "response_default", ["POD", "¿Cuándo debe entregarse el POD?", "Tiempo máximo de entrega"], ["POD", "When must the POD be submitted?", "Maximum submission time"]),
      r("e_tracking", "service_specifications", "response_tracking", ["Tracking", "¿Cómo se debe compartir tracking?", "GPS link / ELD / app / check call"], ["Tracking", "How must tracking be shared?", "GPS link / ELD / app / check call"]),
      r("e_communication", "service_specifications", "response_default", ["Comunicación", "¿Qué canal se usará?", "TMS / email / WhatsApp / teléfono"], ["Communication", "What channel will be used?", "TMS / email / WhatsApp / phone"]),
      r("e_reports", "service_specifications", "response_default", ["Reportes", "¿Qué reportes requiere el cliente?", "Diario / por evento / dashboard"], ["Reports", "What reports does the customer require?", "Daily / per event / dashboard"]),
    ],
  },
  {
    key: "carrier_requirements",
    es: { title: "Perfil Requerido del Carrier", help: "Define qué tipo de carrier acepta el cliente." },
    en: { title: "Required Carrier Profile", help: "Define what type of carrier the customer accepts." },
    rows: [
      r("f_carrier_type", "carrier_requirements", "response_carrier_type", ["Tipo de carrier", "¿Qué tipo de carrier acepta el cliente?", "Asset-based / broker / 3PL / mixto"], ["Carrier type", "What type of carrier does the customer accept?", "Asset-based / broker / 3PL / mixed"]),
      r("f_mc_dot", "carrier_requirements", "response_default", ["MC/DOT", "¿Debe usar autoridad propia?", "Propio / partner / no requerido"], ["MC/DOT", "Must the carrier use its own authority?", "Own / partner / not required"]),
      r("f_mx_permits", "carrier_requirements", "response_yes_no", ["Permisos MX", "¿Requiere permisos mexicanos?", "Requeridos / no requeridos"], ["MX permits", "Are Mexican permits required?", "Required / not required"]),
      r("f_mx_us_experience", "carrier_requirements", "response_default", ["Experiencia MX-US", "¿Qué experiencia crossborder se requiere?", "Básica / comprobable / obligatoria"], ["MX-US experience", "What cross-border experience is required?", "Basic / verifiable / mandatory"]),
      r("f_owned_fleet", "carrier_requirements", "response_default", ["Flota propia", "¿Debe tener flota propia?", "Sí / no / preferente"], ["Own fleet", "Must the carrier have its own fleet?", "Yes / no / preferred"]),
      r("f_cargo_insurance", "carrier_requirements", "response_yes_no", ["Seguro cargo", "¿Cuál es el monto mínimo?", "Monto mínimo"], ["Cargo insurance", "What is the minimum amount?", "Minimum amount"]),
      r("f_liability_insurance", "carrier_requirements", "response_yes_no", ["Seguro liability", "¿Cuál es el monto mínimo?", "Monto mínimo"], ["Liability insurance", "What is the minimum amount?", "Minimum amount"]),
      r("f_gps", "carrier_requirements", "response_tracking", ["GPS", "¿GPS es obligatorio?", "Obligatorio / preferente"], ["GPS", "Is GPS mandatory?", "Mandatory / preferred"]),
      r("f_certifications", "carrier_requirements", "response_yes_no", ["Certificaciones", "¿Qué certificaciones aplican?", "CTPAT / FAST / OEA / Hazmat"], ["Certifications", "What certifications apply?", "CTPAT / FAST / OEA / Hazmat"]),
      r("f_prior_approval", "carrier_requirements", "response_default", ["Aprobación previa", "¿Requiere aprobación previa?", "Sí / no"], ["Prior approval", "Is prior approval required?", "Yes / no"]),
      r("f_blocked_carriers", "carrier_requirements", "response_default", ["Carrier vetado", "¿Hay carriers vetados?", "Lista"], ["Blocked carrier", "Are there any blocked carriers?", "List"]),
      r("f_preferred_carriers", "carrier_requirements", "response_default", ["Carrier preferido", "¿Hay carriers preferidos?", "Lista"], ["Preferred carrier", "Are there any preferred carriers?", "List"]),
    ],
  },
  {
    key: "other_notes",
    es: { title: "Notas y Excepciones Operativas", help: "Estructura restricciones, excepciones y riesgos conocidos." },
    en: { title: "Operational Notes and Exceptions", help: "Structure known restrictions, exceptions and risks." },
    rows: [
      r("g_site_restriction", "other_notes", "response_default", ["Restricción de sitio", "¿Hay restricciones de sitio?", "No entrada antes de las 7:00"], ["Site restriction", "Are there site restrictions?", "No entry before 7:00"]),
      r("g_carrier_restriction", "other_notes", "response_carrier_type", ["Restricción de carrier", "¿Hay restricciones por tipo de carrier?", "No brokers, solo asset-based"], ["Carrier restriction", "Are there restrictions by carrier type?", "No brokers, asset-based only"]),
      r("g_document_restriction", "other_notes", "response_yes_no", ["Restricción documental", "¿Hay documentos obligatorios?", "POD sellado obligatorio"], ["Documentation restriction", "Are there mandatory documents?", "Stamped POD mandatory"]),
      r("g_security_restriction", "other_notes", "response_default", ["Restricción de seguridad", "¿Hay reglas de seguridad?", "No paradas en ruta"], ["Security restriction", "Are there security rules?", "No stops en route"]),
      r("g_crossborder_restriction", "other_notes", "response_default", ["Restricción crossborder", "¿Hay frontera obligatoria?", "Solo cruce por Laredo"], ["Cross-border restriction", "Is there a mandatory border crossing?", "Laredo crossing only"]),
      r("g_financial_restriction", "other_notes", "response_default", ["Restricción financiera", "¿Hay reglas de aprobación financiera?", "No accessorial sin aprobación"], ["Financial restriction", "Are there financial approval rules?", "No accessorials without approval"]),
      r("g_season_exception", "other_notes", "response_default", ["Excepción por temporada", "¿Hay estacionalidad?", "Volumen sube en Q4"], ["Seasonal exception", "Is there seasonality?", "Volume rises in Q4"]),
      r("g_known_risk", "other_notes", "response_default", ["Riesgo conocido", "¿Qué riesgo debe conocer procurement?", "Congestión en destino"], ["Known risk", "What risk should procurement be aware of?", "Congestion at destination"]),
    ],
  },
];

/** Section B: the segment's logistics model. */
const MODEL: Record<string, RubricRow[]> = {
  local_ftl: [
    r("b_local", "logistics_model", "response_load_model", ["Locales", "¿Shuttle? ¿Milk run? ¿Drop? ¿Horas por vuelta?", "Frecuencia diaria, stops, tiempo ciclo"], ["Local", "Shuttle? Milk run? Drop? Hours per turn?", "Daily frequency, stops, cycle time"]),
  ],
  regional_ftl: [
    r("b_regional", "logistics_model", "response_default", ["Regionales", "¿Radio de cobertura? ¿Retorno? ¿Layover?", "Distancia, días tránsito, ventanas"], ["Regional", "Coverage radius? Return trip? Layover?", "Distance, transit days, windows"]),
  ],
  national_ftl: [
    r("b_national", "logistics_model", "response_tracking", ["Nacionales", "¿Largo recorrido? ¿Requiere seguridad? ¿Team?", "Transit time, tracking, paradas, seguro"], ["National", "Long haul? Security required? Team?", "Transit time, tracking, stops, insurance"]),
  ],
  crossborder: [
    r("b_crossborder", "logistics_model", "response_driver", ["Crossborder", "¿Cruce? ¿Broker? ¿Transfer? ¿B1? ¿Carta Porte?", "Cruce, broker MX/US, documentos, modelo de cruce"], ["Cross-border", "Crossing? Broker? Transfer? B1? Carta Porte?", "Crossing, MX/US broker, documents, crossing model"]),
  ],
  expedited: [
    r("b_expedited", "logistics_model", "response_driver", ["Expeditados", "¿Qué tan urgente es? ¿Pickup same day? ¿Team driver? ¿Disponibilidad 24/7?", "Horas máximas de respuesta, ventana pickup, transit time, nivel de escalamiento"], ["Expedited", "How urgent is it? Same-day pickup? Team driver? 24/7 availability?", "Maximum response hours, pickup window, transit time, escalation level"]),
  ],
  time_critical: [
    r("b_time_critical", "logistics_model", "response_yes_no", ["Time Critical", "¿Cuál es el SLA? ¿Hay penalidad? ¿Ventanas fijas?", "OTIF requerido, cut-off, citas, penalización"], ["Time Critical", "What is the SLA? Is there a penalty? Fixed windows?", "Required OTIF, cut-off, appointments, penalty"]),
  ],
  port_drayage_us: [
    r("b_port_drayage_us", "logistics_model", "response_yes_no", ["Port Drayage US", "¿Qué terminal, chasis, cita y modelo de drayage aplican?", "Terminal, gate, chasis, free time y entrega"], ["Port Drayage US", "Which terminal, chassis, appointment and drayage model apply?", "Terminal, gate, chassis, free time and delivery"]),
  ],
  port_drayage_mx: [
    r("b_port_drayage_mx", "logistics_model", "response_yes_no", ["Port Drayage MX", "¿Qué terminal, aduana, transfer y modelo de drayage aplican?", "Terminal, gate, aduana, documentos y entrega"], ["Port Drayage MX", "Which terminal, customs, transfer and drayage model apply?", "Terminal, gate, customs, documents and delivery"]),
  ],
};

/** The five questions that define each segment (SEGMENT_RUBRIC_MINIMUMS). */
const KEY: Record<string, RubricRow[]> = {
  local_ftl: [
    r("c_local_frequency", "operation_criteria", "response_default", ["Frecuencia y ciclo", "¿Cuántas vueltas, paradas y horas por ciclo se requieren?", "Frecuencia diaria, stops y tiempo de ciclo"], ["Frequency and cycle", "How many turns, stops and hours per cycle are required?", "Daily frequency, stops and cycle time"]),
    r("d_local_accessorials", "business_rules", "response_load_model", ["Accessorials locales", "¿Cómo se manejan detention, layover, TONU y redelivery?", "Condición, tiempo libre y tarifa"], ["Local accessorials", "How are detention, layover, TONU and redelivery handled?", "Condition, free time and rate"]),
    r("e_local_equipment", "service_specifications", "response_trailer", ["Equipo local", "¿Qué tipo, edad y configuración de unidad aplican?", "Tipo, trailer, configuración y condiciones"], ["Local equipment", "What truck type, age and configuration apply?", "Type, trailer, configuration and conditions"]),
    r("f_local_coverage", "carrier_requirements", "response_default", ["Cobertura local", "¿Qué cobertura y flota propia puede comprometer el carrier?", "Mercados, flota, autoridad y capacidad"], ["Local coverage", "What coverage and own fleet can the carrier commit?", "Markets, fleet, authority and capacity"]),
    r("g_local_constraints", "other_notes", "response_default", ["Restricciones locales", "¿Qué restricciones de sitio, seguridad o temporada existen?", "Sitio, seguridad, estacionalidad y excepciones"], ["Local restrictions", "What site, security or seasonal restrictions exist?", "Site, security, seasonality and exceptions"]),
  ],
  regional_ftl: [
    r("c_regional_coverage", "operation_criteria", "response_default", ["Cobertura regional", "¿Cuál es el radio, retorno, layover y ventana de servicio?", "Distancia, días de tránsito y ventanas"], ["Regional coverage", "What are the radius, return trip, layover and service window?", "Distance, transit days and windows"]),
    r("d_regional_accessorials", "business_rules", "response_load_model", ["Costos regionales", "¿Cómo se manejan detention, layover, TONU y redelivery?", "Condición, tiempo libre y tarifa"], ["Regional costs", "How are detention, layover, TONU and redelivery handled?", "Condition, free time and rate"]),
    r("e_regional_equipment", "service_specifications", "response_trailer", ["Equipo regional", "¿Qué equipo, trailer y configuración se requieren?", "Tipo, largo, edad y configuración"], ["Regional equipment", "What equipment, trailer and configuration are required?", "Type, length, age and configuration"]),
    r("f_regional_carrier_coverage", "carrier_requirements", "response_default", ["Capacidad regional", "¿Qué mercados y capacidad recurrente puede cubrir el carrier?", "Mercados, flota, autoridad y capacidad"], ["Regional capacity", "What markets and recurring capacity can the carrier cover?", "Markets, fleet, authority and capacity"]),
    r("g_regional_seasonality", "other_notes", "response_default", ["Riesgo regional", "¿Qué restricciones, temporadas o riesgos deben considerarse?", "Restricciones, temporada y excepciones"], ["Regional risk", "What restrictions, seasons or risks should be considered?", "Restrictions, season and exceptions"]),
  ],
  national_ftl: [
    r("c_national_transit", "operation_criteria", "response_tracking", ["Tránsito nacional", "¿Cuál es el tiempo de tránsito, tracking y reglas de parada?", "Transit time, tracking, paradas y seguro"], ["National transit", "What are the transit time, tracking and stop rules?", "Transit time, tracking, stops and insurance"]),
    r("d_national_rules", "business_rules", "response_currency", ["Reglas nacionales", "¿Qué moneda, fuel, accessorials, claims y penalizaciones aplican?", "Condiciones comerciales y de riesgo"], ["National rules", "What currency, fuel, accessorials, claims and penalties apply?", "Commercial and risk conditions"]),
    r("e_national_equipment", "service_specifications", "response_tracking", ["Equipo nacional", "¿Qué equipo, seguridad, documentos y POD se requieren?", "Tipo, trailer, tracking y documentos"], ["National equipment", "What equipment, security, documents and POD are required?", "Type, trailer, tracking and documents"]),
    r("f_national_authority", "carrier_requirements", "response_yes_no", ["Elegibilidad nacional", "¿Qué autoridad, seguros, flota y cobertura son obligatorios?", "Autoridad, seguros, flota y cobertura"], ["National eligibility", "What authority, insurance, fleet and coverage are mandatory?", "Authority, insurance, fleet and coverage"]),
    r("g_national_risk", "other_notes", "response_default", ["Riesgo nacional", "¿Qué restricciones de ruta, seguridad o temporada existen?", "Ruta, seguridad, temporada y excepciones"], ["National risk", "What route, security or seasonal restrictions exist?", "Route, security, season and exceptions"]),
  ],
  crossborder: [
    r("c_crossborder_execution", "operation_criteria", "response_driver", ["Ejecución crossborder", "¿Cómo son el cruce, broker, transfer, B1, Carta Porte y las citas?", "Cruce, broker, documentos y ventanas"], ["Cross-border execution", "How do the crossing, broker, transfer, B1, Carta Porte and appointments work?", "Crossing, broker, documents and windows"]),
    r("d_crossborder_commercial", "business_rules", "response_fuel", ["Reglas crossborder", "¿Quién absorbe fuel, border wait, detention, claims y penalizaciones?", "Responsable, gatillo y tarifa"], ["Cross-border rules", "Who absorbs fuel, border wait, detention, claims and penalties?", "Responsible party, trigger and rate"]),
    r("e_crossborder_documents", "service_specifications", "response_tracking", ["Documentos crossborder", "¿Qué unidad, trailer, tracking, POD y documentos se exigen?", "Equipo, documentos, tracking y evidencia"], ["Cross-border documents", "What truck, trailer, tracking, POD and documents are required?", "Equipment, documents, tracking and evidence"]),
    r("f_crossborder_eligibility", "carrier_requirements", "response_yes_no", ["Elegibilidad crossborder", "¿Qué autoridad, seguros, permisos, experiencia y certificaciones requiere el carrier?", "Autoridad, seguros, permisos y experiencia"], ["Cross-border eligibility", "What authority, insurance, permits, experience and certifications does the carrier need?", "Authority, insurance, permits and experience"]),
    r("g_crossborder_restrictions", "other_notes", "response_yes_no", ["Restricciones crossborder", "¿Qué ciudad fronteriza, seguridad, documentos o excepciones aplican?", "Frontera, seguridad, temporada y excepciones"], ["Cross-border restrictions", "What border city, security, documents or exceptions apply?", "Border, security, season and exceptions"]),
  ],
  expedited: [
    r("c_expedited_sla", "operation_criteria", "response_default", ["SLA expeditado", "¿Cuál es la respuesta máxima, pickup same day y ETA requerido?", "Horas de respuesta, pickup y transit time"], ["Expedited SLA", "What are the maximum response time, same-day pickup and required ETA?", "Response hours, pickup and transit time"]),
    r("d_expedited_penalties", "business_rules", "response_default", ["Penalización expeditada", "¿Hay penalidad, cancelación, TONU o accessorial por demora?", "Condición, penalidad y tarifa"], ["Expedited penalty", "Is there a penalty, cancellation, TONU or delay accessorial?", "Condition, penalty and rate"]),
    r("e_expedited_equipment", "service_specifications", "response_tracking", ["Equipo expeditado", "¿Qué equipo, driver, tracking y evidencia se requieren?", "Unidad, driver, tracking y POD"], ["Expedited equipment", "What equipment, driver, tracking and evidence are required?", "Truck, driver, tracking and POD"]),
    r("f_expedited_availability", "carrier_requirements", "response_driver", ["Disponibilidad inmediata", "¿Puede el carrier comprometer unidad, driver y cobertura 24/7?", "Unidad, driver, dispatch y escalamiento"], ["Immediate availability", "Can the carrier commit a truck, driver and 24/7 coverage?", "Truck, driver, dispatch and escalation"]),
    r("g_expedited_escalation", "other_notes", "response_default", ["Riesgo expeditado", "¿Qué contingencias, restricciones o contactos de escalamiento existen?", "Riesgo, contingencia y contacto"], ["Expedited risk", "What contingencies, restrictions or escalation contacts exist?", "Risk, contingency and contact"]),
  ],
  time_critical: [
    r("c_time_critical_sla", "operation_criteria", "response_yes_no", ["SLA time critical", "¿Cuál es el OTIF, cut-off, cita y escalamiento requerido?", "OTIF, cut-off, citas y SLA"], ["Time-critical SLA", "What are the required OTIF, cut-off, appointment and escalation?", "OTIF, cut-off, appointments and SLA"]),
    r("d_time_critical_penalties", "business_rules", "response_yes_no", ["Penalizaciones time critical", "¿Qué penalidades, cancelaciones y responsabilidades por demora aplican?", "Regla, gatillo y tarifa"], ["Time-critical penalties", "What penalties, cancellations and liabilities for delays apply?", "Rule, trigger and rate"]),
    r("e_time_critical_tracking", "service_specifications", "response_tracking", ["Tracking time critical", "¿Qué unidad, respaldo, tracking y documentos son obligatorios?", "Equipo, backup, tracking y evidencia"], ["Time-critical tracking", "What truck, backup, tracking and documents are mandatory?", "Equipment, backup, tracking and evidence"]),
    r("f_time_critical_backup", "carrier_requirements", "response_trailer", ["Backup operativo", "¿Qué disponibilidad, equipo de respaldo y escalamiento puede ofrecer el carrier?", "Capacidad primaria, backup y contacto"], ["Operational backup", "What availability, backup equipment and escalation can the carrier offer?", "Primary capacity, backup and contact"]),
    r("g_time_critical_risk", "other_notes", "response_default", ["Riesgo time critical", "¿Qué riesgos, excepciones y contingencias deben quedar documentados?", "Riesgo, contingencia y excepción"], ["Time-critical risk", "What risks, exceptions and contingencies must be documented?", "Risk, contingency and exception"]),
  ],
  port_drayage_us: [
    r("c_port_us_appointments", "operation_criteria", "response_yes_no", ["Terminal y citas US", "¿Qué terminal, cita, free time, gate y procedimiento aplican?", "Terminal, cita, gate y ventanas"], ["US terminal and appointments", "What terminal, appointment, free time, gate and procedure apply?", "Terminal, appointment, gate and windows"]),
    r("d_port_us_demurrage", "business_rules", "response_default", ["Demurrage US", "¿Quién paga demurrage, detention, per diem y otros accessorials?", "Responsable, condición y tarifa"], ["US demurrage", "Who pays demurrage, detention, per diem and other accessorials?", "Responsible party, condition and rate"]),
    r("e_port_us_equipment", "service_specifications", "response_tracking", ["Equipo portuario US", "¿Qué chassis, trailer, sello, tracking y documentos se necesitan?", "Equipo, chassis, tracking y documentos"], ["US port equipment", "What chassis, trailer, seal, tracking and documents are needed?", "Equipment, chassis, tracking and documents"]),
    r("f_port_us_coverage", "carrier_requirements", "response_yes_no", ["Cobertura portuaria US", "¿Qué puertos, autoridad, seguros y capacidad puede cubrir el carrier?", "Puertos, autoridad, seguros y capacidad"], ["US port coverage", "What ports, authority, insurance and capacity can the carrier cover?", "Ports, authority, insurance and capacity"]),
    r("g_port_us_constraints", "other_notes", "response_default", ["Restricciones portuarias US", "¿Qué restricciones de terminal, seguridad o temporada existen?", "Terminal, seguridad, temporada y excepciones"], ["US port restrictions", "What terminal, security or seasonal restrictions exist?", "Terminal, security, season and exceptions"]),
  ],
  port_drayage_mx: [
    r("c_port_mx_terminal", "operation_criteria", "response_yes_no", ["Terminal y citas MX", "¿Qué terminal, cita, gate, transfer y ventana aplican?", "Terminal, cita, gate y ventanas"], ["MX terminal and appointments", "What terminal, appointment, gate, transfer and window apply?", "Terminal, appointment, gate and windows"]),
    r("d_port_mx_customs", "business_rules", "response_default", ["Aduana y accessorials MX", "¿Cómo se manejan aduana, demoras, maniobras y accessorials?", "Responsable, condición y tarifa"], ["MX customs and accessorials", "How are customs, demurrage, handling and accessorials managed?", "Responsible party, condition and rate"]),
    r("e_port_mx_documents", "service_specifications", "response_tracking", ["Documentos portuarios MX", "¿Qué equipo, pedimento, Carta Porte, POD y tracking se requieren?", "Equipo, documentos y evidencia"], ["MX port documents", "What equipment, pedimento, Carta Porte, POD and tracking are required?", "Equipment, documents and evidence"]),
    r("f_port_mx_permits", "carrier_requirements", "response_yes_no", ["Permisos portuarios MX", "¿Qué permisos, seguros, experiencia y capacidad son obligatorios?", "Permisos, seguros, experiencia y capacidad"], ["MX port permits", "What permits, insurance, experience and capacity are mandatory?", "Permits, insurance, experience and capacity"]),
    r("g_port_mx_constraints", "other_notes", "response_default", ["Restricciones portuarias MX", "¿Qué restricciones de terminal, seguridad o temporada deben documentarse?", "Terminal, seguridad, temporada y excepciones"], ["MX port restrictions", "What terminal, security or seasonal restrictions must be documented?", "Terminal, security, season and exceptions"]),
  ],
};

/** The rest of each segment's rubric (SEGMENT_RUBRIC_DETAIL_LIBRARY). */
const MORE: Record<string, RubricRow[]> = {
  local_ftl: [
    r("detail_local_ftl_logistics_model_tipo_de_operacion_local", "logistics_model", "response_default", ["Tipo de operación local", "¿Es shuttle, plant-to-plant, milk run, yard transfer o same-day?", "Modelo de servicio y número de paradas"], ["Local operation type", "Is it shuttle, plant-to-plant, milk run, yard transfer or same-day?", "Service model and number of stops"]),
    r("detail_local_ftl_logistics_model_patron_de_ruta", "logistics_model", "response_default", ["Patrón de ruta", "¿La ruta es fija, dinámica, circuito o viaje sencillo?", "Secuencia, vueltas y cargas por turno"], ["Route pattern", "Is the route fixed, dynamic, a loop or a one-way trip?", "Sequence, turns and loads per shift"]),
    r("detail_local_ftl_logistics_model_dedicacion_y_respaldo", "logistics_model", "response_default", ["Dedicación y respaldo", "¿Se requiere tractor, remolque o capacidad de respaldo dedicada?", "Dedicado, compartido, pool y backup"], ["Dedication and backup", "Is a dedicated tractor, trailer or backup capacity required?", "Dedicated, shared, pool and backup"]),
    r("detail_local_ftl_operation_criteria_primer_posicionamiento", "operation_criteria", "response_default", ["Primer posicionamiento", "¿A qué hora debe estar posicionada la primera unidad?", "Hora de primer posicionamiento"], ["First positioning", "What time must the first truck be in position?", "First positioning time"]),
    r("detail_local_ftl_operation_criteria_ciclo_objetivo", "operation_criteria", "response_default", ["Ciclo objetivo", "¿Cuál es el tiempo objetivo y máximo por ciclo?", "Horas objetivo y límite"], ["Target cycle", "What is the target and maximum time per cycle?", "Target hours and limit"]),
    r("detail_local_ftl_operation_criteria_acceso_y_staging", "operation_criteria", "response_yes_no", ["Acceso y staging", "¿Qué proceso de caseta, staging y cambio de turno aplica?", "Proceso, credenciales y contactos"], ["Access and staging", "What gatehouse, staging and shift-change process applies?", "Process, credentials and contacts"]),
    r("detail_local_ftl_business_rules_esquema_tarifario", "business_rules", "response_default", ["Esquema tarifario", "¿Se paga por viaje, hora, turno, día o mensual dedicado?", "Unidad de cobro y tarifa mínima"], ["Pricing scheme", "Is it paid per trip, hour, shift, day or dedicated monthly?", "Billing unit and minimum rate"]),
    r("detail_local_ftl_business_rules_millas_incluidas", "business_rules", "response_default", ["Millas incluidas", "¿Cuántas millas están incluidas y cómo se cobra el excedente?", "Millas incluidas y tarifa adicional"], ["Included miles", "How many miles are included and how is the excess charged?", "Included miles and additional rate"]),
    r("detail_local_ftl_business_rules_compromiso_minimo", "business_rules", "response_default", ["Compromiso mínimo", "¿Existe compromiso mínimo de volumen o capacidad?", "Volumen comprometido y recotización"], ["Minimum commitment", "Is there a minimum volume or capacity commitment?", "Committed volume and re-quote"]),
    r("detail_local_ftl_service_specifications_requisitos_de_planta", "service_specifications", "response_trailer", ["Requisitos de planta", "¿Qué equipo de seguridad, EPP, capacitación y credenciales exige la planta?", "Acceso, EPP y capacitación"], ["Plant requirements", "What safety equipment, PPE, training and credentials does the plant require?", "Access, PPE and training"]),
    r("detail_local_ftl_service_specifications_control_de_ciclos", "service_specifications", "response_tracking", ["Control de ciclos", "¿Se requiere GPS, geocerca, evidencia de entrada/salida o reporte por turno?", "Fuente de evidencia y frecuencia"], ["Cycle control", "Is GPS, a geofence, entry/exit evidence or a per-shift report required?", "Evidence source and frequency"]),
    r("detail_local_ftl_carrier_requirements_flota_y_patio_local", "carrier_requirements", "response_default", ["Flota y patio local", "¿El carrier tiene flota y patio cercanos para cubrir todos los turnos?", "Mercado, patio y capacidad"], ["Local fleet and yard", "Does the carrier have a nearby fleet and yard to cover all shifts?", "Market, yard and capacity"]),
    r("detail_local_ftl_carrier_requirements_experiencia_repetitiva", "carrier_requirements", "response_default", ["Experiencia repetitiva", "¿Tiene experiencia en shuttle, milk run u operaciones repetitivas?", "Experiencia comprobable y referencias"], ["Repetitive operations experience", "Does it have experience in shuttle, milk run or repetitive operations?", "Verifiable experience and references"]),
    r("detail_local_ftl_carrier_requirements_dispatcher_dedicado", "carrier_requirements", "response_default", ["Dispatcher dedicado", "¿Puede asignar dispatcher y unidades de respaldo?", "Contacto, respaldo y tiempo de respuesta"], ["Dedicated dispatcher", "Can it assign a dispatcher and backup trucks?", "Contact, backup and response time"]),
    r("detail_local_ftl_other_notes_restricciones_de_acceso", "other_notes", "response_default", ["Restricciones de acceso", "¿Hay congestión, restricciones de caseta, andén o estacionamiento?", "Restricción, horario y mitigación"], ["Access restrictions", "Is there congestion, or are there gatehouse, dock or parking restrictions?", "Restriction, hours and mitigation"]),
    r("detail_local_ftl_other_notes_cambios_de_produccion", "other_notes", "response_yes_no", ["Cambios de producción", "¿Hay cambios de turno, picos, obras, cierres o permisos locales?", "Evento, fecha y excepción"], ["Production changes", "Are there shift changes, peaks, construction, closures or local permits?", "Event, date and exception"]),
  ],
  regional_ftl: [
    r("detail_regional_ftl_logistics_model_tipo_de_servicio_regional", "logistics_model", "response_default", ["Tipo de servicio regional", "¿Es same-day, next-day, multi-day, spot, recurrente o contractual?", "Horizonte de servicio y frecuencia"], ["Regional service type", "Is it same-day, next-day, multi-day, spot, recurring or contract?", "Service horizon and frequency"]),
    r("detail_regional_ftl_logistics_model_retorno_y_backhaul", "logistics_model", "response_default", ["Retorno y backhaul", "¿Se requiere roundtrip, backhaul o retorno esperado del operador?", "Tipo de viaje y retorno"], ["Return and backhaul", "Is a roundtrip, backhaul or expected driver return required?", "Trip type and return"]),
    r("detail_regional_ftl_logistics_model_capacidad_primaria_y_backup", "logistics_model", "response_default", ["Capacidad primaria y backup", "¿Cómo se cubren las semanas pico y el respaldo?", "Carrier primario, backup y capacidad"], ["Primary and backup capacity", "How are peak weeks and backup covered?", "Primary carrier, backup and capacity"]),
    r("detail_regional_ftl_operation_criteria_transito_y_variacion", "operation_criteria", "response_default", ["Tránsito y variación", "¿Cuál es el tránsito esperado y la variación máxima permitida?", "Días u horas y tolerancia"], ["Transit and variance", "What is the expected transit and the maximum allowed variance?", "Days or hours and tolerance"]),
    r("detail_regional_ftl_operation_criteria_booking_y_citas", "operation_criteria", "response_yes_no", ["Booking y citas", "¿Con cuánto lead time se agenda y quién es responsable de la cita?", "Lead time, responsable y contacto"], ["Booking and appointments", "What is the scheduling lead time and who is responsible for the appointment?", "Lead time, responsible party and contact"]),
    r("detail_regional_ftl_operation_criteria_fin_de_semana_y_hos", "operation_criteria", "response_yes_no", ["Fin de semana y HOS", "¿Aplica fin de semana, restricciones de ruta o reglas de paradas?", "Calendario, ruta y paradas permitidas"], ["Weekend and HOS", "Do weekend operations, route restrictions or stop rules apply?", "Calendar, route and allowed stops"]),
    r("detail_regional_ftl_business_rules_precio_y_fuel", "business_rules", "response_currency", ["Precio y fuel", "¿Cómo se cotizan linehaul, fuel y cargos de fin de semana o festivo?", "Base, fuel, moneda y recargos"], ["Pricing and fuel", "How are linehaul, fuel and weekend or holiday charges quoted?", "Base, fuel, currency and surcharges"]),
    r("detail_regional_ftl_business_rules_accessorials_regionales", "business_rules", "response_load_model", ["Accessorials regionales", "¿Qué reglas aplican para detention, layover, TONU, redelivery y paradas?", "Condición, free time y tarifa"], ["Regional accessorials", "What rules apply to detention, layover, TONU, redelivery and stops?", "Condition, free time and rate"]),
    r("detail_regional_ftl_business_rules_vigencia_y_claims", "business_rules", "response_payment_terms", ["Vigencia y claims", "¿Cuál es la vigencia, recotización, claims y término de pago?", "Vigencia, proceso y términos"], ["Validity and claims", "What are the validity period, re-quote, claims and payment terms?", "Validity, process and terms"]),
    r("detail_regional_ftl_service_specifications_equipo_y_driver", "service_specifications", "response_driver", ["Equipo y driver", "¿Qué equipo, trailer y modalidad single o team se requiere?", "Equipo, configuración y driver"], ["Equipment and driver", "What equipment, trailer and single or team operation are required?", "Equipment, configuration and driver"]),
    r("detail_regional_ftl_service_specifications_evidencia_y_tracking", "service_specifications", "response_load_model", ["Evidencia y tracking", "¿Qué GPS, check calls, evidencia de pickup/delivery y POD se requieren?", "Tracking, hitos y POD"], ["Evidence and tracking", "What GPS, check calls, pickup/delivery evidence and POD are required?", "Tracking, milestones and POD"]),
    r("detail_regional_ftl_carrier_requirements_cobertura_por_corredor", "carrier_requirements", "response_default", ["Cobertura por corredor", "¿Qué mercados y corredores regionales puede cubrir el carrier?", "Cobertura, experiencia y referencias"], ["Coverage by corridor", "What regional markets and corridors can the carrier cover?", "Coverage, experience and references"]),
    r("detail_regional_ftl_carrier_requirements_escalabilidad_pico", "carrier_requirements", "response_default", ["Escalabilidad pico", "¿Qué capacidad adicional puede aportar en semanas pico?", "Capacidad comprometida y backup"], ["Peak scalability", "What additional capacity can it provide in peak weeks?", "Committed capacity and backup"]),
    r("detail_regional_ftl_carrier_requirements_solidez_operativa", "carrier_requirements", "response_tracking", ["Solidez operativa", "¿Cuenta con seguros, seguridad, GPS y estabilidad financiera suficientes?", "Evidencia, límites y estado"], ["Operational soundness", "Does it have sufficient insurance, security, GPS and financial stability?", "Evidence, limits and status"]),
    r("detail_regional_ftl_other_notes_dependencia_de_backhaul", "other_notes", "response_default", ["Dependencia de backhaul", "¿La tarifa o cobertura depende de backhaul, clima o temporada?", "Dependencia, riesgo y mitigación"], ["Backhaul dependency", "Does the rate or coverage depend on backhaul, weather or season?", "Dependency, risk and mitigation"]),
    r("detail_regional_ftl_other_notes_destinos_alternos", "other_notes", "response_default", ["Destinos alternos", "¿Hay cuellos de botella, destinos alternos o cambios temporales de ruta?", "Alternativa, gatillo y fecha"], ["Alternate destinations", "Are there bottlenecks, alternate destinations or temporary route changes?", "Alternative, trigger and date"]),
  ],
  national_ftl: [
    r("detail_national_ftl_logistics_model_pais_y_corredor", "logistics_model", "response_default", ["País y corredor", "¿La operación es en México, Estados Unidos o ambos? ¿Cuáles son los corredores?", "País, corredor y ruta aprobada"], ["Country and corridor", "Is the operation in Mexico, the United States or both? What are the corridors?", "Country, corridor and approved route"]),
    r("detail_national_ftl_logistics_model_viaje_y_frecuencia", "logistics_model", "response_default", ["Viaje y frecuencia", "¿Es one-way, roundtrip, backhaul, relay, spot o recurrente?", "Tipo de viaje y calendario"], ["Trip and frequency", "Is it one-way, roundtrip, backhaul, relay, spot or recurring?", "Trip type and calendar"]),
    r("detail_national_ftl_logistics_model_seguridad_y_capacidad", "logistics_model", "response_default", ["Seguridad y capacidad", "¿Se requiere capacidad dedicada, pico, backup o modelo especial de seguridad?", "Capacidad, respaldo y protocolo"], ["Security and capacity", "Is dedicated, peak or backup capacity, or a special security model required?", "Capacity, backup and protocol"]),
    r("detail_national_ftl_operation_criteria_reglas_de_ruta", "operation_criteria", "response_default", ["Reglas de ruta", "¿Hay rutas obligatorias, prohibidas, zonas sin parada o reglas de pernocta?", "Ruta, paradas y pernocta"], ["Route rules", "Are there mandatory routes, prohibited routes, no-stop zones or overnight rules?", "Route, stops and overnight stays"]),
    r("detail_national_ftl_operation_criteria_transito_y_recuperacion", "operation_criteria", "response_default", ["Tránsito y recuperación", "¿Cuál es el tránsito objetivo, variación y proceso de recuperación?", "Días, tolerancia y escalamiento"], ["Transit and recovery", "What are the target transit, variance and recovery process?", "Days, tolerance and escalation"]),
    r("detail_national_ftl_operation_criteria_seguridad_en_ruta", "operation_criteria", "response_tracking", ["Seguridad en ruta", "¿Qué check-ins, geocercas, frecuencia GPS y carga de combustible aplican?", "Frecuencia, geocerca y contacto"], ["En-route security", "What check-ins, geofences, GPS frequency and refueling requirements apply?", "Frequency, geofence and contact"]),
    r("detail_national_ftl_business_rules_linehaul_y_fuel", "business_rules", "response_currency", ["Linehaul y fuel", "¿Cómo se separan moneda, linehaul, fuel y accesoriales?", "Estructura de tarifa y moneda"], ["Linehaul and fuel", "How are currency, linehaul, fuel and accessorials broken out?", "Rate structure and currency"]),
    r("detail_national_ftl_business_rules_riesgo_y_seguridad", "business_rules", "response_yes_no", ["Riesgo y seguridad", "¿Cómo se manejan custodia, cargo value, seguro y cargos de seguridad?", "Responsable, límite y evidencia"], ["Risk and security", "How are security escort, cargo value, insurance and security charges handled?", "Responsible party, limit and evidence"]),
    r("detail_national_ftl_business_rules_claims_y_vigencia", "business_rules", "response_payment_terms", ["Claims y vigencia", "¿Cuál es la vigencia, recotización, claims, pago y autorización de accesoriales?", "Proceso, fecha y autoridad"], ["Claims and validity", "What are the validity period, re-quote, claims, payment and accessorial authorization?", "Process, date and authority"]),
    r("detail_national_ftl_service_specifications_equipo_y_condicion", "service_specifications", "response_trailer", ["Equipo y condición", "¿Qué tipo, antigüedad, condición, sujeción y sellos requiere la carga?", "Equipo, edad, condición y sellos"], ["Equipment and condition", "What type, age, condition, securement and seals does the load require?", "Equipment, age, condition and seals"]),
    r("detail_national_ftl_service_specifications_alto_valor_o_hazmat", "service_specifications", "response_temperature", ["Alto valor o hazmat", "¿Aplica alto valor, hazmat, temperatura, documentos o evidencia fotográfica?", "Requisito, límite y documentos"], ["High value or hazmat", "Do high value, hazmat, temperature, documents or photo evidence apply?", "Requirement, limit and documents"]),
    r("detail_national_ftl_carrier_requirements_cobertura_nacional", "carrier_requirements", "response_default", ["Cobertura nacional", "¿Qué flota, corredores, autoridad y capacidad de respaldo puede cubrir?", "Cobertura, flota y backup"], ["National coverage", "What fleet, corridors, authority and backup capacity can it cover?", "Coverage, fleet and backup"]),
    r("detail_national_ftl_carrier_requirements_seguridad_y_gps", "carrier_requirements", "response_tracking", ["Seguridad y GPS", "¿Tiene protocolo de seguridad, GPS y experiencia en carga de alto valor?", "Protocolo, experiencia y evidencia"], ["Security and GPS", "Does it have a security protocol, GPS and experience with high-value loads?", "Protocol, experience and evidence"]),
    r("detail_national_ftl_carrier_requirements_perfil_preferido", "carrier_requirements", "response_carrier_type", ["Perfil preferido", "¿Se prefiere asset-based? ¿Cuál es el índice máximo de claims?", "Elegibilidad y umbral"], ["Preferred profile", "Is asset-based preferred? What is the maximum claims ratio?", "Eligibility and threshold"]),
    r("detail_national_ftl_other_notes_riesgo_de_ruta", "other_notes", "response_default", ["Riesgo de ruta", "¿Hay zonas de alto riesgo, montaña, cierres, restricciones nocturnas o documentos especiales?", "Riesgo, zona y mitigación"], ["Route risk", "Are there high-risk zones, mountain terrain, closures, nighttime restrictions or special documents?", "Risk, zone and mitigation"]),
    r("detail_national_ftl_other_notes_ruta_alterna", "other_notes", "response_default", ["Ruta alterna", "¿Qué rutas alternas o excepciones estatales/regionales deben documentarse?", "Alternativa, gatillo y aprobador"], ["Alternate route", "What alternate routes or state/regional exceptions must be documented?", "Alternative, trigger and approver"]),
  ],
  crossborder: [
    r("detail_crossborder_logistics_model_direccion_y_modelo_de_cruce", "logistics_model", "response_default", ["Dirección y modelo de cruce", "¿La ruta es MX-US o US-MX? ¿Es D2D, door-to-border, border-to-door o segmentada?", "Dirección y tramo operativo"], ["Direction and crossing model", "Is the route MX-US or US-MX? Is it D2D, door-to-border, border-to-door or segmented?", "Direction and operating leg"]),
    r("detail_crossborder_logistics_model_cruce_y_transferencia", "logistics_model", "response_driver", ["Cruce y transferencia", "¿El modelo es directo, transfer, swap, drayage, B1 o híbrido?", "Modelo de cruce y responsables"], ["Crossing and transfer", "Is the model direct, transfer, swap, drayage, B1 or hybrid?", "Crossing model and responsible parties"]),
    r("detail_crossborder_logistics_model_frontera_y_aduana", "logistics_model", "response_carrier_type", ["Frontera y aduana", "¿Cuál es el cruce principal, alterno, broker y responsable documental?", "Ciudades frontera, broker y documentos"], ["Border and customs", "What are the primary crossing, alternate crossing, broker and party responsible for documentation?", "Border cities, broker and documents"]),
    r("detail_crossborder_operation_criteria_cut_offs_y_frontera", "operation_criteria", "response_default", ["Cut-offs y frontera", "¿Cuáles son los cut-offs documentales, llegada a frontera y aduana?", "Horarios, dwell y liberación"], ["Cut-offs and border", "What are the cut-offs for documents, border arrival and customs?", "Schedules, dwell and release"]),
    r("detail_crossborder_operation_criteria_transfer_e_interchange", "operation_criteria", "response_update_frequency", ["Transfer e interchange", "¿Cómo funcionan cita de transfer, patio, interchange y actualización de unidad?", "Cita, patio, evidencia y hito"], ["Transfer and interchange", "How do the transfer appointment, yard, interchange and unit update work?", "Appointment, yard, evidence and milestone"]),
    r("detail_crossborder_operation_criteria_escalamiento_aduanal", "operation_criteria", "response_default", ["Escalamiento aduanal", "¿Cómo se escala demora, inspección, retención o activación de cruce alterno?", "SLA, contacto y gatillo"], ["Customs escalation", "How is a delay, inspection, hold or alternate-crossing activation escalated?", "SLA, contact and trigger"]),
    r("detail_crossborder_business_rules_cruce_y_moneda", "business_rules", "response_currency", ["Cruce y moneda", "¿Qué incluye fuel, puente, transfer, drayage, patio, FX y border wait?", "Incluido, separado y moneda"], ["Crossing and currency", "What is included for fuel, bridge, transfer, drayage, yard, FX and border wait?", "Included, separate and currency"]),
    r("detail_crossborder_business_rules_demoras_y_documentacion", "business_rules", "response_load_model", ["Demoras y documentación", "¿Quién absorbe detention, border wait, error documental, claims y redelivery?", "Responsable, gatillo y tarifa"], ["Delays and documentation", "Who absorbs detention, border wait, documentation errors, claims and redelivery?", "Responsible party, trigger and rate"]),
    r("detail_crossborder_business_rules_vigencia_crossborder", "business_rules", "response_carrier_type", ["Vigencia crossborder", "¿Cuál es la vigencia, recotización, aprobación de accesoriales y regla contra doble brokerage?", "Vigencia, autoridad y restricción"], ["Cross-border validity", "What are the validity period, re-quote, accessorial approval and rule against double brokering?", "Validity, authority and restriction"]),
    r("detail_crossborder_service_specifications_documentos_de_cruce", "service_specifications", "response_default", ["Documentos de cruce", "¿Se requieren Carta Porte, pedimento, invoice, packing list, BOL, DODA o entry documents?", "Lista, formato y cut-off"], ["Crossing documents", "Are Carta Porte, pedimento, invoice, packing list, BOL, DODA or entry documents required?", "List, format and cut-off"]),
    r("detail_crossborder_service_specifications_hitos_y_seguridad", "service_specifications", "response_tracking", ["Hitos y seguridad", "¿Qué GPS, cuenta espejo, sellos, hitos, POD, alto valor o hazmat se requieren?", "Hito, evidencia y retención"], ["Milestones and security", "What GPS, mirror account, seals, milestones, POD, high-value or hazmat requirements apply?", "Milestone, evidence and retention"]),
    r("detail_crossborder_carrier_requirements_autoridad_y_permisos", "carrier_requirements", "response_yes_no", ["Autoridad y permisos", "¿Tiene MC/DOT, permisos MX, autoridad activa y seguros suficientes?", "Autoridad, permisos y límites"], ["Authority and permits", "Does it have MC/DOT, MX permits, active authority and sufficient insurance?", "Authority, permits and limits"]),
    r("detail_crossborder_carrier_requirements_experiencia_de_cruce", "carrier_requirements", "response_driver", ["Experiencia de cruce", "¿Puede operar el cruce específico con directo, B1, transfer, swap o drayage?", "Experiencia, socios y referencias"], ["Crossing experience", "Can it operate the specific crossing via direct, B1, transfer, swap or drayage?", "Experience, partners and references"]),
    r("detail_crossborder_carrier_requirements_certificaciones", "carrier_requirements", "response_tracking", ["Certificaciones", "¿Aplica CTPAT, FAST, OEA, hazmat, GPS o prohibición de doble brokerage?", "Certificación y evidencia"], ["Certifications", "Do CTPAT, FAST, OEA, hazmat, GPS or a double-brokering ban apply?", "Certification and evidence"]),
    r("detail_crossborder_other_notes_cruce_permitido", "other_notes", "response_default", ["Cruce permitido", "¿Qué cruce es preferido, prohibido o alterno?", "Ciudad fronteriza, horario y excepción"], ["Allowed crossing", "Which crossing is preferred, prohibited or alternate?", "Border city, hours and exception"]),
    r("detail_crossborder_other_notes_restricciones_de_patio", "other_notes", "response_default", ["Restricciones de patio", "¿Hay restricciones de patio, subcontratación, congestión o festivos fronterizos?", "Restricción, fecha y mitigación"], ["Yard restrictions", "Are there yard restrictions, subcontracting, congestion or border holidays?", "Restriction, date and mitigation"]),
  ],
  expedited: [
    r("detail_expedited_logistics_model_tipo_de_urgencia", "logistics_model", "response_default", ["Tipo de urgencia", "¿Es emergencia, planeado, recovery, premium scheduled o line-down?", "Tipo y nivel de criticidad"], ["Urgency type", "Is it an emergency, planned, recovery, premium scheduled or line-down?", "Type and criticality level"]),
    r("detail_expedited_logistics_model_modelo_dedicado", "logistics_model", "response_driver", ["Modelo dedicado", "¿Se requiere servicio directo, sin consolidación, team driver o equipo dedicado?", "Equipo, driver y no-stop"], ["Dedicated model", "Is direct service, no consolidation, a team driver or dedicated equipment required?", "Equipment, driver and no-stop"]),
    r("detail_expedited_logistics_model_cobertura_y_backup", "logistics_model", "response_default", ["Cobertura y backup", "¿La cobertura es laboral, after-hours, 24/7, on-call o reservada?", "Horario, frecuencia y backup"], ["Coverage and backup", "Is coverage business hours, after-hours, 24/7, on-call or reserved?", "Hours, frequency and backup"]),
    r("detail_expedited_operation_criteria_sla_de_respuesta", "operation_criteria", "response_load_model", ["SLA de respuesta", "¿Cuál es el tiempo máximo de respuesta, unidad, pickup y delivery?", "Horas, deadlines y ETA"], ["Response SLA", "What is the maximum time for response, truck, pickup and delivery?", "Hours, deadlines and ETA"]),
    r("detail_expedited_operation_criteria_recovery_y_escalamiento", "operation_criteria", "response_default", ["Recovery y escalamiento", "¿Cuál es el RTO y cuándo se activa el backup?", "Gatillo, contacto y SLA"], ["Recovery and escalation", "What is the RTO and when is the backup activated?", "Trigger, contact and SLA"]),
    r("detail_expedited_operation_criteria_confirmaciones", "operation_criteria", "response_tracking", ["Confirmaciones", "¿Con qué frecuencia se confirma unidad, operador, GPS y avance?", "Cadencia y canal"], ["Confirmations", "How often are the truck, driver, GPS and progress confirmed?", "Cadence and channel"]),
    r("detail_expedited_business_rules_premium_y_autorizacion", "business_rules", "response_default", ["Premium y autorización", "¿Quién autoriza premium, after-hours, weekend, holiday y recovery pricing?", "Aprobador, umbral y tarifa"], ["Premium and authorization", "Who authorizes premium, after-hours, weekend, holiday and recovery pricing?", "Approver, threshold and rate"]),
    r("detail_expedited_business_rules_falla_de_servicio", "business_rules", "response_load_model", ["Falla de servicio", "¿Qué penalidad aplica por late pickup, late delivery, no-show o cancelación?", "Gatillo y cargo"], ["Service failure", "What penalty applies for late pickup, late delivery, no-show or cancellation?", "Trigger and charge"]),
    r("detail_expedited_business_rules_vigencia_urgente", "business_rules", "response_default", ["Vigencia urgente", "¿Cuál es la vigencia, recotización y tolerancia máxima del premium?", "Ventana y regla"], ["Urgent validity", "What are the validity period, re-quote and maximum premium tolerance?", "Window and rule"]),
    r("detail_expedited_service_specifications_unidad_y_conductor", "service_specifications", "response_driver", ["Unidad y conductor", "¿Qué equipo, remolque, single/team, sujeción y alto valor se requieren?", "Unidad, driver y cargo"], ["Truck and driver", "What equipment, trailer, single/team, securement and high-value requirements apply?", "Truck, driver and cargo"]),
    r("detail_expedited_service_specifications_control_24_7", "service_specifications", "response_tracking", ["Control 24/7", "¿Se requiere GPS continuo, control tower, alertas y evidencia con timestamp?", "Herramienta, alerta y evidencia"], ["24/7 control", "Are continuous GPS, control tower, alerts and timestamped evidence required?", "Tool, alert and evidence"]),
    r("detail_expedited_carrier_requirements_capacidad_inmediata", "carrier_requirements", "response_driver", ["Capacidad inmediata", "¿Tiene experiencia expedited, same-day, team, recovery y dispatch dedicado?", "Experiencia y respuesta histórica"], ["Immediate capacity", "Does it have expedited, same-day, team, recovery and dedicated dispatch experience?", "Experience and historical response"]),
    r("detail_expedited_carrier_requirements_operacion_continua", "carrier_requirements", "response_tracking", ["Operación continua", "¿Cuenta con GPS en vivo, cobertura 24/7, unidad de respaldo y seguros?", "Cobertura, backup y límites"], ["Continuous operation", "Does it have live GPS, 24/7 coverage, a backup truck and insurance?", "Coverage, backup and limits"]),
    r("detail_expedited_carrier_requirements_referencias_y_aprobacion", "carrier_requirements", "response_default", ["Referencias y aprobación", "¿El cliente exige aprobación previa o referencias específicas?", "Criterio y evidencia"], ["References and approval", "Does the customer require prior approval or specific references?", "Criteria and evidence"]),
    r("detail_expedited_other_notes_restricciones_urgentes", "other_notes", "response_load_model", ["Restricciones urgentes", "¿Hay límites de premium, pickup, delivery, ruta o fuera de horario?", "Restricción y excepción"], ["Urgent restrictions", "Are there limits on premium, pickup, delivery, route or after-hours?", "Restriction and exception"]),
    r("detail_expedited_other_notes_plan_de_emergencia", "other_notes", "response_yes_no", ["Plan de emergencia", "¿Qué corredores no tienen recovery y qué contactos aplican?", "Corredor, contingencia y contacto"], ["Emergency plan", "Which corridors have no recovery and which contacts apply?", "Corridor, contingency and contact"]),
  ],
  time_critical: [
    r("detail_time_critical_logistics_model_tipo_de_criticidad", "logistics_model", "response_yes_no", ["Tipo de criticidad", "¿Es línea de producción, retail appointment, instalación, evento o riesgo de paro?", "Impacto, SLA y prioridad"], ["Criticality type", "Is it a production line, retail appointment, installation, event or shutdown risk?", "Impact, SLA and priority"]),
    r("detail_time_critical_logistics_model_rigidez_del_servicio", "logistics_model", "response_load_model", ["Rigidez del servicio", "¿Pickup y delivery son rígidos o flexibles? ¿Se permite parcial?", "Ventana, parcial y contingencia"], ["Service rigidity", "Are pickup and delivery rigid or flexible? Are partials allowed?", "Window, partial and contingency"]),
    r("detail_time_critical_logistics_model_capacidad_de_contingencia", "logistics_model", "response_default", ["Capacidad de contingencia", "¿Cuál es la capacidad primaria, backup y modelo de recovery?", "Capacidad, backup y responsable"], ["Contingency capacity", "What are the primary capacity, backup and recovery model?", "Capacity, backup and responsible party"]),
    r("detail_time_critical_operation_criteria_otif_y_tolerancia", "operation_criteria", "response_load_model", ["OTIF y tolerancia", "¿Cuál es el OTIF, tolerancia de pickup/delivery y retraso máximo?", "Meta, tolerancia y gatillo"], ["OTIF and tolerance", "What are the OTIF, pickup/delivery tolerance and maximum delay?", "Target, tolerance and trigger"]),
    r("detail_time_critical_operation_criteria_cita_y_zona_horaria", "operation_criteria", "response_yes_no", ["Cita y zona horaria", "¿Quién agenda, en qué zona horaria y cómo se confirma el check-in?", "Cita, timezone y evidencia"], ["Appointment and time zone", "Who schedules, in what time zone and how is check-in confirmed?", "Appointment, time zone and evidence"]),
    r("detail_time_critical_operation_criteria_reasignacion", "operation_criteria", "response_default", ["Reasignación", "¿Cuándo se escala y cuándo se reasigna la carga?", "Tiempo, contacto y umbral"], ["Reassignment", "When is the load escalated and when is it reassigned?", "Time, contact and threshold"]),
    r("detail_time_critical_business_rules_penalizacion_sla", "business_rules", "response_load_model", ["Penalización SLA", "¿Aplican late pickup, late delivery, no-show, chargeback o penalización por paro?", "Gatillo, monto y aprobador"], ["SLA penalty", "Do late pickup, late delivery, no-show, chargeback or shutdown penalties apply?", "Trigger, amount and approver"]),
    r("detail_time_critical_business_rules_reprogramacion_y_claims", "business_rules", "response_payment_terms", ["Reprogramación y claims", "¿Cómo se manejan reprogramación, cancelación, claims y créditos/débitos?", "Proceso y responsabilidad"], ["Rescheduling and claims", "How are rescheduling, cancellation, claims and credits/debits handled?", "Process and responsibility"]),
    r("detail_time_critical_business_rules_vigencia_del_compromiso", "business_rules", "response_default", ["Vigencia del compromiso", "¿Cuál es la vigencia de tarifa y del compromiso de servicio?", "Fecha, renovación y recotización"], ["Commitment validity", "What is the validity of the rate and of the service commitment?", "Date, renewal and re-quote"]),
    r("detail_time_critical_service_specifications_monitoreo_y_hitos", "service_specifications", "response_tracking", ["Monitoreo y hitos", "¿Qué GPS, hitos, alertas, monitoreo 24/7 y notificaciones se requieren?", "Cadencia y canal"], ["Monitoring and milestones", "What GPS, milestones, alerts, 24/7 monitoring and notifications are required?", "Cadence and channel"]),
    r("detail_time_critical_service_specifications_evidencia_de_cumplimiento", "service_specifications", "response_compliance", ["Evidencia de cumplimiento", "¿Qué evidencia con timestamp, check-in, carga, salida y POD es obligatoria?", "Evidencia y tiempo máximo"], ["Evidence of compliance", "What evidence with timestamp, check-in, loading, departure and POD is mandatory?", "Evidence and maximum time"]),
    r("detail_time_critical_carrier_requirements_experiencia_critica", "carrier_requirements", "response_load_model", ["Experiencia crítica", "¿Cuál es el cumplimiento histórico de citas, pickup, delivery y claims?", "KPIs y referencias"], ["Critical-service experience", "What is the historical performance on appointments, pickup, delivery and claims?", "KPIs and references"]),
    r("detail_time_critical_carrier_requirements_operacion_24_7", "carrier_requirements", "response_tracking", ["Operación 24/7", "¿Cuenta con dispatcher, GPS, backup, seguros y procedimiento de recovery?", "Cobertura y procedimiento"], ["24/7 operation", "Does it have a dispatcher, GPS, backup, insurance and a recovery procedure?", "Coverage and procedure"]),
    r("detail_time_critical_carrier_requirements_aprobacion_de_cliente", "carrier_requirements", "response_yes_no", ["Aprobación de cliente", "¿Hay requisitos de aprobación, certificación o historial de incidencias?", "Criterio y evidencia"], ["Customer approval", "Are there approval, certification or incident-history requirements?", "Criteria and evidence"]),
    r("detail_time_critical_other_notes_blackout_y_recepcion", "other_notes", "response_default", ["Blackout y recepción", "¿Hay blackout dates, no-early, no-late o reglas de recepción?", "Fecha, regla y excepción"], ["Blackout and receiving", "Are there blackout dates, no-early, no-late or receiving rules?", "Date, rule and exception"]),
    r("detail_time_critical_other_notes_contingencia_de_planta", "other_notes", "response_default", ["Contingencia de planta", "¿Hay destino alterno, ubicación de contingencia o excepción de penalización?", "Alternativa, gatillo y aprobador"], ["Plant contingency", "Is there an alternate destination, contingency location or penalty exception?", "Alternative, trigger and approver"]),
  ],
  port_drayage_us: [
    r("detail_port_drayage_us_logistics_model_flujo_portuario_us", "logistics_model", "response_default", ["Flujo portuario US", "¿Es import, export, empty, repositioning, port-to-warehouse, rail o CFS?", "Flujo, terminal y destino"], ["US port flow", "Is it import, export, empty, repositioning, port-to-warehouse, rail or CFS?", "Flow, terminal and destination"]),
    r("detail_port_drayage_us_logistics_model_contenedor_y_chassis", "logistics_model", "response_driver", ["Contenedor y chassis", "¿Qué tamaño, tipo, chassis, steamship line y proveedor aplican?", "Contenedor, chassis y naviera"], ["Container and chassis", "What size, type, chassis, steamship line and provider apply?", "Container, chassis and steamship line"]),
    r("detail_port_drayage_us_logistics_model_modelo_de_patio", "logistics_model", "response_load_model", ["Modelo de patio", "¿Aplica street turn, live unload, drop, pre-pull, transload o empty return?", "Movimiento y patio"], ["Yard model", "Does street turn, live unload, drop, pre-pull, transload or empty return apply?", "Move and yard"]),
    r("detail_port_drayage_us_operation_criteria_disponibilidad_y_free_time", "operation_criteria", "response_yes_no", ["Disponibilidad y free time", "¿Cuál es container availability, last free day, port cut-off y cita?", "Fecha, cita y ventana"], ["Availability and free time", "What are the container availability, last free day, port cut-off and appointment?", "Date, appointment and window"]),
    r("detail_port_drayage_us_operation_criteria_chassis_y_twic", "operation_criteria", "response_yes_no", ["Chassis y TWIC", "¿Cómo se valida chassis, peso, overweight, permiso y TWIC?", "Requisito y responsable"], ["Chassis and TWIC", "How are chassis, weight, overweight, permit and TWIC validated?", "Requirement and responsible party"]),
    r("detail_port_drayage_us_operation_criteria_holds_y_turn_time", "operation_criteria", "response_default", ["Holds y turn time", "¿Hay customs/exam hold, riesgo de demurrage o tiempo objetivo de puerto?", "Hold, riesgo y escalamiento"], ["Holds and turn time", "Is there a customs/exam hold, demurrage risk or target port time?", "Hold, risk and escalation"]),
    r("detail_port_drayage_us_business_rules_base_y_recargos_portuarios", "business_rules", "response_currency", ["Base y recargos portuarios", "¿Cómo se cobran base drayage, fuel, chassis, pre-pull, yard y congestión?", "Componente, moneda y tarifa"], ["Base and port surcharges", "How are base drayage, fuel, chassis, pre-pull, yard and congestion charged?", "Component, currency and rate"]),
    r("detail_port_drayage_us_business_rules_demurrage_y_detention", "business_rules", "response_default", ["Demurrage y detention", "¿Quién responde por demurrage, per diem, detention, empty return y after-hours?", "Responsable, free time y cargo"], ["Demurrage and detention", "Who is responsible for demurrage, per diem, detention, empty return and after-hours?", "Responsible party, free time and charge"]),
    r("detail_port_drayage_us_business_rules_vigencia_portuaria", "business_rules", "response_default", ["Vigencia portuaria", "¿Cuál es la vigencia y responsabilidad por free time o cambio de terminal?", "Fecha, regla y aprobador"], ["Port validity", "What is the validity period and responsibility for free time or terminal changes?", "Date, rule and approver"]),
    r("detail_port_drayage_us_service_specifications_equipo_de_contenedor", "service_specifications", "response_temperature", ["Equipo de contenedor", "¿Se requieren 20, 40, 40HC, 45, tri-axle, genset o reefer monitoring?", "Equipo y condición"], ["Container equipment", "Are 20, 40, 40HC, 45, tri-axle, genset or reefer monitoring required?", "Equipment and condition"]),
    r("detail_port_drayage_us_service_specifications_recibos_y_tracking", "service_specifications", "response_tracking", ["Recibos y tracking", "¿Qué TWIC, tracking, interchange receipt, pickup, POD y empty receipt se requieren?", "Documento, hito y evidencia"], ["Receipts and tracking", "What TWIC, tracking, interchange receipt, pickup, POD and empty receipt are required?", "Document, milestone and evidence"]),
    r("detail_port_drayage_us_carrier_requirements_acceso_portuario", "carrier_requirements", "response_default", ["Acceso portuario", "¿Tiene USDOT/MC, UIIA, TWIC y acceso a los puertos/terminales requeridos?", "Autoridad y cobertura"], ["Port access", "Does it have USDOT/MC, UIIA, TWIC and access to the required ports/terminals?", "Authority and coverage"]),
    r("detail_port_drayage_us_carrier_requirements_chassis_y_reefer", "carrier_requirements", "response_temperature", ["Chassis y reefer", "¿Tiene chassis, tri-axle, genset, reefer y operadores cercanos de respaldo?", "Equipo y capacidad"], ["Chassis and reefer", "Does it have chassis, tri-axle, genset, reefer and nearby backup drivers?", "Equipment and capacity"]),
    r("detail_port_drayage_us_carrier_requirements_experiencia_terminal", "carrier_requirements", "response_yes_no", ["Experiencia terminal", "¿Qué experiencia en citas, overweight, interchange y seguros puede demostrar?", "Experiencia y evidencia"], ["Terminal experience", "What experience with appointments, overweight, interchange and insurance can it demonstrate?", "Experience and evidence"]),
    r("detail_port_drayage_us_other_notes_riesgo_de_terminal", "other_notes", "response_default", ["Riesgo de terminal", "¿Hay congestión, terminal cerrada, customs hold, exam hold o falta de chassis?", "Evento, fecha y mitigación"], ["Terminal risk", "Is there congestion, a closed terminal, customs hold, exam hold or a chassis shortage?", "Event, date and mitigation"]),
    r("detail_port_drayage_us_other_notes_reglas_de_naviera", "other_notes", "response_default", ["Reglas de naviera", "¿Hay restricción de street turn, night gate, empty return o naviera?", "Regla, terminal y excepción"], ["Steamship line rules", "Are there street turn, night gate, empty return or steamship line restrictions?", "Rule, terminal and exception"]),
  ],
  port_drayage_mx: [
    r("detail_port_drayage_mx_logistics_model_flujo_portuario_mx", "logistics_model", "response_default", ["Flujo portuario MX", "¿Es import, export, empty, repositioning, port-to-plant, CEDIS, rail o yard transfer?", "Flujo, terminal y destino"], ["MX port flow", "Is it import, export, empty, repositioning, port-to-plant, DC, rail or yard transfer?", "Flow, terminal and destination"]),
    r("detail_port_drayage_mx_logistics_model_contenedor_y_liberacion", "logistics_model", "response_trailer", ["Contenedor y liberación", "¿Qué naviera, recinto, contenedor, plataforma, genset y agente aduanal aplican?", "Equipo, recinto y responsables"], ["Container and release", "What steamship line, bonded facility, container, chassis, genset and customs broker apply?", "Equipment, bonded facility and responsible parties"]),
    r("detail_port_drayage_mx_logistics_model_modelo_de_patio", "logistics_model", "response_load_model", ["Modelo de patio", "¿Aplica pre-pull, transload, live unload, drop, empty return o port-to-rail?", "Movimiento, patio y vacío"], ["Yard model", "Does pre-pull, transload, live unload, drop, empty return or port-to-rail apply?", "Move, yard and empty"]),
    r("detail_port_drayage_mx_operation_criteria_liberacion_y_citas", "operation_criteria", "response_yes_no", ["Liberación y citas", "¿Cuál es la disponibilidad, liberación aduanal/terminal, last free day y cita?", "Fecha, gate y ventana"], ["Release and appointments", "What are the availability, customs/terminal release, last free day and appointment?", "Date, gate and window"]),
    r("detail_port_drayage_mx_operation_criteria_plataforma_y_seguridad", "operation_criteria", "response_default", ["Plataforma y seguridad", "¿Cómo se valida plataforma, peso, sobrepeso, custodia, Carta Porte y evidencia?", "Requisito, responsable y hito"], ["Chassis and security", "How are chassis, weight, overweight, security escort, Carta Porte and evidence validated?", "Requirement, responsible party and milestone"]),
    r("detail_port_drayage_mx_operation_criteria_tiempo_portuario", "operation_criteria", "response_default", ["Tiempo portuario", "¿Cuál es el tiempo objetivo de carga/descarga, vacío y escalamiento?", "Horas, deadline y contacto"], ["Port time", "What is the target time for loading/unloading, empty return and escalation?", "Hours, deadline and contact"]),
    r("detail_port_drayage_mx_business_rules_flete_y_maniobras", "business_rules", "response_currency", ["Flete y maniobras", "¿Cómo se cobran flete, maniobra, pre-pull, patio, almacenaje y demoras?", "Componente, moneda y tarifa"], ["Freight and handling", "How are freight, handling, pre-pull, yard, storage and demurrage charged?", "Component, currency and rate"]),
    r("detail_port_drayage_mx_business_rules_accessorials_mx", "business_rules", "response_default", ["Accessorials MX", "¿Quién paga per diem, estadía, pernocta, falso flete, casetas, sobrepeso y reentrega?", "Responsable, gatillo y cargo"], ["MX accessorials", "Who pays per diem, detention, layover, dry run, tolls, overweight and redelivery?", "Responsible party, trigger and charge"]),
    r("detail_port_drayage_mx_business_rules_carta_porte_e_iva", "business_rules", "response_currency", ["Carta Porte e IVA", "¿Cómo se trata moneda, IVA, Carta Porte, vigencia y aprobación de accesoriales?", "Regla fiscal y comercial"], ["Carta Porte and IVA", "How are currency, IVA, Carta Porte, validity and accessorial approval handled?", "Tax and commercial rule"]),
    r("detail_port_drayage_mx_service_specifications_unidad_portacontenedor", "service_specifications", "response_tracking", ["Unidad portacontenedor", "¿Se requiere plataforma, sencillo/full, genset, GPS, geocerca o botón de pánico?", "Equipo y tecnología"], ["Container-hauling unit", "Is a chassis, single/double, genset, GPS, geofence or panic button required?", "Equipment and technology"]),
    r("detail_port_drayage_mx_service_specifications_documentos_y_evidencia", "service_specifications", "response_yes_no", ["Documentos y evidencia", "¿Qué EIR, POD, vacío, Carta Porte, pedimento y documentos de naviera aplican?", "Lista, formato y tiempo"], ["Documents and evidence", "What EIR, POD, empty return, Carta Porte, pedimento and steamship line documents apply?", "List, format and timing"]),
    r("detail_port_drayage_mx_carrier_requirements_permisos_y_acceso", "carrier_requirements", "response_yes_no", ["Permisos y acceso", "¿Tiene permisos federales, acceso a puerto, operadores acreditados y experiencia con naviera?", "Permiso, puerto y experiencia"], ["Permits and access", "Does it have federal permits, port access, accredited drivers and steamship line experience?", "Permit, port and experience"]),
    r("detail_port_drayage_mx_carrier_requirements_plataformas_y_respaldo", "carrier_requirements", "response_trailer", ["Plataformas y respaldo", "¿Cuenta con plataformas, capacidad full, sobrepeso, patio, pre-pull y unidades de respaldo?", "Equipo, patio y capacidad"], ["Chassis and backup", "Does it have chassis, double-trailer capacity, overweight, yard, pre-pull and backup trucks?", "Equipment, yard and capacity"]),
    r("detail_port_drayage_mx_carrier_requirements_seguridad_y_seguros", "carrier_requirements", "response_tracking", ["Seguridad y seguros", "¿Tiene GPS, seguridad, seguro de carga, responsabilidad civil y Carta Porte?", "Protocolo, límite y evidencia"], ["Security and insurance", "Does it have GPS, security, cargo insurance, civil liability and Carta Porte?", "Protocol, limit and evidence"]),
    r("detail_port_drayage_mx_other_notes_riesgo_portuario_mx", "other_notes", "response_default", ["Riesgo portuario MX", "¿Hay bloqueos, saturación, liberación tardía, cambio de patio o demora de naviera?", "Evento, fecha y mitigación"], ["MX port risk", "Are there blockades, saturation, late release, yard changes or steamship line delays?", "Event, date and mitigation"]),
    r("detail_port_drayage_mx_other_notes_restricciones_temporales", "other_notes", "response_default", ["Restricciones temporales", "¿Hay terminal cerrada, horario restringido, riesgo carretero o excepción documental?", "Regla, periodo y aprobador"], ["Temporary restrictions", "Is there a closed terminal, restricted hours, highway risk or documentation exception?", "Rule, period and approver"]),
  ],
};

export const segmentModelRows = (segment: string) => MODEL[segment] ?? [];
export const segmentKeyRows = (segment: string) => KEY[segment] ?? [];
export const segmentMoreRows = (segment: string) => MORE[segment] ?? [];

/** Answer lists (RFI_RUBRIC_RESPONSE_CATALOGS). */
export const RESPONSE_CATALOGS: Record<ResponseCatalog, CatalogOption[]> = {
  response_default: [option("Required", "Requerido"), option("Preferred", "Preferido"), option("Not required", "No requerido"), option("Not applicable", "No aplica"), option("Other / specify", "Otro / especificar")],
  response_yes_no: [option("Yes", "Sí"), option("No", "No"), option("Customer decides", "Decide el cliente"), option("Carrier decides", "Decide el transportista"), option("Other / specify", "Otro / especificar")],
  response_load_model: [option("Live", "En vivo"), option("Drop", "Drop (se deja la caja)"), option("Preload", "Precarga"), option("Drop & hook", "Drop & hook (intercambio de caja)"), option("Other / specify", "Otro / especificar")],
  response_tracking: [option("GPS", "GPS"), option("Check calls", "Llamadas de seguimiento"), option("GPS + check calls", "GPS + llamadas de seguimiento"), option("TMS / ELD feed", "Integración TMS / ELD"), option("Other / specify", "Otro / especificar")],
  response_update_frequency: [option("Every 1 hour", "Cada hora"), option("Every 2 hours", "Cada 2 horas"), option("Every 4 hours", "Cada 4 horas"), option("At milestones", "En cada hito"), option("Exception only", "Solo excepciones"), option("Other / specify", "Otro / especificar")],
  response_payment_terms: [option("Net 15", "Crédito a 15 días (Net 15)"), option("Net 30", "Crédito a 30 días (Net 30)"), option("Net 45", "Crédito a 45 días (Net 45)"), option("Net 60", "Crédito a 60 días (Net 60)"), option("Other / specify", "Otro / especificar")],
  response_currency: [option("MXN", "MXN"), option("USD", "USD"), option("CAD", "CAD"), option("Other / specify", "Otro / especificar")],
  response_fuel: [option("Included", "Incluido"), option("Indexed", "Indexado"), option("Separate", "Por separado"), option("Not applicable", "No aplica"), option("Other / specify", "Otro / especificar")],
  response_driver: [option("Single", "Un chofer"), option("Team", "Doble chofer (team)"), option("B1", "B1"), option("Hazmat", "Hazmat"), option("Single + B1", "Un chofer + B1"), option("Team + B1", "Doble chofer + B1"), option("Other / specify", "Otro / especificar")],
  response_trailer: [option("Dry van", "Caja seca"), option("Reefer", "Refrigerado"), option("Flatbed", "Plataforma"), option("Specialized", "Especializado"), option("Other / specify", "Otro / especificar")],
  response_temperature: [option("Ambient", "Temperatura ambiente"), option("Temperature controlled", "Temperatura controlada"), option("Reefer", "Refrigerado"), option("Not applicable", "No aplica"), option("Other / specify", "Otro / especificar")],
  response_carrier_type: [option("Asset-based", "Con flota propia (asset-based)"), option("Broker", "Broker"), option("3PL", "3PL"), option("Mixed", "Mixto"), option("Other / specify", "Otro / especificar")],
  response_compliance: [option("Required", "Requerido"), option("Preferred", "Preferido"), option("Not required", "No requerido"), option("Not applicable", "No aplica"), option("Other / specify", "Otro / especificar")],
};

/** An answer as the shipper reads it; free text stays as typed. */
export function responseLabel(catalog: ResponseCatalog, value: string, lang: Lang) {
  const match =
    RESPONSE_CATALOGS[catalog]?.find((entry) => entry.value === value) ??
    RESPONSE_CATALOGS.response_default.find((entry) => entry.value === value);
  return match ? match[lang] : value;
}
