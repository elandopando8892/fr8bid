import { words, tr } from "@/i18n/rate-review";
import { useLang, getLang } from "@/i18n/language";
import { useEffect, useMemo, useState } from "react";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, InfoBanner, Pill, Spinner, TopBar, money } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { listRfxEvents } from "@/features/rfx-admin/rfx.service";
import { buildCatalogIndex, choiceKey, valueLabel, CATALOG_FIELDS, type CatalogIndex, type Choice, type Choices } from "@/features/rfx-admin/laneImport";
import { loadCatalogRows, saveCatalogAlias } from "@/features/rfx-admin/laneSources";
import { CatalogValueRow } from "@/features/rfx-admin/CatalogValueRow";
import type { RfxEvent } from "@/types/domain";
import { blockersOf, isBlocking, ISSUE_LABEL, looksLikeTest, rateOf, reviewIssues, rfxBidOutcome, rfxOutcomeLabel, type StagedRate } from "./readiness";
import { normalizationPatch, rateValues, unknownValues, valuesSettled } from "./normalize";
import { archiveRates, listPendingRates, updateRate, updateRates } from "./rateReview.service";
import { RateEditDialog } from "./RateEditDialog";

interface Group {
  key: string;
  title: string;
  sub: string;
  test: boolean;
  rows: StagedRate[];
}

