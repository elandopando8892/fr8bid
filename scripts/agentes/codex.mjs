#!/usr/bin/env node
// Arnés Claude Code + Codex. Uso:
//   node scripts/agentes/codex.mjs verificar [--nombre <slug>]
//   node scripts/agentes/codex.mjs revisar   [--nombre <slug> | --base <rama>] [--enfoque "<texto>"]
//   node scripts/agentes/codex.mjs delegar   --nombre <slug> --tarea "<texto>" [--modelo <m>]
//   node scripts/agentes/codex.mjs integrar  --nombre <slug> [--acepto-sensibles]
//   node scripts/agentes/codex.mjs estado    [--nombre <slug>]
// Reglas y definición de terminado: AGENTS.md, sección «Arnés Claude + Codex».
// Estado local en .agentes/ (ignorado por git). CODEX_BIN cambia el ejecutable de Codex.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  PASOS_VERIFICACION,
  construirPromptDelegacion,
  construirPromptRevision,
  leerVeredicto,
  motivosParaNoIntegrar,
  ramaDeTrabajo,
  rutasSensibles,
  validarNombre
} from "./nucleo.mjs";

const WIN = process.platform === "win32";
const CODEX = process.env.CODEX_BIN || "codex";
const LIMITE_DIFF = 200_000;

function correr(comando, args, { cwd, input, silencioso = false } = {}) {
  const r = spawnSync(comando, args, {
    cwd,
    input,
    encoding: "utf8",
    shell: WIN,
    maxBuffer: 64 * 1024 * 1024,
    stdio: [input === undefined ? "inherit" : "pipe", silencioso ? "pipe" : "inherit", silencioso ? "pipe" : "inherit"]
  });
  if (r.error) throw r.error;
  return { codigo: r.status ?? 1, salida: r.stdout ?? "", error: r.stderr ?? "" };
}

function git(args, cwd) {
  const r = correr("git", args, { cwd, silencioso: true });
  if (r.codigo !== 0) throw new Error(`git ${args.join(" ")} falló:\n${r.error}`);
  return r.salida.trim();
}

function opciones(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const clave = a.slice(2);
    const sig = argv[i + 1];
    if (sig === undefined || sig.startsWith("--")) o[clave] = true;
    else { o[clave] = sig; i++; }
  }
  return o;
}

// La raíz del checkout principal (también si se llama desde un worktree).
const RAIZ = dirname(resolve(git(["rev-parse", "--path-format=absolute", "--git-common-dir"], process.cwd())));
const ESTADO = join(RAIZ, ".agentes");
const REGISTRO = join(ESTADO, "registro");
const carpetaTrabajo = (nombre) => join(ESTADO, "trabajos", nombre);
const archivoRegistro = (nombre, tipo) => join(REGISTRO, `${nombre}.${tipo}`);

function guardar(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, typeof datos === "string" ? datos : JSON.stringify(datos, null, 2) + "\n");
}
const leerJson = (ruta) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null);

function exigirCodex() {
  const r = spawnSync(CODEX, ["--version"], { encoding: "utf8", shell: WIN });
  if (r.status !== 0) {
    throw new Error("No encuentro Codex CLI. Instala con `npm i -g @openai/codex` y entra con `codex login` (o CODEX_BIN=<ruta>).");
  }
}

function codexExec({ cwd, prompt, sandbox, salida, modelo }) {
  exigirCodex();
  const args = [
    "exec",
    "--cd", cwd,
    "--sandbox", sandbox,
    "-c", "approval_policy=never",
    "-c", "sandbox_workspace_write.network_access=false",
    "--output-last-message", salida
  ];
  if (modelo) args.push("--model", modelo);
  args.push("-");
  const r = correr(CODEX, args, { cwd, input: prompt });
  return { codigo: r.codigo, texto: existsSync(salida) ? readFileSync(salida, "utf8") : "" };
}

