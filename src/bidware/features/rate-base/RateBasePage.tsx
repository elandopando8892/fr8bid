import { words, tr } from "@/i18n/rate-base";
import { useLang, locale } from "@/i18n/language";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync, promptAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { NEED_REASON } from "@/lib/roles";
import { Dialog, Empty, ErrorBanner, InfoBanner, Kpis, Spinner, TopBar, dateShort } from "@/components/ui";
import { buildCatalogIndex, valueLabel, type CatalogIndex } from "@/features/rfx-admin/laneImport";
import { loadCatalogRows } from "@/features/rfx-admin/laneSources";
import { RateEditDialog } from "@/features/rate-review/RateEditDialog";
import { rateNumber, type StagedRate } from "@/features/rate-review/readiness";
import {
  collectForExport,
  download,
  listApprovedRates,
  PAGE_SIZE,
  rateHistory,
  returnToReview,
  toCsv,
  updateApprovedRate,
  type RateBaseFilters,
} from "./rateBase.service";

/** Past this many rows the CSV is cut; narrow the search to get the rest. */
const EXPORT_MAX = 10000;

const HISTORY_LABEL: Record<string, string> = {
  get "rateware.approve"() { return tr("text001"); },
  get "rateware.update"() { return tr("text002"); },
  get "rateware.return_to_staging"() { return tr("text003"); },
  get "staging.archive"() { return tr("text004"); },
  get "staging.remove"() { return tr("text005"); },
  get "rateware.bulk_match_vendors"() { return tr("text006"); },
  get "rateware.bulk_renormalize"() { return tr("text007"); },
  get "staging.bulk_update_filtered"() { return tr("text008"); },
  get "staging.bulk_remove_filtered"() { return tr("text009"); },
  get "staging.status_update"() { return tr("text010"); },
  get "upload.bulk_template_import"() { return tr("text011"); },
};

/** Team members show by email; the workspace key and old login ids read as the team. */
const actorLabel = (actor?: string | null) => (actor && actor.includes("@") ? actor : tr("text012"));

function amount(r: StagedRate) {
  const n = rateNumber(r.all_in_rate);
  if (n == null) return r.all_in_rate ? String(r.all_in_rate) : "—";
  return `${n.toLocaleString(locale(), { maximumFractionDigits: 2 })} ${r.currency ?? ""}`.trim();
}

/**
 * The rate base: search, correct and export the approved rates. Corrections
 * that touch the lane or its places go back to the review queue, which is
 * where places are mapped.
 */
