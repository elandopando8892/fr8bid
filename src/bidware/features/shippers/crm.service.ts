import { env } from "@/config/env";
import { callFunction, callRatewareApi } from "@/lib/api-client";
import type { Shipper } from "./shippers.service";

/**
 * The commercial side of a shipper, as rateware's Shipper CRM keeps it: its
 * sites, lanes, RFIs, opportunities and next actions (save_shipper_record /
 * delete_shipper_record), the moves between stages, the action playbooks,
 * the activity log and the secure profile link.
 *
 * Reads that summarize the whole CRM go through shipper-directory-api, as
 * rateware's screen does; it has no role gate, so a Consulta account reads
 * them too. Writes go through rateware-api.
 */
export const callDirectory = <T = unknown>(action: string, payload: Record<string, unknown> = {}) =>
  callFunction<T>("shipper-directory-api", action, payload);

export type ChildEntity = "locations" | "lanes" | "rfis" | "opportunities" | "actions";

export interface ShipperRecord {
  id: string;
  [key: string]: unknown;
}

export interface ProfileRequest {
  id: string;
  status: string | null;
  expires_at: string | null;
  viewed_at?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
}

export interface ActivityRow {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  summary: string | null;
}

export const OPPORTUNITY_STAGE_LABEL: Record<string, string> = {
  identified: "Identificada",
  discovery: "Descubrimiento",
  rfi: "RFI",
  rfx: "RFx",
  proposal: "Propuesta",
  negotiation: "Negociación",
  won: "Ganada",
  lost: "Perdida",
  archived: "Archivada",
};
export const OPEN_STAGES = new Set(["identified", "discovery", "rfi", "rfx", "proposal", "negotiation"]);

export const RFI_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviado",
  in_progress: "En proceso",
  submitted: "Respondido",
  approved: "Aprobado",
  archived: "Archivado",
};

export const ACTION_TYPE_LABEL: Record<string, string> = {
  follow_up: "Seguimiento",
  call: "Llamada",
  email: "Correo",
  meeting: "Reunión",
  rfi_follow_up: "Seguimiento de RFI",
  rate_review: "Revisión de tarifas",
  data_cleanup: "Completar datos",
  other: "Otro",
};

export const ACTION_STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  in_progress: "En curso",
  done: "Hecha",
  cancelled: "Cancelada",
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const LANE_STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  inactive: "Inactiva",
  archived: "Archivada",
};

export const LOCATION_TYPE_LABEL: Record<string, string> = {
  plant: "Planta",
  warehouse: "Almacén",
  distribution_center: "Centro de distribución",
  office: "Oficina",
  other: "Otro",
};

export const CURRENCY_OPTIONS: Record<string, string> = { USD: "USD", MXN: "MXN", CAD: "CAD" };
export const COUNTRY_OPTIONS: Record<string, string> = { MX: "MX", US: "US", CA: "CA" };

/** rateware's action playbooks: each opens three actions the account doesn't already have open. */
export const PLAYBOOKS: { key: string; label: string; hint: string }[] = [
  { key: "discovery", label: "Calificar la cuenta", hint: "Contactos, llamada de descubrimiento y primeras rutas." },
  { key: "rfi_follow_up", label: "Avanzar un RFI", hint: "Revisar el RFI, confirmar fechas y ligarlo a una oportunidad." },
  { key: "proposal", label: "Seguir una propuesta", hint: "Confirmar que llegó, recoger comentarios y fijar la decisión." },
  { key: "implementation", label: "Preparar la implementación", hint: "Arranque, datos operativos y fecha de inicio." },
  { key: "reengagement", label: "Reactivar la cuenta", hint: "Revisar lo último, escribir y confirmar el resultado." },
  { key: "profile_refresh", label: "Actualizar el perfil", hint: "Mandar la liga segura y revisar lo que regrese." },
];

export const saveRecord = (entity: ChildEntity | "contacts", shipperId: string, row: Record<string, unknown>, id?: string) =>
  callRatewareApi<{ row: ShipperRecord }>("save_shipper_record", { entity, shipper_id: shipperId, id: id ?? null, row }).then(
    (res) => res.row,
  );

export const deleteRecord = (entity: ChildEntity, shipperId: string, id: string) =>
  callRatewareApi("delete_shipper_record", {
    entity,
    shipper_id: shipperId,
    id,
    confirmed: true,
    confirmation_action: "delete_shipper_record",
  });

export const moveRelationshipStage = (id: string, relationshipStage: string) =>
  callRatewareApi<{ row: Shipper }>("move_shipper_relationship_stage", { id, relationship_stage: relationshipStage }).then((res) => res.row);

export const moveOpportunityStage = (id: string, stage: string) =>
  callRatewareApi<{ row: ShipperRecord }>("move_shipper_opportunity_stage", { id, stage }).then((res) => res.row);

/** An opportunity from an RFI; the backend returns the existing one when the RFI already has it. */
export const promoteRfi = (rfiId: string) =>
  callRatewareApi<{ row: ShipperRecord; created: boolean }>("promote_shipper_rfi_to_opportunity", { rfi_id: rfiId });

const countOf = (value: unknown) => (typeof value === "number" ? value : Array.isArray(value) ? value.length : 0);

export async function applyPlaybook(shipperId: string, playbook: string) {
  const res = await callRatewareApi<{ created?: unknown; skipped?: unknown }>("apply_shipper_action_playbook", {
    shipper_id: shipperId,
    playbook,
  });
  return { created: countOf(res.created), skipped: countOf(res.skipped) };
}

export const setActionStatus = (id: string, status: string) =>
  callRatewareApi<{ row: ShipperRecord }>("update_shipper_account_action_status", { id, status }).then((res) => res.row);

