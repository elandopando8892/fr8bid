import { callRatewareApi } from "@/lib/api-client";
import type { ProfileRequest, ShipperRecord } from "./crm.service";

/**
 * Shippers (customers and prospects) of the shared CRM, the `shippers` table
 * rateware's Shipper CRM manages. Reads and writes go through rateware-api:
 * list_shippers, get_shipper, create_shipper, update_shipper, archive_shippers
 * and, for contacts, save_shipper_record / delete_shipper_record.
 */
export interface Shipper {
  id: string;
  shipper_name: string | null;
  legal_name: string | null;
  domain: string | null;
  website: string | null;
  industry: string | null;
  status: string | null;
  relationship_stage: string | null;
  segment: string | null;
  revenue_tier: string | null;
  account_owner_email: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  headquarters_country: string | null;
  tags: string[] | null;
  notes: string | null;
  source: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface ShipperContact {
  id: string;
  contact_name: string | null;
  title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  preferred_channel: string | null;
  status: string | null;
  is_primary: boolean | null;
  notes: string | null;
  [key: string]: unknown;
}

export interface ShipperRatebook {
  id: string;
  name?: string | null;
  status?: string | null;
  lane_count?: number | null;
  [key: string]: unknown;
}

export interface ShipperDetail {
  row: Shipper;
  contacts: ShipperContact[];
  ratebooks: ShipperRatebook[];
  locations: ShipperRecord[];
  lanes: ShipperRecord[];
  rfis: ShipperRecord[];
  opportunities: ShipperRecord[];
  actions: ShipperRecord[];
  profile_requests: ProfileRequest[];
}

/** The editable text fields, in the order the detail form shows them. */
export type ShipperField =
  | "shipper_name"
  | "legal_name"
  | "domain"
  | "website"
  | "industry"
  | "segment"
  | "status"
  | "relationship_stage"
  | "account_owner_email"
  | "primary_contact_name"
  | "primary_contact_email"
  | "primary_contact_phone"
  | "headquarters_city"
  | "headquarters_state"
  | "headquarters_country"
  | "notes";

export type NewShipperInput = Partial<Record<ShipperField, string>> & { shipper_name: string };

export const SHIPPER_STATUS_LABEL: Record<string, string> = {
  prospect: "Prospecto",
  active: "Activo",
  inactive: "Inactivo",
  archived: "Archivado",
};

export const SHIPPER_STAGE_LABEL: Record<string, string> = {
  target: "Objetivo",
  qualified: "Calificado",
  customer: "Cliente",
  at_risk: "En riesgo",
  inactive: "Inactivo",
};

export const SHIPPER_TONE: Record<string, "green" | "blue" | "amber" | ""> = {
  active: "green",
  prospect: "blue",
  inactive: "amber",
  archived: "",
};

export const CHANNEL_LABEL: Record<string, string> = {
  email: "Correo",
  phone: "Teléfono",
  whatsapp: "WhatsApp",
};

export const shipperLabel = (row: Pick<Shipper, "shipper_name" | "legal_name" | "id">) =>
  row.shipper_name || row.legal_name || row.id;

export const listShippers = (params: { search?: string; status?: string; offset?: number; limit?: number } = {}) =>
  callRatewareApi<{ rows: Shipper[]; total: number; limit: number; offset: number }>("list_shippers", {
    search: params.search?.trim() || undefined,
    status: params.status || undefined,
    offset: params.offset ?? 0,
    limit: params.limit ?? 100,
    sort_by: "shipper_name",
    sort_direction: "asc",
  });

/**
 * One shipper with everything under it. rateware-api's get_shipper returns
 * the sites, lanes and RFIs too; shipper-directory-api's leaves them empty.
 */
export async function getShipper(id: string): Promise<ShipperDetail> {
  const res = await callRatewareApi<Partial<ShipperDetail> & { row: Shipper }>("get_shipper", { id });
  return {
    row: res.row,
    contacts: res.contacts ?? [],
    ratebooks: res.ratebooks ?? [],
    locations: res.locations ?? [],
    lanes: res.lanes ?? [],
    rfis: res.rfis ?? [],
    opportunities: res.opportunities ?? [],
    actions: res.actions ?? [],
    profile_requests: res.profile_requests ?? [],
  };
}

/** The backend refuses a second live shipper with the same domain with a raw database error. */
function friendlyShipperError(error: unknown): Error {
  const message = (error as Error)?.message ?? String(error);
  if (/duplicate key|unique constraint|shippers_owner_domain/i.test(message)) {
    return new Error("Ya hay un shipper con ese dominio. Búscalo en la lista y úsalo en lugar de crear otro.");
  }
  return error instanceof Error ? error : new Error(message);
}

export async function createShipper(shipper: NewShipperInput): Promise<Shipper> {
  try {
    return (await callRatewareApi<{ row: Shipper }>("create_shipper", { shipper })).row;
  } catch (error) {
    throw friendlyShipperError(error);
  }
}

/** Only the fields in `patch` change; the backend leaves the rest as they are. */
export async function updateShipper(id: string, patch: Partial<Record<ShipperField, string | null>>): Promise<Shipper> {
  try {
    return (await callRatewareApi<{ row: Shipper }>("update_shipper", { id, patch })).row;
  } catch (error) {
    throw friendlyShipperError(error);
  }
}

export const archiveShipper = (id: string) =>
  callRatewareApi<{ updated: number }>("archive_shippers", { ids: [id], confirmed: true, confirmation_action: "archive_shippers" });

/** Back from the archive as a prospect; the team moves it on from there. */
export const restoreShipper = (id: string) => updateShipper(id, { status: "prospect" });

export const saveContact = (shipperId: string, row: Partial<ShipperContact>, id?: string) =>
  callRatewareApi<{ row: ShipperContact }>("save_shipper_record", {
    entity: "contacts",
    shipper_id: shipperId,
    id: id ?? null,
    row,
  }).then((res) => res.row);

export const deleteContact = (shipperId: string, id: string) =>
  callRatewareApi("delete_shipper_record", {
    entity: "contacts",
    shipper_id: shipperId,
    id,
    confirmed: true,
    confirmation_action: "delete_shipper_record",
  });

// ------------------------------------------------------------ duplicates

const PUBLIC_MAIL = new Set(["gmail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "yahoo.com.mx", "icloud.com", "prodigy.net.mx", "msn.com", "aol.com", "protonmail.com"]);

/** "https://www.Empresa.com/contacto" or "ana@empresa.com" → "empresa.com". */
export function cleanDomain(value: string | null | undefined): string {
  let text = String(value ?? "").trim().toLowerCase();
  if (text.includes("@")) text = text.split("@").pop() ?? "";
  return text
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/\s+/g, "");
}

/** The company's domain from a contact's email, unless it's a public mailbox. */
export function domainFromEmail(email: string | null | undefined): string {
  const domain = String(email ?? "").includes("@") ? cleanDomain(email) : "";
  return domain && !PUBLIC_MAIL.has(domain) ? domain : "";
}

// Legal forms and filler words that don't tell two companies apart; single
// letters ("S.A.B." → s a b) are dropped too.
const NAME_NOISE = new Set([
  "sa", "de", "cv", "rl", "sapi", "sab", "sc", "srl",
  "inc", "llc", "corp", "corporation", "co", "company", "ltd", "limited", "gmbh",
  "the", "del", "la", "el", "los", "las", "y", "and", "grupo", "group",
]);

/** "Grupo Bimbo, S.A.B. de C.V." and "bimbo" both → "bimbo". */
export function nameKey(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !NAME_NOISE.has(word))
    .join(" ");
}

export type MatchReason = "domain" | "name" | "similar";

export interface ShipperMatch {
  shipper: Shipper;
  reason: MatchReason;
}

export const MATCH_LABEL: Record<MatchReason, string> = {
  domain: "mismo dominio",
  name: "mismo nombre",
  similar: "nombre parecido",
};

const withoutAccents = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Shippers that may already be the one being created: the same domain (the
 * backend refuses a second live one), the same name once legal forms are set
 * aside, or a name that contains the other. Archived shippers count too, so
 * one can be restored instead of duplicated.
 */
export async function findShipperMatches(name: string, domain: string): Promise<ShipperMatch[]> {
  const key = nameKey(name);
  const cleanedDomain = cleanDomain(domain);
  const word = key.split(" ").sort((a, b) => b.length - a.length)[0] ?? "";
  const searches = new Set<string>();
  if (cleanedDomain) searches.add(cleanedDomain);
  if (word.length >= 3) {
    searches.add(word);
    // The CRM's search tells accents apart; the typed word may carry them.
    const typed = name.split(/[^\p{L}\p{N}]+/u).find((part) => withoutAccents(part).toLowerCase() === word);
    if (typed && typed.toLowerCase() !== word) searches.add(typed);
  }
  if (!searches.size) return [];

  const pages = await Promise.all(
    [...searches].flatMap((search) => [
      listShippers({ search, limit: 50 }),
      listShippers({ search, status: "archived", limit: 50 }),
    ]),
  );
  const found = new Map<string, ShipperMatch>();
  const rank: Record<MatchReason, number> = { domain: 0, name: 1, similar: 2 };
  for (const shipper of pages.flatMap((page) => page.rows ?? [])) {
    let reason: MatchReason | null = null;
    if (cleanedDomain && cleanDomain(shipper.domain) === cleanedDomain) reason = "domain";
    else {
      const keys = [nameKey(shipper.shipper_name), nameKey(shipper.legal_name)].filter(Boolean);
      if (key && keys.includes(key)) reason = "name";
      else if (key.length >= 4 && keys.some((other) => other.length >= 4 && (other.includes(key) || key.includes(other)))) reason = "similar";
    }
    if (!reason) continue;
    const previous = found.get(shipper.id);
    if (!previous || rank[reason] < rank[previous.reason]) found.set(shipper.id, { shipper, reason });
  }
  return [...found.values()].sort((a, b) => rank[a.reason] - rank[b.reason]);
}
