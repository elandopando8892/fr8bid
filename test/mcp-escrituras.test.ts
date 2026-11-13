import { describe, expect, it } from "vitest";
import { SignJWT, decodeJwt } from "jose";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { crearSimulado } from "../src/simulado/semilla";
import { transporteSimulado } from "../src/cliente/api";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";
import { hoyMexico } from "../src/dominio/recorrido";
import { ESCRITURAS } from "../src/servidor/proxy";
import { crearEscrituras, esAfirmacion, FUERA_DEL_MCP, respuestaValida, type ContextoEscrituras } from "../src/mcp/escrituras";
import { AUDIENCIA, EMISOR, secretoConfirmacion } from "../src/mcp/confirmacion";
import { ESCRITURAS_MCP, transporteEscritura } from "../src/mcp/transporte";
import { crearLecturas } from "../src/mcp/lecturas";
import { crearServidor } from "../src/mcp/servidor";
import type { Rol } from "../src/dominio/tipos";

const SECRETO = new TextEncoder().encode("secreto-sintetico-de-pruebas-0123456789");
const ENVIO = "2026-10-29T12:00:00Z";
const DESPUES = "2026-10-29T21:00:00Z"; // 9 h: toca el 2º intento

/** Evento RFx-FR8BID-PRUEBA-01: una ruta, A/B/C preseleccionados. Con invitar: enviados y A ofertó. */
async function escenario(o: { invitar?: boolean; revisados?: ("A" | "B" | "C")[] } = {}) {
  const invitar = o.invitar ?? true;
  const base = crearSimulado();
  let ahora = ENVIO;
  base.sim.hoy = () => hoyMexico(new Date(ahora));
  base.sim.ahora = () => ahora;
  const { sim, carriers } = base;
  const como = (clave: string) => (body: Record<string, unknown>) => sim.llamar("rateware-api", body, `Bearer sim:${clave}`).then(r => r.body);
  const op = como("operador");
  const { row: event } = await op({ action: "create_rfx_event", name: "PRUEBA CONTROLADA · Monterrey → Dallas", customer: "Shipper de Prueba", due_date: "2026-11-20", rfx_id: "RFx-FR8BID-PRUEBA-01" });
  const { rows: lanes } = await op({ action: "import_rfx_lanes", event_id: event.id, rows: [{ origin_city: "Monterrey", origin_state: "NL", origin_country: "MX", destination_city: "Dallas", destination_state: "TX", destination_country: "US", equipment: "Dry Van", weekly_volume: 4, target_rate: 1700, currency: "USD" }] });
  const { rows } = await op({ action: "shortlist_rfx_lane_vendors", lane_id: lanes[0].id, vendor_ids: [carriers.A.id, carriers.B.id, carriers.C.id] });
  await op({ action: "update_rfx_event", event_id: event.id, patch: { status: "open" } });
  for (const k of o.revisados ?? ["A", "B", "C"]) sim.revisar(event.id, carriers[k].id);
  const [a, b, c] = rows.map((r: any) => r.id as string);
  if (invitar) {
    const { rows: m } = await op({ action: "generate_outreach_drafts", event_id: event.id, reviewed_vendor_ids: Object.values(carriers).map(c => c.id) });
    await como("admin")({ action: "send_outreach_messages", ids: m.map((x: any) => x.id), expected_versions: m.map((x: any) => ({ id: x.id, updated_at: x.updated_at })), confirmed: true, confirmation_action: "send_outreach_messages" });
    await sim.llamar("rfx-bid-api", { action: "get_invitation", token: sim.tokenDe(a) }, null);
    await sim.llamar("rfx-bid-api", { action: "submit_bid", token: sim.tokenDe(a), bid_rate: 1800, currency: "USD", commercial_model: "fee_plus", weekly_capacity: 5, transit_days: 2 }, null);
  }
  ahora = DESPUES;
  return { sim, carriers, eventId: event.id as string, p: { A: a, B: b, C: c }, reloj: (iso: string) => { ahora = iso; }, ahora: () => ahora };
}
type Escenario = Awaited<ReturnType<typeof escenario>>;

