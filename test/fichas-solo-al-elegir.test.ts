import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const fuente = (p: string) => readFileSync(new URL(`../src/bidware/features/${p}`, import.meta.url), "utf8");

// Recorrido 22-nov: CRM, Listas y QuoteDesk abrían solos la primera fila, y una acción
// (estatus, archivar, editar) podía caer en un registro que nadie escogió.
describe("la ficha abre solo cuando eliges una fila", () => {
  it("Carrier CRM no cae en la primera fila", () => {
    const s = fuente("carrier-crm/CarrierCrmPage.tsx");
    expect(s).toMatch(/const focused = visible\.find\(\(v\) => v\.id === focusId\) \?\? null;/);
    expect(s).not.toMatch(/visible\[0\]/);
  });
  it("Listas de carriers no cae en la primera fila y conserva su mensaje de «elige una»", () => {
    const s = fuente("carrier-templates/CarrierTemplatesPage.tsx");
    expect(s).toMatch(/const focused = rows\.find\(\(t\) => t\.id === focusId\) \?\? null;/);
    expect(s).not.toMatch(/rows\[0\]/);
    expect(s).toMatch(/rows\.length > 0 && <TemplateSide/);
  });
  it("QuoteDesk no elige la primera cotización y cierra la que sale del filtro", () => {
    const s = fuente("quotedesk/QuoteDeskPage.tsx");
    expect(s).not.toMatch(/setSelectedId\(rows\[0\]/);
    expect(s).toMatch(/if \(selectedId && !rows\.some\(\(q\) => q\.id === selectedId\)\) setSelectedId\(null\);/);
  });
});
