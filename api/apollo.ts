import type { VercelRequest, VercelResponse } from "@vercel/node";
import { consultarApollo, type LlamarApollo } from "../src/servidor/apollo.js";

// Legacy search only. Paid enrichment uses the durable company operation.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST", code: "METODO" });
  if (req.body?.accion === "revelar") return res.status(409).json({ error: "Abre Contactos de empresas en la Mesa para confirmar y guardar el resultado.", code: "USAR_CONTACTOS_EMPRESA" });
  const base = process.env.RATEWARE_SUPABASE_URL;
  const anon = process.env.RATEWARE_SUPABASE_ANON_KEY;
  const auth = req.headers.authorization || "";
  const sesion = { valida: false, admin: false };
  if (base && anon && auth.startsWith("Bearer ")) {
    try {
      const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, authorization: auth } });
      if (r.ok) {
        const u = await r.json().catch(() => null);
        sesion.valida = true;
        sesion.admin = Array.isArray(u?.app_metadata?.roles) && u.app_metadata.roles.includes("admin");
      }
    } catch {
      sesion.valida = false;
    }
  }
  const clave = process.env.APOLLO_API_KEY;
  const llamar: LlamarApollo | null = clave
    ? async (ruta, body) => {
        const r = await fetch(`https://api.apollo.io/api/v1/${ruta}`, {
          method: "POST",
          headers: { "content-type": "application/json", "cache-control": "no-cache", "x-api-key": clave },
          body: JSON.stringify(body)
        });
        return { status: r.status, body: await r.json().catch(() => null) };
      }
    : null;
  const r = await consultarApollo(req.body, sesion, llamar);
  return res.status(r.status).json(r.body);
}
