import type { VercelRequest, VercelResponse } from "@vercel/node";

// GET /api/abierto?t=<token> → píxel de apertura de los correos de RFx (7-nov-2026).
// Rateware pone esta liga en cada invitación y recordatorio; aquí se reenvía a
// rfx-email-open con el agente del cliente de correo (Gmail, Apple Mail…), que
// es lo que distingue una apertura de la lectura de un antivirus. Siempre
// responde el mismo GIF, aunque Rateware no conteste.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const TOKEN = /^[0-9a-f]{32}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = String(req.query.t || "");
  const base = process.env.RATEWARE_SUPABASE_URL;
  const anon = process.env.RATEWARE_SUPABASE_ANON_KEY;
  if (req.method === "GET" && TOKEN.test(token) && base && anon) {
    try {
      await fetch(`${base.replace(/\/$/, "")}/functions/v1/rfx-email-open?t=${token}`, {
        headers: { apikey: anon, "x-forwarded-user-agent": String(req.headers["user-agent"] || "").slice(0, 300) },
        signal: AbortSignal.timeout(3000)
      });
    } catch {
      // Una lectura perdida no rompe la imagen del correo.
    }
  }
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Content-Length", String(GIF.length));
  return res.status(200).send(GIF);
}
