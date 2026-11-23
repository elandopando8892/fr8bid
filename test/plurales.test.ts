import { describe, expect, it } from "vitest";
import { pluralize } from "../src/bidware/i18n/language";

describe("pluralize: sin «(s)» en pantalla", () => {
  it("concuerda con el número", () => {
    expect(pluralize("7 tarifa(s) listas")).toBe("7 tarifas listas");
    expect(pluralize("1 tarifa(s)")).toBe("1 tarifa");
    expect(pluralize("0 contacto(s) · 0 sitio(s)")).toBe("0 contactos · 0 sitios");
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
