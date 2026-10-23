// Lo que Jose sabe de cada carrier y que las tarifas de Rateware no dicen
// (decisiones del 23-oct-2026 para flatbed crossborder, al armar PRIMA). Una
// tarifa «Flatbed» no prueba que el carrier tenga plataformas: estas notas
// mandan sobre el historial. «descartado» no se sugiere; «aviso» se sugiere con
// la nota a la vista. Se compara contra el nombre y el dominio en minúsculas.

import type { FamiliaCaja } from "./segmento.js";

export type TipoNota = "descartado" | "aviso";

export interface NotaCarrier {
  patron: RegExp;
  familia: FamiliaCaja;
  tipo: TipoNota;
  nota: string;
}

const D = (patron: RegExp, nota: string): NotaCarrier => ({ patron, familia: "flatbed", tipo: "descartado", nota });
const A = (patron: RegExp, nota: string): NotaCarrier => ({ patron, familia: "flatbed", tipo: "aviso", nota });

export const FECHA_NOTAS = "2026-10-23";

export const NOTAS_CARRIER: NotaCarrier[] = [
  D(/aguirre ?express|aguirre express refrigerados/, "No tiene flatbeds."),
  D(/pan ?american express|panamex/, "Pura caja."),
  D(/autolineas vife|vife\.com/, "Pura caja."),
  D(/company express/, "Drayage en México."),
  D(/mec[aá]nica e ingenier/, "Drayage en México."),
  D(/maverick/, "Pura caja."),
  D(/\bta logistics|talogisticsusa/, "Pura caja."),
  D(/sti-laredo|super transport international/, "No usar."),
  D(/rockfort/, "No usar."),
  D(/warren ?transport/, "Pura caja."),
  D(/mu[nñ]oz trucking|munoztrucking/, "Usa broker."),
  D(/intra-solution|international trades? solution/, "Solo cajas."),
  D(/autotransportes ?ll\b|autotransportesll/, "Doméstico."),
  D(/muci[nñ]o/, "No incluir."),
  D(/db[- ]?xpress/, "No incluir."),
  D(/elilogistix/, "No incluir."),
  D(/unimex/, "Pura caja."),
  D(/grupo ?omega|fletes omega/, "Pura caja."),
  D(/sspgroup|ssp truck|gigg ?express|trans-?expert|bison ?transport|hunter ?express/, "Línea canadiense: no incluir."),
  D(/trata usa|wisecargo/, "No incluir."),
  D(/tnt[- ]?trucklines/, "No incluir."),
  D(/z ?a ?m logistics|zamlogistics/, "No incluir."),
  A(/martell/, "Sin disponibilidad por ahora."),
  A(/transcar/, "Sin disponibilidad por ahora."),
  A(/pgt ?trucking/, "Solo plataformas de 48', no de 53'."),
  A(/hefesto/, "No baja al Bajío: solo desde el Noreste y desde el interior de EE. UU."),
  A(/twins?\b|twin gonzalez/, "Solo desde el Noreste y desde el interior de EE. UU."),
  A(/fronterizos/, "Solo importación."),
  A(/savetransport|save transport/, "Planas de 48' y cajas de 53'."),
  A(/quiroga/, "Sin disponibilidad por el momento."),
  A(/saul salinas/, "«Puede ser»: confirmar."),
  A(/multitraslados|\bmtr\.mx/, "Fuera de la lista de PRIMA (decisión de Jose)."),
  A(/melton|autolineas california|vagabond|verde forwarding|los alamos/, "Por WhatsApp: sin capacidad o solo plataformas de 48'.")
];

export function notaDe(familia: FamiliaCaja, nombre: string, dominio = ""): NotaCarrier | null {
  const texto = `${nombre} ${dominio}`.toLowerCase();
  return NOTAS_CARRIER.find((n) => n.familia === familia && n.patron.test(texto)) || null;
}
