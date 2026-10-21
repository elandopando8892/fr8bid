import type { VercelRequest, VercelResponse } from "@vercel/node";
import { enviarAEdgeFunctions, manejar } from "../src/servidor/proxy";

// POST /api/bid → rfx-bid-api de rateware-prod. La liga del carrier (token) es la credencial.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST", code: "METODO" });
  const base = process.env.RATEWARE_SUPABASE_URL;
  const anon = process.env.RATEWARE_SUPABASE_ANON_KEY;
  if (!base || !anon) return res.status(503).json({ error: "Fr8Bid no tiene configurado Rateware.", code: "SIN_CONFIGURACION" });
  const r = await manejar("rfx-bid-api", (req.body as Record<string, unknown>) || null, req.headers.authorization || null, {
    enviar: enviarAEdgeFunctions(base, anon),
    permitirEscrituras: process.env.FR8BID_ESCRITURAS_REALES === "si"
  });
  for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
  return res.status(r.status).json(r.body);
}
