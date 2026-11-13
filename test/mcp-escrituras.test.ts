import { describe, expect, it } from "vitest";
import { SignJWT, decodeJwt } from "jose";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { crearSimulado } from "../src/simulado/semilla";
import { transporteSimulado } from "../src/cliente/api";
import { EVENTOS_PROTEGIDOS } from "../src/dominio/protegidos";
import { hoyMexico } from "../src/dominio/recorrido";
import { ESCRITURAS } from "../src/servidor/proxy";
import { aprobadoresDe, crearEscrituras, esAfirmacion, evaluarEfecto, FUERA_DEL_MCP, LIMITE_TOKEN, respuestaValida, type ContextoEscrituras } from "../src/mcp/escrituras";
import { ORG } from "../src/simulado/semilla";
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
    { userId: usuario, clientId: "cliente-1", email: `${usuario === "admin" ? "sales" : usuario}@heymarksman.com`, rol, secreto: SECRETO, ahora: () => new Date(x.ahora()), registrar: e => logs.push(e), ...extra });
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

  it("la cadencia excluye a quien ya respondió; «ya respondió» no está en el MCP", async () => {
    const x = await escenario();
    const m = mcp(x);
    // B respondió (marcado en la página del evento): la cadencia ya no lo incluye.
    await x.sim.llamar("rateware-api", { action: "update_rfx_bid", id: x.p.B, patch: { invitation_status: "responded", notes: "WhatsApp: Pide más volumen" } }, "Bearer sim:operador");
    const i = await m.ej("preparar_intentos", { event_id: x.eventId });
    expect(i.vista_previa.destinatarios.map((d: any) => d.participacion_id)).toEqual([x.p.C]);
    // «Ya respondió» quedó fuera del MCP (update_rfx_bid sin tarifa pone bid_rate en null).
    expect(await codigo(m.ej("preparar_ya_respondio", { event_id: x.eventId, carrier_id: x.carriers.C.id, respuesta: "respondio", canal: "email" }))).toBe("FUERA_DEL_MCP");
    expect(m.escritas()).toEqual([]);
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
    const invalido = await t("rateware-api", { action: "record_rfx_invitation_wave_review", event_id: "synthetic", vendor_id: "v" });
    expect(invalido).toMatchObject({ status: 200, body: { code: "RESPUESTA_INVALIDA", incierta: true } });
    expect(respuestaValida("record_rfx_invitation_wave_review", invalido.body, 0)).toBe(false);
  });

  it("la tanda excluye mensajes en proceso (sending) y no cambia su composición", async () => {
    const x = await escenario({ invitar: false });
    await mcp(x).ej("confirmar", { confirmacion_id: (await mcp(x).ej("preparar_invitacion", { event_id: x.eventId, fase: "borradores" })).confirmacion_id, frase_ok: "sí" });
    const borradores = x.sim.mensajes.filter(m => m.rfx_event_id === x.eventId);
    expect(borradores.length).toBeGreaterThanOrEqual(2);
    const ocupado = borradores[0];
    ocupado.status = "sending";
    const admin = mcp(x, "admin", "admin");
    const e1 = await admin.ej("preparar_invitacion", { event_id: x.eventId, fase: "envio" });
    const e2 = await admin.ej("preparar_invitacion", { event_id: x.eventId, fase: "envio" });
    const ids: string[] = (decodeJwt(e1.confirmacion_id) as any).cuerpos[0].ids;
    expect(ids).not.toContain(ocupado.id);
    expect(ids).toHaveLength(borradores.length - 1);
    expect(e1.vista_previa.operation_id).toBe(e2.vista_previa.operation_id);
    expect(e1.vista_previa.quedan_fuera).toEqual(expect.arrayContaining([expect.objectContaining({ motivo: expect.stringMatching(/en proceso/) })]));
    expect(admin.escritas()).toEqual([]);
  });

  it("intentos: si cambia el correo del destinatario entre preparar y confirmar, no se escribe", async () => {
    const x = await escenario();
    const m = mcp(x);
    const v = await m.ej("preparar_intentos", { event_id: x.eventId, participacion_ids: [x.p.C] });
    expect(v.vista_previa.destinatarios[0].correo).toBe("sales@heymarksman.com");
    x.sim.vendors.find(c => c.id === x.carriers.C.id)!.primary_email = "otro@ejemplo.test";
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" }))).toBe("YA_APLICADO_O_CAMBIO");
    expect(m.escritas()).toEqual([]);
  });

  it("intentos: sin saber quién respondió (falla o PASO_EN_RATEWARE) no se prepara nada", async () => {
    const x = await escenario();
    const sinPaso = mcp(x, "operador", "operator", {}, (b, r) => b.action === "list_rfx_carrier_replies" ? { status: 501, body: { code: "PASO_EN_RATEWARE", error: "x" }, headers: {} } : r);
    let error: any;
    try { await sinPaso.ej("preparar_intentos", { event_id: x.eventId }); } catch (e) { error = e; }
    expect(error).toMatchObject({ codigo: "SIN_RESPUESTAS" });
    expect(error.message).toMatch(/intenta más tarde/);
    x.sim.fallas.fallarRespuestas = true;
    const falla = mcp(x);
    expect(await codigo(falla.ej("preparar_intentos", { event_id: x.eventId }))).toBe("SIN_RESPUESTAS");
    expect([...sinPaso.escritas(), ...falla.escritas()]).toEqual([]);
  });

  it("intentos y «Revisado» con las reglas de la Mesa, revalidadas al confirmar", async () => {
    const x = await escenario();
    const m = mcp(x);
    const v = await m.ej("preparar_intentos", { event_id: x.eventId });
    x.sim.events.find(e => e.id === x.eventId)!.due_date = "2026-10-01"; // cerrado a ofertas
    expect(await codigo(m.ej("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "sí" }))).toBe("YA_APLICADO_O_CAMBIO");
    expect(await codigo(m.ej("preparar_intentos", { event_id: x.eventId }))).toBe("NO_PERMITIDO");
    const y = await escenario({ invitar: false, revisados: ["A"] });
    const admin = mcp(y, "admin", "admin");
    expect(await codigo(admin.ej("preparar_revision", { event_id: y.eventId, carrier_id: y.carriers.A.id }))).toBe("YA_REVISADO");
    y.sim.revisar(y.eventId, y.carriers.B.id, false);
    expect(await codigo(admin.ej("preparar_revision", { event_id: y.eventId, carrier_id: y.carriers.B.id }))).toBe("NO_PERMITIDO"); // revocada
    const r = await admin.ej("preparar_revision", { event_id: y.eventId, carrier_id: y.carriers.C.id });
    y.sim.revisar(y.eventId, y.carriers.C.id);
    expect(await codigo(admin.ej("confirmar", { confirmacion_id: r.confirmacion_id, frase_ok: "sí" }))).toBe("YA_APLICADO_O_CAMBIO");
    expect([...m.escritas(), ...admin.escritas()]).toEqual([]);
  });

  it("ningún confirmacion_id pasa del límite: una selección grande se parte en varias confirmaciones", async () => {
    const base = crearSimulado();
    let ahora = ENVIO;
    base.sim.hoy = () => hoyMexico(new Date(ahora));
    base.sim.ahora = () => ahora;
    const sim = base.sim;
    const op = (body: Record<string, unknown>) => sim.llamar("rateware-api", body, "Bearer sim:operador").then(r => r.body);
    const vendors = Array.from({ length: 90 }, (_, i) => sim.agregarVendor(ORG, `Carrier Masivo ${String(i).padStart(2, "0")}`));
    const { row: event } = await op({ action: "create_rfx_event", name: "PRUEBA CONTROLADA · masiva", customer: "Shipper de Prueba", due_date: "2026-11-20", rfx_id: "RFx-FR8BID-PRUEBA-01" });
    const { rows: lanes } = await op({ action: "import_rfx_lanes", event_id: event.id, rows: [{ origin_city: "Monterrey", origin_state: "NL", origin_country: "MX", destination_city: "Dallas", destination_state: "TX", destination_country: "US", equipment: "Dry Van", weekly_volume: 4, target_rate: 1700, currency: "USD" }] });
    await op({ action: "shortlist_rfx_lane_vendors", lane_id: lanes[0].id, vendor_ids: vendors.map(v => v.id) });
    await op({ action: "update_rfx_event", event_id: event.id, patch: { status: "open" } });
    for (const v of vendors) sim.revisar(event.id, v.id);
    const { rows: m } = await op({ action: "generate_outreach_drafts", event_id: event.id, reviewed_vendor_ids: vendors.map(v => v.id) });
    await sim.llamar("rateware-api", { action: "send_outreach_messages", ids: m.map((x: any) => x.id), expected_versions: m.map((x: any) => ({ id: x.id, updated_at: x.updated_at })), confirmed: true, confirmation_action: "send_outreach_messages" }, "Bearer sim:admin");
    ahora = DESPUES;
    const x = { sim, carriers: {}, eventId: event.id, p: {}, reloj: (iso: string) => { ahora = iso; }, ahora: () => ahora } as unknown as Escenario;
    const mm = mcp(x);
    const v = await mm.ej("preparar_intentos", { event_id: event.id });
    expect(v.partes.length).toBeGreaterThanOrEqual(2);
    expect(v.partes.every((p: any) => p.confirmacion_id.length <= LIMITE_TOKEN)).toBe(true);
    expect(v.partes.flatMap((p: any) => p.vista_previa.destinatarios.map((d: any) => d.participacion_id))).toHaveLength(90);
    for (const p of v.partes) expect((await mm.ej("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "sí" })).estado).toBe("aplicada");
    expect(mm.escritas()).toHaveLength(90);
    expect(await codigo(mm.ej("confirmar", { confirmacion_id: "x".repeat(LIMITE_TOKEN + 1), frase_ok: "sí" }))).toBe("ZodError");
  }, 60000);

  it("solo es «aplicada» si Rateware hizo todo lo aprobado; la campaña creada cuenta aunque falten borradores", async () => {
    const y = await escenario({ invitar: false });
    const vacio = mcp(y, "operador", "operator", {}, (b, r) => b.action === "generate_outreach_drafts" ? { ...r, body: { generated: 0, rows: [], skipped_rows: b.reviewed_vendor_ids.map((v: string) => ({ vendor_id: v, reason: "not_reviewed" })) } } : r);
    const b = await vacio.ej("preparar_invitacion", { event_id: y.eventId, fase: "borradores" });
    const rb = await vacio.ej("confirmar", { confirmacion_id: b.confirmacion_id, frase_ok: "sí" });
    expect(rb.estado).toBe("parcial");
    expect(rb.omisiones[0].motivo).toMatch(/^Campaña creada \(.+\), borradores no generados\.$/);
    expect(rb.omisiones.slice(1).map((o: any) => o.motivo)).toEqual(["not_reviewed", "not_reviewed", "not_reviewed"]);
    // Falla al generar después de crear la campaña: parcial, no «rechazada».
    const z = await escenario({ invitar: false });
    const falla = mcp(z, "operador", "operator", {}, (b, r) => b.action === "generate_outreach_drafts" ? { status: 409, body: { code: "CONFLICTO", error: "x" }, headers: {} } : r);
    const fb = await falla.ej("confirmar", { confirmacion_id: (await falla.ej("preparar_invitacion", { event_id: z.eventId, fase: "borradores" })).confirmacion_id, frase_ok: "sí" });
    expect(fb).toMatchObject({ estado: "parcial", omisiones: [{ motivo: expect.stringMatching(/Campaña creada/) }] });
    // Tanda que no envía ninguno: sin_efecto.
    const w = await escenario({ invitar: false });
    await mcp(w).ej("confirmar", { confirmacion_id: (await mcp(w).ej("preparar_invitacion", { event_id: w.eventId, fase: "borradores" })).confirmacion_id, frase_ok: "sí" });
    const nada = mcp(w, "admin", "admin", {}, (b, r) => b.action === "send_outreach_messages" ? { ...r, body: { sent: 0, failed: 2, skipped: 0, delivery_unknown: 0, failures: b.ids.map((id: string) => ({ id, reason: "gmail_error" })), skipped_rows: [] } } : r);
    const sn = await nada.ej("confirmar", { confirmacion_id: (await nada.ej("preparar_invitacion", { event_id: w.eventId, fase: "envio" })).confirmacion_id, frase_ok: "sí" });
    expect(sn.estado).toBe("sin_efecto");
    // El simulado sí generó los borradores (solo se alteró la respuesta): se usan para la tanda.
    const parcial = mcp(y, "admin", "admin", {}, (b, r) => b.action === "send_outreach_messages" ? { ...r, body: { sent: 1, failed: 0, skipped: 1, delivery_unknown: 0, failures: [], skipped_rows: [{ id: b.ids[1], reason: "daily_cap" }] } } : r);
    const e = await parcial.ej("preparar_invitacion", { event_id: y.eventId, fase: "envio" });
    const re = await parcial.ej("confirmar", { confirmacion_id: e.confirmacion_id, frase_ok: "sí" });
    expect(re).toMatchObject({ estado: "parcial", envio: { enviados: 1, omitidos: 1 }, omisiones: [{ motivo: "daily_cap" }] });
    expect(evaluarEfecto({ action: "send_outreach_messages", ids: ["a", "b"] }, { sent: 0, failed: 2, failures: [{ id: "a", reason: "x" }, { id: "b", reason: "y" }] }).efecto).toBe("nulo");
    expect(evaluarEfecto({ action: "record_rfx_invitation_wave_review", vendor_id: "v" }, { row: { reviewed: false } }).efecto).toBe("nulo");
    expect(evaluarEfecto({ action: "record_rfx_invitation_wave_review", vendor_id: "v" }, { row: {} }).efecto).toBe("parcial");
    // Entrega desconocida: siempre incierta, sola o mezclada.
    expect(evaluarEfecto({ action: "send_outreach_messages", ids: ["a", "b"] }, { sent: 0, failed: 0, delivery_unknown: 2 }).efecto).toBe("incierto");
    expect(evaluarEfecto({ action: "send_outreach_messages", ids: ["a", "b"] }, { sent: 1, failed: 0, delivery_unknown: 1 }).efecto).toBe("incierto");
    expect(evaluarEfecto({ action: "draft_bid_room_carrier_message", rfx_lane_vendor_id: "p" }, { reused: true, outreach_message: { id: "m" } }).efecto).toBe("nulo");
  });

  it("la partición con un límite menor: partes por carrier completo, todas se aplican; un carrier que no cabe solo da error", async () => {
    const x = await escenario();
    const completo = await mcp(x).ej("preparar_intentos", { event_id: x.eventId });
    const limite = completo.confirmacion_id.length - 200;
    const mm = mcp(x, "operador", "operator", { limiteToken: limite });
    const v = await mm.ej("preparar_intentos", { event_id: x.eventId });
    expect(v.partes).toHaveLength(2);
    const vistos = v.partes.map((p: any) => (decodeJwt(p.confirmacion_id) as any).arg.participacion_ids);
    expect(vistos.flat().sort()).toEqual([x.p.B, x.p.C].sort());
    expect(v.partes.every((p: any) => p.confirmacion_id.length <= limite)).toBe(true);
    for (const p of v.partes) expect((await mm.ej("confirmar", { confirmacion_id: p.confirmacion_id, frase_ok: "sí" })).estado).toBe("aplicada");
    expect(mm.escritas()).toHaveLength(2);
    const y = await escenario();
    const chico = mcp(y, "operador", "operator", { limiteToken: 1000 });
    let error: any;
    try { await chico.ej("preparar_intentos", { event_id: y.eventId, participacion_ids: [y.p.C] }); } catch (e) { error = e; }
    expect(error).toMatchObject({ codigo: "DEMASIADO_GRANDE" });
    expect(error.message).toContain("Carrier Prueba C");
    expect(chico.escritas()).toEqual([]);
  });
  it("captura de ofertas fuera de esta entrega: ni herramienta ni update_rfx_bid con tarifa", async () => {
    const x = await escenario();
    const m = mcp(x);
    expect(await codigo(m.ej("preparar_captura", { event_id: x.eventId, participacion_id: x.p.C, tarifa: 1650, moneda: "USD", canal: "phone" }))).toBe("FUERA_DEL_MCP");
    const t = transporteEscritura("https://fr8bid.test/api/mcp", "synthetic", async () => new Response("{}", { status: 200 }));
    await expect(t("rateware-api", { action: "update_rfx_bid", event_id: "synthetic", id: "p", patch: { bid_rate: 1650, currency: "USD" } })).rejects.toThrow();
    // Ni con una confirmación firmada a mano con el secreto.
    const falso = await new SignJWT({ client_id: "cliente-1", act: "ya_respondio", ev: x.eventId, arg: { event_id: x.eventId, participacion_ids: [x.p.C], respuesta: "respondio", canal: "email", nota: "" }, cuerpos: [{ action: "update_rfx_bid", event_id: x.eventId, id: x.p.C, patch: { bid_rate: 1, currency: "USD" } }], h: "x", pre: "x" })
      .setProtectedHeader({ alg: "HS256" }).setSubject("operador").setIssuer(EMISOR).setAudience(AUDIENCIA).setIssuedAt().setExpirationTime("10m").setJti("j").sign(SECRETO);
    expect(await codigo(m.ej("confirmar", { confirmacion_id: falso, frase_ok: "sí" }))).not.toBe("OK");
    expect(m.escritas()).toEqual([]);
  });

  it("tandas: el propietario prepara y confirma su propia vista previa; otro Administrador no puede confirmar", async () => {
    expect(aprobadoresDe({})).toEqual(["sales@heymarksman.com"]);
    expect(aprobadoresDe({ FR8BID_MCP_APROBADORES: " Jose@HeyMarksman.com, sales@heymarksman.com " })).toEqual(["jose@heymarksman.com", "sales@heymarksman.com"]);
    const y = await escenario({ invitar: false });
    await mcp(y).ej("confirmar", { confirmacion_id: (await mcp(y).ej("preparar_invitacion", { event_id: y.eventId, fase: "borradores" })).confirmacion_id, frase_ok: "sí" });
    y.sim.agregarUsuario({ clave: "admin2", email: "otro-admin@heymarksman.com", ownerEmail: ORG, roles: ["admin"] });
    const otro = mcp(y, "admin2", "admin", { email: "otro-admin@heymarksman.com" });
    const propietario = mcp(y, "admin", "admin", { email: "sales@heymarksman.com" });
    // Otro Administrador prepara: no confirma (no es propietario) y el propietario tampoco confirma la vista ajena.
    const ajena = await otro.ej("preparar_invitacion", { event_id: y.eventId, fase: "envio" });
    let error: any;
    try { await otro.ej("confirmar", { confirmacion_id: ajena.confirmacion_id, frase_ok: "sí" }); } catch (e) { error = e; }
    expect(error).toMatchObject({ codigo: "SOLO_PROPIETARIO" });
    expect(error.message).toMatch(/solo el propietario puede confirmar esto/i);
    expect(await codigo(propietario.ej("confirmar", { confirmacion_id: ajena.confirmacion_id, frase_ok: "sí" }))).toBe("OTRA_SESION");
    expect([...otro.escritas(), ...propietario.escritas()]).toEqual([]);
    // Con una lista de aprobadores que no lo incluye, sigue sin poder confirmar.
    expect(await codigo(mcp(y, "admin2", "admin", { email: "otro-admin@heymarksman.com", aprobadores: ["jose@heymarksman.com"] }).ej("confirmar", { confirmacion_id: ajena.confirmacion_id, frase_ok: "sí" }))).toBe("SOLO_PROPIETARIO");
    // El propietario prepara y confirma su propia vista previa.
    const propia = await propietario.ej("preparar_invitacion", { event_id: y.eventId, fase: "envio" });
    expect((await propietario.ej("confirmar", { confirmacion_id: propia.confirmacion_id, frase_ok: "sí" })).estado).toBe("aplicada");
    // Borradores siguen con la regla de rol: un Operador los confirma.
    const z = await escenario({ invitar: false });
    expect((await mcp(z).ej("confirmar", { confirmacion_id: (await mcp(z).ej("preparar_invitacion", { event_id: z.eventId, fase: "borradores" })).confirmacion_id, frase_ok: "sí" })).estado).toBe("aplicada");
  });

  it("una tanda con entrega desconocida queda incierta, nunca aplicada ni sin efecto", async () => {
    for (const cuerpo of [(ids: string[]) => ({ sent: 0, failed: 0, skipped: 0, delivery_unknown: ids.length, failures: [], skipped_rows: [] }),
                          (ids: string[]) => ({ sent: ids.length - 1, failed: 0, skipped: 0, delivery_unknown: 1, failures: [], skipped_rows: [] })]) {
      const y = await escenario({ invitar: false });
      await mcp(y).ej("confirmar", { confirmacion_id: (await mcp(y).ej("preparar_invitacion", { event_id: y.eventId, fase: "borradores" })).confirmacion_id, frase_ok: "sí" });
      const admin = mcp(y, "admin", "admin", {}, (b, r) => b.action === "send_outreach_messages" ? { ...r, body: cuerpo(b.ids) } : r);
      const e = await admin.ej("preparar_invitacion", { event_id: y.eventId, fase: "envio" });
      const res = await admin.ej("confirmar", { confirmacion_id: e.confirmacion_id, frase_ok: "sí" });
      expect(res.estado).toBe("incierta");
      expect(res.omisiones[0].motivo).toMatch(/entrega desconocida/);
    }
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

  it("rol: viewer no prepara ni confirma; el Operador no revisa ni envía tandas; se revalida al confirmar", async () => {
    const x = await escenario();
    expect(await codigo(mcp(x, "consulta", "viewer").ej("preparar_intentos", { event_id: x.eventId }))).toBe("SIN_PERMISO");
    expect(await codigo(mcp(x, "consulta", "viewer").ej("confirmar", { confirmacion_id: "x".repeat(30), frase_ok: "sí" }))).toBe("SIN_PERMISO");
    const op = mcp(x);
    expect(await codigo(op.ej("preparar_revision", { event_id: x.eventId, carrier_id: x.carriers.A.id }))).toBe("SIN_PERMISO");
    expect(await codigo(op.ej("preparar_invitacion", { event_id: x.eventId, fase: "envio" }))).toBe("SIN_PERMISO");
    expect(await codigo(op.ej("preparar_cambio_evento", { event_id: x.eventId, nueva_fecha: "2026-12-01" }))).toBe("FUERA_DEL_MCP");
    const y = await escenario({ invitar: false, revisados: ["A", "B"] });
    const v = await mcp(y, "admin", "admin").ej("preparar_revision", { event_id: y.eventId, carrier_id: y.carriers.C.id });
    const degradado = mcp(y, "admin", "operator");
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
    for (const action of ["update_rfx_event", "update_rfx_bid"]) await expect(t("rateware-api", { action, event_id: "synthetic" })).rejects.toThrow();
    await t("rateware-api", { action: "record_rfx_invitation_wave_review", event_id: "synthetic", vendor_id: "v" });
    expect(acciones).toEqual(["record_rfx_invitation_wave_review"]);
    expect(m.escritas()).toEqual([]);
  });

  it("HDships no se toca y PRIMA no se cierra ni se rechaza", async () => {
    const x = await escenario();
    const m = mcp(x, "admin", "admin");
    const [hd] = EVENTOS_PROTEGIDOS;
    for (const [n, a] of [["preparar_intentos", {}], ["preparar_revision", { carrier_id: x.carriers.A.id }], ["preparar_invitacion", { fase: "envio" }]] as const)
      expect(await codigo(m.ej(n, { event_id: hd, ...a }))).toBe("EVENTO_PROTEGIDO");
    expect(m.llamadas).toEqual([]);
    x.sim.events.find(e => e.id === x.eventId)!.rfx_id = "RFx-1021-PRIMAPro";
    // Ninguna herramienta cambia estado ni plazo: el MCP no puede cerrar PRIMA.
    expect(await codigo(m.ej("preparar_cambio_evento", { event_id: x.eventId, nueva_fecha: "2026-12-01" }))).toBe("FUERA_DEL_MCP");
    expect(ESCRITURAS_MCP.has("update_rfx_event")).toBe(false);
    expect(m.escritas()).toEqual([]);
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
    expect(tools).toHaveLength(15);
    expect(tools.find(t => t.name === "confirmar").annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(tools.filter(t => t.name.startsWith("preparar_")).every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint)).toBe(true);
    const r = await call("tools/call", { name: "preparar_intentos", arguments: { event_id: "11111111-1111-4111-8111-111111111111" } });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/CONFIRMACIONES_PENDIENTES/);
    const leer = await call("tools/call", { name: "eventos", arguments: {} });
    expect(leer.result.isError).toBeFalsy();
  });
});
