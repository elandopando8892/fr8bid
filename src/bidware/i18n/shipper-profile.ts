import type { PublicContact, PublicLocation, Section } from "@/features/shipper-profile/shipperProfile.service";
export type Lang = "es" | "en";
export type Text = Record<Lang, string>;
const t = (es: string, en: string): Text => ({ es, en });

export const COPY = {
  spanishLanguage: t("Español", "Spanish"),
  eyebrow: t("Perfil privado de cliente", "Private customer profile"),
  intro: t(
    "Completa o corrige los datos de tu empresa para trabajar con MARKSMAN. Nada es obligatorio salvo el nombre; guarda cuando quieras y vuelve después con la misma liga.",
    "Complete or correct your company's details to work with MARKSMAN. Only the name is required; save any time and come back later with the same link.",
  ),
  privacy: t("Esta liga privada solo actualiza el registro de tu empresa.", "This private link only updates your own company's record."),
  loading: t("Abriendo tu perfil…", "Opening your profile…"),
  missing: t("Abre la liga privada que te envió el equipo de MARKSMAN.", "Open the private link the MARKSMAN team sent you."),
  gone: t(
    "Esta liga ya no es válida (venció o fue revocada). Pide una nueva al equipo de MARKSMAN.",
    "This link is no longer valid (it expired or was revoked). Ask the MARKSMAN team for a new one.",
  ),
  expires: t("Liga segura · vence", "Secure link · expires"),
  company: t("Empresa e identidad legal", "Company & legal identity"),
  companyHelp: t("Cómo se llama tu empresa y dónde está.", "Your company's name and location."),
  contacts: t("Contactos", "Contacts"),
  contactsHelp: t("Las personas con quienes coordinamos: compras, tráfico, facturación.", "The people we coordinate with: procurement, traffic, billing."),
  addContact: t("Agregar contacto", "Add contact"),
  locations: t("Direcciones y sitios", "Addresses & operating sites"),
  locationsHelp: t("Plantas, almacenes y centros de distribución donde cargamos o descargamos.", "Plants, warehouses and distribution centers where we load or unload."),
  addLocation: t("Agregar sitio", "Add site"),
  remove: t("Quitar", "Remove"),
  submitter: t("¿Quién llena este formulario?", "Who is filling in this form?"),
  submitterName: t("Tu nombre *", "Your name *"),
  submitterEmail: t("Tu correo *", "Your email *"),
  save: t("Guardar perfil", "Save profile"),
  saving: t("Guardando…", "Saving…"),
  saved: t("Gracias: recibimos tu perfil. Puedes seguir editándolo mientras la liga esté vigente.", "Thank you: we received your profile. You can keep editing it while the link is valid."),
  nothing: t("No hay cambios que guardar.", "There are no changes to save."),
  nameRequired: t("El nombre de la empresa no puede quedar vacío.", "The company name can't be empty."),
  badEmail: t("Revisa los correos: alguno no es válido.", "Check the emails: one is not valid."),
  whoRequired: t("Escribe tu nombre y tu correo para saber quién envió el perfil.", "Enter your name and email so we know who sent the profile."),
  primary: t("Contacto principal", "Primary contact"),
  appointment: t("Requiere cita", "Appointment required"),
};

export const SHIPPER_FIELDS: { key: string; label: Text }[] = [
  { key: "shipper_name", label: t("Nombre de la empresa *", "Company name *") },
  { key: "legal_name", label: t("Razón social", "Legal name") },
  { key: "industry", label: t("Industria", "Industry") },
  { key: "website", label: t("Sitio web", "Website") },
  { key: "domain", label: t("Dominio de correo", "Business domain") },
  { key: "headquarters_city", label: t("Ciudad (sede)", "HQ city") },
  { key: "headquarters_state", label: t("Estado (sede)", "HQ state") },
  { key: "headquarters_country", label: t("País", "Country") },
];

