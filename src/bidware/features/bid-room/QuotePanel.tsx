import { useEffect, useMemo, useRef, useState } from "react";
import { confirmAsync, promptAsync } from "@/components/confirm";
import { ErrorBanner, dateShort, money } from "@/components/ui";
import { useLang } from "@/i18n/language";
import { q } from "@/i18n/bid-room-quote";
import {
  acceptedModelKeys,
  billingNotice,
  droppedModelNotice,
  eventModelKey,
  SCORE_FACTORS,
  canQuote,
  declineInvitation,
  explainBidError,
  isRevision,
  isLockedBrokerage,
  modelIsOptional,
  laneState,
  offerForm,
  modelCopy,
  modelSpec,
  offerDraft,
  offerPayload,
  offerProblems,
  offerGaps,
  offerWarnings,
  parseAmount,
  submitBid,
  withdrawBid,
  type BookLane,
  type OfferForm,
} from "./bidroom.service";

import { SHARED_KEYS, sharedOf, startForm, type SharedFields } from "./quick-quote";
export type { SharedFields };

/** The lane's number as the carrier sees it in the list. */
const laneLabel = (lane: BookLane) => (lane.lane_number != null ? String(lane.lane_number) : route(lane));

const route = (lane: BookLane) => `${String(lane.origin ?? "—")} → ${String(lane.destination ?? "—")}`;

/** "$17,200 MXN": the code already names the currency, so the symbol stays plain. */
const offerAmount = (lane: BookLane) => {
  const currency = String(lane.currency || "USD");
  return `${money(lane.bid_rate, currency).replace(/^[A-Z]*\$/, "$")} ${currency}`;
};

/** Why a lane can't be priced here, in the order the server checks it. */
function lockedReason(lane: BookLane): string {
  const state = laneState(lane);
  if (state === "awarded") return q("locked.awarded");
  if (state === "backup") return q("locked.backup");
  if (state === "not_awarded") return q("locked.not_awarded");
  if (!lane.invitation_token) return q("locked.noLink");
  return q("locked.closed");
}

/**
 * Pricing one lane (wireframe 24): a panel beside the lanes, not a modal, so
 * the route table stays in sight. Every write goes against the lane's OWN
 * invitation_token, never the token from the URL.
 */
