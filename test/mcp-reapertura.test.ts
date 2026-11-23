import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { crearEscrituras, type ContextoEscrituras } from "../src/mcp/escrituras";
import { manejar } from "../src/servidor/proxy";

const eventId = "11111111-1111-4111-8111-111111111111";
const secret = "synthetic-reopen-signing-key-for-tests-only";
const input = { event_id: eventId, nueva_fecha: "2026-11-27", motivo: "Recibir propuestas adicionales" };
const snapshot = { event_id: eventId, folio: "RFx-SYNTHETIC", name: "Prueba local",
  status: "closed", due_date: "2026-11-20", lanes: 2, participations: 3, bids: 1,
  version: "a".repeat(64), awards: 0, award_history: false, notices: false, handoff: false,
  operations: false, void_lanes: 0 };

function escenario() {
  let now = new Date("2026-11-23T18:00:00Z");
  let current = { status: "closed", due_date: snapshot.due_date };
  let blocking: string[] = [];
  let result = 200;
  let actualWrite = 0;
  let receiptPatch: Record<string, unknown> = {};
  const calls: Record<string, unknown>[] = [];
  const receipts = new Map<string, Record<string, unknown>>();
  const ctx: ContextoEscrituras = { userId: "owner", clientId: "client", rol: "admin",
    email: "sales@heymarksman.com", secreto: new TextEncoder().encode("local-test-only-confirm-secret-012345"),
    organizacionId: "test-org", secretoReapertura: secret,
    ahora: () => now, registrar: () => {} };
  const response = (status: number, body: Record<string, unknown>) => ({ status, body, headers: {} });
  const make = (extra: Partial<ContextoEscrituras> = {}) => crearEscrituras(async (_s, body) => {
    calls.push(body);
    switch (body.action) {
      case "preview_rfx_event_reopen":
        return response(200, { can_reopen: !blocking.length && current.status === "closed",
          blocking: current.status === "open" ? ["EVENTO_NO_REABRIBLE"] : blocking, snapshot: { ...snapshot, ...current } });
      case "reopen_rfx_event_if_unchanged": {
        if (result !== 200) return response(result, { code: result === 409 ? "EVENTO_CAMBIO" : "SIN_RESPUESTA" });
        const id = String(body.operation_id);
        if (!receipts.has(id)) {
          actualWrite++;
          current = { status: "open", due_date: input.nueva_fecha };
          receipts.set(id, { event_id: eventId, operation_id: id, ...current, organization_id: "test-org",
            actor_id: "owner", committed_at: now.toISOString() });
        }
        return response(200, { receipt: { ...receipts.get(id)!, ...receiptPatch } });
      }
      default: throw new Error("Acción inesperada");
    }
  }, { ...ctx, ...extra });
  return { run: make(), make, calls, writes: () => actualWrite, alterarRecibo: (patch: Record<string, unknown>) => { receiptPatch = patch; },
    block: (codes: string[]) => { blocking = codes; }, fail: (code: number) => { result = code; },
    time: (value: string) => { now = new Date(value); } };
}

