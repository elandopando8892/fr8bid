// Cómo se presenta un evento en las listas (Hoy y Eventos): qué sigue, a quién
// le toca, en qué grupo cae y cómo se nombra sin repetir ocho rutas.
import type { EstadoEvento, ResumenEvento } from "../dominio/tipos";

export type Siguiente = { accion: string; quien: "Administrador" | "Carriers" | "—" };

// Igual que la página del evento: abierto con todas las ofertas dentro ya no
// espera a los carriers, le toca al Administrador cerrar.
export function siguiente(e: ResumenEvento): Siguiente {
  switch (e.estado) {
    case "borrador":
      return { accion: "Publicar e invitar", quien: "Administrador" };
    case "abierto":
      return e.participaciones > 0 && e.ofertas >= e.participaciones ? { accion: "Cerrar a ofertas", quien: "Administrador" } : { accion: "Esperar ofertas", quien: "Carriers" };
    case "cerrado":
      return { accion: "Adjudicar y entregar", quien: "Administrador" };
    case "adjudicado":
      return { accion: "Avisar a los carriers", quien: "Administrador" };
    default:
      return { accion: "—", quien: "—" };
  }
}

export const ESTADO_EVENTO: Record<EstadoEvento, { texto: string; tono: "" | "ok" | "warn" | "info" | "err" }> = {
  borrador: { texto: "Borrador", tono: "" },
  abierto: { texto: "Abierto", tono: "info" },
  cerrado: { texto: "Cerrado a ofertas", tono: "warn" },
  adjudicado: { texto: "Entregado", tono: "ok" },
  archivado: { texto: "Archivado", tono: "" }
};

// Un borrador cuyo plazo ya pasó no es trabajo de hoy: queda aparte.
export const borradorVencido = (e: ResumenEvento, hoy: string) => e.estado === "borrador" && !!e.plazo && e.plazo.slice(0, 10) < hoy;

// Lo urgente primero: adjudicar, cerrar, avisar y al final publicar. Dentro de
// cada grupo, el plazo más cercano; al adjudicar, el que cerró más reciente
// (sus ofertas siguen vigentes; uno cerrado hace meses no tapa al de esta
// semana, recorrido como Administrador 24-nov-2026).
const PRIORIDAD: Record<string, number> = { "Adjudicar y entregar": 0, "Cerrar a ofertas": 1, "Avisar a los carriers": 2, "Publicar e invitar": 3 };
export function porUrgencia(a: ResumenEvento, b: ResumenEvento) {
  const pa = PRIORIDAD[siguiente(a).accion] ?? 9;
  const pb = PRIORIDAD[siguiente(b).accion] ?? 9;
  if (pa !== pb) return pa - pb;
  if (pa === PRIORIDAD["Adjudicar y entregar"]) return (b.plazo || "").localeCompare(a.plazo || "");
  return (a.plazo || "9999").localeCompare(b.plazo || "9999");
}

export type Grupo = "te_toca" | "carriers" | "entregados" | "borradores_viejos" | "pruebas" | "todos";

export function grupoDe(e: ResumenEvento, hoy: string, esAdmin: boolean): Exclude<Grupo, "todos"> | null {
  if (e.prueba) return "pruebas";
  if (borradorVencido(e, hoy)) return "borradores_viejos";
  if (e.estado === "adjudicado") return "entregados";
  if (e.estado === "abierto" && siguiente(e).quien === "Carriers") return "carriers";
  if (esAdmin && siguiente(e).quien === "Administrador") return "te_toca";
  return null;
}

// «Monterrey, NL → Dallas, TX · Dry Van» → «Monterrey → Dallas».
const ciudad = (x: string) => x.split(",")[0].trim();
export function resumenRutas(rutas: string[]): string {
  const pares = rutas.map((r) => r.split(" · ")[0]).map((r) => r.split("→").map((x) => x.trim()));
  if (!pares.length) return "";
  if (pares.length === 1) return pares[0].join(" → ");
  const lista = (xs: string[]) => {
    const u = [...new Set(xs.map(ciudad))];
    return u.length > 2 ? `${u.slice(0, 2).join(", ")} +${u.length - 2}` : u.join(", ");
  };
  return `${lista(pares.map((p) => p[0] ?? ""))} → ${lista(pares.map((p) => p[1] ?? ""))}`;
}

// Nombres que Rateware deja a medias en los spots sin ruta («Spot — → — · …»).
// Es el mismo nombre en Hoy, en Eventos y en la página del evento.
export function nombreEvento(e: Pick<ResumenEvento, "nombre" | "shipper" | "folio">): string {
  const n = e.nombre.replace(/—\s*→\s*—/g, "ruta sin capturar").trim();
  if (!n || /^Spot\s+ruta sin capturar/i.test(n)) return e.shipper && e.shipper !== "—" ? `${e.shipper} · spot sin ruta` : n || e.folio;
  return n;
}

// Los eventos creados desde el chat llevan un UUID en el folio
// («FR8-ec3eecfc-8424-…»): se muestra solo su primer bloque.
export function folioCorto(folio: string): string {
  const m = /^(FR8-)?([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(folio.trim());
  return m ? `${m[1] ?? ""}${m[2].toUpperCase()}` : folio;
}

// El shipper como dato aparte, solo si hay uno y el nombre no lo dice ya.
export function shipperAparte(e: Pick<ResumenEvento, "nombre" | "shipper" | "folio">): string | null {
  const s = e.shipper?.trim();
  if (!s || s === "—") return null;
  return nombreEvento(e).toLowerCase().includes(s.toLowerCase()) ? null : s;
}

export function cuantasRutas(e: ResumenEvento): number {
  return e.rutas.length || e.numRutas || 0;
}

// Fila de Eventos (rediseño 25-nov): una frase de qué pasa y un solo botón.
export function quePasa(e: ResumenEvento, fecha: (iso: string | null) => string): string {
  const ofertas = `${e.ofertas.toLocaleString("es-MX")} ${e.ofertas === 1 ? "oferta" : "ofertas"}`;
  switch (e.estado) {
    case "borrador":
      return e.plazo ? `Sin publicar. Plazo ${fecha(e.plazo)}.` : "Sin publicar.";
    case "abierto":
      if (e.participaciones > 0 && e.ofertas >= e.participaciones) return `Llegaron las ${ofertas}. Ya puedes cerrar.`;
      return `${e.ofertas.toLocaleString("es-MX")} de ${e.participaciones.toLocaleString("es-MX")} ofertas · cierra ${fecha(e.plazo)}.`;
    case "cerrado":
      return e.ofertas ? `${ofertas} · cerró ${fecha(e.plazo)}. Elige primario y respaldo.` : `Cerró ${fecha(e.plazo)} sin ofertas.`;
    case "adjudicado":
      return "Entregado a Rateware. Falta avisar a los carriers.";
    default:
      return "Archivado.";
  }
}

export function botonFila(e: ResumenEvento): string {
  switch (siguiente(e).accion) {
    case "Publicar e invitar":
      return "Invitar";
    case "Cerrar a ofertas":
      return "Cerrar a ofertas";
    case "Esperar ofertas":
      return "Ver ofertas";
    case "Adjudicar y entregar":
      return "Adjudicar";
    case "Avisar a los carriers":
      return "Avisar";
    default:
      return "Abrir";
  }
}
