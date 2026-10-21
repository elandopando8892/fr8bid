// recorrido(): función pura que calcula los 11 pasos del evento, sus candados y
// el siguiente paso con su responsable. La Mesa del evento solo pinta lo que
// esta función decide; las pruebas del §9 se escriben contra ella.

import type { Aviso, Detalle, EntregaLocal, OfertaVersion, Participacion, Rol, Ruta } from "./tipos";

export type EstadoPaso = "hecho" | "actual" | "bloqueado" | "pendiente";
export type Quien = "Administrador" | "Operador" | "Carriers" | "Sistema" | "Nadie";

export interface Paso {
  n: number;
  clave: ClavePaso;
  titulo: string;
  estado: EstadoPaso;
  detalle: string;
  quien: Quien;
}

export type ClavePaso =
  | "necesidad"
  | "evento"
  | "carriers"
  | "invitacion"
  | "ofertas"
  | "comparar"
  | "cierre"
  | "adjudicar"
  | "entrega"
  | "aviso"
  | "loads";

export interface Candado {
  regla: string;
  ok: boolean;
  texto: string;
  // Un candado confirmable no bloquea si el Administrador lo confirma (D4).
  confirmable?: boolean;
}

export interface Contexto {
  rol: Rol;
  hoy: string; // AAAA-MM-DD en America/Mexico_City
  entrega: EntregaLocal;
}

export interface Recorrido {
  pasos: Paso[];
  actual: Paso | null;
  siguiente: { accion: string; quien: Quien; teToca: boolean };
  entregaConfirmada: boolean;
}

const TITULOS: Record<ClavePaso, string> = {
  necesidad: "Necesidad",
  evento: "Evento",
  carriers: "Carriers",
  invitacion: "Invitación",
  ofertas: "Ofertas",
  comparar: "Comparar",
  cierre: "Cierre a ofertas",
  adjudicar: "Adjudicar",
  entrega: "Entregar a Rateware",
  aviso: "Avisar al carrier",
  loads: "Visible en Loads"
};

export function hoyMexico(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(ahora);
}

export function versionVigente(p: Participacion): OfertaVersion | null {
  if (!p.versiones.length) return null;
  return p.versiones.reduce((a, b) => (b.numero > a.numero ? b : a));
}

export function activas(ruta: Ruta): Participacion[] {
  return ruta.participaciones.filter((p) => p.estado !== "excluida");
}

export function conOferta(ruta: Ruta): Participacion[] {
  return activas(ruta).filter((p) => p.estado !== "declino" && versionVigente(p));
}

export function primario(ruta: Ruta): Participacion | null {
  return ruta.participaciones.find((p) => p.rol === "primario") ?? null;
}

export function rutaDecidida(ruta: Ruta): boolean {
  return Boolean(ruta.desiertaMotivo) || Boolean(primario(ruta));
}

export function entregaConfirmada(detalle: Detalle, entrega: EntregaLocal): boolean {
  if (entrega.estado === "confirmada" || detalle.recibo) return true;
  // Tras recargar, la prueba del recibo es el propio Rateware: el evento queda
  // adjudicado y cada primario con rateware_closeout_at.
  const primarios = detalle.rutas.map(primario).filter(Boolean) as Participacion[];
  return detalle.evento.estado === "adjudicado" && primarios.length > 0 && primarios.every((p) => p.entregadaEn);
}

// Hay una versión posterior a la adjudicada (I2): la adjudicación no la sigue.
export function versionMasReciente(p: Participacion): OfertaVersion | null {
  const vigente = versionVigente(p);
  if (!p.adjudicada || !vigente) return null;
  return vigente.numero > p.adjudicada.numero ? vigente : null;
}

