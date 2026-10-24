import { callCarrierProfileApi } from "@/lib/api-client";
import { ALL_STEPS, COMPANY_STEP, PROFILE_STEPS, type FieldSpec, type Lang } from "./profile.schema";

/**
 * Carrier profile over `carrier-profile-api` (verified against the deployed
 * function). The link's token is the credential; there is no login.
 *
 *  - get_profile          → request, vendor, support_tickets (marks the link viewed)
 *  - submit_profile       → merges profile_data by section, patches vendor columns
 *  - add_ticket_followup  → appends a follow-up to one support ticket
 */

export type ProfileData = Record<string, Record<string, string | string[]>>;

export interface ProfileVendor {
  id: string;
  vendor_name?: string | null;
  legal_name?: string | null;
  domain?: string | null;
  contact_name?: string | null;
  primary_email?: string | null;
  whatsapp_phone?: string | null;
  preferred_channel?: string | null;
  coverage_notes?: string | null;
  logo_url?: string | null;
  profile_data?: ProfileData;
  [key: string]: unknown;
}

export interface SupportTicket {
  id: string;
  subject?: string | null;
  question?: string | null;
  answer?: string | null;
  support_status?: string;
  route?: string | null;
  latest_followup?: string | null;
  latest_followup_at?: string | null;
  followups?: { body?: string; created_at?: string; source?: string }[];
  occurred_at?: string | null;
}

export interface ProfileResponse {
  request?: { id: string; status?: string; expires_at?: string };
  vendor: ProfileVendor;
  support_tickets?: SupportTicket[];
}

export async function getProfile(token: string) {
  return await callCarrierProfileApi<ProfileResponse>("get_profile", { token });
}

/** What the form holds: vendor columns and profile sections, all as strings or lists. */
export interface ProfileDraft {
  vendor: Record<string, string>;
  profile: Record<string, Record<string, string | string[]>>;
}

/** Stored lists may come back as "a; b" strings; the form always works with arrays. */
export function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/[;\n|]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function draftFrom(vendor: ProfileVendor): ProfileDraft {
  const out: ProfileDraft = { vendor: {}, profile: {} };
  for (const field of COMPANY_STEP.fields) {
    out.vendor[field.key] = String(vendor[field.key] ?? "");
  }
  for (const step of PROFILE_STEPS) {
    const section = (vendor.profile_data?.[step.key] ?? {}) as Record<string, unknown>;
    out.profile[step.key] = {};
    for (const field of step.fields) {
      const raw = section[field.key];
      out.profile[step.key][field.key] =
        field.type === "checks" ? asList(raw) : Array.isArray(raw) ? raw.join("; ") : String(raw ?? "");
    }
  }
  return out;
}

export function fieldValue(draft: ProfileDraft, stepKey: string, field: FieldSpec) {
  return stepKey === COMPANY_STEP.key
    ? draft.vendor[field.key] ?? ""
    : draft.profile[stepKey]?.[field.key] ?? (field.type === "checks" ? [] : "");
}

export function isFilled(value: string | string[]) {
  return Array.isArray(value) ? value.length > 0 : value.trim() !== "";
}

/** Recommended fields filled, per step and overall. Nothing is mandatory. */
export function progressOf(draft: ProfileDraft) {
  const perStep = ALL_STEPS.map((step) => {
    const recommended = step.fields.filter((f) => f.recommended);
    const done = recommended.filter((f) => isFilled(fieldValue(draft, step.key, f))).length;
    const filled = step.fields.filter((f) => isFilled(fieldValue(draft, step.key, f))).length;
    return { key: step.key, done, total: recommended.length, filled, fields: step.fields.length };
  });
  const done = perStep.reduce((n, s) => n + s.done, 0);
  const total = perStep.reduce((n, s) => n + s.total, 0);
  return { perStep, done, total };
}

/** Columns the server clears when sent empty; losing them breaks the CRM record. */
export const NEVER_BLANK = ["vendor_name", "primary_email"] as const;

/**
 * Builds the submit payload from what actually changed.
 *
 * The server writes every vendor column it receives (a blank name or email is
 * ignored, other blanks clear the column), so untouched columns are left out
 * entirely. Profile sections are merged: a field sent empty ("" / []) is
 * cleared, a field not sent is kept — so only changed answers travel.
 */
export function buildSubmit(original: ProfileDraft, draft: ProfileDraft, lang: Lang) {
  const vendor: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft.vendor)) {
    if (value.trim() === (original.vendor[key] ?? "").trim()) continue;
    if ((NEVER_BLANK as readonly string[]).includes(key) && !value.trim()) continue;
    vendor[key] = value.trim();
  }

  const profile_data: Record<string, unknown> = {};
  for (const step of PROFILE_STEPS) {
    const section: Record<string, string | string[]> = {};
    for (const field of step.fields) {
      const now = draft.profile[step.key]?.[field.key];
      const before = original.profile[step.key]?.[field.key];
      if (JSON.stringify(now) === JSON.stringify(before)) continue;
      if (now === undefined || !isFilled(now)) {
        // Explicitly empty: the server clears the saved answer.
        if (before !== undefined && isFilled(before)) section[field.key] = field.type === "checks" ? [] : "";
        continue;
      }
      section[field.key] = Array.isArray(now) ? now : now.trim();
    }
    if (Object.keys(section).length) profile_data[step.key] = section;
  }
  // Fields, not sections: four boxes ticked in one section read as one change otherwise.
  const changed =
    Object.keys(vendor).length +
    Object.values(profile_data).reduce<number>((n, s) => n + Object.keys(s as object).length, 0);
  // Same marker rateware's page writes, so the team knows how to read the answers.
  profile_data._meta = { response_language: lang };

  return { vendor, profile_data, changed };
}

export async function submitProfile(
  token: string,
  payload: {
    vendor: Record<string, string>;
    profile_data: Record<string, unknown>;
    submitted_contact: { name: string; email: string };
  },
) {
  return await callCarrierProfileApi<ProfileResponse & { submitted?: boolean }>("submit_profile", {
    token,
    ...payload,
  });
}

export async function addTicketFollowup(token: string, ticketId: string, message: string) {
  return await callCarrierProfileApi<{ support_tickets?: SupportTicket[]; saved?: boolean }>(
    "add_ticket_followup",
    { token, ticket_id: ticketId, message },
  );
}

/** The server's link errors, in the carrier's language. */
export function explainProfileError(message: string, lang: Lang): string {
  const m = message.toLowerCase();
  const copy = {
    notFound: {
      es: "Esta liga de perfil no existe. Pide al equipo de MARKSMAN una liga nueva.",
      en: "This profile link does not exist. Ask the MARKSMAN team for a new one.",
    },
    expired: {
      es: "Esta liga de perfil ya venció. Pide al equipo de MARKSMAN una liga nueva.",
      en: "This profile link has expired. Ask the MARKSMAN team for a new one.",
    },
    revoked: {
      es: "Esta liga de perfil fue desactivada. Pide al equipo de MARKSMAN una liga nueva.",
      en: "This profile link was deactivated. Ask the MARKSMAN team for a new one.",
    },
    duplicate: {
      es: "Ya existe otro carrier con ese nombre comercial. Usa el nombre exacto de tu empresa o escríbenos.",
      en: "Another carrier already uses that company name. Use your exact company name or contact us.",
    },
  };
  if (m.includes("not found")) return copy.notFound[lang];
  if (m.includes("expired")) return copy.expired[lang];
  if (m.includes("revoked")) return copy.revoked[lang];
  if (m.includes("duplicate key") || m.includes("already")) return copy.duplicate[lang];
  return message;
}