/** Rates of one source together: a Bid Room event, or an upload without one. */
function groupRows(rows: StagedRate[], events: Map<string, RfxEvent>): Group[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const rfxId = String(row.rfx_id ?? "").trim();
    const key = rfxId || `upload:${row.raw_upload_id ?? "none"}`;
    let group = groups.get(key);
    if (!group) {
      const event = rfxId ? events.get(rfxId.toLowerCase()) : undefined;
      group = {
        key,
        title: rfxId || tr("text022"),
        sub: event ? [event.name, event.customer].filter(Boolean).join(" · ") : rfxId ? tr("text023") : tr("text024"),
        test: looksLikeTest(row),
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  // Real sources first, then the biggest.
  return [...groups.values()].sort((a, b) => Number(a.test) - Number(b.test) || b.rows.length - a.rows.length);
}

/** Runs `task` over `items`, `size` at a time, reporting progress. */
async function inBatches<T>(items: T[], size: number, task: (item: T) => Promise<void>, progress: (done: number) => void) {
  let done = 0;
  const queue = [...items];
  const worker = async () => {
    while (queue.length) {
      await task(queue.shift()!);
      progress((done += 1));
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

/**
 * Rates waiting to enter the rate base: Bid Room bids and uploaded rate
 * sheets. Approving one puts it in the catalog's words (as the rest of the
 * rate base) and makes it official, which is an Administrador's decision;
 * correcting, rejecting and archiving (tests, duplicates) is anyone's work.
 */
export function RateReviewPage() {
  const { user, role } = useAuth();
  // A new identity or permission must not inherit reads, selections or an open edit.
  return <RateReviewContent key={`${user?.id ?? "anonymous"}:${role}`} />;
}

function RateReviewContent() {
  const lang = useLang();
  const { can } = useAuth();
  const pending = useAsync(listPendingRates, []);
  const catalog = useAsync(loadCatalogRows, []);
  const events = useAsync(() => listRfxEvents().catch(() => [] as RfxEvent[]), []);
  const [choices, setChoices] = useState<Choices>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<StagedRate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const index: CatalogIndex | null = useMemo(() => (catalog.data ? buildCatalogIndex(catalog.data) : null), [catalog.data]);
  const rows = useMemo(() => pending.data?.rows ?? [], [pending.data]);
  const eventsByRfx = useMemo(
    () => new Map((events.data ?? []).filter((e) => e.rfx_id).map((e) => [String(e.rfx_id).toLowerCase(), e])),
    [events.data],
  );
  const groups = useMemo(() => groupRows(rows, eventsByRfx), [getLang(), rows, eventsByRfx]);
  const unknown = useMemo(() => (index ? unknownValues(rows, index, choices) : []), [rows, index, choices]);

  // Selection only holds rows still in the queue.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => rows.some((row) => row.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const approvable = (row: StagedRate) => Boolean(index) && !blockersOf(row).length && valuesSettled(rateValues(row, index!, choices));
  const counts = {
    total: rows.length,
    approvable: rows.filter(approvable).length,
    tests: rows.filter(looksLikeTest).length,
  };
  const chosen = rows.filter((row) => selected.has(row.id));
  const canWork = can("operate");
  const canApprove = can("admin");

  const decide = (field: string, text: string, choice: Choice | null) =>
    setChoices((prev) => {
      const next = { ...prev };
      if (choice) next[choiceKey(field, text)] = choice;
      else delete next[choiceKey(field, text)];
      return next;
    });
  const useAllSuggestions = () =>
    setChoices((prev) => {
      const next = { ...prev };
      for (const item of unknown) {
        if (!item.choice && item.suggestion) next[choiceKey(item.field, item.text)] = { kind: "map", value: item.suggestion, saveAlias: false };
      }
      return next;
    });

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  async function approve() {
    if (!index || !canApprove) return;
    const ready = chosen.filter(approvable);
    const held = chosen.length - ready.length;
    if (!ready.length) {
      setError(tr("text025"));
      return;
    }
    const aliases = can("admin")
      ? unknown.filter((item) => item.choice?.kind === "map" && item.choice.saveAlias)
      : [];
    const ok = await confirmAsync(
      tr("text026", ready.length) +
        (held ? tr("text027", held) : "") +
        (aliases.length ? tr("text028", aliases.length) : "") +
        tr("text029"),
    );
    if (!ok) return;
    setBusy("approve");
    setError(null);
    setNotice(null);
    const failed: string[] = [];
    try {
      for (const item of aliases) {
        if (item.choice?.kind !== "map") continue;
        await saveCatalogAlias(item.field, item.text, item.choice.value).catch(() => failed.push(`sinónimo «${item.text}»`));
      }
      // One update per rate: each keeps its own original words and leaves its own approval in the audit log.
      await inBatches(
        ready,
        4,
        async (row) => {
          const patch = { ...normalizationPatch(row, rateValues(row, index, choices)), status: "approved" };
          await updateRate(row.id, patch).catch(() => failed.push(`${row.origin ?? "?"} → ${row.destination ?? "?"}`));
        },
        (done) => setBusy(`approve:${done}/${ready.length}`),
      );
      const approved = ready.length - failed.filter((f) => !f.startsWith("sinónimo")).length;
      setNotice(
        tr("text031", approved) + (failed.length ? tr("text032", failed.map((f) => f.startsWith("sinónimo «") ? tr("text030", f.slice(10, -1)) : f).join(", ")) : ""),
      );
      setSelected(new Set());
      pending.reload();
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(kind: "reject" | "archive") {
    if (!chosen.length) return;
    const ok = await confirmAsync(
      kind === "archive"
        ? tr("text033", chosen.length)
        : tr("text034", chosen.length),
    );
    if (!ok) return;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const ids = chosen.map((row) => row.id);
      const res = kind === "archive" ? await archiveRates(ids) : await updateRates(ids, { status: "rejected" });
      setNotice(tr("text035", res.updated ?? ids.length, kind === "archive" ? words("word3") : words("word4")));
      setSelected(new Set());
      pending.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const cellValue = (row: StagedRate, field: (typeof CATALOG_FIELDS)[number]["key"]) => {
    if (!index) return String(row[field] ?? "—");
    const value = rateValues(row, index, choices)[field];
    if (!value.text) return <span className="cell-sub">—</span>;
    if (!value.value) return <span className="ne-pending">{value.text}</span>;
    return valueLabel(index, field, value.value, lang);
  };

  if (pending.loading && !pending.data) return <Spinner label={tr("text036")} />;

  return (
    <div className="rr-page">
      <TopBar
        crumb={tr("text037")}
        title={tr("text038")}
        sub={tr("text039")}
        actions={<button onClick={pending.reload}>{tr("text040")}</button>}
      />
      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          {pending.error && <ErrorBanner message={pending.error} />}
          {catalog.error && <ErrorBanner message={tr("text041", catalog.error)} />}
          {notice && <InfoBanner>{notice}</InfoBanner>}
          {error && <ErrorBanner message={error} />}

          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <Pill>{counts.total}{tr("text042")}</Pill>
            <Pill tone="green">{counts.approvable}{tr("text043")}</Pill>
            {counts.total - counts.approvable > 0 && <Pill tone="amber">{counts.total - counts.approvable}{tr("text044")}</Pill>}
            {counts.tests > 0 && <Pill>{counts.tests}{tr("text045")}</Pill>}
            <span className="spacer" />
            <button disabled={!rows.length} onClick={() => toggle(rows.filter(approvable).map((row) => row.id), true)}>
              {tr("text046")}</button>
          </div>

          {!rows.length && !pending.loading && <Empty title={tr("text047")} hint={tr("text048")} />}

          {unknown.length > 0 && index && (
            <div className="card rr-catalog">
              <h2>
                {tr("text049")}{" "}
                {unknown.some((item) => !item.choice) && <Pill tone="amber">{unknown.filter((item) => !item.choice).length}{tr("text050")}</Pill>}
              </h2>
              <p className="cell-sub" style={{ margin: "2px 0 8px" }}>
                {tr("text051")}</p>
              <div className="row" style={{ marginBottom: 8 }}>
                <span className="spacer" />
                {unknown.some((item) => !item.choice && item.suggestion) && (
                  <button onClick={useAllSuggestions}>{tr("text052")}</button>
                )}
              </div>
              <div className="rr-table-wrap">
              <table className="data">
                <tbody>
                  {unknown.map((item) => (
                    <CatalogValueRow
                      key={choiceKey(item.field, item.text)}
                      item={item}
                      index={index}
                      unit={words("word5")}
                      allowKeep={false}
                      onDecide={(choice) => decide(item.field, item.text, choice)}
                    />
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {groups.map((group) => {
            const ids = group.rows.map((row) => row.id);
            const allChosen = ids.every((id) => selected.has(id));
            return (
              <div key={group.key} className="card rr-group" style={{ padding: 0 }}>
                <div className="row rr-group-heading" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", gap: 8 }}>
                  <input
                    type="checkbox"
                    style={{ width: 15 }}
                    aria-label={tr("text053", group.title)}
                    checked={allChosen}
                    onChange={(e) => toggle(ids, e.target.checked)}
                  />
                  <div>
                    <div className="cell-title">
                      {group.title} {group.test && <Pill tone="amber">{tr("text054")}</Pill>}
                    </div>
                    <div className="cell-sub">
                      {group.sub} · {group.rows.length}{tr("text055")}{group.rows.filter(approvable).length}{tr("text043")}</div>
                  </div>
                </div>
                <div className="rr-table-wrap">
                <table className="data rr-rates" role="table" aria-label={group.title} style={{ border: "none" }}>
                  <thead>
                    <tr>
                      <th />
                      <th>Carrier</th>
                      <th>{tr("text056")}</th>
                      <th>{tr("text057")}</th>
                      <th>{tr("text058")}</th>
                      <th>{tr("text059")}</th>
                      <th>{tr("text060")}</th>
                      <th>{tr("text061")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const issues = reviewIssues(row);
                      const outcome = rfxBidOutcome(row);
                      const outcomeLabel = rfxOutcomeLabel(row);
                      const settled = index ? valuesSettled(rateValues(row, index, choices)) : false;
                      const rate = rateOf(row);
                      const currency = String(row.currency ?? "");
                      return (
                        <tr key={row.id} role="row">
                          <td className="rr-check" role="cell">
                            <input
                              type="checkbox"
                              style={{ width: 15 }}
                              aria-label={tr("text062", row.origin || "—", row.destination || "—")}
                              checked={selected.has(row.id)}
                              onChange={(e) => toggle([row.id], e.target.checked)}
                            />
                          </td>
                          <td className="rr-carrier" role="cell">
                            <div className="cell-title">{row.vendors?.vendor_name || row.vendor_reference || row.vendor_domain || "—"}</div>
                            <div className="cell-sub">{row.vendor_domain || ""}</div>
                          </td>
                          <td className="rr-route" role="cell">
                            <div>
                              {row.origin || "—"} → {row.destination || "—"}
                            </div>
                            <div className="cell-sub">{[row.origin_market, row.destination_market].filter(Boolean).join(" → ")}</div>
                          </td>
                          <td className="rr-equipment" role="cell" data-label={tr("text057")}>
                            {cellValue(row, "equipment")}
                            <div className="cell-sub">
                              {cellValue(row, "trailer")} · {cellValue(row, "config")}
                            </div>
                          </td>
                          <td className="rr-operation" role="cell" data-label={tr("text058")}>
                            {cellValue(row, "operation")}
                            <div className="cell-sub">{cellValue(row, "service")}</div>
                          </td>
                          <td className="mono rr-price" role="cell" data-label={tr("text059")}>
                            {rate !== null ? money(rate, currency || "USD") : "—"}
                            {!currency && rate !== null && <span className="cell-sub">{tr("text063")}</span>}
                            {row.carrier_cost_rate != null && row.customer_board_rate != null && (
                              <div className="cell-sub">
                                {tr("text064")}{money(row.carrier_cost_rate, currency || "USD")}{tr("text065")}{money(row.customer_board_rate, currency || "USD")}
                              </div>
                            )}
                          </td>
                          <td className="rr-validity" role="cell" data-label={tr("text060")}>
                            <div>{row.valid_through ? String(row.valid_through).slice(0, 10) : "—"}</div>
                            <div className="cell-sub">
                              {row.quote_date ? tr("text066", String(row.quote_date).slice(0, 10)) : ""}
                              {row.weekly_capacity ? tr("text067", row.weekly_capacity) : ""}
                            </div>
                          </td>
                          <td className="rr-state" role="cell" style={{ maxWidth: 220 }}>
                            {outcomeLabel && <div style={{ marginBottom: 4 }}><Pill tone={outcome === "awarded" ? "green" : "amber"}>{outcomeLabel}</Pill></div>}
                            {!issues.length && settled ? (
                              <Pill tone="green">{tr("text068")}</Pill>
                            ) : (
                              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                                {!settled && <Pill tone="amber">{tr("text069")}</Pill>}
                                {issues.map((issue) => (
                                  <Pill key={issue} tone={isBlocking(issue) ? "red" : ""}>
                                    {ISSUE_LABEL[issue]}
                                  </Pill>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="rr-action" role="cell">
                            <button
                              className="ne-link"
                              disabled={!canWork}
                              title={canWork ? undefined : NEED_REASON.operate}
                              onClick={() => setEditing(row)}
                            >
                              {tr("text070")}</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {chosen.length > 0 && (
        <div className="rr-bar">
          <span>
            {chosen.length}{tr("text071")}{chosen.filter(approvable).length}{tr("text043")}{!canApprove && <span className="cell-sub">{tr("text072")}</span>}
          </span>
          <span className="spacer" />
          <button onClick={() => setSelected(new Set())} disabled={Boolean(busy)}>
            {tr("text073")}</button>
          <button onClick={() => setStatus("archive")} disabled={Boolean(busy) || !canWork} title={canWork ? undefined : NEED_REASON.operate}>
            {busy === "archive" ? tr("text074") : tr("text075")}
          </button>
          <button onClick={() => setStatus("reject")} disabled={Boolean(busy) || !canWork} title={canWork ? undefined : NEED_REASON.operate}>
            {busy === "reject" ? tr("text076") : tr("text077")}
          </button>
          <button
            className="primary"
            onClick={approve}
            disabled={Boolean(busy) || !canApprove || !chosen.some(approvable)}
            title={canApprove ? undefined : NEED_REASON.admin}
          >
            {busy?.startsWith("approve") ? tr("text078", busy.split(":")[1] ?? "") : tr("text079", chosen.filter(approvable).length)}
          </button>
        </div>
      )}

      {editing && (
        <RateEditDialog
          row={editing}
          index={index}
          onClose={() => setEditing(null)}
          onSaved={() => pending.reload()}
        />
      )}
    </div>
  );
}
