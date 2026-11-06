// Idioma de los avisos de adjudicación por país del carrier (decisión de Jose,
// 6-nov-2026), espejo de _shared/carrier-email-language.mjs de Rateware.

import { describe, expect, it } from "vitest";
import { carrierCountry, recipientLanguage } from "../src/bidware/features/rfx-admin/award.service";

describe("país del carrier", () => {
  it("decide el perfil cuando lista un solo país", () => {
    expect(carrierCountry({ profile_data: { general: { operating_country: "México" } } })).toBe("MX");
    expect(carrierCountry({ profile_data: { general: { operating_country: ["Estados Unidos de America"] } } })).toBe("US");
    expect(carrierCountry({ profile_data: { general: { operating_country: "Canada" } } })).toBe("CA");
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
