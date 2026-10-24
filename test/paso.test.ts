import { describe, expect, it } from "vitest";
import { revisar, sinProtegidos, esRespuestaProtegida } from "../src/servidor/paso";

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
});
