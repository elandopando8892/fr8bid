import { describe, expect, it } from "vitest";
import { campanasDelEventoCompletas, elegirPlantilla, esPlantillaInvitacion, plantillasDelEvento } from "../src/dominio/invitacion";

// Así vienen de Rateware: canal «multi», primero la propia y luego la global.
const propia = { id: "propia", name: "RFx carrier invitation - Spanish", channel: "multi", active: true, owner_email: "x@y" };
const global = { id: "global", name: "RFx carrier invitation - Spanish", channel: "multi", active: true, is_default: true, owner_email: null };
const ingles = { id: "en", name: "RFx carrier invitation - English", channel: "multi", active: true };
const prueba = { id: "prueba", name: "SPRINT 15 · RFx carrier invitation (PRUEBA)", channel: "email", active: true };

describe("plantilla de invitación", () => {
  it("acepta el canal «multi» de Rateware y el de correo", () => {
    expect(esPlantillaInvitacion(propia)).toBe(true);
    expect(esPlantillaInvitacion({ ...propia, channel: "email" })).toBe(true);
    expect(esPlantillaInvitacion({ ...propia, channel: "whatsapp" })).toBe(false);
    expect(esPlantillaInvitacion(ingles)).toBe(false);
    expect(esPlantillaInvitacion(prueba)).toBe(false);
    expect(esPlantillaInvitacion({ ...propia, active: false })).toBe(false);
  });

  it("sin campaña del evento, la primera válida en el orden de Rateware", () => {
    expect(elegirPlantilla([prueba, ingles, propia, global])?.id).toBe("propia");
    expect(elegirPlantilla([prueba, ingles])).toBeNull();
  });

  it("prefiere la plantilla que ya usa una campaña del evento", () => {
    expect(elegirPlantilla([propia, global], ["global"])?.id).toBe("global");
    // Una preferida que no es de invitación en español no cuenta.
    expect(elegirPlantilla([propia, global, ingles], ["en", "global"])?.id).toBe("global");
    expect(elegirPlantilla([propia, global], ["otra"])?.id).toBe("propia");
  });

  it("ordena las plantillas del evento: la campaña de Fr8Bid primero y luego la más reciente", () => {
    const propia = { id: "c5", rfx_event_id: "ev", template_id: "fr8bid", created_at: "2026-09-01", idempotency_key: "fr8bid-invitacion-ev" };
    const delEvento = [
      { id: "c1", rfx_event_id: "ev", template_id: "vieja", created_at: "2026-10-01" },
      { id: "c2", rfx_event_id: "ev", template_id: "nueva", created_at: "2026-11-09" },
      { id: "c3", rfx_event_id: "ev", template_id: "archivada", created_at: "2026-11-10", status: "archived" },
      { id: "c4", rfx_event_id: "otro", template_id: "ajena", created_at: "2026-11-11" },
      { id: "c5", rfx_event_id: "ev", template_id: "fr8bid", created_at: "2026-09-01" }
    ];
    expect(plantillasDelEvento(delEvento, "ev", propia)).toEqual(["fr8bid", "nueva", "vieja"]);
    expect(plantillasDelEvento(delEvento, "ev")).toEqual(["nueva", "vieja", "fr8bid"]);
    expect(plantillasDelEvento([], "ev")).toEqual([]);
  });

  it("solo usa la lectura del evento si Rateware la da completa", () => {
    const rows = [{ id: "c1", rfx_event_id: "ev", template_id: "t" }];
    expect(campanasDelEventoCompletas({ rows, total: 1, complete: true, has_more: false, rfx_event_id: "ev" }, "ev")).toEqual(rows);
    expect(campanasDelEventoCompletas({ rows, total: 1, complete: false, rfx_event_id: "ev" }, "ev")).toBeNull();
    expect(campanasDelEventoCompletas({ rows, total: 1, complete: true, has_more: true, rfx_event_id: "ev" }, "ev")).toBeNull();
    expect(campanasDelEventoCompletas({ rows, total: 2, complete: true, rfx_event_id: "ev" }, "ev")).toBeNull();
    expect(campanasDelEventoCompletas({ rows, total: 1, complete: true, rfx_event_id: "otro" }, "ev")).toBeNull();
    expect(campanasDelEventoCompletas({ rows: [{ id: "x", rfx_event_id: "otro" }], total: 1, complete: true, rfx_event_id: "ev" }, "ev")).toBeNull();
    // La lectura vieja (sin «complete») no sirve: el catálogo global corta en 100.
    expect(campanasDelEventoCompletas({ rows }, "ev")).toBeNull();
  });
});