export function QuotePanel({
  lane,
  extrasOpen,
  onDone,
  onAsk,
  position,
  next,
  shared,
  onShare,
  others = 0,
  onBusy,
}: {
  lane: BookLane;
  /** "Ruta 4 de 8": where this lane sits among the carrier's lanes of the event. */
  position?: { n: number; total: number };
  /** The next lane still waiting for a quote, named on the send button. */
  next?: BookLane | null;
  /** Capacity, transit and validity to reuse on lanes not quoted yet (null = off). */
  shared?: SharedFields | null;
  onShare?: (fields: SharedFields | null) => void;
  /** How many other lanes the shared fields can still fill. */
  others?: number;
  /** Told while a write is on its way, so the sheet cannot close and hide its outcome. */
  onBusy?: (busy: boolean) => void;
  /** Opens capacity details when arriving from "Completar mi oferta". */
  extrasOpen?: boolean;
  onDone: (message: string) => void;
  /** Sends the carrier to Mensajes. */
  onAsk: () => void;
}) {
  useLang();
  const [form, setForm] = useState<OfferForm>(() => startForm(lane, shared).form);
  const [filled, setFilled] = useState(() => startForm(lane, shared).filled);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusy?.(busy);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onBusy?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [extras, setExtras] = useState(Boolean(extrasOpen));
  const active = useRef(false);
  const sending = useRef(false);
  const scopeToken = useRef(lane.invitation_token);
  scopeToken.current = lane.invitation_token;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  // Another lane, or this lane once the server's copy of its offer changed, starts from its own values.
  // A reload that brings the same lane back unchanged (another lane was just sent) keeps what is being typed.
  const laneVersion = `${lane.rfx_lane_id}|${lane.invitation_token}|${laneState(lane)}|${JSON.stringify(offerForm(lane))}`;
  useEffect(() => {
    const start = startForm(lane, shared);
    setForm(start.form);
    setFilled(start.filled);
    setError(null);
    setTried(false);
  }, [laneVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- shared values only seed a lane when it opens
  useEffect(() => {
    if (extrasOpen) setExtras(true);
  }, [extrasOpen, lane]);
  // The extra conditions start folded on every lane (decision of Jose, 6-nov): four fields price a route.
  useEffect(() => setExtras(Boolean(extrasOpen)), [lane.invitation_token]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<OfferForm>) => {
    const nextForm = { ...form, ...patch };
    setForm(nextForm);
    // While reuse is on, what is typed here is what the other lanes get.
    if (shared && onShare && SHARED_KEYS.some((k) => k in patch)) onShare(sharedOf(nextForm));
  };
  const revision = isRevision(lane);
  const editable = canQuote(lane);
  const lockedCommercialModel = isLockedBrokerage(lane);
  // The event says which models it accepts; unless it settled on one, choosing is optional.
  const acceptedModels = acceptedModelKeys(lane);
  const eventModel = eventModelKey(lane);
  const droppedModel = droppedModelNotice(lane);
  const spec = form.commercial_model ? { ...modelSpec(form.commercial_model), ...modelCopy(form.commercial_model) } : null;
  const problems = offerProblems(form);
  const warnings = offerWarnings(form);
  const gaps = offerGaps(form);
  const billing = billingNotice(form);
  const token = String(lane.invitation_token || "");

  /** The score factors as the form stands now, before sending. */
  const scored = useMemo(() => {
    // Right after the lane changes, this render still holds the previous lane's form: read it without judging it.
    const draft = offerDraft(form, lane) as unknown as BookLane;
    return SCORE_FACTORS.filter((f) => f.done(draft)).length;
  }, [form, lane]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone(ok);
    } catch (e) {
      setError(explainBidError(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setTried(true);
    if (problems.length || !token || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      // Billing terms and a model the event dropped are confirmed before the offer goes.
      const toConfirm = [droppedModel, billing].filter(Boolean).join("\n\n");
      if (toConfirm && !await confirmAsync(`${spec?.label ?? q("model.none.label")} · ${route(lane)}\n\n${toConfirm}`, { ok: q("form.confirmSend"), cancel: q("form.backToReview") })) return;
      if (!active.current || scopeToken.current !== token) return;
      await run(
        () => submitBid(token, offerPayload(form, lane)),
        q(form.best_final ? "form.sentFinal" : revision ? "form.sentUpdated" : "form.sent", route(lane)),
      );
    } finally {
      sending.current = false;
      if (active.current) setBusy(false);
    }
  }

  const head = (
    <>
      <div className="croom-eyebrow">
        {position
          ? q("panel.position", position.n, position.total)
          : lane.lane_number != null
            ? q("panel.eyebrowLane", String(lane.lane_number))
            : q("panel.eyebrow")}
      </div>
      <h3 className="croom-panel-title" tabIndex={-1}>
        {route(lane)}
      </h3>
      <div className="croom-panel-sub">
        {[lane.equipment, lane.weekly_volume != null && lane.weekly_volume !== "" ? q("panel.loadsPerWeek", String(lane.weekly_volume)) : ""]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </>
  );

  if (!editable) {
    return (
      <aside className="croom-panel">
        {head}
        <div className="croom-note warn">{lockedReason(lane)}</div>
        {revision && (
          <dl className="croom-facts">
            <div>
              <dt>{q("facts.rate")}</dt>
              <dd className="mono">{offerAmount(lane)}</dd>
            </div>
            <div>
              <dt>{q("facts.capacity")}</dt>
              <dd className="mono">{lane.weekly_capacity != null ? String(lane.weekly_capacity) : "—"}</dd>
            </div>
            <div>
              <dt>{q("facts.transit")}</dt>
              <dd className="mono">{lane.transit_days != null ? q("facts.transitDays", String(lane.transit_days)) : "—"}</dd>
            </div>
            <div>
              <dt>{q("facts.validThrough")}</dt>
              <dd className="mono">{lane.valid_through ? dateShort(String(lane.valid_through).slice(0, 10)) : "—"}</dd>
            </div>
          </dl>
        )}
        <div className="croom-actions">
          <div className="spacer" />
          <button type="button" onClick={onAsk}>
            {q("panel.askTeam")}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="croom-panel">
      {head}

      {revision && (
        <div className="croom-note">
          <b>{q("panel.alreadyQuoted")}</b>
          <span>{q("panel.resendNote", offerAmount(lane))}</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}

      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="croom-fields">
        <label className="grow">
          <span>{q("form.rate")}</span>
          <input
            className="mono"
            inputMode="decimal"
            value={form.bid_rate}
            onChange={(e) => set({ bid_rate: e.target.value })}
            placeholder="0.00"
          />
        </label>
        <label className="w-currency">
          <span>{q("form.currency")}</span>
          <select value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
            <option value="CAD">CAD</option>
          </select>
        </label>
      </div>
      <label className="croom-final">
        <input type="checkbox" checked={form.best_final} onChange={(e) => set({ best_final: e.target.checked })} />
        <span>{q("form.finalBefore")}</span>
      </label>

      {lockedCommercialModel ? (<>
        <div className="croom-note" aria-label={q("form.fixedModelLabel")}>
          <b>{q("form.fixedModelTitle")}</b>
          <p>{q("form.fixedModelText")}</p>
        </div>
        {/* The fixed model replaces whatever the offer had: said here too, before resending. */}
        {droppedModel && <p className="croom-note warn" role="note">{droppedModel}</p>}
      </>) : (<>
      <div className="croom-fields">
        <label className="grow">
          <span>{q(eventModel ? "form.model" : "form.modelOptional")}</span>
          {eventModel ? (
            // The event's only model is the event's, not a choice.
            <input value={modelCopy(eventModel).label} readOnly disabled />
          ) : (
            <select
              value={form.commercial_model}
              onChange={(e) => set({ commercial_model: e.target.value as OfferForm["commercial_model"], pct: "" })}
            >
              {(modelIsOptional(lane) || !form.commercial_model) && <option value="">{q("model.none.label")}</option>}
              {acceptedModels.map((key) => (
                <option key={key} value={key}>
                  {modelCopy(key).label}
                </option>
              ))}
            </select>
          )}
        </label>
        {spec && (
          <label className="grow">
            <span>
              {spec.pctLabel} ({spec.min}–{spec.max} %)
            </span>
            <input
              className="mono"
              inputMode="decimal"
              value={form.pct}
              onChange={(e) => set({ pct: e.target.value })}
              placeholder={q("form.blankPlaceholder", spec.blank)}
            />
          </label>
        )}
      </div>
      {/* A model the event dropped is never swapped in silence. */}
      {droppedModel && <p className="croom-note warn" role="note">{droppedModel}</p>}
      {spec ? (
        <p className="croom-hint ayuda">
          {spec.enter} {spec.effect}
        </p>
      ) : (
        // Always in sight: what happens when the carrier does not choose.
        <p className="croom-hint" role="note">{q("form.modelNoneHint")}</p>
      )}

      </>)}

      {billing && <p className="croom-note" role="note" aria-label={q("form.billingAria")}><strong>{billing}</strong></p>}
      {tried && problems.length > 0 && <p className="croom-problems">{problems.join(" ")}</p>}
      <div className="croom-actions croom-actions-enviar">
        <button
          type="button"
          className="primary"
          disabled={busy || (tried && problems.length > 0) || parseAmount(form.bid_rate) === null}
          onClick={send}
        >
          {busy ? q("form.sending") : revision ? q("form.update") : next ? q("form.sendNext", laneLabel(next)) : q("form.send")}
        </button>
      </div>
      <details className="croom-extras" open={extras} onToggle={(e) => setExtras((e.target as HTMLDetailsElement).open)}>
        <summary>
          {q("form.extrasSummary")}
          <span className="mono">{q("form.extrasCount", scored, SCORE_FACTORS.length)}</span>
        </summary>
        <p className="croom-hint ayuda">{q("form.extrasHint")}</p>
        {filled && <p className="croom-note" role="note">{q("form.shared")}</p>}
      <div className="croom-fields">
        <label>
          <span>{q("form.capacity")}</span>
          <input className="mono" inputMode="numeric" value={form.weekly_capacity} onChange={(e) => set({ weekly_capacity: e.target.value })} />
        </label>
        <label>
          <span>{q("form.transitDays")}</span>
          <input className="mono" inputMode="numeric" value={form.transit_days} onChange={(e) => set({ transit_days: e.target.value })} />
        </label>
        <label>
          <span>{q("form.validThrough")}</span>
          <input className="mono" type="date" value={form.valid_through} onChange={(e) => set({ valid_through: e.target.value })} />
        </label>
      </div>
        {onShare && others > 0 && (
          <label className="croom-check">
            <input
              type="checkbox"
              checked={Boolean(shared)}
              onChange={(e) => onShare(e.target.checked ? sharedOf(form) : null)}
            />
            <span>{q("form.share")}</span>
          </label>
        )}
        <div className="croom-fields">
          <label>
            <span>{q("form.equipmentAvailable")}</span>
            <select
              value={form.equipment_available}
              onChange={(e) => set({ equipment_available: e.target.value as OfferForm["equipment_available"] })}
            >
              <option value="">{q("form.unsaid")}</option>
              <option value="yes">{q("form.yes")}</option>
              <option value="no">{q("form.no")}</option>
            </select>
          </label>
          <label className="grow">
            <span>{q("form.unitLocation")}</span>
            <input value={form.current_unit_location} onChange={(e) => set({ current_unit_location: e.target.value })} />
          </label>
        </div>
        <div className="croom-fields">
          <label>
            <span>{q("form.deadhead")}</span>
            <input
              className="mono"
              inputMode="decimal"
              value={form.deadhead_distance}
              onChange={(e) => set({ deadhead_distance: e.target.value })}
            />
          </label>
          <label className="w-unit">
            <span>{q("form.unit")}</span>
            <select value={form.deadhead_unit} onChange={(e) => set({ deadhead_unit: e.target.value as "mi" | "km" })}>
              <option value="mi">mi</option>
              <option value="km">km</option>
            </select>
          </label>
          <label className="grow">
            <span>{q("form.unitDetails")}</span>
            <input value={form.unit_details} placeholder={q("form.unitDetailsHint")} onChange={(e) => set({ unit_details: e.target.value })} />
          </label>
        </div>
        <div className="croom-fields">
          <label className="grow">
            <span>{q("form.etaPickup")}</span>
            <input type="datetime-local" value={form.eta_pickup} onChange={(e) => set({ eta_pickup: e.target.value })} />
          </label>
          <label className="grow">
            <span>{q("form.etaDelivery")}</span>
            <input type="datetime-local" value={form.eta_delivery} onChange={(e) => set({ eta_delivery: e.target.value })} />
          </label>
        </div>
        <label className="croom-check">
          <input
            type="checkbox"
            checked={form.mirror_account_enabled}
            onChange={(e) => set({ mirror_account_enabled: e.target.checked })}
          />
          <span>{q("form.mirror")}</span>
        </label>
        <label className="croom-check">
          <input
            type="checkbox"
            checked={form.best_alternative_offered}
            onChange={(e) => set({ best_alternative_offered: e.target.checked })}
          />
          <span>{q("form.alternative")}</span>
        </label>
        {form.best_alternative_offered && (
          <div className="croom-fields">
            <label className="grow">
              <span>{q("form.altEquipment")}</span>
              <input value={form.alternative_equipment} onChange={(e) => set({ alternative_equipment: e.target.value })} />
            </label>
            <label>
              <span>{q("form.altUnits")}</span>
              <input
                className="mono"
                inputMode="numeric"
                value={form.alternative_units}
                onChange={(e) => set({ alternative_units: e.target.value })}
              />
            </label>
            <label className="grow">
              <span>{q("form.altNotes")}</span>
              <input value={form.alternative_notes} onChange={(e) => set({ alternative_notes: e.target.value })} />
            </label>
          </div>
        )}
        <label className="croom-field">
          <span>{q("form.notes")}</span>
          <textarea rows={2} value={form.notes} placeholder={q("form.optional")} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </details>



      <section className="croom-gaps" aria-label={q("form.gapsAria")} title={warnings.join(" ")}>
        {gaps.length ? (
          <>
            <b>{q("form.missing")}</b> {gaps.join(", ")}{q("form.missingTail")}
          </>
        ) : (
          <b>{q("form.complete")}</b>
        )}
      </section>


      <div className="croom-actions croom-actions-bajo">
        {revision && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await confirmAsync(q("form.withdrawConfirm", route(lane)), { ok: q("form.withdrawOk") }))
                run(() => withdrawBid(token), q("form.withdrawn", route(lane)));
            }}
          >
            {q("form.withdraw")}
          </button>
        )}
        {laneState(lane) !== "declined" && (
          <button
            type="button"
            className="btn-texto-croom"
            disabled={busy}
            onClick={async () => {
              const reason = await promptAsync(q("form.declinePrompt"));
              if (reason === null) return;
              run(() => declineInvitation(token, reason), q("form.declined", route(lane)));
            }}
          >
            {q("form.decline")}
          </button>
        )}
      </div>
      </fieldset>
    </aside>
  );
}

/** What the panel shows before a lane is picked. */
export function QuotePanelEmpty() {
  useLang();
  return (
    <aside className="croom-panel">
      <div className="croom-eyebrow">{q("panel.eyebrow")}</div>
      <h3 className="croom-panel-title">{q("panel.emptyTitle")}</h3>
      <p className="croom-hint ayuda">{q("panel.emptyHint")}</p>
    </aside>
  );
}
