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
