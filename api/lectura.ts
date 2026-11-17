import type { VercelRequest, VercelResponse } from "@vercel/node";
import { leerConClaude } from "../src/servidor/claude.js";
import { leerRespuesta, secretoValido } from "../src/servidor/lectura.js";

// Leer un PDF o una imagen tarda más que el texto: se da hasta un minuto.
export const config = { maxDuration: 60 };

// POST /api/lectura → la IA lee la respuesta de un carrier por correo o
// WhatsApp (texto pegado y, si los hay, su PDF o imagen) y propone la oferta
// por ruta. Solo con sesión válida de rateware-prod o, para la revisión
// programada de Rateware, con el secreto compartido (x-lectura-secreto); la
// clave de la IA nunca sale del servidor. No guarda ni envía nada.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST", code: "METODO" });
  const base = process.env.RATEWARE_SUPABASE_URL;
  const anon = process.env.RATEWARE_SUPABASE_ANON_KEY;
  const auth = req.headers.authorization || "";
  let valida = secretoValido(req.headers["x-lectura-secreto"], process.env.FR8BID_LECTURA_SECRET);
  if (!valida && base && anon && auth.startsWith("Bearer ")) {
    try {
      const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, authorization: auth } });
      valida = r.ok;
    } catch {
      valida = false;
    }
  }
  const clave = process.env.ANTHROPIC_API_KEY;
  const r = await leerRespuesta(req.body, valida, clave ? leerConClaude(clave) : null);
  return res.status(r.status).json(r.body);
}
