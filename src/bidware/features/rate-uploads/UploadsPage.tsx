import { words, tr } from "@/i18n/rate-uploads";
import { useLang } from "@/i18n/language";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync, promptAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { NEED_REASON } from "@/lib/roles";
import { Empty, ErrorBanner, InfoBanner, Pill, Spinner, TopBar, dateShort } from "@/components/ui";
import { listVendors, vendorLabel } from "@/features/carrier-crm/crm.service";
import type { Vendor } from "@/types/domain";
import {
  ACCEPT,
  archiveUpload,
  documentTypeOf,
  interpretUpload,
  isBidSnapshot,
  listUploads,
  removeUpload,
  sourceUrl,
  uploadFile,
  type Interpretation,
  type RawUpload,
} from "./uploads.service";

const TYPE_LABEL: Record<string, string> = { xlsx: "Excel", pdf: "PDF", get email() { return tr("text001"); }, get image() { return tr("text002"); } };

const STATUS: Record<string, { tone: any; label: string }> = {
  uploaded: { tone: "amber", get label() { return tr("text003"); } },
  interpreting: { tone: "blue", get label() { return tr("text004"); } },
  staged: { tone: "green", get label() { return tr("text005"); } },
  get error() { return { tone: "red", label: tr("text058") }; },
  get failed() { return { tone: "red", label: tr("text058") }; },
};

const readResult = (name: string, res: Interpretation) => {
  const rows = res.staged_rows ?? res.diff?.rows_after ?? 0;
  const expected = res.diff?.expected_after;
  return (
    tr("text006", name, rows) +
    (expected && expected > rows ? tr("text007", expected) : "") +
    "."
  );
};

/**
 * Rate files: upload one and read it into rates for review, or see the ones
 * already in. Approving still happens in Revisión de tarifas.
 */
