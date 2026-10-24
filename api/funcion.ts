import type { VercelRequest, VercelResponse } from "@vercel/node";
import { modoEscrituras } from "../src/servidor/proxy.js";
import { esRespuestaProtegida, revisar, sinProtegidos } from "../src/servidor/paso.js";

// POST /api/funcion?fn=<función> → Edge Function de rateware-prod para los
// módulos traídos de Bidware. Las reglas están en src/servidor/paso.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST", code: "METODO" });
  const base = process.env.RATEWARE_SUPABASE_URL;
  const anon = process.env.RATEWARE_SUPABASE_ANON_KEY;
  if (!base || !anon) return res.status(503).json({ error: "Fr8Bid no tiene configurado Rateware.", code: "SIN_CONFIGURACION" });

  const fn = String(req.query.fn || "");
  const tipo = String(req.headers["content-type"] || "");
  const esJson = tipo.startsWith("application/json");
  const json = esJson && req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : esJson ? {} : null;
  const autorizacion = req.headers.authorization || null;
  const bloqueo = revisar({ fn, json, autorizacion, modo: modoEscrituras(process.env.FR8BID_ESCRITURAS_REALES) });
  if (bloqueo) return res.status(bloqueo.status).json(bloqueo.body);

  const headers: Record<string, string> = { apikey: anon, "content-type": tipo || "application/json" };
  if (autorizacion) headers.authorization = autorizacion;
  if (json?.operation_id) headers["x-operation-id"] = String(json.operation_id);
  // multipart (create-raw-upload): el cuerpo tal cual, con su boundary.
  const cuerpo = json ? JSON.stringify(json) : await crudo(req);

  let r: Response;
  try {
    r = await fetch(`${base.replace(/\/$/, "")}/functions/v1/${fn}`, { method: "POST", headers, body: cuerpo, signal: AbortSignal.timeout(55000) });
  } catch {
    return res.status(504).json({ error: "Rateware no respondió. El resultado es incierto: no se reintenta solo.", code: "SIN_RESPUESTA", incierta: true });
  }
  for (const h of ["x-request-id", "x-operation-id"]) {
    const v = r.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  const texto = await r.text();
  let datos: unknown;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    res.setHeader("content-type", r.headers.get("content-type") || "text/plain; charset=utf-8");
    return res.status(r.status).send(texto);
  }
  if (esRespuestaProtegida(datos)) return res.status(404).json({ error: "No encontrado.", code: "NOT_FOUND" });
  return res.status(r.status).json(sinProtegidos(datos));
}

async function crudo(req: VercelRequest): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const c of req) partes.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(partes);
}
