/**
 * Reading a shipper file the way rateware's Shipper CRM does: a CSV or a single
 * sheet is a flat list; a workbook with Accounts plus Contacts or Opportunities
 * is a CRM export. Headers are matched by rateware's aliases, and the first row
 * that names a known column is the header.
 */
export type Row = Record<string, unknown>;

/** rateware's import reads headers this way: lowercase, anything else "_". */
export const canonical = (key: unknown) =>
  String(key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** The column names rateware accepts for each field (import_shippers). */
export const ALIASES = {
  name: ["shipper_name", "shipper", "customer", "company", "company_name", "account_name", "name"],
  domain: ["domain", "company_domain"],
  email: ["primary_contact_email", "primary_email", "contact_email", "email"],
  contact: ["primary_contact_name", "primary_contact", "contact_name"],
  city: ["headquarters_city", "city", "hq_city"],
  state: ["headquarters_state", "state", "state_code", "hq_state"],
  status: ["status"],
  stage: ["relationship_stage", "relationship", "account_stage"],
  external: ["external_account_id", "account_id", "organization_id", "org_id", "id"],
};
const STATUSES = new Set(["prospect", "active", "inactive", "archived"]);
const STAGES = new Set(["target", "qualified", "customer", "at_risk", "inactive"]);
const SHEETS = {
  accounts: ["accounts", "account", "shippers", "cuentas"],
  contacts: ["contacts", "contact", "people", "contactos"],
  opportunities: ["opportunities", "opportunity", "deals", "oportunidades"],
};
const MARKERS = new Set(["external_account_id", "external_contact_id", "external_opportunity_id", "shipper_name", "account_name"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const pick = (row: Row, aliases: string[]) => {
  const byKey = new Map(Object.entries(row).map(([key, value]) => [canonical(key), String(value ?? "").trim()]));
  for (const alias of aliases) {
    const value = byKey.get(alias);
    if (value) return value;
  }
  return "";
};
const cleanDomain = (value: string) => value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");

export interface Preview {
  line: number;
  row: Row;
  name: string;
  domain: string;
  contact: string;
  city: string;
  problem: string | null;
}

export interface Parsed {
  file: string;
  relational: boolean;
  accounts: Row[];
  contacts: Row[];
  opportunities: Row[];
  preview: Preview[];
}

/** A sheet's rows as objects, from the first row that looks like the header. */
function sheetRows(XLSX: typeof import("xlsx"), sheet: import("xlsx").WorkSheet) {
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
  let headerAt = grid.findIndex((cells) => cells.some((cell) => MARKERS.has(canonical(cell))));
  if (headerAt < 0) headerAt = grid.findIndex((cells) => cells.some((cell) => String(cell ?? "").trim()));
  if (headerAt < 0) return { rows: [] as Row[], headerAt: 0 };
  const headers = grid[headerAt].map((cell) => String(cell ?? "").trim());
  const rows = grid
    .slice(headerAt + 1)
    .filter((cells) => cells.some((cell) => String(cell ?? "").trim()))
    .map((cells) => Object.fromEntries(headers.map((header, i) => [header || `col_${i + 1}`, cells[i] ?? ""])));
  return { rows, headerAt };
}

export async function parseFile(file: Pick<File, "name" | "text" | "arrayBuffer">, isAdmin: boolean): Promise<Parsed> {
  const XLSX = await import("xlsx");
  const book = /\.csv$/i.test(file.name) ? XLSX.read(await file.text(), { type: "string" }) : XLSX.read(await file.arrayBuffer());
  const find = (names: string[]) => book.SheetNames.find((name) => names.includes(canonical(name)));
  const accountsSheet = find(SHEETS.accounts);
  const contactsSheet = find(SHEETS.contacts);
  const opportunitiesSheet = find(SHEETS.opportunities);
  const relational = Boolean(accountsSheet && (contactsSheet || opportunitiesSheet));
  const main = sheetRows(XLSX, book.Sheets[relational ? accountsSheet! : book.SheetNames[0]]);
  const seenDomains = new Set<string>();
  const preview = main.rows.map((row, i): Preview => {
    const name = pick(row, ALIASES.name);
    const domain = cleanDomain(pick(row, ALIASES.domain));
    const email = pick(row, ALIASES.email);
    const status = pick(row, ALIASES.status).toLowerCase();
    const stage = pick(row, ALIASES.stage).toLowerCase();
    let problem: string | null = null;
    if (!name) problem = "Falta el nombre";
    else if (email && !EMAIL.test(email)) problem = "Correo no válido";
    else if (status && !STATUSES.has(status)) problem = `Estado desconocido: ${status}`;
    else if (stage && !STAGES.has(stage)) problem = `Relación desconocida: ${stage}`;
    else if (!relational && domain && seenDomains.has(domain)) problem = "Dominio repetido en el archivo";
    else if (status === "archived" && !isAdmin) problem = "Archivar es de un Administrador";
    if (domain) seenDomains.add(domain);
    return { line: main.headerAt + i + 2, row, name, domain, contact: pick(row, ALIASES.contact) || email, city: pick(row, ALIASES.city), problem };
  });
  return {
    file: file.name,
    relational,
    accounts: main.rows,
    contacts: contactsSheet ? sheetRows(XLSX, book.Sheets[contactsSheet]).rows : [],
    opportunities: opportunitiesSheet ? sheetRows(XLSX, book.Sheets[opportunitiesSheet]).rows : [],
    preview,
  };
}

/** The template: Accounts, Contacts and Opportunities with one example each, and a guide. */
export async function buildTemplate() {
  const XLSX = await import("xlsx");
  const sheet = (rows: unknown[][]) => XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["external_account_id", "shipper_name", "legal_name", "domain", "industry", "status", "relationship_stage", "primary_contact_name", "primary_contact_email", "primary_contact_phone", "headquarters_city", "headquarters_state", "headquarters_country", "tags", "notes"],
      ["ACC-001", "Grupo Ejemplo", "Grupo Ejemplo SA de CV", "ejemplo.com", "Alimentos", "prospect", "target", "Ana López", "ana@ejemplo.com", "+52 81 0000 0000", "Monterrey", "NL", "MX", "contrato; 2027", ""],
    ]),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["external_contact_id", "external_account_id", "contact_name", "title", "department", "email", "phone", "whatsapp_phone", "preferred_channel", "notes"],
      ["CON-001", "ACC-001", "Ana López", "Gerente de logística", "Tráfico", "ana@ejemplo.com", "+52 81 0000 0000", "", "email", ""],
    ]),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["external_opportunity_id", "external_account_id", "opportunity_name", "stage", "probability", "estimated_value", "currency", "expected_close_date", "account_owner_email", "notes"],
      ["OPP-001", "ACC-001", "Contrato Monterrey → Laredo", "discovery", "30", "120000", "USD", "2026-12-15", "", ""],
    ]),
    "Opportunities",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["Cómo usar esta plantilla"],
      ["1. Una fila por cuenta en Accounts; solo shipper_name es obligatorio."],
      ["2. external_account_id liga los contactos y las oportunidades con su cuenta; volver a importar el mismo id actualiza en lugar de duplicar."],
      ["3. Si el dominio ya existe en un shipper vigente, esa fila lo actualiza (solo los campos que traigan valor)."],
      ["4. status: prospect, active, inactive · relationship_stage: target, qualified, customer, at_risk, inactive."],
      ["5. stage de oportunidades: identified, discovery, rfi, rfx, proposal, negotiation, won, lost."],
      ["6. Si solo necesitas cuentas, deja solo la hoja Accounts (o sube un CSV)."],
    ]),
    "Guía",
  );
  return book;
}

export async function downloadTemplate() {
  const XLSX = await import("xlsx");
  XLSX.writeFile(await buildTemplate(), "plantilla-shippers-marksman.xlsx");
}
