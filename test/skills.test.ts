import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { herramientas } from "../src/mcp/lecturas";
import { herramientasEscritura } from "../src/mcp/escrituras";
import { herramientasContactos } from "../src/mcp/contactos";
import { herramientasListas } from "../src/mcp/listas";

// Los skills operativos de Fr8Bid se apoyan en el MCP: cada llamada que nombran
// (`herramienta(`) debe existir, y el vocabulario es el que reconoce Jose.
const catalogo = new Set([herramientas, herramientasEscritura, herramientasContactos, herramientasListas].flatMap(Object.keys));
const skills = readdirSync(".claude/skills").filter(n => n.startsWith("fr8bid-"));

describe("skills de Fr8Bid", () => {
  it.each(skills)("%s nombra solo herramientas que existen en el MCP", nombre => {
    const texto = readFileSync(`.claude/skills/${nombre}/SKILL.md`, "utf8");
    expect(texto).toMatch(new RegExp(`^---\\r?\\nname: ${nombre}\\r?\\n`));
    const llamadas = [...texto.matchAll(/`([a-z][a-z_]+)\(/g)].map(m => m[1]);
    for (const h of llamadas) expect(catalogo.has(h), `${nombre}: ${h}`).toBe(true);
  });

  it.each(skills)("%s dice «página del evento», no «Mesa»", nombre => {
    expect(readFileSync(`.claude/skills/${nombre}/SKILL.md`, "utf8")).not.toMatch(/\bMesa\b/);
  });

  it("las herramientas de contactos, listas y creación de eventos tienen skill", () => {
    const todo = skills.map(n => readFileSync(`.claude/skills/${n}/SKILL.md`, "utf8")).join("\n");
    for (const h of ["buscar_contacto", "preparar_revelar_contacto", "preparar_elegir_contacto", "listas_carrier", "preparar_alta_lista", "preparar_evento", "confirmar_creacion_evento"])
      expect(todo, h).toContain(`\`${h}(`);
  });
});
