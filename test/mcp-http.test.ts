import { describe, expect, it } from "vitest";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { crearServidor } from "../src/mcp/servidor";
import { transporteApi } from "../src/mcp/transporte";

describe("contrato HTTP MCP", () => {
  async function rpc(method: string, params?: object) {
    const servidor = crearServidor(async () => ({ status: 200, headers: {}, body: { rows: [] } }), "viewer");
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await servidor.connect(transport);
    try {
      const r = await transport.handleRequest(new Request("https://fr8bid.test/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
      return { status: r.status, body: await r.json() };
    } finally { await servidor.close(); }
  }
  it("negocia y publica únicamente once herramientas de lectura", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe("fr8bid-mcp-server");
    const lista = await rpc("tools/list");
    expect(lista.body.result.tools).toHaveLength(11);
    expect(lista.body.result.tools.every((t: any) => t.annotations.readOnlyHint)).toBe(true);
    const r = await rpc("tools/call", { name: "eventos", arguments: {} });
    expect(r.body.result.structuredContent.eventos).toEqual([]);
    const escritura = await rpc("tools/call", { name: "confirmar", arguments: {} });
    expect(escritura.body.error || escritura.body.result?.isError).toBeTruthy();
  });
  it("solo llama al /api de Fr8Bid, sin redirecciones ni reintentos", async () => {
    const llamadas: { url: string; options?: RequestInit }[] = [];
    const t = transporteApi("https://fr8bid.test/api/mcp", "synthetic", async (url, options) => { llamadas.push({ url: String(url), options }); return new Response('{"rows":[]}', { status: 200 }); });
    await t("rateware-api", { action: "list_rfx_events" });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("https://fr8bid.test/api/rateware");
    expect(llamadas[0].options?.redirect).toBe("error");
    await expect(t("rateware-api", { action: "send_outreach_messages" })).rejects.toThrow();
    expect(llamadas).toHaveLength(1);
  });
});
