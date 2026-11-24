// Qué modelos comerciales acepta un evento y con qué modelo cuenta una oferta
// cuando el carrier no elige (decisión 4 del recorrido, 23 y 24-nov-2026).
// Son los mismos casos que prueban el módulo del servidor en rateware
// (tests/accepted-commercial-models.test.mjs, rateware #229): si una regla cambia
// allá, cambian aquí el módulo y esta prueba.
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  COMMERCIAL_MODEL_KEYS,
  acceptedCommercialModels,
  acceptedCommercialModelsChangeDenial,
  capturedCommercialModel,
  commercialTermsPatch,
  effectiveCommercialModel,
  lockedBrokerage,
  parseAcceptedCommercialModels,
  resolveCarrierCommercialModel,
  teamDefinedCommercialModel,
  withAcceptedCommercialModels
} from "../src/dominio/modelosAceptados";

const eventWith = (models: unknown, extra = {}) => ({
  id: "event-1", status: "open",
  rfx_master_package: { carrier_commercial_policy: { accepted_models: models } },
  ...extra,
});
const LOCKED = { id: "event-2", status: "open", rfx_master_package: { carrier_commercial_policy: { locked: true, model: "brokerage" } } };
// El rechazo (código, estado y lista) de una respuesta que puede ser el modelo o el rechazo.
const no = (x: unknown) => x as { code?: string; status?: number; error?: string; accepted_models?: string[] };

test("an event without the setting accepts every model", () => {
  assert.equal(acceptedCommercialModels({}), null);
  assert.equal(acceptedCommercialModels({ rfx_master_package: {} }), null);
  assert.equal(acceptedCommercialModels(eventWith([])), null);
  assert.equal(acceptedCommercialModels(eventWith(["nope"])), null);
  assert.equal(acceptedCommercialModels(eventWith([...COMMERCIAL_MODEL_KEYS])), null);
  assert.equal(acceptedCommercialModels(null), null);
});

test("the setting is read from the event, an invitation or the package, in canonical order", () => {
  assert.deepEqual(acceptedCommercialModels(eventWith(["cost_plus", "brokerage"])), ["brokerage", "cost_plus"]);
  assert.deepEqual(acceptedCommercialModels({ rfx_event_id: "event-1", rfx_events: eventWith(["sell_share"]) }), ["sell_share"]);
  assert.deepEqual(acceptedCommercialModels({ rfx_events: [eventWith(["fee_plus"])] }), ["fee_plus"]);
  assert.deepEqual(acceptedCommercialModels({ carrier_commercial_policy: { accepted_models: ["xbf_buy_sell", "brokerage"] } }), ["brokerage"]);
});

test("a locked event accepts brokerage alone, whatever else its policy says", () => {
  assert.deepEqual(acceptedCommercialModels(LOCKED), ["brokerage"]);
  const both = { rfx_master_package: { carrier_commercial_policy: { locked: true, model: "brokerage", accepted_models: ["cost_plus"] } } };
  assert.deepEqual(acceptedCommercialModels(both), ["brokerage"]);
});

test("the setting accepts only the four keys; empty, null or all four mean every model", () => {
  assert.deepEqual(parseAcceptedCommercialModels(["cost_plus", "brokerage", "cost_plus"]), { models: ["brokerage", "cost_plus"] });
  assert.deepEqual(parseAcceptedCommercialModels(["Fee-Plus"]), { models: ["fee_plus"] });
  assert.deepEqual(parseAcceptedCommercialModels([]), { models: null });
  assert.deepEqual(parseAcceptedCommercialModels(null), { models: null });
  assert.deepEqual(parseAcceptedCommercialModels([...COMMERCIAL_MODEL_KEYS]), { models: null });
  for (const bad of ["brokerage", { brokerage: true }, ["brokerage", "xbf"], ["direct_cost_plus"], [""], [null], 3]) {
    assert.equal(no(parseAcceptedCommercialModels(bad)).code, "ACCEPTED_COMMERCIAL_MODELS_INVALID", JSON.stringify(bad));
  }
});

test("writing the setting keeps the rest of the package, and removing it leaves no trace", () => {
  const pack = { segments: [{ key: "a" }], carrier_commercial_policy: { note: "kept" } };
  const written = withAcceptedCommercialModels(pack, ["sell_share", "brokerage"]);
  assert.deepEqual(written, { segments: [{ key: "a" }], carrier_commercial_policy: { note: "kept", accepted_models: ["brokerage", "sell_share"] } });
  assert.deepEqual(pack, { segments: [{ key: "a" }], carrier_commercial_policy: { note: "kept" } }, "the input is not mutated");
  assert.deepEqual(withAcceptedCommercialModels(written, null), pack);
  assert.deepEqual(withAcceptedCommercialModels({ carrier_commercial_policy: { accepted_models: ["brokerage"] } }, null), {});
  assert.deepEqual(withAcceptedCommercialModels(null, ["brokerage"]), { carrier_commercial_policy: { accepted_models: ["brokerage"] } });
  // The locked policy is never rewritten by this helper's caller, and the helper itself keeps it.
  assert.ok(lockedBrokerage(withAcceptedCommercialModels(LOCKED.rfx_master_package, ["cost_plus"])));
});

