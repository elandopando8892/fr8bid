// Números de WhatsApp: reglas por lada y la IA solo para los dudosos (pedido
// de Jose del 24-oct-2026; Rateware tomaba los 956 de Texas como México).

import { describe, expect, it } from "vitest";
import { aceptarRespuestaIA, clasificarTelefono, pistaPais } from "../src/dominio/telefonos";
import { revisarTelefonos, type Preguntar } from "../src/servidor/telefonos";

describe("reglas por lada", () => {
  it("los 956, 210 y 713 de Texas son de EE. UU., no de México", () => {
    expect(clasificarTelefono("9565238773")).toMatchObject({ numero: "19565238773", pais: "US", certeza: "regla" });
    expect(clasificarTelefono("(210) 464-8536")).toMatchObject({ numero: "12104648536", pais: "US" });
  });

  it("Monterrey, Nuevo Laredo y Saltillo son de México", () => {
    expect(clasificarTelefono("8110980030")).toMatchObject({ numero: "528110980030", pais: "MX", certeza: "regla" });
    expect(clasificarTelefono("8677191019")).toMatchObject({ numero: "528677191019", pais: "MX" });
    expect(clasificarTelefono("844 123 4567")).toMatchObject({ pais: "MX" });
  });

  it("respeta el código de país escrito", () => {
    expect(clasificarTelefono("+19567250084")).toMatchObject({ numero: "19567250084", certeza: "regla" });
    expect(clasificarTelefono("+5218119974103")).toMatchObject({ numero: "5218119974103", pais: "MX" });
    expect(clasificarTelefono("+52 81 1997 4103")).toMatchObject({ numero: "528119974103" });
  });

  it("marca por confirmar las ladas de los dos países y usa el nombre como mejor apuesta", () => {
    expect(clasificarTelefono("8125842714")).toMatchObject({ certeza: "dudoso", pais: "MX" });
    expect(clasificarTelefono("8125842714", { carrier: "ACG CARRIERS LLC" })).toMatchObject({ certeza: "dudoso", pais: "US", numero: "18125842714" });
    expect(clasificarTelefono("3141234567", { carrier: "Transportes X S.A. de C.V." })).toMatchObject({ certeza: "dudoso", pais: "MX" });
    expect(pistaPais({ carrier: "Logística", dominio: "logistica.com.mx" })).toBe("MX");
  });

  it("no da liga a números gratuitos ni a números cortos", () => {
    expect(clasificarTelefono("8885551234")).toMatchObject({ numero: null });
    expect(clasificarTelefono("12345")).toMatchObject({ numero: null, certeza: "dudoso" });
    expect(clasificarTelefono(null)).toMatchObject({ numero: null, motivo: "sin número" });
  });
});

describe("revisión con IA", () => {
  const lista = [
    { id: "a", valor: "9565238773", carrier: "ABC EXPRESS INC", dominio: null },
    { id: "b", valor: "8125842714", carrier: "ACG CARRIERS LLC", dominio: null },
    { id: "c", valor: "3141234567", carrier: "Fletes Colima", dominio: null }
  ];

  it("solo manda a la IA los dudosos y no acepta dígitos cambiados", async () => {
    let enviados: string[] = [];
    const preguntar: Preguntar = async (dudosos) => {
      enviados = dudosos.map((x) => x.id);
      return [
        { id: "b", pais: "MX", numero: "528125842714", motivo: "81 es Monterrey" },
        { id: "c", pais: "MX", numero: "523149999999", motivo: "inventado" }
      ];
    };
    const r = await revisarTelefonos({ telefonos: lista }, true, preguntar);
    expect(r.status).toBe(200);
    expect(enviados).toEqual(["b", "c"]);
    expect(r.body.telefonos.a).toMatchObject({ certeza: "regla", numero: "19565238773" });
    expect(r.body.telefonos.b).toMatchObject({ certeza: "ia", numero: "528125842714" });
    expect(r.body.telefonos.c).toMatchObject({ certeza: "dudoso", numero: null });
    expect(r.body).toMatchObject({ ia: "ok", revisados_por_ia: 2 });
  });

  it("sin sesión no responde, y sin clave o si la IA falla quedan las reglas", async () => {
    expect((await revisarTelefonos({ telefonos: lista }, false, null)).status).toBe(401);
    expect((await revisarTelefonos({ telefonos: [] }, true, null)).status).toBe(400);
    const sinClave = await revisarTelefonos({ telefonos: lista }, true, null);
    expect(sinClave.body.ia).toBe("no_configurada");
    expect(sinClave.body.telefonos.b).toMatchObject({ certeza: "dudoso", pais: "US" });
    const falla = await revisarTelefonos({ telefonos: lista }, true, async () => {
      throw new Error("x");
    });
    expect(falla.body.ia).toBe("fallo");
  });

  it("«ninguno» de la IA queda por confirmar", () => {
    expect(aceptarRespuestaIA("8125842714", { pais: "ninguno", numero: "", motivo: "no se sabe" })).toMatchObject({ numero: null, certeza: "dudoso" });
  });
});
