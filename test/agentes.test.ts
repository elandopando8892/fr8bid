import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PASOS_VERIFICACION,
  entornoVerificacion,
  codigoRevision,
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
  revisionId: "revision-fixture",
  ok: true,
  limpio: true,
  pasos: PASOS_VERIFICACION.map((p) => ({ nombre: p.nombre, ok: true }))
};
const aprobada = { sha: "abc", base: "base-fixture", id: "revision-fixture", veredicto: "APROBADO" as const, limpio: true, completo: true };
const base = aprobada.base;

describe("arnés Claude + Codex", () => {
  it("una revisión incompleta nunca devuelve éxito", () => {
    expect(codigoRevision("APROBADO", false)).toBe(2);
    expect(codigoRevision("CON_CAMBIOS", false)).toBe(2);
    expect(codigoRevision("APROBADO", true)).toBe(0);
    expect(codigoRevision("BLOQUEA", true)).toBe(2);
  });

  it("las pruebas no heredan credenciales ni opciones de inyección del proceso padre", () => {
    expect(entornoVerificacion({ Path: "bin", SystemRoot: "Windows", TEMP: "tmp", OPENAI_API_KEY: "synthetic", CUSTOM_CREDENTIAL: "synthetic", NODE_OPTIONS: "--require injected.cjs", npm_config_registry: "https://invalid" })).toEqual({ Path: "bin", SystemRoot: "Windows", TEMP: "tmp" });
  });
  it("el skill canónico y la copia de Claude son idénticos", () => {
    const canonico = readFileSync(".agents/skills/delegar-a-codex/SKILL.md", "utf8");
    const claude = readFileSync(".claude/skills/delegar-a-codex/SKILL.md", "utf8");
    expect(claude).toBe(canonico);
  });

  it("CLAUDE.md importa AGENTS.md", () => {
    expect(readFileSync("CLAUDE.md", "utf8").split(/\r?\n/)[0]).toBe("@AGENTS.md");
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
    expect(leerVeredicto("VEREDICTO: APROBADO | BLOQUEA")).toBe("BLOQUEA");
    expect(leerVeredicto("VEREDICTO: BLOQUEA | CON_CAMBIOS | APROBADO")).toBe("BLOQUEA");
    expect(leerVeredicto("VEREDICTO: APROBADO, aunque...")).toBe("BLOQUEA");
    expect(leerVeredicto("VEREDICTO: **CON_CAMBIOS**\r\n")).toBe("CON_CAMBIOS");
  });

  it("definición de terminado: verde + revisión del mismo commit", () => {
    expect(motivosParaNoIntegrar({ base, rama: "claude/x", sha: "abc", verificacion: verde, revision: aprobada })).toEqual([]);
    expect(motivosParaNoIntegrar({ base, rama: "main", sha: "abc", verificacion: verde, revision: aprobada })).toHaveLength(1);
    expect(motivosParaNoIntegrar({ base, rama: "claude/x", sha: "abc", verificacion: null, revision: aprobada })).toHaveLength(1);
    expect(motivosParaNoIntegrar({ base, rama: "claude/x", sha: "abc", verificacion: verde, revision: null })).toHaveLength(1);
    expect(
      motivosParaNoIntegrar({ base, rama: "claude/x", sha: "def", verificacion: verde, revision: aprobada })
    ).toHaveLength(2);
    expect(
      motivosParaNoIntegrar({
        rama: "claude/x",
        base,
        sha: "abc",
        verificacion: { ...verde, ok: false, pasos: verde.pasos.map((p) => ({ ...p, ok: p.nombre !== "build" })) },
        revision: { ...aprobada, veredicto: "BLOQUEA" }
      })
    ).toEqual(["La verificación no pasó completa: build.", "La revisión dio BLOQUEA."]);
  });

  it("registros incompletos o raros fallan cerrado", () => {
    const ok = { base, rama: "claude/x", sha: "abc" };
    // verificación con un solo paso, aunque diga ok
    expect(
      motivosParaNoIntegrar({ ...ok, verificacion: { ...verde, pasos: [{ nombre: "typecheck", ok: true }] }, revision: aprobada })
    ).toEqual(["La verificación no pasó completa: pruebas, pruebas-bidware, build."]);
    // revisión sin veredicto, con veredicto inventado, truncada o sobre árbol sucio
    expect(motivosParaNoIntegrar({ ...ok, verificacion: verde, revision: { ...aprobada, veredicto: undefined } as any })).toEqual([
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
    const entrada = { base, rama: "claude/x", sha: "abc", verificacion: verde, revision: aprobada, sensibles: ["vercel.json"] };
    expect(motivosParaNoIntegrar(entrada)).toHaveLength(1);
    expect(motivosParaNoIntegrar({ ...entrada, aceptarSensibles: true })).toEqual([]);
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
