import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../api/mcp";
import metaHandler from "../api/mcp-metadata";
import * as auth from "../src/mcp/auth";
import { crearSimulado, sembrarDemo } from "../src/simulado/semilla";
import { manejar } from "../src/servidor/proxy";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("endpoint Vercel con frontera de identidad simulada", () => {
  it("desafía OAuth, bloquea Origin y consulta por el proxy sin compartir cuentas", async () => {
    const base = crearSimulado();
    base.sim.hoy = () => "2026-10-29";
    base.sim.ahora = () => "2026-10-29T18:00:00Z";
    const demo = await sembrarDemo(base);
    demo.sim.events.find(e => e.id === demo.eventId)!.rfx_id = "RFx-FR8BID-PRUEBA-01";
    vi.stubEnv("RATEWARE_SUPABASE_URL", "https://auth.example.test");
    vi.stubEnv("RATEWARE_SUPABASE_ANON_KEY", "public-synthetic");
    vi.stubEnv("FR8BID_MCP_CLIENT_IDS", "synthetic-client");
    vi.stubEnv("FR8BID_MCP_RESOURCE", "https://fr8bid.example.test/api/mcp");
    vi.spyOn(auth, "autenticar").mockImplementation(async authorization => {
      if (!authorization || !["Bearer operador", "Bearer ajeno"].includes(authorization)) throw new Error("401");
      return { token: `sim:${authorization.slice(7)}`, userId: authorization.slice(7), rol: "operator" };
    });
    const realFetch = globalThis.fetch;
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", async (url: URL, options: RequestInit) => {
      expect(String(url)).toBe("https://fr8bid.example.test/api/rateware");
      const body = JSON.parse(String(options.body));
      llamadas.push(body.action);
      const token = (options.headers as Record<string, string>).authorization;
      const r = await manejar("rateware-api", body, token, { permitirEscrituras: false, enviar: (s, b, a) => demo.sim.llamar(s, b, a), hoy: demo.sim.hoy });
      return new Response(JSON.stringify(r.body), { status: r.status });
    });
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const vr = req as VercelRequest;
      vr.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
      const vs = res as VercelResponse;
      vs.status = code => { res.statusCode = code; return vs; };
      vs.json = obj => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); return vs; };
      if (req.url === "/api/mcp-metadata") metaHandler(vr, vs);
      else await handler(vr, vs);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const noAuth = await realFetch(`${url}/api/mcp`, { method: "POST" });
      expect(noAuth.status).toBe(401);
      expect(noAuth.headers.get("www-authenticate")).toContain("https://fr8bid.example.test/api/mcp-metadata");
      expect((await (await realFetch(`${url}/api/mcp-metadata`)).json()).resource).toBe("https://fr8bid.example.test/api/mcp");
      expect((await realFetch(`${url}/api/mcp`, { method: "POST", headers: { origin: "https://evil.test" } })).status).toBe(403);
      expect(llamadas).toEqual([]);
      for (const user of ["operador", "ajeno", "operador"]) {
        const r = await realFetch(`${url}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", authorization: `Bearer ${user}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "eventos", arguments: {} } }) });
        expect(r.status).toBe(200);
        const result = (await r.json()).result.structuredContent;
        expect(result.eventos.length).toBe(user === "ajeno" ? 0 : 1);
      }
      vi.stubEnv("FR8BID_MCP_CLIENT_IDS", "");
      expect((await realFetch(`${url}/api/mcp`, { method: "POST" })).status).toBe(503);
      expect(llamadas).toEqual(["list_rfx_events", "list_rfx_events", "list_rfx_events"]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
