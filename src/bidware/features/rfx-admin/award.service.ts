import { ApiError, callRatewareApi } from "@/lib/api-client";
import { tr } from "@/i18n/rfx-admin";
import { newOperationId } from "@/lib/operation-id";
import { env } from "@/config/env";

/**
 * Close: deciding who carries the freight, and handing the result to rateware.
 *
 * Three actions, all verified against the deployed handler:
 *  - `award_rfx_lane_vendor`  assigns primary or backup to one invitation
 *  - `clear_rfx_award`        takes it back (awarded -> quoted)
 *  - `closeout_awarded_rfx_to_rateware`  queues the awarded rates for HUMAN
 *    review in rateware. It does not publish a ratebook by itself.
 *
 * Awarding is high risk, so the backend correlates it by operation id. Send our
 * own and reuse it on retry — otherwise the server mints a fresh one per
 * request and a retry awards twice.
 */

export type AwardRole = "primary" | "backup";

export interface AwardResult {
  row: Record<string, unknown>;
  award_role?: string;
  before?: Record<string, unknown>;
  operation_id?: string;
  /** True when this exact operation had already been applied. */
  idempotent?: boolean;
}

export interface AwardInput {
  /** The rfx_lane_vendors row id. */
  invitationId: string;
  role: AwardRole;
  reason?: string;
  notes?: string;
  /** Generated once per attempt and reused across retries of that attempt. */
  operationId: string;
}

/**
 * The backend refuses to award an invitation with no `bid_rate`
 * ("A carrier bid rate is required before awarding"), so the UI never offers
 * the action on a carrier that has not quoted.
 */
export async function awardLaneVendor(input: AwardInput): Promise<AwardResult> {
  return await callRatewareApi<AwardResult>("award_rfx_lane_vendor", {
    id: input.invitationId,
    award_role: input.role,
    ...(input.reason ? { award_reason: input.reason } : {}),
    ...(input.notes ? { award_notes: input.notes } : {}),
    operation_id: input.operationId,
  });
}

export async function clearAward(invitationId: string) {
  return await callRatewareApi<AwardResult>("clear_rfx_award", { id: invitationId });
}

export interface NoAwardResult {
  no_award: boolean;
  /** Lanes that changed; the rest were already in the asked state. */
  updated: number;
  unchanged: number;
  rows: Record<string, unknown>[];
}

/**
 * Declares lanes void ("desierto": the event closes them without an award) or
 * reopens them. The backend refuses a lane that still has a primary or a
 * backup (409 `lane_has_award`) and an event already closed. The reason stays
 * internal; the carriers' notices never carry it. Repeating it writes nothing.
 */
