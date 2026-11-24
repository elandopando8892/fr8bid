// Qué modelos comerciales acepta un evento RFx de sus carriers y con qué modelo
// queda una oferta cuando el carrier no elige (decisión de Jose, 23 y 24-nov-2026).
//
//   rfx_events.rfx_master_package.carrier_commercial_policy.accepted_models
//     = ["brokerage", "cost_plus", ...]   claves canónicas, en el orden de COMMERCIAL_MODEL_KEYS
//   ausente o vacío = el evento acepta todos.
//
// La política bloqueada ({ locked: true, model: "brokerage" }) se lee aquí como
// «acepta solo brokerage».
//
//   - Elegir modelo es opcional para el carrier. Sin elección y un solo modelo
//     aceptado = ese modelo. Sin elección y varios = la oferta conserva el que ya
//     tenía o ninguno («sin elegir»), y el equipo lo define antes de adjudicar.
//   - Un modelo que el evento no acepta se rechaza.
//
// Este archivo es el mismo módulo que decide en el servidor, con tipos:
// rateware `supabase/functions/_shared/accepted-commercial-models.mjs` (rateware
// #229). Los nombres se conservan para compararlos línea por línea; si una regla
// cambia allá, cambia aquí. Sin base de datos ni globales: funciones puras.

import type { ModeloComercial } from "./tipos.js";

export const COMMERCIAL_MODEL_KEYS: readonly ModeloComercial[] = Object.freeze(["brokerage", "cost_plus", "sell_share", "fee_plus"] as const);

// Los mismos alias que normalizeCommercialModel de rfx-bid-api y rateware-api.
const ALIASES: Readonly<Record<string, ModeloComercial>> = Object.freeze({
  direct: "cost_plus",
  direct_carrier: "cost_plus",
  direct_cost_plus: "cost_plus",
  cost_plus: "cost_plus",
  fee_plus: "fee_plus",
  carrier_share: "sell_share",
  shared_margin: "sell_share",
  share: "sell_share",
  sell_share: "sell_share",
  xbf: "brokerage",
  buy_sell: "brokerage",
  xbf_buy_sell: "brokerage",
  brokerage: "brokerage"
});

// La opción única «costo + margen» del portal del carrier: vale por cost_plus y
// por fee_plus; el equipo los distingue, el carrier no.
const DIRECT_ALIASES = new Set(["direct", "direct_carrier", "direct_cost_plus"]);

type Objeto = Record<string, any>;
const object = (value: unknown): Objeto => (value && typeof value === "object" && !Array.isArray(value) ? (value as Objeto) : {});
const relation = (value: unknown): Objeto => (Array.isArray(value) ? object(value[0]) : object(value));
const slug = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const ordered = (models: readonly unknown[]) => COMMERCIAL_MODEL_KEYS.filter((key) => models.includes(key));

// Dónde puede venir el paquete del evento: la fila del evento, una invitación
// con su rfx_events o su event, o el paquete mismo.
function policies(value: unknown): Objeto[] {
  const row = object(value);
  const event = object(row.event);
  const related = relation(row.rfx_events);
  return [row, object(row.rfx_master_package), event, related, object(event.rfx_master_package), object(related.rfx_master_package)].map((candidate) =>
    object(candidate.carrier_commercial_policy)
  );
}

/** La política bloqueada de Rateware: el evento opera solo en XBF compra-venta. */
export function lockedBrokerage(value: unknown): boolean {
  return policies(value).some((policy) => policy.locked === true && policy.model === "brokerage");
}

/** Clave canónica (brokerage, cost_plus, sell_share, fee_plus) de cualquier alias, o null. */
export function canonicalCommercialModel(value: unknown): ModeloComercial | null {
  const key = slug(value);
  return key && Object.hasOwn(ALIASES, key) ? ALIASES[key] : null;
}

/**
 * Los modelos que acepta el evento, o null si acepta todos. Recibe la fila del
 * evento, una invitación con su evento o el paquete maestro.
 */
export function acceptedCommercialModels(value: unknown): ModeloComercial[] | null {
  if (lockedBrokerage(value)) return ["brokerage"];
  for (const policy of policies(value)) {
    const list = policy.accepted_models;
    if (!Array.isArray(list)) continue;
    const models = ordered(list.map(canonicalCommercialModel).filter(Boolean));
    if (models.length) return models.length === COMMERCIAL_MODEL_KEYS.length ? null : models;
  }
  return null;
}

