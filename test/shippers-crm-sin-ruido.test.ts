import { describe, expect, it, vi } from "vitest";
vi.mock("../src/bidware/lib/api-client", () => ({ callRatewareApi: vi.fn() }));
vi.mock("../src/bidware/auth/AuthContext", () => ({ useAuth: () => ({ can: () => true }) }));
import { shipperViews } from "../src/bidware/features/shippers/ShippersPage";
import { legalNameIfDifferent } from "../src/bidware/features/carrier-crm/LegalName";
import type { Vendor } from "../src/bidware/types/domain";

describe("Shippers: Directorio es la única pestaña de trabajo", () => {
  it("las cuatro vistas casi vacías salen de la barra y quedan en «Más vistas…»", () => {
    const { visibleViews, hiddenViews } = shipperViews("directorio");
    expect(visibleViews.map(([k]) => k)).toEqual(["directorio"]);
    expect(hiddenViews.map(([, label]) => label)).toEqual(["Pipeline", "RFIs y oportunidades", "Cola de acciones", "Inteligencia"]);
  });

  it("la vista abierta se queda a la vista", () => {
    const { visibleViews, hiddenViews } = shipperViews("comercial");
    expect(visibleViews.map(([k]) => k)).toEqual(["directorio", "comercial"]);
    expect(hiddenViews).toHaveLength(3);
  });
});

describe("Carrier CRM: una sola columna de nombre", () => {
  const v = (x: Partial<Vendor>) => ({ id: "v1", ...x }) as Vendor;
  it("no repite la razón social cuando es el mismo nombre", () => {
    expect(legalNameIfDifferent(v({ vendor_name: "ACME SA", legal_name: "acme sa " }), "ACME SA")).toBeNull();
  });
  it("la muestra cuando dice otra cosa, y marca la del perfil", () => {
    expect(legalNameIfDifferent(v({ vendor_name: "ACME", legal_name: "Transportes ACME SA de CV" }), "ACME")?.text).toBe("Transportes ACME SA de CV");
    expect(legalNameIfDifferent(v({ vendor_name: "ACME", profile_legal_name: "ACME Logistics LLC" }), "ACME")).toEqual({ text: "ACME Logistics LLC", fromProfile: true });
  });
  it("sin razón social no agrega nada", () => {
    expect(legalNameIfDifferent(v({ vendor_name: "ACME" }), "ACME")).toBeNull();
  });
});