export async function setLaneNoAward(input: { eventId: string; laneIds: string[]; noAward: boolean; reason?: string }) {
  return await callRatewareApi<NoAwardResult>("set_rfx_lane_no_award", {
    rfx_event_id: input.eventId,
    lane_ids: input.laneIds,
    no_award: input.noAward,
    ...(input.noAward && input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  });
}

/** A lane declared void closes without an award. */
export const isVoidLane = (lane: { no_award_at?: unknown }) => Boolean(lane.no_award_at);

export interface CloseoutResult {
  inserted?: number;
  linked?: number;
  queued_for_review?: number;
  [key: string]: unknown;
}

/**
 * Hands the awarded rates to rateware. They land queued for human review, not
 * live — which is why the confirm copy says "para revisión" and not "publicar".
 */
export async function closeoutToRateware(eventId: string, operationId: string) {
  try {
    return await callRatewareApi<CloseoutResult>("closeout_awarded_rfx_to_rateware", {
      event_id: eventId,
      operation_id: operationId,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.stage === "rfx_closeout_expired") error.message = tr("closeoutExpired");
      if (error.stage === "rfx_closeout_blocked") error.message = tr("closeoutBlocked");
      if (error.stage === "rfx_closeout_refused") error.message = tr("closeoutRefused");
    }
    throw error;
  }
}


/* ------------------------------------------------------------------ *
 * Telling the carriers
 * ------------------------------------------------------------------ */

export interface NoticeSkip {
  invitation_id?: string;
  vendor_id?: string;
  reason?: string;
}

export interface NoticesResult {
  generated?: number;
  /** New drafts. */
  created?: number;
  /** Drafts that already existed and were rewritten. */
  refreshed?: number;
  /** Messages already SENT, left untouched — history is never replaced. */
  preserved?: number;
  skipped?: NoticeSkip[];
  campaign_id?: string;
  channel?: string;
  rows?: Record<string, unknown>[];
}

/**
 * Prepares one award notice per carrier that took part — winners, backups AND
 * the ones that did not get the lane. A carrier who invested time and never
 * heard back does not quote again.
 *
 * Three things the handler decides, not us:
 *  - **email only** (`channel: "email"` is hardcoded); carriers with no
 *    `primary_email` come back in `skipped` instead of being contacted;
 *  - one notice per carrier, covering their lanes — not one per lane;
 *  - already-sent messages are preserved, never rewritten.
 *
 * It only drafts. The campaign is created `draft_only` and the drafts land in
 * the same Delivery queue, behind the same human gate.
 */
export async function generateAwardNotices(
  eventId: string,
  operationId: string,
): Promise<NoticesResult> {
  return await callRatewareApi<NoticesResult>("generate_rfx_award_notices", {
    event_id: eventId,
    // Without this the links in the notice point at rateware's Bid Room.
    app_origin: env.appOrigin,
    operation_id: operationId,
  });
}

export { newOperationId };

export const ROLE_LABEL: Record<string, string> = {
  primary: "Primario",
  backup: "Respaldo",
};

/* ------------------------------------------------------------------ *
 * Who gets a notice, and what it says — mirrored from the handler
 * (generateRfxAwardNotices / awardNoticeHtml) so the screen previews the
 * real thing. The backend stays the authority: it writes the drafts.
 * ------------------------------------------------------------------ */

type Offer = Record<string, unknown>;

/** `no_award`: every lane the carrier took part in was declared void — nobody else won it. */
export type NoticeGroup = "primary" | "backup" | "not_awarded" | "no_award";

export interface NoticeRecipient {
  vendorId: string;
  name: string;
  email: string | null;
  group: NoticeGroup;
  quoted: boolean;
}

const PARTICIPATED = ["invited", "viewed", "responded", "quoted", "bid_submitted", "awarded"];
const GROUP_RANK: Record<NoticeGroup, number> = { primary: 0, backup: 1, not_awarded: 2, no_award: 3 };

/**
 * One notice per carrier that took part: anyone with an award decision, a
 * bid, or an invitation that went out. A carrier awarded on any lane gets
 * the award notice; otherwise backup; otherwise the closeout, which says the
 * lanes went to someone else unless all of them were declared void.
 */
export function noticeAudience(lanes: { invitations?: Offer[]; no_award_at?: unknown }[]): NoticeRecipient[] {
  const byVendor = new Map<string, NoticeRecipient>();
  for (const lane of lanes) {
    for (const i of lane.invitations ?? []) {
      const status = String(i.invitation_status ?? "").toLowerCase();
      if (status === "archived") continue;
      const role = String(i.award_role ?? "").toLowerCase();
      const quoted = i.bid_rate != null && String(i.bid_rate) !== "";
      if (!role && !quoted && !PARTICIPATED.includes(status)) continue;
      const vendor = (i.vendors ?? {}) as Offer;
      const key = String(i.vendor_id ?? i.id);
      const group: NoticeGroup =
        role === "primary" ? "primary" : role === "backup" ? "backup" : isVoidLane(lane) ? "no_award" : "not_awarded";
      const prev = byVendor.get(key);
      if (!prev) {
        byVendor.set(key, {
          vendorId: key,
          name: String(vendor.vendor_name ?? key),
          email: String(vendor.primary_email ?? "").trim() || null,
          group,
          quoted,
        });
      } else {
        if (GROUP_RANK[group] < GROUP_RANK[prev.group]) prev.group = group;
        prev.quoted = prev.quoted || quoted;
      }
    }
  }
  return [...byVendor.values()];
}

/** The handler writes Spanish only when the event reads Spanish (bidRoomFollowUpLanguage). */
export function noticeLanguage(event?: Record<string, unknown>): "es" | "en" {
  const source = [event?.name, event?.customer, event?.rfx_id]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ")
    // Accents are dropped first, as the handler does: "cotización" reads as Spanish too.
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return /\b(hola|cotizar|cotizacion|ruta|interesa|favor|gracias|propuesta|fecha limite|por favor)\b/.test(source)
    ? "es"
    : "en";
}

export interface NoticeCopy {
  subject: string;
  label: string;
  headline: string;
  intro: string;
  next: string;
  cta: string;
  call?: string;
}

/** The notice as the handler words it, per group and language. */
export function noticeCopy(group: NoticeGroup, language: "es" | "en", rfxKey: string): NoticeCopy {
  const es = language === "es";
  // The subject speaks the notice's language too (rateware, 2026-09-29).
  const prefix =
    group === "primary"
      ? es ? "Adjudicación" : "Award"
      : group === "backup"
        ? es ? "Capacidad de respaldo" : "Backup status"
        : es ? "Cierre de RFx" : "RFx closeout";
  const intro = es
    ? "Esta actualización corresponde exclusivamente a esta oportunidad y resume las rutas, tarifas y capacidad registradas en el Bid Room."
    : "This update applies only to this opportunity and summarizes the routes, rates, and capacity recorded in the Bid Room.";
  const closeout = es ? "CIERRE DE RFx" : "RFx CLOSEOUT";
  const byGroup = {
    primary: {
      label: es ? "ADJUDICACIÓN" : "AWARD DECISION",
      headline: es ? "La decisión de adjudicación está lista." : "Your award decision is ready.",
      next: es
        ? "Gracias por participar. Conservaremos esta información para siguientes asignaciones y coordinaremos los siguientes pasos por este medio."
        : "Thank you for participating. We will retain this information for future assignments and coordinate next steps through this thread.",
    },
    backup: {
      label: es ? "CAPACIDAD DE RESPALDO" : "BACKUP CAPACITY",
      headline: es ? "Ha sido seleccionado como capacidad de respaldo." : "You have been selected as backup capacity.",
      next: es
        ? "Gracias por participar. Mantendremos su capacidad y comentarios visibles para siguientes asignaciones."
        : "Thank you for participating. We will keep your capacity and comments available for future assignments.",
    },
    not_awarded: {
      label: closeout,
      headline: es ? "Este RFx fue adjudicado a otro transportista." : "This RFx has been awarded to another carrier.",
      next: es
        ? "Gracias por participar. Le invitamos a seguir cotizando con MARKSMAN. Si desea revisar cómo mejorar sus posibilidades de ganar más bids, agende una llamada con nuestro equipo."
        : "Thank you for participating. We invite you to continue quoting with MARKSMAN. If you would like to review how to improve your chances of winning more bids, schedule a call with our team.",
    },
    no_award: {
      label: closeout,
      headline: es ? "Las rutas en las que participó se cerraron sin adjudicar." : "The lanes you took part in closed without an award.",
      next: es
        ? "Gracias por participar. Estas rutas no se adjudicaron a ningún transportista; le invitamos a seguir cotizando con MARKSMAN."
        : "Thank you for participating. These lanes were not awarded to any carrier; we invite you to continue quoting with MARKSMAN.",
    },
  }[group];
  return {
    subject: `${prefix}: ${rfxKey}`,
    intro,
    cta: es ? "Abrir Bid Room" : "Open Bid Room",
    ...(group === "not_awarded" ? { call: es ? "Agendar una llamada" : "Schedule a call" } : {}),
    ...byGroup,
  };
}
