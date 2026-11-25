// Listas de carriers agrupadas por familia (prioridad 7 del rediseño, 25-nov-2026): «D2D Crossborder -
// Dry Van · Ampliada» se lee como familia «D2D Crossborder», equipo «Dry Van» y la marca «Ampliada».
// Así 38 filas casi iguales quedan en cinco grupos que se abren al elegir uno.

export const OTRAS = "Otras listas";

export interface PartesNombre {
  familia: string;
  equipo: string;
  ampliada: boolean;
}

export function partesNombre(nombre: string): PartesNombre {
  const limpio = String(nombre ?? "").trim();
  const ampliada = /\s*·\s*ampliada$/i.test(limpio);
  const base = limpio.replace(/\s*·\s*ampliada$/i, "").trim();
  const corte = base.indexOf(" - ");
  if (corte <= 0) return { familia: OTRAS, equipo: base, ampliada };
  return { familia: base.slice(0, corte).trim(), equipo: base.slice(corte + 3).trim(), ampliada };
}

export interface Familia<T> {
  nombre: string;
  listas: T[];
  equipos: string[];
}

// Familias en orden alfabético y «Otras listas» al final; dentro, por equipo y la base antes que la ampliada.
export function agruparPorFamilia<T>(filas: T[], nombreDe: (t: T) => string): Familia<T>[] {
  const grupos = new Map<string, { t: T; p: PartesNombre }[]>();
  for (const t of filas) {
    const p = partesNombre(nombreDe(t));
    const g = grupos.get(p.familia) ?? [];
    g.push({ t, p });
    grupos.set(p.familia, g);
  }
  const comparar = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });
  return [...grupos.entries()]
    .sort(([a], [b]) => (a === OTRAS ? 1 : b === OTRAS ? -1 : comparar(a, b)))
    .map(([nombre, g]) => {
      g.sort((x, y) => comparar(x.p.equipo, y.p.equipo) || Number(x.p.ampliada) - Number(y.p.ampliada));
      return { nombre, listas: g.map((x) => x.t), equipos: [...new Set(g.map((x) => x.p.equipo))] };
    });
}

// Notas de bitácora que se repiten en casi todas las listas («LISTA AMPLIADA creada el 25/10/2026 con
// OK de Jose.»): no dicen qué hay en la lista, así que en la tabla no se muestran; siguen en Historial.
export function esBitacora(texto: string | null | undefined): boolean {
  return /^\s*(lista ampliada|creada el|selecci[oó]n verificada|preselecci[oó]n|actualizaci[oó]n)/i.test(String(texto ?? ""));
}
