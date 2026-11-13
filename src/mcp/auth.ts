import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { isTeamEmail } from "../bidware/lib/team.js";
import type { Rol } from "../dominio/tipos.js";

export interface ConfigAuth { issuer: string; resource: string; clientIds: string[]; anonKey: string }
export function configuracion(env: NodeJS.ProcessEnv): ConfigAuth | null {
  const base = env.RATEWARE_SUPABASE_URL;
  const anonKey = env.RATEWARE_SUPABASE_ANON_KEY;
  const clientIds = (env.FR8BID_MCP_CLIENT_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const resource = env.FR8BID_MCP_RESOURCE;
  if (!base || !anonKey || !resource || !clientIds.length) return null;
  try {
    const url = new URL(resource), auth = new URL(base);
    if (url.protocol !== "https:" || url.pathname !== "/api/mcp" || url.search || url.hash || url.username || url.password || auth.protocol !== "https:" || auth.username || auth.password || auth.search || auth.hash || auth.pathname !== "/") return null;
    return { issuer: `${auth.origin}/auth/v1`, resource: url.href, clientIds, anonKey };
  } catch { return null; }
}
export function metadata(c: ConfigAuth) {
  return { resource: c.resource, authorization_servers: [c.issuer], bearer_methods_supported: ["header"], resource_name: "Fr8Bid — consultas y cambios con confirmación" };
}
export async function autenticar(authorization: string | undefined, c: ConfigAuth, jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(`${c.issuer}/.well-known/jwks.json`), { timeoutDuration: 5000 }), request: typeof fetch = fetch) {
  const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization || "")?.[1];
  if (!token) throw new Error("Inicia sesión con OAuth");
  // Supabase OAuth emite aud «authenticated»; se acepta también la URL del recurso por si un
  // Custom Access Token Hook la fija después. El JWT genérico del navegador no trae client_id y
  // se rechaza abajo; service_role también (role ≠ authenticated).
  const { payload } = await jwtVerify(token, jwks, { issuer: c.issuer, audience: [c.resource, "authenticated"], algorithms: ["ES256", "RS256"], requiredClaims: ["exp", "sub", "client_id", "role"] });
  if (payload.role !== "authenticated" || typeof payload.client_id !== "string" || !c.clientIds.includes(payload.client_id)) throw new Error("Cliente no autorizado");
  const r = await request(`${c.issuer}/user`, { headers: { authorization: `Bearer ${token}`, apikey: c.anonKey }, redirect: "error", signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!r.ok) throw new Error("Sesión no válida");
  const user = await r.json();
  if (user.id !== payload.sub || !isTeamEmail(user.email)) throw new Error("Cuenta fuera del equipo");
  const roles: unknown[] = Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : [];
  const rol: Rol = roles.includes("admin") ? "admin" : roles.includes("operator") ? "operator" : "viewer";
  return { token, rol, userId: user.id as string, clientId: payload.client_id, email: String(user.email).toLowerCase() };
}
