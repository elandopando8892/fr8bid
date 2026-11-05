import type { Lang } from "./request.model";

/**
 * What the link itself says about how the page should open. Whoever sends
 * the link (Bidware's team, Fr8Growth's campaigns) knows the prospect: the
 * language they read, the brand the email came from and the country they
 * ship from. The page follows the link before the browser's own guesses.
 *
 *   /customer-rfi.html?token=…&lang=en&brand=xbf&country=US
 */

export type BrandKey = "marksman" | "xbf";
export type Country = "MX" | "US" | "CA";

export interface Brand {
  key: BrandKey;
  /** The name the shipper sees in the bar and in "your … contact". */
  name: string;
}

export const BRANDS: Record<BrandKey, Brand> = {
  marksman: { key: "marksman", name: "MARKSMAN" },
  xbf: { key: "xbf", name: "XBF" },
};

export interface LinkPrefs {
  /** Only when the link names one; otherwise the page decides. */
  lang: Lang | null;
  brand: Brand;
  /** The country new origins and destinations start in. */
  country: Country;
}

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | null => {
  const text = String(value ?? "").trim().toLowerCase();
  return (allowed.find((entry) => entry.toLowerCase() === text) as T | undefined) ?? null;
};

/**
 * `lang=en|es`, `brand=xbf|marksman` and `country=MX|US|CA`; anything else is
 * ignored. With no country, an English link starts in the US (that is who
 * Fr8Growth writes to in English) and every other link in Mexico.
 */
export function linkPrefs(search: string | URLSearchParams): LinkPrefs {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const lang = pick(params.get("lang"), ["es", "en"] as const);
  const brand = BRANDS[pick(params.get("brand"), ["marksman", "xbf"] as const) ?? "marksman"];
  const country = pick(params.get("country"), ["MX", "US", "CA"] as const) ?? (lang === "en" ? "US" : "MX");
  return { lang, brand, country };
}

/**
 * The shipper's own switch is kept in the address too, so a reload of the
 * same tab doesn't snap back to the link's language.
 */
export function keepLangInAddress(lang: Lang, country: Country) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("lang") === lang) return;
    url.searchParams.set("lang", lang);
    // The country came from the link's language: switching language doesn't move the shipper.
    if (!url.searchParams.get("country")) url.searchParams.set("country", country);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    /* an address we can't rewrite just keeps the link's language */
  }
}
