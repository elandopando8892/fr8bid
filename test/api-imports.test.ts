import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

// Las funciones de /api corren como ESM en Node (Vercel): cada import relativo que alcanzan
// necesita extensión .js y ningún alias @/ (Vite los resuelve; Node no). Un solo import sin
// extensión tumba la función con ERR_MODULE_NOT_FOUND (pasó en /api/mcp el 12-nov).
function resolver(desde: string, spec: string): string | null {
  const p = normalize(join(dirname(desde), spec));
  for (const c of [p.replace(/\.js$/, ".ts"), p.replace(/\.js$/, ".tsx"), p]) if (existsSync(c)) return c;
  return null;
}

function problemas(entrada: string) {
  const vistos = new Set<string>();
  const malos: string[] = [];
  const recorrer = (f: string) => {
    if (vistos.has(f)) return;
    vistos.add(f);
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/(?:import|export)\s(?:[^'"]*?\sfrom\s)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith("@/")) { malos.push(`${f}: ${spec} (alias)`); continue; }
      if (!spec.startsWith(".")) continue;
      if (!spec.endsWith(".js")) malos.push(`${f}: ${spec} (sin .js)`);
      const r = resolver(f, spec);
      if (r) recorrer(r); else malos.push(`${f}: ${spec} (no resuelve)`);
    }
  };
  recorrer(entrada);
  return malos;
}

describe("funciones de /api ejecutables en Node ESM", () => {
  const funciones = readdirSync("api").filter(f => f.endsWith(".ts")).map(f => join("api", f));
  it.each(funciones)("%s solo alcanza imports relativos con .js", f => {
    expect(problemas(f)).toEqual([]);
  });
});