export const shipperActivity = (id: string) =>
  callDirectory<{ rows?: ActivityRow[] }>("shipper_account_activity", { id }).then((res) => res.rows ?? []);

/**
 * A 30-day link for the shipper to complete its own profile. The link points
 * at this app's public page (/shipper-profile.html); the backend keeps only a
 * hash of it, so the URL comes back this once.
 */
export const createProfileLink = (shipperId: string) =>
  callRatewareApi<{ row: ProfileRequest; url: string }>("create_shipper_profile_request", {
    shipper_id: shipperId,
    expires_in_days: 30,
    origin: env.appOrigin,
  });

export const revokeProfileLink = (id: string) =>
  callRatewareApi<{ row: ProfileRequest }>("revoke_shipper_profile_request", { id });

// ------------------------------------------------------------ the CRM at large

export interface CrmSummary {
  total: number;
  active: number;
  prospects: number;
  missing_contact: number;
  open_opportunities: number;
}

/** A shipper's row in the pipeline, the action queue or the intelligence view. */
export interface AccountRow {
  id: string;
  shipper_id?: string;
  shipper_name: string | null;
  shipper_domain?: string | null;
  domain?: string | null;
  industry?: string | null;
  relationship_stage?: string | null;
  status?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  headquarters_city?: string | null;
  headquarters_state?: string | null;
  open_opportunity_count?: number;
  active_rfi_count?: number;
  open_action_count?: number;
  due_action_count?: number;
  next_action?: string | null;
  next_due_date?: string | null;
  pipeline_value?: number | null;
  pipeline_currency?: string | null;
  [key: string]: unknown;
}

export const crmSummary = () => callDirectory<CrmSummary>("shipper_crm_summary");

export const relationshipPipeline = (search: string, status: string) =>
  callDirectory<{ rows?: AccountRow[]; stages?: { stage: string; count: number }[]; total?: number }>("shipper_relationship_pipeline", {
    search: search.trim() || undefined,
    status: status || "all",
    limit: 750,
  });

export interface CommercialWork {
  rfis: (ShipperRecord & { shipper_id: string; shipper_name: string | null; linked_opportunity?: ShipperRecord | null })[];
  opportunities: (ShipperRecord & {
    shipper_id: string;
    shipper_name: string | null;
    rfx_project?: { id: string; title?: string | null; status?: string | null; linked_rfx_event_id?: string | null } | null;
  })[];
  counts: { open_rfis: number; unlinked_rfis: number; open_opportunities: number; won_opportunities: number; lost_opportunities: number; due_soon: number };
}

export const commercialWork = (search: string, focus: string) =>
  callDirectory<CommercialWork>("shipper_commercial_work", { search: search.trim() || undefined, focus: focus || "all", limit: 1000 });

export const actionQueue = (focus: string, search: string) =>
  callDirectory<{ rows?: (ShipperRecord & AccountRow)[]; counts?: { open: number; today: number; overdue: number; done: number } }>(
    "shipper_action_queue",
    { focus: focus || "open", search: search.trim() || undefined, limit: 1000 },
  );

export const shipperIntelligence = (focus: string, search: string) =>
  callDirectory<{
    rows?: AccountRow[];
    total?: number;
    truncated?: boolean;
    counts?: { ready: number; needs_data: number; due_action: number; open_pipeline_value: number | null; open_pipeline_currency: string | null };
  }>("shipper_intelligence", { focus: focus || "all", search: search.trim() || undefined, limit: 1000 });

// ------------------------------------------------------------ duplicates and imports

export interface DuplicateGroup {
  key: string;
  reasons: ("domain" | "email" | "legal_name")[];
  shippers: Shipper[];
}

/** Pairs rateware's CRM holds as the same company: same domain, contact email or name. */
export const listDuplicates = () =>
  callRatewareApi<{ groups?: DuplicateGroup[]; scanned?: number; truncated?: boolean }>("list_shipper_duplicates");

/** The duplicate's contacts, sites, lanes, RFIs, opportunities and actions move to the one kept; the duplicate is archived. */
export const mergeShippers = (primaryId: string, duplicateId: string) =>
  callRatewareApi<{ target: Shipper; archived_source: { id: string; shipper_name: string | null }; moved_records: Record<string, number> }>(
    "merge_shipper_accounts",
    { primary_shipper_id: primaryId, duplicate_shipper_id: duplicateId, confirmed: true, confirmation_action: "merge_shipper_accounts" },
  );

export interface ImportResult {
  inserted?: number;
  updated?: number;
  skipped: number;
  total_rows: number;
  skipped_rows?: { entity?: string; row: number; reason: string }[];
  accounts?: { inserted: number; updated: number };
  contacts?: { inserted: number; updated: number };
  opportunities?: { inserted: number; updated: number };
}

/** A flat list of shippers; rows matching a live shipper's domain update it. */
export const importShippers = (rows: Record<string, unknown>[]) =>
  callRatewareApi<ImportResult>("import_shippers", { rows, confirmed: true, confirmation_action: "import_shippers" });

/** A CRM export with Accounts, Contacts and Opportunities sheets, linked by external ids. */
export const importShipperWorkbook = (payload: {
  accounts: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  opportunities: Record<string, unknown>[];
  source_system: string;
}) =>
  callRatewareApi<ImportResult>("import_shipper_crm_workbook", {
    ...payload,
    confirmed: true,
    confirmation_action: "import_shipper_crm_workbook",
  });

export const liveProfileRequest = (requests: ProfileRequest[]) =>
  requests.find((request) => ["active", "viewed", "submitted"].includes(String(request.status ?? "").toLowerCase()) &&
    (!request.expires_at || new Date(request.expires_at).getTime() > Date.now())) ?? null;
