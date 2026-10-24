import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isConfigured } from "@/config/env";

/**
 * The one Supabase client in Fr8Bid — the Mesa's session and these modules'
 * share it. Same project as rateware, and the auth provider (Supabase Auth /
 * Google OAuth). It owns the session:
 *  - persistSession: keep the user signed in across reloads.
 *  - autoRefreshToken: refresh the access token before it expires.
 *  - detectSessionInUrl: consume the ?code=/#access_token after OAuth redirect.
 *
 * Domain data still flows through the rateware Edge Functions (see
 * `api-client.ts`) using the Supabase access token as the bearer, which is what
 * keeps everything written here in sync with rateware. In the simulated mode
 * there's no project: the client points nowhere and never has a session.
 */
export const supabase: SupabaseClient = createClient(
  isConfigured ? env.supabaseUrl : "https://sin-configurar.invalid",
  isConfigured ? env.supabaseAnonKey : "sin-configurar",
  {
    auth: {
      persistSession: isConfigured,
      autoRefreshToken: isConfigured,
      detectSessionInUrl: isConfigured,
      flowType: "pkce",
    },
  },
);