type Rechazo = { error: string; code: string; status: number; accepted_models?: ModeloComercial[] | null };

/**
 * El ajuste como llega a create_rfx_event / update_rfx_event. null, [] o los
 * cuatro modelos = se aceptan todos (se guarda como ausente).
 */
export function parseAcceptedCommercialModels(input: unknown): { models: ModeloComercial[] | null } | { error: string; code: string } {
  if (input === null) return { models: null };
  const invalid = {
    error: `accepted_commercial_models must be a list of: ${COMMERCIAL_MODEL_KEYS.join(", ")} (empty or null accepts all).`,
    code: "ACCEPTED_COMMERCIAL_MODELS_INVALID"
  };
  if (!Array.isArray(input)) return invalid;
  const keys = input.map(slug);
  if (keys.some((key) => !(COMMERCIAL_MODEL_KEYS as readonly string[]).includes(key))) return invalid;
  const models = ordered(keys);
  return { models: models.length && models.length < COMMERCIAL_MODEL_KEYS.length ? models : null };
}

/** Una copia del paquete maestro con el ajuste escrito (o quitado, con null). Nada más cambia. */
export function withAcceptedCommercialModels(masterPackage: unknown, models: readonly string[] | null): Objeto {
  const pack = { ...object(masterPackage) };
  const policy = { ...object(pack.carrier_commercial_policy) };
  if (Array.isArray(models) && models.length) policy.accepted_models = ordered(models);
  else delete policy.accepted_models;
  if (Object.keys(policy).length) pack.carrier_commercial_policy = policy;
  else delete pack.carrier_commercial_policy;
  return pack;
}

/** Lo que lee el carrier, con las palabras de su Bid Room. */
const CARRIER_LABELS: Record<"es" | "en", Record<ModeloComercial, string>> = {
  es: { brokerage: "XBF compra-venta", cost_plus: "Costo + margen", fee_plus: "Costo + margen", sell_share: "Carrier comparte facturación" },
  en: { brokerage: "XBF buy-sell", cost_plus: "Cost + margin", fee_plus: "Cost + margin", sell_share: "Carrier shares billing" }
};

function carrierLabels(models: readonly ModeloComercial[], language: unknown): string {
  const labels = CARRIER_LABELS[language === "es" ? "es" : "en"];
  return [...new Set(models.map((model) => labels[model]))].join(", ");
}

/**
 * El modelo con el que se guarda la oferta de un carrier.
 *
 *   requested: lo que mandó el carrier (cualquier alias) o nada si no eligió
 *   current:   el modelo que la oferta tiene hoy
 *   accepted:  acceptedCommercialModels(evento)
 *   language:  "es" para mensajes en español; cualquier otro, inglés
 *
 * Devuelve { model, chosen }, con model null para «sin elegir», o el rechazo.
 */
export function resolveCarrierCommercialModel(
  requested: unknown,
  current: unknown,
  accepted: readonly ModeloComercial[] | null,
  language?: unknown
): { model: ModeloComercial | null; chosen: boolean } | Rechazo {
  const es = slug(language) === "es";
  const list = Array.isArray(accepted) && accepted.length ? (accepted as ModeloComercial[]) : null;
  const allows = (model: ModeloComercial) => !list || list.includes(model);
  const currentModel = canonicalCommercialModel(current);
  const key = slug(requested);

  if (!key) {
    if (list && list.length === 1) return { model: list[0], chosen: false };
    return { model: currentModel && allows(currentModel) ? currentModel : null, chosen: false };
  }

  const canonical = canonicalCommercialModel(key);
  if (!canonical) {
    return { error: es ? "El modelo comercial no es válido." : "The commercial model is not valid.", code: "COMMERCIAL_MODEL_INVALID", status: 400 };
  }

  // Los clientes viejos mandan «costo + margen» también para ofertas Fee-Plus:
  // se conserva Fee-Plus cuando la oferta lo tiene y el evento lo acepta.
  const direct: ModeloComercial[] = currentModel === "fee_plus" ? ["fee_plus", "cost_plus"] : ["cost_plus", "fee_plus"];
  const model = DIRECT_ALIASES.has(key) ? direct.find(allows) || null : allows(canonical) ? canonical : null;
  if (!model) {
    const labels = carrierLabels(list || [], es ? "es" : "en");
    return {
      error: es ? `Este evento no acepta ese modelo comercial. Acepta: ${labels}.` : `This event does not accept that commercial model. It accepts: ${labels}.`,
      code: "COMMERCIAL_MODEL_NOT_ACCEPTED",
      status: 409,
      accepted_models: list
    };
  }
  return { model, chosen: true };
}

