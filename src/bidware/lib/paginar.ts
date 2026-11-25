// Listas largas (prioridad 7 del rediseño, 25-nov-2026): 25 filas por página en vez de pintar
// cientos de una vez. La página pedida se acomoda al total, así que un filtro nunca deja una vacía.
export const POR_PAGINA = 25;

export interface Pagina<T> {
  filas: T[];
  pagina: number;
  paginas: number;
  desde: number;
  hasta: number;
  total: number;
}

export function paginar<T>(filas: T[], pagina: number, por = POR_PAGINA): Pagina<T> {
  const total = filas.length;
  const paginas = Math.max(1, Math.ceil(total / por));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  const inicio = (p - 1) * por;
  return { filas: filas.slice(inicio, inicio + por), pagina: p, paginas, desde: total ? inicio + 1 : 0, hasta: Math.min(inicio + por, total), total };
}
