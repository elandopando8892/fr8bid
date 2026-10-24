import type { VercelRequest, VercelResponse } from "@vercel/node";
import { preguntarAClaude } from "../src/servidor/claude.js";
import { revisarTelefonos } from "../src/servidor/telefonos.js";

// POST /api/telefonos → reglas por lada y, para los dudosos, Claude. Solo con
// sesión válida de rateware-prod: la clave de la IA nunca sale del servidor.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST", code: "METODO" });
  const base = process.env.RATEWARE_SUPABASE_URL;
  const anon = process.env.RATEWARE_SUPABASE_ANON_KEY;
  const auth = req.headers.authorization || "";
  let valida = false;
  if (base && anon && auth.startsWith("Bearer ")) {
    try {
      const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, authorization: auth } });
      valida = r.ok;
    } catch {
      valida = false;
    }
  }
  const clave = process.env.ANTHROPIC_API_KEY;
  const r = await revisarTelefonos(req.body, valida, clave ? preguntarAClaude(clave) : null);
  return res.status(r.status).json(r.body);
}