test("a carrier that chooses keeps today's behaviour when the event accepts every model", () => {
  assert.deepEqual(resolveCarrierCommercialModel("direct_cost_plus", null, null), { model: "cost_plus", chosen: true });
  assert.deepEqual(resolveCarrierCommercialModel("direct_cost_plus", "fee_plus", null), { model: "fee_plus", chosen: true });
  assert.deepEqual(resolveCarrierCommercialModel("cost_plus", "fee_plus", null), { model: "cost_plus", chosen: true });
  assert.deepEqual(resolveCarrierCommercialModel("carrier_share", "fee_plus", null), { model: "sell_share", chosen: true });
  assert.deepEqual(resolveCarrierCommercialModel("XBF buy-sell", null, null), { model: "brokerage", chosen: true });
});

test("a carrier that does not choose gets the event's only model, or keeps what the offer had, or none", () => {
  for (const nothing of [undefined, null, "", "   "]) {
    assert.deepEqual(resolveCarrierCommercialModel(nothing, null, null), { model: null, chosen: false });
    assert.deepEqual(resolveCarrierCommercialModel(nothing, "sell_share", null), { model: "sell_share", chosen: false });
    assert.deepEqual(resolveCarrierCommercialModel(nothing, null, ["brokerage"]), { model: "brokerage", chosen: false });
    assert.deepEqual(resolveCarrierCommercialModel(nothing, "cost_plus", ["brokerage"]), { model: "brokerage", chosen: false });
    assert.deepEqual(resolveCarrierCommercialModel(nothing, null, ["brokerage", "cost_plus"]), { model: null, chosen: false });
    assert.deepEqual(resolveCarrierCommercialModel(nothing, "cost_plus", ["brokerage", "cost_plus"]), { model: "cost_plus", chosen: false });
    // A model the event stopped accepting is not kept.
    assert.deepEqual(resolveCarrierCommercialModel(nothing, "sell_share", ["brokerage", "cost_plus"]), { model: null, chosen: false });
  }
});

test("a model the event does not accept is refused, in the carrier's language", () => {
  const es = no(resolveCarrierCommercialModel("carrier_share", null, ["brokerage", "cost_plus"], "es"));
  assert.equal(es.code, "COMMERCIAL_MODEL_NOT_ACCEPTED");
  assert.equal(es.status, 409);
  assert.equal(es.error, "Este evento no acepta ese modelo comercial. Acepta: XBF compra-venta, Costo + margen.");
  assert.deepEqual(es.accepted_models, ["brokerage", "cost_plus"]);
  const en = no(resolveCarrierCommercialModel("xbf_buy_sell", "brokerage", ["cost_plus", "fee_plus"], "en"));
  assert.equal(en.error, "This event does not accept that commercial model. It accepts: Cost + margin.");
  assert.equal(no(resolveCarrierCommercialModel("cost_plus", null, ["fee_plus"])).code, "COMMERCIAL_MODEL_NOT_ACCEPTED");
});

test("the portal's cost + margin option stands for cost plus and fee plus, whichever the event accepts", () => {
  assert.deepEqual(resolveCarrierCommercialModel("direct_cost_plus", null, ["fee_plus"]), { model: "fee_plus", chosen: true });
  assert.deepEqual(resolveCarrierCommercialModel("direct_cost_plus", "fee_plus", ["cost_plus", "brokerage"]), { model: "cost_plus", chosen: true });
  assert.deepEqual(resolveCarrierCommercialModel("direct", "fee_plus", ["cost_plus", "fee_plus"]), { model: "fee_plus", chosen: true });
  assert.equal(no(resolveCarrierCommercialModel("direct_cost_plus", null, ["brokerage", "sell_share"])).code, "COMMERCIAL_MODEL_NOT_ACCEPTED");
});

test("something that is not a model is refused instead of becoming cost plus", () => {
  const refused = resolveCarrierCommercialModel("premium", null, null, "es");
  assert.deepEqual(refused, { error: "El modelo comercial no es válido.", code: "COMMERCIAL_MODEL_INVALID", status: 400 });
  assert.equal(no(resolveCarrierCommercialModel("constructor", null, null)).code, "COMMERCIAL_MODEL_INVALID");
});

