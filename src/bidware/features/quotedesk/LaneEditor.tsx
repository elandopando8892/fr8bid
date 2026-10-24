import { tr } from "@/i18n/quotedesk";
import { useLang, locale, getLang } from "@/i18n/language";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { confirmAsync } from "@/components/confirm";
import { dateShort, money } from "@/components/ui";
import { AccessorialsModal } from "./AccessorialsModal";
import { computeLane, pct, suggestedFuel, toNumber } from "./calc";
import { LocationField, type PlaceValue } from "./LocationField";
import {
  CROSSING_MODELS,
  FCM_TIER_LABEL,
  MARKUP_MODES,
  deleteQuoteLane,
  estimateLaneFcm,
  listFcmCostBases,
  saveQuoteLane,
  suggestLaneMiles,
  type AccessorialLine,
  type FcmBases,
  type FcmEstimate,
  type FcmTier,
  type LaneAward,
  type MarkupMode,
  type MilesSuggestion,
  type Quote,
  type QuoteContext,
  type QuoteLane,
  type StagingOptions,
} from "./quotedesk.service";

type Num = string;

interface Draft {
  origin: PlaceValue | null;
  destination: PlaceValue | null;
  equipment: string;
  trailer: string;
  config: string;
  operation: string;
  service: string;
  border_crossing: string;
  crossing_model: string;
  weight_lb: Num;
  weekly_volume: Num;
  mx_miles: Num;
  us_miles: Num;
  miles_source: string;
  fsc_per_mile: Num;
  fsc_rate_date: string;
  fsc_diesel_per_gallon: Num;
  cost_source: QuoteLane["cost_source"];
  linehaul_mx: Num;
  linehaul_us: Num;
  fuel_amount: Num;
  border_amount: Num;
  carrier_rate: Num;
  accessorials: AccessorialLine[];
  markup_mode: MarkupMode;
  markup_value: Num;
  notes: string;
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function placeOf(lane: QuoteLane | null, side: "origin" | "destination"): PlaceValue | null {
  if (!lane) return null;
  const label = lane[side];
  if (!label) return null;
  return {
    label,
    city: lane[`${side}_city`],
    state: lane[`${side}_state`],
    country: (lane[`${side}_country`] || "").toUpperCase(),
    postal: lane[`${side}_postal_code`],
    market: lane[`${side}_market`],
    region: lane[`${side}_region`],
  };
}

function draftOf(lane: QuoteLane | null): Draft {
  return {
    origin: placeOf(lane, "origin"),
    destination: placeOf(lane, "destination"),
    equipment: str(lane?.equipment),
    trailer: str(lane?.trailer),
    config: str(lane?.config),
    operation: str(lane?.operation),
    service: str(lane?.service),
    border_crossing: str(lane?.border_crossing),
    crossing_model: str(lane?.crossing_model),
    weight_lb: str(lane?.weight_lb),
    weekly_volume: str(lane?.weekly_volume),
    mx_miles: str(lane?.mx_miles),
    us_miles: str(lane?.us_miles),
    miles_source: str(lane?.miles_source),
    fsc_per_mile: str(lane?.fsc_per_mile),
    fsc_rate_date: str(lane?.fsc_rate_date),
    fsc_diesel_per_gallon: str(lane?.fsc_diesel_per_gallon),
    cost_source: lane?.cost_source ?? "manual",
    linehaul_mx: str(lane?.linehaul_mx),
    linehaul_us: str(lane?.linehaul_us),
    fuel_amount: str(lane?.fuel_amount),
    border_amount: str(lane?.border_amount),
    carrier_rate: str(lane?.carrier_rate),
    accessorials: lane?.accessorials ?? [],
    markup_mode: lane?.markup_mode ?? "percent_on_cost",
    markup_value: str(lane?.markup_value),
    notes: str(lane?.notes),
  };
}

function placePayload(side: "origin" | "destination", place: PlaceValue | null) {
  return {
    [side]: place?.label ?? null,
    [`${side}_city`]: place?.city ?? null,
    [`${side}_state`]: place?.state ?? null,
    [`${side}_country`]: place?.country ?? null,
    [`${side}_postal_code`]: place?.postal ?? null,
    [`${side}_market`]: place?.market ?? null,
    [`${side}_region`]: place?.region ?? null,
  };
}

function placeForMiles(place: PlaceValue | null) {
  return {
    country: place?.country,
    city: place?.city ?? undefined,
    state_code: place?.state ?? undefined,
    state_name: place?.state_name ?? undefined,
    market: place?.market ?? undefined,
    label: place?.label,
  };
}


export function LaneEditor({
  quote,
  lane,
  context,
  options,
  award,
  locked,
  onSaved,
  onDeleted,
  onDirtyChange,
}: {
  quote: Quote;
  lane: QuoteLane | null;
  context: QuoteContext | null;
  options: StagingOptions | null;
  award: LaneAward | null;
  locked: boolean;
  onSaved: (laneId: string) => void;
  onDeleted: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  useLang();
  const [draft, setDraft] = useState<Draft>(() => draftOf(lane));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draftOf(lane)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [miles, setMiles] = useState<MilesSuggestion | null>(null);
  const [loadingMiles, setLoadingMiles] = useState(false);
  const [modal, setModal] = useState(false);
  const savedFcm = (lane?.metadata?.fcm ?? null) as FcmEstimate | null;
  const [fcmBases, setFcmBases] = useState<FcmBases | null>(null);
  // "" = automatic: the server picks the base of the route's scope, as the FCM enforces.
  const [fcmBaseId, setFcmBaseId] = useState(savedFcm?.cost_base && savedFcm.cost_base.auto === false ? savedFcm.cost_base.id : "");
  const [fcmTier, setFcmTier] = useState<FcmTier>(savedFcm?.tier ?? "target");
  const [fcmTolls, setFcmTolls] = useState(savedFcm?.mx?.tolls_source === "manual" ? String(savedFcm.mx.tollsMxn) : "");
  const [fcm, setFcm] = useState<FcmEstimate | null>(savedFcm);
  const [fcmTouched, setFcmTouched] = useState(false);
  const [estimating, setEstimating] = useState(false);

  useEffect(() => {
    let active = true;
    listFcmCostBases()
      .then((res) => {
        if (!active) return;
        setFcmBases(res);
        setFcmBaseId((current) => (current && res.bases.some((b) => b.id === current) ? current : ""));
      })
      .catch(() => active && setFcmBases({ bases: [], default_id: null, tiers: [] }));
    return () => {
      active = false;
    };
  }, []);

  const currency = quote.currency;
  const fx = toNumber(quote.fx_usd_mxn) ?? toNumber(context?.fx?.usd_mxn);
  const dirty = JSON.stringify(draft) !== baseline;
  // The parent learns about unsaved changes after the render, never from
  // inside a state updater (React warns about updating it mid-render).
  const notifyDirty = useRef(onDirtyChange);
  notifyDirty.current = onDirtyChange;
  useEffect(() => {
    notifyDirty.current?.(dirty);
  }, [dirty]);
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setNotice(null);
  };

  const crossBorder = Boolean(
    draft.origin && draft.destination && (draft.origin.country === "MX") !== (draft.destination.country === "MX"),
  );
  const components = {
    linehaul_mx: draft.linehaul_mx,
    linehaul_us: draft.linehaul_us,
    fuel_amount: draft.fuel_amount,
    border_amount: crossBorder ? draft.border_amount : "",
    carrier_rate: draft.carrier_rate,
  };
  const preview = computeLane({
    ...components,
    accessorials: draft.accessorials,
    markup_mode: draft.markup_mode,
    markup_value: draft.markup_value,
  });
  const fuelSuggestion = useMemo(
    () => suggestedFuel(draft.us_miles, draft.fsc_per_mile, currency, fx),
    [getLang(), draft.us_miles, draft.fsc_per_mile, currency, fx],
  );
  const totalMiles = (toNumber(draft.mx_miles) ?? 0) + (toNumber(draft.us_miles) ?? 0);
  const amount = (value: number | null) => (value === null ? "—" : money(value, currency));
  // "Expedited" prices the carrier's trip without the backhaul discount.
  const cat = (key: string) => {
    const values = options?.categories?.[key] ?? [];
    return key === "service" && !values.includes("Expedited") ? [...values, "Expedited"] : values;
  };
  const hasMxLeg = draft.origin?.country === "MX" || draft.destination?.country === "MX";
  const fcmBase =
    fcmBases?.bases.find((b) => b.id === (fcmBaseId || fcm?.cost_base?.id)) ??
    fcmBases?.bases.find((b) => b.is_default) ??
    null;
  const fscSub = draft.fsc_per_mile
    ? `FSC $${draft.fsc_per_mile}/mi` +
      (draft.fsc_diesel_per_gallon ? ` @ $${Number(draft.fsc_diesel_per_gallon).toFixed(2)}/gal` : "") +
      (draft.fsc_rate_date ? tr("text019", dateShort(draft.fsc_rate_date)) : "")
    : tr("text020");

  async function calculateMiles() {
    if (!draft.origin || !draft.destination) {
      setError(tr("text021"));
      return;
    }
    setLoadingMiles(true);
    setError(null);
    try {
      const res = await suggestLaneMiles({
        origin: placeForMiles(draft.origin),
        destination: placeForMiles(draft.destination),
        border_crossing: crossBorder ? draft.border_crossing || null : null,
      });
      setMiles(res);
      const patch: Partial<Draft> = {};
      if (res.mx_miles !== null) patch.mx_miles = String(res.mx_miles);
      if (res.us_miles !== null) patch.us_miles = String(res.us_miles);
      if (res.mx_miles !== null || res.us_miles !== null) patch.miles_source = res.miles_source || "rateware_lane_mileage";
      if (crossBorder && !draft.border_crossing) {
        const leg = res.legs.find((l) => l.scope === "border");
        if (leg?.crossing) patch.border_crossing = leg.crossing;
      }
      if (res.fuel?.fsc_per_mile) {
        patch.fsc_per_mile = String(res.fuel.fsc_per_mile);
        patch.fsc_rate_date = res.fuel.index_date;
        patch.fsc_diesel_per_gallon = res.fuel.diesel_per_gallon ? String(res.fuel.diesel_per_gallon) : "";
        const usMiles = patch.us_miles ?? draft.us_miles;
        const suggested = suggestedFuel(usMiles, res.fuel.fsc_per_mile, currency, fx);
        if (suggested !== null && !draft.fuel_amount) patch.fuel_amount = String(suggested);
      }
      set(patch);
      if (!res.complete) {
        const googleError = res.legs.find((l) => l.provider_error)?.provider_error;
        setNotice(
          googleError
            ? tr("text022", googleError)
            : tr("text023"),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMiles(false);
    }
  }

  async function estimateFcm() {
    if (!draft.origin || !draft.destination) {
      setError(tr("text024"));
      return;
    }
    setEstimating(true);
    setError(null);
    try {
      const res = await estimateLaneFcm({
        quote_id: quote.id,
        origin: placeForMiles(draft.origin),
        destination: placeForMiles(draft.destination),
        border_crossing: crossBorder ? draft.border_crossing || null : null,
        crossing_model: crossBorder ? draft.crossing_model || null : null,
        operation: draft.operation || null,
        service: draft.service || null,
        equipment: draft.equipment || null,
        trailer: draft.trailer || null,
        config: draft.config || null,
        mx_miles: draft.mx_miles || null,
        us_miles: draft.us_miles || null,
        tolls_mxn: fcmTolls.trim() === "" ? null : fcmTolls,
        cost_base_id: fcmBaseId || null,
        tier: fcmTier,
      });
      const c = res.components;
      const text = (v: number | null) => (v === null ? "" : String(v));
      const patch: Partial<Draft> = {
        linehaul_mx: text(c.linehaul_mx),
        linehaul_us: text(c.linehaul_us),
        fuel_amount: text(c.fuel_amount),
        border_amount: text(c.border_amount),
        cost_source: "fcm",
      };
      if (res.us) {
        patch.fsc_per_mile = String(res.us.fscPerMile);
        patch.fsc_rate_date = res.us.fsc_index_date;
        patch.fsc_diesel_per_gallon = String(res.us.dieselUsdGal);
        if (!draft.us_miles) patch.us_miles = String(res.us.miles);
      }
      if (res.mx && !draft.mx_miles) patch.mx_miles = String(Math.round((res.mx.km / 1.60934) * 10) / 10);
      if (!draft.service) patch.service = res.service;
      set(patch);
      setFcm(res);
      setFcmTouched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEstimating(false);
    }
  }

  async function save() {
    if (!draft.origin || !draft.destination) {
      setError(tr("text025"));
      return;
    }
    if (preview.problem) {
      setError(preview.problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await saveQuoteLane(quote.id, {
        id: lane?.id,
        ...placePayload("origin", draft.origin),
        ...placePayload("destination", draft.destination),
        equipment: draft.equipment || null,
        trailer: draft.trailer || null,
        config: draft.config || null,
        operation: draft.operation || null,
        service: draft.service || null,
        border_crossing: crossBorder ? draft.border_crossing || null : null,
        crossing_model: crossBorder ? draft.crossing_model || null : null,
        weight_lb: draft.weight_lb,
        weekly_volume: draft.weekly_volume,
        mx_miles: draft.mx_miles,
        us_miles: draft.us_miles,
        miles_source: draft.miles_source || (draft.mx_miles || draft.us_miles ? "manual" : null),
        fsc_per_mile: draft.fsc_per_mile,
        fsc_rate_date: draft.fsc_rate_date || null,
        fsc_diesel_per_gallon: draft.fsc_diesel_per_gallon,
        cost_source: draft.cost_source,
        ...(fcmTouched ? { fcm } : {}),
        linehaul_mx: draft.linehaul_mx,
        linehaul_us: draft.linehaul_us,
        fuel_amount: draft.fuel_amount,
        border_amount: crossBorder ? draft.border_amount : "",
        carrier_rate: draft.carrier_rate,
        accessorials: draft.accessorials,
        markup_mode: draft.markup_mode,
        markup_value: draft.markup_value,
        notes: draft.notes || null,
      });
      // What was saved is the new baseline: an edit before the reload lands
      // counts as unsaved again, and the parent hears about it.
      setBaseline(JSON.stringify(draft));
      onDirtyChange?.(false);
      onSaved(res.lane.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!lane) return;
    const ok = await confirmAsync(tr("text026", lane.lane_number, quote.folio));
    if (!ok) return;
    setSaving(true);
    try {
      await deleteQuoteLane(lane.id);
      onDirtyChange?.(false);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const numberInput = (key: keyof Draft, placeholder = "") => (
    <input
      inputMode="decimal"
      value={draft[key] as string}
      disabled={locked}
      placeholder={placeholder}
      onChange={(e) => set({ [key]: e.target.value } as Partial<Draft>)}
    />
  );

  const listInput = (key: keyof Draft, category: string, placeholder: string) => (
    <>
      <input
        list={`qd-${category}`}
        value={draft[key] as string}
        disabled={locked}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value } as Partial<Draft>)}
      />
      <datalist id={`qd-${category}`}>
        {cat(category).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </>
  );

  const markupLabel = MARKUP_MODES.find((m) => m.key === draft.markup_mode)?.label ?? "";

  return (
    <div className="qd-lane-grid">
      <section className="card qd-drivers">
        <div className="qd-card-head">
          <h2>{tr("text027")}</h2>
          <span className="pill orange">editable</span>
        </div>
        <p className="qd-muted qd-small">
          {tr("text028")}</p>
        <div className="qd-two">
          <LocationField label={tr("text029")} value={draft.origin} disabled={locked} onChange={(p) => set({ origin: p })} />
          <LocationField
            label={tr("text030")}
            value={draft.destination}
            disabled={locked}
            onChange={(p) => set({ destination: p })}
          />
        </div>
        <div className="qd-two">
          <label className="field">
            <span>{tr("text031")}</span>
            {listInput("operation", "operation", "Cross-border, Intra-Mex…")}
          </label>
          <label className="field">
            <span>{tr("text032")}</span>
            {listInput("service", "service", "One Way, Backhaul, Expedited…")}
            {/^backhaul$/i.test(draft.service.trim()) && (
              <small className="qd-muted">{tr("text033")}</small>
            )}
          </label>
        </div>
        <div className="qd-three">
          <label className="field">
            <span>{tr("text034")}</span>
            {listInput("equipment", "equipment", tr("text035"))}
          </label>
          <label className="field">
            <span>{tr("text036")}</span>
            {listInput("trailer", "trailer", tr("text037"))}
          </label>
          <label className="field">
            <span>{tr("text038")}</span>
            {listInput("config", "config", tr("text039"))}
          </label>
        </div>
        {crossBorder && (
          <div className="qd-two">
            <label className="field">
              <span>{tr("text040")}</span>
              <select
                value={draft.border_crossing}
                disabled={locked}
                onChange={(e) => set({ border_crossing: e.target.value })}
              >
                <option value="">{tr("text041")}</option>
                {(context?.border_crossings ?? []).map((c) => (
                  <option key={c.crossing_name} value={c.crossing_name}>
                    {c.crossing_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{tr("text042")}</span>
              <select
                value={draft.crossing_model}
                disabled={locked}
                onChange={(e) => set({ crossing_model: e.target.value })}
              >
                <option value="">—</option>
                {CROSSING_MODELS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="qd-two">
          <label className="field">
            <span>{tr("text043")}</span>
            {numberInput("weight_lb", "44,000")}
          </label>
          <label className="field">
            <span>{tr("text044")}</span>
            {numberInput("weekly_volume", "1")}
          </label>
        </div>

        <div className="qd-miles">
          <div className="qd-card-head">
            <strong>{tr("text045")}</strong>
            <button onClick={calculateMiles} disabled={locked || loadingMiles}>
              {loadingMiles ? tr("text046") : tr("text047")}
            </button>
          </div>
          <div className="qd-three">
            <label className="field">
              <span>{tr("text048")}</span>
              {numberInput("mx_miles", "0")}
            </label>
            <label className="field">
              <span>{tr("text049")}</span>
              {numberInput("us_miles", "0")}
            </label>
            <div className="field">
              <span>Total</span>
              <div className="qd-static mono">{totalMiles ? `${totalMiles.toLocaleString(locale())} mi` : "—"}</div>
            </div>
          </div>
          {miles && (
            <ul className="qd-legs">
              {miles.legs
                .filter((leg) => leg.scope !== "border")
                .map((leg, i) => (
                  <li key={i}>
                    <span className="pill">{leg.scope.toUpperCase()}</span> {leg.from} → {leg.to}:{" "}
                    {leg.found ? <strong className="mono">{leg.miles} mi</strong> : <em>{tr("text050")}</em>}
                    {leg.found && <span className="qd-muted"> · {leg.provider === "google_routes" ? "Google" : tr("text051")}</span>}
                  </li>
                ))}
            </ul>
          )}
          <p className="qd-muted qd-small">
            {context?.google_routes_enabled
              ? tr("text052")
              : tr("text053")}
          </p>
        </div>
      </section>

      <section className="card qd-calc">
        <div className="qd-card-head">
          <h2>{tr("text054")}</h2>
          <span className="pill blue">{lane?.cost_source === "bid_room_award" ? "Bid Room" : "editable"}</span>
        </div>
        {award && (
          <div className="banner info qd-award">
            <b>{tr("text055")}</b>
            <span>
              {award.vendor_name || "carrier"} a {money(award.bid_rate, award.currency)}
              {lane?.cost_source === "bid_room_award" ? tr("text056") : ""}
            </span>
          </div>
        )}
        <div className="qd-fcm">
          <div className="qd-card-head">
            <strong>{tr("text057")}</strong>
            <button onClick={estimateFcm} disabled={locked || estimating || !fcmBases?.bases.length}>
              {estimating ? tr("text058") : fcm ? tr("text059") : tr("text060")}
            </button>
          </div>
          {fcmBases && !fcmBases.bases.length ? (
            <p className="qd-muted qd-small">{tr("text061")}</p>
          ) : (
            <div className="qd-three">
              <label className="field">
                <span>{tr("text062")}</span>
                <select value={fcmBaseId} disabled={locked || !fcmBases} onChange={(e) => setFcmBaseId(e.target.value)}>
                  <option value="">{tr("text063")}</option>
                  {(fcmBases?.bases ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.scope_label ?? tr("text064")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{tr("text065")}</span>
                <select value={fcmTier} disabled={locked} onChange={(e) => setFcmTier(e.target.value as FcmTier)}>
                  {(["minimum", "target", "premium"] as FcmTier[]).map((t) => (
                    <option key={t} value={t}>
                      {FCM_TIER_LABEL[t]}
                      {fcmBase ? ` · ${pct(fcmBase.margins[t] * 100)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {hasMxLeg && (
                <label className="field">
                  <span>{tr("text066")}</span>
                  <input
                    inputMode="decimal"
                    value={fcmTolls}
                    disabled={locked}
                    placeholder={tr("text067")}
                    onChange={(e) => setFcmTolls(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}
          {fcmBase && (
            <p className="qd-muted qd-small" style={{ margin: "6px 0 0" }}>
              {tr("text068")}{" "}
              {new Date(fcmBase.synced_at).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })} {tr("text069")}{fcmBases?.engine_check?.status === "ok" &&
                tr("text070", fcmBases.engine_check.fcm_release ? tr("text071", fcmBases.engine_check.fcm_release) : "")}
              {fcmBases?.engine_check?.status === "unverified" && tr("text072")}
            </p>
          )}
          {fcmBases?.engine_check?.status === "review" && (
            <p className="qd-fcm-review">
              <b>{tr("text073")}</b> {fcmBases.engine_check.reasons.join(" ") || tr("text074")} {tr("text075")}</p>
          )}
          {fcm && <FcmSummary estimate={fcm} />}
        </div>
        <div className="qd-calc-rows">
          <CalcRow
            label={fcm?.mx ? tr("text076") : "Linehaul MX"}
            sub={
              fcm?.mx
                ? tr("text077", draft.mx_miles ? ` · ${draft.mx_miles} mi MX` : "")
                : draft.mx_miles
                  ? `${draft.mx_miles} mi MX`
                  : undefined
            }
          >
            {numberInput("linehaul_mx")}
          </CalcRow>
          <CalcRow
            label="Linehaul US"
            sub={
              fcm?.us
                ? `RPM US$${fcm.us.rpm.toFixed(2)} × ${fcm.us.miles.toLocaleString(locale())} mi`
                : draft.us_miles
                  ? `${draft.us_miles} mi US`
                  : undefined
            }
          >
            {numberInput("linehaul_us")}
          </CalcRow>
          <CalcRow label={tr("text078")} sub={fscSub}>
            {numberInput("fuel_amount")}
            {fuelSuggestion !== null && String(fuelSuggestion) !== draft.fuel_amount && !locked && (
              <button className="qd-link" onClick={() => set({ fuel_amount: String(fuelSuggestion) })}>
                {tr("text079")}{money(fuelSuggestion, currency)}
              </button>
            )}
          </CalcRow>
          {crossBorder && <CalcRow label={tr("text080")}>{numberInput("border_amount")}</CalcRow>}
          {(draft.carrier_rate || lane?.cost_source === "bid_room_award") && (
            <CalcRow label={tr("text081")} sub={tr("text082")}>
              {numberInput("carrier_rate")}
            </CalcRow>
          )}
          <CalcRow label={tr("text013")} auto value={amount(preview.base_cost)} strong />
          <CalcRow
            label={tr("text083")}
            sub={draft.accessorials.map((a) => a.label.toLowerCase()).join(", ") || tr("text084")}
            value={money(preview.accessorials_total, currency)}
          />
          <CalcRow
            label="Markup"
            sub={draft.markup_value ? `${markupLabel} · ${draft.markup_value}${draft.markup_mode === "fixed_amount" ? "" : "%"}` : tr("text085")}
            value={amount(preview.markup_amount)}
          />
          <CalcRow label={tr("text086")} auto value={amount(preview.all_in_rate)} accent />
          <CalcRow
            label={tr("text015")}
            auto
            value={preview.markup_amount === null ? "—" : `${pct(preview.margin_pct)} · ${amount(preview.markup_amount)}`}
            good
          />
        </div>
        <p className="qd-muted qd-small" style={{ margin: "8px 0 0" }}>
          {tr("text087")}</p>
        <button className="qd-wide" disabled={locked} onClick={() => setModal(true)}>
          {tr("text088")}</button>
        {preview.problem && <p className="qd-error">{preview.problem}</p>}
        <label className="field" style={{ marginTop: 12 }}>
          <span>{tr("text089")}</span>
          <textarea rows={2} value={draft.notes} disabled={locked} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        {error && <p className="qd-error">{error}</p>}
        {notice && <p className="qd-muted qd-small">{notice}</p>}
        <div className="row" style={{ marginTop: 12 }}>
          {lane && !lane.rfx_lane_id && !locked && (
            <button onClick={remove} disabled={saving}>
              {tr("text090")}</button>
          )}
          <div className="spacer" />
          {dirty && <span className="qd-muted qd-small">{tr("text091")}</span>}
          <button className="primary" disabled={locked || saving || !dirty} onClick={save}>
            {saving ? tr("text092") : lane ? tr("text093") : tr("text094")}
          </button>
        </div>
      </section>

      {modal && (
        <AccessorialsModal
          title={`${quote.folio} · ${quote.shipper_name ?? ""} · ${draft.origin?.label ?? tr("originFallback")} → ${draft.destination?.label ?? tr("destinationFallback")}`}
          catalog={context?.accessorial_catalog ?? []}
          currency={currency}
          fx={fx}
          components={components}
          initialLines={draft.accessorials}
          initialMode={draft.markup_mode}
          initialValue={draft.markup_value}
          onClose={() => setModal(false)}
          onApply={(lines, mode, value) => {
            set({ accessorials: lines, markup_mode: mode, markup_value: value });
            setModal(false);
          }}
        />
      )}
    </div>
  );
}

function FcmSummary({ estimate }: { estimate: FcmEstimate }) {
  useLang();
  const m = (v: number | null) => (v === null ? "—" : money(v, estimate.currency));
  const { mx, us, components: c } = estimate;
  const tolls =
    mx?.tolls_source === "none"
      ? tr("text095")
      : tr("text096", Math.round(mx?.tollsMxn ?? 0).toLocaleString(locale()), mx?.tolls_source === "manual" ? tr("text097") : "");
  return (
    <ul className="qd-fcm-summary">
      {estimate.equipment_label && (
        <li>
          <b>{tr("text098")}</b> {estimate.equipment_label}
        </li>
      )}
      {mx && (
        <li>
          <b>{tr("text099")}{m(c.linehaul_mx)}</b> · {Math.round(mx.km).toLocaleString(locale())} km · {tolls} ·{" "}
          {mx.hours.toFixed(1)} h
        </li>
      )}
      {us && (
        <li>
          <b>{tr("text100")}{m(c.linehaul_us)}</b> (RPM US${us.rpm.toFixed(2)}) + <b>FSC {m(c.fuel_amount)}</b> · $
          {us.fscPerMile.toFixed(2)}/mi @ ${us.dieselUsdGal.toFixed(2)}/gal · {us.fsc_region}
        </li>
      )}
      {c.border_amount !== null && (
        <li>
          <b>{tr("text101")}</b> {estimate.border.carries ? tr("text102", m(c.border_amount)) : tr("text103")}
        </li>
      )}
      <li>
        <b>{tr("text104")}{m(estimate.carrier_price)}</b> · {FCM_TIER_LABEL[estimate.tier]}{" "}
        {pct(estimate.margin * 100)} · {estimate.service}
        {estimate.service !== estimate.customer_service ? tr("text105", estimate.customer_service) : ""} ·{" "}
        {estimate.cost_base.name}
        {estimate.cost_base.auto ? tr("text106") : ""}
      </li>
      {estimate.warnings.map((w, i) => (
        <li key={i} className="qd-warn">
          {w}
        </li>
      ))}
    </ul>
  );
}

function CalcRow({
  label,
  sub,
  value,
  auto,
  strong,
  accent,
  good,
  children,
}: {
  label: string;
  sub?: string;
  value?: string;
  auto?: boolean;
  strong?: boolean;
  accent?: boolean;
  good?: boolean;
  children?: ReactNode;
}) {
  useLang();
  return (
    <div className={`qd-calc-row${strong ? " strong" : ""}${accent ? " accent" : ""}${good ? " good" : ""}`}>
      <div>
        <span className="qd-calc-label">
          {label}
          {auto && <em className="qd-auto">auto</em>}
        </span>
        {sub && <span className="qd-calc-sub">{sub}</span>}
      </div>
      <div className="qd-calc-value">{children ?? <strong className="mono">{value}</strong>}</div>
    </div>
  );
}
