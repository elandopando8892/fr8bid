import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { autenticar, configuracion } from "../src/mcp/auth.js";
import { crearServidor } from "../src/mcp/servidor.js";
import { transporteApi, transporteEscritura } from "../src/mcp/transporte.js";
import { secretoConfirmacion } from "../src/mcp/confirmacion.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const c = configuracion(process.env);
  if (!c) return res.status(503).json({ error: "OAuth MCP pendiente de configuración" });
  const origin = req.headers.origin;
  const origins = new Set([new URL(c.resource).origin, "https://chatgpt.com", "https://claude.ai"]);
  if (origin && !origins.has(origin)) return res.status(403).json({ error: "Origen no permitido" });
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Protocol-Version");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Protocol-Version, Accept");
    return res.status(204).end();
  }
  let sesion;
  try { sesion = await autenticar(req.headers.authorization, c); }
  catch {
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${new URL("/api/mcp-metadata", c.resource).href}"`);
    return res.status(401).json({ error: "Inicia sesión con OAuth de Fr8Bid" });
  }
  if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return res.status(405).end(); }
  // Escrituras (Entrega 2) solo para Operador/Administrador; sin FR8BID_MCP_CONFIRM_SECRET
  // preparar_*/confirmar responden «confirmaciones pendientes de configurar» y las lecturas siguen.
  const escrituras = sesion.rol === "viewer" ? undefined
    : { t: transporteEscritura(c.resource, sesion.token), userId: sesion.userId, clientId: sesion.clientId, secreto: secretoConfirmacion(process.env) };
  const servidor = crearServidor(transporteApi(c.resource, sesion.token), sesion.rol, undefined, escrituras);
  const transporte = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await servidor.connect(transporte);
    await transporte.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) res.status(500).json({ error: "No se pudo completar la consulta MCP" });
  } finally { await servidor.close(); }
}
