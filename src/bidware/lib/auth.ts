import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { env } from "@/config/env";

/**
 * Supabase Auth helpers (Google OAuth). Replaces the old Kinde integration.
 * The access token returned here is what the rateware Edge Functions receive
 * as the bearer, so the same session authorizes every shared-backend call.
 */

function returnUrl(): string {
  const { origin, hostname } = window.location;
  return hostname.endsWith(".vercel.app") ? origin : `${origin}/callback`;
}

export async function signInWithOAuth(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: env.oauthProvider,
    options: {
      // Must be registered in Supabase Auth > Redirect URLs, otherwise Supabase
      // ignores it and falls back to the project's Site URL (rateware).
      // fr8bid.vercel.app is registered as the bare origin; Bidware's domain as
      // `<origin>/**`, so there we send a real path. detectSessionInUrl
      // consumes the code wherever we land.
      redirectTo: returnUrl(),
      // Always offer the account list, so whoever came in with a personal
      // account can pick the team one.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

export async function getUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export function onAuthStateChange(cb: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
