import { tr } from "@/i18n/rfx-admin";
import { useLang, locale, getLang } from "@/i18n/language";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listRfxEvents } from "./rfx.service";
import { eventOrigins } from "@/features/quotedesk/quotedesk.service";
import { useAsync } from "@/components/useAsync";
import { TopBar, Spinner, ErrorBanner, Empty, OriginPill, Kpis, Pill } from "@/components/ui";
import type { RfxEvent } from "@/types/domain";
import { NewEventDialog } from "./NewEventDialog";

type OriginKey = "all" | "magic" | "quotedesk" | "manual";
type Stage = "draft" | "launch" | "operate" | "closed" | "awarded" | "archived";

const STAGE: Record<Stage, { label: string; tone: "amber" | "blue" | "green" | "" | "indigo" }> = {
  draft: { get label() { return tr("text548"); }, tone: "amber" },
  launch: { label: "LAUNCH", tone: "blue" },
  operate: { label: "OPERATE", tone: "green" },
  closed: { get label() { return tr("text649"); }, tone: "" },
  awarded: { get label() { return tr("text614"); }, tone: "indigo" },
  archived: { get label() { return tr("text650"); }, tone: "" },
};

const ORIGINS: { key: Exclude<OriginKey, "all">; tag: JSX.Element; title: string; text: string }[] = [
  {
    key: "magic",
    tag: <Pill tone="blue">MAGIC LINK</Pill>,
    get title() { return tr("text651"); },
    get text() { return tr("text652"); },
  },
  {
    key: "quotedesk",
    tag: <Pill tone="orange">QUOTEDESK</Pill>,
    get title() { return tr("text653"); },
    get text() { return tr("text654"); },
  },
  {
    key: "manual",
    tag: <Pill tone="violet">MANUAL</Pill>,
    get title() { return tr("text655"); },
    get text() { return tr("text656"); },
  },
];

const TYPE_LABEL: Record<string, string> = { spot: "Spot", bid: "Mini-bid", mini_bid: "Mini-bid", minibid: "Mini-bid", rfx: "RFx" };

const count = (value: unknown) => Number(value ?? 0) || 0;

/**
 * Where an event stands. The workbench decides it from each invitation; the
 * list carries only the counts, which stand in for it: offers mean Operate,
 * invitations mean Launch.
 */
function stageOf(e: RfxEvent): Stage {
  const status = String(e.status ?? "").toLowerCase();
  if (status === "archived") return "archived";
  if (status === "awarded") return "awarded";
  if (status === "closed") return "closed";
  if (count(e.bid_count) > 0) return "operate";
  if (count(e.invitation_count) > 0) return "launch";
  return "draft";
}

/** "11 d", "2 h", "vencido", "cerrado", "adjud." — the due date runs to the end of its day. */
function closes(e: RfxEvent, stage: Stage): string {
  if (stage === "closed") return tr("text657");
  if (stage === "awarded") return tr("text658");
  if (stage === "archived" || !e.due_date) return "—";
  const due = new Date(`${String(e.due_date).slice(0, 10)}T23:59:59`);
  if (Number.isNaN(due.getTime())) return "—";
  const hours = (due.getTime() - Date.now()) / 3_600_000;
  if (hours <= 0) return tr("text659");
  return hours < 48 ? `${Math.ceil(hours)} h` : `${Math.floor(hours / 24)} d`;
}

const typeOf = (e: RfxEvent) => {
  const type = String(e.event_type ?? "").toLowerCase();
  return TYPE_LABEL[type] ?? (type ? type[0].toUpperCase() + type.slice(1) : "—");
};

