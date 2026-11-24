import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("../src/bidware/lib/api-client", () => ({ callRatewareApi: vi.fn() }));
vi.mock("../src/bidware/auth/AuthContext", () => ({ useAuth: () => ({ can: () => true }) }));
import { splitDescription } from "../src/bidware/features/carrier-templates/CarrierTemplatesPage";

describe("Listas de carriers: descripción en una línea", () => {
  it("deja la primera oración arriba y la bitácora en Historial", () => {
    const d = splitDescription("Carriers dry van MX-US revisados. 2026-11-08 auditoría: 12 altas, 3 bajas.\nOtra línea de bitácora.");
    expect(d.head).toBe("Carriers dry van MX-US revisados.");
    expect(d.rest).toBe("2026-11-08 auditoría: 12 altas, 3 bajas.\nOtra línea de bitácora.");
  });
  it("corta una primera oración muy larga y guarda el texto completo en Historial", () => {
    const largo = "x".repeat(600);
    const d = splitDescription(largo);
    expect(d.head.length).toBe(140);
    expect(d.head.endsWith("…")).toBe(true);
    expect(d.rest).toBe(largo);
  });
  it("una descripción corta queda igual, sin Historial", () => {
    expect(splitDescription("Flatbed Texas")).toEqual({ head: "Flatbed Texas", rest: "" });
    expect(splitDescription(null)).toEqual({ head: "", rest: "" });
  });
});

describe("«Lista» para carriers, «plantilla» solo para correos", () => {
  it("los textos de listas de carriers ya no dicen plantilla", () => {
    for (const f of ["carrier-crm", "carrier-fit", "carrier-templates", "batch-review"]) {
      const fuente = readFileSync(new URL(`../src/bidware/i18n/${f}.ts`, import.meta.url), "utf8");
      expect(fuente, f).not.toMatch(/es"?:\s*"[^"]*[Pp]lantilla/);
    }
  });
});

import { shownTemplates } from "../src/bidware/features/outreach/TemplatesPage";
import type { OutreachTemplate } from "../src/bidware/features/outreach/templates.service";

describe("Plantillas de correo sin duplicados", () => {
  const tpl = (x: Partial<OutreachTemplate>) => ({ id: x.name, channel: "multi", ...x }) as OutreachTemplate;
  const sistemaEs = tpl({ id: "s-es", name: "RFx carrier invitation - Spanish", canonical_language: "es", is_default: true, owner_email: null });
  const sistemaEn = tpl({ id: "s-en", name: "RFx carrier invitation", canonical_language: "en", is_default: true, owner_email: null });
  const equipoEs = tpl({ id: "t-es", name: "RFx carrier invitation - Spanish", canonical_language: "es", is_default: true, owner_email: "equipo@example.com" });

  it("esconde la del sistema cuando el equipo ya tiene su versión", () => {
    const { rows } = shownTemplates([sistemaEs, sistemaEn, equipoEs]);
    expect(rows.map((t) => t.id)).toEqual(["s-en", "t-es"]);
  });
  it("una sola predeterminada por idioma", () => {
    const { isDefault } = shownTemplates([sistemaEs, sistemaEn, equipoEs]);
    expect(isDefault(equipoEs)).toBe(true);
    expect(isDefault(sistemaEs)).toBe(false);
    expect(isDefault(sistemaEn)).toBe(true);
  });
});
