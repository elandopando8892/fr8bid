import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../api/abierto";

function respuesta() {
  const r: { status?: number; headers: Record<string, string>; body?: Buffer } = { headers: {} };
  const res = {
    setHeader: (k: string, v: string) => { r.headers[k.toLowerCase()] = v; },
    status: (n: number) => { r.status = n; return res; },
    send: (b: Buffer) => { r.body = b; return res; }
  };
  return { r, res: res as any };
}

describe("píxel de apertura /api/abierto", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("reenvía el token con el agente del cliente de correo y siempre devuelve el GIF", async () => {
    vi.stubEnv("RATEWARE_SUPABASE_URL", "https://rw.test/");
    vi.stubEnv("RATEWARE_SUPABASE_ANON_KEY", "anon");
    const llamadas: [string, RequestInit][] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => { llamadas.push([url, init]); return new Response(null, { status: 200 }); });
    const token = "0123456789abcdef0123456789abcdef";
    const { r, res } = respuesta();
    await handler({ method: "GET", query: { t: token }, headers: { "user-agent": "GoogleImageProxy" } } as any, res);
    expect(llamadas[0][0]).toBe(`https://rw.test/functions/v1/rfx-email-open?t=${token}`);
    expect((llamadas[0][1].headers as Record<string, string>)["x-forwarded-user-agent"]).toBe("GoogleImageProxy");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("image/gif");
    expect(r.headers["cache-control"]).toMatch(/no-store/);
  });

  it("con token raro o Rateware caído no reenvía nada, pero la imagen sale igual", async () => {
    vi.stubEnv("RATEWARE_SUPABASE_URL", "https://rw.test");
    vi.stubEnv("RATEWARE_SUPABASE_ANON_KEY", "anon");
    const fetch = vi.fn(async () => { throw new Error("caído"); });
    vi.stubGlobal("fetch", fetch);
    const a = respuesta();
    await handler({ method: "GET", query: { t: "../evento" }, headers: {} } as any, a.res);
    expect(fetch).not.toHaveBeenCalled();
    expect(a.r.status).toBe(200);
    const b = respuesta();
    await handler({ method: "GET", query: { t: "0123456789abcdef0123456789abcdef" }, headers: {} } as any, b.res);
    expect(b.r.status).toBe(200);
    expect(b.r.body?.length).toBeGreaterThan(20);
  });
});
