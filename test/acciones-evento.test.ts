import { describe, expect, it } from "vitest";
import { sinActividad } from "../src/dominio/acciones-mesa";

const p = (x: Record<string, unknown> = {}) => ({ estado: "preseleccionada", versiones: [], rol: null, ...x });
const d = (...ps: Record<string, unknown>[]) => ({ rutas: [{ participaciones: ps }] }) as any;

describe("borrar un evento: sin actividad", () => {
  it("sin carriers o solo preseleccionados, no hay actividad", () => {
    expect(sinActividad({ rutas: [] } as any)).toBe(true);
    expect(sinActividad(d())).toBe(true);
    expect(sinActividad(d(p(), p()))).toBe(true);
  });
  it("una invitación enviada, una oferta o una adjudicación cuentan como actividad", () => {
    expect(sinActividad(d(p(), p({ estado: "invitada" })))).toBe(false);
    expect(sinActividad(d(p({ versiones: [{ numero: 1 }] })))).toBe(false);
    expect(sinActividad(d(p({ rol: "primario" })))).toBe(false);
    expect(sinActividad(d(p({ estado: "declino" })))).toBe(false);
  });
});
