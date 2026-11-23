import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/language";
import { batchText as t } from "@/i18n/batch-review";
import { ErrorBanner } from "@/components/ui";
import { MAX_REVIEW_BYTES } from "./evidence-review";
import { BATCH_GROUPS, batchCounts, batchIsCurrent, destinationStatus, filterBatchRows, parseBatchReview,
  type BatchCatalog, type BatchGroup, type BatchReview as Batch, type BatchTarget } from "./batch-review";
import { readBatchCatalog } from "./batch-review.service";
import { ExceptionTreatment } from './ExceptionTreatment';
import { BatchMembership } from './BatchMembership';
import { fileDigest } from './exception-treatment';

export function BatchReview() {
  const { user, role, roleLoaded } = useAuth();
  const org = String(user?.app_metadata?.rateware_organization_id || user?.app_metadata?.organization_id || "");
  // Session verification, user, organization and role changes drop the file and all local choices.
  return <BatchReviewContent key={`${user?.id}:${org}:${role}:${roleLoaded}`} org={org} enabled={roleLoaded && Boolean(user)} />;
}

function BatchReviewContent({ org, enabled }: { org: string; enabled: boolean }) {
  useLang();
  const [batch, setBatch] = useState<Batch | null>(null), [catalog, setCatalog] = useState<BatchCatalog | null>(null);
  const [inputHash, setInputHash] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [executionBusy,setExecutionBusy]=useState(false);
  const [now, setNow] = useState(Date.now()), [group, setGroup] = useState<BatchGroup>("A");
  const [search, setSearch] = useState(""), [template, setTemplate] = useState("");
  const [targets, setTargets] = useState<Record<string, BatchTarget>>({});
  const serial = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { serial.current++; clearInterval(timer); };
  }, []);
  function errorKey(e: unknown): Parameters<typeof t>[0] {
    const code = e instanceof Error ? e.message : "";
    const keys = { BATCH_INVALID: "invalid", BATCH_SIZE: "size", BATCH_DUPLICATE: "duplicate",
      BATCH_ORGANIZATION: "organization", BATCH_SCOPE: "unbound", BATCH_CATALOG: "catalog" } as const;
    return keys[code as keyof typeof keys] || "unavailable";
  }
  async function check(input: Batch, attempt: number) {
    const result = await readBatchCatalog(input, org);
    if (serial.current !== attempt) return;
    setCatalog(result); setBatch(input); setNow(Date.now());
  }
  async function importFile(file?: File) {
    if (!file || !enabled || !org) return;
    const attempt = ++serial.current;
    setBusy(true); setError(""); setCatalog(null); setBatch(null); setTargets({});
    setGroup("A"); setSearch(""); setTemplate("");
    try {
      if (file.size > MAX_REVIEW_BYTES) throw new Error("BATCH_SIZE");
      const raw = await file.text(), input = parseBatchReview(raw), digest = await fileDigest(raw);
      if (serial.current === attempt) { setInputHash(digest); await check(input, attempt); }
    } catch (e) { if (serial.current === attempt) setError(errorKey(e)); }
    finally { if (serial.current === attempt) setBusy(false); }
  }
  async function recheck() {
    if (!batch || !enabled || !org) return;
    const attempt = ++serial.current;
    setBusy(true); setError(""); setCatalog(null);
    try { await check(batch, attempt); }
    catch (e) { if (serial.current === attempt) setError(errorKey(e)); }
    finally { if (serial.current === attempt) setBusy(false); }
  }
  function close() {
    serial.current++; setBusy(false); setBatch(null); setCatalog(null); setError(""); setTargets({});
    setGroup("A"); setSearch(""); setTemplate("");
  }
  const current = enabled && batchIsCurrent(catalog, org, now);
  const stats = batch ? batchCounts(batch.rows) : null;
  const rows = current && batch ? filterBatchRows(batch, group, template, search) : [];
  const errorLabel = error ? t(error as Parameters<typeof t>[0]) : "";
  return <section className="batch-review" aria-labelledby="batch-review-title">
    <h2 id="batch-review-title">{t("title")}</h2>
    <p className="ayuda">{t("intro")}</p>
    <p className="batch-readonly ayuda">{t("readonly")}</p>
    <div className="evidence-toolbar">
      <label className="evidence-file">{t("import")}
        <input type="file" accept=".json,application/json" disabled={busy || executionBusy || !enabled || !org}
          onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; void importFile(file); }} />
      </label>
      {batch && <button disabled={busy || executionBusy || !enabled || !org} onClick={() => void recheck()}>{t("recheck")}</button>}
      {(batch || busy || error) && <button onClick={close}>{t("clear")}</button>}
    </div>
    {(!enabled || !org) && <p role="status">{t("authenticated")}</p>}
    {busy && <p role="status">{t("loading")}</p>}
    {errorLabel && <ErrorBanner message={errorLabel} />}
    {!batch && !busy && !error && <p className="ayuda">{t("empty")}</p>}
    {batch && !busy && !error && !current && <p role="status">{t("stale")}</p>}
    {current && batch && catalog && stats && <>
      <p>{t("scope", batch.reviewedOn)}</p>
      <details className="evidence-hashes"><summary>{t("hash")}</summary>{batch.manifestHash}</details>
      <div className="batch-metrics">
        <div><strong>{stats.primary}</strong>{t("primary")}<small>{t("carriers", stats.carriers)}</small></div>
        <div><strong>{stats.groups.A}</strong>{t("proposals")}<small>{t("proposalSplit", stats.groups.A - stats.additional, stats.additional)}</small></div>
        <div><strong>{stats.groups.B}</strong>{t("historical")}</div>
        <div><strong>{stats.exceptions}</strong>{t("exceptions")}</div>
      </div>
      <p>{t("other", batch.otherRelations)}</p>
      <div className="batch-board">
        <nav aria-label={t("groups")} className="batch-groups"><h3>{t("groups")}</h3>
          {BATCH_GROUPS.map(g => <button key={g} aria-pressed={group === g} onClick={() => { setGroup(g); setSearch(""); setTemplate(""); }}>
            <span>{t(g)}</span><b>{stats.groups[g]}</b>
          </button>)}
        </nav>
        <div className="batch-results">
          <h3>{t(group)} · {stats.groups[group]}</h3>
          <div className="batch-filters">
            <label>{t("search")}<input value={search} onChange={e => setSearch(e.target.value)} /></label>
            <label>{t("template")}<select value={template} onChange={e => setTemplate(e.target.value)}>
              <option value="">{t("all")}</option>
              {[...new Set(batch.rows.filter(r => r.group === group).map(r => r.proposedName))].sort().map(name => <option key={name}>{name}</option>)}
            </select></label>
            {(search || template) && <button onClick={() => { setSearch(""); setTemplate(""); }}>{t("reset")}</button>}
          </div>
          <p role="status">{t("count", rows.length, stats.groups[group])}</p>
          {!rows.length ? <p>{t("noMatches")}</p> : <div className="crm-table-wrap" tabIndex={0} role="region" aria-label={t("title")}>
            <table className="data batch-table"><thead><tr><th>{t("relation")}</th><th>{t("reference")}</th><th>{t("state")}</th><th>{t("evidence")}</th></tr></thead>
              <tbody>{rows.map(row => {
                const source = catalog.templates.find(x => x.id === row.sourceId)!;
                const changed = source.template_version !== row.sourceVersion || source.lifecycle_status !== row.sourceLifecycle || source.segment_name !== row.sourceName;
                return <tr key={row.id}>
                  <td>{row.carrier}<small>{row.proposalId} · {row.additional ? t("additional") : row.batch}</small></td>
                  <td>{row.proposedName}<small>{source.lifecycle_status === "archived" ? t("archivedSource") : t("source")}</small>
                    {changed && <small className="batch-warning">{t("sourceChanged")}</small>}
                  </td>
                  <td><span className="batch-badge">{t(row.group === "A" ? "proposed" : row.group === "B" ? "historic" : "pending")}</span>
                    <small>{t("crm", row.crmStatus)}</small><small>{row.date || "—"}</small></td>
                  <td>{row.scope}<details><summary>{t("details", row.sources.length)}</summary>
                    <p>{row.restrictions}</p><p>{row.sourceName} · {row.sourceId} · v{row.sourceVersion}</p>
                    <ul>{row.sources.map((s, i) => <li key={i}>{s.file.split(/[\\/]/).pop()} · {s.locator} · {s.date || "—"}<small>SHA-256: {s.sha256}</small></li>)}</ul>
                  </details></td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
        </div>
      </div>
      <details className="batch-targets"><summary>{t("destinations")}</summary><p>{t("targetsHelp")}</p>
        {[...new Set(batch.rows.filter(r => r.group === "A").map(r => r.proposedName))].sort().map(name => {
          const target = targets[name];
          const matches = catalog.templates.filter(x => x.segment_name === name && x.lifecycle_status === "active").length;
          return <div key={name}><label>{t("targetLabel", name)}
            <select disabled={executionBusy} value={target?.id || ""} onChange={e => {
              const selected = catalog.templates.find(x => x.id === e.target.value);
              setTargets(previous => { const next = { ...previous }; if (selected) next[name] = { id: selected.id, version: selected.template_version! }; else delete next[name]; return next; });
            }}>
              <option value="">{t("choose")}</option>
              {target && !catalog.templates.some(x => x.id === target.id) && <option value={target.id}>{target.id} · {t("missing")}</option>}
              {catalog.templates.map(x => <option value={x.id} key={x.id}>{x.segment_name} · {x.id} · v{x.template_version} · {x.lifecycle_status}</option>)}
            </select></label>
            <p role="status">{t(destinationStatus(name, target, catalog))}</p>
            {!target && <small>{matches ? t("candidates", matches) : t("noCandidate")}</small>}
          </div>;
        })}
      </details>
      <BatchMembership key={`${inputHash}:${catalog.checkedAt}:${JSON.stringify(targets)}`} batch={batch} catalog={catalog} inputHash={inputHash} org={org} targets={targets} onBusyChange={setExecutionBusy} />
      <ExceptionTreatment key={`${inputHash}:${catalog.checkedAt}`} batch={batch} catalog={catalog} inputHash={inputHash} org={org} />
      <p className="muted">{t("original")}</p>
    </>}
  </section>;
}
