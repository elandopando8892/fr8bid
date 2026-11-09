import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PASOS_VERIFICACION,
  argShell,
  construirPromptDelegacion,
  construirPromptRevision,
  leerVeredicto,
  motivosParaNoIntegrar,
  ramaDeTrabajo,
  ramaPermitidaParaIntegrar,
  rutasSensibles,
  validarNombre
} from "../scripts/agentes/nucleo.mjs";

const verde = {
  sha: "abc",
  ok: true,
  limpio: true,
  pasos: PASOS_VERIFICACION.map((p) => ({ nombre: p.nombre, ok: true }))
};
const aprobada = { sha: "abc", veredicto: "APROBADO" as const, limpio: true, completo: true };

describe("arnés Claude + Codex", () => {
  it("el skill canónico y la copia de Claude son idénticos", () => {
    const canonico = readFileSync(".agents/skills/delegar-a-codex/SKILL.md", "utf8");
    const claude = readFileSync(".claude/skills/delegar-a-codex/SKILL.md", "utf8");
    expect(claude).toBe(canonico);
  });

  it("CLAUDE.md importa AGENTS.md", () => {
    expect(readFileSync("CLAUDE.md", "utf8").split("\n")[0]).toBe("@AGENTS.md");
  });

  it("los nombres de trabajo no permiten rutas ni ramas raras", () => {
    expect(ramaDeTrabajo("pruebas-correo")).toBe("codex/pruebas-correo");
    for (const malo of ["", "a", "../main", "Main", "con espacio", "x".repeat(49)]) {
      expect(() => validarNombre(malo)).toThrow();
    }
  });

  it("nunca se integra a main ni con HEAD suelto", () => {
    expect(ramaPermitidaParaIntegrar("main")).toBe(false);
    expect(ramaPermitidaParaIntegrar("HEAD")).toBe(false);
    expect(ramaPermitidaParaIntegrar("")).toBe(false);
    expect(ramaPermitidaParaIntegrar("claude/x")).toBe(true);
  });

  it("detecta rutas sensibles y deja pasar .env.example", () => {
    expect(rutasSensibles([".env", ".env.example", "api\\bid.ts", "src/ui/App.tsx", ".codex/config.toml"])).toEqual([
      ".env",
      "api\\bid.ts",
      ".codex/config.toml"
    ]);
  });

  it("el veredicto se lee de la última línea y sin veredicto bloquea", () => {
    expect(leerVeredicto("HALLAZGOS:\n- ninguno\nVEREDICTO: APROBADO")).toBe("APROBADO");
    expect(leerVeredicto("VEREDICTO: APROBADO\n...\nVEREDICTO: BLOQUEA")).toBe("BLOQUEA");
    expect(leerVeredicto("todo bien")).toBe("BLOQUEA");
    expect(leerVeredicto("VEREDICTO: QUIZÁ")).toBe("BLOQUEA");
  });

  it("definición de terminado: verde + revisión del mismo commit", () => {
    expect(motivosParaNoIntegrar({ rama: "claude/x", sha: "abc", verificacion: verde, revision: aprobada })).toEqual([]);
    expect(motivosParaNoIntegrar({ rama: "main", sha: "abc", verificacion: verde, revision: aprobada })).toHaveLength(1);
    expect(motivosParaNoIntegrar({ rama: "claude/x", sha: "abc", verificacion: null, revision: aprobada })).toHaveLength(1);
    expect(motivosParaNoIntegrar({ rama: "claude/x", sha: "abc", verificacion: verde, revision: null })).toHaveLength(1);
    expect(
      motivosParaNoIntegrar({ rama: "claude/x", sha: "def", verificacion: verde, revision: aprobada })
    ).toHaveLength(2);
    expect(
      motivosParaNoIntegrar({
        rama: "claude/x",
        sha: "abc",
        verificacion: { ...verde, ok: false, pasos: verde.pasos.map((p) => ({ ...p, ok: p.nombre !== "build" })) },
        revision: { ...aprobada, veredicto: "BLOQUEA" }
      })
    ).toEqual(["La verificación no pasó completa: build.", "La revisión dio BLOQUEA."]);
  });

  it("registros incompletos o raros fallan cerrado", () => {
    const ok = { rama: "claude/x", sha: "abc" };
    // verificación con un solo paso, aunque diga ok
    expect(
      motivosParaNoIntegrar({ ...ok, verificacion: { sha: "abc", ok: true, limpio: true, pasos: [{ nombre: "typecheck", ok: true }] }, revision: aprobada })
    ).toEqual(["La verificación no pasó completa: pruebas, pruebas-bidware, build."]);
    // revisión sin veredicto, con veredicto inventado, truncada o sobre árbol sucio
    expect(motivosParaNoIntegrar({ ...ok, verificacion: verde, revision: { sha: "abc", limpio: true, completo: true } as any })).toEqual([
      "La revisión dio sin veredicto."
    ]);
    expect(motivosParaNoIntegrar({ ...ok, verificacion: verde, revision: { ...aprobada, veredicto: "OK" } })).toHaveLength(1);
    expect(motivosParaNoIntegrar({ ...ok, verificacion: verde, revision: { ...aprobada, completo: false } })).toHaveLength(1);
    expect(motivosParaNoIntegrar({ ...ok, verificacion: verde, revision: { ...aprobada, limpio: false } })).toHaveLength(1);
    expect(motivosParaNoIntegrar({ ...ok, verificacion: { ...verde, limpio: false }, revision: aprobada })).toHaveLength(1);
  });

  it("argumentos para la shell de Windows: sin metacaracteres y con comillas si hay espacios", () => {
    expect(argShell("a & calc", false)).toBe("a & calc");
    expect(argShell("D:\\andre\\mi repo", true)).toBe('"D:\\andre\\mi repo"');
    expect(argShell("approval_policy=never", true)).toBe("approval_policy=never");
    for (const malo of ["a & calc", "x|y", "a>b", "%PATH%", 'di"jo', "^x", "a\nb", "!x"]) {
      expect(() => argShell(malo, true)).toThrow();
    }
  });

  it("rutas sensibles exigen aceptación explícita", () => {
    const base = { rama: "claude/x", sha: "abc", verificacion: verde, revision: aprobada, sensibles: ["vercel.json"] };
    expect(motivosParaNoIntegrar(base)).toHaveLength(1);
    expect(motivosParaNoIntegrar({ ...base, aceptarSensibles: true })).toEqual([]);
  });

  it("los prompts llevan las reglas y el formato de cierre", () => {
    const d = construirPromptDelegacion({ tarea: "Agrega una prueba", rama: "codex/x", base: "claude/y @ abc" });
    expect(d).toContain("AGENTS.md");
    expect(d).toContain("No hagas commit, push, merge");
    expect(d).toMatch(/PENDIENTE:/);
    expect(() => construirPromptDelegacion({ tarea: "  ", rama: "codex/x", base: "b" })).toThrow();
    const r = construirPromptRevision({ base: "main", diff: "+linea" });
    expect(r).toContain("VEREDICTO: BLOQUEA | CON_CAMBIOS | APROBADO");
    expect(r.endsWith("+linea")).toBe(true);
  });
});
