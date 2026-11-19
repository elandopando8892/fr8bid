import { describe, expect, it } from "vitest";
import { manejar, type Respuesta } from "../src/servidor/proxy";
import { crearListas, AMPLIADA, ACTOS_LISTAS, actoDe, type ContextoListasMcp } from "../src/mcp/listas";
import type { Transporte } from "../src/cliente/api";
import type { Rol } from "../src/dominio/tipos";

// Doble local de rateware-api para listas (vendor_segments participant_template): organización
// del principal, permiso vendors:manage, bandera de liberación y UPDATE condicional a
// template_version. Pasa por el proxy real de Fr8Bid (lista cerrada y FR8BID_ESCRITURAS_REALES).
const SECRETO = new TextEncoder().encode("secreto-sintetico-de-pruebas-0123456789");
const DUEÑO = "sales@heymarksman.com";
const ALFA = "11111111-1111-4111-8111-111111111111", BETA = "22222222-2222-4222-8222-222222222222", AJENO = "33333333-3333-4333-8333-333333333333";
const L1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", L1A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", L2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", L3 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function escenario() {
  let t = Date.parse("2026-11-17T18:00:00Z");
  const usuarios: Record<string, { org: string; manage: boolean }> = { "tok-dueño": { org: "org-1", manage: true }, "tok-sin-permiso": { org: "org-1", manage: false }, "tok-org2": { org: "org-2", manage: true } };
  const vendors = [{ id: ALFA, org: "org-1", vendor_name: "Transportes Alfa" }, { id: BETA, org: "org-1", vendor_name: "Beta Logistics" }, { id: AJENO, org: "org-2", vendor_name: "Ajeno SA" }];
  const listas = [
    { id: L1, org: "org-1", segment_name: "D2D Crossborder - Dry Van", lifecycle_status: "active", template_version: 3, vendor_ids: [BETA] },
    { id: L1A, org: "org-1", segment_name: `D2D Crossborder - Dry Van${AMPLIADA}`, lifecycle_status: "active", template_version: 1, vendor_ids: [BETA] },
    { id: L2, org: "org-1", segment_name: "MX Port Drayage - Flatbed", lifecycle_status: "archived", template_version: 2, vendor_ids: [BETA] },
    { id: L3, org: "org-2", segment_name: "Lista ajena", lifecycle_status: "active", template_version: 1, vendor_ids: [AJENO] }
  ];
  const estado = { habilitado: true, escrituras: [] as any[], llamadas: [] as string[], antesDeEscribir: null as null | (() => void), perderRespuesta: false };
  const r = (status: number, body: any): Respuesta => ({ status, body, headers: {} });
  async function rateware(body: Record<string, any>, auth: string | null): Promise<Respuesta> {
    const u = usuarios[String(auth).replace(/^Bearer /, "")];
    if (!u) return r(401, { error: "sesión" });
    estado.llamadas.push(body.action);
    if (body.action === "list_vendors") return r(200, { rows: vendors.filter(v => v.org === u.org && body.ids.includes(v.id)) });
    if (!estado.habilitado) return r(404, { enabled: false });
    const propias = listas.filter(l => l.org === u.org);
    if (body.action === "list_carrier_list_templates") {
      const filas = propias.slice(body.offset, body.offset + body.limit);
      return r(200, { enabled: true, rows: filas.map(l => ({ ...l, vendor_ids: [...l.vendor_ids] })), total: propias.length, has_more: body.offset + filas.length < propias.length });
    }
    const l = propias.find(x => x.id === body.template_id);
    if (body.action === "get_carrier_list_template") return l ? r(200, { enabled: true, row: { ...l, vendor_ids: [...l.vendor_ids] } }) : r(404, { enabled: true, error: "not found" });
    if (body.action === "update_carrier_list_template") {
      if (!u.manage) return r(403, { enabled: true, error: "Missing required permission: vendors:manage" });
      if (!l) return r(404, { enabled: true });
      estado.antesDeEscribir?.();
      if (l.template_version !== body.expected_version) return r(409, { enabled: true, code: "template_version_conflict", current_version: l.template_version });
      const nuevos = body.patch.vendor_ids.filter((id: string) => !l.vendor_ids.includes(id));
      if (nuevos.some((id: string) => !vendors.some(v => v.id === id && v.org === u.org))) return r(400, { enabled: true, error: "unavailable" });
      l.vendor_ids = [...new Set(body.patch.vendor_ids as string[])]; l.template_version += 1;
      estado.escrituras.push({ lista: l.id, agregados: nuevos });
      if (estado.perderRespuesta) throw new Error("respuesta perdida");
      return r(200, { enabled: true, row: { ...l } });
    }
    return r(400, { error: "Unknown action" });
  }
  const transporte = (token: string, permitirEscrituras = true): Transporte => async (servicio, body) => {
    try { return await manejar(servicio, body, `Bearer ${token}`, { enviar: (_s, b, a) => rateware(b, a), permitirEscrituras }); }
    catch { return { status: 504, body: { code: "SIN_RESPUESTA", incierta: body.action === "update_carrier_list_template" }, headers: {} }; }
  };
  const mcp = (token: string, o: Partial<ContextoListasMcp> & { rol?: Rol; permitir?: boolean } = {}) => crearListas(transporte(token, o.permitir ?? true), {
    userId: "u-sesion", clientId: "cliente-claude", rol: "operator", secreto: SECRETO, email: DUEÑO, ahora: () => new Date(t), registrar: () => {}, ...o });
  return { estado, listas, mcp, avanzar: (ms: number) => { t += ms; } };
}

