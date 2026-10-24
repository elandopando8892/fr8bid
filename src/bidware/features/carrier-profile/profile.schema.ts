/**
 * The carrier profile questionnaire. Section keys, field keys and option
 * values are the SAME ones rateware's carrier-profile page writes into
 * `vendors.profile_data`, so a profile saved from either app reads the same in
 * both. Only the labels are Bidware's.
 */

export type Lang = "es" | "en";
export type Text = Record<Lang, string>;

export type FieldType = "text" | "email" | "textarea" | "select" | "checks";

export interface FieldSpec {
  key: string;
  label: Text;
  type: FieldType;
  options?: string[];
  recommended?: boolean;
  wide?: boolean;
}

export interface StepSpec {
  key: string;
  label: Text;
  help: Text;
  fields: FieldSpec[];
}

/**
 * Columns of the vendor record itself (not profile_data). `notes` is left out
 * on purpose: in the CRM it holds MARKSMAN's internal notes, and the backend
 * would let the carrier read and overwrite them.
 */
export const COMPANY_STEP: StepSpec = {
  key: "company",
  label: { es: "Empresa", en: "Company" },
  help: {
    es: "Confirma la identidad de la empresa y el canal principal de contacto.",
    en: "Confirm the company identity and main contact channel.",
  },
  fields: [
    { key: "vendor_name", label: { es: "Nombre comercial", en: "Company name" }, type: "text", recommended: true },
    { key: "domain", label: { es: "Sitio web / dominio", en: "Website / domain" }, type: "text" },
    { key: "primary_email", label: { es: "Correo", en: "Email" }, type: "email", recommended: true },
    { key: "whatsapp_phone", label: { es: "WhatsApp / teléfono", en: "WhatsApp / phone" }, type: "text" },
    {
      key: "preferred_channel",
      label: { es: "Canal preferido", en: "Preferred channel" },
      type: "select",
      options: ["email", "whatsapp", "portal"],
    },
    {
      key: "coverage_notes",
      label: { es: "Resumen de cobertura", en: "Coverage summary" },
      type: "textarea",
      wide: true,
    },
  ],
};

