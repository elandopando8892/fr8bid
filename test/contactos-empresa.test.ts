import { describe, it, expect, vi } from "vitest";
import { reenviarContactos } from "../src/servidor/contactosEmpresa";
import { contactosHttp } from "../src/cliente/contactosEmpresa";
import apolloLegacy from "../api/apollo";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const vendor = "10000000-0000-4000-8000-000000000001";
describe("transporte de contactos por empresa", () => {
  it("la ruta antigua no puede revelar sin registro durable", async () => {
    const http=vi.fn();vi.stubGlobal("fetch",http);
    const res={status:vi.fn().mockReturnThis(),json:vi.fn()};
    try { await apolloLegacy({method:"POST",body:{accion:"revelar",personaId:"a".repeat(24)},headers:{}} as VercelRequest,res as unknown as VercelResponse);
      expect(res.status).toHaveBeenCalledWith(409);expect(http).not.toHaveBeenCalled();
    } finally {vi.unstubAllGlobals();}
  });
  it("conserva la sesión y bloquea acciones internas, identidad inyectada y escrituras apagadas", async () => {
    const enviar=vi.fn(async()=>({status:200,body:{operation:null}}));
    for(const body of [{action:"finish",vendor_id:vendor},{action:"context",vendor_id:vendor,owner:"other"}]) {
      expect((await reenviarContactos(body,"Bearer usuario",true,enviar)).status).toBe(400);
    }
    expect((await reenviarContactos({action:"context",vendor_id:vendor},null,true,enviar)).status).toBe(401);
    expect((await reenviarContactos({action:"resolve_known",vendor_id:vendor},"Bearer usuario",false,enviar)).status).toBe(403);
    expect(enviar).not.toHaveBeenCalled();
    expect((await reenviarContactos({action:"context",vendor_id:vendor},"Bearer usuario",false,enviar)).status).toBe(200);
    expect(enviar).toHaveBeenCalledWith({action:"context",vendor_id:vendor},"Bearer usuario");
  });
  it("no reintenta una confirmación sin respuesta ni filtra errores del proveedor", async () => {
    const enviar=vi.fn(async()=>{throw Error("secret synthetic upstream body");});
    const r=await reenviarContactos({action:"confirm_reveal",operation_id:vendor,confirmation_hash:"a".repeat(64)},"Bearer usuario",true,enviar);
    expect(r.status).toBe(504);expect(JSON.stringify(r.body)).not.toContain("secret");expect(enviar).toHaveBeenCalledTimes(1);
  });
  it("las capacidades también respetan el candado del gateway", async () => {
    const enviar=vi.fn(async()=>({status:200,body:{capabilities:{can_write:true,can_spend:true,can_search:true,max_credits:2}}}));
    const r=await reenviarContactos({action:"context",vendor_id:vendor},"Bearer usuario",false,enviar);
    expect((r.body as {capabilities:unknown}).capabilities).toEqual({can_write:false,can_spend:false,can_search:false,max_credits:2});
    expect((await reenviarContactos({action:"search",vendor_id:vendor},"Bearer usuario",false,enviar)).status).toBe(403);
  });
  it("el cliente obtiene token fresco por acción y nunca repite una confirmación", async () => {
    let token="one";const http=vi.fn(async(_url: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({operation:null}),{status:200}));
    const client=contactosHttp(async()=>token,http as typeof fetch);
    await client({action:"context",vendor_id:vendor});token="two";
    await client({action:"operation",vendor_id:vendor});
    expect(http).toHaveBeenCalledTimes(2);
    expect(new Headers(http.mock.calls[1][1]?.headers).get("authorization")).toBe("Bearer two");
    http.mockImplementation(async()=>{throw Error("offline");});
    await expect(client({action:"confirm_reveal",operation_id:vendor,confirmation_hash:"a".repeat(64)})).rejects.toThrow(/consultar|recuperar/i);
    expect(http).toHaveBeenCalledTimes(3);
  });
});
