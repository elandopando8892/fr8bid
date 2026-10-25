import { describe, expect, it } from "vitest";
import { listTiers, makeCut, TaxonomyError, TEMPLATE_NAMES } from "../src/bidware/features/carrier-templates/evidence-review";

const fila = (id: string, segment_name: string, vendor_ids: string[], lifecycle_status = "active") =>
  ({ id, segment_name, vendor_ids, lifecycle_status, template_version: 1, organization_id: "org" });

describe("niveles de lista", () => {
  it("junta cada lista con su Ampliada y deja fuera las archivadas", () => {
    const niveles = listTiers([
      fila("a", "D2D Crossborder - Dry Van", ["v1", "v2"]),
      fila("b", "D2D Crossborder - Dry Van · Ampliada", ["v3", "v4", "v5"]),
      fila("c", "Intramex - Small Trucks · Ampliada", ["v6"]),
      fila("d", "Histórico pendiente - Intramex - Dry Van", ["v7"], "archived"),
    ]);
    expect(niveles).toEqual([
      { base: "D2D Crossborder - Dry Van", original: true,
        principal: { id: "a", version: 1, members: 2, status: "active" }, ampliada: { id: "b", version: 1, members: 3, status: "active" } },
      { base: "Intramex - Small Trucks", original: true, ampliada: { id: "c", version: 1, members: 1, status: "active" } },
    ]);
  });
});

describe("corte del clasificador", () => {
  it("dice qué listas originales faltan en vez de un error genérico", async () => {
    const filas = TEMPLATE_NAMES.slice(0, 23).map((n, i) => fila(`t${i}`, n, [`v${i}`]));
    filas.push(fila("x", TEMPLATE_NAMES[23], ["v"], "archived"));
    filas.push(fila("y", TEMPLATE_NAMES[0], ["w"]));
    const error = await makeCut(filas as any, "org").catch(e => e);
    expect(error).toBeInstanceOf(TaxonomyError);
    expect(error.message).toBe("REVIEW_TAXONOMY");
    expect(error.missing).toEqual([TEMPLATE_NAMES[23], TEMPLATE_NAMES[24]]);
    expect(error.duplicated).toEqual([TEMPLATE_NAMES[0]]);
  });

  it("con las 25 sigue armando el corte igual que antes", async () => {
    const cut = await makeCut(TEMPLATE_NAMES.map((n, i) => fila(`t${i}`, n, [`v${i}`])) as any, "org");
    expect(cut.templates).toHaveLength(25);
  });
});
