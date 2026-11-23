import { describe, expect, it } from "vitest";
import { pluralize } from "../src/bidware/i18n/language";

describe("pluralize: sin «(s)» en pantalla", () => {
  it("concuerda con el número", () => {
    expect(pluralize("7 tarifa(s) listas")).toBe("7 tarifas listas");
    expect(pluralize("1 tarifa(s)")).toBe("1 tarifa");
    expect(pluralize("0 contacto(s) · 0 sitio(s)")).toBe("0 contactos · 0 sitios");
  });
  it("admite hasta dos palabras antes de la marca", () => {
    expect(pluralize("2 new draft(s)")).toBe("2 new drafts");
    expect(pluralize("1 reading warning(s)")).toBe("1 reading warning");
    expect(pluralize("3 de 5 ruta(s)")).toBe("3 de 5 rutas");
  });
  it("«(es)» y acentos", () => {
    expect(pluralize("2 acción(es)")).toBe("2 acciones");
    expect(pluralize("3 borrador(es) nuevos")).toBe("3 borradores nuevos");
    expect(pluralize("1 oportunidad(es)")).toBe("1 oportunidad");
  });
  it("varias palabras tras el mismo número", () => {
    expect(pluralize("1 correo(s) rebotado(s), 4 carrier(s)")).toBe("1 correo rebotado, 4 carriers");
    expect(pluralize("1,250 fila(s)")).toBe("1,250 filas");
  });
  it("sin número no cambia", () => {
    expect(pluralize("archivado(s)")).toBe("archivado(s)");
  });
});

import { translator } from "../src/bidware/i18n/language";

describe("translator: pluraliza la plantilla, no los datos", () => {
  const tr = translator({ a: { es: "{0} tarifa(s) de {1}", en: "{0} rate(s) of {1}" } });
  it("concuerda con el valor y deja intacto el nombre", () => {
    expect(tr("a", 1, "Carrier 1 ruta(s)")).toBe("1 tarifa de Carrier 1 ruta(s)");
    expect(tr("a", 7, "X")).toBe("7 tarifas de X");
  });
});

describe("estado del evento antes de preparar invitaciones", async () => {
  const { isEventClosed, isEventConfirmedOpen } = await import("../src/bidware/features/outreach/event-open");
  const ahora = Date.parse("2026-11-20T12:00:00Z");
  it("solo confirma abierto con un estado conocido y un plazo legible y futuro", () => {
    expect(isEventConfirmedOpen({ status: "open", due_date: "2026-11-21" }, ahora)).toBe(true);
    expect(isEventConfirmedOpen({ status: "open" }, ahora)).toBe(true);
    expect(isEventConfirmedOpen({ status: "open", due_date: "2026-11-19" }, ahora)).toBe(false);
    expect(isEventConfirmedOpen({ status: "open", due_date: "no es fecha" }, ahora)).toBe(false);
    expect(isEventConfirmedOpen({ due_date: "2026-11-21" }, ahora)).toBe(false);
    expect(isEventConfirmedOpen({ status: "rarito" }, ahora)).toBe(false);
    expect(isEventConfirmedOpen(null, ahora)).toBe(false);
    expect(isEventClosed({ status: "closed" }, ahora)).toBe(true);
  });
});

describe("los datos interpolados no se pluralizan", async () => {
  const { COPY } = await import("../src/bidware/features/shipper-request/request.copy");
  it("el nombre de la hoja queda igual", () => {
    const es = (COPY as unknown as { es: { imported: (n: number, s: string | null) => string } }).es;
    expect(es.imported(1, "1 ruta(s)")).toBe("Importamos 1 ruta de la hoja «1 ruta(s)». Revisa las marcadas.");
  });
});
