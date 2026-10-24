// Apollo para carriers sin contacto (pedido de Jose del 24-oct-2026): buscar
// gratis por dominio y revelar un correo solo con confirmación y rol admin.

import { describe, expect, it } from "vitest";
import { clasificarPuesto, leerPersonas } from "../src/dominio/apollo";
import { consultarApollo, type LlamarApollo } from "../src/servidor/apollo";

const admin = { valida: true, admin: true };

describe("puestos", () => {
  it("primero quien decide la tarifa, luego quien cotiza o despacha", () => {
    expect(clasificarPuesto("President")).toMatchObject({ prioridad: 1 });
    expect(clasificarPuesto("COO & Managing Director Simplified Logistics México")).toMatchObject({ prioridad: 1 });
    expect(clasificarPuesto("Director Comercial")).toMatchObject({ prioridad: 1, rol: "dirección comercial" });
    expect(clasificarPuesto("Pricing Analyst")).toMatchObject({ prioridad: 1, rol: "pricing" });
    expect(clasificarPuesto("Dispatch")).toMatchObject({ prioridad: 2, rol: "tráfico y dispatch" });
    expect(clasificarPuesto("Sales Representative")).toMatchObject({ prioridad: 2, rol: "ventas" });
    expect(clasificarPuesto("Driver")).toMatchObject({ prioridad: 3 });
  });

  it("ordena por prioridad y luego por si tiene correo", () => {
    const personas = leerPersonas({
      people: [
        { id: "a", first_name: "Julio", title: "Driver", has_email: true },
        { id: "b", first_name: "Flores", title: "Dispatch", has_email: false },
        { id: "c", first_name: "Ivan", last_name_obfuscated: "Sa***l", title: "Sales Representative", has_email: true, has_direct_phone: "Yes" },
        { id: "d", first_name: "Gerardo", title: "President", has_email: true }
      ]
    });
    expect(personas.map((p) => p.id)).toEqual(["d", "c", "b", "a"]);
    expect(personas[1]).toMatchObject({ nombre: "Ivan Sa***l", tieneTelefono: true });
  });
});

describe("POST /api/apollo", () => {
  const llamadas: string[] = [];
  const llamar: LlamarApollo = async (ruta, body) => {
    llamadas.push(ruta);
    if (ruta === "mixed_people/api_search") return { status: 200, body: { total_entries: 1, people: [{ id: "5570967773696425d2897000", first_name: "Gerardo", title: "President", has_email: true }] } };
    return { status: 200, body: { person: { id: body.id, first_name: "Gerardo", last_name: "Ch", title: "President", email: "gerardo@super-loadtransport.com", email_status: "verified" } } };
  };

  it("busca gratis por dominio", async () => {
    const r = await consultarApollo({ accion: "buscar", dominio: "Super-LoadTransport.com" }, { valida: true, admin: false }, llamar);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dominio: "super-loadtransport.com", total: 1, creditos: 0 });
    expect(r.body.personas[0]).toMatchObject({ prioridad: 1 });
  });

  it("revelar exige Administrador y confirmación, y no pide teléfonos", async () => {
    const id = "5570967773696425d2897000";
    expect((await consultarApollo({ accion: "revelar", persona_id: id, confirmar: true }, { valida: true, admin: false }, llamar)).body.code).toBe("SOLO_ADMIN");
    expect((await consultarApollo({ accion: "revelar", persona_id: id }, admin, llamar)).body.code).toBe("SIN_CONFIRMAR");
    llamadas.length = 0;
    const r = await consultarApollo({ accion: "revelar", persona_id: id, confirmar: true }, admin, llamar);
    expect(r.body).toMatchObject({ correo: "gerardo@super-loadtransport.com", creditos: 1 });
    expect(llamadas).toEqual(["people/match"]);
  });

  it("sin sesión, sin clave o con datos raros no llama a Apollo", async () => {
    llamadas.length = 0;
    expect((await consultarApollo({ accion: "buscar", dominio: "x.com" }, { valida: false, admin: true }, llamar)).status).toBe(401);
    expect((await consultarApollo({ accion: "buscar", dominio: "x.com" }, admin, null)).body.code).toBe("APOLLO_NO_CONFIGURADO");
    expect((await consultarApollo({ accion: "buscar", dominio: "x.com/../y" }, admin, llamar)).body.code).toBe("DOMINIO_INVALIDO");
    expect((await consultarApollo({ accion: "revelar", persona_id: "abc", confirmar: true }, admin, llamar)).body.code).toBe("PERSONA_INVALIDA");
    expect(llamadas).toEqual([]);
  });

  it("traduce los errores de Apollo", async () => {
    const r = await consultarApollo({ accion: "buscar", dominio: "x.com" }, admin, async () => ({ status: 401, body: null }));
    expect(r.body.code).toBe("APOLLO_CLAVE");
  });
});
