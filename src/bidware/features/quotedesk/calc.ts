import { tr } from "@/i18n/quotedesk";
import type { AccessorialLine, AccessorialUnit, MarkupMode } from "./quotedesk.service";

/**
 * Live preview of the pricing math. Mirrors calc.mjs in the quotedesk-api edge
 * function (rateware repo); the server recomputes on save and its numbers are
 * the ones stored, so any drift here only affects the preview.
 */

const UNITS: AccessorialUnit[] = ["hour", "event", "trip", "day", "mile", "other"];

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : Number(value);
  return Number.isFinite(n) ? n : null;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const round4 = (v: number) => Math.round((v + Number.EPSILON) * 10000) / 10000;

export function normalizeAccessorials(list: unknown): AccessorialLine[] {
  if (!Array.isArray(list)) return [];
  const lines: AccessorialLine[] = [];
  for (const raw of list.slice(0, 30)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label) continue;
    const quantity = toNumber(item.quantity);
    const rate = toNumber(item.rate);
    if (quantity === null || rate === null || quantity < 0 || rate < 0) continue;
    const unit = UNITS.includes(item.unit as AccessorialUnit) ? (item.unit as AccessorialUnit) : "other";
    lines.push({
      code: typeof item.code === "string" && item.code ? item.code : null,
      label,
      unit,
      quantity: round2(quantity),
      rate: round2(rate),
      subtotal: round2(quantity * rate),
    });
  }
  return lines;
}

export interface PricingInput {
  linehaul_mx?: unknown;
  linehaul_us?: unknown;
  fuel_amount?: unknown;
  border_amount?: unknown;
  carrier_rate?: unknown;
  accessorials?: unknown;
  markup_mode?: MarkupMode;
  markup_value?: unknown;
}

export interface PricingResult {
  base_cost: number | null;
  accessorials: AccessorialLine[];
  accessorials_total: number;
  cost_total: number;
  markup_amount: number | null;
  all_in_rate: number | null;
  margin_pct: number | null;
  /** Readable problem with the markup value, instead of throwing. */
  problem: string | null;
}

export function computeLane(input: PricingInput): PricingResult {
  const components = [input.linehaul_mx, input.linehaul_us, input.fuel_amount, input.border_amount, input.carrier_rate]
    .map(toNumber)
    .filter((v): v is number => v !== null);
  const negative = components.some((v) => v < 0);
  const base = components.length ? round2(components.reduce((a, b) => a + b, 0)) : null;
  const accessorials = normalizeAccessorials(input.accessorials);
  const accTotal = round2(accessorials.reduce((a, l) => a + l.subtotal, 0));
  const costTotal = round2((base ?? 0) + accTotal);
  const mode: MarkupMode = input.markup_mode ?? "percent_on_cost";
  const value = toNumber(input.markup_value);

  let problem: string | null = negative ? tr("text016") : null;
  if (value !== null && mode === "percent_on_cost" && (value <= -100 || value > 1000)) {
    problem = tr("text017");
  }
  if (value !== null && mode === "target_margin" && (value < 0 || value >= 100)) {
    problem = tr("text018");
  }

  let markup: number | null = null;
  let allIn: number | null = null;
  const hasCost = base !== null || accessorials.length > 0;
  if (hasCost && !problem) {
    if (value === null) markup = 0;
    else if (mode === "percent_on_cost") markup = round2((costTotal * value) / 100);
    else if (mode === "fixed_amount") markup = round2(value);
    else {
      allIn = round2(costTotal / (1 - value / 100));
      markup = round2(allIn - costTotal);
    }
    if (allIn === null) allIn = round2(costTotal + (markup ?? 0));
  }
  const marginPct = allIn !== null && allIn > 0 && markup !== null ? round4((markup / allIn) * 100) : null;
  return {
    base_cost: base,
    accessorials,
    accessorials_total: accTotal,
    cost_total: costTotal,
    markup_amount: markup,
    all_in_rate: allIn,
    margin_pct: marginPct,
    problem,
  };
}

/** US fuel surcharge for the US miles, in the quote's currency. */
export function suggestedFuel(usMiles: unknown, fscPerMile: unknown, currency: string, fxUsdMxn: unknown): number | null {
  const miles = toNumber(usMiles);
  const fsc = toNumber(fscPerMile);
  if (miles === null || fsc === null || miles <= 0 || fsc <= 0) return null;
  const usd = miles * fsc;
  if (currency === "MXN") {
    const fx = toNumber(fxUsdMxn);
    return fx && fx > 0 ? round2(usd * fx) : null;
  }
  return round2(usd);
}

export function pct(value: unknown): string {
  const n = toNumber(value);
  return n === null ? "—" : `${n.toFixed(1)}%`;
}