/** Wireframe 12 · RFx / Bid Room — Lista. */
export function RfxAdminPage() {
  useLang();
  const navigate = useNavigate();
  const { data, loading, error } = useAsync(listRfxEvents, []);
  const [origin, setOrigin] = useState<OriginKey>("all");
  const [stage, setStage] = useState<Stage | "all">("all");
  const [shipper, setShipper] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  // Wireframe 13: the new event opens as a dialog over the list.
  const [creating, setCreating] = useState(false);

  const events = data ?? [];
  // Origins come from QuoteDesk links and shipper-intake traces, not from the
  // event's source_* columns (rateware stamps those on every event).
  const ids = useMemo(() => events.map((e) => String(e.id)), [getLang(), events]);
  const origins = useAsync(() => eventOrigins(ids), [ids.join(",")]);
  const originOf = (ev: RfxEvent) => origins.data?.origins[String(ev.id)] ?? null;

  const shippers = useMemo(
    () => [...new Set(events.map((e) => String(e.customer ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [getLang(), events],
  );
  const types = useMemo(() => [...new Set(events.map(typeOf))].filter((t) => t !== "—").sort(), [getLang(), events]);

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return events.filter(
      (e) =>
        (origin === "all" || originOf(e) === origin) &&
        (stage === "all" || stageOf(e) === stage) &&
        (shipper === "all" || String(e.customer ?? "").trim() === shipper) &&
        (type === "all" || typeOf(e) === type) &&
        (!text || [e.name, e.customer, e.rfx_id].some((v) => String(v ?? "").toLowerCase().includes(text))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getLang(), events, origin, stage, shipper, type, search, origins.data]);

  const kpis = useMemo(() => {
    const by = (s: Stage) => events.filter((e) => stageOf(e) === s).length;
    return [
      { label: tr("text660"), value: by("draft") },
      { label: tr("text661"), value: by("launch") },
      { label: "Operate (live)", value: by("operate"), accent: true },
      { label: tr("text662"), value: by("closed") + by("awarded") },
      { label: tr("text663"), value: events.reduce((sum, e) => sum + count(e.bid_count), 0).toLocaleString(locale()) },
    ];
  }, [getLang(), events]);

  return (
    <>
      <TopBar
        title="RFx / Bid Room"
        sub={tr("text664")}
        actions={
          <button className="primary" onClick={() => setCreating(true)}>
            {tr("text665")}</button>
        }
      />
      <main className="main">
        <div style={{ display: "grid", gap: 16 }}>
          <section className="card origins">
            <header>{tr("text666")}</header>
            <div className="tiles">
              {ORIGINS.map((o) => (
                <div key={o.key} className="tile">
                  <div>{o.tag}</div>
                  <strong>{o.title}</strong>
                  <p>{o.text}</p>
                </div>
              ))}
            </div>
          </section>

          <Kpis items={kpis} />

          <div className="row" style={{ gap: 8 }}>
            <select className="filter" aria-label={tr("text282")} value={stage} onChange={(e) => setStage(e.target.value as Stage | "all")}>
              <option value="all">{tr("text667")}</option>
              {(Object.keys(STAGE) as Stage[]).map((s) => (
                <option key={s} value={s}>
                  {STAGE[s].label[0] + STAGE[s].label.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <select className="filter" aria-label={tr("text077")} value={origin} onChange={(e) => setOrigin(e.target.value as OriginKey)}>
              <option value="all">{tr("text668")}</option>
              <option value="magic">Magic link</option>
              <option value="quotedesk">QuoteDesk</option>
              <option value="manual">{tr("text669")}</option>
            </select>
            <select className="filter" aria-label="Shipper" value={shipper} onChange={(e) => setShipper(e.target.value)}>
              <option value="all">{tr("text670")}</option>
              {shippers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select className="filter" aria-label={tr("text447")} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">{tr("text671")}</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="spacer" />
            <input
              className="filter-search"
              placeholder={tr("text672")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading && <Spinner label={tr("text673")} />}
          {error && <ErrorBanner message={error} />}

          {!loading && !error && (rows.length ? (
            <table className="data fixed">
              <colgroup>
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 56 }} />
                <col style={{ width: 56 }} />
                <col style={{ width: 54 }} />
                <col style={{ width: 86 }} />
                <col style={{ width: 104 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{tr("text225")}</th>
                  <th>{tr("text674")}</th>
                  <th>{tr("text447")}</th>
                  <th>{tr("text077")}</th>
                  <th>Lanes</th>
                  <th>{tr("text675")}</th>
                  <th>Bids</th>
                  <th>{tr("text448")}</th>
                  <th>{tr("text282")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ev) => {
                  const s = stageOf(ev);
                  const name = (ev.name as string) || tr("text676");
                  const invitations = count(ev.invitation_count);
                  const bids = count(ev.bid_count);
                  // A draft with no lanes yet goes on where it was left: loading its cédula and lanes.
                  const to = s === "draft" && !count(ev.lane_count) ? `/rfx/new/${ev.id}` : `/rfx/${ev.id}`;
                  return (
                    <tr key={ev.id} className="clickable" onClick={() => navigate(to)}>
                      <td>
                        <div className="cell-title ellipsis" title={name}>
                          {name}
                        </div>
                        <div className="cell-sub ellipsis">{(ev.rfx_id as string) || ev.id}</div>
                      </td>
                      <td className="ellipsis" title={(ev.customer as string) || undefined}>
                        {(ev.customer as string) || "—"}
                      </td>
                      <td>{typeOf(ev)}</td>
                      <td className="ellipsis">
                        <OriginPill origin={originOf(ev)} folio={origins.data?.folios[String(ev.id)]} />
                      </td>
                      <td className="mono">{count(ev.lane_count) || "—"}</td>
                      <td className="mono">{invitations || "—"}</td>
                      <td className="mono">{bids || "—"}</td>
                      <td className="mono">{closes(ev, s)}</td>
                      <td>
                        <Pill tone={STAGE[s].tone}>{STAGE[s].label}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty
              title={events.length ? tr("text677") : tr("text678")}
              hint={
                events.length
                  ? tr("text679")
                  : tr("text680")
              }
            />
          ))}
        </div>
      </main>
      {creating && <NewEventDialog onClose={() => setCreating(false)} />}
    </>
  );
}
