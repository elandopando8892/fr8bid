import type { Transporte } from "../cliente/api.js";
import { LECTURAS } from "../servidor/proxy.js";

/** Solo el /api de ESTE recurso configurado; jamás usa Host/X-Forwarded-Host del cliente. */
export function transporteApi(resource: string, token: string, request: typeof fetch = fetch): Transporte {
  const endpoint = new URL("/api/rateware", resource);
  return async (servicio, body) => {
    if (servicio !== "rateware-api" || !LECTURAS[servicio].has(String(body.action))) throw new Error("Solo lectura");
    const response = await request(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(28000) });
    return { status: response.status, body: await response.json(), headers: {} };
  };
}
