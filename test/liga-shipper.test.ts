import { describe, expect, it } from "vitest";
import { linkPrefs } from "../src/bidware/features/shipper-request/link";
import { copyFor, initialLang } from "../src/bidware/features/shipper-request/request.copy";
import { explainRequestError } from "../src/bidware/features/shipper-request/request.service";

describe("liga del shipper", () => {
  it("sin parámetros: MARKSMAN, México y el idioma lo decide la página", () => {
    expect(linkPrefs("?token=abc")).toEqual({ lang: null, brand: { key: "marksman", name: "MARKSMAN" }, country: "MX" });
  });

  it("lang=en arranca en inglés y en EE. UU.", () => {
    const prefs = linkPrefs("?token=abc&lang=en");
    expect(prefs.lang).toBe("en");
    expect(prefs.country).toBe("US");
    expect(initialLang(prefs.lang)).toBe("en");
  });

  it("country explícito gana a lo que sugiere el idioma", () => {
    expect(linkPrefs("?lang=en&country=mx").country).toBe("MX");
    expect(linkPrefs("?lang=es&country=US").country).toBe("US");
  });

  it("valores desconocidos se ignoran", () => {
    expect(linkPrefs("?lang=fr&brand=acme&country=BR")).toEqual({ lang: null, brand: { key: "marksman", name: "MARKSMAN" }, country: "MX" });
  });

  it("brand=xbf nombra a XBF como contacto en copy y errores", () => {
    const { brand } = linkPrefs("?brand=XBF");
    expect(brand.name).toBe("XBF");
    expect(copyFor("es", brand.name).missingBody).toBe("Abre la liga que te envió tu contacto en XBF.");
    expect(copyFor("en", brand.name).requestTypeHint).toContain("your XBF contact");
    expect(explainRequestError("link expired", "en", brand.name)).toBe("This link has expired. Ask your XBF contact for a new one.");
    expect(copyFor("es", "MARKSMAN").missingBody).toContain("MARKSMAN");
  });
});