describe("campaña de Fr8Bid fuera del catálogo global (más de 100 campañas)", () => {
  const EV = "e1";
  const completa = (rows: Record<string, unknown>[]) => ({ rows, total: rows.length, complete: true, campaign_read_version: 1, rfx_event_id: EV, organization_id: "o" });
  const propia = { id: "c-fr8", rfx_event_id: EV, name: "Fr8Bid · invitación RFX-1", audience_policy: { mode: "all_eligible" }, template_id: "t-propia", created_at: "2026-11-01" };
  const otra = { id: "c-otra", rfx_event_id: EV, name: "Lanzamiento", audience_policy: { mode: "all_eligible" }, template_id: "t-otra", created_at: "2026-11-20" };

  it("se reconoce en la lectura completa del evento por nombre y audiencia", async () => {
    const { campanaFr8bidEnEvento } = await import("../src/dominio/invitacion");
    expect(campanaFr8bidEnEvento([otra, propia], EV)?.id).toBe("c-fr8");
    expect(campanaFr8bidEnEvento([otra, { ...propia, audience_policy: { mode: "explicit" } }], EV)).toBeNull();
    expect(campanaFr8bidEnEvento([{ ...propia, status: "archived" }], EV)).toBeNull();
  });

  it("el proxy acepta la campaña propia que solo aparece en la lectura del evento, y nada más", async () => {
    const { manejar } = await import("../src/servidor/proxy");
    const enviar = async (_s: string, b: Record<string, unknown>) => {
      if (b.action === "list_rfx_detail") return { status: 200, body: { event: { id: EV, status: "open", due_date: "2099-01-01" }, lanes: [{ id: "l1", invitations: [{ id: "lv1", vendor_id: "v1", invitation_status: "drafted", vendors: { vendor_name: "Gena" } }] }] }, headers: {} };
      if (b.action === "list_outreach_templates") return { status: 200, body: { rows: [{ id: "t-es", name: "RFx carrier invitation - Spanish", channel: "multi" }] }, headers: {} };
      if (b.action === "list_outreach_campaigns") return { status: 200, body: b.rfx_event_id ? completa([otra, propia]) : { rows: [] }, headers: {} };
      if (b.action === "list_rfx_invitation_wave_reviews") return { status: 200, body: { rows: [{ vendor_id: "v1", reviewed: true, reviewed_at: "2026-10-24T00:00:00Z" }] }, headers: {} };
      return { status: 200, body: { ok: true }, headers: {} };
    };
    const op = { enviar, permitirEscrituras: true, real: true, hoy: () => "2026-10-24" } as any;
    const preparar = (campaign_id: string) => manejar("rateware-api", { action: "generate_outreach_drafts", event_id: EV, channel: "email", reviewed_vendor_ids: ["v1"], campaign_id, template_id: "t-es" }, "Bearer x", op);
    expect((await preparar("c-fr8")).status).toBe(200);
    expect((await preparar("c-otra")).body.code).toBe("CAMPANA_FR8BID");
  });
});

describe("campaña de Fr8Bid ambigua en la lectura del evento", () => {
  it("si dos campañas cumplen nombre y audiencia, no se acepta ninguna", async () => {
    const { campanaFr8bidEnEvento } = await import("../src/dominio/invitacion");
    const c = (id: string) => ({ id, rfx_event_id: "e1", name: "Fr8Bid · invitación X", audience_policy: { mode: "all_eligible" } });
    expect(campanaFr8bidEnEvento([c("a"), c("b")], "e1")).toBeNull();
  });
});
