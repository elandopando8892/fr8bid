import { words, tr } from "@/i18n/carrier-templates";
import { useLang } from "@/i18n/language";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ApiError } from "@/lib/api-client";
import {
  createCarrierTemplate,
  updateCarrierTemplate,
  getCarrierTemplate,
  resolveCarrierTemplateRows,
  explainTemplateError,
  templateName,
  templateVersion,
  REASON_LABEL,
  type RowResolution,
} from "./templates.service";
import {
  readCarrierList,
  exceptionCsv,
  ACCEPTED_FILE_TYPES,
  TEMPLATE_IMPORT_MAX_ROWS,
  type ImportRow,
} from "./templateImport";
import { listVendorsByIds } from "@/features/carrier-fit/carrierFit.service";
import { isRetired } from "@/features/carrier-fit/carrierFit.rules";
import { listVendors, type BaseStage } from "@/features/carrier-crm/crm.service";
import { ErrorBanner, InfoBanner, Pill, Spinner } from "@/components/ui";
import type { Vendor } from "@/types/domain";

type Step = 1 | 2 | 3;
type Mode = "crm" | "sheet";

/** What the operator decided for one imported row. */
type Decision =
  | { kind: "include"; vendorId: string }
  | { kind: "skip" }
  | { kind: "pending" };

interface ResolvedRow {
  source: ImportRow;
  resolution: RowResolution;
  decision: Decision;
}

const vendorLabel = (v?: Vendor) =>
  (v?.vendor_name as string) || (v?.legal_name as string) || (v?.name as string) || v?.id || "—";

const blocked = (v: Vendor) => String(v.status || "").toLowerCase() === "blocked";

const hasContact = (v: Vendor) =>
  Boolean(
    String(v.primary_email ?? "").trim() ||
      String(v.whatsapp_phone ?? "").trim() ||
      (Array.isArray(v.secondary_emails) && v.secondary_emails.some((e) => String(e ?? "").trim())),
  );

/** The line under a carrier's name: its domain, else its email. */
const whereOf = (v: Vendor) => String(v.domain || v.primary_email || "").trim() || "—";

const STEPS = (): [number, string][] => [
  [1, tr("text042")],
  [2, tr("text043")],
  [3, tr("text044")],
  [4, tr("text045")],
];

/**
 * Builds a carrier list (wireframe 05): name it, add carriers from the CRM or
 * from a sheet, review and save. Editing an existing template is the same page.
 *
 * The rule that shapes the sheet import: no imported row is ever dropped on
 * its own. Matched rows come in; everything else waits for an explicit
 * decision — pick a candidate, map it to a carrier by hand, or skip it.
 */
