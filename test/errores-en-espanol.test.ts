import { describe, expect, it } from "vitest";
import { mensajeDelServidor } from "../src/dominio/errores";
import { ErrorApi, MesaApi } from "../src/cliente/api";

describe("rechazos del servidor en español", () => {
  it("traduce los códigos nuevos y deja los demás tal cual", () => {
    expect(mensajeDelServidor("RFX_EVENT_CLOSED_FOR_INVITES", "Bidding on this RFx event is closed.")).toMatch(/plazo de este evento ya cerró/);
    expect(mensajeDelServidor("ACCEPTED_COMMERCIAL_MODELS_INVALID", "accepted_commercial_models must be")).toMatch(/no son válidos/);
    expect(mensajeDelServidor("COMMERCIAL_MODEL_NOT_ACCEPTED", "This event does not accept that commercial model.")).toBe("This event does not accept that commercial model.");
    expect(mensajeDelServidor("COMMERCIAL_MODEL_LOCKED", "Este evento opera únicamente en XBF compra-venta.")).toBe("Este evento opera únicamente en XBF compra-venta.");
  });

  it("la capa de Rateware muestra el mensaje en español", async () => {
    const t = async () => ({ status: 409, body: { error: "Bidding on this RFx event is closed. Invitations are not prepared.", code: "RFX_EVENT_CLOSED_FOR_INVITES" } });
    const api = new MesaApi(t as never, () => "2026-11-24");
    const e = await api.borrar("x").catch((x) => x);
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e.code).toBe("RFX_EVENT_CLOSED_FOR_INVITES");
    expect(e.message).toMatch(/plazo de este evento ya cerró/);
  });
});
