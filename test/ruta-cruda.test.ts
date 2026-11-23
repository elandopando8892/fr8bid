// La página del evento conserva la fila de la ruta (para corregirla) y la preselección.
import { describe, expect, it } from "vitest";
import { detalle } from "../src/cliente/mapear";

const EV = "5c5cd620-5657-4dd0-ac61-0c0aab1135c1";
const LANE = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

describe("mapear: ruta cruda y paquete maestro", () => {
  const crudo = {
    event: { id: EV, rfx_id: "RFx-T", name: "T", status: "draft", rfx_master_package: { carrier_preselection_internal: { schema_version: 2 } } },
    lanes: [{ id: LANE, lane_number: 1, origin: "A", destination: "B", target_rate: 1000, origin_city: "Monterrey", invitations: [{ id: "lv" }] }]
  };
  it("guarda la fila sin invitaciones y el paquete del evento", () => {
    const d = detalle(crudo as any, [], null, { hoy: "2026-11-23" } as any);
    expect(d.rutas[0].cruda).toMatchObject({ id: LANE, origin: "A", origin_city: "Monterrey", target_rate: 1000 });
    expect(d.rutas[0].cruda).not.toHaveProperty("invitations");
    expect(d.paqueteMaestro).toMatchObject({ carrier_preselection_internal: { schema_version: 2 } });
  });
});
