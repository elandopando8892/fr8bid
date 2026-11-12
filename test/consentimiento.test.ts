import { describe, expect, it } from "vitest";
import { decidir, idValido, leerAutorizacion, nombreCliente, retornoSeguro } from "../src/cliente/consentimiento";

const ID = "3f6b2c1a-9d4e-4f8a-b1c2-0e9d8c7b6a51";
function op(status: number, body: unknown, vistos: { url: string; init: RequestInit }[] = []) {
  return {
    base: "https://proyecto.supabase.co/", anon: "anon-publica", token: "token-usuario",
    fetch: (async (url: string, init: RequestInit) => { vistos.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch
  };
}

describe("consentimiento OAuth del MCP", () => {
  it("lee la solicitud con la sesión del usuario y la llave pública", async () => {
    const vistos: { url: string; init: RequestInit }[] = [];
    const r = await leerAutorizacion(op(200, { authorization_id: ID, client: { client_name: "ChatGPT" }, scope: "openid email", redirect_uri: "https://chatgpt.com/cb" }, vistos), ID);
    expect(r).toMatchObject({ tipo: "pedir" });
    expect(r.tipo === "pedir" && nombreCliente(r.detalle)).toBe("ChatGPT");
    expect(vistos[0].url).toBe(`https://proyecto.supabase.co/auth/v1/oauth/authorizations/${ID}`);
    expect(vistos[0].init.headers).toMatchObject({ apikey: "anon-publica", authorization: "Bearer token-usuario" });
    expect(vistos[0].init.method).toBeUndefined();
  });
  it("si ya había consentimiento, solo redirige al cliente", async () => {
    expect(await leerAutorizacion(op(200, { redirect_url: "https://claude.ai/api/mcp/auth_callback?code=x" }), ID))
      .toEqual({ tipo: "redirigir", url: "https://claude.ai/api/mcp/auth_callback?code=x" });
  });
  it.each(["approve", "deny"] as const)("envía %s y devuelve la dirección de regreso", async accion => {
    const vistos: { url: string; init: RequestInit }[] = [];
    expect(await decidir(op(200, { redirect_url: "https://chatgpt.com/cb?code=1" }, vistos), ID, accion)).toBe("https://chatgpt.com/cb?code=1");
    expect(vistos[0].url).toBe(`https://proyecto.supabase.co/auth/v1/oauth/authorizations/${ID}/consent`);
    expect(vistos[0].init).toMatchObject({ method: "POST", body: JSON.stringify({ action: accion }) });
  });
  it("rechaza ids inválidos sin llamar a Supabase", async () => {
    const vistos: { url: string; init: RequestInit }[] = [];
    for (const id of ["", "../admin", "a b", "x".repeat(200)]) {
      await expect(leerAutorizacion(op(200, {}, vistos), id)).rejects.toThrow();
      await expect(decidir(op(200, {}, vistos), id, "approve")).rejects.toThrow();
    }
    expect(vistos).toHaveLength(0);
    expect(idValido(null)).toBe(false);
  });
  it.each(["javascript:alert(1)", "http://evil.example/cb", 42, undefined])("no sigue direcciones de regreso inseguras: %s", async url => {
    await expect(decidir(op(200, { redirect_url: url }), ID, "approve")).rejects.toThrow();
  });
  it("propaga el error de Supabase sin inventar éxito", async () => {
    await expect(leerAutorizacion(op(404, { msg: "authorization not found" }), ID)).rejects.toThrow("authorization not found");
    await expect(leerAutorizacion(op(200, { authorization_id: ID }), ID)).rejects.toThrow();
  });
  it("tras el login solo regresa a una ruta de consentimiento válida", () => {
    expect(retornoSeguro(`/oauth/consent?authorization_id=${ID}`)).toBe(`/oauth/consent?authorization_id=${ID}`);
    for (const v of [null, "https://evil.example/oauth/consent?authorization_id=" + ID, "//evil.example", "/eventos", "/oauth/consent?authorization_id=../x"])
      expect(retornoSeguro(v)).toBeNull();
  });
});
