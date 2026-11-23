// Idioma de los avisos de adjudicación por país del carrier (decisión de Jose,
// 6-nov-2026), espejo de _shared/carrier-email-language.mjs de Rateware.

import { describe, expect, it } from "vitest";
import { carrierCountry, noticeCopy, recipientLanguage } from "../src/bidware/features/rfx-admin/award.service";

describe("país del carrier", () => {
  it("decide el perfil cuando lista un solo país", () => {
    expect(carrierCountry({ profile_data: { general: { operating_country: "México" } } })).toBe("MX");
    expect(carrierCountry({ profile_data: { general: { operating_country: ["Estados Unidos de America"] } } })).toBe("US");
    expect(carrierCountry({ profile_data: { general: { operating_country: "Canada" } } })).toBe("CA");
    expect(carrierCountry({ operating_country: ["Mexico"] })).toBe("MX");
  });

  it("con México y EE. UU. el perfil no decide: sigue dominio y lada", () => {
    const both = { general: { operating_country: ["Mexico", "USA"] } };
    expect(carrierCountry({ profile_data: both, primary_email: "ops@fletes.com.mx" })).toBe("MX");
    expect(carrierCountry({ profile_data: both, whatsapp_phone: "+1 956 523 8773" })).toBe("US");
    expect(carrierCountry({ profile_data: both })).toBeNull();
  });

  it("dominio .mx/.ca y lada 52/1; 10 dígitos sin lada no cuentan", () => {
    expect(carrierCountry({ domain: "trucking.ca" })).toBe("CA");
    expect(carrierCountry({ whatsapp_phone: "+52 81 5555 0101" })).toBe("MX");
    expect(carrierCountry({ whatsapp_phone: "8155550101" })).toBeNull();
  });

  it("MX en español, US/CA en inglés y sin señal el del evento", () => {
    expect(recipientLanguage({ country: "MX" }, "en")).toBe("es");
    expect(recipientLanguage({ country: "CA" }, "es")).toBe("en");
    expect(recipientLanguage({ country: null }, "en")).toBe("en");
  });
});

describe("asunto del aviso", () => {
  // Cuerpo en el idioma del carrier, asunto siempre en español (Jose, 6/7-nov; 22-nov).
  it("va en español aunque el aviso vaya en inglés", () => {
    expect(noticeCopy("primary", "en", "RFx09302601").subject).toBe("Adjudicación: RFx09302601");
    expect(noticeCopy("backup", "en", "RFx09302601").subject).toBe("Capacidad de respaldo: RFx09302601");
    expect(noticeCopy("not_awarded", "en", "RFx09302601").subject).toBe("Cierre de RFx: RFx09302601");
    expect(noticeCopy("no_award", "en", "RFx09302601").subject).toBe("Cierre de RFx: RFx09302601");
    expect(noticeCopy("primary", "es", "RFx09302601").subject).toBe("Adjudicación: RFx09302601");
  });

  it("el cuerpo sigue en el idioma del carrier", () => {
    expect(noticeCopy("primary", "en", "RFx1").headline).toBe("Your award decision is ready.");
    expect(noticeCopy("primary", "es", "RFx1").headline).toBe("La decisión de adjudicación está lista.");
  });
});