describe("MCP de listas de carriers (vendor_segments de Rateware)", () => {
  it("lee listas y membresía; distingue principal y «· Ampliada»; nunca ve listas de otra organización", async () => {
    const e = escenario();
    const r = await e.mcp("tok-dueño")("listas_carrier", { carrier_id: BETA });
    expect(r.listas_del_carrier.map((x: any) => [x.nombre, x.tipo])).toEqual([["D2D Crossborder - Dry Van", "principal"], [`D2D Crossborder - Dry Van${AMPLIADA}`, "ampliada"], ["MX Port Drayage - Flatbed", "principal"]]);
    expect(r.listas.map((x: any) => x.lista_id)).not.toContain(L3);
    expect(r.completas).toBe(true);
    expect(e.estado.escrituras).toHaveLength(0);
  });

  it("preparar no escribe: vista previa con carrier, lista exacta, tipo, evidencia y efecto", async () => {
    const e = escenario();
    const p = await e.mcp("tok-dueño")("preparar_alta_lista", { carrier_id: ALFA, lista_id: L1, evidencia: "Oferta real 1 800 USD en RFx-1021 Monterrey → Dallas" });
    expect(p.estado).toBe("vista_previa");
    expect(p.vista_previa.lista).toMatchObject({ nombre: "D2D Crossborder - Dry Van", tipo: "principal", version: 3 });
    expect(p.vista_previa.no_hace).toMatch(/Ampliada/);
    expect(e.estado.llamadas).not.toContain("update_carrier_list_template");
    expect(actoDe(p.confirmacion_id)).toBe("lista_alta");
    expect(ACTOS_LISTAS.has("lista_alta")).toBe(true);
  });

  it("si ya pertenece lo informa sin firmar nada", async () => {
    const e = escenario();
    const p = await e.mcp("tok-dueño")("preparar_alta_lista", { carrier_id: BETA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" });
    expect(p).toMatchObject({ estado: "ya_pertenece", escrito: false });
    expect(p.confirmacion_id).toBeUndefined();
  });

  it("confirmar con «sí» del propietario agrega una vez; repetir no duplica", async () => {
    const e = escenario();
    const m = e.mcp("tok-dueño");
    const p = await m("preparar_alta_lista", { carrier_id: ALFA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" });
    const r = await m("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "sí" });
    expect(r.estado).toBe("aplicada");
    expect(e.listas[0].vendor_ids).toEqual([BETA, ALFA]);
    const r2 = await m("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "sí" });
    expect(r2.estado).toBe("sin_efecto");
    expect(e.estado.escrituras).toHaveLength(1);
  });

  it("concurrencia: si otra persona cambia la lista justo antes de escribir, Rateware responde 409 y no se pisa", async () => {
    const e = escenario();
    const m = e.mcp("tok-dueño");
    const p = await m("preparar_alta_lista", { carrier_id: ALFA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" });
    e.estado.antesDeEscribir = () => { e.listas[0].vendor_ids.push("99999999-9999-4999-8999-999999999999"); e.listas[0].template_version += 1; e.estado.antesDeEscribir = null; };
    await expect(m("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "LISTA_CAMBIO" });
    expect(e.listas[0].vendor_ids).not.toContain(ALFA);
    expect(e.estado.llamadas.filter(x => x === "update_carrier_list_template")).toHaveLength(1);
  });

  it("dos confirmar simultáneos de altas distintas en la misma lista: solo uno gana, el otro no pisa", async () => {
    const e = escenario();
    e.listas[0].vendor_ids = [];
    const m = e.mcp("tok-dueño");
    const pa = await m("preparar_alta_lista", { carrier_id: ALFA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" });
    const pb = await m("preparar_alta_lista", { carrier_id: BETA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" });
    const rs = await Promise.allSettled([m("confirmar", { confirmacion_id: pa.confirmacion_id, frase_ok: "sí" }), m("confirmar", { confirmacion_id: pb.confirmacion_id, frase_ok: "sí" })]);
    expect(rs.filter(x => x.status === "fulfilled" && (x.value as any).estado === "aplicada")).toHaveLength(1);
    expect(e.listas[0].vendor_ids).toHaveLength(1);
  });

  it("sin «sí», con duda, de otra persona, otra sesión o rol de consulta no escribe", async () => {
    const e = escenario();
    const p = await e.mcp("tok-dueño")("preparar_alta_lista", { carrier_id: ALFA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" });
    await expect(e.mcp("tok-dueño")("confirmar", { confirmacion_id: p.confirmacion_id })).rejects.toMatchObject({ codigo: "SIN_SI" });
    await expect(e.mcp("tok-dueño")("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "no sé, luego" })).rejects.toMatchObject({ codigo: "NO_CONFIRMADO" });
    await expect(e.mcp("tok-dueño", { email: "otro@heymarksman.com" })("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "SOLO_PROPIETARIO" });
    await expect(e.mcp("tok-dueño", { userId: "otro" })("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "OTRA_SESION" });
    await expect(e.mcp("tok-dueño", { rol: "viewer" })("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
    await expect(e.mcp("tok-dueño", { rol: "viewer" })("preparar_alta_lista", { carrier_id: ALFA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" })).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
    expect(e.estado.escrituras).toHaveLength(0);
  });

  it("vencimiento, permiso de Rateware, escrituras cerradas, lista archivada y otra organización", async () => {
    const e = escenario();
    const p = await e.mcp("tok-dueño")("preparar_alta_lista", { carrier_id: ALFA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" });
    e.avanzar(16 * 60_000);
    await expect(e.mcp("tok-dueño")("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "CONFIRMACION_INVALIDA" });
    const q = await e.mcp("tok-sin-permiso")("preparar_alta_lista", { carrier_id: ALFA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" });
    await expect(e.mcp("tok-sin-permiso")("confirmar", { confirmacion_id: q.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "SIN_PERMISO_RATEWARE" });
    const w = await e.mcp("tok-dueño", { permitir: false })("preparar_alta_lista", { carrier_id: ALFA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" });
    await expect(e.mcp("tok-dueño", { permitir: false })("confirmar", { confirmacion_id: w.confirmacion_id, frase_ok: "sí" })).rejects.toMatchObject({ codigo: "ESCRITURA_NO_AUTORIZADA" });
    await expect(e.mcp("tok-dueño")("preparar_alta_lista", { carrier_id: ALFA, lista_id: L2, evidencia: "Oferta real en RFx de prueba" })).rejects.toMatchObject({ codigo: "LISTA_ARCHIVADA" });
    await expect(e.mcp("tok-dueño")("preparar_alta_lista", { carrier_id: ALFA, lista_id: L3, evidencia: "Oferta real en RFx de prueba" })).rejects.toMatchObject({ codigo: "LISTA_NO_EXISTE" });
    await expect(e.mcp("tok-dueño")("preparar_alta_lista", { carrier_id: AJENO, lista_id: L1, evidencia: "Oferta real en RFx de prueba" })).rejects.toMatchObject({ codigo: "CARRIER_NO_EXISTE" });
    expect(e.estado.escrituras).toHaveLength(0);
  });

  it("resultado incierto no se reintenta; bandera de listas apagada se informa", async () => {
    const e = escenario();
    const m = e.mcp("tok-dueño");
    const p = await m("preparar_alta_lista", { carrier_id: ALFA, lista_id: L1, evidencia: "Oferta real en RFx de prueba" });
    e.estado.perderRespuesta = true;
    const r = await m("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "sí" });
    expect(r.estado).toBe("incierta");
    expect(e.estado.llamadas.filter(x => x === "update_carrier_list_template")).toHaveLength(1);
    e.estado.habilitado = false;
    await expect(m("listas_carrier", {})).rejects.toMatchObject({ codigo: "LISTAS_DESACTIVADAS" });
  });

  it("el proxy solo deja cambiar la membresía con expected_version", async () => {
    const enviar = async () => ({ status: 200, body: {}, headers: {} });
    for (const body of [
      { action: "update_carrier_list_template", template_id: L1, expected_version: 3, patch: { segment_name: "otro" } },
      { action: "update_carrier_list_template", template_id: L1, patch: { vendor_ids: [ALFA] } },
      { action: "update_carrier_list_template", template_id: L1, expected_version: 3, patch: { vendor_ids: [ALFA], lifecycle_status: "archived" } }
    ]) expect((await manejar("rateware-api", body, "Bearer x", { enviar, permitirEscrituras: true })).body.code).toBe("SOLO_MIEMBROS");
  });
});
