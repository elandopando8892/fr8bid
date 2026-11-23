import type { VercelRequest, VercelResponse } from "@vercel/node";
import { configuracion, metadata } from "../src/mcp/auth.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).end();
  const c = configuracion(process.env);
  if (!c) return res.status(503).json({ error: "OAuth MCP pendiente de configuración" });
  return res.status(200).json(metadata(c));
}
