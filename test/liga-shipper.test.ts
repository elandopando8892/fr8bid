import { describe, expect, it } from "vitest";
import { linkPrefs } from "../src/bidware/features/shipper-request/link";
import { copyFor, initialLang } from "../src/bidware/features/shipper-request/request.copy";
import { explainRequestError } from "../src/bidware/features/shipper-request/request.service";
import { COPY as PERFIL } from "../src/bidware/i18n/shipper-profile";

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
    expect(copyFor("es", brand.name).missingBody).toBe("Abra la liga que le envió su contacto en XBF.");
    expect(copyFor("en", brand.name).requestTypeHint).toContain("your XBF contact");
    expect(explainRequestError("link expired", "en", brand.name)).toBe("This link has expired. Ask your XBF contact for a new one.");
    expect(copyFor("es", "MARKSMAN").missingBody).toContain("MARKSMAN");
  });

  // Every text of the page, functions included (called with sample values).
  const textos = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (typeof value === "function") return textos((value as (...a: unknown[]) => unknown)(2, "2"));
    if (Array.isArray(value)) return value.flatMap(textos);
    if (value && typeof value === "object") return Object.values(value).flatMap(textos);
    return [];
  };
  const fallas = ["link expired", "not active", "proposal was updated", "past its validity", "solo borradores", "already been submitted", "failed to fetch"];

  it("brand=xbf: ningún texto ni error de la página nombra a MARKSMAN", () => {
    for (const lang of ["es", "en"] as const) {
      const todo = [...textos(copyFor(lang, "XBF")), ...fallas.map((f) => explainRequestError(f, lang, "XBF"))];
      expect(todo.filter((t) => /marksman/i.test(t))).toEqual([]);
    }
  });

  it("el shipper lee de usted: solicitud, errores y perfil sin tuteo", () => {
    // Only unambiguous tú forms: «revisa», «guarda» or «escribe» are also the third person.
    const tuteo = /\b(tu|tus|te|ti|tú|puedes|podrás|quieras|quieres|vas|necesitas|aceptaste|esperabas|elige|agrega|avísale|escríbenos|guardas|revísalo|revísalos|déjalo)\b/i;
    const es = [
      ...textos(copyFor("es", "MARKSMAN")),
      ...fallas.map((f) => explainRequestError(f, "es")),
      ...Object.values(PERFIL).map((t) => t.es),
    ];
    expect(es.filter((t) => tuteo.test(t))).toEqual([]);
  });
});
