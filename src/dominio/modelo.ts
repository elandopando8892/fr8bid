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

//
// El modelo es opcional para el carrier y el evento dice cuáles acepta (decisión
// de Jose, 23 y 24-nov-2026). Una oferta sin modelo cuenta con el del evento
// cuando el evento acepta uno solo; si acepta varios queda «sin elegir», sin
// tarifa de venta, hasta que el equipo lo define. Las reglas son las del
// servidor (./modelosAceptados.ts, el mismo módulo de Rateware con tipos).

import { acceptedCommercialModels, COMMERCIAL_MODEL_KEYS, effectiveCommercialModel, lockedBrokerage } from "./modelosAceptados.js";
import type { ModeloComercial, OfertaVersion } from "./tipos.js";

// En el orden en que Rateware los guarda.
export const MODELOS: readonly ModeloComercial[] = COMMERCIAL_MODEL_KEYS;

const NOMBRE: Record<string, string> = {
  cost_plus: "Cost plus",
  fee_plus: "Fee plus",
  sell_share: "Sell share",
  brokerage: "Brokerage (buy/sell)"
};

export const SIN_ELEGIR = "Sin elegir";

type Comercial = Pick<OfertaVersion, "modeloComercial" | "carrierSharePct" | "margenPct"> & Pick<Partial<OfertaVersion>, "modeloDelEvento">;

// Modelos que el evento acepta de sus carriers, a partir de su paquete maestro.
// null: los acepta todos.
export function modelosAceptados(paqueteMaestro: unknown): ModeloComercial[] | null {
  return acceptedCommercialModels(paqueteMaestro);
}

// La política bloqueada (solo XBF compra-venta) se pone en Rateware y no se edita aquí.
export function modelosBloqueados(paqueteMaestro: unknown): boolean {
  return lockedBrokerage(paqueteMaestro);
}

// El modelo con el que cuenta una oferta: el suyo o el único que acepta el evento.
export function modeloEfectivo(guardado: unknown, aceptados: readonly ModeloComercial[] | null | undefined): ModeloComercial | null {
  return effectiveCommercialModel(guardado, aceptados ?? null);
}

// Lo que la liga del carrier ofrece y envía. El modelo vigente de su oferta, si
// el evento lo acepta, no se puede quitar: Rateware lo conserva cuando no llega
// otro, así que «Sin elegir» solo se ofrece a quien no tiene uno. Un modelo que
// el evento retiró se nombra para avisarlo antes de reenviar.
export function eleccionModeloCarrier(
  guardado: unknown,
  enFormulario: unknown,
  aceptados: readonly ModeloComercial[] | null | undefined
): { modelos: readonly ModeloComercial[]; propio: ModeloComercial | null; elegido: ModeloComercial | null; puedeNoElegir: boolean; retirado: string | null } {
  const modelos = aceptados && aceptados.length ? aceptados : MODELOS;
  const enLista = (m: unknown): m is ModeloComercial => modelos.includes(m as ModeloComercial);
  const propio = enLista(guardado) ? guardado : null;
  return {
    modelos,
    propio,
    elegido: enLista(enFormulario) ? enFormulario : propio,
    puedeNoElegir: modelos.length > 1 && !propio,
    retirado: guardado && !propio ? String(guardado) : null
  };
}

// Captura del equipo: qué modelo viaja con la versión nueva. Solo el que el
// equipo indicó (o al que le escribió porcentaje): sin indicar, Rateware deja
// la oferta con el suyo, le pone el único del evento o la deja «sin elegir».
// La excepción es el evento de un solo modelo con una oferta que tiene otro:
// el formulario muestra el del evento, así que viaja ese y `reemplaza` nombra
// el que se va, para avisarlo antes de guardar.
export function modeloDeCaptura(
  aceptados: readonly ModeloComercial[] | null | undefined,
  indicado: ModeloComercial | "",
  conPorcentaje: boolean,
  propio: string | null
): { modelo: ModeloComercial | null; reemplaza: string | null } {
  const modelos = aceptados && aceptados.length ? aceptados : MODELOS;
  if (modelos.length > 1) return { modelo: indicado || null, reemplaza: null };
  const unico = modelos[0];
  const reemplaza = propio && propio !== unico ? propio : null;
  return { modelo: conPorcentaje || reemplaza ? unico : null, reemplaza };
}

export function aceptaModelo(aceptados: readonly string[] | null | undefined, modelo: string | null): boolean {
  return !modelo || !aceptados || aceptados.includes(modelo);
}

