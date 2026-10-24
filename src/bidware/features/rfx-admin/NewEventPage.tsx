import { getLang } from "@/i18n/language";
import { tr } from "@/i18n/rfx-admin";
import { useLang } from "@/i18n/language";
import { confirmAsync } from "@/components/confirm";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ShipperPicker } from "@/components/ShipperPicker";
import { useAsync } from "@/components/useAsync";
import { ErrorBanner, InfoBanner, Pill, Spinner } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { ApiError } from "@/lib/api-client";
import { SEGMENTS } from "@/features/shipper-request/rubric";
import { getShipper } from "@/features/shippers/shippers.service";
import type { ShipperOption } from "@/features/quotedesk/quotedesk.service";
import type { RfxEvent } from "@/types/domain";
import {
  createEvent,
  EVENT_TYPES,
  importLanes,
  IMPORT_ROW_LIMIT,
  loadDraftSettings,
  mostCommon,
  RUBRICS,
  saveDraftSettings,
  suggestRfxId,
  updateDraft,
  VISIBILITY_MODES,
  type DraftFields,
  type LaneRubrics,
} from "./newEvent.service";
import { aliasesToSave, RUBRIC_KEYS, toImportRows } from "./laneImport";
import { saveCatalogAlias, saveLocationAlias } from "./laneSources";
import { LaneLoader, useLaneReview } from "./LaneLoader";
import { NewEventLaunch } from "./NewEventLaunch";
import { fetchRfxDetail, listRfxEvents, updateRfxLane } from "./rfx.service";
import type { LaneWithInvitations } from "./stages";

const CURRENCIES = ["USD", "MXN"] as const;

type Screen = "details" | "lanes" | "launch";

const text = (value: unknown) => String(value ?? "").trim();

const optionOf = (row: Record<string, unknown>): ShipperOption => ({
  id: String(row.id),
  shipper_name: (row.shipper_name as string) ?? null,
  legal_name: (row.legal_name as string) ?? null,
  industry: (row.industry as string) ?? null,
  headquarters_city: (row.headquarters_city as string) ?? null,
  headquarters_state: (row.headquarters_state as string) ?? null,
  primary_contact_name: (row.primary_contact_name as string) ?? null,
  primary_contact_email: (row.primary_contact_email as string) ?? null,
});

/** The rubric fields a lane doesn't carry yet in the cédula's words; empty rubros never erase a lane's own text. */
function rubricPatch(lane: LaneWithInvitations, rubrics: LaneRubrics) {
  const patch: Record<string, string> = {};
  for (const key of RUBRIC_KEYS) {
    const wanted = text(rubrics[key]);
    if (wanted && wanted !== text(lane[key])) patch[key] = wanted;
  }
  return patch;
}

/**
 * Creating a bid event from scratch (wireframes 13, 28, 14 and 15), for the
 * bids that don't come from a shipper magic link. The event is a draft from
 * the first save; the cédula and the lanes are loaded into it, and the launch
 * adds the carriers and prepares the invitations behind the send gate.
 */
