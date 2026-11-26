import type { VercelRequest, VercelResponse } from "@vercel/node";
import { leerDocumentosConClaude } from "../src/servidor/claude.js";
import { leerDocumentos, validarConRateware } from "../src/servidor/documentos.js";

// Leer un PDF o una foto tarda: se da hasta un minuto.
export const config = { maxDuration: 60 };

// POST /api/documentos → la IA lee los documentos que un carrier o un shipper
// sube desde su liga privada (perfil o solicitud) y propone valores para su
// formulario. La liga es la credencial y se valida con Rateware; la clave de
// la IA nunca sale del servidor. No guarda archivos ni escribe nada.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST", code: "METODO" });
  const base = process.env.RATEWARE_SUPABASE_URL;
  const anon = process.env.RATEWARE_SUPABASE_ANON_KEY;
  if (!base || !anon) return res.status(503).json({ error: "Fr8Bid no tiene configurado Rateware.", code: "SIN_CONFIGURACION" });
  const clave = process.env.ANTHROPIC_API_KEY;
  const r = await leerDocumentos(req.body, validarConRateware(base, anon), clave ? leerDocumentosConClaude(clave) : null);
  return res.status(r.status).json(r.body);
}