test("an offer counts with its own model, or with the event's when the event accepts one", () => {
  assert.equal(effectiveCommercialModel("carrier_share", null), "sell_share");
  assert.equal(effectiveCommercialModel(null, ["brokerage"]), "brokerage");
  assert.equal(effectiveCommercialModel("cost_plus", ["brokerage"]), "cost_plus");
  assert.equal(effectiveCommercialModel(null, ["brokerage", "cost_plus"]), null);
  assert.equal(effectiveCommercialModel("", null), null);
  assert.equal(effectiveCommercialModel(null, acceptedCommercialModels(LOCKED)), "brokerage");
});

test("an offer the team captures without a model takes the event's only model, and nothing else", () => {
  const participation = (masterPackage: unknown, stored: string | null = null) => ({ id: "lv-1", commercial_model: stored, rfx_events: { id: "event-1", rfx_master_package: masterPackage } });
  const single = { carrier_commercial_policy: { accepted_models: ["sell_share"] } };
  assert.equal(capturedCommercialModel(undefined, participation(single)), "sell_share");
  assert.equal(capturedCommercialModel(null, participation(LOCKED.rfx_master_package)), "brokerage");
  assert.equal(capturedCommercialModel("cost_plus", participation(single)), null, "a named model stands");
  assert.equal(capturedCommercialModel(undefined, participation(single, "brokerage")), null, "the offer's own model stands");
  assert.equal(capturedCommercialModel(undefined, participation({ carrier_commercial_policy: { accepted_models: ["brokerage", "cost_plus"] } })), null);
  assert.equal(capturedCommercialModel(undefined, participation({})), null);
});

test("the accepted models stop changing when the event is locked, closed or already awarded", () => {
  assert.equal(acceptedCommercialModelsChangeDenial({ status: "draft" }, false), null);
  assert.equal(acceptedCommercialModelsChangeDenial({ status: "Open" }, false), null);
  assert.equal(no(acceptedCommercialModelsChangeDenial(LOCKED, false)).code, "COMMERCIAL_MODEL_LOCKED");
  for (const status of ["closed", "awarded", "archived", "", null]) {
    assert.equal(no(acceptedCommercialModelsChangeDenial({ status }, false)).code, "RFX_EVENT_NOT_OPEN", String(status));
  }
  assert.equal(no(acceptedCommercialModelsChangeDenial({ status: "open" }, true)).code, "RFX_EVENT_HAS_AWARDS");
});

test("the team defines one of the four models, and only one the event accepts", () => {
  const participation = (masterPackage: unknown) => ({ id: "lv-1", commercial_model: null, rfx_events: { id: "event-1", rfx_master_package: masterPackage } });
  const several = { carrier_commercial_policy: { accepted_models: ["brokerage", "cost_plus"] } };
  for (const model of COMMERCIAL_MODEL_KEYS) assert.deepEqual(teamDefinedCommercialModel(model, participation({})), { model });
  assert.deepEqual(teamDefinedCommercialModel(" Cost-Plus ", participation(several)), { model: "cost_plus" });
  const refused = no(teamDefinedCommercialModel("fee_plus", participation(several)));
  assert.equal(refused.code, "COMMERCIAL_MODEL_NOT_ACCEPTED");
  assert.equal(refused.status, 409);
  assert.deepEqual(refused.accepted_models, ["brokerage", "cost_plus"]);
  assert.equal(no(teamDefinedCommercialModel("cost_plus", participation(LOCKED.rfx_master_package))).code, "COMMERCIAL_MODEL_NOT_ACCEPTED");
  // The carrier portal's aliases are not a model the team defines: cost_plus or fee_plus, said outright.
  for (const bad of ["direct_cost_plus", "xbf", "", null, undefined, "premium"]) {
    assert.equal(no(teamDefinedCommercialModel(bad, participation({}))).code, "COMMERCIAL_MODEL_INVALID", String(bad));
  }
});

test("each model keeps only its own percentage", () => {
  assert.deepEqual(commercialTermsPatch("sell_share", 9, 3), { commercial_model: "sell_share", marksman_margin_pct: null, carrier_share_pct: 3 });
  for (const model of ["brokerage", "cost_plus", "fee_plus"]) {
    assert.deepEqual(commercialTermsPatch(model, 9, 3), { commercial_model: model, marksman_margin_pct: 9, carrier_share_pct: null });
  }
  assert.deepEqual(commercialTermsPatch("brokerage", null, undefined), { commercial_model: "brokerage", marksman_margin_pct: null, carrier_share_pct: null });
  assert.deepEqual(commercialTermsPatch("sell_share", 4, null), { commercial_model: "sell_share", marksman_margin_pct: null, carrier_share_pct: null });
});