describe("Reapertura y extensión RFx", () => {
  it("prepara sin escribir, devuelve la evidencia aprobada y relee el estado persistido", async () => {
    const s = escenario();
    const v = await s.run("preparar_reapertura_evento", input);
    expect(s.calls.map(b => b.action)).toEqual(["preview_rfx_event_reopen"]);
    expect(v).toMatchObject({ estado: "vista_previa", escrito: false, accion: "reapertura_evento",
      vista_previa: { estado_actual: "cerrado", estado_propuesto: "abierto", plazo_actual: "2026-11-20",
        plazo_nuevo: "2026-11-27", rutas: 2, participaciones: 3, ofertas: 1 } });
    const args = { confirmacion_id: v.confirmacion_id, frase_ok: "Sí, confirmo" };
    const [a, b] = await Promise.all([s.run("confirmar", args), s.run("confirmar", args)]);
    expect(a).toMatchObject({ estado: "aplicada", lectura_verificada: true, event_id: eventId });
    expect(a.recibo).toEqual(b.recibo);
    expect(s.writes()).toBe(1);
    const write = s.calls.find(x => x.action === "reopen_rfx_event_if_unchanged")!;
    const expires = Date.parse(v.vence_en) / 1000;
    const signature = createHmac("sha256", secret).update(JSON.stringify([
      "fr8bid.rfx.reopen.approval.v1", write.action, "owner", "test-org", eventId, input.nueva_fecha,
      snapshot.version, write.operation_id, input.motivo, args.frase_ok, expires,
    ])).digest("hex");
    expect(write).toMatchObject({
      event_id: eventId, expected_version: snapshot.version, new_due_date: input.nueva_fecha,
      reason: input.motivo, approval_text: args.frase_ok, approval_signature: signature,
      approval_expires_at: expires,
    });
    expect(JSON.stringify(a)).not.toContain(signature);
  });

  it.each(["actor_id", "event_id", "operation_id", "due_date", "organization_id"])("trata recibo alterado en %s como incierto", async (field) => {
    const s = escenario();
    const v = await s.run("preparar_reapertura_evento", input);
    s.alterarRecibo({ [field]: "distinto" });
    const r = await s.run("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "Sí" });
    expect(r).toMatchObject({ estado: "incierta", reintentar: false });
    expect(r).not.toHaveProperty("recibo");
    expect(s.calls.map(b => b.action)).toEqual(["preview_rfx_event_reopen", "reopen_rfx_event_if_unchanged"]);
  });

  it("bloquea si falta la clave y rechaza el ingreso directo sin prueba", async () => {
    const s = escenario();
    await expect(s.make({ secretoReapertura: null })("preparar_reapertura_evento", input)).rejects.toMatchObject({
      codigo: "REAPERTURA_NO_CONFIGURADA",
    });
    expect(s.calls).toEqual([]);
    const response = await manejar("rateware-api", {
      action: "reopen_rfx_event_if_unchanged", event_id: eventId, operation_id: eventId,
      expected_version: snapshot.version, new_due_date: input.nueva_fecha, reason: input.motivo, approval_text: "Sí",
    }, "Bearer synthetic-user", { enviar: async () => { throw Error("No debe llegar a Rateware"); }, permitirEscrituras: true, real: true });
    expect(response).toMatchObject({ status: 400, body: { code: "SOLO_REAPERTURA" } });
  });

  it("bloquea efectos posteriores antes de firmar y exige al propietario de la misma sesión", async () => {
    const s = escenario();
    s.block(["CON_ADJUDICACIONES", "CON_ENTREGA_RATEWARE"]);
    const blocked = await s.run("preparar_reapertura_evento", input);
    expect(blocked).toMatchObject({ estado: "bloqueada", escrito: false, blocking: ["CON_ADJUDICACIONES", "CON_ENTREGA_RATEWARE"] });
    expect(blocked).not.toHaveProperty("confirmacion_id");
    s.block([]);
    await expect(s.make({ rol: "operator" })("preparar_reapertura_evento", input)).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
    const v = await s.run("preparar_reapertura_evento", input);
    const args = { confirmacion_id: v.confirmacion_id, frase_ok: "Sí" };
    await expect(s.make({ clientId: "otro" })("confirmar", args)).rejects.toMatchObject({ codigo: "OTRA_SESION" });
    await expect(s.make({ organizacionId: "otra-org" })("confirmar", args)).rejects.toMatchObject({ codigo: "OTRA_SESION" });
    await expect(s.make({ email: "otro@example.test" })("confirmar", args)).rejects.toMatchObject({ codigo: "SOLO_PROPIETARIO" });
    s.time("2026-11-23T18:16:00Z");
    await expect(s.run("confirmar", args)).rejects.toMatchObject({ codigo: "CONFIRMACION_INVALIDA" });
    expect(s.writes()).toBe(0);
  });

  it.each([[409, "rechazada"], [504, "incierta"]])("no repite la escritura ante HTTP %s", async (code, estado) => {
    const s = escenario();
    const v = await s.run("preparar_reapertura_evento", input);
    s.fail(code);
    const r = await s.run("confirmar", { confirmacion_id: v.confirmacion_id, frase_ok: "Sí" });
    expect(r).toMatchObject({ estado, reintentar: false });
    expect(s.calls.filter(b => b.action === "reopen_rfx_event_if_unchanged")).toHaveLength(1);
    expect(s.writes()).toBe(0);
  });
});
