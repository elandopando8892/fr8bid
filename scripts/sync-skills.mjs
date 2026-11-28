#!/usr/bin/env node
// Sincroniza skills entre arneses (contrato general MARKSMAN/XBF, decisión del 27-nov-2026).
// Fuente canónica: .agents/skills (la lee Codex). .claude/skills es copia generada para Claude Code.
// Marcadores (archivos vacíos dentro de la carpeta de la skill):
//   .claude/skills/<s>/GENERADO_DESDE_AGENTS  copia generada; no se edita a mano
//   .claude/skills/<s>/PROPIA_DE_CLAUDE       versión propia de Claude que se conserva aunque exista en .agents
//   .agents/skills/<s>/SOLO_CODEX             skill de rol de Codex; no se copia a .claude
// Una skill de .claude sin marcador cuyo nombre choca con una canónica detiene el script: no se sobrescribe.
//   node scripts/sync-skills.mjs          copia .agents/skills -> .claude/skills
//   node scripts/sync-skills.mjs --check  sale con 1 si la copia no está al día
// Origen: fr8quote/scripts/agents/sync-skills.mjs.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const MARKER = 'GENERADO_DESDE_AGENTS';
const OWN = 'PROPIA_DE_CLAUDE';
const CODEX_ONLY = 'SOLO_CODEX';
const ROOT = process.env.SKILLS_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, '.agents', 'skills');
const DST = join(ROOT, '.claude', 'skills');
const check = process.argv.includes('--check');

const dirs = (d) => (existsSync(d) ? readdirSync(d).filter((n) => statSync(join(d, n)).isDirectory()) : []);
const walk = (d) => (existsSync(d) ? readdirSync(d) : []).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const norm = (s) => s.replace(/\r\n/g, '\n');
const TEXT = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.js', '.mjs', '.ts', '.html']);
const SKIP = new Set([MARKER, OWN, CODEX_ONLY]);
const files = (root) => new Map(walk(root)
  .filter((p) => !SKIP.has(p.split(/[\\/]/).pop()))
  .map((p) => [relative(root, p).split('\\').join('/'), readFileSync(p)]));
const equal = (path, a, b) => b !== undefined && (TEXT.has(extname(path).toLowerCase())
  ? norm(a.toString('utf8')) === norm(b.toString('utf8')) : a.equals(b));
const has = (base, name, mark) => existsSync(join(base, name, mark));

const canonical = dirs(SRC).filter((n) => !has(SRC, n, CODEX_ONLY));
const own = canonical.filter((n) => has(DST, n, OWN));
const toCopy = new Set(canonical.filter((n) => !own.includes(n)));
const generated = dirs(DST).filter((n) => has(DST, n, MARKER));

const collisions = [...toCopy].filter((n) => existsSync(join(DST, n)) && !has(DST, n, MARKER));
if (collisions.length) {
  console.error(`Choque de nombres con skills de .claude sin marcador: ${collisions.join(', ')}.`);
  console.error(`Si la versión de Claude es intencional, crea .claude/skills/<skill>/${OWN}; si no, bórrala y vuelve a sincronizar.`);
  process.exit(1);
}
const drift = [];
for (const name of toCopy) {
  const a = files(join(SRC, name));
  const b = files(join(DST, name));
  if (!has(DST, name, MARKER)) drift.push(`falta: .claude/skills/${name}`);
  for (const [k, v] of a) if (!equal(k, v, b.get(k))) drift.push(`desactualizado: .claude/skills/${name}/${k}`);
  for (const k of b.keys()) if (!a.has(k)) drift.push(`sobrante: .claude/skills/${name}/${k}`);
}
for (const name of generated) if (!toCopy.has(name)) drift.push(`ya no está en la fuente: .claude/skills/${name}`);

if (check) {
  if (drift.length) { console.error(drift.join('\n') + '\nCorre: node scripts/sync-skills.mjs'); process.exit(1); }
  console.log(`skills en sincronía: ${toCopy.size} copiadas, ${own.length} propias de Claude`);
  process.exit(0);
}
for (const name of generated) if (!toCopy.has(name)) rmSync(join(DST, name), { recursive: true });
for (const name of toCopy) {
  rmSync(join(DST, name), { recursive: true, force: true });
  for (const [k, v] of files(join(SRC, name))) {
    const p = join(DST, name, k);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, v);
  }
  writeFileSync(join(DST, name, MARKER), 'Copia generada de .agents/skills por scripts/sync-skills.mjs. No editar.\n');
}
console.log(`copiadas ${toCopy.size} skills a .claude/skills (${own.length} propias de Claude conservadas)`);