// I3, I4 y D4, a la vista antes de pulsar «Adjudicar».
export function candadosAdjudicacion(
  detalle: Detalle,
  ruta: Ruta,
  p: Participacion,
  ctx: Contexto,
  rol: "primario" | "respaldo" = "primario"
): Candado[] {
  const v = versionVigente(p);
  const prim = primario(ruta);
  const negativas = Object.entries(p.rubros).filter(([, e]) => e === "no_puedo").map(([k]) => k);
  const cerrado = detalle.evento.estado === "cerrado";
  const entregado = entregaConfirmada(detalle, ctx.entrega);
  const candados: Candado[] = [
    { regla: "I3", ok: cerrado, texto: cerrado ? "Evento cerrado a ofertas" : "El evento debe estar cerrado a ofertas" },
    { regla: "I3", ok: Boolean(v), texto: v ? `Versión vigente v${v.numero}` : "Sin oferta vigente" },
    {
      regla: "I3",
      ok: negativas.length === 0,
      texto: negativas.length ? `Rubro «no puedo»: ${negativas.join(", ")}` : "Ningún rubro «no puedo»"
    },
    { regla: "I3", ok: !p.carrierBloqueado, texto: p.carrierBloqueado ? "Carrier bloqueado en CRM" : "Carrier no bloqueado en CRM" },
    { regla: "I3", ok: ctx.rol === "admin", texto: ctx.rol === "admin" ? "Tu rol: Administrador" : "Solo el Administrador adjudica" },
    { regla: "I4", ok: !ruta.desiertaMotivo, texto: ruta.desiertaMotivo ? "La ruta está declarada desierta" : "Ruta no desierta" },
    { regla: "I5", ok: !entregado, texto: entregado ? "El evento ya se entregó a Rateware" : "Aún no entregado" }
  ];
  if (rol === "primario") {
    candados.push({
      regla: "I4",
      ok: !prim || prim.id === p.id,
      texto: prim && prim.id !== p.id ? `Ya hay primario: ${prim.carrier}` : "Sin otro primario vigente"
    });
  } else {
    candados.push({ regla: "I4", ok: Boolean(prim) && prim!.id !== p.id, texto: prim ? "Respaldo con primario de otro carrier" : "El respaldo requiere primario" });
  }
  if (v) {
    if (!v.vigenteHasta) {
      candados.push({ regla: "D4", ok: false, confirmable: true, texto: "Sin vigencia declarada: confirma para adjudicar" });
    } else {
      const vigente = v.vigenteHasta >= ctx.hoy;
      candados.push({ regla: "I3", ok: vigente, texto: vigente ? `Vigente hasta ${v.vigenteHasta}` : `Vencida el ${v.vigenteHasta}` });
    }
  }
  return candados;
}

export function puedeAdjudicar(candados: Candado[], confirmaVigencia: boolean): boolean {
  return candados.every((c) => c.ok || (c.confirmable && confirmaVigencia));
}

export function avisoDe(detalle: Detalle, participacionId: string, tipo: Aviso["tipo"]): Aviso | null {
  return detalle.avisos.find((a) => a.participacionId === participacionId && a.tipo === tipo) ?? null;
}

// I7 e I8: el aviso de adjudicación se envía solo con recibo y con la aprobación
// atada a la huella exacta del contenido.
export function candadosAviso(detalle: Detalle, aviso: Aviso, ctx: Contexto): Candado[] {
  const recibo = entregaConfirmada(detalle, ctx.entrega);
  return [
    { regla: "I8", ok: aviso.tipo !== "adjudicacion" || recibo, texto: recibo ? "Recibo de Rateware confirmado" : "Requiere el recibo de Rateware" },
    { regla: "I7", ok: aviso.estado === "aprobado" && aviso.aprobadoHuella === aviso.huella, texto: aviso.aprobadoHuella === aviso.huella && aviso.estado === "aprobado" ? "Texto exacto aprobado" : "Falta aprobar este texto exacto" },
    { regla: "I7", ok: aviso.estado !== "incierto", texto: aviso.estado === "incierto" ? "Envío incierto: conciliar antes de otro intento" : "Sin envío incierto" },
    { regla: "rol", ok: ctx.rol === "admin", texto: ctx.rol === "admin" ? "Tu rol: Administrador" : "Solo el Administrador aprueba avisos" }
  ];
}

function paso(clave: ClavePaso, n: number, estado: EstadoPaso, detalle: string, quien: Quien): Paso {
  return { n, clave, titulo: TITULOS[clave], estado, detalle, quien };
}

