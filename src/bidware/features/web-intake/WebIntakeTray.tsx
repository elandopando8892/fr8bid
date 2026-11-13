import { tr } from "@/i18n/web-intake";
import { useLang, locale } from "@/i18n/language";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useAsync } from "@/components/useAsync";
import { Dialog, Empty, ErrorBanner, InfoBanner, Pill, Spinner } from "@/components/ui";
import { promptAsync } from "@/components/confirm";
import { ShipperPicker } from "@/components/ShipperPicker";
import type { ShipperOption } from "@/features/quotedesk/quotedesk.service";
import { listVendors } from "@/features/carrier-crm/crm.service";
import type { Vendor } from "@/types/domain";
import {
  decisionError,
  dismissWebIntake,
  laneFromLead,
  listWebIntake,
  missingForPromotion,
  promoteWebLead,
  registerWebRateSheet,
  webRateSheetUrl,
  type WebIntake,
  type WebLane,
} from "./webIntake.service";

const SITE: Record<string, string> = { marksman: "MARKSMAN", xbf: "XBF", holding: "Grupo" };
const text = (lead: Record<string, unknown>, key: string) => (typeof lead[key] === "string" ? String(lead[key]) : "");
const isXlsx = (row: WebIntake) => /\.xlsx$/i.test(text(row.lead, "file_name"));
const stamp = (value: string) => {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "—" : at.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

function Status({ row }: { row: WebIntake }) {
  if (!row.review) return <Pill tone="orange">{tr("pending")}</Pill>;
  const tone = row.review.decision === "dismissed" ? "" : "green";
  return <Pill tone={tone}>{tr(row.review.decision)}</Pill>;
}

/**
 * Shipper leads and carrier rate sheets from the public sites. Hidden for any
 * workspace other than the commercial one (the server answers 403).
 */
export function WebIntakeTray({ onPromoted }: { onPromoted?: () => void }) {
  useLang();
  const { can, roleLoaded } = useAuth();
  const canOperate = roleLoaded && can("operate");
  const [tab, setTab] = useState<"lead" | "rate_sheet">("lead");
  const [pendingOnly, setPendingOnly] = useState(true);
  const [promoting, setPromoting] = useState<WebIntake | null>(null);
  const [registering, setRegistering] = useState<WebIntake | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string; error?: boolean; uploads?: boolean } | null>(null);
  const intake = useAsync(() => listWebIntake(), []);
  const hidden = intake.error !== null && /web_intake_forbidden|Unknown QuoteDesk action/.test(intake.error);

  const rows = useMemo(() => (intake.data ?? [])
    .filter((row) => row.kind === tab && (!pendingOnly || !row.review)), [intake.data, tab, pendingOnly]);
  const pendingCount = (kind: string) => (intake.data ?? []).filter((row) => row.kind === kind && !row.review).length;

  if (hidden) return null;

  async function dismiss(row: WebIntake) {
    const note = await promptAsync(`${tr("dismissPrompt")} ${tr("final")}`);
    if (note === null) return;
    setRowBusy(row.id);
    try {
      await dismissWebIntake(row.id, note);
      setNotice({ id: row.id, text: tr("doneDismissed") });
      intake.reload();
    } catch (error) {
      setNotice({ id: row.id, text: decisionError(error), error: true });
    } finally {
      setRowBusy(null);
    }
  }

  async function openFile(row: WebIntake) {
    setRowBusy(row.id);
    try {
      const { url } = await webRateSheetUrl(row.id);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      setNotice({ id: row.id, text: decisionError(error), error: true });
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <section className="web-intake">
      <header>
        <h2>{tr("title")}</h2>
        <div className="web-intake-tabs" role="tablist">
          {(["lead", "rate_sheet"] as const).map((kind) => (
            <button key={kind} role="tab" aria-selected={tab === kind} className={tab === kind ? "primary" : undefined}
              onClick={() => setTab(kind)}>
              {kind === "lead" ? tr("tabLeads") : tr("tabSheets")}
              {pendingCount(kind) ? <span className="tab-count">{pendingCount(kind)}</span> : null}
            </button>
          ))}
          <label className="web-intake-filter">
            <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} /> {tr("pendingOnly")}
          </label>
        </div>
      </header>
      <p className="web-intake-hint">{tr("hint")}</p>
      {!canOperate && roleLoaded && <InfoBanner>{tr("readOnly")}</InfoBanner>}
      {intake.loading && <Spinner label={tr("loading")} />}
      {intake.error && !hidden && <ErrorBanner message={intake.error} />}
      {!intake.loading && !intake.error && (rows.length ? (
        <table className="data web-intake-table">
          <thead>
            <tr>
              <th>{tr("colWhen")}</th>
              <th>{tr("colSite")}</th>
              <th>{tr("colCompany")}</th>
              <th>{tab === "lead" ? tr("colCorridor") : tr("colFile")}</th>
              <th>{tr("colStatus")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="mono">{stamp(row.created_at)}</td>
                <td>{SITE[row.source_site] ?? row.source_site}</td>
                <td>
                  <div className="cell-title">{text(row.lead, "company")}</div>
                  <div className="cell-sub">{[text(row.lead, "name"), text(row.lead, "email")].filter(Boolean).join(" · ")}</div>
                </td>
                <td>
                  {row.kind === "lead" ? (
                    <>
                      <div>{text(row.lead, "origin_city")} → {text(row.lead, "destination_city")}</div>
                      <div className="cell-sub">{[text(row.lead, "truck_type"), text(row.lead, "loads_per_week") && `${text(row.lead, "loads_per_week")}/sem`]
                        .filter(Boolean).join(" · ")}</div>
                    </>
                  ) : (
                    <>
                      <div className="mono">{text(row.lead, "file_name")}</div>
                      <div className="cell-sub">{text(row.lead, "coverage")}</div>
                    </>
                  )}
                  {notice?.id === row.id && (
                    <div className={notice.error ? "web-intake-msg error" : "web-intake-msg"}>
                      {notice.text}
                      {notice.uploads && <> <a href="/archivos">{tr("openUploads")}</a></>}
                    </div>
                  )}
                </td>
                <td><Status row={row} /></td>
                <td className="web-intake-act">
                  {row.kind === "rate_sheet" && (
                    <button className="ne-link" disabled={rowBusy !== null} onClick={() => openFile(row)}>{tr("viewFile")}</button>
                  )}
                  {!row.review && canOperate && (
                    <>
                      {row.kind === "lead" ? (
                        <button className="ne-link" disabled={rowBusy !== null} onClick={() => setPromoting(row)}>{tr("promote")}</button>
                      ) : isXlsx(row) ? (
                        <button className="ne-link" disabled={rowBusy !== null} onClick={() => setRegistering(row)}>{tr("register")}</button>
                      ) : (
                        <span className="cell-sub">{tr("xlsxOnly")}</span>
                      )}
                      <button className="ne-link" disabled={rowBusy !== null} onClick={() => dismiss(row)}>{tr("dismiss")}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty title={tab === "lead" ? tr("emptyLeads") : tr("emptySheets")} />
      ))}
      {promoting && (
        <PromoteDialog row={promoting} onClose={() => setPromoting(null)} onDone={() => {
          setNotice({ id: promoting.id, text: tr("donePromoted") });
          setPromoting(null);
          intake.reload();
          onPromoted?.();
        }} />
      )}
      {registering && (
        <RegisterDialog row={registering} onClose={() => setRegistering(null)} onDone={() => {
          setNotice({ id: registering.id, text: tr("doneRegistered"), uploads: true });
          setRegistering(null);
          intake.reload();
        }} />
      )}
    </section>
  );
}

function PromoteDialog({ row, onClose, onDone }: { row: WebIntake; onClose: () => void; onDone: () => void }) {
  useLang();
  const [shipper, setShipper] = useState<ShipperOption | null>(null);
  const [lane, setLane] = useState<WebLane>(() => laneFromLead(row.lead));
  const [currency, setCurrency] = useState<"USD" | "MXN">(text(row.lead, "currency").toUpperCase() === "MXN" ? "MXN" : "USD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = missingForPromotion(lane, shipper?.id ?? null);
  const set = (key: keyof WebLane) => (e: { target: { value: string } }) => setLane((l) => ({ ...l, [key]: e.target.value }));
  const fields: [keyof WebLane, string, boolean][] = [
    ["origin_text", tr("origin"), true], ["destination_text", tr("destination"), true], ["truck_type", tr("truckType"), true],
    ["weekly_volume", tr("loadsPerWeek"), true], ["trailer_requirements", tr("trailer"), false], ["average_weight", tr("weight"), false],
    ["border_crossing", tr("border"), false], ["product", tr("product"), false], ["target_rate", tr("targetRate"), false],
  ];

  async function submit() {
    if (!shipper || missing.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      await promoteWebLead(row.id, shipper.id, lane, currency);
      onDone();
    } catch (e) {
      setError(decisionError(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title={tr("promoteTitle")} ariaLabel={tr("promoteTitle")} onClose={busy ? () => undefined : onClose} width={720}
      footer={<>
        <span className="cell-sub">{missing.length ? tr("missing", missing.join(", ")) : tr("final")}</span>
        <button onClick={onClose} disabled={busy}>{tr("cancel")}</button>
        <button className="primary" onClick={submit} disabled={busy || missing.length > 0}>{busy ? tr("working") : tr("confirmPromote")}</button>
      </>}>
      <p className="web-intake-hint">{tr("promoteHint")}</p>
      <details className="web-intake-raw">
        <summary>{tr("visitorWrote")}</summary>
        <dl>
          {Object.entries(row.lead).filter(([k, v]) => typeof v === "string" && v && !["schema_version", "site", "source", "language"].includes(k))
            .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}
        </dl>
      </details>
      <div className="intake-field">
        <span>{tr("shipper")}</span>
        <ShipperPicker value={shipper} onChange={setShipper} autoFocus />
      </div>
      <div className="web-intake-grid">
        {fields.map(([key, label, required]) => (
          <label key={key} className="intake-field">
            <span>{label}{required ? " *" : ""}</span>
            <input value={lane[key]} onChange={set(key)} inputMode={key === "weekly_volume" || key === "average_weight" ? "decimal" : undefined} />
          </label>
        ))}
        <label className="intake-field">
          <span>{tr("currency")}</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "MXN")}>
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
          </select>
        </label>
      </div>
      {error && <ErrorBanner message={error} />}
    </Dialog>
  );
}

function RegisterDialog({ row, onClose, onDone }: { row: WebIntake; onClose: () => void; onDone: () => void }) {
  useLang();
  const [search, setSearch] = useState(text(row.lead, "company"));
  const [options, setOptions] = useState<Vendor[]>([]);
  const [searching, setSearching] = useState(false);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = search.trim();
    const id = ++seq.current;
    if (term.length < 2) { setOptions([]); return; }
    setSearching(true);
    const timer = window.setTimeout(() => {
      listVendors({ search: term, limit: 20 })
        .then((res) => { if (seq.current === id) setOptions(res.rows.filter((v) => v.base_stage !== "archived")); })
        .catch(() => { if (seq.current === id) setOptions([]); })
        .finally(() => { if (seq.current === id) setSearching(false); });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function submit() {
    if (!vendor || busy) return;
    setBusy(true);
    setError(null);
    try {
      await registerWebRateSheet(row.id, vendor.id);
      onDone();
    } catch (e) {
      setError(decisionError(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title={tr("registerTitle")} ariaLabel={tr("registerTitle")} onClose={busy ? () => undefined : onClose}
      footer={<>
        <span className="cell-sub">{tr("final")}</span>
        <button onClick={onClose} disabled={busy}>{tr("cancel")}</button>
        <button className="primary" onClick={submit} disabled={busy || !vendor}>{busy ? tr("working") : tr("confirmRegister")}</button>
      </>}>
      <p className="web-intake-hint">{tr("registerHint")}</p>
      <p className="mono">{text(row.lead, "file_name")} · {text(row.lead, "company")} · {text(row.lead, "email")}</p>
      <label className="intake-field">
        <span>{tr("carrier")}</span>
        <input value={search} placeholder={tr("searchCarrier")} onChange={(e) => { setSearch(e.target.value); setVendor(null); }} />
      </label>
      {searching && <Spinner />}
      {!searching && search.trim().length >= 2 && !options.length && <p className="cell-sub">{tr("noCarrier")}</p>}
      <ul className="web-intake-options" role="listbox">
        {options.map((option) => (
          <li key={option.id}>
            <button role="option" aria-selected={vendor?.id === option.id} className={vendor?.id === option.id ? "primary" : undefined}
              onClick={() => setVendor(option)}>
              {option.vendor_name || option.name || option.domain}
              {option.domain ? <span className="cell-sub"> · {option.domain}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {error && <ErrorBanner message={error} />}
    </Dialog>
  );
}
