import { tr } from "@/i18n/common";
import { env } from "@/config/env";
import { getAccessToken } from "@/lib/auth";
import { allows, currentTeamRole, needOf, NEED_REASON } from "@/lib/roles";
import { readJsonResponse } from "../../../packages/http-response/src/read-json.mjs";

/**
 * In Fr8Bid every call goes to the app's own /api/funcion, which forwards it to
 * the Edge Function server to server (same origin, so the functions' CORS list
 * doesn't matter) and applies Fr8Bid's rules: the FR8BID_ESCRITURAS_REALES
 * switch, HDships out, and awarding left to the Mesa. In the simulated mode
 * there is no backend: the call fails with a sentence the team can read.
 */
export const functionEndpoint = (fn: string) => `/api/funcion?fn=${encodeURIComponent(fn)}`;

export const SIMULATED_MESSAGE =
  "Modo simulado: este módulo trabaja con Rateware real y aquí no tiene datos. La Mesa sí funciona con el evento de prueba.";

function assertBackend(action: string) {
  if (env.simulated) throw new ApiError(SIMULATED_MESSAGE, { status: 503, code: "SIMULADO", action });
}

/**
 * Thin client over the rateware Supabase Edge Functions. Mirrors rateware's
 * `callRatewareFunction(functionName, action, payload)` contract exactly:
 * a POST of `{ action, ...payload }` with a Supabase Auth bearer token. Reusing
 * this contract is what makes everything Bidware writes replicate into rateware.
 */

export class ApiError extends Error {
  status: number;
  code?: string | number;
  details?: string;
  hint?: string;
  incidentId?: string;
  action?: string;
  stage?: string;

  constructor(message: string, init: Partial<ApiError> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = init.status ?? 0;
    this.code = init.code;
    this.details = init.details;
    this.hint = init.hint;
    this.incidentId = init.incidentId;
    this.action = init.action;
    this.stage = init.stage;
  }
}

function stringifyApiError(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || "";
  if (typeof value !== "object") return String(value);
  const v = value as Record<string, unknown>;
  const nested =
    v.error || v.message || v.reason || v.description || v.detail || v.details || v.hint;
  if (nested && nested !== value) {
    const message = stringifyApiError(nested);
    if (message) return message;
  }
  return "";
}

function apiErrorMessage(data: any, text: string, status: number): string {
  const parts = [data?.error, data?.cause, data?.details, data?.hint, data?.message]
    .map(stringifyApiError)
    // rateware prefixes a coded error with its status ("409: …"); the team reads the sentence.
    .map((value) => value.replace(/^(?:HTTP )?\d{3}: /, ""))
    .filter((value, index, values) => value && values.indexOf(value) === index);
  return (
    parts.join(" | ") ||
    stringifyApiError(data) ||
    stringifyApiError(text) ||
    `Fr8Bid API request failed (${status})`
  );
}

/**
 * A fetch that never reached the server (offline, DNS, CORS, a cut connection)
 * throws a TypeError in English ("Failed to fetch"). The team reads it on
 * screen, so it becomes one message in their words. Retrying is safe: the
 * writes carry an idempotency key or an operation id (wireframe 22).
 */
async function post(endpoint: string, headers: Record<string, string>, body: string, action: string): Promise<Response> {
  try {
    return await fetch(endpoint, { method: "POST", headers, body });
  } catch (e) {
    throw new ApiError(tr("text047"), {
      status: 0,
      code: "network",
      details: (e as Error)?.message,
      action,
    });
  }
}

/** The team's own functions; the rest are reached by token, where roles don't apply. */
const ROLE_CHECKED = new Set(["rateware-api", "quotedesk-api"]);

export async function callFunction<T = any>(
  functionName: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const assertRole = () => {
    if (ROLE_CHECKED.has(functionName)) {
      const need = needOf(functionName, action, payload);
      if (!allows(currentTeamRole(), need) && need !== "read") {
        throw new ApiError(NEED_REASON[need], { status: 403, code: "role_forbidden", action });
      }
    }
  };
  assertRole();
  assertBackend(action);
  const token = await getAccessToken();
  // Resolving/refreshing the token can change the current session and role.
  assertRole();
  if (!token) {
    throw new ApiError("You must sign in to continue.", { status: 401, action });
  }

  const endpoint = functionEndpoint(functionName);
  const response = await post(
    endpoint,
    { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    JSON.stringify({ action, ...payload }),
    action,
  );

  const { data, text } = await readJsonResponse(response, "text-or-error");

  if (!response.ok) {
    throw new ApiError(apiErrorMessage(data, text, response.status), {
      status: response.status,
      code: data?.code || data?.status || response.status,
      details: data?.details || "",
      hint: data?.hint || "",
      incidentId: data?.incident_id || response.headers.get("x-request-id") || "",
      action: data?.action || action,
      stage: data?.stage || undefined,
    });
  }

  return data as T;
}

/** Convenience wrappers for the two backends the Bid Room uses. */
export const callRatewareApi = <T = any>(action: string, payload?: Record<string, unknown>) =>
  callFunction<T>("rateware-api", action, payload);

/** QuoteDesk's own function; same session and workspace as rateware-api. */
export const callQuotedeskApi = <T = any>(action: string, payload?: Record<string, unknown>) =>
  callFunction<T>("quotedesk-api", action, payload);

/** rfx-bid-api is token-based (carrier private room); no Kinde token needed there. */
export const callRfxBidApi = <T = any>(action: string, payload: Record<string, unknown> = {}) =>
  callTokenFunction<T>("rfx-bid-api", action, payload);

/** carrier-profile-api: same model, the profile link's token is the credential. */
export const callCarrierProfileApi = <T = any>(
  action: string,
  payload: Record<string, unknown> = {},
) => callTokenFunction<T>("carrier-profile-api", action, payload);

/** shipper-profile-api: the shipper's own profile link; the token is the credential. */
export const callShipperProfileApi = <T = any>(action: string, payload: Record<string, unknown> = {}) =>
  callTokenFunction<T>("shipper-profile-api", action, payload);

/**
 * Functions reached from a private link: the token travels in the body and
 * there is no session, so no Authorization header is sent.
 */
async function callTokenFunction<T = any>(
  fn: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  assertBackend(action);
  const endpoint = functionEndpoint(fn);
  const response = await post(endpoint, { "Content-Type": "application/json" }, JSON.stringify({ action, ...payload }), action);
  const { data, text } = await readJsonResponse(response, "text-or-error");
  if (!response.ok) {
    throw new ApiError(apiErrorMessage(data, text, response.status), {
      status: response.status,
      action,
    });
  }
  return data as T;
}
