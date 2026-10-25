import { tr } from "@/i18n/public-board";
import { useLang } from "@/i18n/language";
import { useState } from "react";
import { Pill, dateShort, money } from "@/components/ui";
import {
  competition,
  equipmentOf,
  laneEnds,
  loads,
  weeklyLoads,
  type BoardEvent,
  type BoardRow,
  type BoardStatus,
  type Competition,
} from "./publicBoard.service";

type Tone = "" | "green" | "amber" | "blue" | "orange";

export const STATUS: Record<BoardStatus, { label: string; tone: Tone; column: string }> = {
  live: { get label() { return tr("text140"); }, tone: "green", get column() { return tr("text058"); } },
  closing: { get label() { return tr("text059"); }, tone: "amber", get column() { return tr("text060"); } },
  awarded: { get label() { return tr("text061"); }, tone: "blue", get column() { return tr("text062"); } },
  expired: { get label() { return tr("text063"); }, tone: "", get column() { return tr("text064"); } },
};

/** The bid deadline is the due date at 23:59:59 Mexico City, as the server enforces it. */
export function msLeft(due: string | null | undefined, now: number): number | null {
  if (!due) return null;
  const at = new Date(`${String(due).slice(0, 10)}T23:59:59-06:00`).getTime();
  return Number.isNaN(at) ? null : at - now;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The countdown, ticking to the second in the last week: "2 d 04:12:38",
 * "04:12:38"; further out just "cierra en 11 d". `urgency` colours it.
 */
export function clock(status: BoardStatus, due: string | null | undefined, now: number) {
  if (status === "awarded") return { text: tr("text065"), urgency: "done" as const };
  if (status === "expired") return { text: tr("text066"), urgency: "done" as const };
  const ms = msLeft(due, now);
  if (ms === null) return { text: tr("text067"), urgency: "calm" as const };
  if (ms <= 0) return { text: tr("text066"), urgency: "done" as const };
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hms = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  const urgency = ms < 86400000 ? ("hot" as const) : ms < 3 * 86400000 ? ("warm" as const) : ("calm" as const);
  if (d >= 7) return { text: tr("text068", d), urgency };
  return { text: d > 0 ? `${d} d ${hms}` : hms, urgency };
}

export const ago = (iso?: string | null) => {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return tr("text069", Math.max(1, min));
  if (min < 1440) return tr("text070", Math.round(min / 60));
  return tr("text071", Math.round(min / 1440));
};

/** A small truck for the route line. */
function Truck() {
  useLang();
  return (
    <svg width="18" height="11" viewBox="0 0 18 11" aria-hidden="true">
      <path d="M0 1.5h10.5v6.5H0zM11 3.5h3.8L18 6.4V8h-7z" fill="currentColor" />
      <circle cx="3.5" cy="9" r="1.7" fill="currentColor" />
      <circle cx="14" cy="9" r="1.7" fill="currentColor" />
    </svg>
  );
}

/** Origin ●┄┄🚚┄┄● destination, and how many more routes the event has. */
export function RouteLine({ lanes }: { lanes: BoardRow[] }) {
  useLang();
  const { from, to } = laneEnds(lanes[0]);
  const more = new Set(lanes.map((l) => `${laneEnds(l).from}>${laneEnds(l).to}`)).size - 1;
  return (
    <div className="pb-routeline" title={lanes.map((l) => `${l.lane?.origin} → ${l.lane?.destination}`).join("\n")}>
      <span className="pb-end">{from}</span>
      <span className="pb-track">
        <i />
        <Truck />
        <i />
      </span>
      <span className="pb-end">{to}</span>
      {more > 0 && <span className="pb-more-routes">+{more}{tr("text072")}{more === 1 ? "" : "s"}</span>}
    </div>
  );
}

/** Five bars: how many offers the lanes already have. Few offers is the opportunity. */
export function Meter({ value, compact = false }: { value: Competition | null; compact?: boolean }) {
  useLang();
  if (!value) return <span className="pb-note">{tr("text073")}</span>;
  return (
    <span className={`pb-meter ${value.tone}`} title={value.label}>
      <span className="pb-bars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i <= value.level ? "on" : undefined} />
        ))}
      </span>
      {!compact && <span>{value.label}</span>}
    </span>
  );
}

export interface Actions {
  /** Events and lanes the viewer's email is invited to (after "Buscar mis invitaciones"). */
  invitedEvents: Set<string>;
  invitedLanes: Set<string>;
  watched: Set<string>;
  pulses: Record<string, number>;
  now: number;
  onRequest: (event: BoardEvent, laneId?: string) => void;
  onRecover: () => void;
  onWatch: (eventId: string) => void;
}

