import { describe, expect, it } from "vitest";
import { crearContactosSimulados, type EmpresaSim } from "../src/simulado/contactos";
import { reenviarContactos } from "../src/servidor/contactosEmpresa";
import { ACTOS_CONTACTOS, actoDe, crearContactos, transporteContactos, type ContextoContactosMcp } from "../src/mcp/contactos";
import type { Rol } from "../src/dominio/tipos";

const SECRETO = new TextEncoder().encode("secreto-sintetico-de-pruebas-0123456789");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333", OTRA = "44444444-4444-4444-8444-444444444444";
const DUEÑO = "sales@heymarksman.com";

function escenario(o: { empresas?: EmpresaSim[] } = {}) {
  let t = Date.parse("2026-11-17T18:00:00Z");
  const empresas: EmpresaSim[] = o.empresas ?? [
    { id: A, organizacion: "org-1", nombre: "Transportes Alfa", dominio: "alfa.mx", correo: null, correoVigente: false, conocidos: ["ventas@alfa.mx", "rebote@alfa.mx", "x@gmail.com"], rebotados: ["rebote@alfa.mx"] },
    { id: B, organizacion: "org-1", nombre: "Beta Logistics", dominio: "beta.com", correo: "ops@beta.com", correoVigente: true, conocidos: [] },
    { id: OTRA, organizacion: "org-2", nombre: "Ajena SA", dominio: "ajena.mx", correo: null, correoVigente: false, conocidos: [] }
  ];
  const sim = crearContactosSimulados({
    ahora: () => t,
    usuarios: { "token-admin": { actor: "u-admin", organizacion: "org-1", rol: "admin" }, "token-oper": { actor: "u-oper", organizacion: "org-1", rol: "operator" }, "token-org2": { actor: "u-2", organizacion: "org-2", rol: "admin" } },
    empresas,
    apollo: { "alfa.mx": [
      { id: "a".repeat(24), name: "Ana Contadora", title: "Accountant", has_email: true, email: "ana@alfa.mx", email_status: "verified" },
      { id: "b".repeat(24), name: "Beto Dispatch", title: "Dispatch Manager", has_email: true, email: "beto@alfa.mx", email_status: "verified" },
      { id: "c".repeat(24), name: "Carla Dueña", title: "Owner", has_email: true, email: "carla@alfa.mx", email_status: "verified" },
      { id: "d".repeat(24), name: "Dani Ventas", title: "Sales Executive", has_email: false }
    ] }
  });
  const fetchSim = (async (_url: URL, init: RequestInit) => {
    const auth = (init.headers as Record<string, string>).authorization;
    const r = await reenviarContactos(JSON.parse(String(init.body)), auth, true, (b, a) => sim.llamar(b, a));
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  const mcp = (token: string, o: Partial<ContextoContactosMcp> & { rol?: Rol } = {}) => crearContactos(transporteContactos("https://fr8bid.test/api/mcp", token, fetchSim), {
    userId: "u-sesion", clientId: "cliente-claude", rol: "admin", secreto: SECRETO, email: DUEÑO, ahora: () => new Date(t), registrar: () => {}, ...o });
  return { sim, mcp, avanzar: (ms: number) => { t += ms; }, empresas };
}

async function prepararBeto(e: ReturnType<typeof escenario>, ejecutar = e.mcp("token-admin")) {
  const b = await ejecutar("buscar_contacto", { carrier_id: A, buscar_en_apollo: true });
  const beto = b.apollo.candidatos.find((x: any) => x.nombre === "Beto Dispatch");
  return { ejecutar, prep: await ejecutar("preparar_revelar_contacto", { carrier_id: A, candidato_ref: beto.candidato_ref }) };
}

describe("MCP de contactos sobre carrier-contacts-api (#46/#203)", () => {
  it("buscar sin Apollo solo lee: conocidos del mismo dominio, sin rebotados ni públicos, sin créditos", async () => {
    const e = escenario();
    const r = await e.mcp("token-oper", { rol: "operator" })("buscar_contacto", { carrier_id: A });
    expect(r.conocidos.correos.map((x: any) => x.correo)).toEqual(["ventas@alfa.mx"]);
    expect(e.sim.estado.llamadas).toEqual(["context"]);
    expect(e.sim.estado.creditos).toBe(0);
  });

  it("buscar en Apollo es gratis, prioriza puestos objetivo y solo da candidato_ref a quien tiene correo", async () => {
    const e = escenario();
    const r = await e.mcp("token-oper", { rol: "operator" })("buscar_contacto", { carrier_id: A, buscar_en_apollo: true });
    expect(r.apollo.candidatos.map((x: any) => x.nombre)).toEqual(["Carla Dueña", "Beto Dispatch", "Dani Ventas", "Ana Contadora"]);
    expect(r.apollo.candidatos.find((x: any) => x.nombre === "Ana Contadora").puesto_objetivo).toBe(false);
    expect(r.apollo.candidatos.find((x: any) => x.nombre === "Dani Ventas").candidato_ref).toBeNull();
    expect(e.sim.estado.creditos).toBe(0);
    expect(e.sim.estado.ops).toHaveLength(0);
  });

  it("preparar no escribe ni consume: solo lee el contexto y firma persona, costo y vencimiento", async () => {
    const e = escenario();
    const { prep } = await prepararBeto(e);
    expect(prep.estado).toBe("vista_previa");
    expect(prep.vista_previa.costo.creditos_max).toBe(1);
    expect(prep.vista_previa.persona.nombre).toBe("Beto Dispatch");
    expect(e.sim.estado.llamadas).toEqual(["context", "search", "context"]);
    expect(e.sim.estado.ops).toHaveLength(0);
    expect(e.sim.estado.creditos).toBe(0);
    expect(actoDe(prep.confirmacion_id)).toBe("contacto_revelar");
    expect(ACTOS_CONTACTOS.has("contacto_revelar")).toBe(true);
  });

  it("confirmar con «sí» del propietario revela una vez, guarda el contacto y una repetición no vuelve a cobrar", async () => {
    const e = escenario();
    const { ejecutar, prep } = await prepararBeto(e);
    const r = await ejecutar("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí" });
    expect(r.estado).toBe("aplicada");
    expect(r.operacion.correo).toBe("beto@alfa.mx");
    expect(e.empresas[0].correo).toBe("beto@alfa.mx");
    expect(e.sim.estado.creditos).toBe(1);
    await expect(ejecutar("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "YA_APLICADO_O_CAMBIO" });
    expect(e.sim.estado.creditos).toBe(1);
  });

  it("dos confirmar simultáneos de la misma persona consumen un solo crédito", async () => {
    const e = escenario();
    const { ejecutar, prep } = await prepararBeto(e);
    const { prep: prep2 } = await prepararBeto(e, ejecutar);
    const rs = await Promise.allSettled([
      ejecutar("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "confirmo" }),
      ejecutar("confirmar", { confirmacion_id: prep2.confirmacion_id, frase_ok: "confirmo" })
    ]);
    expect(rs.filter(x => x.status === "fulfilled" && (x.value as any).estado === "aplicada")).toHaveLength(1);
    expect(e.sim.estado.creditos).toBe(1);
  });

  it("sin aprobación explícita, con duda o de otra persona no escribe", async () => {
    const e = escenario();
    const { ejecutar, prep } = await prepararBeto(e);
    await expect(ejecutar("confirmar", { confirmacion_id: prep.confirmacion_id })).rejects.toMatchObject({ codigo: "SIN_SI" });
    await expect(ejecutar("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí, pero espera" })).rejects.toMatchObject({ codigo: "NO_CONFIRMADO" });
    await expect(e.mcp("token-admin", { email: "otra@heymarksman.com" })("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "SOLO_PROPIETARIO" });
    await expect(e.mcp("token-admin", { userId: "otro" })("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "OTRA_SESION" });
    await expect(e.mcp("token-admin", { clientId: "otro-cliente" })("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "OTRA_SESION" });
    await expect(e.mcp("token-admin", { rol: "operator" })("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
    expect(e.sim.estado.creditos).toBe(0);
    expect(e.sim.estado.ops).toHaveLength(0);
  });

  it("el Operador no prepara revelados; la vista previa vence a los 15 min", async () => {
    const e = escenario();
    await expect(prepararBeto(e, e.mcp("token-oper", { rol: "operator" }))).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
    const { ejecutar, prep } = await prepararBeto(e);
    e.avanzar(16 * 60_000);
    await expect(ejecutar("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "CONFIRMACION_INVALIDA" });
    expect(e.sim.estado.creditos).toBe(0);
  });

  it("si cambia el costo entre la vista previa y confirmar, no consume", async () => {
    const e = escenario();
    const { ejecutar, prep } = await prepararBeto(e);
    e.sim.estado.politica = { id: "apollo-email-2026-12", max_credits: 2 };
    await expect(ejecutar("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "COSTO_CAMBIADO" });
    expect(e.sim.estado.creditos).toBe(0);
  });

  it("un resultado incierto se informa como incierto y no se reintenta ni se puede volver a gastar", async () => {
    const e = escenario();
    e.sim.estado.falloMatch = "red";
    const { ejecutar, prep } = await prepararBeto(e);
    const r = await ejecutar("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí" });
    expect(r.estado).toBe("incierta");
    expect(e.sim.estado.llamadas.filter(x => x === "confirm_reveal")).toHaveLength(1);
    expect(e.sim.estado.creditos).toBe(1);
    e.sim.estado.falloMatch = null;
    await expect(prepararBeto(e, ejecutar)).rejects.toMatchObject({ codigo: "OPERACION_EN_CURSO" });
    expect(e.sim.estado.creditos).toBe(1);
  });

  it("otra organización no ve el carrier; un dominio compartido no se busca; una selección de otro carrier se rechaza", async () => {
    const e = escenario({ empresas: [
      { id: A, organizacion: "org-1", nombre: "Transportes Alfa", dominio: "alfa.mx", correo: null, correoVigente: false, conocidos: [] },
      { id: C, organizacion: "org-1", nombre: "Alfa Norte", dominio: "alfa.mx", correo: null, correoVigente: false, conocidos: [] },
      { id: B, organizacion: "org-1", nombre: "Beta", dominio: "beta.com", correo: null, correoVigente: false, conocidos: [] }
    ] });
    await expect(e.mcp("token-org2")("buscar_contacto", { carrier_id: A })).rejects.toMatchObject({ status: 403 });
    await expect(e.mcp("token-admin")("buscar_contacto", { carrier_id: A, buscar_en_apollo: true })).rejects.toMatchObject({ codigo: "IDENTIDAD" });
    const e2 = escenario();
    const b = await e2.mcp("token-admin")("buscar_contacto", { carrier_id: A, buscar_en_apollo: true });
    await expect(e2.mcp("token-admin")("preparar_revelar_contacto", { carrier_id: B, candidato_ref: b.apollo.candidatos[0].candidato_ref })).rejects.toMatchObject({ codigo: "CANDIDATO_AJENO" });
    expect(e.sim.estado.llamadas).not.toContain("search");
  });

  it("un carrier con contacto vigente no se revela de nuevo", async () => {
    const e = escenario();
    const b = await e.mcp("token-admin")("buscar_contacto", { carrier_id: A, buscar_en_apollo: true });
    e.empresas[0].correoVigente = true; e.empresas[0].correo = "ventas@alfa.mx";
    await expect(e.mcp("token-admin")("preparar_revelar_contacto", { carrier_id: A, candidato_ref: b.apollo.candidatos[0].candidato_ref })).rejects.toMatchObject({ codigo: "YA_TIENE_CONTACTO" });
  });

  it("CRM: elige un correo conocido (sustituye el rebotado) con «sí»; un rebotado o ajeno no se acepta", async () => {
    const e = escenario();
    const op = e.mcp("token-oper", { rol: "operator" });
    await expect(op("preparar_elegir_contacto", { carrier_id: A, correo: "rebote@alfa.mx" })).rejects.toMatchObject({ codigo: "NO_CONOCIDO" });
    await expect(op("preparar_elegir_contacto", { carrier_id: A, correo: "x@gmail.com" })).rejects.toMatchObject({ codigo: "NO_CONOCIDO" });
    const prep = await op("preparar_elegir_contacto", { carrier_id: A, correo: "ventas@alfa.mx" });
    expect(e.sim.estado.llamadas).not.toContain("choose_known");
    expect(prep.vista_previa.costo.creditos).toBe(0);
    const r = await op("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "adelante" });
    expect(r.estado).toBe("aplicada");
    expect(e.empresas[0].correo).toBe("ventas@alfa.mx");
    await expect(op("confirmar", { confirmacion_id: prep.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "YA_APLICADO_O_CAMBIO" });
  });

  it("con escrituras cerradas en Rateware, buscar en Apollo y revelar se rechazan sin gastar", async () => {
    const e = escenario();
    e.sim.estado.escrituras = false;
    await expect(e.mcp("token-admin")("buscar_contacto", { carrier_id: A, buscar_en_apollo: true })).rejects.toMatchObject({ codigo: "WRITES_DISABLED" });
    expect(e.sim.estado.creditos).toBe(0);
  });
});
