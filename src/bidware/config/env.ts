/**
 * Central runtime config. In Fr8Bid the Supabase project comes from the same
 * variables as the Mesa (VITE_RATEWARE_*); Bidware's own names still work.
 * Auth is Supabase Auth (Google OAuth).
 */

// import.meta.env is Vite's; a module bundled for a Node test has none.
const vars: Record<string, string | undefined> = import.meta.env ?? {};
const pick = (...names: string[]): string => names.map((name) => vars[name]).find(Boolean) ?? "";

/**
 * Where carriers and shippers open their links: Fr8Bid's own domain (decisión de
 * Jose, 7-nov). bidware.heymarksman.com redirects here, so links already sent keep working.
 */
export const BIDWARE_ORIGIN = "https://fr8bid.heymarksman.com";

export const env = {
  supabaseUrl: pick("VITE_RATEWARE_SUPABASE_URL", "VITE_SUPABASE_URL"),
  supabaseAnonKey: pick("VITE_RATEWARE_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
  /** Supabase OAuth provider used by the login button. */
  oauthProvider: (vars.VITE_SUPABASE_OAUTH_PROVIDER || "google") as
    | "google"
    | "github"
    | "azure",
  /**
   * The origin carriers and shippers are sent to in an invitation, a profile
   * request or an RFI link. The backend builds the link as
   * `app_origin || RATEWARE_APP_URL || https://rateware.vercel.app`. From
   * Fr8Bid it is fr8bid.heymarksman.com; VITE_APP_ORIGIN changes it.
   */
  appOrigin: vars.VITE_APP_ORIGIN || BIDWARE_ORIGIN,
  /** Fr8Bid's simulated mode: only the Mesa has data; these modules have no backend. */
  simulated: vars.VITE_FR8BID_MODO !== "rateware",
} as const;

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