export function NewEventPage() {
  useLang();
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canWork = can("operate");
  const screen: Screen = !id ? "details" : params.get("step") === "4" ? "launch" : params.get("step") === "3" ? "lanes" : "details";
  const go = (next: Screen, draftId = id) =>
    navigate(`/rfx/new${draftId ? `/${draftId}` : ""}${next === "lanes" ? "?step=3" : next === "launch" ? "?step=4" : ""}`);

  const detail = useAsync(() => (id ? fetchRfxDetail(id) : Promise.resolve(null)), [id]);
  const event = (detail.data?.event ?? null) as RfxEvent | null;
  const draftLanes = (detail.data?.lanes ?? []) as LaneWithInvitations[];

  // Paso 1
  const [shipper, setShipper] = useState<ShipperOption | null>(null);
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<string>("rfx");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [rfxId, setRfxId] = useState("");
  const [suggested, setSuggested] = useState("");
  const [segment, setSegment] = useState("crossborder");
  const [visibility, setVisibility] = useState<string>("anonymous_rank");
  // Paso 2
  const [rubrics, setRubrics] = useState<LaneRubrics>({});
  const [hydrated, setHydrated] = useState(!id);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aliasesSaved, setAliasesSaved] = useState(0);

  // Paso 3
  const lanes = useLaneReview();
  const aliases = can("admin") ? aliasesToSave(lanes.reviews, lanes.choices, lanes.placeChoices) : { catalog: [], places: [] };
  const shipperName = shipper ? shipper.shipper_name || shipper.legal_name || "" : text(event?.customer);
  const segmentName = SEGMENTS.find((s) => s.value === segment)?.[getLang()] ?? segment;

  // A new event starts from the next key in the team's style.
  useEffect(() => {
    if (id) return;
    let live = true;
    listRfxEvents()
      .then((rows) => {
        if (!live) return;
        const next = suggestRfxId(rows);
        setSuggested(next);
        setRfxId((current) => current || next);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id]);

  // A draft opens as it was left: its own fields, and what this browser kept for it.
  useEffect(() => {
    const loaded = detail.data?.event as RfxEvent | undefined;
    if (!id || hydrated || !loaded) return;
    const rows = (detail.data?.lanes ?? []) as LaneWithInvitations[];
    const settings = loadDraftSettings(id);
    setName(text(loaded.name));
    setEventType(text(loaded.event_type) || "rfx");
    setDueDate(text(loaded.due_date).slice(0, 10));
    setStartDate(text(loaded.operation_start_date).slice(0, 10));
    setVisibility(text(loaded.bid_visibility_mode) || "anonymous_rank");
    setRfxId(text(loaded.rfx_id));
    setSegment(settings.segment ?? mostCommon(rows.map((lane) => lane.rfx_segment_key)) ?? "crossborder");
    setCurrency(settings.currency ?? mostCommon(rows.map((lane) => lane.currency)) ?? "USD");
    setRubrics(
      settings.rubrics ??
        (Object.fromEntries(RUBRIC_KEYS.map((key) => [key, text(rows[0]?.[key])]).filter(([, value]) => value)) as LaneRubrics),
    );
    const customerId = text(loaded.customer_id);
    if (customerId) {
      setShipper({ ...optionOf({ id: customerId }), shipper_name: text(loaded.customer) || null });
      getShipper(customerId)
        .then((found) => found.row && setShipper(optionOf(found.row as unknown as Record<string, unknown>)))
        .catch(() => undefined);
    }
    setHydrated(true);
  }, [id, hydrated, detail.data]);

  const missingDetails = [!shipper && tr("text393"), !name.trim() && tr("text488"), !dueDate && tr("text489")].filter(
    Boolean,
  ) as string[];

  /** Creates the draft, or saves what changed; the cédula goes on every lane already loaded. */
  async function saveDetails(): Promise<string | null> {
    if (missingDetails.length) {
      setError(tr("text413", missingDetails.join(", ")));
      return null;
    }
    setBusy("details");
    setError(null);
    setNotice(null);
    try {
      const fields: DraftFields = {
        name: name.trim(),
        customer: shipperName || null,
        customer_id: shipper?.id ?? null,
        rfx_id: rfxId.trim() || undefined,
        event_type: eventType,
        bid_visibility_mode: visibility,
        due_date: dueDate || null,
        operation_start_date: startDate || null,
      };
      let draftId = id ?? null;
      if (!draftId) {
        const row = await createEvent({ ...fields, customer: fields.customer ?? undefined });
        draftId = row.id;
      } else if (event) {
        const patch: Partial<DraftFields> = {};
        if (fields.name !== text(event.name)) patch.name = fields.name;
        if ((fields.customer_id ?? "") !== text(event.customer_id)) {
          patch.customer_id = fields.customer_id;
          patch.customer = fields.customer;
        }
        if (fields.rfx_id && fields.rfx_id !== text(event.rfx_id)) patch.rfx_id = fields.rfx_id;
        if (fields.event_type !== text(event.event_type)) patch.event_type = fields.event_type;
        if (fields.bid_visibility_mode !== text(event.bid_visibility_mode)) patch.bid_visibility_mode = fields.bid_visibility_mode;
        if ((fields.due_date ?? "") !== text(event.due_date).slice(0, 10)) patch.due_date = fields.due_date;
        if ((fields.operation_start_date ?? "") !== text(event.operation_start_date).slice(0, 10)) {
          patch.operation_start_date = fields.operation_start_date;
        }
        if (Object.keys(patch).length) await updateDraft(draftId, patch);
        const stale = draftLanes.filter((lane) => Object.keys(rubricPatch(lane, rubrics)).length);
        for (const [position, lane] of stale.entries()) {
          setBusy(tr("text490", position + 1, stale.length));
          await updateRfxLane(String(lane.id), rubricPatch(lane, rubrics));
        }
      }
      saveDraftSettings(draftId, { segment, currency, rubrics });
      return draftId;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    const draftId = await saveDetails();
    if (!draftId) return;
    setNotice(tr("text491"));
    if (!id) navigate(`/rfx/new/${draftId}`, { replace: true });
    else detail.reload();
  }

  async function toLanes() {
    const draftId = await saveDetails();
    if (!draftId) return;
    if (id) detail.reload();
    go("lanes", draftId);
  }

  /** Loads the reviewed lanes into the draft. True when there's nothing left to load. */
  async function loadLanes(): Promise<number | null> {
    if (!id) return null;
    const { summary } = lanes;
    if (!summary.total || !summary.ready) return 0;
    if (summary.searching) {
      setError(tr("text492"));
      return null;
    }
    if (summary.pending) {
      setError(tr("text493", summary.pending));
      return null;
    }
    if (summary.ready > IMPORT_ROW_LIMIT) {
      setError(tr("text494", IMPORT_ROW_LIMIT, summary.ready));
      return null;
    }
    const saving = aliases.catalog.length + aliases.places.length;
    if (
      saving &&
      !(await confirmAsync(
        tr("text495", saving),
      ))
    )
      return null;
    setBusy("lanes");
    setError(null);
    setNotice(null);
    const failed: string[] = [];
    const conflicts: string[] = [];
    try {
      // Synonyms first: they only help the next file, so one that fails doesn't stop the lanes.
      for (const alias of aliases.catalog) {
        await saveCatalogAlias(alias.field, alias.raw, alias.value).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 409 && error.code === "CATALOG_ALIAS_CONFLICT") {
            conflicts.push(alias.raw);
          } else {
            failed.push(alias.raw);
          }
        });
      }
      for (const alias of aliases.places) {
        await saveLocationAlias(alias.alias, String(alias.option.id)).catch(() => failed.push(alias.alias));
      }
      // A retry is safe: the server skips lanes the event already has.
      const res = await importLanes(
        id,
        toImportRows(lanes.reviews, rubrics, { currency, segmentKey: segment, segmentName }),
      );
      setAliasesSaved((n) => n + saving - failed.length - conflicts.length);
      saveDraftSettings(id, { segment, currency, rubrics });
      lanes.clear();
      detail.reload();
      const problems = [
        res.skipped ? tr("text496", res.skipped) : "",
        res.droppedSilently ? tr("text497", res.droppedSilently) : "",
        failed.length ? tr("text498", failed.length, failed.join(", ")) : "",
        conflicts.length ? tr("text770", conflicts.length, conflicts.join(", ")) : "",
      ].filter(Boolean);
      setNotice(tr("text499", res.inserted, problems.length ? ` · ${problems.join(" · ")}` : ""));
      return res.inserted;
    } catch (e) {
      setError(tr("text500", (e as Error).message));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function toLaunch() {
    const inserted = await loadLanes();
    if (inserted === null) return;
    if (!draftLanes.length && !inserted) {
      setError(tr("text501"));
      return;
    }
    go("launch");
  }

  if (id && detail.loading && !detail.data) return <Spinner label={tr("text502")} />;
  if (id && detail.error) return <ErrorBanner message={detail.error} />;
  if (id && event && !["draft", "open"].includes(text(event.status))) {
    return (
      <main className="main">
        <InfoBanner title={tr("text503")}>
          {tr("text504")}<Link to={`/rfx/${id}`}>{tr("text505")}</Link>
        </InfoBanner>
      </main>
    );
  }

  const steps: { key: Screen | "cedula"; label: string }[] = [
    { key: "details", label: tr("text506") },
    { key: "cedula", label: tr("text507") },
    { key: "lanes", label: tr("text061") },
    { key: "launch", label: tr("text508") },
  ];
  const position = screen === "details" ? 0 : screen === "lanes" ? 2 : 3;
  const coreDone = RUBRICS.slice(0, 3).filter((r) => text(rubrics[r.key])).length;
  const anyRubric = RUBRICS.some((r) => text(rubrics[r.key]));
  const kept = lanes.summary.ready + lanes.summary.pending;

  if (screen === "details") {
    return (
      <>
        <header className="nev-top">
          <p className="nev-crumb">{tr("text509")}{event ? tr("text510", text(event.rfx_id)) : ""}</p>
          <h1>{event ? name || tr("text511") : tr("text512")}</h1>
          <p>
            {event
              ? tr("text513")
              : tr("text514")}
          </p>
        </header>
        <nav className="nev-rail" aria-label={tr("text515")}>
          {[
            { n: 1, label: tr("text516"), state: tr("text517"), on: true },
            { n: 2, label: tr("text518"), state: anyRubric ? (coreDone === 3 ? tr("text346") : tr("text517")) : tr("text519"), on: anyRubric },
            { n: 3, label: tr("text061"), state: draftLanes.length ? tr("text520", draftLanes.length) : tr("text521"), on: false },
            { n: 4, label: tr("text508"), state: tr("text521"), on: false },
          ].map((s) => (
            <div key={s.n} className={`nev-rail-step${s.n === 1 ? " current" : ""}${s.on ? " on" : ""}`}>
              <span>
                <i>{s.n}</i>
                {s.label}
              </span>
              <em>{s.state}</em>
            </div>
          ))}
        </nav>
        <main className="nev-details">
          <div className="nev-steps12">
            <section className="nev-card nev-step1">
              <header>
                <b>{tr("text522")}</b>
                <Pill tone="amber">{tr("text517")}</Pill>
              </header>
              <div className="nev-field">
                <span>Shipper *</span>
                <ShipperPicker value={shipper} onChange={setShipper} appearance="card" />
                <em className="nev-hint">{tr("text523")}</em>
              </div>
              <label className="nev-field">
                <span>{tr("text524")}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Manzanillo → GDL, MEX & MTY | FTL MX Drayage" />
              </label>
              <div className="nev-field">
                <span>{tr("text525")}</span>
                <div className="nev-types" role="radiogroup">
                  {EVENT_TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="radio"
                      aria-checked={eventType === t.key}
                      className={eventType === t.key ? "on" : undefined}
                      title={t.hint}
                      onClick={() => setEventType(t.key)}
                    >
                      {t.key === "rfx" ? tr("text526") : t.label}
                    </button>
                  ))}
                </div>
                <em className="nev-hint">{tr("text527")}</em>
              </div>
              <div className="nev-pair">
                <label className="nev-field">
                  <span>{tr("text528")}</span>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
                <label className="nev-field">
                  <span>{tr("text529")}</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
              </div>
              <div className="nev-pair">
                <label className="nev-field">
                  <span>RFx ID</span>
                  <div className="nev-auto">
                    <input className="mono" value={rfxId} onChange={(e) => setRfxId(e.target.value)} placeholder={tr("text409")} />
                    {rfxId && rfxId === suggested && <em>· auto</em>}
                  </div>
                </label>
                <label className="nev-field">
                  <span>{tr("text530")}</span>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <em className="nev-hint">
                {tr("text531")}</em>
              <div className="nev-pair">
                <label className="nev-field">
                  <span>{tr("text050")}</span>
                  <select value={segment} onChange={(e) => setSegment(e.target.value)}>
                    {SEGMENTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.value} · {s[getLang()]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="nev-field">
                  <span>{tr("text058")}</span>
                  <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                    {VISIBILITY_MODES.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.key} · {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <em className="nev-hint">{VISIBILITY_MODES.find((m) => m.key === visibility)?.hint}</em>
              {draftLanes.length > 0 && (
                <em className="nev-hint">
                  {tr("text532")}{draftLanes.length} {tr("text533")}</em>
              )}
            </section>

            <section className="nev-card nev-step2">
              <header>
                <b>{tr("text534")}</b>
                <Pill tone={coreDone === 3 ? "green" : anyRubric ? "amber" : ""}>
                  {coreDone === 3 ? tr("text346") : anyRubric ? tr("text517") : tr("text519")}
                </Pill>
              </header>
              <p className="nev-info">{tr("text535")}</p>
              {RUBRICS.map((r) => {
                const filled = Boolean(text(rubrics[r.key]));
                return (
                  <label key={r.key} className={`nev-rubric${filled ? " filled" : ""}`}>
                    <span>
                      {r.label}
                      {filled && <b>✓</b>}
                    </span>
                    <textarea
                      rows={2}
                      value={rubrics[r.key] ?? ""}
                      placeholder={r.placeholder}
                      onChange={(e) => setRubrics((prev) => ({ ...prev, [r.key]: e.target.value }))}
                    />
                  </label>
                );
              })}
            </section>
          </div>

          <aside className="nev-card nev-balance">
            <p className="nev-kicker">{tr("text536")}</p>
            <div className="nev-good">
              <b>{tr("text537")}</b>
              <span>
                {tr("text538")}</span>
            </div>
            <div className="nev-cost">
              <b>{tr("text539")}</b>
              <span>
                {tr("text540")}</span>
            </div>
            <p>{tr("text541")}</p>
            {draftLanes.length > 0 && <p className="nev-note">{tr("text542")}{draftLanes.length} {tr("text543")}</p>}
            {error && <ErrorBanner message={error} />}
            {notice && <InfoBanner>{notice}</InfoBanner>}
            <div className="nev-balance-actions">
              <button disabled={Boolean(busy) || !canWork} title={canWork ? undefined : NEED_REASON.operate} onClick={saveDraft}>
                {tr("text544")}</button>
              <button
                className="primary"
                disabled={Boolean(busy) || !canWork}
                title={canWork ? (missingDetails.length ? tr("text413", missingDetails.join(", ")) : undefined) : NEED_REASON.operate}
                onClick={toLanes}
              >
                {busy ? (busy === "details" ? tr("text268") : busy) : tr("text545")}
              </button>
            </div>
          </aside>
        </main>
      </>
    );
  }

  const header = (
    <header className="nev-head">
      <div>
        <p className="nev-crumb2">{tr("text546")}</p>
        <div className="nev-title">
          <h1>{name || text(event?.name) || tr("text547")}</h1>
          <Pill tone="amber">{tr("text548")}</Pill>
          <Pill tone="violet">{tr("text397")}</Pill>
          <span className="mono">{[shipperName, text(event?.rfx_id)].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      <span className="spacer" />
      {screen === "lanes" ? (
        <>
          <button disabled={Boolean(busy) || !canWork} title={canWork ? undefined : NEED_REASON.operate} onClick={() => void loadLanes()}>
            {tr("text544")}</button>
          <button className="primary" disabled={Boolean(busy) || !canWork} title={canWork ? undefined : NEED_REASON.operate} onClick={toLaunch}>
            {busy === "lanes" ? tr("text549") : tr("text550")}
          </button>
        </>
      ) : (
        <button onClick={() => navigate(`/rfx/${id}`)}>{tr("text544")}</button>
      )}
    </header>
  );

  const stepper = (
    <nav className="nev-steps" aria-label={tr("text515")}>
      {steps.map((s, i) => {
        const done = i < position || (s.key === "cedula" && position > 0);
        const current = i === position;
        return (
          <div key={s.key} className={`nev-step${done ? " done" : ""}${current ? " current" : ""}`}>
            {i > 0 && <hr />}
            <button
              type="button"
              disabled={Boolean(busy) || current}
              onClick={() => go(s.key === "cedula" ? "details" : (s.key as Screen))}
            >
              <i>{done ? "✓" : i + 1}</i>
              {s.label}
            </button>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {header}
      <main className="nev-body">
        {stepper}
        {error && <ErrorBanner message={error} />}
        {notice && <InfoBanner>{notice}</InfoBanner>}

        {screen === "lanes" && (
          <>
            {draftLanes.length > 0 && (
              <InfoBanner title={tr("text551", draftLanes.length)}>
                {tr("text552")}</InfoBanner>
            )}
            <LaneLoader state={lanes} shipperId={shipper?.id ?? null} shipperName={shipperName} currency={currency} />
            <footer className="nev-foot">
              <p>
                {lanes.summary.total
                  ? tr("text553", kept, lanes.summary.total) +
                    (lanes.summary.pending ? tr("text554", lanes.summary.pending) : ".")
                  : draftLanes.length
                    ? tr("text555", draftLanes.length)
                    : tr("text556")}
              </p>
              <button disabled={Boolean(busy)} onClick={() => go("details")}>
                {tr("text557")}</button>
              <button className="primary" disabled={Boolean(busy) || !canWork} title={canWork ? undefined : NEED_REASON.operate} onClick={toLaunch}>
                {tr("text558")}</button>
            </footer>
          </>
        )}

        {screen === "launch" && event && (
          <>
            <NewEventLaunch
              event={event}
              lanes={draftLanes}
              rubrics={rubrics}
              segment={segment}
              currency={currency}
              aliasesSaved={aliasesSaved}
              onEditDetails={() => go("details")}
              onEditLanes={() => go("lanes")}
            />
            <footer className="nev-foot">
              <p>{tr("text559")}</p>
              <button onClick={() => go("lanes")}>{tr("text560")}</button>
            </footer>
          </>
        )}
      </main>
    </>
  );
}
