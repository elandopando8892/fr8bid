#!/usr/bin/env node
// Arnés Claude Code + Codex. Uso (desde el checkout donde trabaja Claude):
//   node scripts/agentes/codex.mjs verificar [--nombre <slug>]
//   node scripts/agentes/codex.mjs revisar   [--nombre <slug> | --base <rama>] [--enfoque "<texto>"]
//   node scripts/agentes/codex.mjs delegar   --nombre <slug> --tarea "<texto>" [--modelo <m>]
//   node scripts/agentes/codex.mjs integrar  --nombre <slug> [--acepto-sensibles]
//   node scripts/agentes/codex.mjs estado    [--nombre <slug>]
// Reglas y definición de terminado: AGENTS.md, sección «Arnés Claude + Codex».
// Estado local en .agentes/ del checkout principal (ignorado por git). CODEX_BIN cambia el ejecutable de Codex.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  PASOS_VERIFICACION,
  argShell,
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

/**
 * git corre siempre sin shell. npm, npx y codex en Windows son lanzadores .cmd/.ps1 que necesitan
 * shell: sus argumentos pasan por argShell (sin metacaracteres) y el texto libre va por stdin.
 */
function correr(comando, args, { cwd, input, silencioso = false, conShell = false } = {}) {
  const shell = conShell && WIN;
  const r = spawnSync(shell ? argShell(comando, true) : comando, shell ? args.map((a) => argShell(a, true)) : args, {
    cwd,
    input,
    encoding: "utf8",
    shell,
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

const normal = (p) => resolve(p).replace(/\\/g, "/").toLowerCase();
// ORIGEN: el checkout desde donde se llama (puede ser un worktree de Claude). Ahí se delega e integra.
const ORIGEN = resolve(git(["rev-parse", "--show-toplevel"], process.cwd()));
// COMUN: el checkout principal; guarda el estado compartido de los trabajos.
const COMUN = dirname(resolve(git(["rev-parse", "--path-format=absolute", "--git-common-dir"], process.cwd())));
const ESTADO = join(COMUN, ".agentes");
const REGISTRO = join(ESTADO, "registro");
const carpetaTrabajo = (nombre) => join(ESTADO, "trabajos", nombre);
const archivoRegistro = (nombre, tipo) => join(REGISTRO, `${nombre}.${tipo}`);
const ACTUAL = "_actual-" + createHash("sha1").update(normal(ORIGEN)).digest("hex").slice(0, 8);

function guardar(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, typeof datos === "string" ? datos : JSON.stringify(datos, null, 2) + "\n");
}
const leerJson = (ruta) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null);

/** Commit y limpieza (incluye archivos sin seguimiento no ignorados). */
function foto(dir) {
  return { sha: git(["rev-parse", "HEAD"], dir), limpio: git(["status", "--porcelain"], dir) === "" };
}

function exigirCodex() {
  const r = correr(CODEX, ["--version"], { silencioso: true, conShell: true });
  if (r.codigo !== 0) {
    throw new Error("No encuentro Codex CLI. Instala con `npm i -g @openai/codex` y entra con `codex login` (o CODEX_BIN=<ruta>).");
  }
}

function codexExec({ cwd, prompt, sandbox, salida, modelo }) {
  exigirCodex();
  if (modelo !== undefined && !/^[\w.:-]+$/.test(String(modelo))) throw new Error(`Modelo inválido: ${modelo}`);
  const args = [
    "exec",
    "--cd", cwd,
    "--sandbox", sandbox,
    "-c", "approval_policy=never",
    "-c", "sandbox_workspace_write.network_access=false",
    "--output-last-message", salida
  ];
  if (modelo) args.push("--model", String(modelo));
  args.push("-");
  const r = correr(CODEX, args, { cwd, input: prompt, conShell: true });
  return { codigo: r.codigo, texto: existsSync(salida) ? readFileSync(salida, "utf8") : "" };
}

// ---------- verificar ----------
function verificar(dir) {
  const antes = foto(dir);
  const pasos = [];
  for (const p of PASOS_VERIFICACION) {
    console.log(`\n▶ ${p.nombre}: ${p.comando} ${p.args.join(" ")}`);
    const t = Date.now();
    const { codigo } = correr(p.comando, p.args, { cwd: dir, conShell: true });
    pasos.push({ nombre: p.nombre, ok: codigo === 0, ms: Date.now() - t });
  }
  const despues = foto(dir);
  const limpio = antes.limpio && despues.limpio && antes.sha === despues.sha;
  const ok = pasos.every((p) => p.ok);
  const v = { sha: antes.sha, limpio, ok, pasos, fecha: new Date().toISOString() };
  console.log("\nVerificación " + (ok ? "VERDE" : "ROJA") + ` en ${antes.sha.slice(0, 8)}${limpio ? "" : " (con cambios sin commit: no sirve para integrar)"}`);
  for (const p of pasos) console.log(`  ${p.ok ? "✓" : "✗"} ${p.nombre} (${Math.round(p.ms / 1000)} s)`);
  return v;
}

function cmdVerificar(o) {
  const nombre = o.nombre ? validarNombre(o.nombre) : ACTUAL;
  const dir = o.nombre ? carpetaTrabajo(nombre) : ORIGEN;
  const v = verificar(dir);
  guardar(archivoRegistro(nombre, "verificacion.json"), v);
  return v.ok ? 0 : 1;
}

// ---------- revisar ----------
/** Diff del árbol de trabajo contra la base (para revisar antes de un PR, con o sin commit). */
function diffDelArbol(dir, base) {
  const mb = git(["merge-base", "HEAD", base], dir);
  let diff = git(["diff", mb], dir);
  for (const f of git(["ls-files", "--others", "--exclude-standard"], dir).split("\n").filter(Boolean)) {
    diff += "\n" + correr("git", ["diff", "--no-index", "--", WIN ? "NUL" : "/dev/null", f], { cwd: dir, silencioso: true }).salida;
  }
  return diff;
}

function cmdRevisar(o) {
  const nombre = o.nombre ? validarNombre(o.nombre) : ACTUAL;
  let dir = ORIGEN;
  let base = typeof o.base === "string" ? o.base : "main";
  let diff;
  const antes = () => foto(dir);
  let f0;
  if (o.nombre) {
    const trabajo = leerJson(archivoRegistro(nombre, "trabajo.json"));
    if (!trabajo) throw new Error(`No hay trabajo «${nombre}». Usa delegar primero.`);
    dir = carpetaTrabajo(nombre);
    f0 = antes();
    if (!f0.limpio) throw new Error("El worktree de Codex tiene cambios sin commit; no se revisa un estado que no se va a integrar.");
    base = trabajo.baseSha;
    diff = git(["diff", base, f0.sha], dir); // solo lo que está en commits
  } else {
    f0 = antes();
    diff = diffDelArbol(dir, base);
  }
  if (!diff.trim()) { console.log("No hay diff que revisar."); return 0; }
  const completo = diff.length <= LIMITE_DIFF;
  if (!completo) diff = diff.slice(0, LIMITE_DIFF) + "\n[diff truncado: esta revisión NO sirve para integrar]";

  const salida = archivoRegistro(nombre, "revision.md");
  mkdirSync(REGISTRO, { recursive: true });
  const prompt = construirPromptRevision({ base, diff, enfoque: typeof o.enfoque === "string" ? o.enfoque : undefined });
  const { codigo, texto } = codexExec({ cwd: dir, prompt, sandbox: "read-only", salida, modelo: o.modelo });
  if (codigo !== 0) { console.error(`Codex terminó con código ${codigo}.`); return 1; }

  const f1 = foto(dir);
  if (f1.sha !== f0.sha || f1.limpio !== f0.limpio) throw new Error("El checkout cambió durante la revisión; repítela.");
  const veredicto = leerVeredicto(texto);
  guardar(archivoRegistro(nombre, "revision.json"), { sha: f0.sha, limpio: f0.limpio, completo, base, veredicto, fecha: new Date().toISOString() });
  console.log(`\nRevisión de ${f0.sha.slice(0, 8)}${f0.limpio ? "" : " + cambios sin commit"}: ${veredicto}${completo ? "" : " (diff truncado)"}. Texto completo en ${salida}`);
  return veredicto === "BLOQUEA" ? 2 : 0;
}

// ---------- delegar ----------
function cmdDelegar(o) {
  const nombre = validarNombre(o.nombre);
  if (typeof o.tarea !== "string") throw new Error('Falta --tarea "<qué debe hacer Codex>".');
  const rama = ramaDeTrabajo(nombre);
  const dir = carpetaTrabajo(nombre);
  if (existsSync(dir)) throw new Error(`Ya existe ${dir}. Integra o borra ese trabajo antes (git worktree remove).`);
  const baseRama = git(["branch", "--show-current"], ORIGEN) || "HEAD";
  const baseSha = git(["rev-parse", "HEAD"], ORIGEN);
  mkdirSync(dirname(dir), { recursive: true });
  git(["worktree", "add", "-b", rama, dir, baseSha], ORIGEN);
  guardar(archivoRegistro(nombre, "trabajo.json"), { nombre, rama, origen: ORIGEN, baseRama, baseSha, tarea: o.tarea, fecha: new Date().toISOString() });

  const prompt = construirPromptDelegacion({ tarea: o.tarea, rama, base: `${baseRama} @ ${baseSha.slice(0, 8)}` });
  const salida = archivoRegistro(nombre, "respuesta.md");
  const { codigo } = codexExec({ cwd: dir, prompt, sandbox: "workspace-write", salida, modelo: o.modelo });
  if (codigo !== 0) console.error(`Codex terminó con código ${codigo}; se verifica igual lo que dejó.`);

  git(["add", "-A"], dir);
  const hayCambios = correr("git", ["diff", "--cached", "--quiet"], { cwd: dir, silencioso: true }).codigo !== 0;
  if (!hayCambios) { console.log("Codex no dejó cambios."); return 1; }
  const mensaje = archivoRegistro(nombre, "commit.txt");
  guardar(mensaje, `codex(${nombre}): ${o.tarea.split("\n")[0].slice(0, 60)}\n\n${o.tarea}\n`);
  git(["commit", "-F", mensaje], dir);

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
  if (normal(trabajo.origen ?? "") !== normal(ORIGEN)) {
    throw new Error(`El trabajo «${nombre}» salió de ${trabajo.origen}; intégralo desde ese checkout, no desde ${ORIGEN}.`);
  }
  const rama = git(["branch", "--show-current"], ORIGEN);
  if (git(["status", "--porcelain", "--untracked-files=no"], ORIGEN) !== "") throw new Error("Tu checkout tiene cambios sin commit; guárdalos antes de integrar.");
  const sha = git(["rev-parse", trabajo.rama], ORIGEN);
  if (!foto(carpetaTrabajo(nombre)).limpio) throw new Error("El worktree de Codex tiene cambios sin commit; verifica y revisa de nuevo.");
  const archivos = git(["diff", "--name-only", `${trabajo.baseSha}..${sha}`], ORIGEN).split("\n").filter(Boolean);
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
  git(["merge", "--no-ff", sha, "-m", `Integra trabajo de Codex ${nombre} (verificado y revisado)`], ORIGEN);
  console.log(`Integrado ${trabajo.rama} (${sha.slice(0, 8)}) en ${rama}. Verificando la rama completa…`);
  const v = verificar(ORIGEN);
  guardar(archivoRegistro(ACTUAL, "verificacion.json"), v);
  if (!v.ok) {
    console.error(`La rama ${rama} quedó ROJA tras integrar. Para deshacer: git reset --merge ORIG_HEAD (lo decide Claude).`);
    return 1;
  }
  git(["worktree", "remove", carpetaTrabajo(nombre)], ORIGEN);
  git(["branch", "-d", trabajo.rama], ORIGEN);
  console.log("Listo. Pega el resumen de verificación y de la revisión en la descripción del PR.");
  return 0;
}

function cmdEstado(o) {
  const nombre = o.nombre ? validarNombre(o.nombre) : ACTUAL;
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