/** What a live event offers this viewer; closed ones just say why not. */
function EventAction({ event, actions }: { event: BoardEvent; actions: Actions }) {
  useLang();
  if (event.status === "closing") return <span className="pb-note">{tr("text074")}</span>;
  if (event.status === "expired") return <span className="pb-note">{tr("text075")}</span>;
  if (event.status === "awarded") return <span className="pb-note">{tr("text065")}</span>;
  if (actions.invitedEvents.has(event.id)) {
    return (
      <button type="button" className="pb-cta invited" onClick={actions.onRecover}>
        {tr("text076")}</button>
    );
  }
  return (
    <button type="button" className="pb-cta" onClick={() => actions.onRequest(event)}>
      {tr("text077")}</button>
  );
}

function WatchButton({ id, actions }: { id: string; actions: Actions }) {
  useLang();
  const on = actions.watched.has(id);
  return (
    <button
      type="button"
      className={`pb-watch${on ? " on" : ""}`}
      aria-pressed={on}
      title={on ? tr("text078") : tr("text079")}
      onClick={() => actions.onWatch(id)}
    >
      {on ? tr("text080") : tr("text081")}
    </button>
  );
}

/** Cards (wireframe 10, with more life): one card per event. */
export function EventCards({ events, actions }: { events: BoardEvent[]; actions: Actions }) {
  useLang();
  const [open, setOpen] = useState<Set<string>>(new Set());
  return (
    <div className="pb-cards">
      {events.map((event) => {
        const status = STATUS[event.status];
        const time = clock(event.status, event.due_date, actions.now);
        const pulse = actions.pulses[event.id];
        const fresh = pulse && actions.now - pulse < 60000;
        const expanded = open.has(event.id);
        const weekly = weeklyLoads(event.lanes);
        return (
          <article key={event.id} className={`pb-card ${event.status}${actions.watched.has(event.id) ? " watched" : ""}`}>
            {pulse && <span key={pulse} className="pb-flash" aria-hidden="true" />}
            <header>
              <Pill tone={status.tone}>{status.label}</Pill>
              {fresh && <span className="pb-new">{tr("text082")}</span>}
              <div className="spacer" />
              <WatchButton id={event.id} actions={actions} />
            </header>
            <h3 title={event.name}>{event.name}</h3>
            <div className={`pb-clock ${time.urgency}`}>
              <span>{event.status === "live" || event.status === "closing" ? tr("text083") : tr("text084")}</span>
              <b>{time.text}</b>
            </div>
            <RouteLine lanes={event.lanes} />
            <dl className="pb-stats">
              <div>
                <dt>{tr("text139")}</dt>
                <dd>{event.lanes.length}</dd>
              </div>
              <div>
                <dt>{tr("text085")}</dt>
                <dd>{weekly ? loads(weekly) : "—"}</dd>
              </div>
              <div>
                <dt>{tr("text086")}</dt>
                <dd>{event.quotes ?? "—"}</dd>
              </div>
              <div className="wide">
                <dt>{tr("text087")}</dt>
                <dd title={event.equipment.join(", ")}>
                  {[...new Set(event.lanes.map(equipmentOf).filter(Boolean))].join(" · ") || "—"}
                </dd>
              </div>
            </dl>
            <div className="pb-activity">
              <Meter value={competition(event.lanes)} />
              <span className="pb-note">{tr("text088")}{ago(event.last_quote_at)}</span>
            </div>
            <footer>
              <EventAction event={event} actions={actions} />
              <div className="spacer" />
              <button
                type="button"
                className="link pb-more"
                aria-expanded={expanded}
                onClick={() =>
                  setOpen((s) => {
                    const next = new Set(s);
                    if (next.has(event.id)) next.delete(event.id);
                    else next.add(event.id);
                    return next;
                  })
                }
              >
                {expanded ? tr("text089") : tr("text090", event.lanes.length, event.lanes.length === 1 ? "" : "s")}
              </button>
            </footer>
            {expanded && (
              <ul className="pb-lanes-list">
                {event.lanes.map((lane) => (
                  <li key={lane.id}>
                    <span className="grow" title={`${lane.lane?.origin} → ${lane.lane?.destination}`}>
                      {/* Short lane numbers help; long catalog codes are noise. */}
                      {lane.lane?.lane_number != null && Number(lane.lane.lane_number) < 1000 && (
                        <span className="pb-num">{lane.lane.lane_number}</span>
                      )}
                      {laneEnds(lane).from} → {laneEnds(lane).to}
                    </span>
                    <span className="mono pb-note">{lane.lane?.weekly_volume ? tr("text091", loads(Number(lane.lane.weekly_volume))) : ""}</span>
                    <Meter value={competition([lane])} compact />
                    <span className="mono">{lane.quote_count ?? "—"}</span>
                    {actions.invitedLanes.has(lane.id) && <Pill tone="green">{tr("text092")}</Pill>}
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </div>
  );
}

/** Pipeline: the same events in one column per stage. */
export function Pipeline({ events, actions }: { events: BoardEvent[]; actions: Actions }) {
  useLang();
  const columns: BoardStatus[] = ["live", "closing", "awarded", "expired"];
  return (
    <div className="pb-pipeline">
      {columns.map((key) => {
        const list = events.filter((e) => e.status === key);
        return (
          <section key={key} className={key}>
            <header>
              <b>{STATUS[key].column}</b>
              <span className="mono">{list.length}</span>
            </header>
            {list.length ? (
              list.map((event) => {
                const time = clock(event.status, event.due_date, actions.now);
                return (
                  <article key={event.id} className={`pb-mini${actions.watched.has(event.id) ? " watched" : ""}`}>
                    <b title={event.name}>{event.name}</b>
                    <RouteLine lanes={event.lanes} />
                    <div className="pb-mini-foot">
                      <span className={`pb-clock-mini ${time.urgency}`}>{time.text}</span>
                      <div className="spacer" />
                      <Meter value={competition(event.lanes)} compact />
                      <span className="mono">{event.quotes ?? "—"}</span>
                    </div>
                    {event.status === "live" && (
                      <div className="pb-mini-foot">
                        {actions.invitedEvents.has(event.id) ? (
                          <Pill tone="green">{tr("text092")}</Pill>
                        ) : (
                          <button type="button" className="link" onClick={() => actions.onRequest(event)}>
                            {tr("text077")}</button>
                        )}
                        <div className="spacer" />
                        <WatchButton id={event.id} actions={actions} />
                      </div>
                    )}
                  </article>
                );
              })
            ) : (
              <p className="pb-empty">{tr("text093")}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Spreadsheet: one row per lane, as rateware's board. Rates only on an open leaderboard. */
export function Sheet({ rows, events, actions }: { rows: BoardRow[]; events: BoardEvent[]; actions: Actions }) {
  useLang();
  const byId = new Map(events.map((e) => [e.id, e]));
  return (
    <div className="pb-sheet">
      <table className="data fixed">
        <colgroup>
          <col style={{ width: 104 }} />
          <col style={{ width: 116 }} />
          <col />
          <col />
          <col style={{ width: 130 }} />
          <col style={{ width: 76 }} />
          <col style={{ width: 92 }} />
          <col style={{ width: 64 }} />
          <col style={{ width: 92 }} />
          <col style={{ width: 118 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 92 }} />
        </colgroup>
        <thead>
          <tr>
            <th>{tr("text084")}</th>
            <th>{tr("text094")}</th>
            <th>{tr("text095")}</th>
            <th>{tr("text096")}</th>
            <th>{tr("text087")}</th>
            <th>{tr("text085")}</th>
            <th>{tr("text097")}</th>
            <th>{tr("text086")}</th>
            <th>{tr("text098")}</th>
            <th>{tr("text083")}</th>
            <th>{tr("text099")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = STATUS[row.board_status];
            const event = byId.get(row.event_id);
            const time = clock(row.board_status, row.event?.due_date, actions.now);
            return (
              <tr key={row.id} className={actions.watched.has(row.event_id) ? "watched" : undefined}>
                <td>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </td>
                <td className="mono ellipsis" title={row.event?.name}>
                  {row.event?.rfx_id ?? "—"}
                </td>
                <td className="ellipsis" title={row.lane?.origin}>
                  {row.lane?.origin ?? "—"}
                </td>
                <td className="ellipsis" title={row.lane?.destination}>
                  {row.lane?.destination ?? "—"}
                </td>
                <td className="ellipsis">{equipmentOf(row) || "—"}</td>
                <td className="mono">{row.lane?.weekly_volume ? loads(Number(row.lane.weekly_volume)) : "—"}</td>
                <td>
                  <Meter value={competition([row])} compact />
                </td>
                <td className="mono">{row.quote_count ?? "—"}</td>
                <td className="mono">
                  {row.quote_visibility === "open" && row.best_rate != null ? money(row.best_rate, row.currency || "USD") : "—"}
                </td>
                <td className={`mono pb-clock-mini ${time.urgency}`} title={row.event?.due_date ? dateShort(row.event.due_date) : undefined}>
                  {time.text}
                </td>
                <td className="mono">{ago(row.last_quote_at)}</td>
                <td style={{ textAlign: "right" }}>
                  {row.is_bid_available && event ? (
                    actions.invitedLanes.has(row.id) ? (
                      <Pill tone="green">{tr("text092")}</Pill>
                    ) : (
                      <button type="button" className="link" onClick={() => actions.onRequest(event, row.id)}>
                        {tr("text100")}</button>
                    )
                  ) : (
                    <span className="pb-note">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
