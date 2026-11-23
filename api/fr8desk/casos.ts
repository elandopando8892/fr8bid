import type { VercelRequest, VercelResponse } from "@vercel/node";
import { manejarFr8Desk } from "../../src/servidor/fr8desk.js";
import { enviarAEdgeFunctions } from "../../src/servidor/proxy.js";

// GET  /api/fr8desk/casos?rfx_event_id=<uuid> → casos de Fr8Desk ligados al evento.
// POST /api/fr8desk/casos {rfx_event_id, request_id, asunto, descripcion, impacto}
//      → abre un caso en Fr8Desk en nombre de la persona. La credencial fd_…
//      (FR8DESK_TOKEN) nunca sale del servidor.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const base = process.env.RATEWARE_SUPABASE_URL;
  const anon = process.env.RATEWARE_SUPABASE_ANON_KEY;
  const r = await manejarFr8Desk(
    req.method || "GET",
    (req.query as Record<string, unknown>) || {},
    (req.body as Record<string, unknown>) || null,
    req.headers.authorization || null,
    {
      config: { url: process.env.FR8DESK_URL, token: process.env.FR8DESK_TOKEN, equipo: process.env.FR8DESK_EQUIPO },
      rateware: base && anon ? enviarAEdgeFunctions(base, anon) : null,
      fetch
    }
  );
  res.setHeader("cache-control", "no-store");
  return res.status(r.status).json(r.body);
}
