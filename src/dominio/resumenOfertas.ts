// Lo que la página del evento muestra arriba de las ofertas (recorrido del
// 22-nov): una fila por ruta y los avisos que hay que ver antes de adjudicar.
import { conOferta, primario, versionVigente } from "./recorrido";
import { nombreModelo } from "./modelo";
import type { Detalle, Participacion, Ruta } from "./tipos";

export interface FilaResumen {
  ruta: Ruta;
  ofertas: number;
  // Ofertas en otra moneda que la ruta: no se comparan contra las demás ni contra el objetivo.
  otraMoneda: number;
  masBaja: { p: Participacion; allIn: number; moneda: string; sinVigencia: boolean; vencida: boolean } | null;
  // Porcentaje contra el objetivo de la ruta, redondeado para mostrar.
  contraObjetivo: number | null;
  porArriba: boolean;
  primario: string | null;
}

// Contra el objetivo, redondeado como en la tabla de ofertas.
export const contraObjetivo = (allIn: number, objetivo: number | null) =>
  objetivo ? Math.round(((allIn - objetivo) / objetivo) * 100) : null;

// «Mejor» en verde solo si está en el objetivo o por debajo (sin redondear:
// 4,010 contra 4,000 ya está por arriba); sin objetivo, también. Una oferta en
// otra moneda que la ruta no se compara: nunca cuenta como dentro.
export const dentroDeObjetivo = (allIn: number, objetivo: number | null, moneda?: string, monedaRuta?: string) => {
  if (moneda && monedaRuta && moneda !== monedaRuta) return false;
  return !objetivo || allIn <= objetivo;
};

// Ofertas de una ruta para la tabla: primero las de la moneda de la ruta, de
// la más baja a la más alta; después las de otra moneda, agrupadas por moneda.
// Importes de monedas distintas nunca se ordenan entre sí.
export function ofertasOrdenadas(ruta: Ruta): Participacion[] {
  const v = (p: Participacion) => versionVigente(p)!;
  const grupo = (p: Participacion) => (v(p).moneda === ruta.moneda ? "" : v(p).moneda);
  return [...conOferta(ruta)].sort((a, b) => grupo(a).localeCompare(grupo(b)) || v(a).tarifaAllIn - v(b).tarifaAllIn);
}

// La «mejor» de la tabla: la más baja en la moneda de la ruta, solo si hay al
// menos otra en esa misma moneda con qué compararla.
export function masBajaComparable(ruta: Ruta): Participacion | null {
  const mismas = ofertasOrdenadas(ruta).filter((p) => versionVigente(p)!.moneda === ruta.moneda);
  return mismas.length > 1 ? mismas[0] : null;
}

// `hoy` (AAAA-MM-DD, America/Mexico_City) es el mismo que usa el candado I3.
export function resumenPorRuta(d: Detalle, hoy?: string): FilaResumen[] {
  return d.rutas.map((ruta) => {
    const todas = conOferta(ruta);
    // Solo se comparan importes en la moneda de la ruta.
    const filas = todas.filter((x) => versionVigente(x)!.moneda === ruta.moneda).sort((a, b) => versionVigente(a)!.tarifaAllIn - versionVigente(b)!.tarifaAllIn);
    const p = filas[0];
    const v = p ? versionVigente(p)! : null;
    const c = v ? contraObjetivo(v.tarifaAllIn, ruta.objetivo) : null;
    return {
      ruta,
      ofertas: todas.length,
      otraMoneda: todas.length - filas.length,
      masBaja: p && v ? { p, allIn: v.tarifaAllIn, moneda: v.moneda, sinVigencia: !v.vigenteHasta, vencida: !!(hoy && v.vigenteHasta && v.vigenteHasta < hoy) } : null,
      contraObjetivo: c,
      // Sin redondear: 4,010 contra 4,000 está por arriba aunque muestre «+0 %».
      porArriba: !!(v && ruta.objetivo && v.tarifaAllIn > ruta.objetivo),
      primario: primario(ruta)?.carrier ?? null
    };
  });
}

// Un carrier que cotiza con modelos comerciales distintos en el mismo evento
// (p. ej. Brokerage en unas rutas y Cost plus en otras): el precio de venta al
// shipper cambia según la ruta y conviene confirmarlo antes de adjudicar.
export interface ModeloMixto {
  carrier: string;
  modelos: { modelo: string; rutas: number[] }[];
}

export function modelosMixtos(d: Detalle): ModeloMixto[] {
  const porCarrier = new Map<string, { carrier: string; modelos: Map<string, number[]> }>();
  for (const ruta of d.rutas)
    for (const p of conOferta(ruta)) {
      const v = versionVigente(p)!;
      const x = porCarrier.get(p.carrierId) ?? { carrier: p.carrier, modelos: new Map<string, number[]>() };
      const modelo = String(v.modeloComercial);
      x.modelos.set(modelo, [...(x.modelos.get(modelo) ?? []), ruta.numero]);
      porCarrier.set(p.carrierId, x);
    }
  return [...porCarrier.values()]
    .filter((x) => x.modelos.size > 1)
    .map((x) => ({ carrier: x.carrier, modelos: [...x.modelos].map(([modelo, rutas]) => ({ modelo: nombreModelo(modelo), rutas: rutas.sort((a, b) => a - b) })) }))
    .sort((a, b) => a.carrier.localeCompare(b.carrier));
}

// «1–6» o «7, 8»: rutas consecutivas como rango.
export function rangoRutas(nums: number[]): string {
  const xs = [...new Set(nums)].sort((a, b) => a - b);
  const partes: string[] = [];
  for (let i = 0; i < xs.length; ) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
    partes.push(j - i >= 2 ? `${xs[i]}–${xs[j]}` : xs.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return partes.join(", ");
}
