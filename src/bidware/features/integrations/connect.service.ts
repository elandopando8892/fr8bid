import { tr } from "@/i18n/integrations";
import { callRatewareApi } from "@/lib/api-client";
import { env } from "@/config/env";
import type { ChannelHealth } from "./integrations.service";

/**
 * Connecting Google (the sending Gmail and Google Chat) from Bidware. The
 * connections are rateware's, shared: Bidware only starts Google's consent
 * screen and reads the result.
 *
 * The flow: start_*_oauth stores a one-time state with `redirect_after`, the
 * browser goes to Google, and the shared gmail-oauth-callback stores the
 * tokens and sends the browser to `redirect_after` with ?gmail= or ?chat=
 * (connected, or error plus reason). A full URL there brings it back to
 * Bidware; rateware passed a relative path and landed on its settings page.
 */
const backHere = () => `${env.appOrigin}/integraciones`;

async function consentUrl(action: "start_gmail_oauth" | "start_google_chat_oauth", payload: Record<string, unknown>) {
  const res = await callRatewareApi<{ authorization_url?: string }>(action, { ...payload, redirect_after: backHere() });
  if (!res.authorization_url) throw new Error(tr("text001"));
  return res.authorization_url;
}

/** Google's consent page for the sending mailbox (only sales@ is accepted). */
export const gmailConsentUrl = (mailbox?: string) => consentUrl("start_gmail_oauth", { mailbox_email: mailbox });

/** Google's consent page for Google Chat (same account). */
export const googleChatConsentUrl = (account?: string) =>
  consentUrl("start_google_chat_oauth", { account_email: account });

/** What came back from Google, read off /integraciones?gmail=…&chat=…&reason=… */
export function consentResult(params: URLSearchParams): { ok: boolean; message: string } | null {
  for (const [key, label] of [
    ["gmail", "Gmail"],
    ["chat", "Google Chat"],
  ] as const) {
    const value = params.get(key);
    if (!value) continue;
    if (value === "connected") return { ok: true, message: tr("text002", label) };
    const reason = params.get("reason");
    return { ok: false, message: tr("text003", label, reason ? `: ${reason}` : ".") };
  }
  return null;
}

/** Stops all sending by mail until it is connected again. An Administrador's. */
export const disconnectGmail = () => callRatewareApi("disconnect_gmail_connection");

export interface GoogleChatConnection {
  account_email?: string;
  status?: string;
  connected?: boolean;
  /** Whether it may read replies back from the space (not only post). */
  inbound_enabled?: boolean;
  token_expires_at?: string | null;
  updated_at?: string | null;
  last_error?: string | null;
  default_space_name?: string | null;
  default_space_display_name?: string | null;
  configured?: boolean;
}

export async function getGoogleChat() {
  const res = await callRatewareApi<{ allowed_account?: string; rows?: GoogleChatConnection[] }>(
    "list_google_chat_connections",
  );
  return { account: res.allowed_account ?? null, row: res.rows?.[0] ?? null };
}

export function googleChatHealth(c?: GoogleChatConnection | null): { state: ChannelHealth; detail: string } {
  if (!c || !c.connected) {
    return {
      state: "down",
      detail: tr("text004"),
    };
  }
  if (c.last_error) return { state: "down", detail: c.last_error };
  if (!c.default_space_name) return { state: "attention", detail: tr("text005") };
  if (!c.inbound_enabled)
    return { state: "attention", detail: tr("text006") };
  return { state: "ok", detail: tr("text007") };
}

export interface GoogleChatSpace {
  name: string;
  display_name?: string | null;
  type?: string | null;
}

/** The spaces the account sees in Google Chat (asks Google). */
export async function listGoogleChatSpaces() {
  const res = await callRatewareApi<{ rows?: GoogleChatSpace[]; default_space_name?: string | null }>(
    "list_google_chat_spaces",
  );
  return { rows: res.rows ?? [], current: res.default_space_name ?? null };
}

/** The space where every Bid Room conversation is mirrored. */
export const saveGoogleChatSpace = (name: string) =>
  callRatewareApi<{ row: GoogleChatConnection }>("save_google_chat_settings", { default_space_name: name });

/** Posts again the Bid Room messages that did not reach Google Chat (up to 50). */
export const retryGoogleChatSync = () =>
  callRatewareApi<{ attempted?: number; synced?: number; failed?: number; skipped?: number }>("retry_google_chat_sync", {
    limit: 50,
  });

/** Stops the mirror to Google Chat until it is connected again. An Administrador's. */
export const disconnectGoogleChat = () => callRatewareApi("disconnect_google_chat_connection");