export const SECTIONS: { key: Section; title: Text; help: Text; fields: { key: string; label: Text; long?: boolean }[] }[] = [
  {
    key: "company",
    title: t("Más sobre la empresa", "More about the company"),
    help: t("Datos legales y comerciales.", "Legal and commercial details."),
    fields: [
      { key: "dba_name", label: t("Nombre comercial (DBA)", "DBA name") },
      { key: "legal_form", label: t("Tipo de sociedad", "Legal form") },
      { key: "company_type", label: t("Tipo de empresa", "Company type") },
      { key: "duns_number", label: t("DUNS", "DUNS") },
      { key: "owner_name", label: t("Responsable de la cuenta", "Account owner") },
      { key: "owner_phone", label: t("Teléfono del responsable", "Account owner phone") },
      { key: "source", label: t("¿Cómo nos conociste?", "How did you hear about us?") },
      { key: "solution_type", label: t("Tipo de cliente / solución", "Customer type / solution") },
    ],
  },
  {
    key: "onboarding",
    title: t("Integración y operación", "TMS & onboarding"),
    help: t("Cómo nos conectamos con tu operación.", "How we connect with your operation."),
    fields: [
      { key: "tms_provider", label: t("Proveedor de TMS", "TMS provider") },
      { key: "integration_method", label: t("Método de integración", "Integration method") },
      { key: "integration_contact", label: t("Contacto de integración", "Integration contact") },
      { key: "api_edi", label: t("Capacidad API / EDI", "API / EDI capability") },
      { key: "main_communication", label: t("Canal principal de comunicación", "Main communication channel") },
      { key: "tracking_period", label: t("Frecuencia de rastreo", "Tracking period") },
      { key: "onboarding_notes", label: t("Notas para el arranque", "Operational onboarding notes"), long: true },
    ],
  },
  {
    key: "network",
    title: t("Red y alcance del servicio", "Network & service scope"),
    help: t("Dónde y qué movemos para ti.", "Where and what we move for you."),
    fields: [
      { key: "geographic_scope", label: t("Alcance geográfico", "Geographic scope") },
      { key: "service_scope", label: t("Alcance del servicio", "Service scope") },
      { key: "mx_coverage", label: t("Cobertura en México", "Mexico regional coverage") },
      { key: "us_ca_coverage", label: t("Cobertura en EE. UU. / Canadá", "US / Canada coverage") },
      { key: "primary_cargo", label: t("Carga principal", "Primary cargo") },
      { key: "service_requirements", label: t("Requisitos de servicio u operación", "Service or operating requirements"), long: true },
    ],
  },
  {
    key: "billing",
    title: t("Facturación", "Billing"),
    help: t("A quién y cómo facturamos.", "Who we invoice and how."),
    fields: [
      { key: "mex_pay_to_entity", label: t("Entidad que paga en México", "Mexico pay-to entity") },
      { key: "mex_rfc", label: t("RFC", "Mexico RFC") },
      { key: "mex_cfdi_tax", label: t("Uso de CFDI / régimen fiscal", "Mexico CFDI / tax regime") },
      { key: "usa_pay_to_entity", label: t("Entidad que paga en EE. UU.", "USA pay-to entity") },
      { key: "usa_ein", label: t("EIN (EE. UU.)", "USA EIN") },
      { key: "usa_invoice_reference", label: t("Referencia de factura (EE. UU.)", "USA invoice reference") },
      { key: "usa_credit_type", label: t("Tipo de crédito (EE. UU.)", "USA credit type") },
      { key: "can_row_pay_to_entity", label: t("Entidad que paga en Canadá / otros", "Canada / ROW pay-to entity") },
      { key: "tax_id", label: t("ID fiscal (EIN / RFC)", "Tax ID / EIN / RFC") },
      { key: "credit_limit", label: t("Límite de crédito", "Credit limit") },
      { key: "credit_terms", label: t("Términos de crédito", "Credit terms") },
      { key: "billing_reference", label: t("Referencia de facturación", "Billing reference") },
      { key: "billing_notes", label: t("Requisitos de facturación", "Billing requirements"), long: true },
    ],
  },
];

export const CONTACT_FIELDS: { key: keyof PublicContact; label: Text; type?: string }[] = [
  { key: "name", label: t("Nombre", "Name") },
  { key: "title", label: t("Puesto", "Title") },
  { key: "department", label: t("Área", "Department") },
  { key: "email", label: t("Correo", "Email"), type: "email" },
  { key: "phone", label: t("Teléfono", "Phone"), type: "tel" },
  { key: "whatsapp_phone", label: t("WhatsApp", "WhatsApp"), type: "tel" },
];

export const LOCATION_FIELDS: { key: keyof PublicLocation; label: Text; type?: string; wide?: boolean }[] = [
  { key: "location_name", label: t("Nombre del sitio", "Location name") },
  { key: "location_type", label: t("Tipo (planta, almacén…)", "Type (plant, warehouse…)") },
  { key: "address_line_1", label: t("Dirección", "Address"), wide: true },
  { key: "address_line_2", label: t("Dirección (línea 2)", "Address line 2"), wide: true },
  { key: "city", label: t("Ciudad", "City") },
  { key: "state_code", label: t("Estado", "State") },
  { key: "country_code", label: t("País", "Country") },
  { key: "postal_code", label: t("Código postal", "Postal code") },
  { key: "contact_name", label: t("Contacto del sitio", "Site contact") },
  { key: "contact_email", label: t("Correo del sitio", "Site email"), type: "email" },
  { key: "contact_phone", label: t("Teléfono del sitio", "Site phone"), type: "tel" },
  { key: "operating_hours", label: t("Horario", "Operating hours") },
  { key: "handling_type", label: t("Carga / descarga", "Handling") },
];
