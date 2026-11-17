import type { VercelRequest, VercelResponse } from "@vercel/node";
import { reenviarContactos } from "../src/servidor/contactosEmpresa.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ code: "METHOD", error: "Solo POST." });
  const base = process.env.RATEWARE_SUPABASE_URL, anon = process.env.RATEWARE_SUPABASE_ANON_KEY;
  if (!base || !anon) return res.status(503).json({ code: "CONTACT_SERVICE_UNAVAILABLE", error: "El servicio de contactos todavía no está disponible." });
  const r = await reenviarContactos(req.body, req.headers.authorization || null, process.env.FR8BID_ESCRITURAS_REALES === "si", async (body, auth) => {
    const response = await fetch(`${base}/functions/v1/carrier-contacts-api`, { method: "POST", headers: {
      "content-type": "application/json", apikey: anon, authorization: auth
    }, body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
    return { status: response.status, body: await response.json().catch(() => null) };
  });
  return res.status(r.status).json(r.body);
}
