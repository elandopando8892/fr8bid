import { tr } from "@/i18n/quotedesk";
import { useLang, getLang } from "@/i18n/language";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, Pill, Spinner, TopBar, dateShort, money } from "@/components/ui";
import { pct } from "./calc";
import { NewQuoteDialog } from "./NewQuoteDialog";
import { QuotePanel } from "./QuotePanel";
import {
  STATUS_LABEL,
  STATUS_TONE,
  getQuoteContext,
  getStagingOptions,
  listQuotes,
  type QuoteStatus,
} from "./quotedesk.service";

const FILTERS: { key: string; label: string }[] = [
  { key: "active", get label() { return tr("text182"); } },
  { key: "new", get label() { return tr("text183"); } },
  { key: "estimating", get label() { return tr("text152"); } },
  { key: "quoted", get label() { return tr("text184"); } },
  { key: "bid_room", get label() { return tr("text154"); } },
  { key: "won", get label() { return tr("text185"); } },
  { key: "lost", get label() { return tr("text186"); } },
  { key: "archived", get label() { return tr("text187"); } },
];

/**
 * QuoteDesk (wireframe 07): the tracker on the left, the chosen quote on the
 * right with its FCM drivers and cost components editable in place. Double
 * click (or "Abrir") goes to the full page of the quote.
 */
export function QuoteDeskPage() {
  useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  // ?new=1 opens the new-quote dialog (the Dashboard's search links here).
  const [creating, setCreating] = useState(() => params.get("new") === "1");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelDirty, setPanelDirty] = useState(false);
  const { data, loading, error, reload } = useAsync(
    () => listQuotes({ status: filter === "active" ? undefined : filter }),
    [filter],
  );
  // The panel's editor needs rateware's catalogs; load them once for every quote.
  const context = useAsync(getQuoteContext, []);
  const options = useAsync(getStagingOptions, []);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = data?.rows ?? [];
    if (!term) return all;
    return all.filter((q) =>
      [q.folio, q.title, q.shipper_name, q.first_lane?.origin, q.first_lane?.destination]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [getLang(), data, search]);

  useEffect(() => {
    // The first row opens by itself, as in the wireframe; a quote that left the
    // list (filter or search) gives way to the first one, unless mid-edit.
    // While the list reloads, `rows` is still the old one: a quote just
    // created is not in it yet, so wait for the fresh list before judging.
    if (!data || loading || panelDirty) return;
    if (!selectedId || !rows.some((q) => q.id === selectedId)) setSelectedId(rows[0]?.id ?? null);
  }, [data, loading, rows, selectedId, panelDirty]);

  async function pick(id: string) {
    // A phone has no room for the side editor: the tap opens the full quote instead.
    if (window.matchMedia("(max-width: 720px)").matches) return navigate(`/quotedesk/${id}`);
    if (id === selectedId) return;
    if (panelDirty && !(await confirmAsync(tr("text188")))) return;
    setPanelDirty(false);
    setSelectedId(id);
  }

  // The open stages carry their count on the tab itself, instead of a separate KPI band.
  const counts: Record<string, number | undefined> = data?.kpis.counts ?? {};

  return (
    <>
      <TopBar
        title="QuoteDesk"
        sub={tr("text191")}
        actions={
          <button className="primary" onClick={() => setCreating(true)}>
            {tr("text138")}</button>
        }
      />
      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          <div className="row qd-filters">
            <div className="tabs">
              {FILTERS.map((f) => (
                <button key={f.key} className={filter === f.key ? "active" : undefined} onClick={() => setFilter(f.key)}>
                  {f.label}
                  {counts[f.key] ? <span className="qd-tab-count">{counts[f.key]}</span> : null}
                </button>
              ))}
            </div>
            <div className="spacer" />
            <input
              style={{ width: 260 }}
              value={search}
              placeholder={tr("text193")}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading && !data && <Spinner label={tr("text194")} />}
          {error && <ErrorBanner message={error} />}

          {data && (
            <div className="qd-desk">
              {rows.length ? (
                <table className="data qd-table">
                  <thead>
                    <tr>
                      <th>{tr("text322")}</th>
                      <th>{tr("text195")}</th>
                      <th>{tr("text323")}</th>
                      <th className="num">{tr("text196")}</th>
                      <th className="num">All-in</th>
                      <th className="num">{tr("text015")}</th>
                      <th>{tr("text197")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((q) => {
                      const lane = q.first_lane;
                      const extra = q.summary.lane_count > 1 ? ` (+${q.summary.lane_count - 1})` : "";
                      const priced = q.summary.priced_lane_count > 0;
                      return (
                        <tr
                          key={q.id}
                          className={`clickable${q.id === selectedId ? " selected" : ""}`}
                          onClick={() => pick(q.id)}
                          // The two clicks already asked about unsaved edits (pick); leaving would skip the answer.
                          onDoubleClick={() => !panelDirty && navigate(`/quotedesk/${q.id}`)}
                          title={tr("text198")}
                        >
                          <td>
                            <span className="qd-folio">{q.folio}</span>
                            <div className="cell-sub">{dateShort(q.created_at)}</div>
                          </td>
                          <td>
                            <div className="cell-title">{q.shipper_name || "—"}</div>
                            <div className="cell-sub">{q.title || (q.quote_type === "spot" ? "Spot" : tr("text145"))}</div>
                          </td>
                          <td>
                            {lane ? (
                              <>
                                <div className="cell-title">
                                  {lane.origin || tr("text199")} → {lane.destination || tr("text200")}
                                  {extra}
                                </div>
                                <div className="cell-sub">{lane.equipment || "—"}</div>
                              </>
                            ) : (
                              <span className="qd-muted">{tr("text201")}</span>
                            )}
                          </td>
                          <td className="num mono">{priced ? money(q.summary.base_cost_total, q.currency) : "—"}</td>
                          <td className="num mono">
                            {q.status === "bid_room" && !priced
                              ? tr("text324")
                              : priced
                                ? money(q.summary.all_in_total, q.currency)
                                : "—"}
                          </td>
                          <td className="num mono qd-good">{priced ? pct(q.summary.margin_pct) : "—"}</td>
                          <td>
                            <Pill tone={STATUS_TONE[q.status as QuoteStatus]}>
                              {STATUS_LABEL[q.status as QuoteStatus].toUpperCase()}
                            </Pill>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <Empty
                  title={data.rows.length ? tr("text202") : tr("text203")}
                  hint={
                    data.rows.length
                      ? tr("text204")
                      : tr("text205")
                  }
                />
              )}

              <aside className="qd-side">
                {selectedId ? (
                  <QuotePanel
                    key={selectedId}
                    quoteId={selectedId}
                    context={context.data}
                    options={options.data}
                    onChanged={reload}
                    onDirtyChange={setPanelDirty}
                  />
                ) : (
                  <Empty title={tr("text206")} hint={tr("text207")} />
                )}
                {context.error && <ErrorBanner message={tr("text208", context.error)} />}
              </aside>
            </div>
          )}
        </div>
      </main>
      {creating && (
        <NewQuoteDialog
          onClose={() => setCreating(false)}
          onCreated={(quote) => {
            // The new quote opens on the right, where its first route is captured.
            setCreating(false);
            setPanelDirty(false);
            setFilter("active");
            setSearch("");
            setSelectedId(quote.id);
            reload();
          }}
        />
      )}
    </>
  );
}
