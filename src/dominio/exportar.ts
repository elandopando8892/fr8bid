// Comparativo por ruta para Excel. La versión completa es para el equipo; la
// anónima es para el shipper: sin nombres de carrier, sin modelo comercial ni
// porcentajes (margen Marksman), sin notas ni historial.

import { nombreModelo, porcentajeModelo } from "./modelo.js";
import { conOferta, revisarCondiciones, versionVigente } from "./recorrido.js";
import type { Detalle, Participacion, Ruta } from "./tipos.js";
import type { Celda, Hoja } from "./xlsx.js";

const letra = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

function ordenadas(ruta: Ruta): Participacion[] {
  return [...conOferta(ruta)].sort((a, b) => versionVigente(a)!.tarifaAllIn - versionVigente(b)!.tarifaAllIn);
}

function cumplimiento(ruta: Ruta, p: Participacion): string {
  if (ruta.condiciones.length) {
    const r = revisarCondiciones(ruta, p);
    return r.bloquean.length ? `No cumple: ${r.bloquean.join(", ")}` : `${r.cumplidas} de ${r.total}`;
  }
  const rubros = Object.values(p.rubros);
  if (rubros.includes("no_puedo")) return "No puede cumplir un rubro";
  return `${rubros.filter((x) => x === "de_acuerdo").length} de ${rubros.length}`;
}

export function hojaComparativo(d: Detalle, anonimo: boolean): Hoja {
  const encabezado: Celda[] = anonimo
    ? ["Ruta", "Origen", "Destino", "Equipo", "Volumen semanal", "Opción", "All-in", "Moneda", "Capacidad semanal", "Tránsito (días)", "Vigente hasta", "Cumplimiento"]
    : ["Ruta", "Origen", "Destino", "Equipo", "Volumen semanal", "Objetivo", "Lugar", "Carrier", "All-in", "Moneda", "Modelo comercial", "% del modelo", "Capacidad semanal", "Tránsito (días)", "Vigente hasta", "Versión", "Oferta final", "Cumplimiento", "Decisión"];
  const filas: Celda[][] = [encabezado];
  for (const ruta of d.rutas) {
    const base: Celda[] = [ruta.numero, ruta.origen, ruta.destino, ruta.equipo, ruta.volumenSemanal];
    const ofertas = ordenadas(ruta);
    if (!ofertas.length) filas.push([...base, ...(anonimo ? ["Sin ofertas"] : [ruta.objetivo, null, "Sin ofertas"])]);
    ofertas.forEach((p, i) => {
      const v = versionVigente(p)!;
      if (anonimo) {
        filas.push([...base, `Opción ${letra(i)}`, v.tarifaAllIn, v.moneda, v.capacidadSemanal, v.transitoDias, v.vigenteHasta, cumplimiento(ruta, p)]);
        return;
      }
      filas.push([
        ...base,
        ruta.objetivo,
        i + 1,
        p.carrier,
        v.tarifaAllIn,
        v.moneda,
        nombreModelo(String(v.modeloComercial)),
        porcentajeModelo(v).valor,
        v.capacidadSemanal,
        v.transitoDias,
        v.vigenteHasta,
        v.numero,
        v.esFinal ? "Sí" : "No",
        cumplimiento(ruta, p),
        p.rol ?? (ruta.desiertaMotivo ? "Ruta desierta" : null)
      ]);
    });
  }
  return { nombre: anonimo ? "Comparativo" : "Comparativo interno", filas };
}

export function nombreArchivo(d: Detalle, anonimo: boolean): string {
  const folio = d.evento.folio.replace(/[^\w-]+/g, "_");
  return `${folio}-comparativo${anonimo ? "-shipper" : "-interno"}.xlsx`;
}
