import { tr } from "@/i18n/integrations";
import { callRatewareApi } from "@/lib/api-client";
import type { Vendor } from "@/types/domain";

/**
 * Channels. Bidware does not own any of this — the connections live in the
 * shared backend and are the same ones rateware sends through.
 *
 * Two of these actions WRITE, and the page says so rather than presenting them
 * as passive checks:
 *   sync_whatsapp_templates   pulls from Meta and updates the stored templates
 *   verify_whatsapp_webhook   re-verifies and updates the connection row
 * The other three only read.
 */

export interface GmailConnection {
  sender_name?: string | null;
  bounces_synced_at?: string | null;
  mailbox_email?: string;
  status?: string;
  connected?: boolean;
  outbound_enabled?: boolean;
  scopes?: unknown[];
  token_expires_at?: string | null;
  updated_at?: string | null;
  last_error?: string | null;
}

/**
 * What get_whatsapp_connection_status reports. Secrets never come back: the
 * ids arrive masked ("••••••7821") and the secrets only as configured yes/no.
 */
export interface WhatsappConnection {
  status?: string;
  connection_mode?: string;
  internal_managed?: boolean;
  connected?: boolean;
  verified_name?: string | null;
  display_phone_number?: string | null;
  quality_rating?: string | null;
  graph_api_version?: string | null;
  phone_number_id?: string | null;
  phone_number_id_configured?: boolean;
  waba_id?: string | null;
  waba_id_configured?: boolean;
  app_secret_configured?: boolean;
  /** The webhook's verify token is configured. */
  webhook_configured?: boolean;
  webhook_verified_at?: string | null;
  templates_last_synced_at?: string | null;
  template_count?: number;
  /** WHATSAPP_GROUPS_ENABLED on the server: false keeps every group manual-only. */
  groups_enabled?: boolean;
  last_error?: string | null;
  [key: string]: unknown;
}

/** A Meta template as whatsapp_outreach_template_mappings stores it. */
export interface MetaTemplate {
  id?: string;
  meta_template_name?: string | null;
  meta_template_language?: string | null;
  meta_template_category?: string | null;
  meta_template_status?: string | null;
  name?: string | null;
  language?: string | null;
  category?: string | null;
  status?: string | null;
  [key: string]: unknown;
}

export const templateName = (t: MetaTemplate) => String(t.meta_template_name ?? t.name ?? "—");
export const templateLanguage = (t: MetaTemplate) => String(t.meta_template_language ?? t.language ?? "—");
export const templateStatus = (t: MetaTemplate) => String(t.meta_template_status ?? t.status ?? "").toUpperCase();

export async function listGmailConnections(): Promise<{
  allowed_sender?: string;
  rows: GmailConnection[];
}> {
  const res = await callRatewareApi<{ allowed_sender?: string; rows?: GmailConnection[] }>(
    "list_gmail_connections",
  );
  return { allowed_sender: res.allowed_sender, rows: res.rows ?? [] };
}

export async function getWhatsappStatus(): Promise<WhatsappConnection | null> {
  const res = await callRatewareApi<{ row?: WhatsappConnection }>("get_whatsapp_connection_status");
  return res.row ?? null;
}

export async function listWhatsappTemplates(): Promise<MetaTemplate[]> {
  const res = await callRatewareApi<{ rows?: MetaTemplate[]; templates?: MetaTemplate[] }>("list_whatsapp_templates");
  return res.rows ?? res.templates ?? [];
}

/**
 * Carriers reached through a WhatsApp group (their preferred channel). The
 * group lives on the carrier: name, link, Meta group id and its status
 * (manual_only until the server flag is on and the group has a Meta id).
 */
export async function listGroupCarriers(): Promise<Vendor[]> {
  const res = await callRatewareApi<{ rows?: Vendor[] }>("list_vendors", {
    channel: "whatsapp_group",
    lightweight: true,
    limit: 100,
  });
  return res.rows ?? [];
}

