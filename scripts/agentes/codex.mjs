#!/usr/bin/env node
// Arnés Claude Code + Codex. Uso (desde el checkout donde trabaja Claude):
//   node scripts/agentes/codex.mjs verificar [--nombre <slug> --revision <id> [--acepto-sensibles]]
//   node scripts/agentes/codex.mjs revisar   [--nombre <slug> | --base <rama>] [--enfoque "<texto>"]
//   node scripts/agentes/codex.mjs delegar   --nombre <slug> --tarea "<texto>" [--modelo <m>]
//   node scripts/agentes/codex.mjs integrar  --nombre <slug> [--acepto-sensibles]
//   node scripts/agentes/codex.mjs estado    [--nombre <slug>]
// Reglas y definición de terminado: AGENTS.md, sección «Arnés Claude + Codex».
// Estado local en .agentes/ del checkout principal (ignorado por git). CODEX_BIN cambia el ejecutable de Codex.

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  PASOS_VERIFICACION,
  codigoRevision,
  entornoVerificacion,
  argShell,
  construirPromptDelegacion,
  construirPromptRevision,
  leerVeredicto,
  motivosParaNoIntegrar,
  motivosRevision,
  ramaDeTrabajo,
  ramaPermitidaParaIntegrar,
  rutasSecretos,
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
function correr(comando, args, { cwd, input, silencioso = false, conShell = false, env } = {}) {
  const shell = conShell && WIN;
  const r = spawnSync(shell ? argShell(comando, true) : comando, shell ? args.map((a) => argShell(a, true)) : args, {
    cwd,
    env,
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

/** Rutas separadas por NUL (-z): sin comillas ni escapes, también con acentos. */
function lista(args, cwd) {
  const r = correr("git", args, { cwd, silencioso: true });
  if (r.codigo !== 0) throw new Error(`git ${args.join(" ")} falló:\n${r.error}`);
  return r.salida.split("\0").filter(Boolean);
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

function trabajoDeOrigen(nombre) {
  const trabajo = leerJson(archivoRegistro(nombre, "trabajo.json"));
  if (!trabajo) throw new Error(`No hay trabajo «${nombre}». Usa delegar primero.`);
  if (normal(trabajo.origen ?? "") !== normal(ORIGEN)) {
    throw new Error(`El trabajo «${nombre}» salió de ${trabajo.origen}; usa ese checkout.`);
  }
  return trabajo;
}

function archivosTrabajo(trabajo, sha) {
  return lista(["diff", "-z", "--no-renames", "--name-only", `${trabajo.baseSha}..${sha}`], ORIGEN);
}

/** Commit y limpieza (incluye archivos sin seguimiento no ignorados). */
function foto(dir) {
  // Con -v Git marca skip-worktree con S y assume-unchanged con minúsculas.
  // `git status` puede ocultar cambios en esas entradas incluso si HEAD no se mueve.
  if (lista(["ls-files", "-v", "-z"], dir).some((entrada) => /^[Sa-z] /.test(entrada))) {
    throw new Error("El índice contiene archivos con assume-unchanged o skip-worktree. Quita esas marcas antes de revisar, verificar o integrar.");
  }
  return {
    sha: git(["rev-parse", "HEAD"], dir),
    limpio: git(["status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none"], dir) === ""
  };
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
function verificar(dir, antes = foto(dir), revisionId) {
  const pasos = [];
  for (const p of PASOS_VERIFICACION) {
    if (revisionId) {
      const actual = foto(dir);
      if (!actual.limpio || actual.sha !== antes.sha) throw new Error("El código revisado cambió; vuelve a revisar antes de ejecutar pruebas.");
    }
    console.log(`\n▶ ${p.nombre}: ${p.comando} ${p.args.join(" ")}`);
    const t = Date.now();
    const { codigo } = correr(p.comando, p.args, {
      cwd: dir, conShell: true, env: entornoVerificacion(process.env)
    });
    pasos.push({ nombre: p.nombre, ok: codigo === 0, ms: Date.now() - t });
  }
  const despues = foto(dir);
  const limpio = antes.limpio && despues.limpio && antes.sha === despues.sha;
  const ok = pasos.every((p) => p.ok) && (!revisionId || limpio);
  const v = { sha: antes.sha, limpio, ok, pasos, revisionId, fecha: new Date().toISOString() };
  console.log("\nVerificación " + (ok ? "VERDE" : "ROJA") + ` en ${antes.sha.slice(0, 8)}${limpio ? "" : " (con cambios sin commit: no sirve para integrar)"}`);
  for (const p of pasos) console.log(`  ${p.ok ? "✓" : "✗"} ${p.nombre} (${Math.round(p.ms / 1000)} s)`);
  return v;
}

function cmdVerificar(o) {
  if (!o.nombre) {
    const v = verificar(ORIGEN);
    guardar(archivoRegistro(ACTUAL, "verificacion.json"), v);
    return v.ok ? 0 : 1;
  }
  const nombre = validarNombre(o.nombre);
  const trabajo = trabajoDeOrigen(nombre);
  const dir = carpetaTrabajo(nombre);
  const antes = foto(dir);
  const revision = leerJson(archivoRegistro(nombre, "revision.json"));
  const motivos = motivosRevision({ sha: antes.sha, base: trabajo.baseSha, revision });
  if (!antes.limpio) motivos.push("El worktree delegado tiene cambios sin commit.");
  if (typeof o.revision !== "string" || o.revision !== revision?.id) motivos.push("Lee la revisión y pasa su ID con --revision <id>.");
  const sensibles = rutasSensibles(archivosTrabajo(trabajo, antes.sha));
  if (sensibles.length && o["acepto-sensibles"] !== true) motivos.push(`Revisa las rutas sensibles (${sensibles.join(", ")}) y usa --acepto-sensibles.`);
  if (motivos.length) throw new Error("No se ejecutan pruebas:\n  - " + motivos.join("\n  - "));

  const recibo = archivoRegistro(nombre, "verificacion.json");
  rmSync(recibo, { force: true });
  const v = verificar(dir, antes, revision.id);
  guardar(recibo, v);
  return v.ok ? 0 : 1;
}

// ---------- revisar ----------
const OPCIONES_DIFF = ["--no-ext-diff", "--no-textconv"];

function exigirDiffSinSecretos(dir, revisiones, archivosNuevos = []) {
  // Consulta los nombres sin parches. Sin renombres, un .env borrado o movido
  // aparece con su ruta anterior y también se bloquea.
  const rutas = lista(["diff", ...OPCIONES_DIFF, "--no-renames", "--name-only", "-z", ...revisiones, "--"], dir);
  const secretos = rutasSecretos([...rutas, ...archivosNuevos]);
  if (secretos.length) {
    throw new Error(`Revisión detenida antes de construir el diff. Quita los archivos de entorno de la revisión: ${secretos.map((ruta) => JSON.stringify(ruta)).join(", ")}.`);
  }
  return rutas;
}

/** Diff del árbol de trabajo contra la base (para revisar antes de un PR, con o sin commit). */
function diffDelArbol(dir, base) {
  const mb = git(["merge-base", "HEAD", base], dir);
  const archivosNuevos = lista(["ls-files", "-z", "--others", "--exclude-standard"], dir);
  const rutas = exigirDiffSinSecretos(dir, [mb], archivosNuevos);
  // El árbol es mutable. Solo se comparan las rutas que pasaron la guarda.
  let diff = rutas.length ? git(["--literal-pathspecs", "diff", ...OPCIONES_DIFF, mb, "--", ...rutas], dir) : "";
  for (const f of archivosNuevos) {
    const r = correr("git", ["diff", ...OPCIONES_DIFF, "--no-index", "--", WIN ? "NUL" : "/dev/null", f], { cwd: dir, silencioso: true });
    if (r.codigo !== 1) throw new Error(`No pude armar el diff del archivo nuevo ${f}:\n${r.error}`); // 1 = hay diferencias
    diff += "\n" + r.salida;
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
    const trabajo = trabajoDeOrigen(nombre);
    rmSync(archivoRegistro(nombre, "revision.json"), { force: true });
    dir = carpetaTrabajo(nombre);
    f0 = antes();
    if (!f0.limpio) throw new Error("El worktree de Codex tiene cambios sin commit; no se revisa un estado que no se va a integrar.");
    base = trabajo.baseSha;
    if (correr("git", ["merge-base", "--is-ancestor", base, f0.sha], { cwd: dir, silencioso: true }).codigo !== 0) {
      throw new Error("El trabajo delegado ya no desciende de su base.");
    }
    exigirDiffSinSecretos(dir, [base, f0.sha]);
    diff = git(["diff", ...OPCIONES_DIFF, base, f0.sha, "--"], dir);
  } else {
    f0 = antes();
    diff = diffDelArbol(dir, base);
  }
  if (!diff.trim()) { console.log("No hay diff que revisar."); return 0; }
  const completo = diff.length <= LIMITE_DIFF;
  if (!completo) diff = diff.slice(0, LIMITE_DIFF) + "\n[diff truncado: esta revisión NO sirve para integrar]";

  const salida = archivoRegistro(nombre, "revision.md");
  mkdirSync(REGISTRO, { recursive: true });
  rmSync(salida, { force: true });
  const prompt = construirPromptRevision({ base, diff, enfoque: typeof o.enfoque === "string" ? o.enfoque : undefined });
  const { codigo, texto } = codexExec({ cwd: ORIGEN, prompt, sandbox: "read-only", salida, modelo: o.modelo });
  if (codigo !== 0) { console.error(`Codex terminó con código ${codigo}.`); return 1; }

  const f1 = foto(dir);
  if (f1.sha !== f0.sha || f1.limpio !== f0.limpio) throw new Error("El checkout cambió durante la revisión; repítela.");
  const veredicto = leerVeredicto(texto);
  const id = randomUUID();
  guardar(archivoRegistro(nombre, "revision.json"), { id, sha: f0.sha, limpio: f0.limpio, completo, base, veredicto, fecha: new Date().toISOString() });
  console.log(`\nRevisión de ${f0.sha.slice(0, 8)}${f0.limpio ? "" : " + cambios sin commit"}: ${veredicto}${completo ? "" : " (diff truncado)"}. Texto completo en ${salida}`);
  if (o.nombre && codigoRevision(veredicto, completo) === 0) console.log(`Después de leer el diff y los hallazgos: npm run agentes:verificar -- --nombre ${nombre} --revision ${id}`);
  return codigoRevision(veredicto, completo);
}

// ---------- delegar ----------
function cmdDelegar(o) {
  const nombre = validarNombre(o.nombre);
  if (typeof o.tarea !== "string") throw new Error('Falta --tarea "<qué debe hacer Codex>".');
  const rama = ramaDeTrabajo(nombre);
  const dir = carpetaTrabajo(nombre);
  if (existsSync(dir)) throw new Error(`Ya existe ${dir}. Integra o borra ese trabajo antes (git worktree remove).`);
  if (!foto(ORIGEN).limpio) throw new Error("Tu checkout tiene cambios sin commit (o archivos nuevos): haz commit antes de delegar, para que Codex parta de lo mismo que tú.");
  const baseRama = git(["branch", "--show-current"], ORIGEN);
  if (!ramaPermitidaParaIntegrar(baseRama)) throw new Error(`No se delega desde «${baseRama || "HEAD suelto"}»: trabaja en una rama propia (nunca main).`);
  const baseSha = git(["rev-parse", "HEAD"], ORIGEN);
  mkdirSync(dirname(dir), { recursive: true });
  git(["worktree", "add", "-b", rama, dir, baseSha], ORIGEN);
  guardar(archivoRegistro(nombre, "trabajo.json"), { nombre, rama, origen: ORIGEN, baseRama, baseSha, tarea: o.tarea, fecha: new Date().toISOString() });

  const prompt = construirPromptDelegacion({ tarea: o.tarea, rama, base: `${baseRama} @ ${baseSha.slice(0, 8)}` });
  const salida = archivoRegistro(nombre, "respuesta.md");
  const { codigo } = codexExec({ cwd: dir, prompt, sandbox: "workspace-write", salida, modelo: o.modelo });
  if (codigo !== 0) {
    console.error(`Codex terminó con código ${codigo}: el cierre es incierto. No se hace commit ni se verifica; mira ${dir} y ${salida}, y borra el trabajo (git worktree remove --force) o reintenta.`);
    return 1;
  }

  git(["add", "-A"], dir);
  const hayCambios = correr("git", ["diff", "--cached", "--quiet"], { cwd: dir, silencioso: true }).codigo !== 0;
  if (!hayCambios) { console.log("Codex no dejó cambios."); return 1; }
  const mensaje = archivoRegistro(nombre, "commit.txt");
  guardar(mensaje, `codex(${nombre}): ${o.tarea.split("\n")[0].slice(0, 60)}\n\n${o.tarea}\n`);
  git(["-c", "core.hooksPath=/dev/null", "commit", "-F", mensaje], dir);
  console.log(`\nCambios de Codex (rama ${rama}):`);
  console.log(git(["diff", "--stat", `${baseSha}..HEAD`], dir));
  console.log(`\nRespuesta de Codex: ${salida}`);
  console.log(`Siguiente: npm run agentes:revisar -- --nombre ${nombre}. Las pruebas esperan esa revisión.`);
  return 0;
}

// ---------- integrar ----------
function cmdIntegrar(o) {
  const nombre = validarNombre(o.nombre);
  const trabajo = trabajoDeOrigen(nombre);
  const rama = git(["branch", "--show-current"], ORIGEN);
  if (rama !== trabajo.baseRama) {
    throw new Error(`El trabajo «${nombre}» salió de la rama ${trabajo.baseRama}; estás en ${rama || "HEAD suelto"}. Cambia a esa rama para integrar.`);
  }
  if (correr("git", ["merge-base", "--is-ancestor", trabajo.baseSha, "HEAD"], { cwd: ORIGEN, silencioso: true }).codigo !== 0) {
    throw new Error(`${trabajo.baseRama} ya no contiene el commit del que partió Codex (${trabajo.baseSha.slice(0, 8)}); no se integra.`);
  }
  if (!foto(ORIGEN).limpio) throw new Error("Tu checkout tiene cambios sin commit o archivos nuevos; guárdalos antes de integrar.");
  const sha = git(["rev-parse", trabajo.rama], ORIGEN);
  const delegado = foto(carpetaTrabajo(nombre));
  if (!delegado.limpio || delegado.sha !== sha) throw new Error("El worktree delegado no coincide con su rama limpia; revisa y verifica de nuevo.");
  const motivos = motivosParaNoIntegrar({
    rama,
    sha,
    base: trabajo.baseSha,
    verificacion: leerJson(archivoRegistro(nombre, "verificacion.json")),
    revision: leerJson(archivoRegistro(nombre, "revision.json")),
    sensibles: rutasSensibles(archivosTrabajo(trabajo, sha)),
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
  if (!v.ok || !v.limpio) {
    console.error(`La rama ${rama} quedó ${v.ok ? "con archivos cambiados por la verificación" : "ROJA"} tras integrar. Para deshacer: git reset --merge ORIG_HEAD (lo decide Claude).`);
    return 1;
  }
  const retiro = correr("git", ["worktree", "remove", carpetaTrabajo(nombre)], { cwd: ORIGEN, silencioso: true });
  if (retiro.codigo === 0) git(["branch", "-d", trabajo.rama], ORIGEN);
  else console.log(`Se conserva el worktree ${carpetaTrabajo(nombre)} y su rama para revisar sus archivos locales antes de retirarlo.`);
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
  if (normal(ORIGEN).startsWith(normal(join(ESTADO, "trabajos")) + "/")) {
    throw new Error("Ejecuta el arnés desde el checkout de origen del trabajo delegado.");
  }
  process.exit(comandos[cmd](opciones(resto)));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