export function RateBasePage() {
  useLang();
  const { can } = useAuth();
  const canWork = can("operate");
  const canAdmin = can("admin");
  const [filters, setFilters] = useState<RateBaseFilters>({ search: "", operation: "", service: "" });
  const [searchText, setSearchText] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<StagedRate | null>(null);
  const [history, setHistory] = useState<StagedRate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const page = useAsync(() => listApprovedRates(filters, offset), [filters, offset]);
  const catalog = useAsync(loadCatalogRows, []);
  const index: CatalogIndex | null = useMemo(() => (catalog.data ? buildCatalogIndex(catalog.data) : null), [catalog.data]);
  const rows = page.data?.rows ?? [];
  const total = page.data?.total ?? 0;

  function filter(change: Partial<RateBaseFilters>) {
    setFilters((prev) => ({ ...prev, ...change }));
    setOffset(0);
    setNotice(null);
  }

  async function exportCsv() {
    const ok =
      total <= EXPORT_MAX ||
      (await confirmAsync(
        tr("text013", total.toLocaleString("es-MX")) +
          tr("text014", EXPORT_MAX.toLocaleString("es-MX")),
      ));
    if (!ok) return;
    setBusy("export");
    setNotice(tr("text015"));
    try {
      const all = await collectForExport(filters, EXPORT_MAX, (loaded, of) =>
        setNotice(tr("text016", loaded.toLocaleString("es-MX"), Math.min(of, EXPORT_MAX).toLocaleString("es-MX"))),
      );
      download(`tarifario-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(all));
      setNotice(tr("text017", all.length.toLocaleString("es-MX")));
    } catch (e) {
      setNotice(tr("text018", (e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function sendBack(rate: StagedRate) {
    const reason = await promptAsync(
      tr("text019", rate.normalized_origin || rate.origin || "—", rate.normalized_destination || rate.destination || "—") +
        tr("text020") +
        tr("text021"),
    );
    if (reason == null) return;
    if (!reason.trim()) {
      setNotice(tr("text022"));
      return;
    }
    setBusy(rate.id);
    setNotice(null);
    try {
      await returnToReview([rate.id], reason.trim());
      setNotice(tr("text023"));
      page.reload();
    } catch (e) {
      setNotice(tr("text018", (e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  const operations = index?.options.operation ?? [];
  const services = index?.options.service ?? [];

  return (
    <>
      <TopBar
        crumb={tr("text024")}
        title={tr("text025")}
        sub={tr("text026")}
        actions={
          <>
            <Link to="/tarifas" className="btn">
              {tr("text027")}</Link>
            <button onClick={page.reload}>{tr("text028")}</button>
            <button className="primary" disabled={!!busy || !total} onClick={exportCsv}>
              {busy === "export" ? tr("text029") : tr("text030")}
            </button>
          </>
        }
      />
      {editing && (
        <RateEditDialog
          row={editing}
          index={index}
          title={tr("text031")}
          save={updateApprovedRate}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setNotice(tr("text032"));
            page.reload();
          }}
        />
      )}
      {history && <HistoryDialog rate={history} onClose={() => setHistory(null)} />}
      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          {notice && <InfoBanner>{notice}</InfoBanner>}

          <div className="row" style={{ flexWrap: "wrap" }}>
            <input
              placeholder={tr("text033")}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && filter({ search: searchText.trim() })}
              style={{ minWidth: 280 }}
            />
            <button onClick={() => filter({ search: searchText.trim() })}>{tr("text034")}</button>
            {filters.search && (
              <button
                onClick={() => {
                  setSearchText("");
                  filter({ search: "" });
                }}
              >
                {tr("text035")}</button>
            )}
            <div className="spacer" />
            {(["operation", "service"] as const).map((field) => (
              <select
                key={field}
                aria-label={field === "operation" ? tr("text036") : tr("text037")}
                value={filters[field]}
                onChange={(e) => filter({ [field]: e.target.value })}
              >
                <option value="">{field === "operation" ? tr("text038") : tr("text039")}</option>
                {(field === "operation" ? operations : services).map((value) => (
                  <option key={value} value={value}>
                    {index ? valueLabel(index, field, value) : value}
                  </option>
                ))}
              </select>
            ))}
          </div>

          <Kpis items={[{ label: tr("text040"), value: page.loading ? "…" : total.toLocaleString(locale()), accent: true }]} />

          {page.loading && (
            <Spinner
              label={
                filters.search || filters.operation || filters.service
                  ? tr("text041")
                  : tr("text042")
              }
            />
          )}
          {page.error && <ErrorBanner message={page.error} />}
          {!page.loading && !page.error && (rows.length ? (
            <>
              <table className="data">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>{tr("text012")}</th>
                    <th>{tr("text043")}</th>
                    <th>All-in</th>
                    <th>{tr("text044")}</th>
                    <th>{tr("text045")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="cell-title">
                          {String(r.normalized_origin || r.origin || "—")} → {String(r.normalized_destination || r.destination || "—")}
                        </div>
                        <div className="cell-sub">
                          {r.vendors?.vendor_name || r.vendor_domain || words("word0")}
                          {r.rfx_id ? ` · ${r.rfx_id}` : ""}
                        </div>
                      </td>
                      <td>
                        {[r.equipment, r.trailer, r.config].filter(Boolean).join(" · ") || "—"}
                        {(r.mx_border_crossing_point || r.us_border_crossing_point) && (
                          <div className="cell-sub">
                            {tr("text046")}{[r.mx_border_crossing_point, r.us_border_crossing_point].filter(Boolean).join(" / ")}
                          </div>
                        )}
                      </td>
                      <td>
                        {index && r.operation ? valueLabel(index, "operation", String(r.operation)) : r.operation || "—"}
                        <div className="cell-sub">
                          {index && r.service ? valueLabel(index, "service", String(r.service)) : r.service || ""}
                        </div>
                      </td>
                      <td className="mono">{amount(r)}</td>
                      <td className="mono">{r.weekly_capacity || "—"}</td>
                      <td className="mono">{dateShort(r.quote_date)}</td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <button disabled={!canWork || !!busy} title={canWork ? undefined : NEED_REASON.operate} onClick={() => setEditing(r)}>
                            {tr("text047")}</button>
                          <button onClick={() => setHistory(r)}>{tr("text048")}</button>
                          <button
                            disabled={!canAdmin || !!busy}
                            title={canAdmin ? tr("text049") : NEED_REASON.admin}
                            onClick={() => sendBack(r)}
                          >
                            {busy === r.id ? tr("text050") : tr("text051")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row">
                <span className="cell-sub">
                  {(offset + 1).toLocaleString(locale())}–{(offset + rows.length).toLocaleString(locale())}{tr("text052")}{total.toLocaleString(locale())}
                </span>
                <div className="spacer" />
                <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  {tr("text053")}</button>
                <button disabled={!page.data?.has_more} onClick={() => setOffset(offset + PAGE_SIZE)}>
                  {tr("text054")}</button>
              </div>
            </>
          ) : (
            <Empty title={tr("text055")} hint={tr("text056")} />
          ))}
        </div>
      </main>
    </>
  );
}

/** Approval, edits and returns of one rate, newest first. */
function HistoryDialog({ rate, onClose }: { rate: StagedRate; onClose: () => void }) {
  useLang();
  const { data, loading, error } = useAsync(() => rateHistory(rate.id), [rate.id]);
  return (
    <Dialog title={tr("text057")} onClose={onClose}>
      <div className="cell-sub" style={{ marginBottom: 10 }}>
        {String(rate.normalized_origin || rate.origin || "—")} → {String(rate.normalized_destination || rate.destination || "—")}
      </div>
      {loading && <Spinner label={tr("text058")} />}
      {error && <ErrorBanner message={error} />}
      {!loading && !error && (data?.length ? (
        <table className="data">
          <tbody>
            {data.map((h) => (
              <tr key={h.id}>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>{dateShort(h.created_at)}</td>
                <td>
                  <div className="cell-title">{HISTORY_LABEL[String(h.action)] || h.action || "—"}</div>
                  {h.summary && <div className="cell-sub">{h.summary}</div>}
                </td>
                <td className="cell-sub">{actorLabel(h.actor_email)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty title={tr("text059")} hint={tr("text060")} />
      ))}
    </Dialog>
  );
}
