// Modelo comercial de la oferta (caso Nexos: 1 650 con sell share 3 % se leyó
// como 1 700). El all-in es la tarifa del carrier y es lo que se compara; el
// porcentaje del modelo se muestra al lado y nunca lo modifica.
//
// rfx-bid-api: sell_share usa carrier_share_pct («Carrier invoice share»);
// cost_plus, fee_plus y brokerage usan marksman_margin_pct («Suggested margin»,
// markup en brokerage).

import type { OfertaVersion } from "./tipos.js";

const NOMBRE: Record<string, string> = {
  cost_plus: "Cost plus",
  fee_plus: "Fee plus",
  sell_share: "Sell share",
  brokerage: "Brokerage (buy/sell)"
};

type Comercial = Pick<OfertaVersion, "modeloComercial" | "carrierSharePct" | "margenPct">;

export function nombreModelo(modelo: string): string {
  return NOMBRE[modelo] ?? modelo;
}

export function porcentajeModelo(v: Comercial): { etiqueta: string; valor: number | null } {
  if (v.modeloComercial === "sell_share") return { etiqueta: "share del carrier", valor: v.carrierSharePct };
  if (v.modeloComercial === "brokerage") return { etiqueta: "markup", valor: v.margenPct };
  return { etiqueta: "margen Marksman", valor: v.margenPct };
}

const pct = (n: number | null) => (n === null ? "sin indicar" : `${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })} %`);

export function describirModelo(v: Comercial): string {
  const p = porcentajeModelo(v);
  return `${nombreModelo(String(v.modeloComercial))} · ${p.etiqueta} ${pct(p.valor)}`;
}

// Qué cambió entre dos versiones, en palabras: all-in, modelo y porcentaje.
export function cambiosComerciales(antes: OfertaVersion, despues: OfertaVersion): string[] {
  const cambios: string[] = [];
  if (antes.tarifaAllIn !== despues.tarifaAllIn || antes.moneda !== despues.moneda)
    cambios.push(`all-in ${antes.tarifaAllIn.toLocaleString("es-MX")} ${antes.moneda} → ${despues.tarifaAllIn.toLocaleString("es-MX")} ${despues.moneda}`);
  if (antes.modeloComercial !== despues.modeloComercial)
    cambios.push(`modelo ${nombreModelo(String(antes.modeloComercial))} → ${nombreModelo(String(despues.modeloComercial))}`);
  const a = porcentajeModelo(antes);
  const d = porcentajeModelo(despues);
  if (a.valor !== d.valor || a.etiqueta !== d.etiqueta) cambios.push(`${d.etiqueta} ${pct(a.etiqueta === d.etiqueta ? a.valor : null)} → ${pct(d.valor)}`);
  return cambios;
}
