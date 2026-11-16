// Consentimiento del servidor OAuth de Supabase (rateware-prod) para el MCP de Fr8Bid.
// Supabase redirige a /oauth/consent?authorization_id=…; aquí se leen los detalles y se
// aprueba o rechaza con la sesión del usuario. Llama al API REST de Auth directamente
// (/auth/v1/oauth/authorizations/{id}), el mismo que usa supabase-js ≥ 2.8x en auth.oauth.

export interface DetalleAutorizacion {
  authorization_id: string;
  redirect_uri?: string;
  scope?: string;
  client: { client_id?: string; client_name?: string; name?: string; client_uri?: string; logo_uri?: string };
  user?: { id?: string; email?: string };
}
export type Lectura = { tipo: "pedir"; detalle: DetalleAutorizacion } | { tipo: "redirigir"; url: string };

const ID = /^[A-Za-z0-9_-]{8,128}$/;
export const RETORNO = "fr8bid:oauth-retorno";

export function idValido(id: string | null): id is string {
  return !!id && ID.test(id);
}

/** Solo devuelve rutas internas de consentimiento; cualquier otra cosa se ignora. */
export function retornoSeguro(valor: string | null): string | null {
  if (!valor || !valor.startsWith("/oauth/consent?")) return null;
  const id = new URLSearchParams(valor.slice("/oauth/consent?".length)).get("authorization_id");
  return idValido(id) ? `/oauth/consent?authorization_id=${encodeURIComponent(id)}` : null;
}

function urlRedireccion(x: unknown): string {
  if (typeof x !== "string") throw new Error("Supabase no devolvió a dónde regresar.");
  const u = new URL(x);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")))
    throw new Error("Dirección de regreso no permitida.");
  return u.href;
}

interface Op { base: string; anon: string; token: string; fetch?: typeof fetch }

async function pedir(op: Op, ruta: string, init: RequestInit = {}) {
  const r = await (op.fetch ?? fetch)(`${op.base.replace(/\/$/, "")}/auth/v1${ruta}`, {
    ...init,
    headers: { apikey: op.anon, authorization: `Bearer ${op.token}`, "content-type": "application/json" },
    redirect: "error",
    cache: "no-store"
  });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(cuerpo?.msg || cuerpo?.error_description || cuerpo?.message || `Supabase respondió ${r.status}`);
  return cuerpo;
}

export async function leerAutorizacion(op: Op, id: string): Promise<Lectura> {
  if (!idValido(id)) throw new Error("Solicitud de autorización inválida.");
  const d = await pedir(op, `/oauth/authorizations/${encodeURIComponent(id)}`);
  if (!d || typeof d !== "object") throw new Error("Respuesta inválida de Supabase.");
  // Sin authorization_id: el usuario ya había consentido; solo se regresa al cliente.
  if (!("authorization_id" in d)) return { tipo: "redirigir", url: urlRedireccion(d.redirect_url) };
  if (!d.client || typeof d.client !== "object") throw new Error("Respuesta inválida de Supabase.");
  return { tipo: "pedir", detalle: d as DetalleAutorizacion };
}

export async function decidir(op: Op, id: string, accion: "approve" | "deny"): Promise<string> {
  if (!idValido(id)) throw new Error("Solicitud de autorización inválida.");
  const d = await pedir(op, `/oauth/authorizations/${encodeURIComponent(id)}/consent`, { method: "POST", body: JSON.stringify({ action: accion }) });
  return urlRedireccion(d?.redirect_url);
}

export function nombreCliente(d: DetalleAutorizacion): string {
  return d.client.client_name || d.client.name || d.client.client_id || "Aplicación";
}
