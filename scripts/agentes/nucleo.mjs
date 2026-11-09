// Partes puras del arnés Claude + Codex (sin procesos ni disco), para poder probarlas.

/** Pasos de la verificación, en orden. Los mismos que corre el CI. */
export const PASOS_VERIFICACION = [
  { nombre: "typecheck", comando: "npm", args: ["run", "typecheck"] },
  { nombre: "pruebas", comando: "npm", args: ["test"] },
  { nombre: "pruebas-bidware", comando: "npm", args: ["run", "test:bidware"] },
  { nombre: "build", comando: "npx", args: ["vite", "build"] }
];

const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9-]{1,47}$/;

/** El nombre de un trabajo delegado se usa en ramas y carpetas: solo minúsculas, dígitos y guiones. */
export function validarNombre(nombre) {
  if (typeof nombre !== "string" || !NOMBRE_VALIDO.test(nombre)) {
    throw new Error(`Nombre inválido «${nombre}»: usa 2 a 48 caracteres a-z, 0-9 y guiones.`);
  }
  return nombre;
}

export const ramaDeTrabajo = (nombre) => `codex/${validarNombre(nombre)}`;

/** Ramas a las que el arnés nunca integra: producción es main y todo entra por PR. */
export function ramaPermitidaParaIntegrar(rama) {
  return !!rama && rama !== "HEAD" && rama !== "main" && rama !== "master";
}

/** Archivos que un trabajo delegado no debe tocar sin que Claude lo revise a mano. */
const RUTAS_SENSIBLES = [
  /^\.env(?!\.example$)/,
  /^\.claude\/settings(\.local)?\.json$/,
  /^\.codex\//,
  /^\.github\/workflows\//,
  /^vercel\.json$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^src\/servidor\//,
  /^api\//
];

export function rutasSensibles(archivos) {
  return archivos.filter((a) => RUTAS_SENSIBLES.some((r) => r.test(a.replace(/\\/g, "/"))));
}

export function construirPromptDelegacion({ tarea, rama, base }) {
  if (!tarea || !tarea.trim()) throw new Error("Falta la tarea.");
  return [
    "Eres Codex trabajando como DELEGADO de Claude Code en el repositorio fr8bid.",
    "Lee AGENTS.md antes de empezar; sus reglas y límites mandan sobre esta tarea.",
    "",
    `Rama de trabajo: ${rama} (sale de ${base}). Ya estás dentro de su worktree.`,
    "",
    "TAREA:",
    tarea.trim(),
    "",
    "REGLAS DE ESTA SESIÓN:",
    "- Cambia solo lo necesario para la tarea; nada fuera de este directorio.",
    "- No hagas commit, push, merge ni despliegues: el arnés hace el commit.",
    "- No leas .env ni secretos. No tienes red.",
    "- Si la tarea pide algo de la lista de límites de AGENTS.md, no lo hagas: explícalo en PENDIENTE.",
    "- Agrega o ajusta pruebas cuando cambies comportamiento.",
    "- Antes de terminar corre `npm run typecheck` y `npm test` y reporta el resultado REAL.",
    "",
    "Termina tu respuesta exactamente con estas secciones:",
    "RESUMEN: <qué hiciste, 1-3 líneas>",
    "ARCHIVOS: <lista de archivos cambiados>",
    "PRUEBAS: <comando → resultado, uno por línea>",
    "PENDIENTE: <lo que no hiciste o dudas; «nada» si no hay>"
  ].join("\n");
}