// ---------- verificar ----------
function verificar(dir) {
  const sha = git(["rev-parse", "HEAD"], dir);
  const limpio = git(["status", "--porcelain"], dir) === "";
  const pasos = [];
  for (const p of PASOS_VERIFICACION) {
    console.log(`\n▶ ${p.nombre}: ${p.comando} ${p.args.join(" ")}`);
    const t = Date.now();
    const { codigo } = correr(p.comando, p.args, { cwd: dir });
    pasos.push({ nombre: p.nombre, ok: codigo === 0, ms: Date.now() - t });
  }
  const ok = pasos.every((p) => p.ok);
  const v = { sha, limpio, ok, pasos, fecha: new Date().toISOString() };
  console.log("\nVerificación " + (ok ? "VERDE" : "ROJA") + ` en ${sha.slice(0, 8)}${limpio ? "" : " + cambios sin commit"}`);
  for (const p of pasos) console.log(`  ${p.ok ? "✓" : "✗"} ${p.nombre} (${Math.round(p.ms / 1000)} s)`);
  return v;
}

function cmdVerificar(o) {
  const nombre = o.nombre ? validarNombre(o.nombre) : "_actual";
  const dir = o.nombre ? carpetaTrabajo(nombre) : process.cwd();
  const v = verificar(dir);
  guardar(archivoRegistro(nombre, "verificacion.json"), v);
  return v.ok ? 0 : 1;
}

// ---------- revisar ----------
function diffDe(dir, base) {
  const mb = git(["merge-base", "HEAD", base], dir);
  let diff = git(["diff", mb], dir);
  const nuevos = git(["ls-files", "--others", "--exclude-standard"], dir).split("\n").filter(Boolean);
  for (const f of nuevos) {
    const r = correr("git", ["diff", "--no-index", "--", WIN ? "NUL" : "/dev/null", f], { cwd: dir, silencioso: true });
    diff += "\n" + r.salida;
  }
  if (diff.length > LIMITE_DIFF) diff = diff.slice(0, LIMITE_DIFF) + "\n[diff truncado: revisa por partes con --base]";
  return { mb, diff };
}

function cmdRevisar(o) {
  const nombre = o.nombre ? validarNombre(o.nombre) : "_actual";
  let dir = process.cwd();
  let base = typeof o.base === "string" ? o.base : "main";
  if (o.nombre) {
    const trabajo = leerJson(archivoRegistro(nombre, "trabajo.json"));
    if (!trabajo) throw new Error(`No hay trabajo «${nombre}». Usa delegar primero.`);
    dir = carpetaTrabajo(nombre);
    base = trabajo.baseSha;
  }
  const sha = git(["rev-parse", "HEAD"], dir);
  const { diff } = diffDe(dir, base);
  if (!diff.trim()) { console.log("No hay diff que revisar."); return 0; }
  const salida = archivoRegistro(nombre, "revision.md");
  mkdirSync(REGISTRO, { recursive: true });
  const prompt = construirPromptRevision({ base, diff, enfoque: typeof o.enfoque === "string" ? o.enfoque : undefined });
  const { codigo, texto } = codexExec({ cwd: dir, prompt, sandbox: "read-only", salida, modelo: o.modelo });
  if (codigo !== 0) { console.error(`Codex terminó con código ${codigo}.`); return 1; }
  const veredicto = leerVeredicto(texto);
  guardar(archivoRegistro(nombre, "revision.json"), { sha, base, veredicto, fecha: new Date().toISOString() });
  console.log(`\nRevisión de ${sha.slice(0, 8)}: ${veredicto}. Texto completo en ${salida}`);
  return veredicto === "BLOQUEA" ? 2 : 0;
}

