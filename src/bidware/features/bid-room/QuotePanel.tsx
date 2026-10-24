import { useEffect, useMemo, useRef, useState } from "react";
import { confirmAsync, promptAsync } from "@/components/confirm";
import { ErrorBanner, dateShort, money } from "@/components/ui";
import {
  COMMERCIAL_MODELS,
  billingNotice,
  SCORE_FACTORS,
  canQuote,
  declineInvitation,
  explainBidError,
  isRevision,
  laneState,
  modelSpec,
  offerForm,
  offerPayload,
  offerProblems,
  offerWarnings,
  parseAmount,
  submitBid,
  withdrawBid,
  type BookLane,
  type OfferForm,
} from "./bidroom.service";

const route = (lane: BookLane) => `${String(lane.origin ?? "—")} → ${String(lane.destination ?? "—")}`;

/** "$17,200 MXN": the code already names the currency, so the symbol stays plain. */
const offerAmount = (lane: BookLane) => {
  const currency = String(lane.currency || "USD");
  return `${money(lane.bid_rate, currency).replace(/^[A-Z]*\$/, "$")} ${currency}`;
};

/** Why a lane can't be priced here, in the order the server checks it. */
function lockedReason(lane: BookLane): string {
  const state = laneState(lane);
  if (state === "awarded") return "Esta ruta ya es tuya. Para renegociar una tarifa adjudicada, escribe al equipo.";
  if (state === "backup") return "Quedaste como respaldo en esta ruta. Si cambia algo, el equipo te escribe.";
  if (state === "not_awarded") return "Esta ruta se adjudicó a otro carrier. Gracias por cotizar.";
  if (!lane.invitation_token) return "Este lane no trae su propio enlace. Pide acceso al equipo en Mensajes.";
  return "La ventana de cotización cerró. Tu última oferta queda como está.";
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
}: {
  lane: BookLane;
  /** Opens capacity details when arriving from "Completar mi oferta". */
  extrasOpen?: boolean;
  onDone: (message: string) => void;
  /** Sends the carrier to Mensajes. */
  onAsk: () => void;
}) {
  const [form, setForm] = useState<OfferForm>(() => offerForm(lane));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [extras, setExtras] = useState(true);
  const active = useRef(false);
  const sending = useRef(false);
  const scopeToken = useRef(lane.invitation_token);
  scopeToken.current = lane.invitation_token;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  // Another lane, or this one after a reload, starts from its own values.
  useEffect(() => {
    setForm(offerForm(lane));
    setError(null);
    setTried(false);
  }, [lane]);
  useEffect(() => {
    if (extrasOpen) setExtras(true);
  }, [extrasOpen, lane]);
  // A carrier may collapse the section, but every different lane starts visible.
  useEffect(() => setExtras(true), [lane.invitation_token]);

  const set = (patch: Partial<OfferForm>) => setForm((f) => ({ ...f, ...patch }));
  const revision = isRevision(lane);
  const editable = canQuote(lane);
  const spec = modelSpec(form.commercial_model);
  const problems = offerProblems(form);
  const warnings = offerWarnings(form);
  const billing = billingNotice(form);
  const token = String(lane.invitation_token || "");

  /** The score factors as the form stands now, before sending. */
  const scored = useMemo(() => {
    const draft = offerPayload(form, lane) as unknown as BookLane;
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
      if (billing && !await confirmAsync(`${spec.label} · ${route(lane)}\n\n${billing}`, { ok: "Confirmar y enviar oferta", cancel: "Volver a revisar" })) return;
      if (!active.current || scopeToken.current !== token) return;
      await run(
        () => submitBid(token, offerPayload(form, lane)),
        `${form.best_final ? "Oferta final enviada" : revision ? "Oferta actualizada" : "Oferta enviada"} · ${route(lane)}.`,
      );
    } finally {
      sending.current = false;
      if (active.current) setBusy(false);
    }
  }

  const head = (
    <>
      <div className="croom-eyebrow">
        Cotización{lane.lane_number != null ? ` · lane ${String(lane.lane_number)}` : ""}
      </div>
      <h3 className="croom-panel-title">
        {editable ? (revision ? "Revisar" : "Cotizar") : "Tu oferta"} · {route(lane)}
      </h3>
      <div className="croom-panel-sub">
        {[lane.equipment, lane.weekly_volume != null && lane.weekly_volume !== "" ? `${String(lane.weekly_volume)} cargas/sem` : ""]
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
              <dt>Tarifa all-in</dt>
              <dd className="mono">{offerAmount(lane)}</dd>
            </div>
            <div>
              <dt>Capacidad/sem</dt>
              <dd className="mono">{lane.weekly_capacity != null ? String(lane.weekly_capacity) : "—"}</dd>
            </div>
            <div>
              <dt>Tránsito</dt>
              <dd className="mono">{lane.transit_days != null ? `${String(lane.transit_days)} días` : "—"}</dd>
            </div>
            <div>
              <dt>Vigente hasta</dt>
              <dd className="mono">{lane.valid_through ? dateShort(String(lane.valid_through).slice(0, 10)) : "—"}</dd>
            </div>
          </dl>
        )}
        <div className="croom-actions">
          <div className="spacer" />
          <button type="button" onClick={onAsk}>
            Escribir al equipo
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
          <b>Ya cotizaste:</b>
          <span>{offerAmount(lane)}. Reenviar queda como revisión, no como oferta aparte.</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}

      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="croom-fields">
        <label className="grow">
          <span>Tarifa all-in *</span>
          <input
            className="mono"
            inputMode="decimal"
            value={form.bid_rate}
            onChange={(e) => set({ bid_rate: e.target.value })}
            placeholder="0.00"
          />
        </label>
        <label className="w-currency">
          <span>Moneda</span>
          <select value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
            <option value="CAD">CAD</option>
          </select>
        </label>
      </div>

      <div className="croom-fields">
        <label>
          <span>Capacidad/sem</span>
          <input className="mono" inputMode="numeric" value={form.weekly_capacity} onChange={(e) => set({ weekly_capacity: e.target.value })} />
        </label>
        <label>
          <span>Tránsito (días)</span>
          <input className="mono" inputMode="numeric" value={form.transit_days} onChange={(e) => set({ transit_days: e.target.value })} />
        </label>
        <label>
          <span>Vigente hasta</span>
          <input className="mono" type="date" value={form.valid_through} onChange={(e) => set({ valid_through: e.target.value })} />
        </label>
      </div>

      <div className="croom-fields">
        <label className="grow">
          <span>Modelo comercial</span>
          <select
            value={form.commercial_model}
            onChange={(e) => set({ commercial_model: e.target.value as OfferForm["commercial_model"], pct: "" })}
          >
            {COMMERCIAL_MODELS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          <span>
            {spec.pctLabel} ({spec.min}–{spec.max} %)
          </span>
          <input
            className="mono"
            inputMode="decimal"
            value={form.pct}
            onChange={(e) => set({ pct: e.target.value })}
            placeholder={`vacío = ${spec.blank}`}
          />
        </label>
      </div>
      <p className="croom-hint">
        {spec.enter} {spec.effect}
      </p>

      <label className="croom-field">
        <span>Notas para MARKSMAN</span>
        <textarea rows={2} value={form.notes} placeholder="opcional" onChange={(e) => set({ notes: e.target.value })} />
      </label>

      <details className="croom-extras" open={extras} onToggle={(e) => setExtras((e.target as HTMLDetailsElement).open)}>
        <summary>
          Capacidad y condiciones de la oferta
          <span className="mono">
            {scored} de {SCORE_FACTORS.length}
          </span>
        </summary>
        <div className="croom-fields">
          <label>
            <span>Equipo disponible</span>
            <select
              value={form.equipment_available}
              onChange={(e) => set({ equipment_available: e.target.value as OfferForm["equipment_available"] })}
            >
              <option value="">Sin decir</option>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="grow">
            <span>Ubicación actual de la unidad</span>
            <input value={form.current_unit_location} onChange={(e) => set({ current_unit_location: e.target.value })} />
          </label>
        </div>
        <div className="croom-fields">
          <label>
            <span>Vacío al origen</span>
            <input
              className="mono"
              inputMode="decimal"
              value={form.deadhead_distance}
              onChange={(e) => set({ deadhead_distance: e.target.value })}
            />
          </label>
          <label className="w-unit">
            <span>Unidad</span>
            <select value={form.deadhead_unit} onChange={(e) => set({ deadhead_unit: e.target.value as "mi" | "km" })}>
              <option value="mi">mi</option>
              <option value="km">km</option>
            </select>
          </label>
          <label className="grow">
            <span>Detalle de la unidad</span>
            <input value={form.unit_details} placeholder="año, placas, equipo" onChange={(e) => set({ unit_details: e.target.value })} />
          </label>
        </div>
        <div className="croom-fields">
          <label className="grow">
            <span>ETA de recolección</span>
            <input type="datetime-local" value={form.eta_pickup} onChange={(e) => set({ eta_pickup: e.target.value })} />
          </label>
          <label className="grow">
            <span>ETA de entrega</span>
            <input type="datetime-local" value={form.eta_delivery} onChange={(e) => set({ eta_delivery: e.target.value })} />
          </label>
        </div>
        <label className="croom-check">
          <input
            type="checkbox"
            checked={form.mirror_account_enabled}
            onChange={(e) => set({ mirror_account_enabled: e.target.checked })}
          />
          <span>Doy cuenta espejo de GPS para validar la unidad.</span>
        </label>
        <label className="croom-check">
          <input
            type="checkbox"
            checked={form.best_alternative_offered}
            onChange={(e) => set({ best_alternative_offered: e.target.checked })}
          />
          <span>Tengo una oferta alternativa (otro equipo o más unidades).</span>
        </label>
        {form.best_alternative_offered && (
          <div className="croom-fields">
            <label className="grow">
              <span>Equipo alterno</span>
              <input value={form.alternative_equipment} onChange={(e) => set({ alternative_equipment: e.target.value })} />
            </label>
            <label>
              <span>Unidades</span>
              <input
                className="mono"
                inputMode="numeric"
                value={form.alternative_units}
                onChange={(e) => set({ alternative_units: e.target.value })}
              />
            </label>
            <label className="grow">
              <span>Condiciones</span>
              <input value={form.alternative_notes} onChange={(e) => set({ alternative_notes: e.target.value })} />
            </label>
          </div>
        )}
      </details>

      <label className="croom-final">
        <input type="checkbox" checked={form.best_final} onChange={(e) => set({ best_final: e.target.checked })} />
        <span>
          Es mi oferta final — se registra como <b>best and final</b>.
        </span>
      </label>

      {tried && problems.length > 0 && <p className="croom-problems">{problems.join(" ")}</p>}

      <section className={`croom-note${warnings.length ? " warn" : ""}`} aria-label="Revisión de información de la oferta">
        <div>
          <b>{warnings.length ? "Datos pendientes antes de enviar" : "Datos recomendados completos"}</b>
          {warnings.length ? <>
            <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            <p>Puedes enviar tu oferta con estos datos pendientes y completarlos después, mientras siga abierta la cotización.</p>
          </> : <p>Revisa que la capacidad y las condiciones correspondan a esta ruta antes de enviar.</p>}
        </div>
      </section>

      {billing && <p className="croom-note" role="note" aria-label="Condición de facturación"><strong>{billing}</strong></p>}

      <div className="croom-actions">
        {revision && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await confirmAsync(`Retirar tu oferta de ${route(lane)}. ¿Continuar?`, { ok: "Retirar" }))
                run(() => withdrawBid(token), `Oferta retirada · ${route(lane)}.`);
            }}
          >
            Retirar oferta
          </button>
        )}
        {laneState(lane) !== "declined" && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const reason = await promptAsync("Motivo (opcional) para no participar en este lane:");
              if (reason === null) return;
              run(() => declineInvitation(token, reason), `Marcado como no participo · ${route(lane)}.`);
            }}
          >
            No participo
          </button>
        )}
        <div className="spacer" />
        <button
          type="button"
          className="primary"
          disabled={busy || (tried && problems.length > 0) || parseAmount(form.bid_rate) === null}
          onClick={send}
        >
          {busy ? "Enviando…" : revision ? "Actualizar oferta" : "Enviar oferta"}
        </button>
      </div>
      </fieldset>
    </aside>
  );
}

/** What the panel shows before a lane is picked. */
export function QuotePanelEmpty() {
  return (
    <aside className="croom-panel">
      <div className="croom-eyebrow">Cotización</div>
      <h3 className="croom-panel-title">Elige un lane de la tabla</h3>
      <p className="croom-hint">
        Cada lane se cotiza por separado y se guarda solo: puedes parar y volver, y corregir mientras la ventana siga
        abierta.
      </p>
    </aside>
  );
}