// «Brokerage (buy/sell) y Cost plus», o «todos» cuando no hay ajuste.
export function textoModelosAceptados(aceptados: readonly string[] | null | undefined): string {
  if (!aceptados || !aceptados.length) return "todos";
  const nombres = aceptados.map(nombreModelo);
  return nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
}

export function nombreModelo(modelo: string | null | undefined): string {
  if (!modelo) return SIN_ELEGIR;
  return NOMBRE[modelo] ?? modelo;
}

// Familia que ve el shipper: todo lo que no es compra-venta (brokerage) es
// Managed Transportation (decisión de Jose, 23-oct-2026).
export function familiaModelo(modelo: string): "Brokerage" | "Managed Transportation" {
  return modelo === "brokerage" ? "Brokerage" : "Managed Transportation";
}

export function modeloConFamilia(modelo: string | null | undefined): string {
  if (!modelo) return SIN_ELEGIR;
  return modelo === "brokerage" ? "Brokerage (compra-venta)" : `Managed Transportation · ${nombreModelo(modelo)}`;
}

export function porcentajeModelo(v: Comercial): { etiqueta: string; valor: number | null } {
  if (!v.modeloComercial) return { etiqueta: "porcentaje", valor: null };
  if (v.modeloComercial === "sell_share") return { etiqueta: "share del carrier", valor: v.carrierSharePct };
  if (v.modeloComercial === "brokerage") return { etiqueta: "markup", valor: v.margenPct };
  return { etiqueta: "margen Marksman", valor: v.margenPct };
}

const pct = (n: number | null) => (n === null ? "sin indicar" : `${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })} %`);

export function describirModelo(v: Comercial): string {
  if (!v.modeloComercial) return "Modelo comercial sin elegir";
  const p = porcentajeModelo(v);
  return `${modeloConFamilia(v.modeloComercial)} · ${p.etiqueta} ${pct(p.valor)}${v.modeloDelEvento ? " · modelo del evento" : ""}`;
}

// Qué cambió entre dos versiones, en palabras: all-in, modelo y porcentaje.
export function cambiosComerciales(antes: OfertaVersion, despues: OfertaVersion): string[] {
  const cambios: string[] = [];
  if (antes.tarifaAllIn !== despues.tarifaAllIn || antes.moneda !== despues.moneda)
    cambios.push(`all-in ${antes.tarifaAllIn.toLocaleString("es-MX")} ${antes.moneda} → ${despues.tarifaAllIn.toLocaleString("es-MX")} ${despues.moneda}`);
  if (antes.modeloComercial !== despues.modeloComercial)
    cambios.push(`modelo ${nombreModelo(antes.modeloComercial)} → ${nombreModelo(despues.modeloComercial)}`);
  const a = porcentajeModelo(antes);
  const d = porcentajeModelo(despues);
  if (a.valor !== d.valor || a.etiqueta !== d.etiqueta) cambios.push(`${d.etiqueta} ${pct(a.etiqueta === d.etiqueta ? a.valor : null)} → ${pct(d.valor)}`);
  return cambios;
}

const POR_DEFECTO: Record<string, number> = { cost_plus: 3, fee_plus: 3, brokerage: 12, sell_share: 3 };

export type Venta = { venta: number; ingreso: number; pct: number; porDefecto: boolean };

const centavos = (n: number) => Math.round(n * 100) / 100;

// null: la oferta no tiene modelo («sin elegir») y su venta no se puede calcular
// todavía; nunca se inventa con un modelo por defecto.
export function tarifaVenta(v: Comercial & Pick<OfertaVersion, "tarifaAllIn">): Venta | null {
  if (!v.modeloComercial) return null;
  const modelo = String(v.modeloComercial);
  const declarado = porcentajeModelo(v).valor;
  const pct = declarado ?? POR_DEFECTO[modelo] ?? POR_DEFECTO.cost_plus;
  if (modelo === "sell_share") return { venta: v.tarifaAllIn, ingreso: centavos((v.tarifaAllIn * pct) / 100), pct, porDefecto: declarado === null };
  const venta = centavos(v.tarifaAllIn * (1 + pct / 100));
  return { venta, ingreso: centavos(venta - v.tarifaAllIn), pct, porDefecto: declarado === null };
}

// Versión corta para la tabla: «Fee plus · 3 %»; la larga va en el title.
export function modeloCorto(v: Comercial): string {
  if (!v.modeloComercial) return SIN_ELEGIR;
  const p = porcentajeModelo(v);
  return `${nombreModelo(v.modeloComercial)} · ${pct(p.valor)}`;
}