/**
 * El modelo con el que cuenta una oferta: el suyo, o el del evento cuando el
 * evento acepta uno solo. null = «sin elegir»: el equipo lo define antes de adjudicar.
 */
export function effectiveCommercialModel(stored: unknown, accepted: readonly ModeloComercial[] | null | undefined): ModeloComercial | null {
  const own = canonicalCommercialModel(stored);
  if (own) return own;
  return Array.isArray(accepted) && accepted.length === 1 ? accepted[0] : null;
}

/**
 * El modelo que se guarda en una oferta que el equipo captura sin nombrar uno:
 * el del evento, cuando acepta uno solo y la oferta no tiene ninguno. Si no,
 * null (la oferta queda como está). Recibe la participación con su evento.
 */
export function capturedCommercialModel(named: unknown, participation: unknown): ModeloComercial | null {
  if (canonicalCommercialModel(named) || canonicalCommercialModel(object(participation).commercial_model)) return null;
  return effectiveCommercialModel(null, acceptedCommercialModels(participation));
}

/**
 * El modelo que el equipo define en una oferta que ya existe
 * (set_rfx_bid_commercial_model): solo las cuatro claves canónicas y solo un
 * modelo que el evento acepta.
 */
export function teamDefinedCommercialModel(requested: unknown, participation: unknown): { model: ModeloComercial } | Rechazo {
  const model = slug(requested) as ModeloComercial;
  if (!COMMERCIAL_MODEL_KEYS.includes(model)) {
    return { error: `El modelo comercial no es válido: usa ${COMMERCIAL_MODEL_KEYS.join(", ")}.`, code: "COMMERCIAL_MODEL_INVALID", status: 400 };
  }
  const accepted = acceptedCommercialModels(participation);
  if (accepted && !accepted.includes(model)) {
    return {
      error: `Este evento no acepta ese modelo comercial. Acepta: ${accepted.join(", ")}.`,
      code: "COMMERCIAL_MODEL_NOT_ACCEPTED",
      status: 409,
      accepted_models: accepted
    };
  }
  return { model };
}

/**
 * Las tres columnas comerciales de una oferta para un modelo: se limpia el
 * porcentaje que no es del modelo (sell_share usa el share del carrier; los
 * otros tres, el margen MARKSMAN).
 */
export function commercialTermsPatch(model: string, marginPct?: number | null, sharePct?: number | null) {
  const share = model === "sell_share";
  return {
    commercial_model: model,
    marksman_margin_pct: share ? null : marginPct ?? null,
    carrier_share_pct: share ? sharePct ?? null : null
  };
}

/**
 * Cuerpo del 409 cuando los modelos aceptados del evento ya no pueden cambiar;
 * si pueden, null. Cambiarlos tras una adjudicación cambiaría con qué modelo
 * cuenta una oferta adjudicada sin modelo, así que se detiene en la primera.
 */
export function acceptedCommercialModelsChangeDenial(event: unknown, hasAwards: boolean): { error: string; code: string; action: string } | null {
  const refuse = (error: string, code: string) => ({ error, code, action: "update_rfx_event" });
  if (lockedBrokerage(event)) {
    return refuse("Este evento opera únicamente en XBF compra-venta: sus modelos comerciales no se cambian.", "COMMERCIAL_MODEL_LOCKED");
  }
  const status = slug(object(event).status);
  if (!["draft", "open"].includes(status)) {
    return refuse("Los modelos comerciales que acepta el evento solo se cambian mientras está en borrador o abierto.", "RFX_EVENT_NOT_OPEN");
  }
  if (hasAwards) {
    return refuse("El evento ya tiene adjudicaciones: los modelos comerciales que acepta ya no se cambian.", "RFX_EVENT_HAS_AWARDS");
  }
  return null;
}