export function TemplateBuilderPage() {
  useLang();
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(editId);
  const { can } = useAuth();
  const canWork = can("operate");

  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<Mode>("crm");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Datos
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [lifecycle, setLifecycle] = useState<"draft" | "active">("draft");
  const [savedLifecycle, setSavedLifecycle] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(editing);

  // From the CRM: the left panel and what was added from it
  const [picked, setPicked] = useState<Map<string, Vendor>>(new Map());
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<BaseStage | "all">("procurement");
  const [coverage, setCoverage] = useState("");
  const [contactOnly, setContactOnly] = useState(false);
  const [results, setResults] = useState<Vendor[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkedLeft, setCheckedLeft] = useState<Set<string>>(new Set());
  const [checkedRight, setCheckedRight] = useState<Set<string>>(new Set());

  // From a sheet
  const [imported, setImported] = useState<ResolvedRow[]>([]);
  const [importName, setImportName] = useState("");
  const [vendorCache, setVendorCache] = useState<Map<string, Vendor>>(new Map());
  const [importing, setImporting] = useState(false);
  const [paste, setPaste] = useState("");
  const [mapFor, setMapFor] = useState<number | null>(null);
  const [mapSearch, setMapSearch] = useState("");
  const [mapResults, setMapResults] = useState<Vendor[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Load an existing template when editing. */
  useEffect(() => {
    if (!editId) return;
    let live = true;
    (async () => {
      try {
        const t = await getCarrierTemplate(editId);
        if (!live || !t) return;
        setName(templateName(t));
        setDescription(String(t.description ?? ""));
        const lc = String(t.lifecycle_status);
        setLifecycle(lc === "active" ? "active" : "draft");
        setSavedLifecycle(lc);
        setVersion(templateVersion(t));
        const ids = (t.vendor_ids ?? []) as string[];
        const vendors = await listVendorsByIds(ids);
        if (!live) return;
        const byId = new Map(vendors.map((v) => [v.id, v]));
        // Members the list call did not return still stay in the template.
        setPicked(new Map(ids.map((id) => [id, byId.get(id) ?? ({ id } as Vendor)])));
      } catch (e) {
        if (live) setError(explainTemplateError(e));
      } finally {
        if (live) setLoadingEdit(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [editId]);

  /* The left panel: the CRM, browsed by base stage or searched. */
  async function browse() {
    const q = search.trim();
    setSearching(true);
    try {
      const res = await listVendors({
        ...(q.length >= 2 ? { search: q } : {}),
        ...(stage !== "all" ? { base_stage: stage } : {}),
        ...(coverage.trim() ? { coverage: coverage.trim() } : {}),
        limit: 120,
      });
      // Archived or deleted carriers left the CRM, so they're never offered.
      setResults(res.rows.filter((v) => !isRetired(v)));
      setCheckedLeft(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (step === 2 && mode === "crm" && !loadingEdit) browse();
    // Browse again when the stage filter changes; text filters apply on Enter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mode, stage, loadingEdit]);

  /* The final membership: CRM picks + imported rows the operator included. */
  const members = useMemo(() => {
    const ids = new Set(picked.keys());
    for (const r of imported) if (r.decision.kind === "include") ids.add(r.decision.vendorId);
    return ids;
  }, [picked, imported]);

  const memberRows = useMemo(
    () =>
      [...members]
        .map((id) => ({ id, v: picked.get(id) ?? vendorCache.get(id) ?? ({ id } as Vendor), fromSheet: !picked.has(id) }))
        .sort((a, b) => vendorLabel(a.v).localeCompare(vendorLabel(b.v))),
    [members, picked, vendorCache],
  );

  const pending = imported.filter((r) => r.decision.kind === "pending");
  const skipped = imported.filter((r) => r.decision.kind === "skip");
  const matched = imported.filter((r) => r.resolution.status === "matched");
  const repeated = imported.filter((r) => r.resolution.status === "duplicate");
  const visible = contactOnly ? results.filter(hasContact) : results;

  function addChecked() {
    setPicked((prev) => {
      const next = new Map(prev);
      for (const v of results) if (checkedLeft.has(v.id)) next.set(v.id, v);
      return next;
    });
    setCheckedLeft(new Set());
  }

  function removeMembers(ids: string[]) {
    const drop = new Set(ids);
    setPicked((prev) => new Map([...prev].filter(([id]) => !drop.has(id))));
    // An imported row taken out of the list is skipped on purpose, not lost.
    setImported((prev) =>
      prev.map((r) => (r.decision.kind === "include" && drop.has(r.decision.vendorId) ? { ...r, decision: { kind: "skip" } } : r)),
    );
    setCheckedRight((prev) => new Set([...prev].filter((id) => !drop.has(id))));
  }

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  };

  async function runImport(source: File | string) {
    setImporting(true);
    setError(null);
    try {
      const rows = await readCarrierList(source);
      const res = await resolveCarrierTemplateRows(rows);
      const bySource = new Map(rows.map((r) => [r.source_row_number, r]));

      // Hydrate every vendor the resolver mentioned, so candidates show names.
      const mentioned = new Set<string>();
      for (const r of res.rows) {
        if (r.vendor_id) mentioned.add(r.vendor_id);
        r.candidate_vendor_ids.forEach((c) => mentioned.add(c));
      }
      const vendors = await listVendorsByIds([...mentioned]);
      setVendorCache((prev) => {
        const next = new Map(prev);
        vendors.forEach((v) => next.set(v.id, v));
        return next;
      });

      setImported(
        res.rows.map((resolution) => ({
          source: bySource.get(resolution.source_row_number) ?? ({} as ImportRow),
          resolution,
          // Only a strong-identifier match comes in without asking.
          decision:
            resolution.status === "matched" && resolution.vendor_id
              ? { kind: "include", vendorId: resolution.vendor_id }
              : resolution.status === "duplicate"
                ? { kind: "skip" }
                : { kind: "pending" },
        })),
      );
      setImportName(typeof source === "string" ? tr("text046") : source.name);
      setPaste("");
    } catch (e) {
      setError(explainTemplateError(e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function decide(index: number, decision: Decision) {
    setImported((prev) => prev.map((r, i) => (i === index ? { ...r, decision } : r)));
  }

  async function searchToMap() {
    const q = mapSearch.trim();
    if (q.length < 2) return;
    try {
      const res = await listVendors({ search: q, limit: 40 });
      setMapResults(res.rows.filter((v) => !isRetired(v)).slice(0, 10));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function mapManually(index: number, v: Vendor) {
    setVendorCache((prev) => new Map(prev).set(v.id, v));
    decide(index, { kind: "include", vendorId: v.id });
    setMapFor(null);
    setMapResults([]);
    setMapSearch("");
  }

  function downloadExceptions() {
    const rows = imported
      .filter((r) => r.resolution.status !== "matched")
      .map((r) => ({
        source: r.source,
        status: r.resolution.status,
        reason: r.resolution.reason,
        candidates: r.resolution.candidate_vendor_ids,
        chosen: r.decision.kind === "include" ? r.decision.vendorId : null,
      }));
    const blob = new Blob([exceptionCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `excepciones-${(name || "template").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canSave = canWork && name.trim().length > 1 && members.size > 0 && pending.length === 0;
  // Saving an active template as a draft would take it out of Carrier Fit.
  const offerDraft = !(editing && savedLifecycle === "active");

  async function save(as: "draft" | "active") {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        segment_name: name.trim(),
        description: description.trim(),
        vendor_ids: [...members],
        lifecycle_status: as,
      };
      if (editing && editId) {
        // expected_version makes a concurrent edit answer 409 instead of
        // silently overwriting someone else's change.
        await updateCarrierTemplate(editId, version ?? 1, payload);
      } else {
        await createCarrierTemplate(payload);
      }
      navigate("/templates");
    } catch (e) {
      setError(explainTemplateError(e));
      if ((e as ApiError)?.code === "template_name_conflict") {
        // Wireframe 22: the focus goes back to the name with its text selected.
        setStep(1);
        setTimeout(() => {
          nameRef.current?.focus();
          nameRef.current?.select();
        }, 0);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadingEdit) return <Spinner label={tr("text047")} />;

  const current = busy ? 4 : step;

  return (
    <>
      <header className="identity crm-head">
        <div className="crm-head-main">
          <div className="crumb">
            <Link to="/crm">Carrier CRM</Link>
            {" › "}
            <Link to="/templates">List templates</Link>
            {" › "}
            {editing ? tr("text038") : tr("text048")}
          </div>
          <h1>{editing ? tr("text049", name || "template") : tr("text050")}</h1>
          <p className="sub">
            {editing
              ? tr("text051", version ?? 1, (version ?? 1) + 1)
              : tr("text052")}
          </p>
        </div>
        <div className="crm-head-actions">
          <Link to="/templates" className="btn">
            {tr("text053")}</Link>
          {offerDraft && (
            <button disabled={!canSave || busy} title={canWork ? undefined : NEED_REASON.operate} onClick={() => save("draft")}>
              {tr("text054")}</button>
          )}
          {step < 3 ? (
            <button className="primary" onClick={() => setStep(3)}>
              {tr("text055")}</button>
          ) : (
            <button className="primary" disabled={!canSave || busy} title={canWork ? undefined : NEED_REASON.operate} onClick={() => save(lifecycle)}>
              {busy ? tr("text056") : editing ? tr("text057") : lifecycle === "active" ? tr("text058") : tr("text059")}
            </button>
          )}
        </div>
      </header>

      <div className="tpl-body">
        <nav className="tb-stepper" aria-label={tr("text060")}>
          {STEPS().map(([n, label], i) => (
            <div key={n} className="tb-step-wrap">
              {i > 0 && <span className="tb-line" />}
              <button
                className={`tb-step${n < current ? " done" : n === current ? " on" : ""}`}
                disabled={n === 4}
                onClick={() => n < 4 && setStep(n as Step)}
              >
                <span className="tb-dot">{n}</span>
                {label}
              </button>
            </div>
          ))}
        </nav>

        {error && <ErrorBanner message={error} />}

        {step === 1 && (
          <section className="tb-card tb-details">
            <label className="field">
              <span>{tr("text061")}</span>
              <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="D2D Crossborder MX-US" />
            </label>
            <label className="field">
              <span>{tr("text032")}</span>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="field">
              <span>{tr("text062")}</span>
              <div className="tb-modes">
                <button className={lifecycle === "draft" ? "on" : undefined} onClick={() => setLifecycle("draft")}>
                  {tr("text063")}</button>
                <button className={lifecycle === "active" ? "on" : undefined} onClick={() => setLifecycle("active")}>
                  {tr("text064")}</button>
              </div>
              <small>
                {tr("text065")}<b>{tr("text066")}</b>{tr("text067")}</small>
            </div>
            <div className="tpl-note">
              <b>{tr("text016")}</b>
              <span>{tr("text068")}</span>
            </div>
          </section>
        )}

        {step === 2 && (
          <>
            <div className="tb-modes">
              <button className={mode === "crm" ? "on" : undefined} onClick={() => setMode("crm")}>
                {tr("text069")}</button>
              <button className={mode === "sheet" ? "on" : undefined} onClick={() => setMode("sheet")}>
                {tr("text070")}</button>
            </div>
            <div className="tb-source">
              <b>{tr("text071")}</b>
              <span>{tr("text072")}</span>
            </div>

            {mode === "crm" && (
              <div className="tb-transfer">
                <section className="tb-panel">
                  <header>
                    <b>{tr("text073")}</b>
                    <span>
                      {searching ? words("word0") : tr("text074", visible.length)}{tr("text075")}</span>
                  </header>
                  <div className="tb-filters">
                    <input
                      placeholder={tr("text076")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && browse()}
                    />
                    <input
                      placeholder={tr("text077")}
                      value={coverage}
                      onChange={(e) => setCoverage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && browse()}
                    />
                    <select value={stage} onChange={(e) => setStage(e.target.value as BaseStage | "all")} aria-label="Base">
                      <option value="procurement">Procurement</option>
                      <option value="sourcing">Sourcing</option>
                      <option value="all">{tr("text078")}</option>
                    </select>
                    <label className="tb-check">
                      <input type="checkbox" checked={contactOnly} onChange={(e) => setContactOnly(e.target.checked)} />
                      {tr("text079")}</label>
                    <button onClick={browse} disabled={searching}>
                      {tr("text080")}</button>
                  </div>
                  <div className="tb-list">
                    {visible.map((v) => {
                      const inList = members.has(v.id);
                      return (
                        <label
                          key={v.id}
                          className={`tb-row${inList ? " in" : ""}`}
                          title={inList ? tr("text081") : blocked(v) ? tr("text082") : undefined}
                        >
                          {/* A blocked carrier can't be invited, so it can't go into a list either. */}
                          <input
                            type="checkbox"
                            checked={inList || checkedLeft.has(v.id)}
                            disabled={inList || blocked(v)}
                            onChange={() => setCheckedLeft((s) => toggle(s, v.id))}
                          />
                          <span className="tb-who">
                            <b className="ellipsis">{vendorLabel(v)}</b>
                            <span className="mono ellipsis">{whereOf(v)}</span>
                          </span>
                          <span className="tb-cov ellipsis" title={String(v.coverage_notes ?? "") || undefined}>
                            {String(v.coverage_notes ?? "").trim() || "—"}
                          </span>
                          <span className="tb-status">{blocked(v) ? <em>{tr("text083")}</em> : String(v.status ?? "—")}</span>
                          <span className={hasContact(v) ? "tb-yes" : "tb-no"}>{hasContact(v) ? tr("text084") : tr("text085")}</span>
                        </label>
                      );
                    })}
                    {!searching && !visible.length && <p className="tb-empty">{tr("text086")}</p>}
                  </div>
                </section>

                <div className="tb-mid">
                  <button className="primary" disabled={!checkedLeft.size} onClick={addChecked}>
                    {tr("text087")}</button>
                  <button disabled={!checkedRight.size} onClick={() => removeMembers([...checkedRight])}>
                    {tr("text088")}</button>
                </div>

                <MembersPanel
                  rows={memberRows}
                  checked={checkedRight}
                  onToggle={(id) => setCheckedRight((s) => toggle(s, id))}
                  onRemove={(id) => removeMembers([id])}
                />
              </div>
            )}

            {mode === "sheet" && (
              <>
                <div className="tb-card tb-upload">
                  <div className="tb-upload-file">
                    <div>
                      <b>{tr("text089")}</b>
                      <small>
                        {tr("text090")}{TEMPLATE_IMPORT_MAX_ROWS.toLocaleString()}{tr("text091")}</small>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={ACCEPTED_FILE_TYPES}
                      disabled={importing}
                      onChange={(e) => e.target.files?.[0] && runImport(e.target.files[0])}
                    />
                  </div>
                  <label className="field">
                    <span>{tr("text092")}</span>
                    <textarea
                      rows={3}
                      value={paste}
                      onChange={(e) => setPaste(e.target.value)}
                      placeholder={tr("text093")}
                      className="mono"
                    />
                  </label>
                  <div className="tb-upload-go">
                    <span>
                      {tr("text094")}<b>{tr("text095")}</b>{tr("text096")}</span>
                    <button disabled={importing || !paste.trim()} onClick={() => runImport(paste)}>
                      {importing ? tr("text097") : tr("text098")}
                    </button>
                  </div>
                </div>

                {importing && <Spinner label={tr("text099")} />}

                {imported.length > 0 && (
                  <div className="crm-table-wrap">
                    <table className="data tb-table">
                      <thead>
                        <tr>
                          <th className="tb-col-row">{tr("text100")}</th>
                          <th>{tr("text101")}</th>
                          <th className="tb-col-result">{tr("text102")}</th>
                          <th>{tr("text103")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {imported.map((r, i) => {
                          const s = r.source;
                          const st = r.resolution.status;
                          const chosen = r.decision.kind === "include" ? vendorCache.get(r.decision.vendorId) : undefined;
                          return (
                            <tr key={i} className={r.decision.kind === "pending" ? "tb-pending" : undefined}>
                              <td className="mono tb-col-row">{s.source_row_number}</td>
                              <td>
                                <div className="cell-title">{s.vendor_name || tr("text104")}</div>
                                <div className="cell-sub">
                                  {[s.usdot && `USDOT ${s.usdot}`, s.mc_number && `MC ${s.mc_number}`, s.primary_email]
                                    .filter(Boolean)
                                    .join(" · ") || words("word1")}
                                </div>
                              </td>
                              <td className="tb-col-result">
                                <Pill tone={st === "matched" ? "green" : st === "duplicate" ? "" : "amber"}>
                                  {st === "matched" ? tr("text105") : st === "ambiguous" ? tr("text106") : st === "duplicate" ? tr("text107") : tr("text108")}
                                </Pill>
                                <div className="cell-sub">{REASON_LABEL[r.resolution.reason] ?? r.resolution.reason}</div>
                              </td>
                              <td>
                                {r.decision.kind === "include" && (
                                  <div className="tb-decision">
                                    <span className="cell-title">{vendorLabel(chosen)}</span>
                                    {st !== "matched" && (
                                      <button className="link" onClick={() => decide(i, { kind: "pending" })}>
                                        {tr("text109")}</button>
                                    )}
                                  </div>
                                )}
                                {r.decision.kind === "skip" && (
                                  <div className="tb-decision">
                                    <span className="tb-muted">{st === "duplicate" ? tr("text110") : tr("text111")}</span>
                                    {st !== "duplicate" && (
                                      <button className="link" onClick={() => decide(i, { kind: "pending" })}>
                                        {tr("text112")}</button>
                                    )}
                                  </div>
                                )}
                                {r.decision.kind === "pending" && (
                                  <div className="tb-choices">
                                    {r.resolution.candidate_vendor_ids.map((cid) => (
                                      <button key={cid} onClick={() => decide(i, { kind: "include", vendorId: cid })}>
                                        {tr("text113")}{vendorLabel(vendorCache.get(cid))}
                                      </button>
                                    ))}
                                    {mapFor === i ? (
                                      <div className="tb-decision">
                                        <input
                                          autoFocus
                                          value={mapSearch}
                                          onChange={(e) => setMapSearch(e.target.value)}
                                          onKeyDown={(e) => e.key === "Enter" && searchToMap()}
                                          placeholder={tr("text114")}
                                        />
                                        <button onClick={searchToMap}>{tr("text080")}</button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setMapFor(i);
                                          setMapResults([]);
                                          setMapSearch(s.vendor_name);
                                        }}
                                      >
                                        {tr("text114")}</button>
                                    )}
                                    {mapFor === i &&
                                      mapResults.map((v) => (
                                        <button key={v.id} onClick={() => mapManually(i, v)}>
                                          ↳ {vendorLabel(v)} {v.primary_email ? `· ${v.primary_email}` : ""}
                                        </button>
                                      ))}
                                    <button onClick={() => decide(i, { kind: "skip" })}>{tr("text115")}</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {imported.length > 0 && (
              <div className="tb-import-bar">
                <span className="mono">{importName}</span>
                <b className="ok">{matched.length}{tr("text116")}</b>
                <b className={pending.length ? "bad" : undefined}>{pending.length}{tr("text117")}</b>
                <b className="warn">{repeated.length}{tr("text118")}</b>
                <b>{skipped.length - repeated.length}{tr("text119")}</b>
                <span className="spacer" />
                <small>{tr("text120")}</small>
                <button className="link" onClick={downloadExceptions}>
                  {tr("text121")}</button>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <div className="tb-review">
            <section className="tb-card">
              <h2>{name || tr("text104")}</h2>
              {description && <p className="tb-muted">{description}</p>}
              <dl className="crm-facts">
                <div>
                  <dt>{tr("text062")}</dt>
                  <dd>{lifecycle === "active" ? tr("text064") : tr("text063")}</dd>
                </div>
                <div>
                  <dt>{tr("text020")}</dt>
                  <dd className="mono">{members.size}</dd>
                </div>
                <div>
                  <dt>{tr("text122")}</dt>
                  <dd className="mono">{picked.size}</dd>
                </div>
                <div>
                  <dt>{tr("text123")}</dt>
                  <dd className="mono">{memberRows.filter((m) => m.fromSheet).length}</dd>
                </div>
                <div>
                  <dt>{tr("text124")}</dt>
                  <dd className="mono">{skipped.length}</dd>
                </div>
              </dl>
              {pending.length > 0 && (
                <ErrorBanner
                  message={tr("text125", pending.length)}
                />
              )}
              {!name.trim() && <ErrorBanner message="Falta el nombre del template (paso 1)." />}
              {members.size === 0 && <ErrorBanner message="El template no tiene miembros todavía." />}
              {editing && (
                <InfoBanner title={tr("text126")}>
                  {tr("text127")}{version ?? 1}{tr("text128")}</InfoBanner>
              )}
            </section>
            <MembersPanel rows={memberRows} onRemove={(id) => removeMembers([id])} />
          </div>
        )}
      </div>
    </>
  );
}

function MembersPanel({
  rows,
  checked,
  onToggle,
  onRemove,
}: {
  rows: { id: string; v: Vendor; fromSheet: boolean }[];
  /** Without these the list can't be marked, only trimmed one by one. */
  checked?: Set<string>;
  onToggle?: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  useLang();
  return (
    <section className="tb-panel">
      <header>
        <b>{tr("text129")}</b>
        <span>{rows.length}{tr("text130")}</span>
      </header>
      <div className="tb-list">
        {rows.map(({ id, v, fromSheet }) => (
          <div key={id} className={`tb-row${checked?.has(id) ? " picked" : ""}`}>
            {onToggle && (
              <input
                type="checkbox"
                checked={Boolean(checked?.has(id))}
                onChange={() => onToggle(id)}
                aria-label={tr("text131", vendorLabel(v))}
              />
            )}
            <span className="tb-who">
              <b className="ellipsis">{v.vendor_name || v.legal_name || v.name ? vendorLabel(v) : tr("text033")}</b>
              <span className="mono ellipsis">{whereOf(v)}</span>
            </span>
            {fromSheet && <span className="tb-tag">{tr("text132")}</span>}
            {blocked(v) && <span className="tb-tag bad">{tr("text083")}</span>}
            <span className={hasContact(v) ? "tb-yes" : "tb-no"}>{hasContact(v) ? tr("text084") : tr("text085")}</span>
            <button className="tb-x" title={tr("text133")} onClick={() => onRemove(id)}>
              ✕
            </button>
          </div>
        ))}
        {!rows.length && <p className="tb-empty">{tr("text134")}</p>}
      </div>
    </section>
  );
}
