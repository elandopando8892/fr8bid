import { getLang } from "@/i18n/language";
import { tr } from "@/i18n/rfx-admin";
import { useLang } from "@/i18n/language";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { ShipperPicker } from "@/components/ShipperPicker";
import { ErrorBanner, Pill } from "@/components/ui";
import { SEGMENTS } from "@/features/shipper-request/rubric";
import type { ShipperOption } from "@/features/quotedesk/quotedesk.service";
import { listRfxEvents } from "./rfx.service";
import { createEvent, EVENT_TYPES, saveDraftSettings, suggestRfxId, VISIBILITY_MODES } from "./newEvent.service";

/**
 * Nuevo bid event (wireframe 13): the event is created as a draft right here,
 * and the cédula and the lanes are loaded into it next. Nothing is sent and no
 * carrier is added until the launch.
 */
export function NewEventDialog({ onClose }: { onClose: () => void }) {
  useLang();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canWork = can("operate");
  const [shipper, setShipper] = useState<ShipperOption | null>(null);
  const [eventType, setEventType] = useState<string>("rfx");
  const [name, setName] = useState("");
  const [suggested, setSuggested] = useState("");
  const [rfxId, setRfxId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [segment, setSegment] = useState("crossborder");
  const [visibility, setVisibility] = useState<string>("anonymous_rank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const missing = [!shipper && tr("text393"), !name.trim() && tr("text394"), !dueDate && tr("text395")].filter(Boolean) as string[];

  async function create() {
    if (missing.length || !canWork) return;
    setBusy(true);
    setError(null);
    try {
      const row = await createEvent({
        name: name.trim(),
        customer: shipper?.shipper_name || shipper?.legal_name || undefined,
        // The CRM shipper, so the event shows on its profile and in its Ratebook.
        customer_id: shipper?.id ?? null,
        rfx_id: rfxId.trim() || undefined,
        event_type: eventType,
        bid_visibility_mode: visibility,
        due_date: dueDate || null,
        operation_start_date: startDate || null,
      });
      saveDraftSettings(row.id, { segment });
      navigate(`/rfx/new/${row.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="nev-overlay" role="dialog" aria-modal="true" aria-labelledby="nev-title">
      <div className="nev-modal">
        <header className="nev-modal-head">
          <div>
            <div className="row" style={{ gap: 8 }}>
              <h2 id="nev-title">{tr("text396")}</h2>
              <Pill tone="violet">{tr("text397")}</Pill>
            </div>
            <p>{tr("text398")}</p>
          </div>
          <button className="link nev-close" aria-label={tr("text399")} disabled={busy} onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="nev-tip">
          <b>{tr("text400")}</b>
          <span>
            {tr("text401")}<Link to="/intake">Shipper intake</Link> {tr("text402")}</span>
        </div>

        <div className="nev-field">
          <span>{tr("text403")}</span>
          <ShipperPicker value={shipper} onChange={setShipper} appearance="card" autoFocus />
          <a className="nev-create" href="/shippers" target="_blank" rel="noreferrer">
            {tr("text404")}</a>
        </div>

        <div className="nev-field">
          <span>{tr("text405")}</span>
          <div className="nev-segmented" role="radiogroup">
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
                {t.key === "rfx" ? tr("text406") : t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="nev-pair">
          <label className="nev-field">
            <span>{tr("text407")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("text408")} />
          </label>
          <label className="nev-field">
            <span>RFx ID</span>
            <div className="nev-auto">
              <input className="mono" value={rfxId} onChange={(e) => setRfxId(e.target.value)} placeholder={tr("text409")} />
              {rfxId && rfxId === suggested && <em>· auto</em>}
            </div>
          </label>
        </div>

        <div className="nev-pair">
          <label className="nev-field">
            <span>{tr("text410")}</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="nev-field">
            <span>{tr("text060")}</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        </div>

        <div className="nev-pair">
          <label className="nev-field">
            <span className="nev-label-enum">
              {tr("text411")}<Pill tone="green">enum</Pill>
            </span>
            <select value={segment} onChange={(e) => setSegment(e.target.value)}>
              {SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.value} · {s[getLang()]}
                </option>
              ))}
            </select>
          </label>
          <label className="nev-field">
            <span className="nev-label-enum">
              {tr("text412")}<Pill tone="green">enum</Pill>
            </span>
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

        {error && <ErrorBanner message={error} />}

        <footer className="nev-modal-foot">
          <p>
            {missing.length
              ? tr("text413", missing.join(", "))
              : tr("text414")}
          </p>
          <button disabled={busy} onClick={onClose}>
            {tr("text258")}</button>
          <button
            className="primary"
            disabled={busy || !canWork || missing.length > 0}
            title={canWork ? undefined : NEED_REASON.operate}
            onClick={create}
          >
            {busy ? tr("text415") : tr("text416")}
          </button>
        </footer>
      </div>
    </div>
  );
}