export function UploadsPage() {
  useLang();
  const { can } = useAuth();
  const canWork = can("operate");
  const canAdmin = can("admin");
  const lockedTitle = canWork ? undefined : NEED_REASON.operate;
  const [tab, setTab] = useState<"team" | "bids">("team");
  const [showAll, setShowAll] = useState(false);
  const list = useAsync(() => listUploads(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorResults, setVendorResults] = useState<Vendor[]>([]);
  const [rfx, setRfx] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const text = vendorSearch.trim();
    if (text.length < 2) {
      setVendorResults([]);
      return;
    }
    const id = ++seq.current;
    const timer = window.setTimeout(() => {
      listVendors({ search: text, limit: 8 })
        .then((res) => id === seq.current && setVendorResults(res.rows))
        .catch(() => id === seq.current && setVendorResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [vendorSearch]);

  /** Upload, then read it right away: reading is what turns the file into rates. */
  async function uploadAndRead() {
    if (!file) return;
    setBusy("upload");
    setNotice(tr("text008", file.name));
    let uploaded: RawUpload | null = null;
    try {
      uploaded = await uploadFile(file, { vendorId: vendor?.id, vendor: vendor ? vendorLabel(vendor) : "", rfx: rfx.trim() });
      // The file is already stored. A failed interpretation must be retried
      // from its existing row, rather than uploading another copy.
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setNotice(tr("text009", file.name));
      list.reload();
      const res = await interpretUpload(uploaded.id);
      setNotice(readResult(file.name, res));
      setVendor(null);
      setRfx("");
    } catch (e) {
      setNotice(
        uploaded
          ? tr("text010", (e as Error).message)
          : tr("text011", (e as Error).message),
      );
    } finally {
      setBusy(null);
      list.reload();
    }
  }

  async function read(upload: RawUpload) {
    const name = upload.original_filename || upload.filename || words("word0");
    const again = Boolean(upload.interpreted_at || upload.interpreted_rate_rows);
    let note = "";
    if (again) {
      const typed = await promptAsync(
        tr("text012", name, upload.interpreted_rate_rows ?? 0) +
          tr("text013") +
          tr("text014"),
      );
      if (typed == null) return;
      note = typed.trim();
    }
    setBusy(upload.id);
    setNotice(tr("text009", name));
    try {
      setNotice(readResult(name, await interpretUpload(upload.id, note)));
    } catch (e) {
      setNotice(tr("text011", (e as Error).message));
    } finally {
      setBusy(null);
      list.reload();
    }
  }

  async function open(upload: RawUpload) {
    try {
      window.open(await sourceUrl(upload.id), "_blank", "noopener");
    } catch (e) {
      setNotice(tr("text011", (e as Error).message));
    }
  }

  async function archive(upload: RawUpload) {
    const name = upload.original_filename || words("word0");
    if (!(await confirmAsync(tr("text015", name)))) return;
    setBusy(upload.id);
    try {
      await archiveUpload(upload.id);
      setNotice(tr("text016", name));
    } catch (e) {
      setNotice(tr("text011", (e as Error).message));
    } finally {
      setBusy(null);
      list.reload();
    }
  }

  async function remove(upload: RawUpload) {
    const name = upload.original_filename || words("word0");
    const ok = await confirmAsync(
      tr("text017", name, upload.interpreted_rate_rows ?? 0) +
        tr("text018") +
        tr("text019"),
    );
    if (!ok) return;
    setBusy(upload.id);
    try {
      await removeUpload(upload.id);
      setNotice(tr("text020", name));
    } catch (e) {
      setNotice(tr("text011", (e as Error).message));
    } finally {
      setBusy(null);
      list.reload();
    }
  }

  const all = list.data?.rows ?? [];
  const team = all.filter((u) => !isBidSnapshot(u));
  const bids = all.filter(isBidSnapshot);
  const rows = tab === "team" ? team : bids;
  const SHOWN = 100;
  const visible = showAll ? rows : rows.slice(0, SHOWN);
  const pickedType = file ? documentTypeOf(file) : null;

  return (
    <>
      <TopBar title={tr("text022")} sub={tr("text023")} />
      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          {notice && <InfoBanner>{notice}</InfoBanner>}

          <div className="card" style={{ display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0 }}>{tr("text026")}</h2>
            <p className="cell-sub" style={{ margin: 0 }}>
              {tr("text027")}</p>
            <div className="row upload-form" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
              <label className="field" style={{ minWidth: 260, marginBottom: 0 }}>
                <span>{tr("text028")}</span>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT}
                  disabled={!canWork || !!busy}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="field" style={{ minWidth: 240, marginBottom: 0, position: "relative" }}>
                <span>{tr("text029")}</span>
                {vendor ? (
                  <div className="row" style={{ gap: 8 }}>
                    <strong>{vendorLabel(vendor)}</strong>
                    <button type="button" onClick={() => setVendor(null)} disabled={!!busy}>
                      {tr("text030")}</button>
                  </div>
                ) : (
                  <>
                    <input
                      value={vendorSearch}
                      disabled={!canWork || !!busy}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      placeholder={tr("text031")}
                    />
                    {vendorResults.length > 0 && (
                      <div className="qd-options" role="listbox">
                        {vendorResults.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className="qd-option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setVendor(v);
                              setVendorSearch("");
                              setVendorResults([]);
                            }}
                          >
                            <strong>{vendorLabel(v)}</strong>
                            <span>{[v.domain, v.primary_email].filter(Boolean).join(" · ")}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </label>
              <label className="field" style={{ width: 160, marginBottom: 0 }}>
                <span>{tr("text032")}</span>
                <input value={rfx} disabled={!canWork || !!busy} onChange={(e) => setRfx(e.target.value)} placeholder="RFx08172602" />
              </label>
              <button
                className="primary"
                disabled={!canWork || !file || !pickedType || !!busy}
                title={lockedTitle ?? (file && !pickedType ? tr("text033") : undefined)}
                onClick={uploadAndRead}
              >
                {busy === "upload" ? tr("text034") : tr("text035")}
              </button>
            </div>
            {file && !pickedType && <ErrorBanner message={tr("text036", file.name)} />}
          </div>

          {list.loading && !list.data && <Spinner label={tr("text037")} />}
          {list.error && <ErrorBanner message={list.error} />}
          {list.data && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <div className="tabs" role="tablist">
                {([["team", tr("text038"), team.length], ["bids", tr("text039"), bids.length]] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    className={tab === key ? "active" : ""}
                    onClick={() => { setTab(key); setShowAll(false); }}
                  >
                    {label}
                    {count ? <span className="tab-count">{count}</span> : null}
                  </button>
                ))}
              </div>
              {tab === "bids" && (
                <span className="cell-sub">
                  {tr("text040")}</span>
              )}
            </div>
          )}
          {list.data && (rows.length ? (
            <>
              <table className="data uploads-table">
                <thead>
                  <tr>
                    <th>{tr("text028")}</th>
                    <th>Carrier / RFx</th>
                    <th>{tr("text041")}</th>
                    <th>{tr("text042")}</th>
                    <th>{tr("text021")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((u) => {
                    const status = STATUS[String(u.status || "").toLowerCase()] ?? { tone: "", label: String(u.status || "—").replace(/_/g, " ") };
                    const warnings = Array.isArray(u.audit_warnings) ? u.audit_warnings.length : 0;
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="cell-title">{u.original_filename || u.filename || "—"}</div>
                          <div className="cell-sub">{TYPE_LABEL[String(u.document_type)] ?? String(u.document_type ?? "").replace(/_/g, " ")}</div>
                        </td>
                        <td>
                          {u.vendors?.vendor_name || u.vendor_hint || "—"}
                          {(u.rfx_number || u.rfx_hint) && <div className="cell-sub">{u.rfx_number || u.rfx_hint}</div>}
                        </td>
                        <td className="mono">{dateShort(u.created_at)}</td>
                        <td>
                          <Pill tone={status.tone}>{status.label}</Pill>
                          {u.error_message && <div className="cell-sub">{u.error_message}</div>}
                          {!u.error_message && warnings > 0 && <div className="cell-sub">{warnings}{tr("text043")}</div>}
                        </td>
                        <td className="mono">
                          {u.interpreted_rate_rows ?? 0}
                          {u.expected_rate_rows && u.expected_rate_rows > (u.interpreted_rate_rows ?? 0) ? (
                            <div className="cell-sub">{tr("text044")}{u.expected_rate_rows}{tr("text045")}</div>
                          ) : null}
                        </td>
                        <td>
                          <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                            <button onClick={() => open(u)}>{tr("text046")}</button>
                            {tab === "team" && (
                              <details className="qd-more">
                                <summary className="btn">{tr("text059")} ▾</summary>
                                <div
                                  className="qd-more-menu"
                                  onClick={(e) => ((e.currentTarget.parentElement as HTMLDetailsElement).open = false)}
                                >
                                  <button disabled={!canWork || !!busy} title={lockedTitle} onClick={() => read(u)}>
                                    {busy === u.id ? tr("text047") : u.interpreted_at || u.interpreted_rate_rows ? tr("text048") : tr("text049")}
                                  </button>
                                  <button disabled={!canWork || !!busy} title={lockedTitle} onClick={() => archive(u)}>
                                    {tr("text050")}</button>
                                  <button
                                    disabled={!canWork || !!busy}
                                    title={canAdmin ? undefined : tr("text051")}
                                    onClick={() => remove(u)}
                                  >
                                    {tr("text052")}</button>
                                </div>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > visible.length && (
                <div className="row">
                  <span className="cell-sub">
                    {visible.length}{tr("text053")}{rows.length}
                  </span>
                  <div className="spacer" />
                  <button onClick={() => setShowAll(true)}>{tr("text054")}{rows.length})</button>
                </div>
              )}
            </>
          ) : (
            <Empty
              title={tab === "team" ? tr("text055") : tr("text056")}
              hint={tab === "team" ? tr("text057") : undefined}
            />
          ))}
        </div>
      </main>
    </>
  );
}
