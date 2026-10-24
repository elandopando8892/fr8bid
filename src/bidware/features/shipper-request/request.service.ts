import { callRfxBidApi } from "@/lib/api-client";
import { toRfiPayload, type Lang, type Place, type RequestDraft, type RequestResponse } from "./request.model";

/** The shipper's link: the token is the only credential. */
export const loadRequest = (token: string) => callRfxBidApi<RequestResponse>("get_customer_rfi", { token });

/** `base` is the saved response as loaded: what this form doesn't edit rides along. */
export const saveRequest = (token: string, draft: RequestDraft, base: Record<string, unknown>) =>
  callRfxBidApi("save_customer_rfi", { token, rfi: toRfiPayload(draft, base) });

/**
 * submit_customer_rfi marks the request as sent before it rewrites the lanes;
 * if that rewrite fails the request is locked with its rows half-written.
 * Saving the identical payload first means the complete request is stored
 * (rows and JSON) before the submit starts; the submit's own copy of the
 * payload is kept in the frozen snapshot even if its rewrite fails.
 */
export async function submitRequest(token: string, draft: RequestDraft, base: Record<string, unknown>, isCurrent: () => boolean = () => true) {
  const requireCurrent = () => { if (!isCurrent()) throw new Error("The request link changed."); };
  requireCurrent();
  await saveRequest(token, draft, base);
  requireCurrent();
  return await callRfxBidApi("submit_customer_rfi", { token, rfi: toRfiPayload(draft, base) });
}

export async function searchPlaces(token: string, search: string, country?: string): Promise<Place[]> {
  if (search.trim().length < 2) return [];
  const res = await callRfxBidApi<{ rows?: Place[] }>("customer_rfi_search_locations", {
    token,
    search: search.trim(),
    country: country || undefined,
    limit: 10,
  });
  return res.rows ?? [];
}

/** rfx-bid-api answers an unknown token with a raw database message. */
export function explainRequestError(message: string, lang: Lang) {
  const text = message.toLowerCase();
  if (/expired/.test(text)) {
    return lang === "es"
      ? "Esta liga ya venció. Pide una nueva a tu contacto en MARKSMAN."
      : "This link has expired. Ask your MARKSMAN contact for a new one.";
  }
  if (/not active|no rows|0 rows|json object requested|single json object|pgrst116/.test(text)) {
    return lang === "es"
      ? "Esta liga no está activa. Pide una nueva a tu contacto en MARKSMAN."
      : "This link isn't active. Ask your MARKSMAN contact for a new one.";
  }
  if (/already been submitted/.test(text)) {
    return lang === "es"
      ? "Esta solicitud ya se envió. Si necesitas cambiarla, avísale a tu contacto en MARKSMAN."
      : "This request was already sent. To change it, let your MARKSMAN contact know.";
  }
  if (/failed to fetch|network/.test(text)) {
    return lang === "es" ? "Sin conexión. Revisa tu internet y vuelve a intentar." : "No connection. Check your internet and try again.";
  }
  // Database or server wording means nothing to a shipper; keep it for us.
  console.error("Shipper request error:", message);
  return lang === "es"
    ? "Algo falló de nuestro lado. Vuelve a intentar en un momento; no cierres esta página."
    : "Something failed on our side. Try again in a moment; keep this page open.";
}

export const isAlreadySubmitted = (message: string) => /already been submitted/i.test(message);