/** WRITES: re-verifies the carrier's group and stamps its status (manual_only or api_ready). */
export async function verifyGroup(vendor: Vendor) {
  return await callRatewareApi<{ row: Record<string, unknown>; manual_only?: boolean; groups_enabled?: boolean }>(
    "verify_vendor_whatsapp_group",
    {
      vendor_id: vendor.id,
      group_name: vendor.whatsapp_group_name ?? undefined,
      group_url: vendor.whatsapp_group_url ?? undefined,
      meta_group_id: vendor.whatsapp_meta_group_id ?? undefined,
    },
  );
}

export const GROUP_STATUS_LABEL: Record<string, string> = {
  manual_only: "manual_only",
  api_ready: "api_ready",
  verified: "verified",
  pending: "pending",
  blocked: "blocked",
  error: "error",
};

/** Read-only probe against Meta. */
export async function testWhatsappConnection() {
  return await callRatewareApi<{
    ok?: boolean;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    waba_validated?: boolean;
  }>("test_whatsapp_business_connection");
}

/** WRITES: pulls the template list from Meta and updates what we store. */
export async function syncWhatsappTemplates() {
  return await callRatewareApi<Record<string, unknown>>("sync_whatsapp_templates");
}

/** WRITES: re-verifies the webhook and updates the connection row. */
export async function verifyWhatsappWebhook() {
  return await callRatewareApi<{
    endpoint?: string;
    verify_token_configured?: boolean;
    app_secret_configured?: boolean;
    verified?: boolean;
  }>("verify_whatsapp_webhook");
}

/* ---------------------------------------------------------------- */

/**
 * Gmail health.
 *
 * `token_expires_at` in the past is NOT a failure. Google access tokens live
 * about an hour; the backend swaps them on demand with the stored refresh
 * token (`grant_type: "refresh_token"`). A mailbox nobody has sent from in a
 * week shows a stale expiry and is perfectly fine.
 *
 * The real signal is what the backend writes when a refresh actually fails:
 * `status: "error"` plus `last_error`. So that is what this reads.
 */
export type ChannelHealth = "ok" | "attention" | "down" | "unknown";

export function gmailHealth(c?: GmailConnection): { state: ChannelHealth; detail: string } {
  if (!c || !c.status || c.status === "not_connected")
    return { state: "down", detail: tr("text008") };
  if (c.last_error || String(c.status).toLowerCase() === "error")
    return {
      state: "down",
      detail: c.last_error || tr("text009"),
    };
  if (String(c.status).toLowerCase() !== "connected")
    return { state: "attention", detail: tr("text010", c.status) };
  return { state: "ok", detail: tr("text011") };
}

/**
 * How long ago the access token was minted. Informational only — it does not
 * mean the mailbox is broken, and the UI must not present it as an alarm.
 */
export function accessTokenAge(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  const days = Math.floor((Date.now() - t.getTime()) / 86_400_000);
  if (days <= 0) return tr("text012");
  return tr("text013", days);
}

export function whatsappHealth(c?: WhatsappConnection | null): {
  state: ChannelHealth;
  detail: string;
} {
  if (!c) return { state: "down", detail: tr("text014") };
  if (c.last_error) return { state: "down", detail: c.last_error };
  if (String(c.status).toLowerCase() !== "connected")
    return { state: "attention", detail: tr("text010", c.status ?? tr("text015")) };
  const q = String(c.quality_rating ?? "").toUpperCase();
  if (q === "RED") return { state: "down", detail: tr("text016") };
  if (q === "YELLOW")
    return { state: "attention", detail: tr("text017") };
  return { state: "ok", detail: tr("text018") };
}

/** Templates that have not been pulled from Meta in a while drift silently. */
export function syncStaleness(iso?: string | null): { days: number | null; stale: boolean } {
  if (!iso) return { days: null, stale: true };
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return { days: null, stale: true };
  const days = Math.floor((Date.now() - t.getTime()) / 86_400_000);
  return { days, stale: days > 14 };
}

export const HEALTH_TONE: Record<ChannelHealth, "green" | "amber" | "red" | ""> = {
  ok: "green",
  attention: "amber",
  down: "red",
  unknown: "",
};

export const HEALTH_LABEL: Record<ChannelHealth, string> = {
  get ok() { return tr("text019"); },
  get attention() { return tr("text020"); },
  get down() { return tr("text021"); },
  get unknown() { return tr("text022"); },
};