// ---------- delegar ----------
function cmdDelegar(o) {
  const nombre = validarNombre(o.nombre);
  if (typeof o.tarea !== "string") throw new Error('Falta --tarea "<qué debe hacer Codex>".');
  const rama = ramaDeTrabajo(nombre);
  const dir = carpetaTrabajo(nombre);
  if (existsSync(dir)) throw new Error(`Ya existe ${dir}. Integra o borra ese trabajo antes (git worktree remove).`);
  const baseRama = git(["branch", "--show-current"], RAIZ) || "HEAD";
  const baseSha = git(["rev-parse", "HEAD"], RAIZ);
  mkdirSync(dirname(dir), { recursive: true });
  git(["worktree", "add", "-b", rama, dir, baseSha], RAIZ);
  guardar(archivoRegistro(nombre, "trabajo.json"), { nombre, rama, baseRama, baseSha, tarea: o.tarea, fecha: new Date().toISOString() });

  const prompt = construirPromptDelegacion({ tarea: o.tarea, rama, base: `${baseRama} @ ${baseSha.slice(0, 8)}` });
  const salida = archivoRegistro(nombre, "respuesta.md");
  const { codigo } = codexExec({ cwd: dir, prompt, sandbox: "workspace-write", salida, modelo: o.modelo });
  if (codigo !== 0) console.error(`Codex terminó con código ${codigo}; se verifica igual lo que dejó.`);

  git(["add", "-A"], dir);
  const hayCambios = correr("git", ["diff", "--cached", "--quiet"], { cwd: dir, silencioso: true }).codigo !== 0;
  if (!hayCambios) { console.log("Codex no dejó cambios."); return 1; }
  git(["commit", "-m", `codex(${nombre}): ${o.tarea.split("\n")[0].slice(0, 60)}`, "-m", o.tarea], dir);

  const v = verificar(dir);
  guardar(archivoRegistro(nombre, "verificacion.json"), v);
  console.log(`\nCambios de Codex (rama ${rama}):`);
  console.log(git(["diff", "--stat", `${baseSha}..HEAD`], dir));
  console.log(`\nRespuesta de Codex: ${salida}`);
  console.log(`Siguiente: node scripts/agentes/codex.mjs revisar --nombre ${nombre}  y luego  integrar --nombre ${nombre}`);
  return v.ok ? 0 : 1;
}

// ---------- integrar ----------
function cmdIntegrar(o) {
  const nombre = validarNombre(o.nombre);
  const trabajo = leerJson(archivoRegistro(nombre, "trabajo.json"));
  if (!trabajo) throw new Error(`No hay trabajo «${nombre}».`);
  const rama = git(["branch", "--show-current"], RAIZ);
  if (git(["status", "--porcelain"], RAIZ) !== "") throw new Error("El checkout principal tiene cambios sin commit; guárdalos antes de integrar.");
  if (git(["status", "--porcelain"], carpetaTrabajo(nombre)) !== "") throw new Error("El worktree de Codex tiene cambios sin commit; verifica de nuevo.");
  const sha = git(["rev-parse", trabajo.rama], RAIZ);
  const archivos = git(["diff", "--name-only", `${trabajo.baseSha}..${sha}`], RAIZ).split("\n").filter(Boolean);
  const motivos = motivosParaNoIntegrar({
    rama,
    sha,
    verificacion: leerJson(archivoRegistro(nombre, "verificacion.json")),
    revision: leerJson(archivoRegistro(nombre, "revision.json")),
    sensibles: rutasSensibles(archivos),
    aceptarSensibles: o["acepto-sensibles"] === true
  });
  if (motivos.length) {
    console.error("No se integra:\n" + motivos.map((m) => "  - " + m).join("\n"));
    return 1;
  }
  git(["merge", "--no-ff", trabajo.rama, "-m", `Integra trabajo de Codex «${nombre}» (verificado y revisado)`], RAIZ);
  console.log(`Integrado ${trabajo.rama} en ${rama}. Verificando la rama completa…`);
  const v = verificar(RAIZ);
  guardar(archivoRegistro("_actual", "verificacion.json"), v);
  if (!v.ok) {
    console.error(`La rama ${rama} quedó ROJA tras integrar. Para deshacer: git reset --merge ORIG_HEAD (lo decide Claude).`);
    return 1;
  }
  git(["worktree", "remove", carpetaTrabajo(nombre)], RAIZ);
  git(["branch", "-d", trabajo.rama], RAIZ);
  console.log("Listo. Pega el resumen de verificación y de la revisión en la descripción del PR.");
  return 0;
}

function cmdEstado(o) {
  const nombre = o.nombre ? validarNombre(o.nombre) : "_actual";
  for (const tipo of ["trabajo.json", "verificacion.json", "revision.json"]) {
    const d = leerJson(archivoRegistro(nombre, tipo));
    console.log(`${tipo}: ${d ? JSON.stringify(d) : "—"}`);
  }
  return 0;
}

const comandos = { verificar: cmdVerificar, revisar: cmdRevisar, delegar: cmdDelegar, integrar: cmdIntegrar, estado: cmdEstado };
const [cmd, ...resto] = process.argv.slice(2);
if (!comandos[cmd]) {
  console.error(`Comando desconocido «${cmd ?? ""}». Usa: ${Object.keys(comandos).join(", ")}.`);
  process.exit(64);
}
try {
  process.exit(comandos[cmd](opciones(resto)));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