export function recorrido(detalle: Detalle, ctx: Contexto): Recorrido {
  const { evento, rutas } = detalle;
  const todas = rutas.flatMap(activas);
  const preseleccionadas = todas.filter((p) => p.estado === "preseleccionada");
  const respondieron = todas.filter((p) => versionVigente(p));
  const abierto = evento.estado === "abierto";
  const cerradoOMas = ["cerrado", "adjudicado", "archivado"].includes(evento.estado);
  const decididas = rutas.filter(rutaDecidida).length;
  const todasDecididas = rutas.length > 0 && decididas === rutas.length;
  const confirmada = entregaConfirmada(detalle, ctx.entrega);
  const primarios = rutas.map(primario).filter(Boolean) as Participacion[];
  const avisosAdj = primarios.map((p) => avisoDe(detalle, p.id, "adjudicacion"));
  const avisosAceptados = avisosAdj.filter((a) => a && a.estado === "aceptado").length;
  const visiblesLoads = primarios.filter((p) => p.entregadaEn).length;

  const pasos: Paso[] = [];
  pasos.push(paso("necesidad", 1, "hecho", `${evento.shipper} · manual`, "Operador"));
  pasos.push(
    paso("evento", 2, rutas.length ? "hecho" : "actual", rutas.length ? `${rutas.length} ruta(s)${evento.plazo ? ` · plazo ${evento.plazo}` : ""}` : "Agregar al menos una ruta", "Operador")
  );
  pasos.push(
    paso("carriers", 3, !rutas.length ? "pendiente" : todas.length ? "hecho" : "actual", todas.length ? `${todas.length} carrier(s)` : "Elegir carriers", "Operador")
  );
  const invitacionHecha = todas.length > 0 && preseleccionadas.length === 0 && evento.estado !== "borrador";
  pasos.push(
    paso(
      "invitacion",
      4,
      !todas.length ? "pendiente" : invitacionHecha ? "hecho" : "actual",
      invitacionHecha ? `${todas.length} invitación(es) aceptadas` : `${preseleccionadas.length} por aprobar y enviar`,
      "Administrador"
    )
  );
  // Todos respondieron o declinaron: ya no se espera a los carriers, toca cerrar.
  const sinPendientes = todas.every((p) => versionVigente(p) || p.estado === "declino");
  const ofertasEstado: EstadoPaso = !invitacionHecha ? "pendiente" : abierto && !sinPendientes ? "actual" : "hecho";
  pasos.push(paso("ofertas", 5, ofertasEstado, `${respondieron.length} de ${todas.length} respondieron`, "Carriers"));
  pasos.push(
    paso("comparar", 6, !invitacionHecha || !respondieron.length ? "pendiente" : cerradoOMas || sinPendientes ? "hecho" : "actual", "Comparativo por ruta", "Administrador")
  );
  pasos.push(
    paso(
      "cierre",
      7,
      cerradoOMas ? "hecho" : abierto && respondieron.length ? "actual" : "pendiente",
      cerradoOMas ? "Cerrado: la liga ya no acepta ofertas" : "Cerrar antes de adjudicar (mitigación C2)",
      "Administrador"
    )
  );
  pasos.push(
    paso(
      "adjudicar",
      8,
      todasDecididas ? "hecho" : evento.estado === "cerrado" ? "actual" : "bloqueado",
      todasDecididas ? primarios.map((p) => `${p.carrier} · v${p.adjudicada?.numero ?? "?"}`).join(", ") || "Rutas desiertas" : `${decididas} de ${rutas.length} rutas decididas`,
      "Administrador"
    )
  );
  const entregaDetalle: Record<string, string> = {
    sin_preparar: "Lista para preparar",
    preparada: "Preparada, sin escrituras externas",
    enviada: "Enviada, esperando recibo",
    confirmada: "Recibo confirmado · pending_review",
    rechazada: ctx.entrega.error || "Rechazada por Rateware",
    incierta: "Incierta: reintentar con la misma operación"
  };
  pasos.push(
    paso(
      "entrega",
      9,
      confirmada ? "hecho" : todasDecididas ? "actual" : "bloqueado",
      confirmada ? "Recibo confirmado · pending_review" : todasDecididas ? entregaDetalle[ctx.entrega.estado] : "Requiere adjudicación",
      "Administrador"
    )
  );
  const avisoHecho = primarios.length > 0 && avisosAceptados === primarios.length;
  pasos.push(
    paso("aviso", 10, avisoHecho ? "hecho" : confirmada && primarios.length ? "actual" : "bloqueado", avisoHecho ? "Aviso aceptado por Gmail" : confirmada ? "Aprobar el texto exacto" : "Requiere recibo", "Administrador")
  );
  const loadsHecho = primarios.length > 0 && visiblesLoads === primarios.length;
  pasos.push(
    paso("loads", 11, loadsHecho && confirmada ? "hecho" : confirmada ? "actual" : "bloqueado", loadsHecho && confirmada ? "Visible como «adjudicado» (L1)" : confirmada ? "Esperando a Loads" : "Requiere recibo", "Sistema")
  );

  if (evento.estado === "archivado") for (const p of pasos) if (p.estado !== "hecho") p.estado = "pendiente";

  const actual = pasos.find((p) => p.estado === "actual") ?? null;
  const siguiente = siguientePaso(actual, ctx.rol);
  return { pasos, actual, siguiente, entregaConfirmada: confirmada };
}

function siguientePaso(actual: Paso | null, rol: Rol): Recorrido["siguiente"] {
  if (!actual) return { accion: "Recorrido completo", quien: "Nadie", teToca: false };
  const acciones: Record<ClavePaso, string> = {
    necesidad: "Registrar la necesidad",
    evento: "Agregar rutas",
    carriers: "Elegir carriers",
    invitacion: "Aprobar invitaciones",
    ofertas: "Esperar ofertas",
    comparar: "Comparar ofertas",
    cierre: "Cerrar a ofertas",
    adjudicar: "Adjudicar",
    entrega: "Entregar a Rateware",
    aviso: "Aprobar aviso de adjudicación",
    loads: "Confirmar vista en Loads"
  };
  const teToca =
    (actual.quien === "Administrador" && rol === "admin") || (actual.quien === "Operador" && (rol === "operator" || rol === "admin"));
  return { accion: acciones[actual.clave], quien: actual.quien, teToca };
}
