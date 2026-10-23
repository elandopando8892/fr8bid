// Modelo comercial de la oferta (caso Nexos: 1 650 con sell share 3 % se leyó
// como 1 700). El all-in es la tarifa del carrier y es lo que se compara; el
// porcentaje del modelo se muestra al lado y nunca lo modifica.
//
// rfx-bid-api: sell_share usa carrier_share_pct («Carrier invoice share»);
// cost_plus, fee_plus y brokerage usan marksman_margin_pct («Suggested margin»,
// markup en brokerage).
//
// La tarifa de venta al shipper sigue el «Board price» de Rateware
// (bidCommercialEconomics en src/rfx-events.js): cost_plus y fee_plus suman el
// margen al all-in (3 % si viene vacío), brokerage suma el markup (12 % si viene
// vacío) y sell_share conserva el all-in, porque el share se le cobra al carrier
// después del pago del cliente.

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

const POR_DEFECTO: Record<string, number> = { cost_plus: 3, fee_plus: 3, brokerage: 12, sell_share: 3 };

export type Venta = { venta: number; ingreso: number; pct: number; porDefecto: boolean };

const centavos = (n: number) => Math.round(n * 100) / 100;

export function tarifaVenta(v: Comercial & Pick<OfertaVersion, "tarifaAllIn">): Venta {
  const modelo = String(v.modeloComercial);
  const declarado = porcentajeModelo(v).valor;
  const pct = declarado ?? POR_DEFECTO[modelo] ?? POR_DEFECTO.cost_plus;
  if (modelo === "sell_share") return { venta: v.tarifaAllIn, ingreso: centavos((v.tarifaAllIn * pct) / 100), pct, porDefecto: declarado === null };
  const venta = centavos(v.tarifaAllIn * (1 + pct / 100));
  return { venta, ingreso: centavos(venta - v.tarifaAllIn), pct, porDefecto: declarado === null };
}