type Alterar = (b: Record<string, any>, r: { status: number; body: any; headers: Record<string, string> }) => { status: number; body: any; headers: Record<string, string> };
function mcp(x: Escenario, usuario = "operador", rol: Rol = "operator", extra: Partial<ContextoEscrituras> = {}, alterar: Alterar = (_b, r) => r) {
  const llamadas: Record<string, any>[] = [];
  const logs: Record<string, unknown>[] = [];
  const t = transporteSimulado(x.sim, () => usuario);
  const ej = crearEscrituras(async (s, b) => { llamadas.push(b); return alterar(b, await t(s, b)); },
    { userId: usuario, clientId: "cliente-1", rol, secreto: SECRETO, ahora: () => new Date(x.ahora()), registrar: e => logs.push(e), ...extra });
  return { ej, llamadas, logs, escritas: () => llamadas.filter(b => ESCRITURAS_MCP.has(String(b.action))) };
}
const codigo = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e: any) { return e.codigo ?? e.name ?? "ERROR"; } };

describe("MCP de escrituras: vista previa y confirmación firmada", () => {
  it("preparar_intentos no escribe; confirmar deja borradores en la Cola y un segundo confirmar falla por la foto", async () => {
    const x = await escenario();
    const m = mcp(x);
    const v = await m.ej("preparar_intentos", { event_id: x.eventId });
    expect(m.escritas()).toEqual([]);
    expect(v.escrito).toBe(false);
    expect(v.vista_previa.canal).toMatch(/BORRADOR en la Cola/);
    const ps = v.vista_previa.destinatarios.map((d: any) => d.participacion_id).sort();
    expect(ps).toEqual([x.p.B, x.p.C].sort()); // A ya ofertó
    expect(v.vista_previa.destinatarios[0].texto).toMatch(/tarifa all-in/);
    const r = await m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí, hazlo" });
    expect(r.estado).toBe("aplicada");
    const drafts = m.escritas();
    expect(drafts.map(b => b.action)).toEqual(["draft_bid_room_carrier_message", "draft_bid_room_carrier_message"]);
    expect(drafts.every(b => String(b.idempotency_key).startsWith("fr8bid-intento-2-") && b.app_origin === "https://fr8bid.heymarksman.com")).toBe(true);
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" }))).toBe("YA_APLICADO_O_CAMBIO");
    expect(m.escritas()).toHaveLength(2);
    expect(m.logs.map(l => l.resultado)).toEqual(["aplicada", "rechazada:YA_APLICADO_O_CAMBIO"]);
    expect(JSON.stringify(m.logs)).not.toContain(v.confirmacion_id);
    expect(m.logs[0]).toMatchObject({ usuario: "operador", accion: "intentos", event_id: x.eventId, frase_ok: "sí, hazlo" });
  });

  it("la cadencia excluye a quien ya respondió y no marca respuesta sobre una oferta", async () => {
    const x = await escenario();
    const m = mcp(x);
    const v = await m.ej("preparar_ya_respondio", { event_id: x.eventId, carrier_id: x.carriers.B.id, respuesta: "respondio", canal: "whatsapp", nota: "Pide más volumen" });
    expect(v.vista_previa.participaciones[0].nota_que_se_guarda).toBe("WhatsApp: Pide más volumen");
    expect((await m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" })).estado).toBe("aplicada");
    const i = await m.ej("preparar_intentos", { event_id: x.eventId });
    expect(i.vista_previa.destinatarios.map((d: any) => d.participacion_id)).toEqual([x.p.C]);
    expect(await codigo(m.ej("preparar_ya_respondio", { event_id: x.eventId, participacion_ids: [x.p.A], respuesta: "respondio", canal: "email" }))).toBe("YA_OFERTO");
    expect(await codigo(m.ej("preparar_ya_respondio", { event_id: x.eventId, participacion_ids: [x.p.B], respuesta: "respondio", canal: "email" }))).toBe("YA_MARCADA");
  });

  it("token: firma, vencimiento, otro usuario o cliente y h alterado se rechazan sin escribir", async () => {
    const x = await escenario();
    const m = mcp(x);
    const v = await m.ej("preparar_intentos", { event_id: x.eventId });
    const id: string = v.confirmacion_id;
    const otraFirma = id.slice(0, -2) + (id.endsWith("AA") ? "BB" : "AA");
    expect(await codigo(m.ej("confirmar", { confirmacion_id: otraFirma, frase_ok: "sí" }))).toBe("CONFIRMACION_INVALIDA");
    expect(await codigo(mcp(x, "admin", "admin").ej("confirmar", { confirmacion_id: id, frase_ok: "sí" }))).toBe("OTRA_SESION");
    expect(await codigo(mcp(x, "operador", "operator", { clientId: "otro-cliente" }).ej("confirmar", { confirmacion_id: id, frase_ok: "sí" }))).toBe("OTRA_SESION");
    const claims = decodeJwt(id) as Record<string, any>;
    const alterado = await new SignJWT({ ...claims, cuerpos: claims.cuerpos.map((b: any) => ({ ...b, body: "Otro texto" })) })
      .setProtectedHeader({ alg: "HS256" }).sign(SECRETO);
    expect(await codigo(m.ej("confirmar", { confirmacion_id: alterado, frase_ok: "sí" }))).toBe("ALTERADA");
    const ajeno = await new SignJWT({ ...claims }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("otro-secreto-sintetico-0123456789abcdef"));
    expect(await codigo(m.ej("confirmar", { confirmacion_id: ajeno, frase_ok: "sí" }))).toBe("CONFIRMACION_INVALIDA");
    x.reloj("2026-10-29T21:16:00Z");
    expect(await codigo(m.ej("confirmar", { confirmacion_id: id, frase_ok: "sí" }))).toBe("CONFIRMACION_INVALIDA");
    expect(m.escritas()).toEqual([]);
    expect(claims).toMatchObject({ iss: EMISOR, aud: AUDIENCIA, sub: "operador", client_id: "cliente-1", act: "intentos", ev: x.eventId });
    expect(claims.exp - claims.iat).toBe(900);
  });

  it("frase_ok vacía, ausente o negativa no confirma", async () => {
    const x = await escenario();
    const m = mcp(x);
    const v = await m.ej("preparar_intentos", { event_id: x.eventId });
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id }))).toBe("SIN_SI");
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "   " }))).toBe("SIN_SI");
    for (const f of ["no, espera", "quizá", "tengo dudas", "por ahora no", "sí pero espera", "no", "Sí, luego", "tal vez sí", "claro que lo pienso"])
      expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: f })), f).toBe("NO_CONFIRMADO");
    expect(m.escritas()).toEqual([]);
  });

  it("frase_ok acepta solo afirmaciones explícitas de la lista blanca", () => {
    for (const f of ["Sí", "sí, confirmo", "Adelante", "si", "OK", "dale", "Hazlo.", "envíalo", "autorizo", "yes", "confirm", "¡Sí!"]) expect(esAfirmacion(f), f).toBe(true);
    for (const f of ["", "  ", "quizá", "tengo dudas", "por ahora no", "sí pero espera", "no", "sí, después", "sí, tal vez", "a ver"]) expect(esAfirmacion(f), f).toBe(false);
  });

  it("un 2xx sin la forma esperada o «incierta» no cuenta como hecho (borrador y tanda)", async () => {
    const x = await escenario();
    const m = mcp(x, "operador", "operator", {}, (b, r) => b.action === "draft_bid_room_carrier_message" ? { status: 200, body: { code: "RESPUESTA_INVALIDA", incierta: true }, headers: {} } : r);
    const v = await m.ej("preparar_intentos", { event_id: x.eventId });
    const r = await m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" });
    expect(r.estado).toBe("incierta");
    expect(r.pasos).toEqual([expect.objectContaining({ ok: false, codigo: "RESPUESTA_INVALIDA", mensaje: expect.stringMatching(/revisa en la página del evento antes de repetir/) })]);
    expect(m.escritas()).toHaveLength(1); // se detiene en el primero
    const y = await escenario({ invitar: false });
    await mcp(y).ej("confirmar", { confirmacion_id: (await mcp(y).ej("preparar_invitacion", { event_id: y.eventId, fase: "borradores" })).confirmacion_id, frase_ok: "sí" });
    const admin = mcp(y, "admin", "admin", {}, (b, r) => b.action === "send_outreach_messages" ? { status: 200, body: { ok: true }, headers: {} } : r);
    const e = await admin.ej("preparar_invitacion", { event_id: y.eventId, fase: "envio" });
    const re = await admin.ej("confirmar", { confirmacion_id: e.confirmacion_id, frase_ok: "sí" });
    expect(re.estado).toBe("incierta");
    expect(re.envio).toBeUndefined();
    expect(respuestaValida("send_outreach_messages", { sent: 3, failed: 0 }, 2)).toBe(false);
    expect(respuestaValida("send_outreach_messages", { sent: 2, failed: 0 }, 2)).toBe(true);
    const t = transporteEscritura("https://fr8bid.test/api/mcp", "synthetic", async () => new Response("<html>", { status: 200 }));
    const invalido = await t("rateware-api", { action: "update_rfx_event", event_id: "synthetic", patch: { due_date: "2026-12-01" } });
    expect(invalido).toMatchObject({ status: 200, body: { code: "RESPUESTA_INVALIDA", incierta: true } });
    expect(respuestaValida("update_rfx_event", invalido.body, 0)).toBe(false);
  });

  it("si la plantilla cambia entre preparar y confirmar, no se generan borradores", async () => {
    const x = await escenario({ invitar: false });
    const m = mcp(x);
    const v = await m.ej("preparar_invitacion", { event_id: x.eventId, fase: "borradores" });
    const plantilla = x.sim.plantillas.find(t => t.name === "RFx carrier invitation - Spanish")!;
    plantilla.body = "Texto distinto al de la vista previa";
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" }))).toBe("YA_APLICADO_O_CAMBIO");
    expect(m.escritas()).toEqual([]);
    expect(decodeJwt(v.confirmacion_id).fijo).toMatchObject({ destinatarios: expect.any(Array), plantilla: expect.any(String) });
  });

  it("rol: viewer no prepara ni confirma; el Operador no revisa, no envía tandas ni cambia plazo; se revalida al confirmar", async () => {
    const x = await escenario();
    expect(await codigo(mcp(x, "consulta", "viewer").ej("preparar_intentos", { event_id: x.eventId }))).toBe("SIN_PERMISO");
    expect(await codigo(mcp(x, "consulta", "viewer").ej("confirmar", { confirmacion_id: "x".repeat(30), frase_ok: "sí" }))).toBe("SIN_PERMISO");
    const op = mcp(x);
    expect(await codigo(op.ej("preparar_revision", { event_id: x.eventId, carrier_id: x.carriers.A.id }))).toBe("SIN_PERMISO");
    expect(await codigo(op.ej("preparar_invitacion", { event_id: x.eventId, fase: "envio" }))).toBe("SIN_PERMISO");
    expect(await codigo(op.ej("preparar_cambio_evento", { event_id: x.eventId, nueva_fecha: "2026-12-01" }))).toBe("SIN_PERMISO");
    const v = await mcp(x, "admin", "admin").ej("preparar_cambio_evento", { event_id: x.eventId, nueva_fecha: "2026-12-01" });
    const degradado = mcp(x, "admin", "operator");
    expect(await codigo(degradado.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" }))).toBe("SIN_PERMISO");
    expect([...op.escritas(), ...degradado.escritas()]).toEqual([]);
  });

  it("adjudicar, limpiar, entregar y avisos de adjudicación quedan fuera del MCP", async () => {
    for (const a of ESCRITURAS_MCP) expect(ESCRITURAS["rateware-api"].has(a)).toBe(true);
    for (const a of FUERA_DEL_MCP) expect(ESCRITURAS_MCP.has(a)).toBe(false);
    const x = await escenario();
    const m = mcp(x, "admin", "admin");
    expect(await codigo(m.ej("award_rfx_lane_vendor", {}))).toBe("FUERA_DEL_MCP");
    // Aunque alguien firmara un cuerpo de adjudicación con el secreto, confirmar lo rechaza.
    const falso = await new SignJWT({ client_id: "cliente-1", act: "intentos", ev: x.eventId, arg: { event_id: x.eventId }, cuerpos: [{ action: "award_rfx_lane_vendor", event_id: x.eventId }], h: "x", pre: "x" })
      .setProtectedHeader({ alg: "HS256" }).setSubject("admin").setIssuer(EMISOR).setAudience(AUDIENCIA).setIssuedAt().setExpirationTime("10m").setJti("j").sign(SECRETO);
    expect(await codigo(m.ej("confirmar", { confirmacion_id: falso, frase_ok: "sí" }))).not.toBe("OK");
    const acciones: string[] = [];
    const t = transporteEscritura("https://fr8bid.test/api/mcp", "synthetic", async (url, op) => {
      expect(String(url)).toBe("https://fr8bid.test/api/rateware");
      acciones.push(JSON.parse(String(op?.body)).action);
      return new Response('{"ok":true}', { status: 200 });
    });
    for (const action of ["award_rfx_lane_vendor", "clear_rfx_award", "closeout_awarded_rfx_to_rateware", "generate_rfx_award_notices", "create_rfx_event", "invite_rfx_lane_vendors"])
      await expect(t("rateware-api", { action })).rejects.toThrow();
    await t("rateware-api", { action: "update_rfx_event", event_id: "synthetic", patch: { due_date: "2026-12-01" } });
    expect(acciones).toEqual(["update_rfx_event"]);
    expect(m.escritas()).toEqual([]);
  });

  it("HDships no se toca y PRIMA no se cierra ni se rechaza", async () => {
    const x = await escenario();
    const m = mcp(x, "admin", "admin");
    const [hd] = EVENTOS_PROTEGIDOS;
    for (const [n, a] of [["preparar_intentos", {}], ["preparar_cambio_evento", { nueva_fecha: "2026-12-01" }], ["preparar_invitacion", { fase: "envio" }]] as const)
      expect(await codigo(m.ej(n, { event_id: hd, ...a }))).toBe("EVENTO_PROTEGIDO");
    expect(m.llamadas).toEqual([]);
    x.sim.events.find(e => e.id === x.eventId)!.rfx_id = "RFx-1021-PRIMAPro";
    expect(await codigo(m.ej("preparar_cambio_evento", { event_id: x.eventId, nueva_fecha: "2026-10-28" }))).toBe("FECHA_PASADA");
    expect(await codigo(m.ej("preparar_cambio_evento", { event_id: x.eventId, nueva_fecha: "2026-12-01", status: "closed" }))).toBe("ZodError");
    expect(await codigo(m.ej("preparar_ya_respondio", { event_id: x.eventId, carrier_id: x.carriers.C.id, respuesta: "rechazo", canal: "email" }))).toBe("PRIMA_PROTEGIDO");
    expect(m.escritas()).toEqual([]);
  });

  it("captura: muestra all-in vs target, escribe una vez y nunca modifica una oferta existente", async () => {
    const x = await escenario();
    const m = mcp(x);
    expect(await codigo(m.ej("preparar_captura", { event_id: x.eventId, participacion_id: x.p.A, tarifa: 1500, moneda: "USD", canal: "email" }))).toBe("YA_HAY_OFERTA");
    const v = await m.ej("preparar_captura", { event_id: x.eventId, participacion_id: x.p.C, tarifa: 1650, moneda: "USD", canal: "phone", nota: "Llamada con Juan", vigencia: "2026-12-31", dias_transito: 2 });
    expect(v.vista_previa).toMatchObject({ tarifa_all_in: 1650, target: 1700, all_in_vs_target: -50, comparacion: "en o bajo target", nota_de_origen: "Captured from Phone: Llamada con Juan" });
    expect((await m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "Sí, confirmo" })).estado).toBe("aplicada");
    expect(m.escritas()).toEqual([expect.objectContaining({ action: "update_rfx_bid", id: x.p.C, patch: expect.objectContaining({ bid_rate: 1650, capture_source: "manual_operator" }) })]);
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" }))).toBe("YA_APLICADO_O_CAMBIO");
    expect(m.escritas()).toHaveLength(1);
  });

  it("plazo: solo Administrador, solo hacia adelante y una sola vez", async () => {
    const x = await escenario();
    const m = mcp(x, "admin", "admin");
    expect(await codigo(m.ej("preparar_cambio_evento", { event_id: x.eventId, nueva_fecha: "2026-11-20" }))).toBe("SOLO_EXTENDER");
    expect(await codigo(m.ej("preparar_cambio_evento", { event_id: x.eventId, nueva_fecha: "2026-11-10" }))).toBe("SOLO_EXTENDER");
    expect(await codigo(m.ej("preparar_cambio_evento", { event_id: x.eventId, nueva_fecha: "2026-10-29" }))).toBe("FECHA_PASADA");
    const v = await m.ej("preparar_cambio_evento", { event_id: x.eventId, nueva_fecha: "2026-11-27" });
    expect(v.vista_previa).toMatchObject({ plazo_actual: "2026-11-20", plazo_nuevo: "2026-11-27" });
    expect((await m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" })).estado).toBe("aplicada");
    expect(m.escritas()).toEqual([{ action: "update_rfx_event", event_id: x.eventId, patch: { due_date: "2026-11-27" } }]);
    expect(x.sim.events.find(e => e.id === x.eventId)!.due_date).toBe("2026-11-27");
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" }))).toBe("YA_APLICADO_O_CAMBIO");
  });

  it("invitación por tandas: borradores solo con «Revisado»; envío del Administrador con versión exacta", async () => {
    const x = await escenario({ invitar: false, revisados: ["A", "B"] });
    const op = mcp(x);
    const b = await op.ej("preparar_invitacion", { event_id: x.eventId, fase: "borradores" });
    expect(b.vista_previa.destinatarios.map((d: any) => d.carrier).sort()).toEqual(["Carrier Prueba A", "Carrier Prueba B"]);
    expect(b.vista_previa.quedan_fuera.carriers).toEqual([{ carrier: "Carrier Prueba C", motivo: "sin revisión" }]);
    expect(op.escritas()).toEqual([]);
    const rb = await op.ej("confirmar", { confirmacion_id: b.confirmacion_id, frase_ok: "sí" });
    expect(rb.estado).toBe("aplicada");
    expect(op.escritas().map(c => c.action)).toEqual(["create_outreach_campaign", "generate_outreach_drafts"]);
    expect(op.escritas()[1].campaign_id).not.toBe("$campana_creada");
    const admin = mcp(x, "admin", "admin");
    const e = await admin.ej("preparar_invitacion", { event_id: x.eventId, fase: "envio" });
    expect(e.vista_previa.destinatarios).toHaveLength(2);
    expect(e.vista_previa.destinatarios[0]).toEqual(expect.objectContaining({ para: expect.any(String), asunto: expect.any(String), texto: expect.any(String) }));
    expect(e.vista_previa.canal).toMatch(/SE ENVÍAN 2/);
    const re = await admin.ej("confirmar", { confirmacion_id: e.confirmacion_id, frase_ok: "sí, envíalas" });
    expect(re).toMatchObject({ estado: "aplicada", envio: { enviados: 2 } });
    const envio = admin.escritas()[0];
    expect(envio).toMatchObject({ action: "send_outreach_messages", operation_id: e.vista_previa.operation_id, confirmed: true });
    expect(envio.expected_versions).toHaveLength(2);
    expect(await codigo(admin.ej("confirmar", { confirmacion_id: e.confirmacion_id, frase_ok: "sí" }))).toBe("YA_APLICADO_O_CAMBIO");
    expect(admin.escritas()).toHaveLength(1);
  });

  it("sin FR8BID_MCP_CONFIRM_SECRET: preparar y confirmar dan error claro y las lecturas siguen", async () => {
    expect(secretoConfirmacion({})).toBeNull();
    expect(secretoConfirmacion({ FR8BID_MCP_CONFIRM_SECRET: "corto" })).toBeNull();
    const x = await escenario();
    const m = mcp(x, "operador", "operator", { secreto: null });
    let error: any;
    try { await m.ej("preparar_intentos", { event_id: x.eventId }); } catch (e) { error = e; }
    expect(error).toMatchObject({ codigo: "CONFIRMACIONES_PENDIENTES", status: 503 });
    expect(error.message).toMatch(/pendientes de configurar/);
    expect(await codigo(m.ej("confirmar", { confirmacion_id: "x".repeat(30), frase_ok: "sí" }))).toBe("CONFIRMACIONES_PENDIENTES");
    expect(m.llamadas).toEqual([]);
    const t = transporteSimulado(x.sim, () => "operador");
    const r = await crearLecturas(t, () => new Date(x.ahora()), "operator")("evento", { event_id: x.eventId });
    expect(r.evento.folio).toBe("RFx-FR8BID-PRUEBA-01");
  });

  it("el servidor anuncia preparar_* (solo lectura) y confirmar (destructiva) solo a Operador/Administrador", async () => {
    // Transporte sin estado: un servidor por petición, como /api/mcp.
    const rpc = async (rol: Rol, method: string, params?: object) => {
      const t = async () => ({ status: 200, headers: {}, body: { rows: [] } });
      const servidor = crearServidor(t, rol, undefined, { t, userId: "u", clientId: "c", secreto: null });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await servidor.connect(transport);
      try {
        return await (await transport.handleRequest(new Request("https://fr8bid.test/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }))).json();
      } finally { await servidor.close(); }
    };
    const lista = async (rol: Rol) => ({ tools: (await rpc(rol, "tools/list")).result.tools as any[], call: (method: string, params?: object) => rpc(rol, method, params) });
    expect((await lista("viewer")).tools).toHaveLength(11);
    const { tools, call } = await lista("operator");
    expect(tools).toHaveLength(18);
    expect(tools.find(t => t.name === "confirmar").annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(tools.filter(t => t.name.startsWith("preparar_")).every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint)).toBe(true);
    const r = await call("tools/call", { name: "preparar_intentos", arguments: { event_id: "11111111-1111-4111-8111-111111111111" } });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/CONFIRMACIONES_PENDIENTES/);
    const leer = await call("tools/call", { name: "eventos", arguments: {} });
    expect(leer.result.isError).toBeFalsy();
  });
});