export function construirPromptRevision({ base, diff, enfoque }) {
  return [
    "Eres Codex como REVISOR ESCÉPTICO del diff de Claude Code en el repositorio fr8bid.",
    "Lee AGENTS.md. Tu trabajo es encontrar por qué este cambio NO debería entrar.",
    "",
    "Busca, en este orden:",
    "1. Errores de lógica, casos borde, regresiones y estados imposibles.",
    "2. Violaciones de AGENTS.md: escrituras reales sin candado, despliegues, secretos, adjudicar/avisar fuera de la página del evento, HDships.",
    "3. Pruebas que faltan o que pasan sin probar nada.",
    "4. Seguridad: tokens en respuestas o logs, entradas sin validar en api/ o src/servidor/.",
    enfoque ? `\nEnfoque pedido por Claude: ${enfoque}` : "",
    "",
    "No cambies archivos. No inventes: cita archivo:línea para cada hallazgo; si no estás seguro, dilo.",
    "",
    "Formato de salida:",
    "HALLAZGOS:",
    "- [ALTA|MEDIA|BAJA] archivo:línea — problema — cómo falla — arreglo sugerido",
    "(o «- ninguno»)",
    "VEREDICTO: BLOQUEA | CON_CAMBIOS | APROBADO",
    "",
    `Diff contra ${base}:`,
    diff
  ].join("\n");
}

/** Lee el veredicto de la última línea «VEREDICTO:». Sin veredicto claro = BLOQUEA. */
export function leerVeredicto(texto) {
  const lineas = String(texto ?? "").match(/^\s*VEREDICTO:\s*([A-Z_]+)/gm);
  if (!lineas) return "BLOQUEA";
  const v = lineas[lineas.length - 1].replace(/^\s*VEREDICTO:\s*/, "").trim();
  return v === "APROBADO" || v === "CON_CAMBIOS" ? v : "BLOQUEA";
}

/**
 * Argumento para un comando que en Windows corre con shell (npm, npx y los lanzadores .cmd de Codex).
 * Rechaza metacaracteres de cmd.exe y entrecomilla los que llevan espacios. Los textos libres
 * (la tarea, el diff) nunca van como argumento: van por stdin o por archivo.
 */
export function argShell(arg, win) {
  const a = String(arg);
  if (!win) return a;
  if (/[&|<>^%"!\r\n`]/.test(a)) throw new Error(`Argumento no permitido para la línea de comandos de Windows: ${a}`);
  return /\s/.test(a) ? `"${a}"` : a;
}

const VEREDICTOS_QUE_PASAN = ["APROBADO", "CON_CAMBIOS"];

/**
 * Definición de terminado para integrar un trabajo delegado.
 * Devuelve la lista de motivos por los que NO se puede integrar (vacía = se puede).
 * Un registro incompleto o raro cuenta como ausente: el candado falla cerrado.
 */
export function motivosParaNoIntegrar({ rama, sha, verificacion, revision, sensibles = [], aceptarSensibles = false }) {
  const motivos = [];
  if (!ramaPermitidaParaIntegrar(rama)) motivos.push(`La rama actual «${rama}» no admite integraciones: todo entra por PR.`);

  if (!verificacion || typeof verificacion !== "object") motivos.push("No hay verificación del trabajo.");
  else {
    if (verificacion.sha !== sha) motivos.push("La verificación es de otro commit; vuelve a verificar.");
    if (verificacion.limpio !== true) motivos.push("La verificación se hizo con cambios sin commit.");
    const pasos = Array.isArray(verificacion.pasos) ? verificacion.pasos : [];
    const fallidos = PASOS_VERIFICACION.map((p) => p.nombre).filter(
      (n) => !pasos.some((r) => r && r.nombre === n && r.ok === true)
    );
    if (fallidos.length || verificacion.ok !== true) {
      motivos.push(`La verificación no pasó completa: ${fallidos.join(", ") || "ok=false"}.`);
    }
  }

  if (!revision || typeof revision !== "object") motivos.push("No hay revisión de diff del trabajo (agentes:revisar --nombre).");
  else {
    if (revision.sha !== sha) motivos.push("La revisión es de otro commit; vuelve a revisar.");
    if (revision.limpio !== true) motivos.push("La revisión se hizo con cambios sin commit.");
    if (revision.completo !== true) motivos.push("La revisión no cubrió el diff completo; parte la tarea en trabajos más chicos.");
    if (!VEREDICTOS_QUE_PASAN.includes(revision.veredicto)) motivos.push(`La revisión dio ${revision.veredicto ?? "sin veredicto"}.`);
  }

  if (sensibles.length && !aceptarSensibles) {
    motivos.push(`Toca rutas sensibles (${sensibles.join(", ")}); revísalas a mano y repite con --acepto-sensibles.`);
  }
  return motivos;
}
