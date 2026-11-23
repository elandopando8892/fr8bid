import { describe, expect, it } from "vitest";
import { revisar, sinProtegidos, esRespuestaProtegida, tableroPublico } from "../src/servidor/paso";

const HD = "5894a5f1-f523-40b1-963e-445ab780b5f9";
const AUTH = "Bearer x";
const op = "3f0e7a52-9c4b-4c1e-8f6a-2b7d9e1a0c55";
const llamada = (fn: string, json: Record<string, unknown> | null, modo: "no" | "borradores" | "si" = "si", autorizacion: string | null = AUTH) => revisar({ fn, json, autorizacion, modo });

describe("paso de los módulos de Bidware (/api/funcion)", () => {
  it("solo las funciones que usan los módulos, y las del equipo con sesión", () => {
    expect(llamada("otra-funcion", { action: "x" })?.body.code).toBe("FUNCION_NO_PERMITIDA");
    expect(llamada("rateware-api", { action: "list_vendors" }, "si", null)?.body.code).toBe("SIN_SESION");
    expect(llamada("rfx-bid-api", { action: "get_invitation", token: "t" }, "si", null)).toBeNull();
    expect(llamada("rateware-api", { action: "list_vendors" })).toBeNull();
  });

  it("sin «si» solo pasan lecturas; con «borradores», también los borradores", () => {
    expect(llamada("rateware-api", { action: "list_vendors" }, "no")).toBeNull();
    expect(llamada("quotedesk-api", { action: "list_quotes" }, "no")).toBeNull();
    expect(llamada("shipper-directory-api", { action: "shipper_summary" }, "no")).toBeNull();
    expect(llamada("rateware-api", { action: "update_vendor", id: "v" }, "no")?.status).toBe(423);
    expect(llamada("rfx-bid-api", { action: "submit_bid", token: "t" }, "no")?.status).toBe(423);
    expect(llamada("carrier-profile-api", { action: "get_profile", token: "t" }, "no")).toBeNull();
    expect(llamada("create-raw-upload", null, "no")?.status).toBe(423);
    expect(llamada("rateware-api", { action: "draft_bid_room_carrier_message", rfx_event_id: "e" }, "borradores")).toBeNull();
    expect(llamada("rateware-api", { action: "update_vendor", id: "v" }, "borradores")?.body.code).toBe("SOLO_BORRADORES");
    expect(llamada("rateware-api", { action: "update_vendor", id: "v" }, "si")).toBeNull();
    // La vista previa de fusionar duplicados solo lee; ejecutarla escribe.
    expect(llamada("rateware-api", { action: "consolidate_exact_vendor_duplicates" }, "no")).toBeNull();
    expect(llamada("rateware-api", { action: "consolidate_exact_vendor_duplicates", dry_run: false }, "no")?.status).toBe(423);
  });

  it("lo traído de Bidware el 25-29 oct: sus lecturas pasan sin «si» y sus escrituras no", () => {
    for (const action of ["list_rfx_event_context", "list_rfx_invitation_wave_reviews", "preview_outreach_audience", "list_outreach_campaigns", "list_outreach_audience_segments", "list_outreach_messages"])
      expect(llamada("rateware-api", { action, rfx_event_id: "e" }, "no")).toBeNull();
    for (const action of ["generate_outreach_drafts", "mark_outreach_messages", "delete_outreach_messages", "update_carrier_list_template"])
      expect(llamada("rateware-api", { action, rfx_event_id: "e" }, "no")?.status).toBe(423);
  });

  it("HDships no se lee ni se toca", () => {
    expect(llamada("rateware-api", { action: "list_rfx_detail", event_id: HD })?.status).toBe(404);
    expect(llamada("rateware-api", { action: "update_vendor", patch: { note: `ver ${HD.toUpperCase()}` } })?.status).toBe(404);
    const fuera = sinProtegidos({ rows: [{ id: HD }, { id: "a", lanes: [{ rfx_event_id: HD }, { rfx_event_id: "a" }] }], origins: { [HD]: "manual", a: "rateware" } });
    expect(fuera).toEqual({ rows: [{ id: "a", lanes: [{ rfx_event_id: "a" }] }], origins: { a: "rateware" } });
    expect(esRespuestaProtegida({ event: { id: HD } })).toBe(true);
    expect(esRespuestaProtegida({ event: { id: "a" } })).toBe(false);
  });

  it("adjudicar, entregar y avisar se hacen en la Mesa; «closed» nunca sale por update_rfx_event", () => {
    for (const action of ["award_rfx_lane_vendor", "clear_rfx_award", "closeout_awarded_rfx_to_rateware", "generate_rfx_award_notices"])
      expect(llamada("rateware-api", { action, operation_id: op })?.body.code).toBe("EN_LA_MESA");
    expect(llamada("rateware-api", { action: "update_rfx_event", id: "e", patch: { status: "closed" } })?.body.code).toBe("CIERRE_POR_ENTREGA");
    expect(llamada("rateware-api", { action: "update_rfx_event", id: "e", patch: { status: "open" } })).toBeNull();
    expect(llamada("rateware-api", { action: "update_rfx_event", id: "e", patch: { status: "draft" } })).toBeNull();
  });

  it("un operation_id que no es UUID no pasa (Rateware pondría uno nuevo en cada intento)", () => {
    expect(llamada("rateware-api", { action: "send_outreach_messages", operation_id: "abc" })?.body.code).toBe("OPERACION_INVALIDA");
    expect(llamada("rateware-api", { action: "send_outreach_messages", operation_id: op })).toBeNull();
  });

  it("el tablero público no muestra shipper, bodegas ni notas", () => {
    const fila = {
      id: "l1", event_id: "e1", board_status: "live", quote_count: 2,
      event: { id: "e1", rfx_id: "RFx-1", name: "Cliente Secreto Segment 1", customer: "Cliente Secreto", status: "open", due_date: "2026-12-01" },
      lane: { id: "l1", origin: "Bodega Secreta, Nuevo Laredo, TM 88299", destination: "Planta Cliente, San Nicolas, NL 66440", origin_city: "Nuevo Laredo", origin_state: "TM", destination_city: "San Nicolas", destination_state: "NL", equipment: "Refrigerado", weekly_volume: 3, notes: "Llamar a Fulano", business_rules: "x", carrier_requirements: "y" },
      route_label: "Bodega Secreta, Nuevo Laredo, TM 88299 -> Planta Cliente, San Nicolas, NL 66440"
    };
    const salida = tableroPublico({ rows: [fila], summary: { events: 1 } });
    const texto = JSON.stringify(salida);
    for (const prohibido of ["Cliente Secreto", "Bodega Secreta", "Planta Cliente", "Fulano", "88299", "business_rules", "carrier_requirements"]) expect(texto).not.toContain(prohibido);
    expect(salida.rows[0].event).toMatchObject({ id: "e1", name: "RFx-1", due_date: "2026-12-01" });
    expect(salida.rows[0].lane).toMatchObject({ origin: "Nuevo Laredo, TM", destination: "San Nicolas, NL", equipment: "Refrigerado", weekly_volume: 3 });
    expect(salida.rows[0].route_label).toBe("Nuevo Laredo, TM -> San Nicolas, NL");
    expect(salida.rows[0]).toMatchObject({ quote_count: 2, board_status: "live" });
    expect(salida.summary).toEqual({ events: 1 });
    expect(tableroPublico({ error: "x" })).toEqual({ error: "x" });
  });
});