export const PROFILE_STEPS: StepSpec[] = [
  {
    key: "general",
    label: { es: "Contacto principal", en: "Main contact" },
    help: {
      es: "Indica quién responde este perfil y dónde opera la empresa.",
      en: "Tell us who owns this profile and where the company operates.",
    },
    fields: [
      { key: "full_name", label: { es: "Persona que responde", en: "Profile respondent" }, type: "text", recommended: true },
      {
        key: "company_type",
        label: { es: "Tipo de empresa", en: "Company type" },
        type: "select",
        recommended: true,
        options: ["Persona Fisica", "Persona Moral"],
      },
      {
        key: "operating_country",
        label: { es: "País de operación", en: "Operating country" },
        type: "select",
        recommended: true,
        options: ["Mexico", "Estados Unidos de America", "Canada"],
      },
      {
        // The carrier's own notes. Never vendors.notes: that column is
        // MARKSMAN's internal CRM field and the API no longer exposes it.
        key: "carrier_notes",
        label: { es: "Notas adicionales para MARKSMAN", en: "Additional notes for MARKSMAN" },
        type: "textarea",
        wide: true,
      },
    ],
  },
  {
    key: "identity",
    label: { es: "Identidad legal", en: "Legal identity" },
    help: {
      es: "Agrega datos legales, fiscales y de autoridad operativa.",
      en: "Add legal, tax and operating authority identifiers.",
    },
    fields: [
      { key: "legal_name", label: { es: "Razón social", en: "Legal name" }, type: "text", recommended: true },
      { key: "fiscal_address", label: { es: "Domicilio fiscal", en: "Fiscal address" }, type: "textarea", wide: true },
      { key: "rfc", label: { es: "RFC", en: "RFC" }, type: "text" },
      { key: "usdot_number", label: { es: "Número USDOT", en: "USDOT number" }, type: "text" },
      { key: "mc_number", label: { es: "Número MC", en: "MC number" }, type: "text" },
      { key: "scac_code", label: { es: "Código SCAC", en: "SCAC code" }, type: "text" },
      { key: "tax_id", label: { es: "Tax ID", en: "Tax ID" }, type: "text" },
      { key: "caat_code", label: { es: "Código CAAT", en: "CAAT code" }, type: "text" },
    ],
  },
  {
    key: "carrier_profile",
    label: { es: "Servicios y cobertura", en: "Services and coverage" },
    help: {
      es: "Selecciona servicios, regiones y cruces que puedes cubrir.",
      en: "Select the services, regions and crossings you can support.",
    },
    fields: [
      {
        key: "geographic_scope",
        label: { es: "Alcance geográfico", en: "Geographic scope" },
        type: "checks",
        recommended: true,
        options: ["Mexico", "Estados Unidos", "Canada"],
      },
      {
        key: "service_scope",
        label: { es: "Tipo de servicio", en: "Service scope" },
        type: "checks",
        recommended: true,
        options: [
          "Local MEX",
          "Regional MEX",
          "Domestic MEX",
          "Border drayage",
          "Cross-border D2D",
          "Door 2 Door with B1 drivers",
          "Power Only",
          "Transfer",
        ],
      },
      {
        key: "regional_coverage",
        label: { es: "Cobertura regional", en: "Regional coverage" },
        type: "checks",
        recommended: true,
        options: [
          "Noreste MX",
          "Noroeste MX",
          "Bajio MX",
          "Centro MX",
          "Occidente MX",
          "Golfo MX",
          "Southwest US",
          "Southeast US",
          "Midwest US",
          "Northeast US",
          "West US",
          "Central CA",
          "West CA",
        ],
      },
      {
        key: "border_crossings",
        label: { es: "Ciudades fronterizas", en: "Border cities" },
        type: "checks",
        options: [
          "Tijuana / San Diego",
          "Mexicali / Calexico",
          "Nogales",
          "Ciudad Juarez / El Paso",
          "Piedras Negras / Eagle Pass",
          "Nuevo Laredo / Laredo",
          "Reynosa / Pharr",
          "Matamoros / Brownsville",
        ],
      },
      {
        key: "mexican_ports",
        label: { es: "Puertos mexicanos", en: "Mexican ports" },
        type: "checks",
        options: ["Altamira", "Ensenada", "Lazaro Cardenas", "Manzanillo", "Mazatlan", "Progreso", "Veracruz"],
      },
      {
        key: "value_added_services",
        label: { es: "Servicios adicionales", en: "Value added services" },
        type: "checks",
        options: [
          "Hazmat",
          "Team driver",
          "Hot shot",
          "Fumigation",
          "Cross dock",
          "Warehousing",
          "Drop and hook",
          "Custody",
          "Cargo insurance",
          "Overweight / oversized",
        ],
      },
      {
        key: "certifications",
        label: { es: "Certificaciones", en: "Certifications" },
        type: "checks",
        options: [
          "US Bonded Carrier",
          "TWIC",
          "SmartWay",
          "Transporte Limpio",
          "Hazmat",
          "ACE",
          "FAST",
          "CTPAT",
          "OEA",
          "ISO9001",
          "R-Control",
        ],
      },
      {
        key: "interchange_agreements",
        label: { es: "Convenios de intercambio", en: "Interchange agreements" },
        type: "textarea",
        wide: true,
      },
    ],
  },
  {
    key: "insurance_infrastructure",
    label: { es: "Equipo y seguros", en: "Equipment and insurance" },
    help: {
      es: "Comparte equipo disponible, terminales y notas de seguro.",
      en: "Share available equipment, terminals and insurance notes.",
    },
    fields: [
      {
        key: "equipment_types",
        label: { es: "Equipo disponible", en: "Available equipment" },
        type: "checks",
        recommended: true,
        options: [
          "Power Only",
          "Chassis",
          "Conestoga",
          "Lowboy",
          "Stepdeck",
          "Flatbed",
          "Dry Van",
          "Reefer",
          "Straight truck",
          "3.5 tons",
          "1.5 tons",
        ],
      },
      { key: "equipment_notes", label: { es: "Notas de equipo", en: "Equipment notes" }, type: "textarea", wide: true },
      {
        key: "coverage_amounts",
        label: { es: "Montos de cobertura de seguro", en: "Insurance coverage amounts" },
        type: "textarea",
        wide: true,
      },
      {
        key: "mexico_terminal_zips",
        label: { es: "CP / ciudades de terminales en México", en: "Mexico terminal ZIPs / cities" },
        type: "textarea",
      },
      {
        key: "us_ca_terminal_zips",
        label: { es: "ZIPs de terminales US / Canadá", en: "US / Canada terminal ZIPs" },
        type: "textarea",
      },
    ],
  },
  {
    key: "payments",
    label: { es: "Pagos", en: "Payments" },
    help: {
      es: "Datos de pago opcionales. También puedes enviar documentos legales por separado.",
      en: "Optional billing details. You can also send legal documents separately.",
    },
    fields: [
      { key: "bank_name", label: { es: "Banco", en: "Bank name" }, type: "text" },
      { key: "beneficiary_company", label: { es: "Beneficiario", en: "Beneficiary company" }, type: "text" },
      { key: "account_number", label: { es: "Número de cuenta", en: "Account number" }, type: "text" },
      { key: "clabe_number", label: { es: "CLABE", en: "CLABE" }, type: "text" },
      { key: "routing_number", label: { es: "Routing number", en: "Routing number" }, type: "text" },
      {
        key: "factoring_company",
        label: { es: "Empresa de factoring", en: "Factoring company" },
        type: "select",
        options: ["Si", "No"],
      },
      { key: "payment_terms", label: { es: "Términos de pago", en: "Payment terms" }, type: "textarea", wide: true },
    ],
  },
  {
    key: "key_contacts",
    label: { es: "Contactos clave", en: "Key contacts" },
    help: {
      es: "Incluye nombre, correo y teléfono por rol si lo tienes.",
      en: "Use name, email and phone per role when available.",
    },
    fields: [
      { key: "general_manager", label: { es: "Gerente general", en: "General manager" }, type: "textarea" },
      { key: "operations_manager", label: { es: "Gerente de operaciones", en: "Operations manager" }, type: "textarea" },
      { key: "safety_manager", label: { es: "Gerente de seguridad", en: "Safety manager" }, type: "textarea" },
      { key: "finance_manager", label: { es: "Gerente de finanzas", en: "Finance manager" }, type: "textarea" },
      { key: "commercial_manager", label: { es: "Gerente comercial", en: "Commercial manager" }, type: "textarea" },
      { key: "key_account_manager", label: { es: "Key account manager", en: "Key account manager" }, type: "textarea" },
    ],
  },
];

export const ALL_STEPS: StepSpec[] = [COMPANY_STEP, ...PROFILE_STEPS];

/** Option values are stored as-is; only these few get a friendlier label. */
export { OPTION_LABEL } from "@/i18n/carrier-profile";
