// Recorrido del 26-nov: cada pestaña dice su sección y las direcciones escritas a mano llegan.
import { describe, expect, it } from "vitest";
import { ALIAS, tituloDe } from "../src/ui/titulos";

describe("nombre de la pestaña", () => {
  it("cada sección del equipo dice cuál es", () => {
    expect(tituloDe("/")).toBe("Hoy · Fr8Bid");
    expect(tituloDe("/eventos")).toBe("Eventos · Fr8Bid");
    expect(tituloDe("/eventos/5c5cd620")).toBe("Evento · Fr8Bid");
    expect(tituloDe("/rfx/new")).toBe("Nuevo evento · Fr8Bid");
    expect(tituloDe("/crm/rebotes")).toBe("Correos rebotados · Fr8Bid");
    expect(tituloDe("/templates")).toBe("Listas de carriers · Fr8Bid");
    expect(tituloDe("/tarifario", "en")).toBe("Rates · Fr8Bid");
    expect(tituloDe("/no-existe")).toBe("Fr8Bid");
  });

  it("los nombres que se escriben a mano llevan a su sección", () => {
    expect(ALIAS["/cotizaciones"]).toBe("/quotedesk");
    expect(ALIAS["/listas"]).toBe("/templates");
  });
});
