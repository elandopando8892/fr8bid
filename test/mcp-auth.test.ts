import { describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from "jose";
import { autenticar, metadata } from "../src/mcp/auth";

const config = { issuer: "https://auth.example.test/auth/v1", resource: "https://fr8bid.example.test/api/mcp", clientIds: ["cliente-prueba"], anonKey: "public-test-key" };
async function caso(payload: Record<string, unknown> = {}, expiration = "5m", audiencia = "authenticated") {
  const keys = await generateKeyPair("ES256");
  const jwk = { ...await exportJWK(keys.publicKey), kid: "test" };
  const token = await new SignJWT({ role: "authenticated", client_id: "cliente-prueba", ...payload }).setProtectedHeader({ alg: "ES256", kid: "test" }).setIssuer(config.issuer).setAudience(audiencia).setSubject("user-1").setExpirationTime(expiration).sign(keys.privateKey);
  return { token, jwks: createLocalJWKSet({ keys: [jwk] }) };
}
const usuario = async () => new Response(JSON.stringify({ id: "user-1", email: "operador@heymarksman.com", app_metadata: { roles: ["operator"] } }), { status: 200 });
describe("OAuth MCP", () => {
  it("descubre el emisor y valida firma, audiencia, cliente y usuario fresco", async () => {
    const x = await caso();
    expect(metadata(config).resource).toBe(config.resource);
    expect((await autenticar(`Bearer ${x.token}`, config, x.jwks, usuario)).rol).toBe("operator");
  });
  it("acepta la audiencia del recurso si un hook la fija", async () => {
    const x = await caso({}, "5m", config.resource);
    expect((await autenticar(`Bearer ${x.token}`, config, x.jwks, usuario)).rol).toBe("operator");
  });
  it.each(["https://otro.test/api/mcp", "anon"])("rechaza audiencia %s antes de contactar Auth", async aud => {
    const x = await caso({}, "5m", aud);
    let n = 0;
    await expect(autenticar(`Bearer ${x.token}`, config, x.jwks, async () => { n++; return usuario(); })).rejects.toThrow();
    expect(n).toBe(0);
  });
  it("rechaza el JWT de sesión del navegador (sin client_id) aunque traiga aud authenticated", async () => {
    const x = await caso({ client_id: undefined });
    let n = 0;
    await expect(autenticar(`Bearer ${x.token}`, config, x.jwks, async () => { n++; return usuario(); })).rejects.toThrow();
    expect(n).toBe(0);
  });
  it.each([{ client_id: "desconocido" }, { role: "service_role" }])("rechaza credenciales fuera del contrato %j", async payload => {
    const x = await caso(payload);
    await expect(autenticar(`Bearer ${x.token}`, config, x.jwks, usuario)).rejects.toThrow();
  });
  it("rechaza cuenta externa y sesión revocada sin recurrir a llaves de servicio", async () => {
    const x = await caso();
    for (const r of [new Response("{}", { status: 401 }), new Response(JSON.stringify({ id: "user-1", email: "ajeno@example.test" }))]) {
      await expect(autenticar(`Bearer ${x.token}`, config, x.jwks, async () => r)).rejects.toThrow();
    }
  });
  it("rechaza vencimiento, firma alterada y ausencia de credencial", async () => {
    const x = await caso({}, "-1m");
    await expect(autenticar(`Bearer ${x.token}`, config, x.jwks, usuario)).rejects.toThrow();
    const valido = await caso();
    const partes = valido.token.split(".");
    partes[1] = Buffer.from('{"sub":"intruso"}').toString("base64url");
    await expect(autenticar(`Bearer ${partes.join(".")}`, config, valido.jwks, usuario)).rejects.toThrow();
    await expect(autenticar(undefined, config, valido.jwks, usuario)).rejects.toThrow();
  });
  it("lee el rol actual en cada petición sin conservar el administrador previo", async () => {
    const x = await caso();
    const leerUser = (role: string) => async () => new Response(JSON.stringify({ id: "user-1", email: "operador@heymarksman.com", app_metadata: { roles: [role] }, user_metadata: { roles: ["admin"] } }));
    expect((await autenticar(`Bearer ${x.token}`, config, x.jwks, leerUser("admin"))).rol).toBe("admin");
    expect((await autenticar(`Bearer ${x.token}`, config, x.jwks, leerUser("viewer"))).rol).toBe("viewer");
  });
});
